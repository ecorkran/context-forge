// Branch guard: decides whether a guide-update commit is safe to make on the current branch.
import { execFile } from 'child_process';
import type { ConfigManager } from '../config/ConfigManager.js';
import { gitExec } from './gitExec.js';

export type BranchGuardVerdict =
  | { outcome: 'proceed' }
  | { outcome: 'block'; trunk: string; current: string }
  | { outcome: 'warn'; trunk: string; current: string; ancestry: 'descends' | 'unrelated' };

/**
 * Checks whether `trunk` is an ancestor of HEAD via `git merge-base --is-ancestor`,
 * whose exit code is its actual return value (0 = true, 1 = false, >1 = error) rather
 * than a uniform success/failure signal — so this bypasses gitExec's throw-on-nonzero
 * contract with a standalone execFile call instead of changing that contract for every
 * other caller.
 */
export function isAncestor(trunk: string, cwd: string): Promise<boolean> {
  const args = ['merge-base', '--is-ancestor', trunk, 'HEAD'];
  return new Promise((resolve, reject) => {
    execFile('git', args, { cwd }, (error, _stdout, stderr) => {
      if (!error) {
        resolve(true);
        return;
      }
      if (typeof error.code === 'number' && error.code === 1) {
        resolve(false);
        return;
      }
      reject(
        new Error(
          `git ${args.join(' ')} failed in ${cwd}: ${stderr.trim() || error.message}`
        )
      );
    });
  });
}

export class BranchGuardBlockedError extends Error {
  readonly trunk: string;
  readonly current: string;

  constructor(trunk: string, current: string) {
    const message =
      current === 'HEAD'
        ? `Cannot update guide: currently in a detached HEAD state, not on any branch. Check out a branch before updating.`
        : `Cannot update guide: currently on "${current}", but the configured integration branch is "${trunk}". Switch to "${trunk}" before updating, or unset git.integration_branch if that is not what you intended.`;
    super(message);
    this.name = 'BranchGuardBlockedError';
    this.trunk = trunk;
    this.current = current;
  }
}

export class BranchGuardWarnError extends Error {
  readonly trunk: string;
  readonly current: string;
  readonly ancestry: 'descends' | 'unrelated';

  constructor(trunk: string, current: string, ancestry: 'descends' | 'unrelated') {
    const message =
      ancestry === 'descends'
        ? `You are on "${current}", which descends from the integration branch "${trunk}". Guide update will commit on "${current}". Continue?`
        : `You are on "${current}", which has no resolvable common ancestry with the integration branch "${trunk}". Guide update will commit on "${current}". Continue?`;
    super(message);
    this.name = 'BranchGuardWarnError';
    this.trunk = trunk;
    this.current = current;
    this.ancestry = ancestry;
  }
}

/**
 * Resolves the configured trunk branch and the current branch, then applies the
 * guard decision table to determine whether a guide-update commit should proceed,
 * block, or require confirmation.
 */
export async function evaluateBranchGuard(
  projectPath: string,
  configManager?: ConfigManager
): Promise<BranchGuardVerdict> {
  let trunk = 'main';
  if (configManager) {
    try {
      const result = await configManager.get('git.integration_branch');
      if (result.value && typeof result.value === 'string' && result.value.length > 0) {
        trunk = result.value;
      }
    } catch {
      // Fall through to default 'main'
    }
  }

  const { stdout: current } = await gitExec(['rev-parse', '--abbrev-ref', 'HEAD'], projectPath);

  if (current === 'HEAD') {
    return { outcome: 'block', trunk, current: 'HEAD' };
  }
  if (current === trunk) {
    return { outcome: 'proceed' };
  }
  if (current === 'main' && trunk !== 'main') {
    return { outcome: 'block', trunk, current };
  }

  const descends = await isAncestor(trunk, projectPath);
  return descends
    ? { outcome: 'warn', trunk, current, ancestry: 'descends' }
    : { outcome: 'warn', trunk, current, ancestry: 'unrelated' };
}
