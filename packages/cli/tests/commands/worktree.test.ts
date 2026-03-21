import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Command } from 'commander';
import { registerWorktreeCommand } from '../../src/commands/worktree.js';

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockGetById = vi.fn();
const mockUpdate = vi.fn();
const mockAddWorktree = vi.fn();
const mockRemoveWorktree = vi.fn();
const mockUpdateWorktree = vi.fn();
const mockFindOverlaps = vi.fn().mockResolvedValue([]);
const mockValidateWorktreePaths = vi.fn().mockResolvedValue([]);
const mockListGitWorktrees = vi.fn().mockResolvedValue([]);
const mockResolveFileByIndex = vi.fn().mockImplementation(() => { throw new Error('not found'); });

vi.mock('@context-forge/core/node', () => ({
  FileProjectStore: vi.fn().mockImplementation(() => ({
    getAll: vi.fn().mockResolvedValue([]),
    getById: mockGetById,
    update: mockUpdate,
  })),
  WorktreeService: vi.fn().mockImplementation(() => ({
    addWorktree: mockAddWorktree,
    removeWorktree: mockRemoveWorktree,
    updateWorktree: mockUpdateWorktree,
    findOverlaps: mockFindOverlaps,
    validateWorktreePaths: mockValidateWorktreePaths,
  })),
  GitWorktreeDiscovery: vi.fn().mockImplementation(() => ({
    listWorktrees: mockListGitWorktrees,
  })),
  resolveFileByIndex: (...args: unknown[]) => mockResolveFileByIndex(...args),
}));

vi.mock('../../src/utils/project.js', () => ({
  resolveProjectWorktree: vi.fn().mockResolvedValue({ id: 'project_001', source: 'cwd' }),
  findWorktreeByNameOrId: vi.fn(),
}));

vi.mock('../../src/utils/confirm.js', () => ({
  askConfirmation: vi.fn().mockResolvedValue(true),
}));

import { resolveProjectWorktree, findWorktreeByNameOrId } from '../../src/utils/project.js';
import { askConfirmation } from '../../src/utils/confirm.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function createProgram(): Command {
  const program = new Command();
  program.exitOverride();
  registerWorktreeCommand(program);
  return program;
}

const baseProject = {
  id: 'project_001',
  name: 'test-project',
  projectPath: '/repos/test',
  worktrees: [] as unknown[],
};

const sampleWorktree = {
  id: 'wt_001',
  name: 'Feature A',
  indexRange: [100, 199] as [number, number],
  worktreePath: '/repos/test-feature',
  archDoc: '180-arch.md',
  slicePlan: '180-slices.md',
};

// ── cf worktree init ──────────────────────────────────────────────────────────

