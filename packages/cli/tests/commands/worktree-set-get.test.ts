import { describe, it, expect, vi, beforeEach } from 'vitest';
import { projectSetAction, projectGetAction } from '../../src/commands/project.js';

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockGetAll = vi.fn();
const mockGetById = vi.fn();
const mockUpdate = vi.fn();
const mockUpdateWorktree = vi.fn();
const mockResolveFileByIndex = vi.fn();

vi.mock('@context-forge/core/node', () => ({
  FileProjectStore: vi.fn().mockImplementation(() => ({
    getAll: mockGetAll,
    getById: mockGetById,
    update: mockUpdate,
  })),
  ConfigManager: vi.fn().mockImplementation(() => ({
    get: vi.fn().mockResolvedValue({ value: '' }),
  })),
  WorktreeService: vi.fn().mockImplementation(() => ({
    updateWorktree: mockUpdateWorktree,
  })),
  resolveFileByIndex: (...args: unknown[]) => mockResolveFileByIndex(...args),
  resolveArtifactPath: vi.fn(),
  deriveArtifactStem: vi.fn(),
  parseSlicePlan: vi.fn(),
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
  archDoc: '180-arch.md',
  slicePlan: '180-slices.md',
  developmentPhase: 'Phase 4: Slice Design',
  instruction: 'Phase 4: Slice Design',
  activeSlice: '183-slice.worktree-cli-commands',
  activeTaskFile: '183-tasks.worktree-cli-commands',
};

const sampleProject = {
  id: 'proj_001',
  name: 'test-project',
  projectPath: '/tmp/test',
  fileSlice: '100-slice.auth',
  fileTasks: '100-tasks.auth',
  developmentPhase: 'Phase 6: Implementation',
  instruction: 'implementation',
  workType: 'continue' as const,
  worktrees: [sampleWorktree],
};

// ── projectSetAction — worktree-scoped ────────────────────────────────────────

describe('projectSetAction — worktree-scoped', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(resolveProjectWorktree).mockResolvedValue({
      id: 'proj_001',
      source: 'worktree',
      worktreeId: 'wt_001',
    });
    mockGetById.mockResolvedValue({ ...sampleProject });
    mockUpdateWorktree.mockResolvedValue(sampleWorktree);
    mockResolveFileByIndex.mockImplementation(() => { throw new Error('not found'); });
  });

  it('routes fileSlice to WorktreeService.updateWorktree with activeSlice', async () => {
    await projectSetAction('fileSlice', '200-slice.new', { project: 'test-project' });
    expect(mockUpdateWorktree).toHaveBeenCalledWith('proj_001', 'wt_001', { activeSlice: '200-slice.new' });
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('routes developmentPhase to WorktreeService with auto-set instruction', async () => {
    await projectSetAction('phase', 'Phase 5: Task Breakdown', { project: 'test-project' });
    expect(mockUpdateWorktree).toHaveBeenCalledWith('proj_001', 'wt_001', {
      developmentPhase: 'Phase 5: Task Breakdown',
      instruction: 'Phase 5: Task Breakdown',
    });
  });

  it('routes fileArch to WorktreeService with archDoc', async () => {
    await projectSetAction('fileArch', '180-arch.new.md', { project: 'test-project' });
    expect(mockUpdateWorktree).toHaveBeenCalledWith('proj_001', 'wt_001', { archDoc: '180-arch.new.md' });
  });

  it('auto-sets slicePlan when archDoc changes on worktree', async () => {
    mockResolveFileByIndex.mockImplementation((_path: unknown, field: unknown) => {
      if (field === 'fileSlicePlan') return '180-slices.derived.md';
      throw new Error('not found');
    });
    await projectSetAction('fileArch', '180-arch.new.md', { project: 'test-project' });
    // First call: archDoc update
    expect(mockUpdateWorktree).toHaveBeenCalledWith('proj_001', 'wt_001', { archDoc: '180-arch.new.md' });
    // Second call: slicePlan auto-set
    expect(mockUpdateWorktree).toHaveBeenCalledWith('proj_001', 'wt_001', { slicePlan: '180-slices.derived.md' });
  });

  it('auto-sets activeTaskFile when activeSlice changes on worktree', async () => {
    mockResolveFileByIndex.mockImplementation((_path: unknown, field: unknown) => {
      if (field === 'fileTasks') return '200-tasks.feature.md';
      throw new Error('not found');
    });
    await projectSetAction('fileSlice', '200-slice.feature.md', { project: 'test-project' });
    // Second call: activeTaskFile auto-set
    expect(mockUpdateWorktree).toHaveBeenCalledWith('proj_001', 'wt_001', { activeTaskFile: '200-tasks.feature.md' });
  });

  it('prints confirmation with worktree context name', async () => {
    await projectSetAction('fileSlice', '200-slice.new', { project: 'test-project' });
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('on worktree context "Feature A"'));
  });
});

// ── projectSetAction — project-scoped field with worktreeId ───────────────────

