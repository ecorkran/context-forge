import type { ConsistencyCheckResult } from './types.js';
import type { ProjectData } from '../types/index.js';
import type { ConsistencyChecker } from './ConsistencyChecker.js';
import { runAttributed, type AttributedView } from './mergeCheckResults.js';
import { planRoutedFixes, resolveInvokingCheckout, type FixPlan } from './routedFixes.js';

// Shared by `cf check` and MCP's `workflow_check` (slice 213) so slice
// scoping, invoking-checkout resolution, and the dry-run-then-plan step
// cannot drift between the two callers.

/** The views a check runs against, and the checker call to run on each. */
export interface CheckScope {
  views: AttributedView[];
  runCheck: (view: ProjectData) => Promise<ConsistencyCheckResult>;
}

/**
 * Scope a check to one slice or to all slices. One slice sets `fileSlice` on
 * every view and runs `check()`; otherwise every view runs `checkAll()`.
 */
export function scopeCheck(
  checker: ConsistencyChecker,
  views: AttributedView[],
  sliceIndex: number | null,
): CheckScope {
  if (sliceIndex === null) return { views, runCheck: (v) => checker.checkAll(v) };
  return {
    views: views.map((pv) => ({ ...pv, view: { ...pv.view, fileSlice: `${sliceIndex}-slice` } })),
    runCheck: (v) => checker.check(v),
  };
}

/**
 * The checkout a fix run writes into without committing. With two or more
 * views it is the registered checkout `cwd` is in (D5b), and an unregistered
 * one throws; a single view uses `singlePath`. Throws when neither gives a path.
 */
export async function resolveFixInvokingPath(
  views: AttributedView[],
  singlePath: string | undefined,
  cwd: string = process.cwd(),
): Promise<string> {
  const path = views.length > 1 ? (await resolveInvokingCheckout(views, cwd)).view.projectPath : singlePath;
  if (!path) throw new Error('No projectPath configured for this project. Set projectPath and retry.');
  return path;
}

/** Dry-run every scoped view, then route each fix to the checkout that owns it. */
export async function planFixRun(
  project: ProjectData,
  scope: CheckScope,
  invokingPath: string,
): Promise<{ dryRunResults: ConsistencyCheckResult[]; plan: FixPlan }> {
  const dryRunResults = await runAttributed(scope.views, scope.runCheck);
  const viewResults = scope.views.map((view, i) => ({ view, result: dryRunResults[i] }));
  const plan = await planRoutedFixes(project, viewResults, invokingPath);
  return { dryRunResults, plan };
}
