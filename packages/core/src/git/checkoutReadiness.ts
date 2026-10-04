import { existsSync, realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { gitExec, type GitExecOptions } from '../guides/gitExec.js';
import { DeferReason, type DeferReasonValue } from '../introspection/types.js';

/**
 * Bound for every git call `cf check --fix` makes against a checkout other
 * than the invoking one (slice 213 D5a): covers a hanging hook or a stuck lock.
 */
export const FIX_GIT_TIMEOUT_MS = 60_000;

/** State files git keeps while a merge, rebase, or cherry-pick is in progress. */
const IN_PROGRESS_MARKERS = ['MERGE_HEAD', 'rebase-merge', 'rebase-apply', 'CHERRY_PICK_HEAD'];

/** Whether a checkout can safely receive writes, and which target paths are dirty. */
export interface ReadinessResult {
  /** Checkout-wide block, or null when the checkout is usable. */
  blocked: DeferReasonValue | null;
  /** Subset of the requested paths with uncommitted changes. Empty when `blocked` is set. */
  dirtyPaths: string[];
}

function block(reason: DeferReasonValue): ReadinessResult {
  return { blocked: reason, dirtyPaths: [] };
}

/**
 * Probe a checkout before writing fixes into it (slice 213 D5), in order:
 * not the top level of a git checkout → NOT_A_CHECKOUT; detached HEAD →
 * DETACHED_HEAD; merge/rebase/cherry-pick in progress → CHECKOUT_BUSY; then
 * each of `relPaths` with uncommitted changes is reported dirty.
 */
export async function checkoutReadiness(
  checkoutPath: string,
  relPaths: string[],
  opts?: GitExecOptions,
): Promise<ReadinessResult> {
  if (!existsSync(checkoutPath)) return block(DeferReason.NOT_A_CHECKOUT);

  let topLevel: string;
  try {
    topLevel = (await gitExec(['rev-parse', '--show-toplevel'], checkoutPath, opts)).stdout;
  } catch {
    // rev-parse exits non-zero outside a work tree: that is the not-a-checkout signal.
    return block(DeferReason.NOT_A_CHECKOUT);
  }
  if (realpathSync(topLevel) !== realpathSync(checkoutPath)) return block(DeferReason.NOT_A_CHECKOUT);

  try {
    await gitExec(['symbolic-ref', '-q', 'HEAD'], checkoutPath, opts);
  } catch {
    // symbolic-ref -q exits 1 when HEAD is detached: that is the signal being probed.
    return block(DeferReason.DETACHED_HEAD);
  }

  const gitPathArgs = IN_PROGRESS_MARKERS.flatMap((name) => ['--git-path', name]);
  const { stdout: markerPaths } = await gitExec(['rev-parse', ...gitPathArgs], checkoutPath, opts);
  const busy = markerPaths
    .split('\n')
    .filter(Boolean)
    .some((p) => existsSync(resolve(checkoutPath, p)));
  if (busy) return block(DeferReason.CHECKOUT_BUSY);

  const dirtyPaths: string[] = [];
  for (const relPath of relPaths) {
    const { stdout } = await gitExec(['status', '--porcelain', '--', relPath], checkoutPath, opts);
    if (stdout) dirtyPaths.push(relPath);
  }
  return { blocked: null, dirtyPaths };
}