describe('cf worktree init', () => {
  let exitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    vi.mocked(resolveProjectWorktree).mockResolvedValue({ id: 'project_001', source: 'cwd' });
    mockGetById.mockResolvedValue({ ...baseProject });
    mockListGitWorktrees.mockResolvedValue([]);
    mockAddWorktree.mockResolvedValue({ worktree: sampleWorktree, migrated: false, overlaps: [] });
  });

  it('errors on bad range format', async () => {
    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'worktree', 'init', '--name', 'Feature A', '--range', 'bad']);
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Invalid range format'));
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('errors when range start > end', async () => {
    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'worktree', 'init', '--name', 'Feature A', '--range', '199-100']);
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('start must be <= end'));
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('warns and proceeds when git unavailable (empty list)', async () => {
    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'worktree', 'init', '--name', 'Feature A', '--range', '100-199']);
    expect(mockAddWorktree).toHaveBeenCalledWith('project_001', expect.objectContaining({
      name: 'Feature A',
      indexRange: [100, 199],
    }));
  });

  it('errors when path not in git worktree list', async () => {
    mockListGitWorktrees.mockResolvedValue([
      { path: '/repos/test', head: 'abc', branch: 'main', bare: false },
    ]);
    const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue('/repos/some-other-dir');
    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'worktree', 'init', '--name', 'Feature A', '--range', '100-199']);
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('not a registered git worktree'));
    expect(exitSpy).toHaveBeenCalledWith(1);
    cwdSpy.mockRestore();
  });

  it('calls addWorktree with correct args on success', async () => {
    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'worktree', 'init', '--name', 'Feature A', '--range', '100-199', '--path', '/repos/test']);
    expect(mockAddWorktree).toHaveBeenCalledWith('project_001', expect.objectContaining({
      name: 'Feature A',
      indexRange: [100, 199],
      worktreePath: '/repos/test',
    }));
  });

  it('prints migration notice when migrated is true', async () => {
    mockAddWorktree.mockResolvedValue({ worktree: sampleWorktree, migrated: true, overlaps: [] });
    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'worktree', 'init', '--name', 'Feature A', '--range', '100-199']);
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('migrated'));
  });

  it('prints overlap warning when overlaps exist', async () => {
    mockAddWorktree.mockResolvedValue({
      worktree: sampleWorktree,
      migrated: false,
      overlaps: [{
        existingWorktreeId: 'wt_000',
        existingWorktreeName: 'default',
        existingRange: [0, 199],
        overlapStart: 100,
        overlapEnd: 199,
      }],
    });
    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'worktree', 'init', '--name', 'Feature A', '--range', '100-199']);
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('overlap'));
  });

  it('auto-discovers archDoc when resolveFileByIndex succeeds', async () => {
    mockResolveFileByIndex.mockImplementationOnce(() => '100-arch.initiative.md');
    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'worktree', 'init', '--name', 'Feature A', '--range', '100-199']);
    expect(mockAddWorktree).toHaveBeenCalledWith('project_001', expect.objectContaining({
      archDoc: '100-arch.initiative.md',
    }));
  });

  it('init with -o flag passes override to addWorktree', async () => {
    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'worktree', 'init', '--name', 'Cross', '--range', '100-199', '-o']);
    expect(mockAddWorktree).toHaveBeenCalledWith('project_001', expect.objectContaining({
      override: true,
    }));
  });
});

// ── cf worktree list ──────────────────────────────────────────────────────────

describe('cf worktree list', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    vi.mocked(resolveProjectWorktree).mockResolvedValue({ id: 'project_001', source: 'cwd' });
  });

  it('prints empty state message when no worktrees', async () => {
    mockGetById.mockResolvedValue({ ...baseProject, worktrees: [] });
    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'worktree', 'list']);
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('No worktree contexts'));
  });

  it('renders table with worktrees', async () => {
    mockGetById.mockResolvedValue({ ...baseProject, worktrees: [sampleWorktree] });
    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'worktree', 'list']);
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Feature A'));
  });

  it('marks active worktree with * prefix in output', async () => {
    vi.mocked(resolveProjectWorktree).mockResolvedValue({ id: 'project_001', source: 'worktree', worktreeId: 'wt_001' });
    mockGetById.mockResolvedValue({ ...baseProject, worktrees: [sampleWorktree] });
    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'worktree', 'list']);
    const logCalls = vi.mocked(console.log).mock.calls.map((c) => String(c[0]));
    expect(logCalls.some((s) => s.includes('*'))).toBe(true);
  });

  it('shows dash for missing arch/plan', async () => {
    const noArchWorktree = { id: 'wt_001', name: 'No Arch', indexRange: [100, 199] as [number, number] };
    mockGetById.mockResolvedValue({ ...baseProject, worktrees: [noArchWorktree] });
    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'worktree', 'list']);
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('No Arch'));
  });

  it('outputs JSON when --json flag used', async () => {
    mockGetById.mockResolvedValue({ ...baseProject, worktrees: [sampleWorktree] });
    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'worktree', 'list', '--json']);
    expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('"worktrees"'));
    stdoutSpy.mockRestore();
  });

  it('shows (removed) suffix for stale worktree path', async () => {
    mockGetById.mockResolvedValue({ ...baseProject, worktrees: [sampleWorktree] });
    mockListGitWorktrees.mockResolvedValue([{ path: '/repos/test', head: 'abc', bare: false }]);
    mockValidateWorktreePaths.mockResolvedValue([{
      worktreeId: 'wt_001',
      worktreeName: 'Feature A',
      worktreePath: '/repos/test-feature',
      status: 'missing',
    }]);
    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'worktree', 'list']);
    const logCalls = vi.mocked(console.log).mock.calls.map((c) => String(c[0]));
    expect(logCalls.some((s) => s.includes('(removed)'))).toBe(true);
  });

  it('shows no suffix for valid worktree paths', async () => {
    mockGetById.mockResolvedValue({ ...baseProject, worktrees: [sampleWorktree] });
    mockListGitWorktrees.mockResolvedValue([{ path: '/repos/test-feature', head: 'abc', bare: false }]);
    mockValidateWorktreePaths.mockResolvedValue([{
      worktreeId: 'wt_001',
      worktreeName: 'Feature A',
      worktreePath: '/repos/test-feature',
      status: 'valid',
    }]);
    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'worktree', 'list']);
    const logCalls = vi.mocked(console.log).mock.calls.map((c) => String(c[0]));
    expect(logCalls.every((s) => !s.includes('(removed)'))).toBe(true);
  });

  it('works when git discovery fails (no suffix, no crash)', async () => {
    mockGetById.mockResolvedValue({ ...baseProject, worktrees: [sampleWorktree] });
    mockListGitWorktrees.mockRejectedValue(new Error('git not found'));
    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'worktree', 'list']);
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Feature A'));
  });

  it('shows [override] indicator for overridden worktrees', async () => {
    const overrideWorktree = { ...sampleWorktree, rangeOverride: true };
    mockGetById.mockResolvedValue({ ...baseProject, worktrees: [overrideWorktree] });
    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'worktree', 'list']);
    const logCalls = vi.mocked(console.log).mock.calls.map((c) => String(c[0]));
    expect(logCalls.some((s) => s.includes('[override]'))).toBe(true);
  });
});

