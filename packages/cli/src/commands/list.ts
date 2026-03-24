import { Command } from 'commander';
import { projectListAction } from './project.js';
import { archListAction } from './arch.js';
import { planListAction } from './plan.js';
import { sliceListAction } from './slice.js';
import { taskListAction, taskItemsAction } from './task.js';
import { handleError } from '../utils/errors.js';

export function registerListCommand(program: Command): void {
  const cmd = program
    .command('list')
    .description('List project artifacts');

  cmd
    .command('projects')
    .description('List all projects')
    .option('--json', 'Output as JSON')
    .action(async (opts: { json?: boolean }) => {
      try {
        await projectListAction(opts);
      } catch (err) {
        handleError(err);
      }
    });

  cmd
    .command('initiatives')
    .description('List architecture initiatives')
    .option('--json', 'Output as JSON')
    .option('--all', 'Show initiatives from all worktrees')
    .option('--project <name|id>', 'Project name or ID (overrides default)')
    .action(async (opts: { json?: boolean; all?: boolean; project?: string }) => {
      try {
        await archListAction(opts);
      } catch (err) {
        handleError(err);
      }
    });

  cmd
    .command('arch')
    .description('Alias for "cf list initiatives"')
    .option('--json', 'Output as JSON')
    .option('--all', 'Show initiatives from all worktrees')
    .option('--project <name|id>', 'Project name or ID (overrides default)')
    .action(async (opts: { json?: boolean; all?: boolean; project?: string }) => {
      try {
        await archListAction(opts);
      } catch (err) {
        handleError(err);
      }
    });

  cmd
    .command('plans')
    .description('List slice plan files')
    .option('--json', 'Output as JSON')
    .option('--all', 'Show slice plans from all worktrees')
    .option('--project <name|id>', 'Project name or ID (overrides default)')
    .action(async (opts: { json?: boolean; all?: boolean; project?: string }) => {
      try {
        await planListAction(opts);
      } catch (err) {
        handleError(err);
      }
    });

  cmd
    .command('slices')
    .description('List slices from active plan')
    .option('--json', 'Output as JSON')
    .option('--project <name|id>', 'Project name or ID (overrides default)')
    .action(async (opts: { json?: boolean; project?: string }) => {
      try {
        await sliceListAction(opts);
      } catch (err) {
        handleError(err);
      }
    });

  cmd
    .command('tasks')
    .description('List task files from plan')
    .option('--json', 'Output as JSON')
    .option('--all', 'Show task files from all worktrees')
    .option('--project <name|id>', 'Project name or ID (overrides default)')
    .action(async (opts: { json?: boolean; all?: boolean; project?: string }) => {
      try {
        await taskListAction(opts);
      } catch (err) {
        handleError(err);
      }
    });

  cmd
    .command('items')
    .description('Show items from active task file')
    .option('--json', 'Output as JSON')
    .option('--project <name|id>', 'Project name or ID (overrides default)')
    .action(async (opts: { json?: boolean; project?: string }) => {
      try {
        await taskItemsAction(opts);
      } catch (err) {
        handleError(err);
      }
    });
}
