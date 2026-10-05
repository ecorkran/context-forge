import { existsSync, realpathSync } from 'node:fs';
import { join, relative } from 'node:path';
import type {
  CheckoutCommit,
  ConsistencyCheckResult,
  ConsistencyFinding,
  ConsistencyFixResult,
  DeferredFix,
  DeferReasonValue,
  FixLogEntry,
} from './types.js';
import { DeferReason } from './types.js';
import { mergeFixResults, type AttributedView } from './mergeCheckResults.js';
import type { ConsistencyChecker } from './ConsistencyChecker.js';
import { resolveFixOwner } from './fixOwnership.js';
import { commitPathsIfChanged, gitExec, restorePathsToHead } from '../guides/gitExec.js';
import { formatDateProject } from '../project-defaults.js';
import { checkoutReadiness, FIX_GIT_TIMEOUT_MS } from '../git/checkoutReadiness.js';
import { stripTrailingSeparator } from '../utils/worktree-overlay.js';
import type { ProjectData } from '../types/index.js';

/** Commit message for fixes written into a non-invoking checkout (slice 213 D4). */
export const FIX_COMMIT_MESSAGE = 'docs: update project documents in response to cf check --fix';

/** A view paired with its dry-run check result. `runAttributed` returns results in view order. */
export interface AttributedCheckResult {
  view: AttributedView;
  result: ConsistencyCheckResult;
}

/** One view's share of a routed fix plan. */
export interface FixPlanEntry {
  view: AttributedView;
  /** Kept fixable findings only — fed straight to `checker.applyFixes`. */
  result: ConsistencyCheckResult;
  /** True for a non-invoking checkout: its writes are committed there. */
  commit: boolean;
  /** The view's full dry-run result, so the fix result reports every finding. */
  checked: ConsistencyCheckResult;
}

/** Fixes routed to their owning checkouts, plus the fixes left unwritten. */
export interface FixPlan {
  entries: FixPlanEntry[];
  deferred: DeferredFix[];
  /** Top-level `projectPath` of the fix result: the invoking checkout. */
  invokingPath: string;
}

function viewRoot(view: AttributedView): string {
  return stripTrailingSeparator(view.view.projectPath ?? '');
}

function samePath(a: string | undefined, b: string | undefined): boolean {
  return a !== undefined && b !== undefined && stripTrailingSeparator(a) === stripTrailingSeparator(b);
}

/** Path of a finding's fix target relative to its view's checkout root. */
export function fixRelPath(view: AttributedView, finding: ConsistencyFinding): string {
  return relative(viewRoot(view), finding.fixAction!.filePath);
}

function realpathOrNull(path: string): string | null {
  if (!existsSync(path)) return null;
  return realpathSync(path);
}

/**
 * The view for the checkout `cwd` is in (slice 213 D5b): realpath of the git
 * top level, matched exactly against the realpath of each view root. Throws
 * when `cwd` is not in a git checkout or the checkout is not registered.
 * Callers use this only in fix mode with two or more views.
 */
export async function resolveInvokingCheckout(
  views: AttributedView[],
  cwd: string = process.cwd(),
): Promise<AttributedView> {
  let topLevel: string;
  try {
    topLevel = (await gitExec(['rev-parse', '--show-toplevel'], cwd)).stdout;
  } catch (err) {
    throw new Error(
      `${cwd} is not inside a git checkout. Run cf check --fix from a registered checkout of this project.`,
      { cause: err },
    );
  }
  const realTop = realpathSync(topLevel);
  const match = views.find((v) => v.view.projectPath && realpathOrNull(v.view.projectPath) === realTop);
  if (!match) {
    throw new Error(
      `This checkout (${realTop}) is not a registered worktree of this project. ` +
        'Run cf worktree init to register it, or run cf check --fix from a registered checkout.',
    );
  }
  return match;
}

function onlyFixable(result: ConsistencyCheckResult, findings: ConsistencyFinding[]): ConsistencyCheckResult {
  return { ...result, findings };
}

/**
 * Probe a non-invoking checkout and split its fixes into writable and
 * deferred (slice 213 D5). Used at plan time and again right before writing.
 * A git error or timeout during the probe defers this checkout's fixes as
 * READINESS_FAILED rather than aborting the run, so commits already made in
 * other checkouts are still reported (D5a).
 */
