import { formatUpstreamLagWarning, upstreamLag } from '@context-forge/core/node';
import type { ProjectData } from '@context-forge/core';
import { warn } from '../output/styles.js';
import { resolveOperationPath } from './worktree-overlay.js';

/**
 * Warning when the checkout cf reads artifacts from trails its upstream (#104),
 * or null when it is current, has no upstream, or is not a git checkout.
 * Local only: uses git's record of the last fetch.
 */
export async function checkoutLagWarning(project: ProjectData, worktreeId?: string): Promise<string | null> {
  const checkoutPath = resolveOperationPath(project, worktreeId) ?? project.projectPath;
  if (!checkoutPath) return null;
  const lag = await upstreamLag(checkoutPath);
  if (!lag || lag.behind === 0) return null;
  const name = project.worktrees?.find((w) => w.id === worktreeId)?.name ?? project.name;
  return formatUpstreamLagWarning(name, lag);
}

/** Print the lag warning to stderr, so stdout and `--json` stay parseable. */
export async function warnIfBehindUpstream(project: ProjectData, worktreeId?: string): Promise<void> {
  const message = await checkoutLagWarning(project, worktreeId);
  if (message) console.error(warn(`⚠ ${message}`));
}
