#!/usr/bin/env node

import { createRequire } from 'node:module';
import chalk from 'chalk';
import { Command } from 'commander';
import { registerConfigCommand } from './commands/config.js';
import { registerProjectCommand, projectSetAction, projectGetAction, buildSettableFieldsHelp } from './commands/project.js';
import { registerStatusCommand } from './commands/status.js';
import { registerNextCommand } from './commands/next.js';
import { registerBuildCommand } from './commands/build.js';
import { registerFutureCommand } from './commands/future.js';
import { registerCheckCommand } from './commands/check.js';
import { registerPromptCommand } from './commands/prompt.js';
import { registerInitCommand } from './commands/init.js';
import { registerGuidesCommand } from './commands/guides.js';
import { registerInstallCommandsCommand, registerUninstallCommandsCommand } from './commands/commandInstaller.js';
import { registerSliceCommand } from './commands/slice.js';
import { registerTaskCommand } from './commands/task.js';
import { registerArchCommand } from './commands/arch.js';
import { registerPlanCommand } from './commands/plan.js';
import { registerSetupIdeCommand } from './commands/setup-ide.js';
import { registerBackupCommand } from './commands/backup.js';
import { registerWorktreeCommand } from './commands/worktree.js';
import { handleError } from './utils/errors.js';

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
  .addHelpText('after', `\n${chalk.bold('Common options')} (available on most commands):\n  ${chalk.cyan('--project <name|id>')}  Project name or ID (overrides default_project config)\n  ${chalk.cyan('--json')}               Output as JSON (not applicable to build/prompt get)`);

registerConfigCommand(program);
registerProjectCommand(program);
registerStatusCommand(program);
registerNextCommand(program);
registerBuildCommand(program);
registerFutureCommand(program);
registerCheckCommand(program);
registerPromptCommand(program);
registerInitCommand(program);
registerGuidesCommand(program);
registerSliceCommand(program);
registerTaskCommand(program);
registerArchCommand(program);
registerPlanCommand(program);
registerSetupIdeCommand(program);
registerBackupCommand(program);
registerInstallCommandsCommand(program);
registerUninstallCommandsCommand(program);
registerWorktreeCommand(program);

// Top-level shortcuts for project get/set
program
  .command('set [field] [value]')
  .description('Set a field on the active project (shortcut for cf project set)')
  .option('--project <name|id>', 'Project name or ID (overrides default)')
  .option('--project-level', 'Force update at project level (skip worktree routing)')
  .addHelpText('after', buildSettableFieldsHelp)
  .action(async (field: string | undefined, val: string | undefined, opts: { project?: string; projectLevel?: boolean }) => {
    if (!field || !val) {
      console.log(`Usage: cf set [options] <field> <value>  —  run cf set --help for details`);
      return;
    }
    try {
      await projectSetAction(field, val, opts);
    } catch (err) {
      handleError(err);
    }
  });

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

// Catch unhandled errors at top level
process.on('uncaughtException', handleError);
process.on('unhandledRejection', handleError);

program.parse();
