import type { ProjectData } from '../types/project.js';
import type { WorktreeContext } from '../types/worktree.js';

/**
 * Label forward migration gives the default worktree. After the load
 * migration below, no code reads this name: the stored `isDefault` flag
 * identifies the default.
 */
export const DEFAULT_WORKTREE_NAME = 'default';

/** True only for the worktree marked `isDefault`. Never reads the name. */
export function isDefaultWorktree(wt: WorktreeContext): boolean {
  return wt.isDefault === true;
}

function describeWorktree(wt: WorktreeContext): string {
  return `'${wt.name}' (${wt.id})`;
}

/**
 * Find the project's one default worktree, ignoring `excludeId` (the worktree
 * being updated). The exclusion applies before the duplicate check, so
 * excluding one of two marked worktrees hides the duplicate for that call.
 * Throws when more than one marked worktree remains.
 */
export function findDefaultWorktree(
  worktrees: readonly WorktreeContext[],
  projectName: string,
  excludeId?: string,
): WorktreeContext | undefined {
  const marked = worktrees.filter((wt) => isDefaultWorktree(wt) && wt.id !== excludeId);
  if (marked.length > 1) {
    throw new Error(
      `Project '${projectName}' has more than one default worktree: ` +
        `${marked.map(describeWorktree).join(', ')}. ` +
        `Set "isDefault": true on only one of them in projects.json.`,
    );
  }
  return marked[0];
}

/** Result of migrating one project's worktrees. The input project is never mutated. */
export interface LegacyDefaultMigration {
  project: ProjectData;
  /** True when at least one absent `isDefault` value was resolved. */
  changed: boolean;
  warnings: string[];
}

function recoverySentence(projectsJsonPath: string): string {
  return (
    'Range narrowing and restore are off for this project. ' +
    `To turn them on, set "isDefault": true on the intended worktree in ${projectsJsonPath}.`
  );
}

/**
 * Resolve every absent `isDefault` value on a project's worktrees (see the
 * slice 934 design, "Migration rule"). The name `default` is read here and
 * nowhere else: data from before the flag has no other record of which
 * worktree is the default. Existing values are never changed. When the
 * outcome is probably not what the user wants (ambiguous candidates, or a
 * probable renamed default), nothing is marked and a warning says how to
 * recover.
 */
export function markLegacyDefaultWorktree(
  project: ProjectData,
  projectsJsonPath: string,
): LegacyDefaultMigration {
  const worktrees = project.worktrees ?? [];
  const absent = worktrees.filter((wt) => wt.isDefault === undefined);
  if (absent.length === 0) return { project, changed: false, warnings: [] };

  const warnings: string[] = [];
  const markedIds = new Set<string>();

  if (!worktrees.some(isDefaultWorktree)) {
    const candidates = absent.filter((wt) => wt.name.toLowerCase() === DEFAULT_WORKTREE_NAME);
    const atProjectPath = (wt: WorktreeContext): boolean =>
      project.projectPath !== undefined && wt.worktreePath === project.projectPath;

    if (candidates.length === 1) {
      markedIds.add(candidates[0].id);
    } else if (candidates.length > 1) {
      const narrowed = candidates.filter(atProjectPath);
      if (narrowed.length === 1) {
        markedIds.add(narrowed[0].id);
      } else {
        warnings.push(
          `Project '${project.name}' has several worktrees that could be the default: ` +
            `${candidates.map(describeWorktree).join(', ')}. None was marked. ${recoverySentence(projectsJsonPath)}`,
        );
      }
    } else {
      const atRoot = absent.filter(atProjectPath);
      if (atRoot.length > 0) {
        warnings.push(
          `Project '${project.name}' has no worktree named '${DEFAULT_WORKTREE_NAME}', but ` +
            `${atRoot.map(describeWorktree).join(', ')} is at the project path and may be a renamed default. ` +
            `None was marked. ${recoverySentence(projectsJsonPath)}`,
        );
      }
    }
  }

  const migrated = worktrees.map((wt) =>
    wt.isDefault === undefined ? { ...wt, isDefault: markedIds.has(wt.id) } : wt,
  );
  return { project: { ...project, worktrees: migrated }, changed: true, warnings };
}
