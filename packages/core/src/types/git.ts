/** Parsed entry from `git worktree list --porcelain`. */
export interface WorktreeInfo {
  /** Absolute path to the worktree directory. */
  path: string;
  /** HEAD commit hash. */
  head: string;
  /** Branch ref (e.g., 'refs/heads/feature/100-api'), undefined if detached HEAD. */
  branch?: string;
  /** Whether this is a bare repository entry. */
  bare: boolean;
}
