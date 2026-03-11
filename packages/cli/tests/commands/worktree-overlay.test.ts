import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Command } from 'commander';
import { registerStatusCommand } from '../../src/commands/status.js';
import { registerBuildCommand } from '../../src/commands/build.js';

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockGetAll = vi.fn();
const mockGetById = vi.fn();
const mockGetStatus = vi.fn();
const mockGenerateContextFromProject = vi.fn();

vi.mock('@context-forge/core/node', () => ({
  FileProjectStore: vi.fn().mockImplementation(() => ({
    getAll: mockGetAll,
    getById: mockGetById,
  })),
  WorkflowNavigator: vi.fn().mockImplementation(() => ({
    getStatus: mockGetStatus,
  })),
  createContextPipeline: vi.fn().mockImplementation(() => ({
    integrator: { generateContextFromProject: mockGenerateContextFromProject },
  })),
  ConfigManager: vi.fn().mockImplementation(() => ({
    get: vi.fn().mockResolvedValue({ value: '' }),
  })),
}));

vi.mock('../../src/utils/project.js', async () => {
  const actual = await vi.importActual('../../src/utils/project.js');
  return {
    ...actual,
    resolveProjectWorktree: vi.fn(),
  };
});

import { resolveProjectWorktree } from '../../src/utils/project.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const sampleWorktree = {
  id: 'wt_001',
  name: 'Feature A',
  indexRange: [100, 199] as [number, number],
  worktreePath: '/repos/test-feature',
  developmentPhase: 'Phase 6: Implementation',
  instruction: 'Phase 6: Implementation',
  activeSlice: '183-slice.worktree-cli-commands',
  activeTaskFile: '183-tasks.worktree-cli-commands',
  archDoc: '180-arch.initiative-context-worktree',
  slicePlan: '180-slices.initiative-context-worktree',
};

/**
 * The project fixture reflects the post-migration state: project-level workflow
 * fields are cleared and all workflow context lives on the worktree.
 */
const sampleProject = {
  id: 'proj_001',
  name: 'test-project',
  projectPath: '/tmp/test',
  developmentPhase: '',
  instruction: '',
  fileSlice: '',
  fileTasks: '',
  fileArch: '',
  fileSlicePlan: '',
  worktrees: [sampleWorktree],
};

