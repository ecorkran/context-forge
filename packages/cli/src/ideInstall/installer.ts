/**
 * Entry point of the native setup-ide install, a port of the guide's bash
 * setup-ide and setup-ide-lint.sh (main, run_target_setup, install_target).
 */
import * as path from 'node:path';
import type { RuleResolution } from '@context-forge/core/node';
import type { Target } from '../commands/ideTargets.js';
import { InstallAbort, type InstallContext } from './context.js';
import { dryRunInstall } from './dryRun.js';
import { RuleExclusions } from './exclusions.js';
import { isDirectory } from './fsChecks.js';
import { guideRuleEntries } from './guideRules.js';
import { checkLintConfigs } from './lint.js';
import { InstallManifest } from './manifest.js';
import { Printer, type OutputSink } from './output.js';
import { guidePaths } from './paths.js';
import { audienceProblemMessage, RULE_AUDIENCE, unknownAudienceValues } from './ruleAudience.js';
import {
  classifyResolutions,
  renderResolutions,
  warnStaleResolutions,
  type ResolutionClassification,
} from './resolutions.js';
import { setupAgents } from './targets/agents.js';
import { setupClaude } from './targets/claude.js';
import { setupCopilot } from './targets/copilot.js';
import { setupCursor } from './targets/cursor.js';

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
  force: boolean;
  /** Patterns from `rules.exclude`, already split. Empty = install everything. */
  rulesExclude: readonly string[];
  /** Stored rule resolutions for this checkout (slice 266), read by the caller before any write. */
  ruleResolutions: readonly RuleResolution[];
  out: OutputSink;
}

export interface InstallResult {
  exitCode: 0 | 1;
}

/** The per-target setup functions; the Record makes a new Target a compile error until added. */
const TARGET_SETUP: Record<Target, (ctx: InstallContext) => void> = {
  claude: setupClaude,
  agents: setupAgents,
  copilot: setupCopilot,
  cursor: setupCursor,
};

/** Everything a target install needs except the manifest, which each install opens itself. */
export type InstallBase = Omit<InstallContext, 'manifest'>;

/** `install_target`: run the target, finish the manifest, check lint configs. */
export function installTarget(target: Target, base: InstallBase): void {
  const manifest = new InstallManifest(base.targetRoot, target, base.out, base.force);
  const ctx: InstallContext = { ...base, manifest };
  TARGET_SETUP[target](ctx);
  manifest.finish();
  ctx.out.line();
  checkLintConfigs(ctx);
}

/** A Node filesystem error (EACCES, ENOSPC, …): an environment failure, not a bug. */
function isFilesystemError(err: unknown): err is Error & { code: string } {
  return err instanceof Error && 'code' in err && typeof err.code === 'string';
}

/**
 * Classify the stored resolutions against the guide and the checkout, and set
 * `base.resolutionSections` from the live ones, one per composite block. Returns null when there is
 * nothing to classify. With no rules directory the target's own
 * `requireRulesDir` aborts the install before anything is written, so no
 * resolution is silently dropped.
 */
function classifyForInstall(options: InstallOptions, base: InstallBase): ResolutionClassification | null {
  if (options.ruleResolutions.length === 0 || !isDirectory(base.guide.rules)) return null;
  const entries = guideRuleEntries(options.guideDir, base.projectRoot, base.exclusions);
  const classification = classifyResolutions(options.ruleResolutions, entries, base.projectRoot);
  base.resolutionSections = {
    claude: renderResolutions(classification.live, entries, RULE_AUDIENCE.Claude),
    agents: renderResolutions(classification.live, entries, RULE_AUDIENCE.Agents),
    copilot: renderResolutions(classification.live, entries, RULE_AUDIENCE.Copilot),
  };
  return classification;
}

/**
 * One stderr warning per unknown `agents:` value or valueless key (slice 935).
 * With no rules directory the target's `requireRulesDir` aborts instead.
 */
function warnAudienceProblems(base: InstallBase): void {
  if (!isDirectory(base.guide.rules)) return;
  for (const problem of unknownAudienceValues(base.guide.rules)) {
    base.out.statusErr('yellow', audienceProblemMessage(problem));
  }
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
    force: options.force,
    out,
    exclusions: new RuleExclusions(options.rulesExclude),
    resolutionSections: { claude: '', agents: '', copilot: '' },
  };

  try {
    out.status('blue', `📍 Project root detected: ${projectRoot}`);
    out.status('blue', `📍 IDE directories will be created in: ${targetRoot}`);
    out.line();
    const stale = classifyForInstall(options, base);
    warnAudienceProblems(base);
    if (options.dryRun) dryRunInstall(options.target, base, installTarget);
    else installTarget(options.target, base);
    base.exclusions.warnUnmatched(base.guide.rules, out);
    if (stale !== null) warnStaleResolutions(stale, out);
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
