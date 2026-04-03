import { Command } from 'commander';
import { FileProjectStore, WorkflowNavigator } from '@context-forge/core/node';
import { resolveProject } from '@context-forge/core';
import { resolveProjectWorktree } from '../utils/project.js';
import { handleError, UserError } from '../utils/errors.js';
import { withJsonOption, withProjectOption } from '../options.js';
import { printJson } from '../output/formatter.js';
import { label, value as valueStyle, dim, warn } from '../output/styles.js';

export function registerNextCommand(program: Command): void {
  const nextCmd = program
    .command('next')
    .description('Show recommended next action for the active project');
  withJsonOption(nextCmd);
  withProjectOption(nextCmd);
  nextCmd.action(async (opts: { json?: boolean; project?: string }) => {
      try {
        const store = new FileProjectStore();
        const { id, worktreeId } = await resolveProjectWorktree({ project: opts.project }, store);
        const project = await resolveProject(store, id, worktreeId);

        if (!project) {
          throw new UserError(`Project not found: '${id}'. Run cf project list to see available projects.`);
        }

        const nav = new WorkflowNavigator();
        const result = await nav.getNext(project);

        if (opts.json) {
          printJson(result);
          return;
        }

        if (result.warnings?.length) {
          for (const w of result.warnings) {
            console.log(warn('Warning:   ') + dim(w));
          }
          console.log('');
        }
        console.log(label('Next:      ') + valueStyle(result.recommendation));
        if (result.slice) {
          console.log(label('Slice:     ') + valueStyle(result.slice));
        }
        if (result.phase) {
          console.log(label('Phase:     ') + valueStyle(result.phase));
        }
        console.log(label('Rationale: ') + dim(result.rationale));
        if (result.suggestedCommand) {
          console.log(label('Run:       ') + valueStyle(result.suggestedCommand));
        }
      } catch (err) {
        handleError(err);
      }
    });
}
