import { Command } from 'commander';
import { FileProjectStore, ArtifactIntrospector } from '@context-forge/core/node';
import { resolveProjectId } from '../utils/project.js';
import { handleError, UserError } from '../utils/errors.js';
import { printJson } from '../output/formatter.js';
import { label, value as valueStyle, dim } from '../output/styles.js';

export function registerStatusCommand(program: Command): void {
  program
    .command('status')
    .description('Show workflow status for the active project')
    .option('--json', 'Output as JSON')
    .option('--project <id>', 'Project ID (overrides default)')
    .action(async (opts: { json?: boolean; project?: string }) => {
      try {
        const store = new FileProjectStore();
        const { id, source: _source } = await resolveProjectId(opts.project, store);
        const project = await store.getById(id);

        if (!project) {
          throw new UserError(`Project not found: '${id}'. Run cf project list to see available projects.`);
        }

        // Gather introspection data when projectPath is available
        let introspection;
        if (project.projectPath) {
          try {
            const introspector = new ArtifactIntrospector();
            introspection = await introspector.summarize(project);
          } catch {
            // Graceful degradation — show project data without introspection
          }
        }

        const statusData = {
          project: project.name,
          phase: project.developmentPhase ?? 'Not set',
          slice: project.fileSlice,
          tasks: project.fileTasks,
          workType: project.workType ?? 'Not set',
          slicePlan: introspection?.slicePlan ?? null,
          currentTasks: introspection?.currentTasks ?? null,
          artifacts: introspection?.artifacts ?? null,
        };

        if (opts.json) {
          printJson(statusData);
          return;
        }

        console.log(label('Project:  ') + valueStyle(statusData.project));
        console.log(label('Phase:    ') + valueStyle(statusData.phase));
        console.log(label('Slice:    ') + valueStyle(statusData.slice));
        console.log(label('Tasks:    ') + valueStyle(statusData.tasks));

        if (statusData.currentTasks) {
          const { completedTasks, totalTasks, inferredStatus } = statusData.currentTasks;
          console.log(label('Progress: ') + valueStyle(`${completedTasks}/${totalTasks} tasks (${inferredStatus})`));
        }

        if (statusData.slicePlan) {
          const { completedSlices, totalSlices, summary } = statusData.slicePlan;
          console.log('');
          console.log(label('Slice Plan'));
          console.log(dim(`  ${completedSlices}/${totalSlices} slices complete`));
          if (summary) {
            console.log(dim(`  ${summary}`));
          }
        }
      } catch (err) {
        handleError(err);
      }
    });
}
