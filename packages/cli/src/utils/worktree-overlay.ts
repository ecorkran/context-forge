// Re-export from core — canonical implementation lives in @context-forge/core
export { applyWorktreeOverlay } from '@context-forge/core';

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
 * Get the index range for filtering, if applicable.
 * Returns undefined for the default worktree or when no worktree is resolved
 * (meaning: show everything, no filter).
 * Returns [start, end] for non-default worktrees.
 */
export function getWorktreeIndexRange(
  project: ProjectData,
  worktreeId?: string,
): [number, number] | undefined {
  if (!worktreeId || !project.worktrees) return undefined;
  const wt = project.worktrees.find((w) => w.id === worktreeId);
  if (!wt || wt.name === 'default') return undefined;
  return wt.indexRange;
}

/**
 * Check if a numeric index falls within an optional range.
 * Returns true if no range is specified (no filtering).
 */
export function isInIndexRange(
  index: number,
  range?: [number, number],
): boolean {
  if (!range) return true;
  return index >= range[0] && index <= range[1];
}
