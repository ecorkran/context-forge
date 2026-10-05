import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Command } from 'commander';
import {
  registerSetupIdeCommand,
  setupIdeAction,
  isManagedInstall,
  TARGETS,
  normalizeTarget,
  invalidTargetMessage,
} from '../../src/commands/setup-ide.js';

const mockGetAll = vi.fn();
const mockGetById = vi.fn();
const mockDetect = vi.fn();
const mockExistsSync = vi.fn();
const mockCopyFileSync = vi.fn();
const mockCpSync = vi.fn();
const mockReadFileSync = vi.fn();
const mockExecFileSync = vi.fn();
const mockMkdirSync = vi.fn();
const mockReaddirSync = vi.fn();

// The install manifest is read through this mocked fs. Report it missing (the
// pre-manifest guide path, D4), which is the copy-only behavior these tests pin.
function readFileSyncOrMissingManifest(...args: unknown[]): unknown {
  if (String(args[0]).endsWith('.manifest')) {
    throw Object.assign(new Error(`ENOENT: ${String(args[0])}`), { code: 'ENOENT' });
  }
  return mockReadFileSync(...args);
}

// readline mock — controls user input simulation
const mockQuestion = vi.fn();
const mockRlClose = vi.fn();

vi.mock('@context-forge/core/node', () => ({
  FileProjectStore: vi.fn().mockImplementation(() => ({
    getAll: mockGetAll,
    getById: mockGetById,
  })),
  GuideDetector: vi.fn().mockImplementation(() => ({
    detect: mockDetect,
  })),
  // setup-ide calls ensureGuideReady() before detecting, so the helper's
  // GuideManager must exist on the mock. Default: nothing to do.
  GuideManager: vi.fn().mockImplementation(() => ({
    ensureCheckout: vi.fn().mockResolvedValue({ action: 'none' }),
  })),
  ConfigManager: vi.fn().mockImplementation(() => ({
    get: vi.fn().mockResolvedValue({ value: '' }),
  })),
  GUIDE_RELATIVE_PATH: 'project-documents/ai-project-guide',
  // Mirrors the real constant in core/guides/gitExec.ts (#78).
  GUIDE_OFFLINE_REMEDIATION:
    'Check your VPN/proxy connection, or install offline by pointing guide.source ' +
    'at a local path or mirror (cf config set guide.source <path>).',
}));

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    default: {
      ...actual,
      existsSync: (...args: unknown[]) => mockExistsSync(...args),
      copyFileSync: (...args: unknown[]) => mockCopyFileSync(...args),
      cpSync: (...args: unknown[]) => mockCpSync(...args),
      readFileSync: (...args: unknown[]) => readFileSyncOrMissingManifest(...args),
      mkdirSync: (...args: unknown[]) => mockMkdirSync(...args),
      readdirSync: (...args: unknown[]) => mockReaddirSync(...args),
    },
    existsSync: (...args: unknown[]) => mockExistsSync(...args),
    copyFileSync: (...args: unknown[]) => mockCopyFileSync(...args),
    cpSync: (...args: unknown[]) => mockCpSync(...args),
    readFileSync: (...args: unknown[]) => readFileSyncOrMissingManifest(...args),
    mkdirSync: (...args: unknown[]) => mockMkdirSync(...args),
    readdirSync: (...args: unknown[]) => mockReaddirSync(...args),
  };
});

vi.mock('node:child_process', () => ({
  execFileSync: (...args: unknown[]) => mockExecFileSync(...args),
}));

// Command/skill delivery is exercised in commandInstaller.test.ts; here it must
// be mocked or the setup-ide action tests would write to the real home directory.
const mockInstallCommandsForTarget = vi.fn();

vi.mock('../../src/commands/commandInstaller.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/commands/commandInstaller.js')>();
  return {
    ...actual,
    installCommandsForTarget: (...args: unknown[]) => mockInstallCommandsForTarget(...args),
  };
});

vi.mock('node:readline', () => ({
  createInterface: vi.fn().mockImplementation(() => ({
    question: mockQuestion,
    close: mockRlClose,
    on: vi.fn(),
  })),
}));

// ─── Test fixtures ────────────────────────────────────────────────────────────

const sampleProject = {
  id: 'proj_001',
  name: 'test-project',
  projectPath: '/tmp/test',
};

const sampleProjectWithWorktrees = {
  ...sampleProject,
  worktrees: [{ id: 'wt_001', name: 'feature', worktreePath: '/tmp/wt1' }],
};

