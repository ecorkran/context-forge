import { Command } from 'commander';
import { FileProjectStore, ArtifactIntrospector } from '@context-forge/core/node';
import type { IntrospectionSummary } from '@context-forge/core';
import { resolveProjectId } from '../utils/project.js';
import { handleError, UserError } from '../utils/errors.js';
import { printJson } from '../output/formatter.js';
import { label, value as valueStyle, dim } from '../output/styles.js';

/**
 * Derive a basic "next action" recommendation from project data and introspection.
 *
 * NOTE: This is a provisional implementation. Full workflow navigation
 * (WorkflowNavigator.getNext()) depends on slice 165, which is not yet complete.
 * This version uses ArtifactIntrospector to provide basic guidance.
 */
function deriveRecommendation(
  project: { fileSlice: string; developmentPhase?: string; fileTasks: string },
  introspection?: IntrospectionSummary,
): { recommendation: string; slice: string; phase: string; rationale: string } {
  const phase = project.developmentPhase ?? 'Not set';
  const slice = project.fileSlice;

  if (introspection?.currentTasks) {
    const { completedTasks, totalTasks, inferredStatus } = introspection.currentTasks;
    if (inferredStatus === 'complete') {
      return {
        recommendation: 'Advance to next phase or slice',
        slice,
        phase,
        rationale: `All ${totalTasks} tasks complete in current task file.`,
      };
    }
    const remaining = totalTasks - completedTasks;
    return {
      recommendation: 'Continue current tasks',
      slice,
      phase,
      rationale: `${remaining} of ${totalTasks} tasks remaining in ${project.fileTasks}.`,
    };
  }

  return {
    recommendation: 'Review project configuration',
    slice,
    phase,
    rationale: 'No task file data available. Verify fileTasks and projectPath are set.',
  };
}

export function registerNextCommand(program: Command): void {
  program
    .command('next')
    .description('Show recommended next action for the active project')
    .option('--json', 'Output as JSON')
    .option('--project <id>', 'Project ID (overrides default)')
    .action(async (opts: { json?: boolean; project?: string }) => {
      try {
        const id = await resolveProjectId(opts.project);
        const store = new FileProjectStore();
        const project = await store.getById(id);

        if (!project) {
          throw new UserError(`Project not found: '${id}'. Run cf project list to see available projects.`);
        }

        let introspection: IntrospectionSummary | undefined;
        if (project.projectPath) {
          try {
            const introspector = new ArtifactIntrospector();
            introspection = await introspector.summarize(project);
          } catch {
            // Graceful degradation
          }
        }

        const result = deriveRecommendation(project, introspection);

        if (opts.json) {
          printJson(result);
          return;
        }

        console.log(label('Next:      ') + valueStyle(result.recommendation));
        console.log(label('Slice:     ') + valueStyle(result.slice));
        console.log(label('Phase:     ') + valueStyle(result.phase));
        console.log(label('Rationale: ') + dim(result.rationale));
      } catch (err) {
        handleError(err);
      }
    });
}
