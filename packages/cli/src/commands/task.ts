import { join } from 'node:path';
import { Command } from 'commander';
import { FileProjectStore, ArtifactIntrospector } from '@context-forge/core/node';
import { resolveProjectId } from '../utils/project.js';
import { handleError, UserError } from '../utils/errors.js';
import { printJson } from '../output/formatter.js';
import { label, success, dim } from '../output/styles.js';

export function registerTaskCommand(program: Command): void {
  const cmd = program
    .command('task')
    .description('Manage tasks');

  cmd
    .command('list')
    .description('List tasks from the active task file')
    .option('--json', 'Output as JSON')
    .option('--project <name|id>', 'Project name or ID (overrides default)')
    .action(async (opts: { json?: boolean; project?: string }) => {
      try {
        const store = new FileProjectStore();
        const { id } = await resolveProjectId(opts.project, store);
        const project = await store.getById(id);

        if (!project) {
          throw new UserError(`Project not found: '${id}'.`);
        }

        if (!project.fileTasks) {
          throw new UserError(
            'No task file configured. Set one with: cf set tasks <filename>',
          );
        }

        if (!project.projectPath) {
          throw new UserError(
            'No projectPath configured. Set one with: cf set projectPath /path/to/project',
          );
        }

        const taskPath = join(project.projectPath, 'project-documents/user/tasks', project.fileTasks);
        const introspector = new ArtifactIntrospector();
        const taskResult = await introspector.parseTaskFile(taskPath);

        if (opts.json) {
          printJson(taskResult);
          return;
        }

        const fileName = project.fileTasks.split('/').pop() ?? project.fileTasks;
        console.log(
          label(`\nTasks: ${fileName}`) +
          dim(`  (${taskResult.completedTasks}/${taskResult.totalTasks} complete)`),
        );

        for (const item of taskResult.items) {
          const icon = item.done ? success('  ✓ ') : dim('  ○ ');
          const text = item.done ? dim(item.name) : item.name;
          console.log(icon + text);
        }
      } catch (err) {
        handleError(err);
      }
    });
}
