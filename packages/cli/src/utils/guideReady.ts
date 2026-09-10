import { ConfigManager, GuideManager } from '@context-forge/core/node';
import type { EnsureCheckoutResult } from '@context-forge/core';
import { warn, dim } from '../output/styles.js';

/**
 * Make the guide readable before a command consumes it, and report what
 * happened.
 *
 * This is the only place the CLI formats auto-init notices. Every message goes
 * to stderr so stdout stays machine-readable for callers that pipe it (D4) —
 * `cf build` output in particular is consumed by other tools.
 *
 * @param projectPath - the project root, used for config and detection
 * @param operationPath - the worktree being operated on, when inside one;
 *   defaults to projectPath, matching how `cf guides` resolves it
 */
export async function ensureGuideReady(
  projectPath: string,
  operationPath?: string
): Promise<EnsureCheckoutResult> {
  const cm = new ConfigManager(projectPath);
  const manager = new GuideManager(projectPath, cm, operationPath);

  const result = await manager.ensureCheckout();

  if (result.action === 'initialized') {
    console.error(dim(result.message ?? ''));
  } else if (result.action === 'warned') {
    console.error(warn(result.message ?? ''));
  }

  return result;
}
