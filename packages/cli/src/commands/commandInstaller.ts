import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Command } from 'commander';
import { success, dim } from '../output/styles.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** Resolve the bundled commands/ directory relative to this script's location. */
export function getSourceCommandsDir(): string {
  // In dist: dist/commands/commandInstaller.js → ../../commands/
  const resolved = path.resolve(__dirname, '..', '..', 'commands');
  if (!fs.existsSync(resolved)) {
    throw new Error(
      `Cannot locate bundled commands directory at ${resolved}. ` +
        'Ensure the package includes a commands/ directory.',
    );
  }
  return resolved;
}

/**
 * Copy command files from the bundled commands/cf/ directory to the target.
 * Creates directories as needed. Overwrites existing files (idempotent).
 * Removes stale .md files in the target that no longer exist in the source.
 *
 * @returns Object with installed and removed filenames.
 */
export function installCommands(targetDir: string): { installed: string[]; removed: string[] } {
  const sourceDir = path.join(getSourceCommandsDir(), 'cf');
  const targetCfDir = path.join(targetDir, 'cf');

  fs.mkdirSync(targetCfDir, { recursive: true });

  const sourceFiles = new Set(fs.readdirSync(sourceDir).filter((f) => f.endsWith('.md')));

  // Install current files
  for (const file of sourceFiles) {
    fs.copyFileSync(path.join(sourceDir, file), path.join(targetCfDir, file));
  }

  // Remove stale files (exist in target but not in source)
  const removed: string[] = [];
  const targetFiles = fs.readdirSync(targetCfDir).filter((f) => f.endsWith('.md'));
  for (const file of targetFiles) {
    if (!sourceFiles.has(file)) {
      fs.rmSync(path.join(targetCfDir, file));
      removed.push(file);
    }
  }

  return { installed: [...sourceFiles], removed };
}

/**
 * Remove managed command files from the target.
 * "Managed" = any .md file that exists in the bundled source directory.
 * Preserves user-added files not in the source. Removes cf/ if empty.
 * No error if files or directory don't exist (idempotent).
 *
 * @returns List of removed filenames.
 */
export function uninstallCommands(targetDir: string): string[] {
  const sourceDir = path.join(getSourceCommandsDir(), 'cf');
  const managedFiles = fs.readdirSync(sourceDir).filter((f) => f.endsWith('.md'));
  const targetCfDir = path.join(targetDir, 'cf');
  const removed: string[] = [];

  for (const file of managedFiles) {
    const filePath = path.join(targetCfDir, file);
    if (fs.existsSync(filePath)) {
      fs.rmSync(filePath);
      removed.push(file);
    }
  }

  // Remove cf/ directory if it exists and is now empty
  if (fs.existsSync(targetCfDir)) {
    const remaining = fs.readdirSync(targetCfDir);
    if (remaining.length === 0) {
      fs.rmdirSync(targetCfDir);
    }
  }

  return removed;
}

/** Default target directory for command installation. */
function defaultTarget(): string {
  return path.join(os.homedir(), '.claude', 'commands');
}

/** Install commands to the target directory (defaults to ~/.claude/commands). Errors propagate. */
export function installCommandsAction(targetDir?: string): void {
  const target = targetDir ?? defaultTarget();
  const { installed, removed } = installCommands(target);
  console.log(success(`Installed ${installed.length} commands to ${target}/cf/`));
  for (const file of installed) {
    console.log(`  ${dim('/cf:' + file.replace('.md', ''))}`);
  }
  if (removed.length > 0) {
    console.log(dim(`Removed ${removed.length} stale command(s): ${removed.map((f) => f.replace('.md', '')).join(', ')}`));
  }
}

export function registerInstallCommandsCommand(program: Command): void {
  program
    .command('install-commands')
    .description('Install Claude Code slash commands for Context Forge')
    .option('--target <dir>', 'Target directory', defaultTarget())
    .action((opts: { target: string }) => {
      try {
        const { installed, removed } = installCommands(opts.target);
        console.log(success(`Installed ${installed.length} commands to ${opts.target}/cf/`));
        for (const file of installed) {
          console.log(`  ${dim('/cf:' + file.replace('.md', ''))}`);
        }
        if (removed.length > 0) {
          console.log(dim(`Removed ${removed.length} stale command(s): ${removed.map((f) => f.replace('.md', '')).join(', ')}`));
        }
      } catch (err) {
        console.error(`Error: ${(err as Error).message}`);
        process.exit(1);
      }
    });
}

export function registerUninstallCommandsCommand(program: Command): void {
  program
    .command('uninstall-commands')
    .description('Remove Claude Code slash commands for Context Forge')
    .option('--target <dir>', 'Target directory', defaultTarget())
    .action((opts: { target: string }) => {
      try {
        const removed = uninstallCommands(opts.target);
        if (removed.length === 0) {
          console.log(dim('No commands found to remove.'));
        } else {
          console.log(success(`Removed ${removed.length} commands from ${opts.target}/cf/`));
          for (const file of removed) {
            console.log(`  ${dim('/cf:' + file.replace('.md', ''))}`);
          }
        }
      } catch (err) {
        console.error(`Error: ${(err as Error).message}`);
        process.exit(1);
      }
    });
}
