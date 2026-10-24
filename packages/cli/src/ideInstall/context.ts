/**
 * State one target install works with: what the bash script kept in globals
 * (TARGET_ROOT, PROJECT_ROOT, the source dirs, RULES_EXCLUDE, the manifest).
 */
import type { RuleExclusions } from './exclusions.js';
import { isDirectory } from './fsChecks.js';
import type { InstallManifest } from './manifest.js';
import type { Printer } from './output.js';
import type { GuidePaths } from './paths.js';

export interface InstallContext {
  guide: GuidePaths;
  /** Checkout inspected for lint detection. */
  projectRoot: string;
  /** Checkout written to: the project, a worktree, or a dry-run sandbox. */
  targetRoot: string;
  writeLint: boolean;
  /** Replace files the guide does not own, edited or not (backed up first). */
  force: boolean;
  out: Printer;
  /** Shared across a dry run's sandbox install, so warnings see every match. */
  exclusions: RuleExclusions;
  /**
   * The rendered `## Project Rule Resolutions` section (slice 266), rendered once
   * per run; `''` when there is no resolutions file or no live resolution.
   */
  resolutionsSection: string;
  manifest: InstallManifest;
}

/**
 * Ends the install with exit 1, once its messages are written: the port of a
 * bash `exit 1` (or a `set -e` exit) mid-run. installIde catches it.
 */
export class InstallAbort extends Error {
  constructor(reason: string) {
    super(`setup-ide install aborted: ${reason}`);
    this.name = 'InstallAbort';
  }
}

/** Every target's first check: the guide's rules directory must exist. */
export function requireRulesDir(ctx: InstallContext): void {
  if (isDirectory(ctx.guide.rules)) return;
  ctx.out.status('red', `❌ Error: Rules source directory not found: ${ctx.guide.rules}`);
  ctx.out.status('yellow', "💡 Make sure you're running this from a project that includes ai-project-guide");
  throw new InstallAbort('rules source directory not found');
}
