import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Command } from 'commander';
import { registerSetupIdeCommand } from '../../src/commands/setup-ide.js';
import { propagateToWorktrees, propagationTargets } from '../../src/commands/worktreePropagation.js';

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

// `setup-ide --capabilities` answers like a guide older than v0.20.1 (exit 1),
// so these tests keep exercising cf's own copy-and-prune propagation.
vi.mock('node:child_process', () => ({
  execFileSync: (...args: unknown[]) => {
    if ((args[1] as string[]).includes('--capabilities')) {
      throw Object.assign(new Error('Unsupported target'), { status: 1 });
    }
    return mockExecFileSync(...args);
  },
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

    propagateToWorktrees(sampleProjectWithWorktrees, 'claude', null);

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

    propagateToWorktrees(sampleProjectWithWorktrees, 'claude', null);

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

    propagateToWorktrees(sampleProjectWithWorktrees, 'copilot', null);

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

    propagateToWorktrees(sampleProjectWithWorktrees, 'cursor', null);

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

    propagateToWorktrees(sampleProjectWithWorktrees, 'agents', null);

    expect(mockCopyFileSync).toHaveBeenCalledWith(agentsMdPath, `${wtPath}/AGENTS.md`);
    expect(mockCpSync).toHaveBeenCalledWith('/tmp/test/.agents/skills', `${wtPath}/.agents/skills`, { recursive: true });
  });

  it('skips a worktree whose worktreePath does not exist, without error', () => {
    mockExistsSync.mockReturnValue(false); // wtPath itself absent

    expect(() => propagateToWorktrees(sampleProjectWithWorktrees, 'claude', null)).not.toThrow();
    expect(mockCopyFileSync).not.toHaveBeenCalled();
    expect(mockCpSync).not.toHaveBeenCalled();
  });

  it('zero registered worktrees → no-op, no error', () => {
    mockExistsSync.mockReturnValue(true);

    expect(() => propagateToWorktrees(sampleProject, 'claude', null)).not.toThrow();
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
      worktrees: [{ id: 'wt_default', name: 'default', isDefault: true, worktreePath: sampleProject.projectPath }],
    };
    mockExistsSync.mockReturnValue(true);

    expect(() => propagateToWorktrees(projectWithRootWorktree, 'claude', null)).not.toThrow();
    expect(mockCopyFileSync).not.toHaveBeenCalled();
    expect(mockCpSync).not.toHaveBeenCalled();
  });

  it('propagates to a real worktree while still skipping a co-registered root-path "default" worktree', () => {
    const projectWithBoth = {
      ...sampleProject,
      worktrees: [
        { id: 'wt_default', name: 'default', isDefault: true, worktreePath: sampleProject.projectPath },
        { id: 'wt_001', name: 'feature', worktreePath: '/tmp/wt1' },
      ],
    };
    mockExistsSync.mockImplementation((p: string) => p === claudeMdPath || p === wtPath);

    propagateToWorktrees(projectWithBoth, 'claude', null);

    expect(mockCopyFileSync).toHaveBeenCalledWith(claudeMdPath, `${wtPath}/CLAUDE.md`);
    expect(mockCopyFileSync).toHaveBeenCalledTimes(1);

    // One header for the real worktree only, and the singular count line.
    const logLines = vi.mocked(console.log).mock.calls.map((c) => String(c[0]));
    expect(logLines.filter((l) => l.includes('→ propagating to worktree:'))).toEqual([
      `  → propagating to worktree: feature (${wtPath})`,
    ]);
    expect(logLines).toContain('  Propagated to 1 worktree.');
  });

  it('propagationTargets ignores isDefault: only the root path excludes a worktree', () => {
    // Regression guard (slice 934): the marker must not change which worktrees receive output.
    const project = {
      ...sampleProject,
      worktrees: [
        { id: 'wt_default', name: 'main-line', isDefault: true, worktreePath: sampleProject.projectPath },
        { id: 'wt_001', name: 'feature', isDefault: false, worktreePath: '/tmp/wt1' },
      ],
    };
    mockExistsSync.mockReturnValue(true);

    expect(propagationTargets(project).map((wt) => wt.id)).toEqual(['wt_001']);
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

    propagateToWorktrees(projectWithTwo, 'claude', null);

    const logLines = vi.mocked(console.log).mock.calls.map((c) => String(c[0]));
    expect(logLines.filter((l) => l.includes('→ propagating to worktree:'))).toEqual([
      '  → propagating to worktree: feature (/tmp/wt1)',
      '  → propagating to worktree: other (/tmp/wt2)',
    ]);
    expect(logLines).toContain('  Propagated to 2 worktrees.');
  });

  it('an unresolvable target throws instead of returning silently', () => {
    mockExistsSync.mockImplementation((p: string) => p === wtPath);

    expect(() => propagateToWorktrees(sampleProjectWithWorktrees, 'notarealtarget', null)).toThrow(
      "No propagation descriptor for target 'notarealtarget'.",
    );
  });
});
