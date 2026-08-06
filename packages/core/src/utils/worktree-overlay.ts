import type { ProjectData } from '../types/index.js';

/** Overlay worktree-scoped fields onto a project copy. */
export function applyWorktreeOverlay(project: ProjectData, worktreeId: string): ProjectData {
  const wt = (project.worktrees ?? []).find((w) => w.id === worktreeId);
  if (!wt) return project;
  return {
    ...project,
    ...(wt.worktreePath && { projectPath: wt.worktreePath }),
    developmentPhase: wt.developmentPhase,
    instruction: wt.instruction,
    workType: wt.workType,
    fileArch: wt.archDoc,
    fileSlicePlan: wt.slicePlan,
    fileSlice: wt.activeSlice,
    fileTasks: wt.activeTaskFile,
  };
}

/**
 * Get the index range for filtering, if applicable.
 * Returns undefined (no filtering) when no worktreeId, no worktrees array,
 * worktree not found, or only one worktree is configured — range filtering
 * exists to isolate multiple worktrees from each other, so a lone worktree
 * has nothing to isolate and filtering would only hide the user's own work.
 */
export function getWorktreeIndexRange(
  project: ProjectData,
  worktreeId?: string,
): [number, number] | undefined {
  if (!worktreeId || !project.worktrees) return undefined;
  if (project.worktrees.length === 1) return undefined;
  const wt = project.worktrees.find((w) => w.id === worktreeId);
  if (!wt) return undefined;
  return wt.indexRange;
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
