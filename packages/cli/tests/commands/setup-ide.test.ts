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
import type { InstallOptions } from '../../src/ideInstall/installer.js';

const mockGetAll = vi.fn();
const mockGetById = vi.fn();
const mockDetect = vi.fn();
const mockExistsSync = vi.fn();
const mockCopyFileSync = vi.fn();
const mockReadFileSync = vi.fn();

// The installer runs in-process; its behavior is covered by tests/ideInstall.
// Here it is mocked so these tests pin only what cf passes it and does with the result.
const mockInstallIde = vi.fn((_options: InstallOptions): { exitCode: 0 | 1 } => ({ exitCode: 0 }));

vi.mock('../../src/ideInstall/installer.js', () => ({
  installIde: (options: InstallOptions) => mockInstallIde(options),
}));

/** rules.exclude as configured per checkout root; unset roots resolve to ''. */
const rulesExcludeByRoot = new Map<string, string>();

// readline mock — controls user input simulation
const mockQuestion = vi.fn();
const mockRlClose = vi.fn();

vi.mock('@context-forge/core/node', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@context-forge/core/node')>();
  return {
    parseRulesExclude: actual.parseRulesExclude,
    // Marker literals are re-exported from core by the cli modules.
    MANAGED_BEGIN_MARKER: actual.MANAGED_BEGIN_MARKER,
    MANAGED_END_MARKER: actual.MANAGED_END_MARKER,
    GENERATED_MARKER: actual.GENERATED_MARKER,
    PREMANAGED_BACKUP_SUFFIX: actual.PREMANAGED_BACKUP_SUFFIX,
    readRuleResolutions: vi.fn().mockReturnValue([]),
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
    ConfigManager: vi.fn().mockImplementation((root: string) => ({
      get: vi.fn().mockResolvedValue({ value: rulesExcludeByRoot.get(root) ?? '' }),
    })),
    GUIDE_RELATIVE_PATH: 'project-documents/ai-project-guide',
    // Mirrors the real constant in core/guides/gitExec.ts (#78).
    GUIDE_OFFLINE_REMEDIATION:
      'Check your VPN/proxy connection, or install offline by pointing guide.source ' +
      'at a local path or mirror (cf config set guide.source <path>).',
  };
});

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    default: {
      ...actual,
      existsSync: (...args: unknown[]) => mockExistsSync(...args),
      copyFileSync: (...args: unknown[]) => mockCopyFileSync(...args),
      readFileSync: (...args: unknown[]) => mockReadFileSync(...args),
    },
    existsSync: (...args: unknown[]) => mockExistsSync(...args),
    copyFileSync: (...args: unknown[]) => mockCopyFileSync(...args),
    readFileSync: (...args: unknown[]) => mockReadFileSync(...args),
  };
});

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

const twoWorktreeProject = {
  ...sampleProject,
  worktrees: [
    { id: 'wt_001', name: 'feature', worktreePath: '/tmp/wt1' },
    { id: 'wt_002', name: 'bugfix', worktreePath: '/tmp/wt2' },
  ],
};

const guidePath = '/tmp/test/project-documents/ai-project-guide';
const claudeMdPath = '/tmp/test/CLAUDE.md';
const copilotInstructionsPath = '/tmp/test/.github/copilot-instructions.md';
const agentsMdPath = '/tmp/test/AGENTS.md';

const MANAGED_CONTENT = '[//]: # (context-forge:managed)\n\n# Content';
const UNMANAGED_CONTENT = '# My custom instructions\n\nSome content here.';

function createProgram(): Command {
  const program = new Command();
  program.exitOverride();
  registerSetupIdeCommand(program);
  return program;
}

/** [targetRoot, target, dryRun, writeLint, rulesExclude] of each installIde call. */
function installs(): [string, string, boolean, boolean, readonly string[]][] {
  return mockInstallIde.mock.calls.map(([o]) => [o.targetRoot, o.target, o.dryRun, o.writeLint, o.rulesExclude]);
}

