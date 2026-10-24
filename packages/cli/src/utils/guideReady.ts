import * as path from 'node:path';
import {
  ConfigManager,
  GuideDetector,
  GuideManager,
  GUIDE_OFFLINE_REMEDIATION,
  GUIDE_RELATIVE_PATH,
} from '@context-forge/core/node';
import type { EnsureCheckoutResult } from '@context-forge/core';
import { warn, dim } from '../output/styles.js';
import { UserError } from './errors.js';

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

/**
 * The project's installed guide directory. Auto-inits an uninitialized checkout
 * first (#80), then fails before any network call when the guide is absent from
 * disk, pointing at the fix and at the offline path (#78).
 */
export async function requireGuideDir(projectPath: string): Promise<string> {
  await ensureGuideReady(projectPath);
  const guideInfo = await new GuideDetector().detect(projectPath);
  if (!guideInfo.installed) {
    throw new UserError(
      "Guides are not installed. Run 'cf guides install' first.\n" +
        `  If that install fails to reach the guide repo: ${GUIDE_OFFLINE_REMEDIATION}`,
    );
  }
  return path.join(projectPath, GUIDE_RELATIVE_PATH);
}
