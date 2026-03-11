import { describe, it, expect, vi, beforeEach } from 'vitest';
import { parseWorktreeListOutput, GitWorktreeDiscovery } from '../../src/git/GitWorktreeDiscovery.js';

// ---------------------------------------------------------------------------
// parseWorktreeListOutput — pure function, no git calls
// ---------------------------------------------------------------------------

const MULTI_WORKTREE_OUTPUT = `worktree /Users/dev/repos/project
HEAD abc123def456abc123def456abc123def456abc1
branch refs/heads/main

worktree /Users/dev/repos/project-api
HEAD def789abc012def789abc012def789abc012def7
branch refs/heads/feature/100-api

worktree /Users/dev/repos/project-data
HEAD 111222333444111222333444111222333444111a
detached

`;

const SINGLE_WORKTREE_OUTPUT = `worktree /Users/dev/repos/project
HEAD abc123def456abc123def456abc123def456abc1
branch refs/heads/main

`;

const BARE_ENTRY_OUTPUT = `worktree /Users/dev/repos/project.git
HEAD abc123def456abc123def456abc123def456abc1
branch refs/heads/main
bare

worktree /Users/dev/repos/project-linked
HEAD def789abc012def789abc012def789abc012def7
branch refs/heads/feature/foo

`;

const PRUNABLE_ENTRY_OUTPUT = `worktree /Users/dev/repos/project
HEAD abc123def456abc123def456abc123def456abc1
branch refs/heads/main

worktree /Users/dev/repos/project-stale
HEAD 999888777666999888777666999888777666999a
branch refs/heads/stale-branch
prunable gitdir file points to non-existent location

`;

describe('parseWorktreeListOutput', () => {
  it('parses multi-worktree output correctly', () => {
    const result = parseWorktreeListOutput(MULTI_WORKTREE_OUTPUT);
    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({
      path: '/Users/dev/repos/project',
      head: 'abc123def456abc123def456abc123def456abc1',
      branch: 'refs/heads/main',
      bare: false,
    });
    expect(result[1]).toEqual({
      path: '/Users/dev/repos/project-api',
      head: 'def789abc012def789abc012def789abc012def7',
      branch: 'refs/heads/feature/100-api',
      bare: false,
    });
    expect(result[2]).toEqual({
      path: '/Users/dev/repos/project-data',
      head: '111222333444111222333444111222333444111a',
      branch: undefined,
      bare: false,
    });
  });

  it('parses single worktree (main only)', () => {
    const result = parseWorktreeListOutput(SINGLE_WORKTREE_OUTPUT);
    expect(result).toHaveLength(1);
    expect(result[0].path).toBe('/Users/dev/repos/project');
    expect(result[0].branch).toBe('refs/heads/main');
  });

  it('skips bare entries', () => {
    const result = parseWorktreeListOutput(BARE_ENTRY_OUTPUT);
    expect(result).toHaveLength(1);
    expect(result[0].path).toBe('/Users/dev/repos/project-linked');
  });

  it('skips prunable entries', () => {
    const result = parseWorktreeListOutput(PRUNABLE_ENTRY_OUTPUT);
    expect(result).toHaveLength(1);
    expect(result[0].path).toBe('/Users/dev/repos/project');
  });

  it('sets branch to undefined for detached HEAD', () => {
    const result = parseWorktreeListOutput(MULTI_WORKTREE_OUTPUT);
    const detached = result.find((w) => w.path.endsWith('project-data'));
    expect(detached?.branch).toBeUndefined();
  });

  it('returns empty array for empty string', () => {
    expect(parseWorktreeListOutput('')).toEqual([]);
  });

  it('handles trailing newlines correctly', () => {
    const withTrailing = SINGLE_WORKTREE_OUTPUT + '\n\n\n';
    const result = parseWorktreeListOutput(withTrailing);
    expect(result).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// GitWorktreeDiscovery — mock gitExec
// ---------------------------------------------------------------------------

vi.mock('../../src/guides/gitExec.js', () => ({
  gitExec: vi.fn(),
}));

import { gitExec } from '../../src/guides/gitExec.js';
const mockGitExec = vi.mocked(gitExec);

describe('GitWorktreeDiscovery.listWorktrees', () => {
  const discovery = new GitWorktreeDiscovery();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns WorktreeInfo[] on successful parse', async () => {
    mockGitExec.mockResolvedValue({ stdout: MULTI_WORKTREE_OUTPUT, stderr: '' });
    const result = await discovery.listWorktrees('/some/repo');
    expect(result).toHaveLength(3);
    expect(mockGitExec).toHaveBeenCalledWith(['worktree', 'list', '--porcelain'], '/some/repo');
  });

  it('returns empty array when git is not available (throws)', async () => {
    mockGitExec.mockRejectedValue(new Error('git: command not found'));
    const result = await discovery.listWorktrees('/some/dir');
    expect(result).toEqual([]);
  });

  it('returns empty array when not a git repo (throws)', async () => {
    mockGitExec.mockRejectedValue(new Error('fatal: not a git repository'));
    const result = await discovery.listWorktrees('/not/a/repo');
    expect(result).toEqual([]);
  });
});