const guidePath = '/tmp/test/project-documents/ai-project-guide';
const scriptPath = `${guidePath}/scripts/setup-ide`;
const claudeMdPath = '/tmp/test/CLAUDE.md';
const claudeMdBakPath = '/tmp/test/CLAUDE.md.bak';
const copilotInstructionsPath = '/tmp/test/.github/copilot-instructions.md';
const copilotInstructionsBakPath = '/tmp/test/.github/copilot-instructions.md.bak';
const agentsMdPath = '/tmp/test/AGENTS.md';
const agentsMdBakPath = '/tmp/test/AGENTS.md.bak';

const MANAGED_CONTENT = '[//]: # (context-forge:managed)\n\n# Content';
const UNMANAGED_CONTENT = '# My custom instructions\n\nSome content here.';

function createProgram(): Command {
  const program = new Command();
  program.exitOverride();
  registerSetupIdeCommand(program);
  return program;
}

// ─── target model and normalization ──────────────────────────────────────────

describe('normalizeTarget', () => {
  it('returns the canonical value for each canonical target', () => {
    expect(normalizeTarget('claude')).toBe('claude');
    expect(normalizeTarget('copilot')).toBe('copilot');
    expect(normalizeTarget('cursor')).toBe('cursor');
    expect(normalizeTarget('agents')).toBe('agents');
  });

  it('maps codex and openai aliases to agents', () => {
    expect(normalizeTarget('codex')).toBe('agents');
    expect(normalizeTarget('openai')).toBe('agents');
  });

  it('is case-insensitive and trims whitespace', () => {
    expect(normalizeTarget('CODEX')).toBe('agents');
    expect(normalizeTarget('  claude  ')).toBe('claude');
  });

  it('returns null for unknown input', () => {
    expect(normalizeTarget('notarealtarget')).toBeNull();
  });
});

describe('TARGETS table', () => {
  it('has exactly four entries', () => {
    expect(Object.keys(TARGETS)).toHaveLength(4);
  });

  it('every entry has a non-empty markerFiles array', () => {
    for (const descriptor of Object.values(TARGETS)) {
      expect(descriptor.markerFiles.length).toBeGreaterThan(0);
    }
  });
});

describe('invalidTargetMessage', () => {
  it('lists all four canonical targets and both aliases', () => {
    const message = invalidTargetMessage('notarealtarget');
    expect(message).toContain("Invalid target 'notarealtarget'");
    expect(message).toContain('claude');
    expect(message).toContain('copilot');
    expect(message).toContain('cursor');
    expect(message).toContain('agents');
    expect(message).toContain('openai');
    expect(message).toContain('codex');
  });
});

// ─── cf setup-ide command ────────────────────────────────────────────────────