export async function gateByReadiness(
  view: AttributedView,
  findings: ConsistencyFinding[],
): Promise<{ kept: ConsistencyFinding[]; deferred: DeferredFix[] }> {
  if (findings.length === 0) return { kept: [], deferred: [] };
  const relPaths = [...new Set(findings.map((f) => fixRelPath(view, f)))];
  let readiness;
  try {
    readiness = await checkoutReadiness(viewRoot(view), relPaths, { timeoutMs: FIX_GIT_TIMEOUT_MS });
  } catch (err) {
    console.error(`cf check --fix: readiness check failed in ${viewRoot(view)}:`, err);
    const detail = err instanceof Error ? err.message : String(err);
    return { kept: [], deferred: findings.map((finding) => ({ finding, reason: DeferReason.READINESS_FAILED, detail })) };
  }
  if (readiness.blocked) {
    const reason = readiness.blocked;
    return { kept: [], deferred: findings.map((finding) => ({ finding, reason })) };
  }
  const dirty = new Set(readiness.dirtyPaths);
  const kept: ConsistencyFinding[] = [];
  const deferred: DeferredFix[] = [];
  for (const finding of findings) {
    if (dirty.has(fixRelPath(view, finding))) {
      deferred.push({ finding, reason: DeferReason.FILE_DIRTY });
    } else {
      kept.push(finding);
    }
  }
  return { kept, deferred };
}

/** Route one view's fixable findings to keep or defer, by subject ownership (D1–D3). */
function routeView(
  project: ProjectData,
  views: AttributedView[],
  view: AttributedView,
  fixable: ConsistencyFinding[],
): { kept: ConsistencyFinding[]; deferred: DeferredFix[] } {
  const kept: ConsistencyFinding[] = [];
  const deferred: DeferredFix[] = [];
  const defer = (finding: ConsistencyFinding, reason: DeferReasonValue, owner?: AttributedView) =>
    deferred.push({ finding, reason, ...(owner?.worktree && { owner: owner.worktree }) });

  for (const finding of fixable) {
    const owner = resolveFixOwner(project, finding.fixAction!.subjectIndex, views);
    if (owner === null) {
      defer(finding, DeferReason.OWNER_UNRESOLVED);
    } else if (owner === view || samePath(owner.view.projectPath, view.view.projectPath)) {
      kept.push(finding);
    } else if (existsSync(join(viewRoot(owner), fixRelPath(view, finding)))) {
      defer(finding, DeferReason.NOT_OWNER, owner);
    } else {
      // The owner has no copy to diverge from: fix it where it was reported (D2).
      kept.push(finding);
    }
  }
  return { kept, deferred };
}

/**
 * Plan which fixes each checkout receives (slice 213 Data Flow).
 *
 * Each fixable finding is kept only in the view that owns its subject;
 * non-owner copies, unresolvable owners, and fixes into non-invoking
 * checkouts that fail readiness are deferred with a reason. A single
 * checkout keeps every fix and runs no git command (SC 9).
 */
export async function planRoutedFixes(
  project: ProjectData,
  viewResults: AttributedCheckResult[],
  invokingPath: string,
): Promise<FixPlan> {
  const fixableOf = (r: ConsistencyCheckResult) => r.findings.filter((f) => f.fixable && f.fixAction);

  if (viewResults.length === 1) {
    const [{ view, result }] = viewResults;
    return {
      entries: [{ view, result: onlyFixable(result, fixableOf(result)), commit: false, checked: result }],
      deferred: [],
      invokingPath,
    };
  }

  const views = viewResults.map((r) => r.view);
  const entries: FixPlanEntry[] = [];
  const deferred: DeferredFix[] = [];

  for (const { view, result } of viewResults) {
    const routed = routeView(project, views, view, fixableOf(result));
    deferred.push(...routed.deferred);
    const commit = !samePath(view.view.projectPath, invokingPath);
    let kept = routed.kept;
    if (commit) {
      const gated = await gateByReadiness(view, kept);
      kept = gated.kept;
      deferred.push(...gated.deferred);
    }
    entries.push({ view, result: onlyFixable(result, kept), commit, checked: result });
  }

  return { entries, deferred, invokingPath };
}