function errText(): string {
  return vi.mocked(console.error).mock.calls.map((c) => c[0]).join('\n');
}

function resetMocks(): void {
  vi.clearAllMocks();
  mockInstallIde.mockImplementation(() => ({ exitCode: 0 }));
  rulesExcludeByRoot.clear();
  mockDetect.mockResolvedValue({ installed: true });
  mockExistsSync.mockReturnValue(false);
  mockGetAll.mockResolvedValue([sampleProject]);
  mockGetById.mockResolvedValue(sampleProject);
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
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
  beforeEach(resetMocks);

  it('rejects invalid target and lists valid targets', async () => {
    await createProgram().parseAsync(['node', 'cf', 'setup-ide', 'vim']);
    expect(errText()).toContain("Invalid target 'vim'");
    expect(errText()).toContain('claude');
    expect(mockInstallIde).not.toHaveBeenCalled();
  });

  it('rejects an unsupported target and lists all four canonical targets', async () => {
    await createProgram().parseAsync(['node', 'cf', 'setup-ide', 'notarealtarget']);
    for (const word of ["Invalid target 'notarealtarget'", 'claude', 'copilot', 'cursor', 'agents']) {
      expect(errText()).toContain(word);
    }
  });

  it('errors when guides not installed', async () => {
    mockDetect.mockResolvedValue({ installed: false });
    await createProgram().parseAsync(['node', 'cf', 'setup-ide', 'claude', '--project', 'proj_001']);
    expect(errText()).toContain('Guides are not installed');
    expect(errText()).toContain('cf guides install');
    // #78: the offline/network fallback guidance must be surfaced here too.
    expect(errText()).toContain('cf config set guide.source');
    expect(errText()).toContain('VPN/proxy');
    expect(mockInstallIde).not.toHaveBeenCalled();
  });

  it('installs in-process from the project guide into the project root', async () => {
    await createProgram().parseAsync(['node', 'cf', 'setup-ide', 'claude', '--project', 'proj_001']);
    expect(mockInstallIde).toHaveBeenCalledWith(
      expect.objectContaining({ guideDir: guidePath, projectRoot: '/tmp/test', targetRoot: '/tmp/test', target: 'claude' }),
    );
    expect(installs()).toEqual([['/tmp/test', 'claude', false, false, []]]);
    expect(errText()).toContain('IDE setup complete for claude.');
  });

  it.each([
    ['codex', 'agents'],
    ['openai', 'agents'],
    ['CLAUDE', 'claude'],
    ['copilot', 'copilot'],
  ])('passes %s to the installer as %s', async (input, target) => {
    await createProgram().parseAsync(['node', 'cf', 'setup-ide', input, '--project', 'proj_001']);
    expect(installs()[0][1]).toBe(target);
  });

  it('passes the configured rules.exclude as patterns', async () => {
    rulesExcludeByRoot.set('/tmp/test', 'dart.md,swift*.md');
    await createProgram().parseAsync(['node', 'cf', 'setup-ide', 'claude', '--project', 'proj_001']);
    expect(installs()[0][4]).toEqual(['dart.md', 'swift*.md']);
  });

  it('turns an install that reports failure into an error and exit 1', async () => {
    mockInstallIde.mockReturnValue({ exitCode: 1 });
    await createProgram().parseAsync(['node', 'cf', 'setup-ide', 'claude', '--project', 'proj_001']);
    expect(errText()).toContain('setup-ide failed for claude');
    expect(process.exit).toHaveBeenCalledWith(1);
    expect(mockInstallCommandsForTarget).not.toHaveBeenCalled();
  });

  it('installs commands globally after claude setup, and after codex (resolved to agents)', async () => {
    await createProgram().parseAsync(['node', 'cf', 'setup-ide', 'claude', '--project', 'proj_001']);
    await createProgram().parseAsync(['node', 'cf', 'setup-ide', 'codex', '--project', 'proj_001']);
    expect(mockInstallCommandsForTarget.mock.calls).toEqual([['claude'], ['agents']]);
  });

  it('skips command delivery for targets without it (cursor)', async () => {
    await createProgram().parseAsync(['node', 'cf', 'setup-ide', 'cursor', '--project', 'proj_001']);
    expect(mockInstallIde).toHaveBeenCalled();
    expect(mockInstallCommandsForTarget).not.toHaveBeenCalled();
  });

  it('--dry-run and --write-lint reach the installer; a dry run prompts for and installs nothing', async () => {
    mockExistsSync.mockImplementation((p: string) => p === claudeMdPath);
    mockReadFileSync.mockReturnValue(UNMANAGED_CONTENT);
    await createProgram().parseAsync([
      'node', 'cf', 'setup-ide', '--write-lint', 'claude', '--dry-run', '--project', 'proj_001',
    ]);
    expect(installs()).toEqual([['/tmp/test', 'claude', true, true, []]]);
    expect(mockQuestion).not.toHaveBeenCalled();
    expect(mockCopyFileSync).not.toHaveBeenCalled();
    expect(mockInstallCommandsForTarget).not.toHaveBeenCalled();
    expect(errText()).toContain('Dry run complete for claude');
  });
});

