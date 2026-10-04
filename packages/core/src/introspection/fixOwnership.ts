import type { ProjectData } from '../types/index.js';
import type { AttributedView } from './mergeCheckResults.js';
import { isInIndexRange, stripTrailingSeparator } from '../utils/worktree-overlay.js';

/**
 * The view whose checkout root is the project's primary `projectPath`.
 *
 * View roots come from `buildAttributedViews`, which overlays each worktree's
 * `worktreePath` verbatim (or keeps `projectPath` when a worktree has none),
 * so the comparison is a plain string match modulo a trailing separator. A
 * worktree without a path shares the primary root; such views are the same
 * checkout, so the first one is the primary.
 */
function findPrimaryView(project: ProjectData, views: AttributedView[]): AttributedView | null {
  if (!project.projectPath) return null;
  const primary = stripTrailingSeparator(project.projectPath);
  return (
    views.find((v) => v.view.projectPath && stripTrailingSeparator(v.view.projectPath) === primary) ??
    null
  );
}

/**
 * Resolve which checkout owns the subject of a fix (slice 213 D2).
 *
 * 1. Single checkout: the only view.
 * 2. Exactly one worktree's `indexRange` contains the index: that worktree's view.
 * 3. No range contains it, or the index is `null`: the primary-checkout view.
 * 4. Several ranges contain it, or rule 3 finds no primary view: `null`.
 *
 * `rangeOverride` is deliberately ignored — it suppresses out-of-range
 * warnings for an active slice and says nothing about ownership. Pure: no fs,
 * no git.
 */
export function resolveFixOwner(
  project: ProjectData,
  subjectIndex: number | null,
  views: AttributedView[],
): AttributedView | null {
  if (views.length === 1) return views[0];

  if (subjectIndex !== null) {
    const worktrees = project.worktrees ?? [];
    const claimants = views.filter((v) => {
      const id = v.worktree?.id;
      const wt = id === undefined ? undefined : worktrees.find((w) => w.id === id);
      return wt !== undefined && isInIndexRange(subjectIndex, wt.indexRange);
    });
    if (claimants.length === 1) return claimants[0];
    if (claimants.length > 1) return null;
  }

  return findPrimaryView(project, views);
}