describe('cf setup-ide', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAll.mockResolvedValue([sampleProject]);
    mockGetById.mockResolvedValue(sampleProject);
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
  });

  it('rejects invalid target and lists valid targets', async () => {
    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'setup-ide', 'vim']);

    const output = vi.mocked(console.error).mock.calls.map((c) => c[0]).join('\n');
    expect(output).toContain("Invalid target 'vim'");
    expect(output).toContain('claude');
  });

  it('rejects an unsupported target and lists all four canonical targets', async () => {
    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'setup-ide', 'notarealtarget']);

    const output = vi.mocked(console.error).mock.calls.map((c) => c[0]).join('\n');
    expect(output).toContain("Invalid target 'notarealtarget'");
    expect(output).toContain('claude');
    expect(output).toContain('copilot');
    expect(output).toContain('cursor');
    expect(output).toContain('agents');
  });

  it('errors when guides not installed', async () => {
    mockDetect.mockResolvedValue({ installed: false });

    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'setup-ide', 'claude', '--project', 'proj_001']);

    const output = vi.mocked(console.error).mock.calls.map((c) => c[0]).join('\n');
    expect(output).toContain('Guides are not installed');
    expect(output).toContain('cf guides install');
    // #78: the offline/network fallback guidance must be surfaced here too, not
    // only by `cf guides install` itself.
    expect(output).toContain('cf config set guide.source');
    expect(output).toContain('VPN/proxy');
  });

  it('errors when setup-ide script not found', async () => {
    mockDetect.mockResolvedValue({ installed: true });
    mockExistsSync.mockReturnValue(false);

    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'setup-ide', 'claude', '--project', 'proj_001']);

    const output = vi.mocked(console.error).mock.calls.map((c) => c[0]).join('\n');
    expect(output).toContain('setup-ide script not found');
    expect(output).toContain(scriptPath);
  });

  it('proceeds without prompt when no CLAUDE.md', async () => {
    mockDetect.mockResolvedValue({ installed: true });
    mockExistsSync.mockImplementation((p: string) => {
      if (p === scriptPath) return true;
      if (p === claudeMdPath) return false;
      return false;
    });

    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'setup-ide', 'claude', '--project', 'proj_001']);

    expect(mockCopyFileSync).not.toHaveBeenCalled();
    expect(mockExecFileSync).toHaveBeenCalledWith(
      'bash',
      [scriptPath, 'claude'],
      expect.objectContaining({ cwd: '/tmp/test', stdio: 'inherit' }),
    );
  });

  it('installs commands globally after claude setup', async () => {
    mockDetect.mockResolvedValue({ installed: true });
    mockExistsSync.mockImplementation((p: string) => p === scriptPath);

    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'setup-ide', 'claude', '--project', 'proj_001']);

    expect(mockInstallCommandsForTarget).toHaveBeenCalledWith('claude');
  });

  it('installs skills globally after codex setup (alias resolves to agents)', async () => {
    mockDetect.mockResolvedValue({ installed: true });
    mockExistsSync.mockImplementation((p: string) => p === scriptPath);

    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'setup-ide', 'codex', '--project', 'proj_001']);

    expect(mockInstallCommandsForTarget).toHaveBeenCalledWith('agents');
  });

  it('skips command delivery for targets without it (cursor)', async () => {
    mockDetect.mockResolvedValue({ installed: true });
    mockExistsSync.mockImplementation((p: string) => p === scriptPath);

    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'setup-ide', 'cursor', '--project', 'proj_001']);

    expect(mockExecFileSync).toHaveBeenCalled();
    expect(mockInstallCommandsForTarget).not.toHaveBeenCalled();
  });

  it('creates .bak and invokes script with --yes when CLAUDE.md exists (no managed marker, no .bak)', async () => {
    mockDetect.mockResolvedValue({ installed: true });
    mockExistsSync.mockImplementation((p: string) => {
      if (p === scriptPath) return true;
      if (p === claudeMdPath) return true;
      if (p === claudeMdBakPath) return false;
      return false;
    });
    mockReadFileSync.mockReturnValue(UNMANAGED_CONTENT);

    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'setup-ide', 'claude', '--yes', '--project', 'proj_001']);

    expect(mockCopyFileSync).toHaveBeenCalledWith(claudeMdPath, claudeMdBakPath);
    expect(mockExecFileSync).toHaveBeenCalledWith(
      'bash',
      [scriptPath, 'claude'],
      expect.objectContaining({ cwd: '/tmp/test', stdio: 'inherit' }),
    );

    const logOutput = vi.mocked(console.log).mock.calls.map((c) => c[0]).join('\n');
    expect(logOutput).toContain('Backed up CLAUDE.md');
  });

  it('--dry-run passes the flag through and writes nothing: no prompt, backup, propagation, or command install', async () => {
    mockGetById.mockResolvedValue(sampleProjectWithWorktrees);
    mockDetect.mockResolvedValue({ installed: true });
    mockExistsSync.mockImplementation((p: string) => p === scriptPath || p === claudeMdPath || p === '/tmp/wt1');
    mockReadFileSync.mockImplementation((p: string) =>
      p === scriptPath ? 'case "$arg" in --dry-run) DRY_RUN=1 ;; esac' : UNMANAGED_CONTENT,
    );

    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'setup-ide', '--dry-run', 'claude', '--project', 'proj_001']);

    expect(mockQuestion).not.toHaveBeenCalled();
    expect(mockCopyFileSync).not.toHaveBeenCalled();
    expect(mockCpSync).not.toHaveBeenCalled();
    expect(mockInstallCommandsForTarget).not.toHaveBeenCalled();
    expect(mockExecFileSync).toHaveBeenCalledTimes(1);
    expect(mockExecFileSync).toHaveBeenCalledWith(
      'bash',
      [scriptPath, 'claude', '--dry-run'],
      expect.objectContaining({ cwd: '/tmp/test', stdio: 'inherit' }),
    );
    const errOutput = vi.mocked(console.error).mock.calls.map((c) => c[0]).join('\n');
    expect(errOutput).toContain('Dry run complete for claude');
  });

  it('--dry-run refuses an older guide whose script ignores the flag, and runs nothing', async () => {
    mockDetect.mockResolvedValue({ installed: true });
    mockExistsSync.mockImplementation((p: string) => p === scriptPath || p === claudeMdPath);
    mockReadFileSync.mockImplementation((p: string) => (p === scriptPath ? 'TARGET="$1"' : UNMANAGED_CONTENT));

    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'setup-ide', 'claude', '--dry-run', '--project', 'proj_001']);

    expect(mockExecFileSync).not.toHaveBeenCalled();
    expect(mockCopyFileSync).not.toHaveBeenCalled();
    const errOutput = vi.mocked(console.error).mock.calls.map((c) => c[0]).join('\n');
    expect(errOutput).toContain('does not support --dry-run');
    expect(errOutput).toContain('cf guides update');
  });

  it('--write-lint passes through; combined with --dry-run both flags reach the script', async () => {
    mockDetect.mockResolvedValue({ installed: true });
    mockExistsSync.mockImplementation((p: string) => p === scriptPath);
    mockReadFileSync.mockImplementation((p: string) =>
      p === scriptPath ? '--dry-run) DRY_RUN=1 ;; --write-lint) WRITE_LINT=1 ;;' : UNMANAGED_CONTENT,
    );

    await createProgram().parseAsync(['node', 'cf', 'setup-ide', 'claude', '--write-lint', '--project', 'proj_001']);
    expect(mockExecFileSync).toHaveBeenLastCalledWith('bash', [scriptPath, 'claude', '--write-lint'], expect.anything());
    expect(mockInstallCommandsForTarget).toHaveBeenCalledWith('claude');

    mockInstallCommandsForTarget.mockClear();
    await createProgram().parseAsync([
      'node', 'cf', 'setup-ide', '--write-lint', 'claude', '--dry-run', '--project', 'proj_001',
    ]);
    expect(mockExecFileSync).toHaveBeenLastCalledWith(
      'bash',
      [scriptPath, 'claude', '--dry-run', '--write-lint'],
      expect.anything(),
    );
    expect(mockInstallCommandsForTarget).not.toHaveBeenCalled();
  });

  it('--write-lint refuses a guide whose script supports --dry-run but not --write-lint', async () => {
    mockDetect.mockResolvedValue({ installed: true });
    mockExistsSync.mockImplementation((p: string) => p === scriptPath);
    mockReadFileSync.mockImplementation((p: string) => (p === scriptPath ? '--dry-run) DRY_RUN=1 ;;' : UNMANAGED_CONTENT));

    await createProgram().parseAsync([
      'node', 'cf', 'setup-ide', 'claude', '--dry-run', '--write-lint', '--project', 'proj_001',
    ]);

    expect(mockExecFileSync).not.toHaveBeenCalled();
    const errOutput = vi.mocked(console.error).mock.calls.map((c) => c[0]).join('\n');
    expect(errOutput).toContain('does not support --write-lint');
    expect(errOutput).not.toContain('--dry-run,');
  });

  it('handles non-zero script exit code', async () => {
    mockDetect.mockResolvedValue({ installed: true });
    mockExistsSync.mockImplementation((p: string) => {
      if (p === scriptPath) return true;
      if (p === claudeMdPath) return false;
      return false;
    });
    const execError = Object.assign(new Error('Command failed'), { status: 1 });
    mockExecFileSync.mockImplementation(() => { throw execError; });

    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'setup-ide', 'claude', '--project', 'proj_001']);

    const output = vi.mocked(console.error).mock.calls.map((c) => c[0]).join('\n');
    expect(output).toContain('setup-ide exited with code 1');
  });
});

