// Re-export from core — canonical implementation lives in @context-forge/core
export {
  applyWorktreeOverlay,
  isInIndexRange,
  getWorktreeIndexRange,
  getWorktreeRangeOverride,
} from '@context-forge/core';

import type { ProjectData } from '@context-forge/core';

/**
 * Resolve the filesystem path for file operations.
 * Returns worktreePath when a worktree is resolved and has a path,
 * otherwise returns projectPath.
 */
export function resolveOperationPath(
  project: ProjectData,
  worktreeId?: string,
): string | undefined {
  if (worktreeId && project.worktrees) {
    const wt = project.worktrees.find((w) => w.id === worktreeId);
    if (wt?.worktreePath) return wt.worktreePath;
  }
  return project.projectPath;
}

/**
 * Get all unique filesystem paths for cross-worktree aggregation (--all mode).
 * Collects projectPath + all worktreePath values into a deduplicated set.
 */
export function resolveAllOperationPaths(
  project: ProjectData,
): string[] {
  const paths = new Set<string>();
  if (project.projectPath) paths.add(project.projectPath);
  for (const wt of project.worktrees ?? []) {
    if (wt.worktreePath) paths.add(wt.worktreePath);
  }
  return [...paths];
}
