#!/usr/bin/env node

import { createRequire } from 'node:module';
import chalk from 'chalk';
import { Command } from 'commander';
import { registerConfigCommand } from './commands/config.js';
import { registerProjectCommand } from './commands/project.js';
import { registerStatusCommand } from './commands/status.js';
import { registerNextCommand } from './commands/next.js';
import { registerBuildCommand } from './commands/build.js';
import { registerFutureCommand } from './commands/future.js';
import { registerCheckCommand } from './commands/check.js';
import { registerPromptCommand } from './commands/prompt.js';
import { registerInitCommand } from './commands/init.js';
import { registerGuidesCommand } from './commands/guides.js';
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

// Catch unhandled errors at top level
process.on('uncaughtException', handleError);
process.on('unhandledRejection', handleError);

program.parse();
