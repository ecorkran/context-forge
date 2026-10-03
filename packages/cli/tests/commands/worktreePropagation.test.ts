import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Command } from 'commander';
import { registerSetupIdeCommand } from '../../src/commands/setup-ide.js';
import { propagateToWorktrees } from '../../src/commands/worktreePropagation.js';

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
      readFileSync: (...args: unknown[]) => mockReadFileSync(...args),
      mkdirSync: (...args: unknown[]) => mockMkdirSync(...args),
      readdirSync: (...args: unknown[]) => mockReaddirSync(...args),
    },
    existsSync: (...args: unknown[]) => mockExistsSync(...args),
    copyFileSync: (...args: unknown[]) => mockCopyFileSync(...args),
    cpSync: (...args: unknown[]) => mockCpSync(...args),
    readFileSync: (...args: unknown[]) => mockReadFileSync(...args),
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

// ─── propagateToWorktrees — copilot (via command action) ────────────────────

describe('propagateToWorktrees — copilot target', () => {
  const wtPath = '/tmp/wt1';
  const wtAgentsPath = `${wtPath}/AGENTS.md`;
  const wtGithubDir = `${wtPath}/.github`;
  const wtInstructionsPath = `${wtPath}/.github/copilot-instructions.md`;
  const wtInstructionsDir = `${wtPath}/.github/instructions`;
  const wtPromptsDir = `${wtPath}/.github/prompts`;

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetById.mockResolvedValue(sampleProjectWithWorktrees);
    mockDetect.mockResolvedValue({ installed: true });
    mockExecFileSync.mockReturnValue(undefined);
    // Explicit, not inherited: in setup-ide.test.ts this block relied on the
    // getAll/readFileSync values left behind by earlier tests and failed when run alone.
    mockGetAll.mockResolvedValue([sampleProjectWithWorktrees]);
    mockReadFileSync.mockReturnValue(MANAGED_CONTENT);
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
  });

  it('copies AGENTS.md to worktree', async () => {
    mockExistsSync.mockImplementation((p: string) => {
      if (p === scriptPath) return true;
      if (p === agentsMdPath) return true;
      if (p === wtPath) return true;
      return false;
    });

    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'setup-ide', 'copilot', '--yes', '--project', 'proj_001']);

    expect(mockCopyFileSync).toHaveBeenCalledWith(agentsMdPath, wtAgentsPath);
  });

  it('copies copilot-instructions.md to worktree (creates .github dir)', async () => {
    mockExistsSync.mockImplementation((p: string) => {
      if (p === scriptPath) return true;
      if (p === copilotInstructionsPath) return true;
      if (p === wtPath) return true;
      return false;
    });

    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'setup-ide', 'copilot', '--yes', '--project', 'proj_001']);

    expect(mockMkdirSync).toHaveBeenCalledWith(wtGithubDir, { recursive: true });
    expect(mockCopyFileSync).toHaveBeenCalledWith(copilotInstructionsPath, wtInstructionsPath);
  });

  it('copies .github/instructions/ and .github/prompts/ directories to worktree', async () => {
    const srcInstructionsDir = '/tmp/test/.github/instructions';
    const srcPromptsDir = '/tmp/test/.github/prompts';

    mockExistsSync.mockImplementation((p: string) => {
      if (p === scriptPath) return true;
      if (p === srcInstructionsDir) return true;
      if (p === srcPromptsDir) return true;
      if (p === wtPath) return true;
      return false;
    });

    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'setup-ide', 'copilot', '--yes', '--project', 'proj_001']);

    expect(mockCpSync).toHaveBeenCalledWith(srcInstructionsDir, wtInstructionsDir, { recursive: true });
    expect(mockCpSync).toHaveBeenCalledWith(srcPromptsDir, wtPromptsDir, { recursive: true });
  });

  it('skips missing source dirs and files without error', async () => {
    mockExistsSync.mockImplementation((p: string) => {
      if (p === scriptPath) return true;
      if (p === wtPath) return true;
      return false; // all source files/dirs absent
    });

    const program = createProgram();
    await expect(
      program.parseAsync(['node', 'cf', 'setup-ide', 'copilot', '--yes', '--project', 'proj_001'])
    ).resolves.not.toThrow();

    expect(mockCopyFileSync).not.toHaveBeenCalled();
    expect(mockCpSync).not.toHaveBeenCalled();
  });

  it('codex alias resolves to agents before propagation (raw alias must not reach propagateToWorktrees)', async () => {
    mockExistsSync.mockImplementation((p: string) => {
      if (p === scriptPath) return true;
      if (p === agentsMdPath) return true;
      if (p === wtPath) return true;
      return false;
    });

    const program = createProgram();
    await expect(
      program.parseAsync(['node', 'cf', 'setup-ide', 'codex', '--yes', '--project', 'proj_001'])
    ).resolves.not.toThrow();

    expect(mockExecFileSync).toHaveBeenCalledWith(
      'bash',
      [scriptPath, 'agents'],
      expect.objectContaining({ cwd: '/tmp/test' }),
    );
    expect(mockCopyFileSync).toHaveBeenCalledWith(agentsMdPath, wtAgentsPath);
  });
});

