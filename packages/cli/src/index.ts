#!/usr/bin/env node

import { createRequire } from 'node:module';
import chalk from 'chalk';
import { Command } from 'commander';
import { registerBuildCommand } from './commands/build.js';
import { registerCheckCommand } from './commands/check.js';
import { registerFutureCommand } from './commands/future.js';
import { registerNextCommand } from './commands/next.js';
import { registerProjectCommand, projectSetAction, projectGetAction, projectUnsetAction, buildSettableFieldsHelp } from './commands/project.js';
import { registerPromptCommand } from './commands/prompt.js';
import { registerStatusCommand } from './commands/status.js';
import { registerListCommand } from './commands/list.js';
import { registerWorktreeCommand } from './commands/worktree.js';
import { registerBackupCommand } from './commands/backup.js';
import { registerConfigCommand } from './commands/config.js';
import { registerGuidesCommand } from './commands/guides.js';
import { registerInitCommand } from './commands/init.js';
import { registerInstallCommandsCommand, registerUninstallCommandsCommand } from './commands/commandInstaller.js';
import { registerSetupIdeCommand } from './commands/setup-ide.js';
import { registerUpdateCommand } from './commands/update.js';
import { handleError, setJsonMode } from './utils/errors.js';
import { buildCommandCatalog } from './utils/commandCatalog.js';
import { BREAKING_CHANGES } from './utils/breaking-changes.js';

const require = createRequire(import.meta.url);
const { version } = require('../package.json') as { version: string };

const program = new Command();

program
  .name('cf')
  .version(version)
  .description('Context Forge CLI — terminal access to context assembly, project management, and workflow navigation')
  .configureHelp({
    styleTitle: (str) => chalk.bold(str),
    styleCommandText: (str) => chalk.yellow(str),
    styleSubcommandText: (str) => chalk.yellow(str),
    styleOptionText: (str) => chalk.cyan(str),
    styleArgumentText: (str) => chalk.magenta(str),
    styleDescriptionText: (str) => str,
    subcommandTerm: (cmd) => cmd.name(),
  })
  .addHelpText('after', `\n${chalk.bold('Common options')} (available on most commands):\n  ${chalk.cyan('--project <name|id>')}  Project name or ID (overrides CWD-based project detection)\n  ${chalk.cyan('--json')}               Output as JSON (not applicable to build/prompt get)`);

// Workflow commands
registerBuildCommand(program);
registerCheckCommand(program);
registerFutureCommand(program);
registerNextCommand(program);
registerProjectCommand(program);
registerPromptCommand(program);
registerStatusCommand(program);

// Top-level shortcuts for project get/set/unset
program
  .command('get')
  .description('Show details for the active project (shortcut for cf project get)')
  .option('--json', 'Output as JSON')
  .option('--project <name|id>', 'Project name or ID (overrides default)')
  .option('--project-level', 'Show project-level fields only (skip worktree overlay)')
  .action(async (opts: { json?: boolean; project?: string; projectLevel?: boolean }) => {
    try {
      await projectGetAction(opts);
    } catch (err) {
      handleError(err);
    }
  });

program
  .command('set [field] [value]')
  .description('Set a field on the active project (shortcut for cf project set)')
  .option('--project <name|id>', 'Project name or ID (overrides default)')
  .option('--project-level', 'Force update at project level (skip worktree routing)')
  .addHelpText('after', buildSettableFieldsHelp)
  .action(async (field: string | undefined, val: string | undefined, opts: { project?: string; projectLevel?: boolean }) => {
    // Allow `cf set date` (no value) as shorthand for `cf set date now`
    const resolvedVal = (!val && field && /^date/i.test(field)) ? 'now' : val;
    if (!field || !resolvedVal) {
      console.log(`Usage: cf set [options] <field> <value>  —  run cf set --help for details`);
      return;
    }
    try {
      await projectSetAction(field, resolvedVal, opts);
    } catch (err) {
      handleError(err);
    }
  });

program
  .command('unset [field]')
  .description('Unset (clear) a field on the active project (shortcut for cf project unset)')
  .option('--project <name|id>', 'Project name or ID (overrides default)')
  .option('--project-level', 'Force unset at project level (skip worktree routing)')
  .action(async (field: string | undefined, opts: { project?: string; projectLevel?: boolean }) => {
    if (!field) {
      console.log(`Usage: cf unset [options] <field>  —  run cf unset --help for details`);
      return;
    }
    try {
      await projectUnsetAction(field, opts);
    } catch (err) {
      handleError(err);
    }
  });

// Compound workflow commands

// Artifact listing
registerListCommand(program);

// Worktree management
registerWorktreeCommand(program);

// Setup and administration
registerBackupCommand(program);
registerConfigCommand(program);
registerGuidesCommand(program);
registerInitCommand(program);
registerInstallCommandsCommand(program);
registerUninstallCommandsCommand(program);
registerSetupIdeCommand(program);
registerUpdateCommand(program);

// Version introspection
program
  .command('version')
  .description('Show version information (use --json for machine-readable output)')
  .option('--json', 'Output as JSON with guide version and breaking changes')
  .action(async (opts: { json?: boolean }) => {
    if (opts.json) {
      let guideVersion: string | null = null;
      try {
        const { GuideDetector } = await import('@context-forge/core/node');
        const detector = new GuideDetector();
        const info = await detector.detect(process.cwd());
        guideVersion = info.version;
      } catch {
        // Guide detection is best-effort
      }
      const output = {
        name: '@context-forge/cli',
        version,
        guideVersion,
        breaking: BREAKING_CHANGES,
      };
      process.stdout.write(JSON.stringify(output, null, 2) + '\n');
    } else {
      process.stdout.write(`@context-forge/cli v${version}\n`);
    }
  });

// Machine-readable help
program
  .command('help')
  .description('Display help information (use --json for machine-readable catalog)')
  .option('--json', 'Output command catalog as JSON')
  .action((opts: { json?: boolean }) => {
    if (opts.json) {
      const catalog = buildCommandCatalog(program, version);
      process.stdout.write(JSON.stringify(catalog, null, 2) + '\n');
    } else {
      program.outputHelp();
    }
  });

// Catch unhandled errors at top level
process.on('uncaughtException', handleError);
process.on('unhandledRejection', handleError);

// Detect --json in argv to enable structured error output before parsing
if (process.argv.includes('--json') || process.env.CF_JSON === '1') {
  setJsonMode();
}

program.parse();
