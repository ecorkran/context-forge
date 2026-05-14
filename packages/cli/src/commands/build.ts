import { Command } from 'commander';
import { FileProjectStore, createContextPipeline, embedReferencedFiles } from '@context-forge/core/node';
import type { ProjectData } from '@context-forge/core';
import { resolvePhaseValue } from '@context-forge/core';
import { resolveProject } from '@context-forge/core';
import { resolveProjectWorktree } from '../utils/project.js';
import { withJsonOption, withProjectOption } from '../options.js';
import { handleError, UserError } from '../utils/errors.js';
import { printJson } from '../output/formatter.js';

interface BuildOpts {
  project?: string;
  phase?: string;
  slice?: string;
  instruction?: string;
  instructionType?: string;
  it?: string;
  tasks?: string;
  additional?: string;
  json?: boolean;
  embed?: boolean;
}

interface BuildAndPrintOpts {
  project?: string;
  phase?: string;
  slice?: string;
  json?: boolean;
  embed?: boolean;
}

/**
 * Core build logic: resolves project, generates context.
 *
 * Output modes:
 * - `--json`: JSON object to stdout with project, phase, and context fields
 * - bare CLI: help message to stderr, nothing to stdout
 *
 * Slash commands call the CLI, which outputs to stdout — the slash command
 * wrapper captures and frames it as working context. Since bare CLI now shows
 * a help message instead of raw prompt, slash commands use `--json` implicitly
 * (the `!` backtick syntax in the .md file captures stdout).
 */
export async function buildAndPrint(opts: BuildAndPrintOpts): Promise<void> {
  const store = new FileProjectStore();
  const { id, worktreeId } = await resolveProjectWorktree({ project: opts.project }, store);
  const project = await resolveProject(store, id, worktreeId);

  if (!project) {
    throw new UserError(`Project not found: '${id}'.`, 'PROJECT_NOT_FOUND', `Run cf project list to see available projects.`);
  }

  if (!project.projectPath) {
    throw new UserError(
      `Project '${project.name}' has no projectPath configured.`,
      'MISSING_CONFIG',
      `Run: cf project set projectPath /path/to/project`,
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

  const { integrator } = createContextPipeline(workingCopy.projectPath!);
  let contextString = await integrator.generateContextFromProject(workingCopy, worktreeId);

  if (opts.embed) {
    contextString = await embedReferencedFiles(workingCopy, workingCopy.projectPath!, contextString);
  }

  if (opts.json) {
    // --json mode: structured output to stdout
    printJson({
      project: project.name,
      phase: workingCopy.developmentPhase ?? null,
      context: contextString,
    });
  } else {
    // Bare CLI: help message to stderr, nothing to stdout
    const sliceInfo = workingCopy.fileSlice ? `, slice ${workingCopy.fileSlice}` : '';
    const phaseInfo = workingCopy.developmentPhase ?? 'no phase set';
    process.stderr.write(
      `\nContext built for ${project.name} (${phaseInfo}${sliceInfo}).\n\n` +
      `To use this context:\n` +
      `  /cf:build — load as working context in Claude Code\n` +
      `  cf build --json — output as JSON for pipelines\n`,
    );
  }
}

export function registerBuildCommand(program: Command): void {
  const buildCmd = program
    .command('build')
    .description('Generate a context prompt');
  withProjectOption(buildCmd);
  buildCmd
    .option('--phase <phase>', 'Override development phase')
    .option('--slice <slice>', 'Override slice name')
    .option('--instruction <instruction>', 'Override instruction type')
    .option('--instruction-type <type>', 'Override instruction type for profile lookup (without persisting)')
    .option('--it <type>', 'Shorthand for --instruction-type')
    .option('--tasks <tasks>', 'Override task file name')
    .option('--additional <text>', 'Additional instructions to append')
    .option('--embed', 'Inline referenced file contents for models without file-read access');
  withJsonOption(buildCmd);
  buildCmd.action(async (opts: BuildOpts) => {
      try {
        const store = new FileProjectStore();
        const { id, worktreeId } = await resolveProjectWorktree({ project: opts.project }, store);
        const project = await resolveProject(store, id, worktreeId);

        if (!project) {
          throw new UserError(`Project not found: '${id}'.`, 'PROJECT_NOT_FOUND', `Run cf project list to see available projects.`);
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

        if (opts.embed) {
          contextString = await embedReferencedFiles(workingCopy, workingCopy.projectPath!, contextString);
        }

        if (opts.json) {
          printJson({
            project: project.name,
            phase: workingCopy.developmentPhase ?? null,
            context: contextString,
          });
        } else {
          const sliceInfo = workingCopy.fileSlice ? `, slice ${workingCopy.fileSlice}` : '';
          const phaseInfo = workingCopy.developmentPhase ?? 'no phase set';
          process.stderr.write(
            `\nContext built for ${project.name} (${phaseInfo}${sliceInfo}).\n\n` +
            `To use this context:\n` +
            `  /cf:build $ARGUMENTS — load as working context in Claude Code\n` +
            `  cf build --json     — output as JSON for pipelines\n`,
          );
        }
      } catch (err) {
        handleError(err);
      }
    });
}