// ─── propagateToWorktrees — direct unit tests ───────────────────────────────

describe('propagateToWorktrees', () => {
  const wtPath = '/tmp/wt1';

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  it('claude copies CLAUDE.md and the three .claude/ dirs; excludes settings.local.json and worktrees/', () => {
    mockExistsSync.mockImplementation((p: string) => {
      if (p === claudeMdPath) return true;
      if (p === wtPath) return true;
      if (p === '/tmp/test/.claude/rules') return true;
      if (p === '/tmp/test/.claude/agents') return true;
      if (p === '/tmp/test/.claude/skills') return true;
      return false;
    });

    propagateToWorktrees(sampleProjectWithWorktrees, 'claude');

    expect(mockCopyFileSync).toHaveBeenCalledWith(claudeMdPath, `${wtPath}/CLAUDE.md`);
    expect(mockCpSync).toHaveBeenCalledWith('/tmp/test/.claude/rules', `${wtPath}/.claude/rules`, { recursive: true });
    expect(mockCpSync).toHaveBeenCalledWith('/tmp/test/.claude/agents', `${wtPath}/.claude/agents`, { recursive: true });
    expect(mockCpSync).toHaveBeenCalledWith('/tmp/test/.claude/skills', `${wtPath}/.claude/skills`, { recursive: true });
    expect(mockCpSync).not.toHaveBeenCalledWith(
      expect.stringContaining('settings.local.json'),
      expect.anything(),
      expect.anything(),
    );
    expect(mockCpSync).not.toHaveBeenCalledWith('/tmp/test/.claude/worktrees', expect.anything(), expect.anything());
  });

  it('nested skill directories reach the worktree (regression: the pre-slice flat isFile() loop never copied them)', () => {
    mockExistsSync.mockImplementation((p: string) => p === wtPath || p === '/tmp/test/.claude/skills');

    propagateToWorktrees(sampleProjectWithWorktrees, 'claude');

    // fs.cpSync({recursive: true}) copies nested skill dirs (skills/<name>/SKILL.md) in one
    // call. The pre-slice implementation used readdirSync + entry.isFile(), which silently
    // skipped every nested directory — this call only exists after that rewrite.
    expect(mockCpSync).toHaveBeenCalledWith('/tmp/test/.claude/skills', `${wtPath}/.claude/skills`, { recursive: true });
  });

  it('copilot copies both marker files and .github/instructions/ + .github/prompts/ + .agents/skills/', () => {
    mockExistsSync.mockImplementation((p: string) => {
      if (p === copilotInstructionsPath) return true;
      if (p === agentsMdPath) return true;
      if (p === '/tmp/test/.github/instructions') return true;
      if (p === '/tmp/test/.github/prompts') return true;
      if (p === '/tmp/test/.agents/skills') return true;
      if (p === wtPath) return true;
      return false;
    });

    propagateToWorktrees(sampleProjectWithWorktrees, 'copilot');

    expect(mockCopyFileSync).toHaveBeenCalledWith(copilotInstructionsPath, `${wtPath}/.github/copilot-instructions.md`);
    expect(mockCopyFileSync).toHaveBeenCalledWith(agentsMdPath, `${wtPath}/AGENTS.md`);
    expect(mockCpSync).toHaveBeenCalledWith('/tmp/test/.github/instructions', `${wtPath}/.github/instructions`, { recursive: true });
    expect(mockCpSync).toHaveBeenCalledWith('/tmp/test/.github/prompts', `${wtPath}/.github/prompts`, { recursive: true });
    expect(mockCpSync).toHaveBeenCalledWith('/tmp/test/.agents/skills', `${wtPath}/.agents/skills`, { recursive: true });
  });

  it('cursor copies AGENTS.md and .cursor/rules/', () => {
    mockExistsSync.mockImplementation((p: string) => {
      if (p === agentsMdPath) return true;
      if (p === '/tmp/test/.cursor/rules') return true;
      if (p === wtPath) return true;
      return false;
    });

    propagateToWorktrees(sampleProjectWithWorktrees, 'cursor');

    expect(mockCopyFileSync).toHaveBeenCalledWith(agentsMdPath, `${wtPath}/AGENTS.md`);
    expect(mockCpSync).toHaveBeenCalledWith('/tmp/test/.cursor/rules', `${wtPath}/.cursor/rules`, { recursive: true });
  });

  it('agents copies AGENTS.md and .agents/skills/', () => {
    mockExistsSync.mockImplementation((p: string) => {
      if (p === agentsMdPath) return true;
      if (p === '/tmp/test/.agents/skills') return true;
      if (p === wtPath) return true;
      return false;
    });

    propagateToWorktrees(sampleProjectWithWorktrees, 'agents');

    expect(mockCopyFileSync).toHaveBeenCalledWith(agentsMdPath, `${wtPath}/AGENTS.md`);
    expect(mockCpSync).toHaveBeenCalledWith('/tmp/test/.agents/skills', `${wtPath}/.agents/skills`, { recursive: true });
  });

  it('skips a worktree whose worktreePath does not exist, without error', () => {
    mockExistsSync.mockReturnValue(false); // wtPath itself absent

    expect(() => propagateToWorktrees(sampleProjectWithWorktrees, 'claude')).not.toThrow();
    expect(mockCopyFileSync).not.toHaveBeenCalled();
    expect(mockCpSync).not.toHaveBeenCalled();
  });

  it('zero registered worktrees → no-op, no error', () => {
    mockExistsSync.mockReturnValue(true);

    expect(() => propagateToWorktrees(sampleProject, 'claude')).not.toThrow();
    expect(mockCopyFileSync).not.toHaveBeenCalled();
    expect(mockCpSync).not.toHaveBeenCalled();
  });

  it('skips a "default" worktree whose worktreePath is the project root, without error (regression: fs.cpSync throws on src === dest)', () => {
    // WorktreeService migrates a project's pre-worktree workflow fields into a
    // "default" worktree context whose worktreePath is the project root itself.
    // fs.cpSync throws ERR_FS_CP_EINVAL when src and dest are the same path, so
    // this worktree must be filtered out rather than merely being harmless.
    const projectWithRootWorktree = {
      ...sampleProject,
      worktrees: [{ id: 'wt_default', name: 'default', worktreePath: sampleProject.projectPath }],
    };
    mockExistsSync.mockReturnValue(true);

    expect(() => propagateToWorktrees(projectWithRootWorktree, 'claude')).not.toThrow();
    expect(mockCopyFileSync).not.toHaveBeenCalled();
    expect(mockCpSync).not.toHaveBeenCalled();
  });

  it('propagates to a real worktree while still skipping a co-registered root-path "default" worktree', () => {
    const projectWithBoth = {
      ...sampleProject,
      worktrees: [
        { id: 'wt_default', name: 'default', worktreePath: sampleProject.projectPath },
        { id: 'wt_001', name: 'feature', worktreePath: '/tmp/wt1' },
      ],
    };
    mockExistsSync.mockImplementation((p: string) => p === claudeMdPath || p === wtPath);

    propagateToWorktrees(projectWithBoth, 'claude');

    expect(mockCopyFileSync).toHaveBeenCalledWith(claudeMdPath, `${wtPath}/CLAUDE.md`);
    expect(mockCopyFileSync).toHaveBeenCalledTimes(1);

    // One header for the real worktree only, and the singular count line.
    const logLines = vi.mocked(console.log).mock.calls.map((c) => String(c[0]));
    expect(logLines.filter((l) => l.includes('→ propagating to worktree:'))).toEqual([
      `  → propagating to worktree: feature (${wtPath})`,
    ]);
    expect(logLines).toContain('  Propagated to 1 worktree.');
  });

  it('prints one header per worktree and the plural count line', () => {
    const projectWithTwo = {
      ...sampleProject,
      worktrees: [
        { id: 'wt_001', name: 'feature', worktreePath: '/tmp/wt1' },
        { id: 'wt_002', name: 'other', worktreePath: '/tmp/wt2' },
      ],
    };
    mockExistsSync.mockImplementation((p: string) => p === '/tmp/wt1' || p === '/tmp/wt2');

    propagateToWorktrees(projectWithTwo, 'claude');

    const logLines = vi.mocked(console.log).mock.calls.map((c) => String(c[0]));
    expect(logLines.filter((l) => l.includes('→ propagating to worktree:'))).toEqual([
      '  → propagating to worktree: feature (/tmp/wt1)',
      '  → propagating to worktree: other (/tmp/wt2)',
    ]);
    expect(logLines).toContain('  Propagated to 2 worktrees.');
  });

  it('an unresolvable target throws instead of returning silently', () => {
    mockExistsSync.mockImplementation((p: string) => p === wtPath);

    expect(() => propagateToWorktrees(sampleProjectWithWorktrees, 'notarealtarget')).toThrow(
      "No propagation descriptor for target 'notarealtarget'.",
    );
  });
});