// ─── isManagedInstall ────────────────────────────────────────────────────────

describe('isManagedInstall', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns true when the first listed file carries the marker', () => {
    mockExistsSync.mockImplementation((p: string) => p === copilotInstructionsPath);
    mockReadFileSync.mockReturnValue(MANAGED_CONTENT);

    expect(isManagedInstall('/tmp/test', TARGETS.copilot.markerFiles)).toBe(true);
  });

  it('returns true when only the second listed file exists and carries the marker', () => {
    mockExistsSync.mockImplementation((p: string) => p === agentsMdPath);
    mockReadFileSync.mockReturnValue(MANAGED_CONTENT);

    expect(isManagedInstall('/tmp/test', TARGETS.copilot.markerFiles)).toBe(true);
  });

  it('returns false when listed files exist but none carries the marker', () => {
    mockExistsSync.mockImplementation(
      (p: string) => p === copilotInstructionsPath || p === agentsMdPath,
    );
    mockReadFileSync.mockReturnValue(UNMANAGED_CONTENT);

    expect(isManagedInstall('/tmp/test', TARGETS.copilot.markerFiles)).toBe(false);
  });

  it('returns false when no listed file exists', () => {
    mockExistsSync.mockReturnValue(false);

    expect(isManagedInstall('/tmp/test', TARGETS.copilot.markerFiles)).toBe(false);
    expect(mockReadFileSync).not.toHaveBeenCalled();
  });

  it('recognizes a marker appearing after line 20', () => {
    // INVERTED for #98 (was: 'ignores a marker appearing after line 20',
    // expecting false). The 20-line cap was a deliberate behavior change, not
    // a test rewritten to go green: the guide now preserves pre-existing user
    // content and appends the managed block below it, so the marker's position
    // depends on how much the project wrote above it and is unbounded. A file
    // with a 60-line preamble puts it around line 64; a 500-line one puts it
    // at 500. There is no window that can be correct.
    const lines = Array.from({ length: 25 }, (_, i) =>
      i === 21 ? '[//]: # (context-forge:managed)' : `line ${i}`,
    );
    mockExistsSync.mockImplementation((p: string) => p === claudeMdPath);
    mockReadFileSync.mockReturnValue(lines.join('\n'));

    expect(isManagedInstall('/tmp/test', TARGETS.claude.markerFiles)).toBe(true);
  });

  it('recognizes the new BEGIN marker near the top', () => {
    mockExistsSync.mockImplementation((p: string) => p === claudeMdPath);
    mockReadFileSync.mockReturnValue('<!-- BEGIN:context-forge -->\n\n# Content');

    expect(isManagedInstall('/tmp/test', TARGETS.claude.markerFiles)).toBe(true);
  });

  it('recognizes the new BEGIN marker far below line 20 (#22 preserve-and-append)', () => {
    // The realistic first-adoption shape: a project with an existing CLAUDE.md
    // keeps its content and gets the managed block appended below.
    const preamble = Array.from({ length: 60 }, (_, i) => `existing line ${i}`);
    const content = [...preamble, '', '<!-- BEGIN:context-forge -->', 'managed', '<!-- END:context-forge -->'].join('\n');
    mockExistsSync.mockImplementation((p: string) => p === claudeMdPath);
    mockReadFileSync.mockReturnValue(content);

    expect(isManagedInstall('/tmp/test', TARGETS.claude.markerFiles)).toBe(true);
  });

  it('recognizes an indented BEGIN marker with trailing content', () => {
    // The new form matches as a substring, unlike the legacy exact-line form.
    mockExistsSync.mockImplementation((p: string) => p === claudeMdPath);
    mockReadFileSync.mockReturnValue('  <!-- BEGIN:context-forge --> v2\n# Content');

    expect(isManagedInstall('/tmp/test', TARGETS.claude.markerFiles)).toBe(true);
  });

  it('still recognizes the legacy marker', () => {
    mockExistsSync.mockImplementation((p: string) => p === claudeMdPath);
    mockReadFileSync.mockReturnValue(MANAGED_CONTENT);

    expect(isManagedInstall('/tmp/test', TARGETS.claude.markerFiles)).toBe(true);
  });

  it('recognizes a file carrying both marker forms', () => {
    mockExistsSync.mockImplementation((p: string) => p === claudeMdPath);
    mockReadFileSync.mockReturnValue(
      '[//]: # (context-forge:managed)\n\n<!-- BEGIN:context-forge -->\nmanaged\n<!-- END:context-forge -->',
    );

    expect(isManagedInstall('/tmp/test', TARGETS.claude.markerFiles)).toBe(true);
  });

  it('does not treat an END marker without a BEGIN as managed', () => {
    mockExistsSync.mockImplementation((p: string) => p === claudeMdPath);
    mockReadFileSync.mockReturnValue('# Content\n\n<!-- END:context-forge -->\n');

    expect(isManagedInstall('/tmp/test', TARGETS.claude.markerFiles)).toBe(false);
  });

  it('regression: agents target probes only AGENTS.md, unaffected by a managed copilot-instructions.md', () => {
    mockExistsSync.mockImplementation(
      (p: string) => p === agentsMdPath || p === copilotInstructionsPath,
    );
    mockReadFileSync.mockImplementation((p: string) =>
      p === copilotInstructionsPath ? MANAGED_CONTENT : UNMANAGED_CONTENT,
    );

    expect(isManagedInstall('/tmp/test', TARGETS.agents.markerFiles)).toBe(false);
  });

  it('single marker-file target: returns true when the sole file is managed (ports prior isManagedClaudeMd coverage)', () => {
    mockExistsSync.mockImplementation((p: string) => p === claudeMdPath);
    mockReadFileSync.mockReturnValue(MANAGED_CONTENT);

    expect(isManagedInstall('/tmp/test', TARGETS.claude.markerFiles)).toBe(true);
  });
});