const sampleStatus = {
  project: 'test-project',
  phase: 'Phase 6: Implementation',
  activeSlice: {
    name: 'worktree-cli-commands',
    index: 183,
    status: 'in-implementation',
    taskProgress: { completed: 2, total: 8, inferredStatus: 'in-progress' },
  },
  slicePlan: null,
  summary: 'test-project — Phase 6 — slice 183 in-implementation',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function createStatusProgram(): Command {
  const program = new Command();
  program.exitOverride();
  registerStatusCommand(program);
  return program;
}

function createBuildProgram(): Command {
  const program = new Command();
  program.exitOverride();
  registerBuildCommand(program);
  return program;
}

// ── cf status — worktree overlay ──────────────────────────────────────────────

describe('cf status — worktree overlay', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);

    vi.mocked(resolveProjectWorktree).mockResolvedValue({
      id: 'proj_001',
      source: 'worktree',
      worktreeId: 'wt_001',
    });
    mockGetById.mockResolvedValue({ ...sampleProject });
    mockGetStatus.mockResolvedValue(sampleStatus);
  });

  it('shows worktree-scoped fields when worktree is resolved', async () => {
    const program = createStatusProgram();
    await program.parseAsync(['node', 'cf', 'status']);

    const output = vi.mocked(console.log).mock.calls.map((c) => c[0]).join('\n');
    // Worktree overlay should surface worktree fields, not cleared project-level fields
    expect(output).toContain('183-slice.worktree-cli-commands');
    expect(output).toContain('183-tasks.worktree-cli-commands');
    expect(output).toContain('180-arch.initiative-context-worktree');
    expect(output).toContain('180-slices.initiative-context-worktree');
  });

  it('does not show cleared project-level fields when worktree overlay is applied', async () => {
    const program = createStatusProgram();
    await program.parseAsync(['node', 'cf', 'status']);

    const output = vi.mocked(console.log).mock.calls.map((c) => c[0]).join('\n');
    // Project-level fields are empty strings; the overlay must replace them
    // "Not set" would appear for fields that remained empty after overlay
    const archLine = output.split('\n').find((l) => l.includes('Arch:'));
    expect(archLine).toBeDefined();
    expect(archLine).not.toContain('Not set');
  });

  it('shows dedicated Worktree line with name and range', async () => {
    const program = createStatusProgram();
    await program.parseAsync(['node', 'cf', 'status']);

    const output = vi.mocked(console.log).mock.calls.map((c) => c[0]).join('\n');
    expect(output).toContain('Worktree:');
    expect(output).toContain('Feature A');
    expect(output).toContain('[100-199]');
    // Project line should NOT contain worktree parenthetical
    expect(output).not.toContain('from worktree "Feature A"');
  });

  it('includes full worktree object in JSON output', async () => {
    const program = createStatusProgram();
    await program.parseAsync(['node', 'cf', 'status', '--json']);

    const raw = vi.mocked(process.stdout.write).mock.calls[0]?.[0] as string;
    const parsed = JSON.parse(raw);
    expect(parsed.worktree).toEqual(expect.objectContaining({
      id: 'wt_001',
      name: 'Feature A',
      indexRange: [100, 199],
    }));
  });

  it('includes resolutionSource "worktree" in JSON output', async () => {
    const program = createStatusProgram();
    await program.parseAsync(['node', 'cf', 'status', '--json']);

    const raw = vi.mocked(process.stdout.write).mock.calls[0]?.[0] as string;
    const parsed = JSON.parse(raw);
    expect(parsed.resolutionSource).toBe('worktree');
  });

  it('passes overlaid project to WorkflowNavigator.getStatus', async () => {
    const program = createStatusProgram();
    await program.parseAsync(['node', 'cf', 'status']);

    // getStatus should receive the overlaid project, not the raw one with empty fields
    const projectArg = mockGetStatus.mock.calls[0]?.[0];
    expect(projectArg.fileSlice).toBe('183-slice.worktree-cli-commands');
    expect(projectArg.fileTasks).toBe('183-tasks.worktree-cli-commands');
    expect(projectArg.fileArch).toBe('180-arch.initiative-context-worktree');
    expect(projectArg.fileSlicePlan).toBe('180-slices.initiative-context-worktree');
    expect(projectArg.developmentPhase).toBe('Phase 6: Implementation');
  });
});

// ── cf status — no worktree (source: cwd) ─────────────────────────────────────

