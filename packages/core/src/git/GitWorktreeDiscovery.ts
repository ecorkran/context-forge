import { gitExec } from '../guides/gitExec.js';
import type { WorktreeInfo } from '../types/git.js';

/**
 * Parse the output of `git worktree list --porcelain` into WorktreeInfo[].
 * Exported for direct unit testing with string fixtures.
 */
export function parseWorktreeListOutput(stdout: string): WorktreeInfo[] {
  if (!stdout.trim()) return [];

  // Entries are separated by blank lines
  const entries = stdout.split(/\n\n+/);
  const results: WorktreeInfo[] = [];

  for (const entry of entries) {
    const trimmed = entry.trim();
    if (!trimmed) continue;

    const lines = trimmed.split('\n');
    let path = '';
    let head = '';
    let branch: string | undefined;
    let bare = false;
    let prunable = false;

    for (const line of lines) {
      if (line.startsWith('worktree ')) {
        path = line.slice('worktree '.length);
      } else if (line.startsWith('HEAD ')) {
        head = line.slice('HEAD '.length);
      } else if (line.startsWith('branch ')) {
        branch = line.slice('branch '.length);
      } else if (line === 'bare') {
        bare = true;
      } else if (line === 'prunable' || line.startsWith('prunable ')) {
        prunable = true;
      }
      // 'detached' — branch remains undefined, which is the correct result
    }

    // Skip bare repo entries and prunable (stale) entries
    if (bare || prunable) continue;

    if (path && head) {
      results.push({ path, head, branch, bare: false });
    }
  }

  return results;
}

/** Discovers git worktrees by parsing `git worktree list --porcelain`. */
export class GitWorktreeDiscovery {
  /**
   * List all worktrees for the git repository at the given path.
   * Returns empty array if git is not available or path is not a git repo.
   */
  async listWorktrees(repoPath: string): Promise<WorktreeInfo[]> {
    try {
      const { stdout } = await gitExec(['worktree', 'list', '--porcelain'], repoPath);
      return parseWorktreeListOutput(stdout);
    } catch {
      return [];
    }
  }
}