// ── cf worktree update ────────────────────────────────────────────────────────

describe('cf worktree update', () => {
  let exitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    vi.mocked(resolveProjectWorktree).mockResolvedValue({ id: 'project_001', source: 'cwd' });
    mockGetById.mockResolvedValue({ ...baseProject, worktrees: [sampleWorktree] });
    mockUpdateWorktree.mockResolvedValue({ ...sampleWorktree, name: 'Renamed' });
    mockFindOverlaps.mockResolvedValue([]);
  });

  it('renames worktree by name', async () => {
    vi.mocked(findWorktreeByNameOrId).mockResolvedValue(sampleWorktree);
    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'worktree', 'update', 'Feature A', '--name', 'Renamed']);
    expect(mockUpdateWorktree).toHaveBeenCalledWith('project_001', 'wt_001', { name: 'Renamed' });
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('updated'));
  });

  it('changes range and shows overlap warning', async () => {
    vi.mocked(findWorktreeByNameOrId).mockResolvedValue(sampleWorktree);
    mockFindOverlaps.mockResolvedValue([{
      existingWorktreeId: 'wt_002',
      existingWorktreeName: 'Other',
      existingRange: [150, 249],
      overlapStart: 150,
      overlapEnd: 199,
    }]);
    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'worktree', 'update', 'Feature A', '--range', '150-249']);
    expect(mockUpdateWorktree).toHaveBeenCalledWith('project_001', 'wt_001', { indexRange: [150, 249] });
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('overlap'));
  });

  it('changes path and validates against git worktree list', async () => {
    vi.mocked(findWorktreeByNameOrId).mockResolvedValue(sampleWorktree);
    mockListGitWorktrees.mockResolvedValue([
      { path: '/repos/new-path', head: 'abc', branch: 'feature', bare: false },
    ]);
    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'worktree', 'update', 'Feature A', '--path', '/repos/new-path']);
    expect(mockUpdateWorktree).toHaveBeenCalledWith('project_001', 'wt_001', { worktreePath: '/repos/new-path' });
  });

  it('uses CWD-resolved worktreeId when nameOrId omitted', async () => {
    vi.mocked(resolveProjectWorktree).mockResolvedValue({ id: 'project_001', source: 'worktree', worktreeId: 'wt_001' });
    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'worktree', 'update', '--name', 'New Name']);
    expect(mockUpdateWorktree).toHaveBeenCalledWith('project_001', 'wt_001', { name: 'New Name' });
  });

  it('errors when no update options provided', async () => {
    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'worktree', 'update', 'Feature A']);
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('At least one update option'));
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('errors when worktree not found', async () => {
    vi.mocked(findWorktreeByNameOrId).mockResolvedValue(undefined);
    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'worktree', 'update', 'nonexistent', '--name', 'X']);
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('not found'));
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('update with -o flag passes rangeOverride in updates', async () => {
    vi.mocked(findWorktreeByNameOrId).mockResolvedValue(sampleWorktree);
    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'worktree', 'update', 'Feature A', '--range', '100-199', '-o']);
    expect(mockUpdateWorktree).toHaveBeenCalledWith('project_001', 'wt_001', expect.objectContaining({
      rangeOverride: true,
      indexRange: [100, 199],
    }));
  });
});

