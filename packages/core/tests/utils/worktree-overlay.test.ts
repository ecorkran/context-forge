import { describe, it, expect } from 'vitest';
import { resolveWorktreeForPath } from '../../src/utils/worktree-overlay.js';
import type { ProjectData } from '../../src/types/index.js';
import type { WorktreeContext } from '../../src/types/worktree.js';

function makeWorktree(overrides: Partial<WorktreeContext> & { id: string }): WorktreeContext {
  return {
    name: `wt-${overrides.id}`,
    indexRange: [0, 999],
    ...overrides,
  };
}

function makeProject(overrides: Partial<ProjectData> = {}): ProjectData {
  return {
    id: 'p1',
    name: 'demo',
    template: 'default',
    projectPath: '/repo',
    ...overrides,
  };
}

describe('resolveWorktreeForPath', () => {
  it('matches a path inside a registered worktree', () => {
    const project = makeProject({
      worktrees: [makeWorktree({ id: 'wt_a', worktreePath: '/wt/alpha' })],
    });

    const match = resolveWorktreeForPath(project, '/wt/alpha/docs/file.md');

    expect(match).toEqual({ worktreeId: 'wt_a', name: 'wt-wt_a', rootPath: '/wt/alpha' });
  });

  it('matches the worktree root path itself, not just paths beneath it', () => {
    const project = makeProject({
      worktrees: [makeWorktree({ id: 'wt_a', worktreePath: '/wt/alpha' })],
    });

    expect(resolveWorktreeForPath(project, '/wt/alpha')?.worktreeId).toBe('wt_a');
  });

  it('matches the project root when no worktree owns the path', () => {
    const project = makeProject({
      worktrees: [makeWorktree({ id: 'wt_a', worktreePath: '/wt/alpha' })],
    });

    const match = resolveWorktreeForPath(project, '/repo/project-documents/user/x.md');

    expect(match).toEqual({ rootPath: '/repo' });
    expect(match?.worktreeId).toBeUndefined();
  });

  it('returns null for a path outside everything', () => {
    const project = makeProject({
      worktrees: [makeWorktree({ id: 'wt_a', worktreePath: '/wt/alpha' })],
    });

    expect(resolveWorktreeForPath(project, '/somewhere/else/file.md')).toBeNull();
  });

  it('returns null when the project has no projectPath and no worktree matches', () => {
    const project = makeProject({ projectPath: undefined, worktrees: [] });

    expect(resolveWorktreeForPath(project, '/repo/file.md')).toBeNull();
  });

  it('prefers the longest root when worktree paths nest', () => {
    const project = makeProject({
      worktrees: [
        makeWorktree({ id: 'outer', worktreePath: '/wt' }),
        makeWorktree({ id: 'inner', worktreePath: '/wt/alpha/deep' }),
        makeWorktree({ id: 'middle', worktreePath: '/wt/alpha' }),
      ],
    });

    expect(resolveWorktreeForPath(project, '/wt/alpha/deep/file.md')?.worktreeId).toBe('inner');
    expect(resolveWorktreeForPath(project, '/wt/alpha/other.md')?.worktreeId).toBe('middle');
    expect(resolveWorktreeForPath(project, '/wt/loose.md')?.worktreeId).toBe('outer');
  });

  it('prefers a nested worktree over the project root containing it', () => {
    const project = makeProject({
      projectPath: '/repo',
      worktrees: [makeWorktree({ id: 'nested', worktreePath: '/repo/worktrees/alpha' })],
    });

    expect(resolveWorktreeForPath(project, '/repo/worktrees/alpha/file.md')?.worktreeId).toBe(
      'nested',
    );
  });

  it('prefers the worktree over the project root when both roots are identical', () => {
    // The migrated "default" worktree shares the project's path exactly.
    const project = makeProject({
      projectPath: '/repo',
      worktrees: [makeWorktree({ id: 'default', worktreePath: '/repo' })],
    });

    expect(resolveWorktreeForPath(project, '/repo/file.md')?.worktreeId).toBe('default');
  });

  it('skips a worktree with no worktreePath', () => {
    const project = makeProject({
      projectPath: undefined,
      worktrees: [makeWorktree({ id: 'pathless' })],
    });

    expect(resolveWorktreeForPath(project, '/anywhere/file.md')).toBeNull();
  });

  it('tolerates a trailing slash on a stored root path', () => {
    const project = makeProject({
      worktrees: [makeWorktree({ id: 'wt_a', worktreePath: '/wt/alpha/' })],
    });

    expect(resolveWorktreeForPath(project, '/wt/alpha/file.md')?.worktreeId).toBe('wt_a');
    expect(resolveWorktreeForPath(project, '/wt/alpha')?.worktreeId).toBe('wt_a');
  });

  it('does not match a sibling directory that merely shares a string prefix', () => {
    const project = makeProject({
      projectPath: undefined,
      worktrees: [makeWorktree({ id: 'wt_a', worktreePath: '/wt/alpha' })],
    });

    // "/wt/alpha-old" starts with "/wt/alpha" as a string but is not inside it.
    expect(resolveWorktreeForPath(project, '/wt/alpha-old/file.md')).toBeNull();
    expect(resolveWorktreeForPath(project, '/wt/alphabet')).toBeNull();
  });

  it('does not let a prefix-sharing sibling outrank the real owner', () => {
    const project = makeProject({
      projectPath: '/repo',
      worktrees: [makeWorktree({ id: 'decoy', worktreePath: '/repo/docs-archive' })],
    });

    expect(resolveWorktreeForPath(project, '/repo/docs/file.md')).toEqual({ rootPath: '/repo' });
  });
});