/** What happened to one view's writes after the commit attempt. */
interface CommitOutcome {
  commit?: CheckoutCommit;
  /** True when the writes were rolled back, so the view's log entries must go. */
  restored: boolean;
  deferred: DeferredFix[];
  fixErrors: string[];
}

/**
 * Commit a non-invoking view's writes, scoped to the written paths (D4). On a
 * failed commit, restore those paths to HEAD and defer the fixes as
 * COMMIT_FAILED; only a failed restore becomes a fixErrors entry (D5a).
 */
async function commitViewWrites(
  view: AttributedView,
  findings: ConsistencyFinding[],
  fixLog: FixLogEntry[],
): Promise<CommitOutcome> {
  const root = viewRoot(view);
  const written = [...new Set(fixLog.map((e) => relative(root, e.filePath)))];
  const opts = { timeoutMs: FIX_GIT_TIMEOUT_MS };
  try {
    const sha = await commitPathsIfChanged(root, written, FIX_COMMIT_MESSAGE, opts);
    const commit = sha ? { ...(view.worktree && { worktree: view.worktree }), checkoutPath: root, sha, files: written } : undefined;
    return { commit, restored: false, deferred: [], fixErrors: [] };
  } catch (commitErr) {
    console.error(`cf check --fix: commit failed in ${root}:`, commitErr);
    const detail = commitErr instanceof Error ? commitErr.message : String(commitErr);
    try {
      await restorePathsToHead(root, written, opts);
    } catch (restoreErr) {
      console.error(`cf check --fix: restore failed in ${root}:`, restoreErr);
      const fixError =
        `Commit failed in ${root} and restoring the written files also failed; ` +
        `left written but uncommitted: ${written.join(', ')}`;
      return { restored: false, deferred: [], fixErrors: [fixError] };
    }
    const writtenSet = new Set(written);
    const deferred = findings
      .filter((f) => writtenSet.has(fixRelPath(view, f)))
      .map((finding) => ({ finding, reason: DeferReason.COMMIT_FAILED, detail }));
    return { restored: true, deferred, fixErrors: [] };
  }
}

/** Apply one plan entry: re-check readiness, write, then commit if non-invoking. */
async function applyPlanEntry(
  checker: ConsistencyChecker,
  entry: FixPlanEntry,
  dateStamp: string,
): Promise<ConsistencyFixResult> {
  const deferred: DeferredFix[] = [];
  let findings = entry.result.findings;
  if (entry.commit) {
    // Readiness again: the CLI prompt can wait indefinitely (D5).
    const gated = await gateByReadiness(entry.view, findings);
    findings = gated.kept;
    deferred.push(...gated.deferred);
  }

  const applied = await checker.applyFixes(onlyFixable(entry.result, findings), dateStamp);
  const worktree = entry.view.worktree;
  let fixLog = worktree ? applied.fixLog.map((e) => ({ ...e, worktree })) : applied.fixLog;
  let fixed = applied.fixed;
  const fixErrors = [...applied.fixErrors];
  const commits: CheckoutCommit[] = [];

  if (entry.commit && fixLog.length > 0) {
    const outcome = await commitViewWrites(entry.view, findings, fixLog);
    if (outcome.commit) commits.push(outcome.commit);
    if (outcome.restored) {
      fixed -= fixLog.length;
      fixLog = [];
    }
    deferred.push(...outcome.deferred);
    fixErrors.push(...outcome.fixErrors);
  }

  return { ...entry.checked, fixed, fixLog, fixErrors, deferred, commits };
}

/**
 * Apply a routed fix plan (slice 213 Data Flow): write each view's kept
 * fixes with one shared date stamp, commit writes in non-invoking checkouts,
 * and merge everything into one result whose `deferred` covers both plan-time
 * and apply-time deferrals. The invoking checkout's writes stay uncommitted.
 */
export async function applyFixPlan(
  checker: ConsistencyChecker,
  plan: FixPlan,
  dateStamp: string = formatDateProject(),
): Promise<ConsistencyFixResult> {
  const perView: ConsistencyFixResult[] = [];
  for (const entry of plan.entries) {
    perView.push(await applyPlanEntry(checker, entry, dateStamp));
  }
  const merged = mergeFixResults(perView, plan.invokingPath);
  return { ...merged, deferred: [...plan.deferred, ...merged.deferred] };
}
