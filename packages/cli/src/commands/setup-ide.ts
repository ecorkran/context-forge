import * as fs from 'node:fs';
import * as path from 'node:path';
import * as readline from 'node:readline';
import { execFileSync } from 'node:child_process';
import { Command } from 'commander';
import {
  FileProjectStore,
  GuideDetector,
  GUIDE_RELATIVE_PATH,
  GUIDE_OFFLINE_REMEDIATION,
} from '@context-forge/core/node';
import type { ProjectData } from '@context-forge/core';
import { resolveProjectId } from '../utils/project.js';
import { withProjectOption, withYesOption } from '../options.js';
import { handleError, UserError } from '../utils/errors.js';
import { ensureGuideReady } from '../utils/guideReady.js';

import { normalizeTarget, invalidTargetMessage, type Target } from './ideTargets.js';
import { installCommandsForTarget } from './commandInstaller.js';

// Re-exported so existing importers (tests, init.ts) keep one import site.
export { normalizeTarget, invalidTargetMessage, TARGET_ALIASES, type Target } from './ideTargets.js';

export interface TargetDescriptor {
  /** Files probed for the managed marker; also the files backed up before overwrite. */
  markerFiles: string[];
  /** Directories copied to worktrees, recursively. */
  propagateDirs: string[];
  /** Label used in prompts and completion messages. */
  label: string;
}

/**
 * One definition per target drives validation, the managed-marker check, backup,
 * and worktree propagation. The `Record<Target, TargetDescriptor>` annotation makes
 * the compiler reject a target added to the `Target` union without an entry here.
 */
export const TARGETS: Record<Target, TargetDescriptor> = {
  claude: {
    markerFiles: ['CLAUDE.md'],
    propagateDirs: ['.claude/rules', '.claude/agents', '.claude/skills'],
    label: 'Claude Code',
  },
  copilot: {
    markerFiles: ['.github/copilot-instructions.md', 'AGENTS.md'],
    propagateDirs: ['.github/instructions', '.github/prompts'],
    label: 'GitHub Copilot',
  },
  cursor: {
    markerFiles: ['AGENTS.md'],
    propagateDirs: ['.cursor/rules'],
    label: 'Cursor',
  },
  agents: {
    markerFiles: ['AGENTS.md'],
    propagateDirs: ['.agents/skills'],
    label: 'agents',
  },
};

/** Prompt user for y/N confirmation via stdin. Returns true if confirmed. */
function askConfirmation(prompt: string): Promise<boolean> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase() === 'y');
    });
  });
}

/** Legacy managed marker. Matched as a trimmed exact line. */
export const MANAGED_MARKER = '[//]: # (context-forge:managed)';

/**
 * Current managed marker, opening a BEGIN/END pair. Matched as a substring:
 * the line may be indented or carry trailing content.
 */
export const MANAGED_BEGIN_MARKER = '<!-- BEGIN:context-forge -->';

/**
 * Every form that marks a file as context-forge-managed.
 *
 * The guide's `setup-ide` script is the sole writer of these markers; cf only
 * reads them. Both forms live here so the literals appear in exactly one place.
 */
export const MANAGED_MARKERS = [
  { marker: MANAGED_MARKER, match: 'exact-line' },
  { marker: MANAGED_BEGIN_MARKER, match: 'contains' },
] as const;

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

