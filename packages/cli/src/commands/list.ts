import { Command } from 'commander';
import { projectListAction } from './project.js';
import { archListAction } from './arch.js';
import { planListAction } from './plan.js';
import { sliceListAction } from './slice.js';
import { taskListAction, taskItemsAction } from './task.js';
import { handleError } from '../utils/errors.js';
import { withJsonOption, withAllOption, withProjectOption } from '../options.js';

export function registerListCommand(program: Command): void {
  const cmd = program
    .command('list')
    .description('List project artifacts');

  const projectsCmd = cmd.command('projects').description('List all projects');
  withJsonOption(projectsCmd);
  projectsCmd.action(async (opts: { json?: boolean }) => {
    try {
      await projectListAction(opts);
    } catch (err) {
      handleError(err);
    }
  });

  const initiativesCmd = cmd.command('initiatives').description('List architecture initiatives');
  withJsonOption(initiativesCmd);
  withAllOption(initiativesCmd);
  withProjectOption(initiativesCmd);
  initiativesCmd.action(async (opts: { json?: boolean; all?: boolean; project?: string }) => {
    try {
      await archListAction(opts);
    } catch (err) {
      handleError(err);
    }
  });

  const archCmd = cmd.command('arch').description('Alias for "cf list initiatives"');
  withJsonOption(archCmd);
  withAllOption(archCmd);
  withProjectOption(archCmd);
  archCmd.action(async (opts: { json?: boolean; all?: boolean; project?: string }) => {
    try {
      await archListAction(opts);
    } catch (err) {
      handleError(err);
    }
  });

  const plansCmd = cmd.command('plans').description('List slice plan files');
  withJsonOption(plansCmd);
  withAllOption(plansCmd);
  withProjectOption(plansCmd);
  plansCmd.action(async (opts: { json?: boolean; all?: boolean; project?: string }) => {
    try {
      await planListAction(opts);
    } catch (err) {
      handleError(err);
    }
  });

  const slicesCmd = cmd.command('slices')
    .description('List slices from active plan')
    .argument('[archIndex]', 'Architecture index to target a non-active slice plan (no state mutation)');
  withJsonOption(slicesCmd);
  withProjectOption(slicesCmd);
  slicesCmd.action(async (archIndex: string | undefined, opts: { json?: boolean; project?: string }) => {
    try {
      await sliceListAction({ ...opts, archIndex });
    } catch (err) {
      handleError(err);
    }
  });

  const tasksCmd = cmd.command('tasks')
    .description('List task files from plan')
    .argument('[archIndex]', 'Architecture index to target a non-active slice plan (no state mutation)');
  withJsonOption(tasksCmd);
  withAllOption(tasksCmd);
  withProjectOption(tasksCmd);
  tasksCmd.action(async (archIndex: string | undefined, opts: { json?: boolean; all?: boolean; project?: string }) => {
    try {
      await taskListAction({ ...opts, archIndex });
    } catch (err) {
      handleError(err);
    }
  });

  const itemsCmd = cmd.command('items').description('Show items from active task file');
  withJsonOption(itemsCmd);
  withProjectOption(itemsCmd);
  itemsCmd.action(async (opts: { json?: boolean; project?: string }) => {
    try {
      await taskItemsAction(opts);
    } catch (err) {
      handleError(err);
    }
  });
}