// ─── propagation skipped when the guide script did not run ──────────────────

describe('setup-ide command — propagation skipped when the script did not run', () => {
  const wtPath = '/tmp/wt1';

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAll.mockResolvedValue([sampleProjectWithWorktrees]);
    mockGetById.mockResolvedValue(sampleProjectWithWorktrees);
    mockDetect.mockResolvedValue({ installed: true });
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
  });

  function expectNoPropagation(): void {
    const intoWorktree = (dst: unknown) => String(dst).startsWith(wtPath);
    expect(mockCopyFileSync.mock.calls.some((c) => intoWorktree(c[1]))).toBe(false);
    expect(mockCpSync.mock.calls.some((c) => intoWorktree(c[1]))).toBe(false);
    const logOutput = vi.mocked(console.log).mock.calls.map((c) => String(c[0])).join('\n');
    expect(logOutput).not.toContain('→ propagating to worktree:');
  }

  it('user answers n at the overwrite prompt → nothing propagated', async () => {
    mockExistsSync.mockImplementation((p: string) => p === scriptPath || p === claudeMdPath || p === wtPath);
    mockReadFileSync.mockReturnValue(UNMANAGED_CONTENT);
    mockQuestion.mockImplementation((_prompt: string, cb: (answer: string) => void) => cb('n'));

    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'setup-ide', 'claude', '--project', 'proj_001']);

    expect(mockExecFileSync).not.toHaveBeenCalled();
    expectNoPropagation();
    expect(mockInstallCommandsForTarget).not.toHaveBeenCalled();
  });

  it('guide script exits non-zero → error reported, nothing propagated', async () => {
    mockExistsSync.mockImplementation((p: string) => p === scriptPath || p === claudeMdPath || p === wtPath);
    mockReadFileSync.mockReturnValue(MANAGED_CONTENT);
    mockExecFileSync.mockImplementation(() => {
      throw Object.assign(new Error('script failed'), { status: 1 });
    });

    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'setup-ide', 'claude', '--yes', '--project', 'proj_001']);

    const errOutput = vi.mocked(console.error).mock.calls.map((c) => String(c[0])).join('\n');
    expect(errOutput).toContain('setup-ide exited with code 1');
    expectNoPropagation();
  });
});
