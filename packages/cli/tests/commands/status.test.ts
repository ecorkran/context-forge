import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Command } from 'commander';
import { registerStatusCommand } from '../../src/commands/status.js';

const mockGetAll = vi.fn();
const mockGetById = vi.fn();
const mockGetStatus = vi.fn();
const mockListGitWorktrees = vi.fn().mockResolvedValue([]);

vi.mock('@context-forge/core/node', () => ({
  FileProjectStore: vi.fn().mockImplementation(() => ({
    getAll: mockGetAll,
    getById: mockGetById,
  })),
  WorkflowNavigator: vi.fn().mockImplementation(() => ({
    getStatus: mockGetStatus,
  })),
  ConfigManager: vi.fn().mockImplementation(() => ({
    get: vi.fn().mockResolvedValue({ value: '' }),
  })),
  GitWorktreeDiscovery: vi.fn().mockImplementation(() => ({
    listWorktrees: mockListGitWorktrees,
  })),
  parseSlicePlan: vi.fn(),
  resolveArtifactPath: vi.fn(),
}));

const sampleProject = {
  id: 'proj_001',
  name: 'test-project',
  fileSlice: '100-slice.auth',
  fileTasks: '100-tasks.auth',
  fileArch: '100-arch.test-system',
  fileSlicePlan: '100-slices.test',
  dateProject: '20260307',
  developmentPhase: 'Phase 6: Implementation',
  workType: 'continue',
  projectPath: '/tmp/test',
};

const sampleStatus = {
  project: 'test-project',
  phase: 'Phase 6: Implementation',
  activeSlice: {
    name: 'auth',
    index: 100,
    status: 'in-implementation',
    taskProgress: { completed: 3, total: 5, inferredStatus: 'in-progress' },
  },
  slicePlan: { name: '100-slices.test.md', completed: 7, total: 10, entries: [] },
  summary: 'test-project — Phase 6 — slice 100 in-implementation (3/5 tasks)',
};

function createProgram(): Command {
  const program = new Command();
  program.exitOverride();
  registerStatusCommand(program);
  return program;
}

describe('cf status', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAll.mockResolvedValue([sampleProject]);
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
  });

  it('displays project, phase, slice, and task progress', async () => {
    mockGetById.mockResolvedValue(sampleProject);
    mockGetStatus.mockResolvedValue(sampleStatus);

    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'status', '--project', 'proj_001']);

    const output = vi.mocked(console.log).mock.calls.map((c) => c[0]).join('\n');
    expect(output).toContain('test-project');
    expect(output).toContain('20260307');
    expect(output).toContain('Phase 6');
    expect(output).toContain('100-arch.test-system');
    expect(output).toContain('100-slices.test');
    expect(output).toContain('100-slice.auth');
    expect(output).toContain('3/5 tasks');
  });

  it('outputs valid JSON with --json flag', async () => {
    mockGetById.mockResolvedValue(sampleProject);
    mockGetStatus.mockResolvedValue(sampleStatus);

    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'status', '--project', 'proj_001', '--json']);

    const raw = vi.mocked(process.stdout.write).mock.calls[0]?.[0] as string;
    const parsed = JSON.parse(raw);
    expect(parsed.project).toBe('test-project');
    expect(parsed.activeSlice.taskProgress.total).toBe(5);
  });

  it('shows slice plan summary when available', async () => {
    mockGetById.mockResolvedValue(sampleProject);
    mockGetStatus.mockResolvedValue(sampleStatus);

    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'status', '--project', 'proj_001']);

    const output = vi.mocked(console.log).mock.calls.map((c) => c[0]).join('\n');
    expect(output).toContain('7/10 slices');
  });

  it('shows resolution source label in terminal output', async () => {
    mockGetById.mockResolvedValue(sampleProject);
    mockGetStatus.mockResolvedValue(sampleStatus);

    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'status', '--project', 'proj_001']);

    const output = vi.mocked(console.log).mock.calls.map((c) => c[0]).join('\n');
    expect(output).toContain('--project flag');
  });

  it('includes resolutionSource in JSON output', async () => {
    mockGetById.mockResolvedValue(sampleProject);
    mockGetStatus.mockResolvedValue(sampleStatus);

    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'status', '--project', 'proj_001', '--json']);

    const raw = vi.mocked(process.stdout.write).mock.calls[0]?.[0] as string;
    const parsed = JSON.parse(raw);
    expect(parsed.resolutionSource).toBe('flag');
  });
});

describe('cf status first-run suggestion', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    // No project matches CWD and no default project → resolution fails
    mockGetAll.mockResolvedValue([sampleProject]);
    mockGetById.mockResolvedValue(undefined);
  });

  it('suggests cf worktree init when CWD is a git worktree of a known project', async () => {
    const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue('/tmp/test-feature');
    mockListGitWorktrees.mockResolvedValue([
      { path: '/tmp/test', head: 'abc', branch: 'refs/heads/main', bare: false },
      { path: '/tmp/test-feature', head: 'def', branch: 'refs/heads/feature/auth', bare: false },
    ]);

    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'status']);

    const output = vi.mocked(console.log).mock.calls.map((c) => String(c[0])).join('\n');
    expect(output).toContain('appears to be a git worktree');
    expect(output).toContain('cf worktree init');
    expect(output).toContain('auth'); // derived name from feature/auth branch
    cwdSpy.mockRestore();
  });

  it('shows standard error when CWD is not a git worktree', async () => {
    const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue('/some/random/dir');
    mockListGitWorktrees.mockResolvedValue([]);

    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'status']);

    const errOutput = vi.mocked(console.error).mock.calls.map((c) => String(c[0])).join('\n');
    expect(errOutput).toContain('No project specified');
    cwdSpy.mockRestore();
  });

  it('shows standard error when CWD is a worktree of an unknown project', async () => {
    const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue('/other/worktree');
    mockGetAll.mockResolvedValue([sampleProject]);
    mockListGitWorktrees.mockResolvedValue([
      { path: '/other/main', head: 'abc', branch: 'refs/heads/main', bare: false },
      { path: '/other/worktree', head: 'def', branch: 'refs/heads/feat', bare: false },
    ]);

    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'status']);

    const errOutput = vi.mocked(console.error).mock.calls.map((c) => String(c[0])).join('\n');
    expect(errOutput).toContain('No project specified');
    cwdSpy.mockRestore();
  });
});
