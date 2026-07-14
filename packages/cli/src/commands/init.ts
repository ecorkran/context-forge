import * as fs from 'node:fs';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import { Command } from 'commander';
import { FileProjectStore } from '@context-forge/core/node';
import { buildProjectCreationDefaults } from '@context-forge/core';
import type { CreateProjectData } from '@context-forge/core';
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

const PERSONAL_CONFIG_GITIGNORE_LINE = '.context-forge.local.toml';

/**
 * Ensures the CWD's .gitignore contains a line for the personal config file.
 * Simple line-based check (not a full gitignore-pattern parse) — matches this
 * project's lenient-parsing convention for straightforward line-oriented files.
 * A write failure propagates to the caller's handleError(err) catch block,
 * consistent with every other cf init file-write failure.
 */
function ensurePersonalConfigGitignored(cwd: string): void {
  const gitignorePath = path.join(cwd, '.gitignore');
  if (!fs.existsSync(gitignorePath)) {
    fs.writeFileSync(gitignorePath, `${PERSONAL_CONFIG_GITIGNORE_LINE}\n`, 'utf-8');
    return;
  }
  const content = fs.readFileSync(gitignorePath, 'utf-8');
  const alreadyPresent = content.split('\n').some((line) => line.trim() === PERSONAL_CONFIG_GITIGNORE_LINE);
  if (alreadyPresent) return;
  const needsNewline = content.length > 0 && !content.endsWith('\n');
  fs.writeFileSync(
    gitignorePath,
    content + (needsNewline ? '\n' : '') + `${PERSONAL_CONFIG_GITIGNORE_LINE}\n`,
    'utf-8'
  );
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

        // Detection 2: CF project already registered at CWD — skip creation but continue setup
        const existing = all.find((p) => p.projectPath === cwd);
        if (existing) {
          console.log(dim(`Project '${existing.name}' already registered — running setup steps`));
        } else {
          // Detection 3: Git worktree of a registered project
          const registeredPaths = all
            .filter((p) => p.projectPath)
            .map((p) => p.projectPath as string);
          if (isGitWorktreeOf(cwd, registeredPaths)) {
            console.log(warn('This looks like a worktree. Run cf worktree init instead.'));
            return;
          }

          // Create project
          const projectName = opts.name || path.basename(cwd);
          await store.create(buildProjectCreationDefaults({
            name: projectName,
            projectPath: cwd,
          }) as CreateProjectData);
          console.log(success(`Project '${projectName}' registered`));
        }

        // Ensure the personal config file is gitignored — repo hygiene, so this runs
        // regardless of --lite (unlike guides/commands/IDE setup below).
        ensurePersonalConfigGitignored(cwd);

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
