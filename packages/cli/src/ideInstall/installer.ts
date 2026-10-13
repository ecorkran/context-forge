/**
 * Entry point of the native setup-ide install, a port of the guide's
 * `scripts/setup-ide` and `scripts/setup-ide-lint.sh`.
 */
import type { Target } from '../commands/ideTargets.js';
import type { OutputSink } from './output.js';

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

export function installIde(options: InstallOptions): InstallResult {
  throw new Error(`installIde is not implemented yet (target ${options.target})`);
}
