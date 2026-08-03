import * as fs from 'node:fs';
import * as path from 'node:path';
import * as readline from 'node:readline';
import { execFileSync } from 'node:child_process';
import { Command } from 'commander';
import { FileProjectStore, GuideDetector, GUIDE_RELATIVE_PATH } from '@context-forge/core/node';
import type { ProjectData } from '@context-forge/core';
import { resolveProjectId } from '../utils/project.js';
import { withProjectOption, withYesOption } from '../options.js';
import { handleError, UserError } from '../utils/errors.js';

export type Target = 'claude' | 'copilot' | 'cursor' | 'agents';

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

/** Aliases resolved to a canonical target before anything downstream sees the input. */
export const TARGET_ALIASES: Record<string, Target> = { openai: 'agents', codex: 'agents' };

/** Resolves a target string (case/whitespace-insensitive) to its canonical form, or null if unknown. */
export function normalizeTarget(input: string): Target | null {
  const normalized = input.trim().toLowerCase();
  if (normalized in TARGETS) return normalized as Target;
  if (normalized in TARGET_ALIASES) return TARGET_ALIASES[normalized];
  return null;
}

/** Groups TARGET_ALIASES by canonical target, e.g. "openai, codex → agents". */
function describeAliases(): string {
  const byTarget = new Map<Target, string[]>();
  for (const [alias, target] of Object.entries(TARGET_ALIASES)) {
    const group = byTarget.get(target) ?? [];
    group.push(alias);
    byTarget.set(target, group);
  }
  return Array.from(byTarget.entries())
    .map(([target, aliases]) => `${aliases.join(', ')} → ${target}`)
    .join(', ');
}

/** Built from TARGETS/TARGET_ALIASES so the message can never drift from what normalizeTarget accepts. */
export function invalidTargetMessage(input: string): string {
  return `Invalid target '${input}'. Valid targets: ${Object.keys(TARGETS).join(', ')} (aliases: ${describeAliases()})`;
}

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

export const MANAGED_MARKER = '[//]: # (context-forge:managed)';

/**
 * Returns true if any of the given (root-relative, `/`-separated) files exists
 * and carries the managed marker in its first 20 lines. Returns false when none
 * of the listed files exists (new install).
 */
