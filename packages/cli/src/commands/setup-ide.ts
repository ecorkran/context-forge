import * as fs from 'node:fs';
import * as path from 'node:path';
import * as readline from 'node:readline';
import { execFileSync } from 'node:child_process';
import { Command } from 'commander';
import { FileProjectStore, GuideDetector, GUIDE_RELATIVE_PATH } from '@context-forge/core/node';
import { resolveProjectId } from '../utils/project.js';
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

export function registerSetupIdeCommand(program: Command): void {
  program
    .command('setup-ide')
    .description('Configure IDE-specific AI integration files for the current project')
    .argument('<target>', `IDE target: ${VALID_TARGETS.join(', ')}`)
    .option('--project <name|id>', 'Project name or ID')
    .option('--yes', 'Skip confirmation prompts')
    .action(async (target: string, opts: { project?: string; yes?: boolean }) => {
      try {
        // Validate target
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
        const projectPath = project.projectPath;

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

        if (fs.existsSync(claudeMdPath)) {
          if (!opts.yes) {
            console.error('Warning: CLAUDE.md already exists and will be overwritten.');
            const confirmed = await askConfirmation('Continue? (y/N) ');
            if (!confirmed) {
              console.error('Aborted.');
              return;
            }
          }
          fs.copyFileSync(claudeMdPath, path.join(projectPath, 'CLAUDE.md.bak'));
          console.error('Backed up CLAUDE.md → CLAUDE.md.bak');
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
      } catch (err) {
        handleError(err);
      }
    });
}