/** Run IDE setup for a project. Errors propagate to the caller. */
export async function setupIdeAction(
  projectPath: string,
  target: string,
  opts?: { yes?: boolean }
): Promise<void> {
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

  // Safety check — descriptor-driven, identical shape for every target
  const descriptor = TARGETS[normalizedTarget];
  const markerPaths = descriptor.markerFiles.map((rel) => path.join(projectPath, ...rel.split('/')));

  if (!isManagedInstall(projectPath, descriptor.markerFiles)) {
    const existingPaths = markerPaths.filter((p) => fs.existsSync(p));

    if (existingPaths.length > 0) {
      if (!opts?.yes) {
        console.error(`Warning: ${descriptor.label} IDE files already exist and will be overwritten.`);
        const confirmed = await askConfirmation('Continue? (y/N) ');
        if (!confirmed) {
          console.error('Aborted.');
          return;
        }
      }

      for (const filePath of existingPaths) {
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
  // else: managed install — proceed silently

  // Run the setup-ide script
  try {
    execFileSync('bash', [scriptPath, normalizedTarget], {
      cwd: projectPath,
      stdio: 'inherit',
    });
  } catch (err) {
    const code = (err as { status?: number }).status ?? 'unknown';
    throw new UserError(
      `setup-ide exited with code ${code}. Check the output above for details.`,
    );
  }

  console.error(`IDE setup complete for ${normalizedTarget}.`);
}

/**
 * Propagate IDE-generated files from the project root to all registered worktrees.
 *
 * The setup-ide script always writes to the project root (its find_project_root()
 * walks up to the nearest directory containing project-documents/, which is always
 * the root). Worktrees share the same guides submodule source but have independent
 * working trees, so without propagation their compiled IDE files go stale after
 * every root setup-ide run.
 *
 * Descriptor-driven: each target's `markerFiles` and `propagateDirs` (see TARGETS)
 * define exactly what is copied. `.claude/settings.local.json` and `.claude/worktrees/`
 * stay out because neither appears in any target's `propagateDirs` — the former is
 * worktree-specific, the latter is the cf worktree registry and root-only.
 */
export function propagateToWorktrees(project: ProjectData, target: string): void {
  const rootPath = project.projectPath!;
  const resolvedRootPath = path.resolve(rootPath);

  // WorktreeService migrates a project's pre-worktree workflow fields into a
  // "default" worktree context whose worktreePath IS the project root (see
  // WorktreeService.ts). Propagating the root onto itself is a no-op at best;
  // fs.cpSync throws ERR_FS_CP_EINVAL when src and dest are the same path, so
  // this must be filtered out rather than merely being harmless.
  const worktrees = (project.worktrees ?? []).filter(
    (wt) => wt.worktreePath && fs.existsSync(wt.worktreePath) && path.resolve(wt.worktreePath) !== resolvedRootPath,
  );
  if (worktrees.length === 0) return;

  const resolvedTarget = normalizeTarget(target);
  if (!resolvedTarget) {
    throw new UserError(`No propagation descriptor for target '${target}'.`);
  }
  const descriptor = TARGETS[resolvedTarget];

  for (const wt of worktrees) {
    const wtPath = wt.worktreePath!;
    console.log(`  → propagating to worktree: ${wt.name ?? wt.id} (${wtPath})`);

    for (const relFile of descriptor.markerFiles) {
      const srcFile = path.join(rootPath, ...relFile.split('/'));
      if (!fs.existsSync(srcFile)) continue;
      const dstFile = path.join(wtPath, ...relFile.split('/'));
      fs.mkdirSync(path.dirname(dstFile), { recursive: true });
      fs.copyFileSync(srcFile, dstFile);
    }

    for (const relDir of descriptor.propagateDirs) {
      const srcDir = path.join(rootPath, ...relDir.split('/'));
      if (!fs.existsSync(srcDir)) continue;
      const dstDir = path.join(wtPath, ...relDir.split('/'));
      fs.cpSync(srcDir, dstDir, { recursive: true });
    }
  }

  console.log(`  Propagated to ${worktrees.length} worktree${worktrees.length !== 1 ? 's' : ''}.`);
}

export function registerSetupIdeCommand(program: Command): void {
  const ideCmd = program
    .command('setup-ide')
    .description('Configure IDE-specific AI integration files for the current project')
    .argument('<target>', 'IDE target: claude, copilot, cursor, agents (aliases: openai, codex)');
  withProjectOption(ideCmd);
  withYesOption(ideCmd);
  ideCmd.action(async (target: string, opts: { project?: string; yes?: boolean }) => {
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

        await setupIdeAction(project.projectPath, normalizedTarget, { yes: opts.yes });
        propagateToWorktrees(project, normalizedTarget);

        // Command/skill delivery: setup-ide is a machine-level operation, so it
        // installs to the global directory (design D5). Targets without command
        // delivery (copilot, cursor) skip this step silently.
        if (normalizedTarget === 'claude' || normalizedTarget === 'agents') {
          installCommandsForTarget(normalizedTarget);
        }
      } catch (err) {
        handleError(err);
      }
    });
}
