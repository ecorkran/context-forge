import { describe, it, expect, vi, beforeEach } from 'vitest';
import { propagationTargets } from '../../src/commands/worktreePropagation.js';

const mockExistsSync = vi.fn();

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    default: { ...actual, existsSync: (...args: unknown[]) => mockExistsSync(...args) },
    existsSync: (...args: unknown[]) => mockExistsSync(...args),
  };
});

const sampleProject = { id: 'proj_001', name: 'test-project', projectPath: '/tmp/test' };
const rootWorktree = { id: 'wt_default', name: 'default', isDefault: true, worktreePath: '/tmp/test' };
const feature = { id: 'wt_001', name: 'feature', worktreePath: '/tmp/wt1' };

const ids = (project: Parameters<typeof propagationTargets>[0]): string[] =>
  propagationTargets(project).map((wt) => wt.id);

describe('propagationTargets', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExistsSync.mockReturnValue(true);
  });

  it('lists registered worktrees whose path exists', () => {
    expect(ids({ ...sampleProject, worktrees: [feature] })).toEqual(['wt_001']);
  });

  it('skips a worktree whose path does not exist', () => {
    mockExistsSync.mockReturnValue(false);
    expect(ids({ ...sampleProject, worktrees: [feature] })).toEqual([]);
  });

  it('is empty with no registered worktrees', () => {
    expect(ids(sampleProject)).toEqual([]);
  });

  it('skips a "default" worktree whose path is the project root, keeping real ones', () => {
    expect(ids({ ...sampleProject, worktrees: [rootWorktree, feature] })).toEqual(['wt_001']);
  });

  it('ignores isDefault: only the root path excludes a worktree', () => {
    // Regression guard (slice 934): the marker must not change which worktrees receive output.
    const marked = { ...feature, isDefault: true };
    expect(ids({ ...sampleProject, worktrees: [{ ...rootWorktree, isDefault: false }, marked] })).toEqual(['wt_001']);
  });
});
