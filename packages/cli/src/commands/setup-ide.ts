import * as fs from 'node:fs';
import * as path from 'node:path';
import { askConfirmation } from '../utils/confirm.js';
import { execFileSync } from 'node:child_process';
import { Command } from 'commander';
import {
  FileProjectStore,
  GuideDetector,
  GUIDE_RELATIVE_PATH,
  GUIDE_OFFLINE_REMEDIATION,
} from '@context-forge/core/node';
import { resolveProjectId } from '../utils/project.js';
import { withProjectOption, withYesOption } from '../options.js';
import { handleError, UserError } from '../utils/errors.js';
import { ensureGuideReady } from '../utils/guideReady.js';

import { normalizeTarget, invalidTargetMessage, TARGETS, MANAGED_MARKERS } from './ideTargets.js';
import { installCommandsForTarget } from './commandInstaller.js';
import { propagateToWorktrees } from './worktreePropagation.js';
import {
  GuideCapability,
  capabilityFlag,
  guideSupports,
  readCapabilities,
  runSetupIdeInWorktrees,
  type GuideCapabilityValue,
} from './guideScript.js';
import { readManifest } from './installManifest.js';

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

/** What a completed root setup-ide run needs to hand to the worktree step. */
export interface SetupIdeRun {
  scriptPath: string;
  /** `setup-ide --capabilities` words, or null for a guide older than v0.20.1. */
  capabilities: ReadonlySet<string> | null;
  /** Pass-through flags given to the root run; worktree runs get the same ones. */
  flags: string[];
}

/**
 * Run IDE setup for a project. Errors propagate to the caller. Returns the run
 * details when the guide script ran, null when the user declined the overwrite prompt.
 * With `dryRun`, the guide script previews its changes and writes nothing, so
 * the overwrite prompt and cf's own marker-file backups are skipped too.
 * With `writeLint`, the guide script also writes the missing lint configs it
 * reports. Both are refused when the installed guide's script does not handle them.
 */
