import * as fs from 'node:fs';
import * as path from 'node:path';
import { askConfirmation } from '../utils/confirm.js';
import { Command } from 'commander';
import type { ProjectData } from '@context-forge/core';
import {
  ConfigManager,
  parseRulesExclude,
  readRuleResolutions,
} from '@context-forge/core/node';
import { resolvePathedProject } from '../utils/project.js';
import { withProjectOption, withYesOption } from '../options.js';
import { handleError, UserError } from '../utils/errors.js';
import { requireGuideDir } from '../utils/guideReady.js';

import { normalizeTarget, invalidTargetMessage, TARGETS, MANAGED_MARKERS, type Target } from './ideTargets.js';
import { installCommandsForTarget } from './commandInstaller.js';
import { propagationTargets } from './worktreePropagation.js';
import { installIde } from '../ideInstall/installer.js';
import type { OutputSink } from '../ideInstall/output.js';

// Re-exported so existing importers (tests, init.ts) keep one import site.
export {
  normalizeTarget,
  invalidTargetMessage,
  TARGET_ALIASES,
  TARGETS,
  MANAGED_MARKER,
  MANAGED_BEGIN_MARKER,
  MANAGED_MARKERS,
  type Target,
  type TargetDescriptor,
} from './ideTargets.js';

/** True if a single line carries any managed marker. */
function lineIsManagedMarker(line: string): boolean {
  return MANAGED_MARKERS.some(({ marker, match }) =>
    match === 'exact-line' ? line.trim() === marker : line.includes(marker),
  );
}

/**
 * Returns true if any of the given (root-relative, `/`-separated) files exists
 * and carries a managed marker anywhere in the file. Returns false when none of
 * the listed files exists (new install).
 *
 * The whole file is searched, not a leading window: the guide preserves
 * pre-existing user content and appends the managed block below it, so the
 * marker's position is a function of how much the project wrote above it and is
 * unbounded (#98).
 */
export function isManagedInstall(projectPath: string, markerFiles: string[]): boolean {
  for (const relPath of markerFiles) {
    const filePath = path.join(projectPath, ...relPath.split('/'));
    if (!fs.existsSync(filePath)) continue;
    const content = fs.readFileSync(filePath, 'utf-8');
    if (content.split('\n').some(lineIsManagedMarker)) {
      return true;
    }
  }

  return false;
}

/** The installer writes straight to the process streams. */
const PROCESS_OUTPUT: OutputSink = {
  stdout: (text) => process.stdout.write(text),
  stderr: (text) => process.stderr.write(text),
};

/** `rules.exclude` as configured for the checkout at root (a worktree can carry its own). */
export async function readRulesExclude(root: string): Promise<string[]> {
  const { value } = await new ConfigManager(root).get('rules.exclude');
  if (typeof value !== 'string') {
    throw new Error(`rules.exclude resolved to a ${typeof value}, expected a string`);
  }
  return parseRulesExclude(value);
}

export interface InstallFlags {
  dryRun: boolean;
  writeLint: boolean;
  force: boolean;
}

/** Install one checkout from guideDir. Exit 1 means the install reported its failure. */
async function installCheckout(guideDir: string, root: string, target: Target, flags: InstallFlags): Promise<0 | 1> {
  const { exitCode } = installIde({
    guideDir,
    projectRoot: root,
    targetRoot: root,
    target,
    dryRun: flags.dryRun,
    writeLint: flags.writeLint,
    force: flags.force,
    rulesExclude: await readRulesExclude(root),
    // Read (and validated) before installIde runs, so a malformed file writes nothing.
    ruleResolutions: readRuleResolutions(root),
    out: PROCESS_OUTPUT,
  });
  return exitCode;
}

/** What a completed root install hands to the worktree step. */
export interface SetupIdeRun {
  /** The main checkout's guide: worktrees install from it too. */
  guideDir: string;
}

/**
 * Run IDE setup for a project. Errors propagate to the caller. Returns the run
 * details, or null when the user declined the overwrite prompt. With `dryRun`
 * the install previews its changes and writes nothing, so the overwrite prompt
 * is skipped too. With `writeLint`, missing lint configs are also written.
 */
