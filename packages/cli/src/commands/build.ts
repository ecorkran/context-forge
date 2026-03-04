import { Command } from 'commander';
import { FileProjectStore, createContextPipeline } from '@context-forge/core/node';
import type { ProjectData } from '@context-forge/core';
import { resolveProjectId } from '../utils/project.js';
import { handleError, UserError } from '../utils/errors.js';
import { printRaw } from '../output/formatter.js';

interface BuildOpts {
  project?: string;
  phase?: string;
  slice?: string;
  instruction?: string;
  tasks?: string;
  additional?: string;
}

export function registerBuildCommand(program: Command): void {
  program
    .command('build')
    .description('Generate and output a context prompt to stdout (--json not applicable)')
    .option('--project <id>', 'Project ID (overrides default)')
    .option('--phase <phase>', 'Override development phase')
    .option('--slice <slice>', 'Override slice name')
    .option('--instruction <instruction>', 'Override instruction type')
    .option('--tasks <tasks>', 'Override task file name')
    .option('--additional <text>', 'Additional instructions to append')
    .action(async (opts: BuildOpts) => {
      try {
        const store = new FileProjectStore();
        const { id } = await resolveProjectId(opts.project, store);
        const project = await store.getById(id);

        if (!project) {
          throw new UserError(`Project not found: '${id}'. Run cf project list to see available projects.`);
        }

        if (!project.projectPath) {
          throw new UserError(`Project '${project.name}' has no projectPath configured. Set it with cf project set projectPath <path>`);
        }

        // Status message goes to stderr so stdout stays clean for piping
        process.stderr.write(`Building context for ${project.name}...\n`);

        // Apply overrides to a working copy
        const workingCopy: ProjectData = { ...project };
        if (opts.phase) workingCopy.developmentPhase = opts.phase;
        if (opts.slice) workingCopy.fileSlice = opts.slice;
        if (opts.instruction) workingCopy.instruction = opts.instruction;
        if (opts.tasks) workingCopy.fileTasks = opts.tasks;

        const { integrator } = createContextPipeline(workingCopy.projectPath!);
        let contextString = await integrator.generateContextFromProject(workingCopy);

        if (opts.additional) {
          contextString = `${contextString}\n\n${opts.additional}`;
        }

        printRaw(contextString);
      } catch (err) {
        handleError(err);
      }
    });
}