// ─── setupIdeAction — copilot ────────────────────────────────────────────────

describe('setupIdeAction — copilot target', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDetect.mockResolvedValue({ installed: true });
    mockExistsSync.mockImplementation((p: string) => p === scriptPath);
    mockExecFileSync.mockReturnValue(undefined);
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('proceeds silently when managed marker present in copilot-instructions.md', async () => {
    mockExistsSync.mockImplementation(
      (p: string) => p === scriptPath || p === copilotInstructionsPath,
    );
    mockReadFileSync.mockReturnValue(MANAGED_CONTENT);

    await setupIdeAction('/tmp/test', 'copilot', { yes: true });

    expect(mockCopyFileSync).not.toHaveBeenCalled();
    expect(mockExecFileSync).toHaveBeenCalledWith(
      'bash',
      [scriptPath, 'copilot'],
      expect.objectContaining({ cwd: '/tmp/test' }),
    );
  });

  it('proceeds silently when no copilot files exist', async () => {
    mockExistsSync.mockImplementation((p: string) => p === scriptPath);

    await setupIdeAction('/tmp/test', 'copilot', { yes: true });

    expect(mockCopyFileSync).not.toHaveBeenCalled();
    expect(mockExecFileSync).toHaveBeenCalledWith(
      'bash',
      [scriptPath, 'copilot'],
      expect.objectContaining({ cwd: '/tmp/test' }),
    );
  });

  it('backs up unmanaged copilot-instructions.md with --yes', async () => {
    mockExistsSync.mockImplementation((p: string) => {
      if (p === scriptPath) return true;
      if (p === copilotInstructionsPath) return true;
      if (p === copilotInstructionsBakPath) return false;
      return false;
    });
    mockReadFileSync.mockReturnValue(UNMANAGED_CONTENT);

    await setupIdeAction('/tmp/test', 'copilot', { yes: true });

    expect(mockCopyFileSync).toHaveBeenCalledWith(copilotInstructionsPath, copilotInstructionsBakPath);
    expect(mockExecFileSync).toHaveBeenCalledWith(
      'bash',
      [scriptPath, 'copilot'],
      expect.objectContaining({ cwd: '/tmp/test' }),
    );
    const logOutput = vi.mocked(console.log).mock.calls.map((c) => c[0]).join('\n');
    expect(logOutput).toContain('Backed up');
  });

  it('prints Aborted and skips script when user denies prompt', async () => {
    mockExistsSync.mockImplementation(
      (p: string) => p === scriptPath || p === copilotInstructionsPath,
    );
    mockReadFileSync.mockReturnValue(UNMANAGED_CONTENT);
    // Simulate user typing 'n'
    mockQuestion.mockImplementation((_prompt: string, cb: (answer: string) => void) => cb('n'));

    await setupIdeAction('/tmp/test', 'copilot');

    const errOutput = vi.mocked(console.error).mock.calls.map((c) => c[0]).join('\n');
    expect(errOutput).toContain('Aborted.');
    expect(mockExecFileSync).not.toHaveBeenCalled();
  });

  it('backs up and runs script when user confirms prompt', async () => {
    mockExistsSync.mockImplementation((p: string) => {
      if (p === scriptPath) return true;
      if (p === copilotInstructionsPath) return true;
      if (p === copilotInstructionsBakPath) return false;
      return false;
    });
    mockReadFileSync.mockReturnValue(UNMANAGED_CONTENT);
    // Simulate user typing 'y'
    mockQuestion.mockImplementation((_prompt: string, cb: (answer: string) => void) => cb('y'));

    await setupIdeAction('/tmp/test', 'copilot');

    expect(mockCopyFileSync).toHaveBeenCalledWith(copilotInstructionsPath, copilotInstructionsBakPath);
    expect(mockExecFileSync).toHaveBeenCalledWith(
      'bash',
      [scriptPath, 'copilot'],
      expect.objectContaining({ cwd: '/tmp/test' }),
    );
  });

  it('prints preserved message and does not copy when .bak already exists', async () => {
    mockExistsSync.mockImplementation((p: string) => {
      if (p === scriptPath) return true;
      if (p === copilotInstructionsPath) return true;
      if (p === copilotInstructionsBakPath) return true;
      return false;
    });
    mockReadFileSync.mockReturnValue(UNMANAGED_CONTENT);

    await setupIdeAction('/tmp/test', 'copilot', { yes: true });

    expect(mockCopyFileSync).not.toHaveBeenCalled();
    const logOutput = vi.mocked(console.log).mock.calls.map((c) => c[0]).join('\n');
    expect(logOutput).toContain('existing backup preserved');
    expect(mockExecFileSync).toHaveBeenCalled();
  });
});