// ── cf worktree rm ────────────────────────────────────────────────────────────

describe('cf worktree rm', () => {
  let exitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    vi.mocked(resolveProjectWorktree).mockResolvedValue({ id: 'project_001', source: 'cwd' });
    mockGetById.mockResolvedValue({ ...baseProject, worktrees: [sampleWorktree] });
    mockRemoveWorktree.mockResolvedValue({ removed: sampleWorktree, migrated: false });
  });

  it('errors when worktree not found by name/id', async () => {
    vi.mocked(findWorktreeByNameOrId).mockResolvedValue(undefined);
    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'worktree', 'rm', 'nonexistent']);
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('not found'));
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('errors when no nameOrId and no resolved worktreeId', async () => {
    vi.mocked(resolveProjectWorktree).mockResolvedValue({ id: 'project_001', source: 'cwd' });
    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'worktree', 'rm']);
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('No worktree specified'));
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('uses CWD-resolved worktreeId when no nameOrId provided', async () => {
    vi.mocked(resolveProjectWorktree).mockResolvedValue({ id: 'project_001', source: 'worktree', worktreeId: 'wt_001' });
    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'worktree', 'rm', '--yes']);
    expect(mockRemoveWorktree).toHaveBeenCalledWith('project_001', 'wt_001');
  });

  it('skips confirmation with --yes flag', async () => {
    vi.mocked(findWorktreeByNameOrId).mockResolvedValue(sampleWorktree);
    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'worktree', 'rm', 'Feature A', '--yes']);
    expect(askConfirmation).not.toHaveBeenCalled();
    expect(mockRemoveWorktree).toHaveBeenCalledWith('project_001', 'wt_001');
  });

  it('calls askConfirmation and removes when confirmed', async () => {
    vi.mocked(findWorktreeByNameOrId).mockResolvedValue(sampleWorktree);
    vi.mocked(askConfirmation).mockResolvedValue(true);
    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'worktree', 'rm', 'Feature A']);
    expect(askConfirmation).toHaveBeenCalled();
    expect(mockRemoveWorktree).toHaveBeenCalled();
  });

  it('aborts without removing when confirmation denied', async () => {
    vi.mocked(findWorktreeByNameOrId).mockResolvedValue(sampleWorktree);
    vi.mocked(askConfirmation).mockResolvedValue(false);
    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'worktree', 'rm', 'Feature A']);
    expect(mockRemoveWorktree).not.toHaveBeenCalled();
    expect(console.log).toHaveBeenCalledWith('Cancelled.');
  });

  it('prints reverse migration notice when migrated is true', async () => {
    vi.mocked(findWorktreeByNameOrId).mockResolvedValue(sampleWorktree);
    mockRemoveWorktree.mockResolvedValue({ removed: sampleWorktree, migrated: true });
    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'worktree', 'rm', 'Feature A', '--yes']);
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('restored'));
  });

  it('prints success message on removal', async () => {
    vi.mocked(findWorktreeByNameOrId).mockResolvedValue(sampleWorktree);
    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'worktree', 'rm', 'Feature A', '--yes']);
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('removed'));
  });
});