describe('projectSetAction — project-scoped field with worktreeId', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.mocked(resolveProjectWorktree).mockResolvedValue({
      id: 'proj_001',
      source: 'worktree',
      worktreeId: 'wt_001',
    });
    mockGetById.mockResolvedValue({ ...sampleProject });
  });

  it('routes name update to store.update even with worktree resolved', async () => {
    await projectSetAction('name', 'renamed', { project: 'test-project' });
    expect(mockUpdate).toHaveBeenCalledWith('proj_001', { name: 'renamed' });
    expect(mockUpdateWorktree).not.toHaveBeenCalled();
  });
});

// ── projectSetAction — --project-level flag ───────────────────────────────────

describe('projectSetAction — --project-level flag', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.mocked(resolveProjectWorktree).mockResolvedValue({
      id: 'proj_001',
      source: 'worktree',
      worktreeId: 'wt_001',
    });
    mockGetById.mockResolvedValue({ ...sampleProject });
  });

  it('routes fileSlice to store.update with --project-level', async () => {
    await projectSetAction('fileSlice', '200-slice.new', { project: 'test-project', projectLevel: true });
    expect(mockUpdate).toHaveBeenCalledWith('proj_001', { fileSlice: '200-slice.new' });
    expect(mockUpdateWorktree).not.toHaveBeenCalled();
  });
});

// ── projectSetAction — no worktree (backwards compatibility) ──────────────────

describe('projectSetAction — no worktree', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.mocked(resolveProjectWorktree).mockResolvedValue({
      id: 'proj_001',
      source: 'cwd',
    });
    mockGetById.mockResolvedValue({ ...sampleProject, worktrees: [] });
  });

  it('routes fileSlice to store.update when no worktree resolved', async () => {
    await projectSetAction('fileSlice', '200-slice.new', { project: 'test-project' });
    expect(mockUpdate).toHaveBeenCalledWith('proj_001', { fileSlice: '200-slice.new' });
    expect(mockUpdateWorktree).not.toHaveBeenCalled();
  });
});

// ── projectGetAction — worktree resolved ──────────────────────────────────────

describe('projectGetAction — worktree resolved', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    vi.mocked(resolveProjectWorktree).mockResolvedValue({
      id: 'proj_001',
      source: 'worktree',
      worktreeId: 'wt_001',
    });
    mockGetById.mockResolvedValue({ ...sampleProject });
  });

  it('shows worktree header with name and range', async () => {
    await projectGetAction({ project: 'test-project' });
    const calls = vi.mocked(console.log).mock.calls.map((c) => String(c[0]));
    const joined = calls.join('\n');
    expect(joined).toContain('Worktree');
    expect(joined).toContain('Feature A');
    expect(joined).toContain('100-199');
  });

  it('overlays worktree-scoped fields in output', async () => {
    await projectGetAction({ project: 'test-project' });
    const calls = vi.mocked(console.log).mock.calls.map((c) => String(c[0]));
    const joined = calls.join('\n');
    // Worktree has activeSlice = '183-slice.worktree-cli-commands'
    expect(joined).toContain('183-slice.worktree-cli-commands');
  });

  it('includes worktree key in JSON output', async () => {
    await projectGetAction({ project: 'test-project', json: true });
    const output = vi.mocked(process.stdout.write).mock.calls[0]?.[0] as string;
    const parsed = JSON.parse(output);
    expect(parsed.worktree).toBeDefined();
    expect(parsed.worktree.name).toBe('Feature A');
  });
});

// ── projectGetAction — --project-level flag ───────────────────────────────────

describe('projectGetAction — --project-level flag', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.mocked(resolveProjectWorktree).mockResolvedValue({
      id: 'proj_001',
      source: 'worktree',
      worktreeId: 'wt_001',
    });
    mockGetById.mockResolvedValue({ ...sampleProject });
  });

  it('skips worktree overlay when --project-level set', async () => {
    await projectGetAction({ project: 'test-project', projectLevel: true });
    const calls = vi.mocked(console.log).mock.calls.map((c) => String(c[0]));
    const joined = calls.join('\n');
    // Should NOT show worktree header
    expect(joined).not.toContain('Worktree');
    // Should show project-level slice, not worktree's
    expect(joined).toContain('100-slice.auth');
  });
});

// ── projectGetAction — no worktree ────────────────────────────────────────────

describe('projectGetAction — no worktree', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.mocked(resolveProjectWorktree).mockResolvedValue({
      id: 'proj_001',
      source: 'cwd',
    });
    mockGetById.mockResolvedValue({ ...sampleProject, worktrees: [] });
  });

  it('shows project fields without worktree header', async () => {
    await projectGetAction({ project: 'test-project' });
    const calls = vi.mocked(console.log).mock.calls.map((c) => String(c[0]));
    const joined = calls.join('\n');
    expect(joined).not.toContain('Worktree');
    expect(joined).toContain('100-slice.auth');
  });
});
