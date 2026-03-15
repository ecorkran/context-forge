import * as fs from 'node:fs';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import { Command } from 'commander';
import { FileProjectStore } from '@context-forge/core/node';
import { handleError } from '../utils/errors.js';
import { success, warn, dim } from '../output/styles.js';
import { guidesInstallAction } from './guides.js';
import { setupIdeAction } from './setup-ide.js';
import { installCommandsAction } from './commandInstaller.js';

/**
 * Returns true if the cwd is a git worktree whose main worktree is already
 * registered as a CF project.
 */
function isGitWorktreeOf(cwd: string, registeredPaths: string[]): boolean {
  try {
    const output = execFileSync('git', ['worktree', 'list', '--porcelain'], {
      cwd,
      encoding: 'utf8',
    });
    const worktreePaths: string[] = [];
    for (const line of output.split('\n')) {
      if (line.startsWith('worktree ')) {
        worktreePaths.push(line.slice('worktree '.length).trim());
      }
    }
    const mainWorktreePath = worktreePaths[0];
    if (!mainWorktreePath) return false;
    return registeredPaths.includes(mainWorktreePath) && mainWorktreePath !== cwd;
  } catch {
    return false;
  }
}

export function registerInitCommand(program: Command): void {
  program
    .command('init')
    .description('Initialize a Context Forge project in the current directory')
    .option('--name <name>', 'Project name (defaults to directory basename)')
    .option('--lite', 'Create project entry only, skip guides/commands/IDE setup')
    .option('--ide <target>', 'IDE target for setup (default: claude)')
    .option('--no-ide', 'Skip IDE configuration step')
    .action(async (opts: { name?: string; lite?: boolean; ide?: string | boolean }) => {
      try {
        const cwd = path.resolve(process.cwd());
        const store = new FileProjectStore();
        const all = await store.getAll();

        // Detection 1: No .git directory → git init
        if (!fs.existsSync(path.join(cwd, '.git'))) {
          try {
            execFileSync('git', ['init'], { cwd, stdio: 'inherit' });
            console.log(success('git initialized'));
          } catch {
            console.log(warn('git init failed, continuing without git'));
          }
        }

        // Detection 2: CF project already registered at CWD
        const existing = all.find((p) => p.projectPath === cwd);
        if (existing) {
          console.log(warn(`Project '${existing.name}' is already registered. Run cf status for details.`));
          return;
        }

        // Detection 3: Git worktree of a registered project
        const registeredPaths = all
          .filter((p) => p.projectPath)
          .map((p) => p.projectPath as string);
        if (isGitWorktreeOf(cwd, registeredPaths)) {
          console.log(warn('This looks like a worktree. Run cf worktree init instead.'));
          return;
        }

        // Step 1: Create project
        const projectName = opts.name || path.basename(cwd);
        await store.create({
          name: projectName,
          projectPath: cwd,
          template: 'default',
          fileSlice: '',
          instruction: 'implementation',
        });
        console.log(success(`Project '${projectName}' registered`));

        if (!opts.lite) {
          // Step 2: Install guides
          try {
            await guidesInstallAction(cwd);
            console.log(success('Guides installed'));
          } catch (err) {
            const msg = (err as Error).message ?? '';
            if (msg.toLowerCase().includes('already installed')) {
              console.log(dim('  Guides already installed — skipping'));
            } else {
              console.log(warn(`Guides install failed: ${msg}`));
            }
          }

          // Step 3: Install commands
          try {
            installCommandsAction();
            console.log(success('Commands installed'));
          } catch (err) {
            console.log(warn(`Commands install failed: ${(err as Error).message}`));
          }

          // Step 4: IDE setup (--no-ide sets opts.ide to false via commander negation)
          if (opts.ide !== false) {
            const ideTarget = typeof opts.ide === 'string' ? opts.ide : 'claude';
            try {
              await setupIdeAction(cwd, ideTarget, { yes: true });
              console.log(success(`IDE configured for ${ideTarget}`));
            } catch (err) {
              console.log(warn(`IDE setup failed: ${(err as Error).message}`));
            }
          }
        }

        console.log(dim('──────────────────────────────────────'));
        console.log('Your project is ready. Run cf next to see recommended next steps.');
      } catch (err) {
        handleError(err);
      }
    });
}