export async function setupIdeAction(
  projectPath: string,
  target: string,
  opts?: { yes?: boolean; dryRun?: boolean; writeLint?: boolean; force?: boolean }
): Promise<SetupIdeRun | null> {
  // Validate and normalize target — everything downstream uses the canonical value
  const normalizedTarget = normalizeTarget(target);
  if (!normalizedTarget) {
    throw new UserError(invalidTargetMessage(target));
  }

  const guideDir = await requireGuideDir(projectPath);

  // Safety check — descriptor-driven, identical shape for every target. The
  // installer itself backs up a file it has never managed, to
  // <name>.pre-context-forge, so this only asks before touching it.
  const descriptor = TARGETS[normalizedTarget];
  if (!opts?.dryRun && !opts?.yes && !isManagedInstall(projectPath, descriptor.markerFiles)) {
    const existing = descriptor.markerFiles.filter((rel) => fs.existsSync(path.join(projectPath, ...rel.split('/'))));
    if (existing.length > 0) {
      console.error(`Warning: ${descriptor.label} IDE files already exist and will be overwritten.`);
      const confirmed = await askConfirmation('Continue? (y/N) ');
      if (!confirmed) {
        console.error('Aborted.');
        return null;
      }
    }
  }

  const flags: InstallFlags = {
    dryRun: opts?.dryRun ?? false,
    writeLint: opts?.writeLint ?? false,
    force: opts?.force ?? false,
  };
  if ((await installCheckout(guideDir, projectPath, normalizedTarget, flags)) !== 0) {
    throw new UserError(`setup-ide failed for ${normalizedTarget}. Check the output above for details.`);
  }

  console.error(
    opts?.dryRun
      ? `Dry run complete for ${normalizedTarget}. Nothing was written.`
      : `IDE setup complete for ${normalizedTarget}.`,
  );
  return { guideDir };
}

/**
 * Install every registered worktree from the main checkout's guide, each with
 * its own root and its own rules.exclude. A worktree whose install fails (exit
 * 1, which includes filesystem errors) is recorded and the loop continues; any
 * other exception is a bug and propagates. Returns the names that failed.
 */
export async function installWorktrees(
  project: ProjectData,
  guideDir: string,
  target: Target,
  flags: InstallFlags,
): Promise<string[]> {
  const failed: string[] = [];
  for (const wt of propagationTargets(project)) {
    const wtPath = wt.worktreePath!;
    const name = wt.name ?? wt.id;
    console.log(`  → setup-ide in worktree: ${name} (${wtPath})`);
    if ((await installCheckout(guideDir, wtPath, target, flags)) !== 0) {
      console.error(`  setup-ide failed in worktree ${name}.`);
      failed.push(name);
    }
  }
  return failed;
}

export function registerSetupIdeCommand(program: Command): void {
  const ideCmd = program
    .command('setup-ide')
    .description('Configure IDE-specific AI integration files for the current project')
    .argument('<target>', 'IDE target: claude, copilot, cursor, agents (aliases: openai, codex)');
  withProjectOption(ideCmd);
  withYesOption(ideCmd);
  ideCmd.option('--dry-run', 'Preview the files setup-ide would add, change, or remove; write nothing');
  ideCmd.option(
    '--write-lint',
    'Also write missing lint configs the lint check reports (ruff.toml, eslint.config.mjs, ...); with --dry-run, preview them',
  );
  ideCmd.option(
    '--force',
    'Replace rule files setup-ide would skip (unmanaged or edited), saving each old file as <name>.pre-context-forge; with --dry-run, preview them',
  );
  ideCmd.action(async (target: string, opts: { project?: string; yes?: boolean; dryRun?: boolean; writeLint?: boolean; force?: boolean }) => {
      try {
        // Validate and normalize target early (before project resolution for fast
        // failure). Everything downstream uses the normalized value.
        const normalizedTarget = normalizeTarget(target);
        if (!normalizedTarget) {
          throw new UserError(invalidTargetMessage(target));
        }

        const project = await resolvePathedProject(opts.project);

        const run = await setupIdeAction(project.projectPath, normalizedTarget, {
          yes: opts.yes,
          dryRun: opts.dryRun,
          writeLint: opts.writeLint,
          force: opts.force,
        });
        // Declined overwrite prompt: the root is unchanged, so worktrees must be too.
        if (!run) return;

        // Each worktree is installed from the main checkout's guide, dry runs included.
        const failedWorktrees = await installWorktrees(project, run.guideDir, normalizedTarget, {
          dryRun: opts.dryRun ?? false,
          writeLint: opts.writeLint ?? false,
          force: opts.force ?? false,
        });

        // Command/skill delivery: setup-ide is a machine-level operation, so it
        // installs to the global directory (design D5). Targets without command
        // delivery (copilot, cursor) skip this step silently. A dry run writes nothing.
        if (!opts.dryRun && (normalizedTarget === 'claude' || normalizedTarget === 'agents')) {
          installCommandsForTarget(normalizedTarget);
        }

        if (failedWorktrees.length > 0) {
          throw new UserError(
            `setup-ide failed in worktree(s): ${failedWorktrees.join(', ')}. Check the output above for details.`,
          );
        }
      } catch (err) {
        handleError(err);
      }
    });
}
