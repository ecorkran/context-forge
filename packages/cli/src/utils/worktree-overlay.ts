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
 * Returns the worktree's indexRange for ALL worktrees (including default).
 * Returns undefined only when no worktreeId, no worktrees array, or
 * worktree not found (projects without worktrees — no filtering).
 */
export function getWorktreeIndexRange(
  project: ProjectData,
  worktreeId?: string,
): [number, number] | undefined {
  if (!worktreeId || !project.worktrees) return undefined;
  const wt = project.worktrees.find((w) => w.id === worktreeId);
  if (!wt) return undefined;
  return wt.indexRange;
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

/**
 * Check if a worktree has rangeOverride enabled.
 * Returns false when no worktreeId, no worktrees, or worktree not found.
 */
export function getWorktreeRangeOverride(
  project: ProjectData,
  worktreeId?: string,
): boolean {
  if (!worktreeId || !project.worktrees) return false;
  const wt = project.worktrees.find((w) => w.id === worktreeId);
  return wt?.rangeOverride === true;
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