// ─── setupIdeAction — claude ─────────────────────────────────────────────────

describe('setupIdeAction — claude target', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDetect.mockResolvedValue({ installed: true });
    mockExistsSync.mockImplementation((p: string) => p === scriptPath);
    mockExecFileSync.mockReturnValue(undefined);
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('skips backup when managed marker present, script runs', async () => {
    mockExistsSync.mockImplementation(
      (p: string) => p === scriptPath || p === claudeMdPath,
    );
    mockReadFileSync.mockReturnValue(MANAGED_CONTENT);

    await setupIdeAction('/tmp/test', 'claude', { yes: true });

    expect(mockCopyFileSync).not.toHaveBeenCalled();
    expect(mockExecFileSync).toHaveBeenCalledWith(
      'bash',
      [scriptPath, 'claude'],
      expect.objectContaining({ cwd: '/tmp/test' }),
    );
  });

  it('skips backup when no CLAUDE.md, script runs', async () => {
    mockExistsSync.mockImplementation((p: string) => p === scriptPath);

    await setupIdeAction('/tmp/test', 'claude', { yes: true });

    expect(mockCopyFileSync).not.toHaveBeenCalled();
    expect(mockExecFileSync).toHaveBeenCalledWith(
      'bash',
      [scriptPath, 'claude'],
      expect.objectContaining({ cwd: '/tmp/test' }),
    );
  });

  it('copies to .bak and prints notice when no marker and no existing .bak', async () => {
    mockExistsSync.mockImplementation((p: string) => {
      if (p === scriptPath) return true;
      if (p === claudeMdPath) return true;
      if (p === claudeMdBakPath) return false;
      return false;
    });
    mockReadFileSync.mockReturnValue(UNMANAGED_CONTENT);

    await setupIdeAction('/tmp/test', 'claude', { yes: true });

    expect(mockCopyFileSync).toHaveBeenCalledWith(claudeMdPath, claudeMdBakPath);
    const logOutput = vi.mocked(console.log).mock.calls.map((c) => c[0]).join('\n');
    expect(logOutput).toContain('Backed up CLAUDE.md');
  });

  it('skips copy and prints preserved message when no marker but .bak exists', async () => {
    mockExistsSync.mockImplementation((p: string) => {
      if (p === scriptPath) return true;
      if (p === claudeMdPath) return true;
      if (p === claudeMdBakPath) return true;
      return false;
    });
    mockReadFileSync.mockReturnValue(UNMANAGED_CONTENT);

    await setupIdeAction('/tmp/test', 'claude', { yes: true });

    expect(mockCopyFileSync).not.toHaveBeenCalled();
    const logOutput = vi.mocked(console.log).mock.calls.map((c) => c[0]).join('\n');
    expect(logOutput).toContain('existing backup preserved at CLAUDE.md.bak');
  });
});