export async function setupIdeAction(
  projectPath: string,
  target: string,
  opts?: { yes?: boolean; dryRun?: boolean; writeLint?: boolean }
): Promise<SetupIdeRun | null> {
  // Validate and normalize target — everything downstream uses the canonical value
  const normalizedTarget = normalizeTarget(target);
  if (!normalizedTarget) {
    throw new UserError(invalidTargetMessage(target));
  }

  // Check guide installation. Auto-init first: an uninitialized submodule
  // reports as installed but has no scripts/ directory, which used to surface
  // as a confusing "script not found" (#80).
  await ensureGuideReady(projectPath);

  const detector = new GuideDetector();
  const guideInfo = await detector.detect(projectPath);

  if (!guideInfo.installed) {
    // setup-ide fails before any network call — guides are simply absent from
    // disk, so we cannot know why an earlier install failed. Point at the fix
    // and, since a failed install is the common cause, at the offline path (#78).
    throw new UserError(
      "Guides are not installed. Run 'cf guides install' first.\n" +
        `  If that install fails to reach the guide repo: ${GUIDE_OFFLINE_REMEDIATION}`,
    );
  }

  // Locate setup-ide script
  const guideDir = path.join(projectPath, GUIDE_RELATIVE_PATH);
  const scriptPath = path.join(guideDir, 'scripts/setup-ide');

  if (!fs.existsSync(scriptPath)) {
    throw new UserError(
      `setup-ide script not found at ${scriptPath}. Your guides installation may be incomplete — try 'cf guides update'.`,
    );
  }

  // Refuse a flag the script does not handle: an older guide would ignore it,
  // and an ignored --dry-run runs a real install with cf's backups skipped.
  const capabilities = readCapabilities(scriptPath, projectPath);
  const requested: GuideCapabilityValue[] = [];
  if (opts?.dryRun) requested.push(GuideCapability.DryRun);
  if (opts?.writeLint) requested.push(GuideCapability.WriteLint);
  const unsupported = requested.filter((c) => !guideSupports(scriptPath, capabilities, c));
  if (unsupported.length > 0) {
    throw new UserError(
      `This guide version does not support ${unsupported.map(capabilityFlag).join(', ')}. Run 'cf guides update' and retry.`,
    );
  }
  const passFlags = requested.map(capabilityFlag);

  // Safety check — descriptor-driven, identical shape for every target
  const descriptor = TARGETS[normalizedTarget];
  const markerPaths = descriptor.markerFiles.map((rel) => path.join(projectPath, ...rel.split('/')));

  if (!opts?.dryRun && !isManagedInstall(projectPath, descriptor.markerFiles)) {
    const existingPaths = markerPaths.filter((p) => fs.existsSync(p));

    if (existingPaths.length > 0) {
      if (!opts?.yes) {
        console.error(`Warning: ${descriptor.label} IDE files already exist and will be overwritten.`);
        const confirmed = await askConfirmation('Continue? (y/N) ');
        if (!confirmed) {
          console.error('Aborted.');
          return null;
        }
      }

      // A guide that reports capabilities (v0.20.1+) backs these files up
      // itself, to <name>.pre-context-forge; a second .bak would be noise.
      for (const filePath of capabilities ? [] : existingPaths) {
        const bakPath = `${filePath}.bak`;
        if (!fs.existsSync(bakPath)) {
          fs.copyFileSync(filePath, bakPath);
          console.log(`Backed up ${path.relative(projectPath, filePath)} → ${path.relative(projectPath, bakPath)}`);
        } else {
          console.log(`existing backup preserved at ${path.relative(projectPath, bakPath)}`);
        }
      }
    }
    // else: none of the marker files exist — fresh install, proceed silently
  }
  // else: managed install or dry run — proceed silently

  // Run the setup-ide script
  const scriptArgs = [scriptPath, normalizedTarget, ...passFlags];
  try {
    execFileSync('bash', scriptArgs, {
      cwd: projectPath,
      stdio: 'inherit',
    });
  } catch (err) {
    const code = (err as { status?: number }).status ?? 'unknown';
    throw new UserError(
      `setup-ide exited with code ${code}. Check the output above for details.`,
    );
  }

  console.error(
    opts?.dryRun
      ? `Dry run complete for ${normalizedTarget}. Nothing was written.`
      : `IDE setup complete for ${normalizedTarget}.`,
  );
  return { scriptPath, capabilities, flags: passFlags };
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
    'Also write missing lint configs the guide reports (ruff.toml, eslint.config.mjs, ...); with --dry-run, preview them',
  );
  ideCmd.action(async (target: string, opts: { project?: string; yes?: boolean; dryRun?: boolean; writeLint?: boolean }) => {
      try {
        // Validate and normalize target early (before project resolution for fast
        // failure). Both downstream calls use the normalized value — an alias like
        // 'codex' has no entry in TARGETS, and propagateToWorktrees throws on a miss.
        const normalizedTarget = normalizeTarget(target);
        if (!normalizedTarget) {
          throw new UserError(invalidTargetMessage(target));
        }

        // Resolve project
        const store = new FileProjectStore();
        const { id } = await resolveProjectId(opts.project, store);
        const project = await store.getById(id);

        if (!project) {
          throw new UserError(`Project not found: '${id}'.`);
        }
        if (!project.projectPath) {
          throw new UserError(
            `Project '${project.name}' has no configured project path.\n` +
              '  Run cf init in the project directory to set the path.',
          );
        }

        // Declined overwrite prompt: the root is unchanged, so worktrees must be too.
        // Propagation prunes, and a "no" must never delete files.
        // Snapshot before the script rewrites it: part of each worktree's prune
        // baseline, so worktrees with no manifest of their own still prune.
        const rootBaseline = readManifest(project.projectPath, normalizedTarget);
        const run = await setupIdeAction(project.projectPath, normalizedTarget, {
          yes: opts.yes,
          dryRun: opts.dryRun,
          writeLint: opts.writeLint,
        });
        if (!run) return;

        // Worktrees: a guide with --root installs each one itself (dry runs
        // included). An older guide gets cf's copy-and-prune, which cannot
        // preview, so a dry run leaves worktrees out.
        let failedWorktrees: string[] = [];
        if (guideSupports(run.scriptPath, run.capabilities, GuideCapability.Root)) {
          failedWorktrees = runSetupIdeInWorktrees(project, run.scriptPath, normalizedTarget, run.flags);
        } else if (!opts.dryRun) {
          propagateToWorktrees(project, normalizedTarget, rootBaseline);
        }

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
