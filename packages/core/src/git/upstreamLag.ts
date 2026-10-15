import { gitExec, isGitRepo } from '../guides/gitExec.js';

/** How far a checkout trails the upstream branch as of the last fetch. */
export interface UpstreamLag {
  behind: number;
  /** Upstream ref, e.g. `origin/main`. */
  upstream: string;
}

/**
 * Commits the checkout is behind its upstream, from git's local record of the
 * last fetch (#104): no fetch, no network. Null when the path is not a git
 * checkout or has no usable upstream — normal states, not faults.
 */
export async function upstreamLag(checkoutPath: string): Promise<UpstreamLag | null> {
  if (!(await isGitRepo(checkoutPath))) return null;

  let upstream: string;
  try {
    ({ stdout: upstream } = await gitExec(['rev-parse', '--abbrev-ref', '@{u}'], checkoutPath));
  } catch {
    // `@{u}` fails the same way for a local-only branch, a detached HEAD, and an
    // upstream whose remote ref was deleted; git words each differently and none
    // is a fault here, so every failure to resolve it means "nothing to compare".
    return null;
  }

  const { stdout } = await gitExec(['rev-list', '--count', 'HEAD..@{u}'], checkoutPath);
  return { behind: Number.parseInt(stdout, 10), upstream };
}

/** One-line warning for a checkout that trails its upstream. */
export function formatUpstreamLagWarning(checkoutName: string, lag: UpstreamLag): string {
  const noun = lag.behind === 1 ? 'commit' : 'commits';
  return `${checkoutName} is ${lag.behind} ${noun} behind ${lag.upstream}; artifact lists may be incomplete`;
}
