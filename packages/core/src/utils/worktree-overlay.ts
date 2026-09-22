import type { ProjectData } from '../types/index.js';

/** The worktree (or project root) that owns a given filesystem path. */
export interface WorktreeMatch {
  /** Worktree id, or undefined when the match was the project root itself. */
  worktreeId?: string;
  /** Worktree name, or undefined when the match was the project root itself. */
  name?: string;
  /** The matched root: the worktree's worktreePath, or the project's projectPath. */
  rootPath: string;
}

/** Strip a single trailing separator so `/a/b/` and `/a/b` compare equal. */
function stripTrailingSeparator(path: string): string {
  return path.endsWith('/') || path.endsWith('\\') ? path.slice(0, -1) : path;
}

/**
 * Resolve which worktree (or the project root) owns an absolute path.
 *
 * Candidates are the project's `projectPath` plus every worktree's
 * `worktreePath`. A candidate matches when the path equals it, or starts with
 * it followed by a separator — a bare string prefix is not enough, so
 * `/repo-old` does not match the root `/repo`. The longest matching root wins;
 * on an exact tie a worktree is preferred over the project root.
 *
 * Returns null when nothing owns the path. A worktree with no `worktreePath`
 * cannot own one and is skipped.
 */
export function resolveWorktreeForPath(
  project: ProjectData,
  absolutePath: string,
): WorktreeMatch | null {
  const candidates: WorktreeMatch[] = [];

  if (project.projectPath) {
    candidates.push({ rootPath: project.projectPath });
  }
  for (const wt of project.worktrees ?? []) {
    if (wt.worktreePath) {
      candidates.push({ worktreeId: wt.id, name: wt.name, rootPath: wt.worktreePath });
    }
  }

  const matches = candidates
    .filter((c) => {
      const root = stripTrailingSeparator(c.rootPath);
      return (
        absolutePath === root ||
        absolutePath.startsWith(root + '/') ||
        absolutePath.startsWith(root + '\\')
      );
    })
    .sort((a, b) => {
      // Longest root wins; on tie, prefer a worktree over the project root.
      const lenDiff =
        stripTrailingSeparator(b.rootPath).length - stripTrailingSeparator(a.rootPath).length;
      if (lenDiff !== 0) return lenDiff;
      if (a.worktreeId && !b.worktreeId) return -1;
      if (!a.worktreeId && b.worktreeId) return 1;
      return 0;
    });

  return matches[0] ?? null;
}

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