// ─── setupIdeAction — cursor and agents targets ─────────────────────────────

describe('setupIdeAction — cursor and agents targets', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDetect.mockResolvedValue({ installed: true });
    mockExistsSync.mockImplementation((p: string) => p === scriptPath);
    mockExecFileSync.mockReturnValue(undefined);
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('cursor: errors when guides not installed (same error as claude path)', async () => {
    mockDetect.mockResolvedValue({ installed: false });

    await expect(setupIdeAction('/tmp/test', 'cursor')).rejects.toThrow('Guides are not installed');
  });

  it('agents: errors when guides not installed (same error as claude path)', async () => {
    mockDetect.mockResolvedValue({ installed: false });

    await expect(setupIdeAction('/tmp/test', 'agents')).rejects.toThrow('Guides are not installed');
  });

  it('codex invocation passes agents to the script', async () => {
    await setupIdeAction('/tmp/test', 'codex', { yes: true });

    expect(mockExecFileSync).toHaveBeenCalledWith(
      'bash',
      [scriptPath, 'agents'],
      expect.objectContaining({ cwd: '/tmp/test' }),
    );
  });

  it('managed AGENTS.md present, target agents → no prompt, no backup, script runs', async () => {
    mockExistsSync.mockImplementation((p: string) => p === scriptPath || p === agentsMdPath);
    mockReadFileSync.mockReturnValue(MANAGED_CONTENT);

    await setupIdeAction('/tmp/test', 'agents', { yes: true });

    expect(mockCopyFileSync).not.toHaveBeenCalled();
    expect(mockExecFileSync).toHaveBeenCalledWith(
      'bash',
      [scriptPath, 'agents'],
      expect.objectContaining({ cwd: '/tmp/test' }),
    );
  });

  it('no conventions file present, target cursor → no prompt, script runs', async () => {
    await setupIdeAction('/tmp/test', 'cursor', { yes: true });

    expect(mockCopyFileSync).not.toHaveBeenCalled();
    expect(mockExecFileSync).toHaveBeenCalledWith(
      'bash',
      [scriptPath, 'cursor'],
      expect.objectContaining({ cwd: '/tmp/test' }),
    );
  });

  it('unmanaged AGENTS.md, --yes → AGENTS.md.bak created, script runs', async () => {
    mockExistsSync.mockImplementation((p: string) => {
      if (p === scriptPath) return true;
      if (p === agentsMdPath) return true;
      if (p === agentsMdBakPath) return false;
      return false;
    });
    mockReadFileSync.mockReturnValue(UNMANAGED_CONTENT);

    await setupIdeAction('/tmp/test', 'cursor', { yes: true });

    expect(mockCopyFileSync).toHaveBeenCalledWith(agentsMdPath, agentsMdBakPath);
    expect(mockExecFileSync).toHaveBeenCalledWith(
      'bash',
      [scriptPath, 'cursor'],
      expect.objectContaining({ cwd: '/tmp/test' }),
    );
  });

  it('unmanaged AGENTS.md, user confirms → backup created, script runs', async () => {
    mockExistsSync.mockImplementation((p: string) => {
      if (p === scriptPath) return true;
      if (p === agentsMdPath) return true;
      if (p === agentsMdBakPath) return false;
      return false;
    });
    mockReadFileSync.mockReturnValue(UNMANAGED_CONTENT);
    mockQuestion.mockImplementation((_prompt: string, cb: (answer: string) => void) => cb('y'));

    await setupIdeAction('/tmp/test', 'agents');

    expect(mockCopyFileSync).toHaveBeenCalledWith(agentsMdPath, agentsMdBakPath);
    expect(mockExecFileSync).toHaveBeenCalledWith(
      'bash',
      [scriptPath, 'agents'],
      expect.objectContaining({ cwd: '/tmp/test' }),
    );
  });

  it('unmanaged AGENTS.md, user denies → Aborted printed, script NOT run', async () => {
    mockExistsSync.mockImplementation((p: string) => p === scriptPath || p === agentsMdPath);
    mockReadFileSync.mockReturnValue(UNMANAGED_CONTENT);
    mockQuestion.mockImplementation((_prompt: string, cb: (answer: string) => void) => cb('n'));

    await setupIdeAction('/tmp/test', 'agents');

    const errOutput = vi.mocked(console.error).mock.calls.map((c) => c[0]).join('\n');
    expect(errOutput).toContain('Aborted.');
    expect(mockExecFileSync).not.toHaveBeenCalled();
  });

  it('unmanaged AGENTS.md with existing .bak → existing backup preserved, .bak not overwritten', async () => {
    mockExistsSync.mockImplementation((p: string) => {
      if (p === scriptPath) return true;
      if (p === agentsMdPath) return true;
      if (p === agentsMdBakPath) return true;
      return false;
    });
    mockReadFileSync.mockReturnValue(UNMANAGED_CONTENT);

    await setupIdeAction('/tmp/test', 'cursor', { yes: true });

    expect(mockCopyFileSync).not.toHaveBeenCalled();
    const logOutput = vi.mocked(console.log).mock.calls.map((c) => c[0]).join('\n');
    expect(logOutput).toContain('existing backup preserved');
    expect(mockExecFileSync).toHaveBeenCalled();
  });
});
