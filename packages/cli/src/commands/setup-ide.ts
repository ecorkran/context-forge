import * as fs from 'node:fs';
import * as path from 'node:path';
import * as readline from 'node:readline';
import { execFileSync } from 'node:child_process';
import { Command } from 'commander';
import { FileProjectStore, GuideDetector, GUIDE_RELATIVE_PATH } from '@context-forge/core/node';
import { resolveProjectId } from '../utils/project.js';
import { withProjectOption, withYesOption } from '../options.js';
import { handleError, UserError } from '../utils/errors.js';

const VALID_TARGETS = ['claude'] as const;
type Target = (typeof VALID_TARGETS)[number];

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

/** Returns true if the file contains the context-forge managed marker in the first 20 lines. */
export function isManagedClaudeMd(filePath: string): boolean {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n').slice(0, 20);
  return lines.some((line) => line.trim() === '[//]: # (context-forge:managed)');
}

/** Run IDE setup for a project. Errors propagate to the caller. */
export async function setupIdeAction(
  projectPath: string,
  target: string,
  opts?: { yes?: boolean }
): Promise<void> {
  // Validate target
  if (!VALID_TARGETS.includes(target as Target)) {
    throw new UserError(
      `Invalid target '${target}'. Valid targets: ${VALID_TARGETS.join(', ')}`,
    );
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

  if (fs.existsSync(claudeMdPath)) {
    if (isManagedClaudeMd(claudeMdPath)) {
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

export function registerSetupIdeCommand(program: Command): void {
  const ideCmd = program
    .command('setup-ide')
    .description('Configure IDE-specific AI integration files for the current project')
    .argument('<target>', `IDE target: ${VALID_TARGETS.join(', ')}`);
  withProjectOption(ideCmd);
  withYesOption(ideCmd);
  ideCmd.action(async (target: string, opts: { project?: string; yes?: boolean }) => {
      try {
        // Validate target early (before project resolution for fast failure)
        if (!VALID_TARGETS.includes(target as Target)) {
          throw new UserError(
            `Invalid target '${target}'. Valid targets: ${VALID_TARGETS.join(', ')}`,
          );
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
      } catch (err) {
        handleError(err);
      }
    });
}