describe('cf status — no worktree resolved', () => {
  const projectWithOwnFields = {
    ...sampleProject,
    developmentPhase: 'Phase 4: Slice Design',
    instruction: 'Phase 4: Slice Design',
    fileSlice: '050-slice.core-auth',
    fileTasks: '050-tasks.core-auth',
    fileArch: '050-arch.core-system',
    fileSlicePlan: '050-slices.core',
    worktrees: [],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);

    vi.mocked(resolveProjectWorktree).mockResolvedValue({
      id: 'proj_001',
      source: 'cwd',
    });
    mockGetById.mockResolvedValue({ ...projectWithOwnFields });
    mockGetStatus.mockResolvedValue({
      ...sampleStatus,
      phase: 'Phase 4: Slice Design',
    });
  });

  it('shows project-level fields when no worktree is resolved', async () => {
    const program = createStatusProgram();
    await program.parseAsync(['node', 'cf', 'status']);

    const output = vi.mocked(console.log).mock.calls.map((c) => c[0]).join('\n');
    expect(output).toContain('050-slice.core-auth');
    expect(output).toContain('050-tasks.core-auth');
    expect(output).toContain('050-arch.core-system');
    expect(output).toContain('050-slices.core');
  });

  it('shows CWD source label and no Worktree line', async () => {
    const program = createStatusProgram();
    await program.parseAsync(['node', 'cf', 'status']);

    const output = vi.mocked(console.log).mock.calls.map((c) => c[0]).join('\n');
    expect(output).toContain('from CWD');
    expect(output).not.toContain('from worktree');
    expect(output).not.toContain('Worktree:');
  });

  it('does not include worktree key in JSON output', async () => {
    const program = createStatusProgram();
    await program.parseAsync(['node', 'cf', 'status', '--json']);

    const raw = vi.mocked(process.stdout.write).mock.calls[0]?.[0] as string;
    const parsed = JSON.parse(raw);
    expect(parsed.worktree).toBeUndefined();
    expect(parsed.resolutionSource).toBe('cwd');
  });

  it('passes unmodified project to WorkflowNavigator.getStatus', async () => {
    const program = createStatusProgram();
    await program.parseAsync(['node', 'cf', 'status']);

    const projectArg = mockGetStatus.mock.calls[0]?.[0];
    expect(projectArg.fileSlice).toBe('050-slice.core-auth');
    expect(projectArg.fileArch).toBe('050-arch.core-system');
  });
});

// ── cf build — worktree overlay ───────────────────────────────────────────────

describe('cf build — worktree overlay', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);

    vi.mocked(resolveProjectWorktree).mockResolvedValue({
      id: 'proj_001',
      source: 'worktree',
      worktreeId: 'wt_001',
    });
    mockGetById.mockResolvedValue({ ...sampleProject });
    mockGenerateContextFromProject.mockResolvedValue('worktree context output');
  });

  it('passes overlaid project to generateContextFromProject', async () => {
    const program = createBuildProgram();
    await program.parseAsync(['node', 'cf', 'build']);

    const projectArg = mockGenerateContextFromProject.mock.calls[0]?.[0];
    expect(projectArg.fileSlice).toBe('183-slice.worktree-cli-commands');
    expect(projectArg.fileTasks).toBe('183-tasks.worktree-cli-commands');
    expect(projectArg.fileArch).toBe('180-arch.initiative-context-worktree');
    expect(projectArg.fileSlicePlan).toBe('180-slices.initiative-context-worktree');
    expect(projectArg.developmentPhase).toBe('Phase 6: Implementation');
  });

  it('does not use cleared project-level fields when worktree overlay is applied', async () => {
    const program = createBuildProgram();
    await program.parseAsync(['node', 'cf', 'build']);

    const projectArg = mockGenerateContextFromProject.mock.calls[0]?.[0];
    // The raw project has empty strings; overlay must have replaced them
    expect(projectArg.fileSlice).not.toBe('');
    expect(projectArg.fileArch).not.toBe('');
  });

  it('CLI overrides are applied on top of worktree overlay', async () => {
    const program = createBuildProgram();
    await program.parseAsync(['node', 'cf', 'build', '--slice', '999-slice.override']);

    const projectArg = mockGenerateContextFromProject.mock.calls[0]?.[0];
    // Explicit CLI flag beats both project and worktree values
    expect(projectArg.fileSlice).toBe('999-slice.override');
    // Other worktree fields remain from overlay
    expect(projectArg.fileArch).toBe('180-arch.initiative-context-worktree');
  });

  it('writes generated context to stdout', async () => {
    const program = createBuildProgram();
    await program.parseAsync(['node', 'cf', 'build']);

    const output = vi.mocked(process.stdout.write).mock.calls.map((c) => c[0]).join('');
    expect(output).toBe('worktree context output');
  });
});

// ── cf build — no worktree (source: cwd) ─────────────────────────────────────

