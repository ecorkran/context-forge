import { Command } from 'commander';
import { FileProjectStore, WorkflowNavigator } from '@context-forge/core/node';
import { resolveProjectId } from '../utils/project.js';
import { handleError, UserError } from '../utils/errors.js';
import { printJson } from '../output/formatter.js';
import { label, value as valueStyle, dim } from '../output/styles.js';

export function registerNextCommand(program: Command): void {
  program
    .command('next')
    .description('Show recommended next action for the active project')
    .option('--json', 'Output as JSON')
    .option('--project <id>', 'Project ID (overrides default)')
    .action(async (opts: { json?: boolean; project?: string }) => {
      try {
        const store = new FileProjectStore();
        const { id } = await resolveProjectId(opts.project, store);
        const project = await store.getById(id);

        if (!project) {
          throw new UserError(`Project not found: '${id}'. Run cf project list to see available projects.`);
        }

        const nav = new WorkflowNavigator();
        const result = await nav.getNext(project);

        if (opts.json) {
          printJson(result);
          return;
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
