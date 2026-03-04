#!/usr/bin/env node

import { Command } from 'commander';
import { registerConfigCommand } from './commands/config.js';
import { registerProjectCommand } from './commands/project.js';
import { registerStatusCommand } from './commands/status.js';
import { registerNextCommand } from './commands/next.js';
import { registerBuildCommand } from './commands/build.js';
import { registerFutureCommand } from './commands/future.js';
import { registerCheckCommand } from './commands/check.js';
import { registerPromptCommand } from './commands/prompt.js';

const program = new Command();

program
  .name('cf')
  .version('0.1.0')
  .description('Context Forge CLI — terminal access to context assembly, project management, and workflow navigation');

registerConfigCommand(program);
registerProjectCommand(program);
registerStatusCommand(program);
registerNextCommand(program);
registerBuildCommand(program);
registerFutureCommand(program);
registerCheckCommand(program);
registerPromptCommand(program);

program.parse();