describe('cf build — no worktree resolved', () => {
  const projectWithOwnFields = {
    ...sampleProject,
    developmentPhase: 'Phase 4: Slice Design',
    instruction: 'Phase 4: Slice Design',
    fileSlice: '050-slice.core-auth',
    fileTasks: '050-tasks.core-auth',
    fileArch: '050-arch.core-system',
    fileSlicePlan: '050-slices.core',
    worktrees: [],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);

    vi.mocked(resolveProjectWorktree).mockResolvedValue({
      id: 'proj_001',
      source: 'cwd',
    });
    mockGetById.mockResolvedValue({ ...projectWithOwnFields });
    mockGenerateContextFromProject.mockResolvedValue('project context output');
  });

  it('passes unmodified project to generateContextFromProject', async () => {
    const program = createBuildProgram();
    await program.parseAsync(['node', 'cf', 'build']);

    const projectArg = mockGenerateContextFromProject.mock.calls[0]?.[0];
    expect(projectArg.fileSlice).toBe('050-slice.core-auth');
    expect(projectArg.fileTasks).toBe('050-tasks.core-auth');
    expect(projectArg.fileArch).toBe('050-arch.core-system');
    expect(projectArg.developmentPhase).toBe('Phase 4: Slice Design');
  });

  it('writes generated context to stdout', async () => {
    const program = createBuildProgram();
    await program.parseAsync(['node', 'cf', 'build']);

    const output = vi.mocked(process.stdout.write).mock.calls.map((c) => c[0]).join('');
    expect(output).toBe('project context output');
  });
});

// ── findProjectByCwd — CWD tiebreaker (projectPath vs worktreePath) ───────────
//
// This suite tests the tiebreaker logic in findProjectByCwd directly via the
// actual (un-mocked) implementation. Since the @context-forge/core/node mock
// above only covers class constructors and not the standalone findProjectByCwd
// from utils/project.js, we import and exercise it directly.

describe('findProjectByCwd — same-length path tiebreaker', () => {
  // These tests exercise the real findProjectByCwd so we must call it via a
  // store mock, not via the Commander program.

  it('worktree path match wins over project root match when paths are equal length', async () => {
    // Arrange: projectPath and worktreePath are both 16 characters (/repos/same-dir)
    // so longest-path sort produces a tie; tiebreaker must prefer the worktree entry.
    const { findProjectByCwd } = await import('../../src/utils/project.js');

    const project = {
      id: 'proj_001',
      name: 'test-project',
      projectPath: '/repos/same-dir',
      worktrees: [
        {
          id: 'wt_001',
          name: 'Feature A',
          worktreePath: '/repos/same-dir',
        },
      ],
    };

    const store = {
      getAll: vi.fn().mockResolvedValue([project]),
      getById: vi.fn(),
    } as never;

    vi.spyOn(process, 'cwd').mockReturnValue('/repos/same-dir');

    const result = await findProjectByCwd(store);

    vi.restoreAllMocks();

    expect(result?.worktreeId).toBe('wt_001');
    expect(result?.project.id).toBe('proj_001');
  });

  it('longer project path beats shorter worktree path (no tiebreaker needed)', async () => {
    const { findProjectByCwd } = await import('../../src/utils/project.js');

    const project = {
      id: 'proj_001',
      name: 'test-project',
      projectPath: '/repos/project/deep-subdir',
      worktrees: [
        {
          id: 'wt_001',
          name: 'Feature A',
          worktreePath: '/repos/project',
        },
      ],
    };

    const store = {
      getAll: vi.fn().mockResolvedValue([project]),
      getById: vi.fn(),
    } as never;

    vi.spyOn(process, 'cwd').mockReturnValue('/repos/project/deep-subdir/src');

    const result = await findProjectByCwd(store);

    vi.restoreAllMocks();

    // Project path is longer — worktreeId should NOT be set
    expect(result?.worktreeId).toBeUndefined();
    expect(result?.project.id).toBe('proj_001');
  });
});
