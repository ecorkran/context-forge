import { Command } from 'commander';
import { FileProjectStore, createContextPipeline } from '@context-forge/core/node';
import type { ProjectData } from '@context-forge/core';
import { resolvePhaseValue } from '@context-forge/core';
import { resolveProject } from '@context-forge/core';
import { resolveProjectWorktree } from '../utils/project.js';
import { handleError, UserError } from '../utils/errors.js';
import { printRaw } from '../output/formatter.js';

interface BuildOpts {
  project?: string;
  phase?: string;
  slice?: string;
  instruction?: string;
  instructionType?: string;
  it?: string;
  tasks?: string;
  additional?: string;
}

export function registerBuildCommand(program: Command): void {
  program
    .command('build')
    .description('Generate and output a context prompt to stdout (--json not applicable)')
    .option('--project <id>', 'Project ID or name (overrides default)')
    .option('--phase <phase>', 'Override development phase')
    .option('--slice <slice>', 'Override slice name')
    .option('--instruction <instruction>', 'Override instruction type')
    .option('--instruction-type <type>', 'Override instruction type for profile lookup (without persisting)')
    .option('--it <type>', 'Shorthand for --instruction-type')
    .option('--tasks <tasks>', 'Override task file name')
    .option('--additional <text>', 'Additional instructions to append')
    .action(async (opts: BuildOpts) => {
      try {
        const store = new FileProjectStore();
        const { id, worktreeId } = await resolveProjectWorktree({ project: opts.project }, store);
        const project = await resolveProject(store, id, worktreeId);

        if (!project) {
          throw new UserError(`Project not found: '${id}'. Run cf project list to see available projects.`);
        }

        if (!project.projectPath) {
          throw new UserError(
            `Project '${project.name}' has no projectPath configured.\n` +
              '  cf project set projectPath /path/to/project',
          );
        }

        // Status message goes to stderr so stdout stays clean for piping
        process.stderr.write(`Building context for ${project.name}...\n`);

        // Apply overrides to a working copy
        const workingCopy: ProjectData = { ...project };
        if (opts.phase) {
          const resolved = resolvePhaseValue(opts.phase);
          if (!resolved) {
            process.stderr.write(
              `Warning: '${opts.phase}' is not a recognized phase. Use a number (0-7), name (implementation), or shorthand (P6).\n`,
            );
          }
          const phaseValue = resolved ?? opts.phase;
          workingCopy.developmentPhase = phaseValue;
          workingCopy.instruction = phaseValue;
        }
        if (opts.slice) workingCopy.fileSlice = opts.slice;
        if (opts.instruction) workingCopy.instruction = opts.instruction;
        const instructionTypeOverride = opts.instructionType ?? opts.it;
        if (instructionTypeOverride) workingCopy.instruction = instructionTypeOverride;
        if (opts.tasks) workingCopy.fileTasks = opts.tasks;

        const { integrator } = createContextPipeline(workingCopy.projectPath!);
        let contextString = await integrator.generateContextFromProject(workingCopy, worktreeId);

        if (opts.additional) {
          contextString = `${contextString}\n\n${opts.additional}`;
        }

        printRaw(contextString);
      } catch (err) {
        handleError(err);
      }
    });
}