export function isManagedInstall(projectPath: string, markerFiles: string[]): boolean {
  for (const relPath of markerFiles) {
    const filePath = path.join(projectPath, ...relPath.split('/'));
    if (!fs.existsSync(filePath)) continue;
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n').slice(0, 20);
    if (lines.some((line) => line.trim() === MANAGED_MARKER)) {
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
  // Validate target
  if (!normalizeTarget(target)) {
    throw new UserError(invalidTargetMessage(target));
  }

  // Check guide installation
  const detector = new GuideDetector();
  const guideInfo = await detector.detect(projectPath);

  if (!guideInfo.installed) {
    throw new UserError(
      "Guides are not installed. Run 'cf guides install' first.",
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

  // CLAUDE.md safety check
  const claudeMdPath = path.join(projectPath, 'CLAUDE.md');
  const claudeMdBakPath = path.join(projectPath, 'CLAUDE.md.bak');

  if (target === 'claude') {
    if (fs.existsSync(claudeMdPath)) {
      if (isManagedInstall(projectPath, TARGETS.claude.markerFiles)) {
        // Managed file — skip backup silently
      } else {
        // Not managed — possibly prompt, then backup logic
        if (!opts?.yes) {
          console.error('Warning: CLAUDE.md already exists and will be overwritten.');
          const confirmed = await askConfirmation('Continue? (y/N) ');
          if (!confirmed) {
            console.error('Aborted.');
            return;
          }
        }
        if (!fs.existsSync(claudeMdBakPath)) {
          fs.copyFileSync(claudeMdPath, claudeMdBakPath);
          console.log('Backed up CLAUDE.md → CLAUDE.md.bak');
        } else {
          console.log('existing backup preserved at CLAUDE.md.bak');
        }
      }
    }
  } else if (target === 'copilot') {
    // Copilot safety check: only prompt when unmanaged files exist
    if (!isManagedInstall(projectPath, TARGETS.copilot.markerFiles)) {
      const copilotInstructionsPath = path.join(projectPath, '.github', 'copilot-instructions.md');
      const agentsMdPath = path.join(projectPath, 'AGENTS.md');
      const eitherExists = fs.existsSync(copilotInstructionsPath) || fs.existsSync(agentsMdPath);

      if (eitherExists) {
        if (!opts?.yes) {
          console.error('Warning: Copilot IDE files already exist and will be overwritten.');
          const confirmed = await askConfirmation('Continue? (y/N) ');
          if (!confirmed) {
            console.error('Aborted.');
            return;
          }
        }
        // Backup each file if it exists and no .bak already present
        for (const [src, bak] of [
          [copilotInstructionsPath, `${copilotInstructionsPath}.bak`],
          [agentsMdPath, `${agentsMdPath}.bak`],
        ] as [string, string][]) {
          if (fs.existsSync(src)) {
            if (!fs.existsSync(bak)) {
              fs.copyFileSync(src, bak);
              console.log(`Backed up ${path.relative(projectPath, src)} → ${path.relative(projectPath, bak)}`);
            } else {
              console.log(`existing backup preserved at ${path.relative(projectPath, bak)}`);
            }
          }
        }
      }
    }
    // Managed or no files: proceed silently
  }

  // Run the setup-ide script
  try {
    execFileSync('bash', [scriptPath, target], {
      cwd: projectPath,
      stdio: 'inherit',
    });
  } catch (err) {
    const code = (err as { status?: number }).status ?? 'unknown';
    throw new UserError(
      `setup-ide exited with code ${code}. Check the output above for details.`,
    );
  }

  console.error(`IDE setup complete for ${target}.`);
}

/**
 * Propagate IDE-generated files from the project root to all registered worktrees.
 *
 * The setup-ide script always writes to the project root (its find_project_root()
 * walks up to the nearest directory containing project-documents/, which is always
 * the root). Worktrees share the same guides submodule source but have independent
 * working trees, so without propagation their CLAUDE.md and .claude/ config files
 * go stale after every root setup-ide run.
 *
 * Files propagated (claude target):
 *   CLAUDE.md               — compiled from alwaysApply rules
 *   .claude/rules/          — modular (non-alwaysApply) rule files
 *   .claude/agents/         — agent definition files
 *   .claude/skills/         — skill definition files
 *
 * Files intentionally NOT propagated:
 *   .claude/settings.local.json  — worktree-specific user settings
 *   .claude/worktrees/           — cf worktree registry, root-only
 */
function propagateToWorktrees(project: ProjectData, target: string): void {
  const worktrees = (project.worktrees ?? []).filter((wt) => wt.worktreePath && fs.existsSync(wt.worktreePath));
  if (worktrees.length === 0) return;

  const rootPath = project.projectPath!;

  for (const wt of worktrees) {
    const wtPath = wt.worktreePath!;
    console.log(`  → propagating to worktree: ${wt.name ?? wt.id} (${wtPath})`);

    if (target === 'claude') {
      // CLAUDE.md
      const srcMd = path.join(rootPath, 'CLAUDE.md');
      if (fs.existsSync(srcMd)) {
        fs.copyFileSync(srcMd, path.join(wtPath, 'CLAUDE.md'));
      }

      // .claude/{rules,agents,skills}
      for (const dir of ['rules', 'agents', 'skills']) {
        const srcDir = path.join(rootPath, '.claude', dir);
        const dstDir = path.join(wtPath, '.claude', dir);
        if (!fs.existsSync(srcDir)) continue;
        fs.mkdirSync(dstDir, { recursive: true });
        for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
          if (entry.isFile()) {
            fs.copyFileSync(path.join(srcDir, entry.name), path.join(dstDir, entry.name));
          }
        }
      }
    } else if (target === 'copilot') {
      // AGENTS.md
      const srcAgents = path.join(rootPath, 'AGENTS.md');
      if (fs.existsSync(srcAgents)) {
        fs.copyFileSync(srcAgents, path.join(wtPath, 'AGENTS.md'));
      }

      // .github/copilot-instructions.md
      const srcInstructions = path.join(rootPath, '.github', 'copilot-instructions.md');
      if (fs.existsSync(srcInstructions)) {
        fs.mkdirSync(path.join(wtPath, '.github'), { recursive: true });
        fs.copyFileSync(srcInstructions, path.join(wtPath, '.github', 'copilot-instructions.md'));
      }

      // .github/instructions/ and .github/prompts/
      for (const dir of ['instructions', 'prompts']) {
        const srcDir = path.join(rootPath, '.github', dir);
        const dstDir = path.join(wtPath, '.github', dir);
        if (!fs.existsSync(srcDir)) continue;
        fs.mkdirSync(dstDir, { recursive: true });
        for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
          if (entry.isFile()) {
            fs.copyFileSync(path.join(srcDir, entry.name), path.join(dstDir, entry.name));
          }
        }
      }
    }
    // Future targets (cursor, windsurf) would propagate their own dirs here.
  }

  console.log(`  Propagated to ${worktrees.length} worktree${worktrees.length !== 1 ? 's' : ''}.`);
}

export function registerSetupIdeCommand(program: Command): void {
  const ideCmd = program
    .command('setup-ide')
    .description('Configure IDE-specific AI integration files for the current project')
    .argument('<target>', 'IDE target: claude, copilot');
  withProjectOption(ideCmd);
  withYesOption(ideCmd);
  ideCmd.action(async (target: string, opts: { project?: string; yes?: boolean }) => {
      try {
        // Validate target early (before project resolution for fast failure)
        if (!normalizeTarget(target)) {
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

        await setupIdeAction(project.projectPath, target, { yes: opts.yes });
        propagateToWorktrees(project, target);
      } catch (err) {
        handleError(err);
      }
    });
}