describe('cf setup-ide worktree loop', () => {
  beforeEach(() => {
    resetMocks();
    mockGetById.mockResolvedValue(twoWorktreeProject);
    // propagationTargets keeps only worktrees whose path exists.
    mockExistsSync.mockImplementation((p: string) => p === '/tmp/wt1' || p === '/tmp/wt2');
  });

  it('installs the root, then each worktree into its own root from the main checkout guide', async () => {
    await createProgram().parseAsync(['node', 'cf', 'setup-ide', 'claude', '--project', 'proj_001']);
    expect(installs().map(([root]) => root)).toEqual(['/tmp/test', '/tmp/wt1', '/tmp/wt2']);
    for (const [options] of mockInstallIde.mock.calls) {
      expect(options.guideDir).toBe(guidePath);
      expect(options.projectRoot).toBe(options.targetRoot);
    }
    const logText = vi.mocked(console.log).mock.calls.map((c) => c[0]).join('\n');
    expect(logText).toContain('→ setup-ide in worktree: feature (/tmp/wt1)');
    expect(mockInstallCommandsForTarget).toHaveBeenCalledWith('claude');
  });

  it('reads rules.exclude for each worktree root', async () => {
    rulesExcludeByRoot.set('/tmp/wt1', 'dart.md');
    await createProgram().parseAsync(['node', 'cf', 'setup-ide', 'claude', '--project', 'proj_001']);
    expect(installs().map(([root, , , , exclude]) => [root, exclude])).toEqual([
      ['/tmp/test', []],
      ['/tmp/wt1', ['dart.md']],
      ['/tmp/wt2', []],
    ]);
  });

  it('a dry run reaches every worktree with the same flags and installs no commands', async () => {
    await createProgram().parseAsync([
      'node', 'cf', 'setup-ide', 'claude', '--dry-run', '--write-lint', '--project', 'proj_001',
    ]);
    expect(installs().map(([root, , dryRun, writeLint]) => [root, dryRun, writeLint])).toEqual([
      ['/tmp/test', true, true],
      ['/tmp/wt1', true, true],
      ['/tmp/wt2', true, true],
    ]);
    expect(mockInstallCommandsForTarget).not.toHaveBeenCalled();
  });

  it('a failing worktree does not stop the others; the run then fails naming it', async () => {
    mockInstallIde.mockImplementation((o) => ({ exitCode: o.targetRoot === '/tmp/wt1' ? 1 : 0 }));
    await createProgram().parseAsync(['node', 'cf', 'setup-ide', 'claude', '--project', 'proj_001']);
    expect(installs().map(([root]) => root)).toContain('/tmp/wt2');
    expect(mockInstallCommandsForTarget).toHaveBeenCalledWith('claude');
    expect(errText()).toContain('setup-ide failed in worktree feature.');
    expect(errText()).toContain('setup-ide failed in worktree(s): feature.');
    expect(process.exit).toHaveBeenCalledWith(1);
  });

  it('stops on any other exception: it is a bug, not a worktree failure', async () => {
    mockInstallIde.mockImplementation((o) => {
      if (o.targetRoot === '/tmp/wt1') throw new TypeError('a bug');
      return { exitCode: 0 };
    });
    await createProgram().parseAsync(['node', 'cf', 'setup-ide', 'claude', '--project', 'proj_001']);
    expect(installs().map(([root]) => root)).not.toContain('/tmp/wt2');
    expect(process.exit).toHaveBeenCalledWith(1);
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

// ─── setupIdeAction: the overwrite prompt ────────────────────────────────────

describe.each([
  ['claude', claudeMdPath],
  ['copilot', copilotInstructionsPath],
  ['agents', agentsMdPath],
  ['cursor', agentsMdPath],
])('setupIdeAction — %s overwrite prompt', (target, markerFile) => {
  beforeEach(resetMocks);

  it('managed file present → no prompt, installs', async () => {
    mockExistsSync.mockImplementation((p: string) => p === markerFile);
    mockReadFileSync.mockReturnValue(MANAGED_CONTENT);
    await setupIdeAction('/tmp/test', target);
    expect(mockQuestion).not.toHaveBeenCalled();
    expect(mockInstallIde).toHaveBeenCalledTimes(1);
  });

  it('no marker file → no prompt, installs', async () => {
    await setupIdeAction('/tmp/test', target);
    expect(mockQuestion).not.toHaveBeenCalled();
    expect(mockInstallIde).toHaveBeenCalledTimes(1);
  });

  it('unmanaged file, user confirms → installs; cf takes no .bak (the installer backs up)', async () => {
    mockExistsSync.mockImplementation((p: string) => p === markerFile);
    mockReadFileSync.mockReturnValue(UNMANAGED_CONTENT);
    mockQuestion.mockImplementation((_prompt: string, cb: (answer: string) => void) => cb('y'));
    await setupIdeAction('/tmp/test', target);
    expect(mockQuestion).toHaveBeenCalled();
    expect(mockCopyFileSync).not.toHaveBeenCalled();
    expect(mockInstallIde).toHaveBeenCalledTimes(1);
  });

  it('unmanaged file, --yes → no prompt, installs', async () => {
    mockExistsSync.mockImplementation((p: string) => p === markerFile);
    mockReadFileSync.mockReturnValue(UNMANAGED_CONTENT);
    await setupIdeAction('/tmp/test', target, { yes: true });
    expect(mockQuestion).not.toHaveBeenCalled();
    expect(mockInstallIde).toHaveBeenCalledTimes(1);
  });

  it('unmanaged file, user denies → Aborted, nothing installed', async () => {
    mockExistsSync.mockImplementation((p: string) => p === markerFile);
    mockReadFileSync.mockReturnValue(UNMANAGED_CONTENT);
    mockQuestion.mockImplementation((_prompt: string, cb: (answer: string) => void) => cb('n'));
    expect(await setupIdeAction('/tmp/test', target)).toBeNull();
    expect(errText()).toContain('Aborted.');
    expect(mockInstallIde).not.toHaveBeenCalled();
  });
});

describe('setupIdeAction — guide missing', () => {
  beforeEach(resetMocks);

  it.each(['claude', 'cursor', 'agents'])('%s: errors when guides not installed', async (target) => {
    mockDetect.mockResolvedValue({ installed: false });
    await expect(setupIdeAction('/tmp/test', target)).rejects.toThrow('Guides are not installed');
  });
});
