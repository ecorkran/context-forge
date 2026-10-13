/**
 * Entry point of the native setup-ide install, a port of the guide's
 * `scripts/setup-ide` and `scripts/setup-ide-lint.sh` (main, run_target_setup,
 * install_target).
 */
import * as path from 'node:path';
import type { Target } from '../commands/ideTargets.js';
import { InstallAbort, type InstallContext } from './context.js';
import { RuleExclusions } from './exclusions.js';
import { InstallManifest } from './manifest.js';
import { Printer, type OutputSink } from './output.js';
import { guidePaths } from './paths.js';
import { setupAgents } from './targets/agents.js';
import { setupClaude } from './targets/claude.js';

export interface InstallOptions {
  /** Guide checkout to read sources from (the main checkout's guide, also for worktrees). */
  guideDir: string;
  /** Checkout whose project files are inspected (lint detection). */
  projectRoot: string;
  /** Checkout written to. A worktree passes its own root as both. A dry run swaps in its sandbox. */
  targetRoot: string;
  target: Target;
  dryRun: boolean;
  writeLint: boolean;
  /** Patterns from `rules.exclude`, already split. Empty = install everything. */
  rulesExclude: readonly string[];
  out: OutputSink;
}

export interface InstallResult {
  exitCode: 0 | 1;
}

/** The per-target setup functions; the Record makes a new Target a compile error until added. */
const TARGET_SETUP: Record<Target, (ctx: InstallContext) => void> = {
  claude: setupClaude,
  agents: setupAgents,
  copilot: notPortedYet,
  cursor: notPortedYet,
};

function notPortedYet(): void {
  throw new Error('target not ported yet');
}

/** Everything a target install needs except the manifest, which each install opens itself. */
export type InstallBase = Omit<InstallContext, 'manifest'>;

/** `install_target`: run the target, finish the manifest, check lint configs. */
export function installTarget(target: Target, base: InstallBase): void {
  const manifest = new InstallManifest(base.targetRoot, target, base.out);
  const ctx: InstallContext = { ...base, manifest };
  TARGET_SETUP[target](ctx);
  manifest.finish();
  ctx.out.line();
}

/** A Node filesystem error (EACCES, ENOSPC, …): an environment failure, not a bug. */
function isFilesystemError(err: unknown): err is Error & { code: string } {
  return err instanceof Error && 'code' in err && typeof err.code === 'string';
}

/**
 * Install IDE files for one target. Install failures (the bash exit-1 paths
 * and filesystem errors) are reported and return exit 1; anything else is a
 * bug and propagates.
 */
export function installIde(options: InstallOptions): InstallResult {
  const out = new Printer(options.out);
  const projectRoot = path.resolve(options.projectRoot);
  const targetRoot = path.resolve(options.targetRoot);
  const base: InstallBase = {
    guide: guidePaths(options.guideDir),
    projectRoot,
    targetRoot,
    writeLint: options.writeLint,
    out,
    exclusions: new RuleExclusions(options.rulesExclude),
  };

  try {
    out.status('blue', `📍 Project root detected: ${projectRoot}`);
    out.status('blue', `📍 IDE directories will be created in: ${targetRoot}`);
    out.line();
    installTarget(options.target, base);
    base.exclusions.warnUnmatched(base.guide.rules, out);
    return { exitCode: 0 };
  } catch (err) {
    if (err instanceof InstallAbort) return { exitCode: 1 };
    if (isFilesystemError(err)) {
      out.statusErr('red', `❌ ${err.message}`);
      return { exitCode: 1 };
    }
    throw err;
  }
}
