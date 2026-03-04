import * as path from 'node:path';
import { Command } from 'commander';
import { FileProjectStore, SystemPromptParser } from '@context-forge/core/node';
import { PROMPT_FILE_RELATIVE_PATH } from '@context-forge/core';
import type { ProjectData } from '@context-forge/core';
import { resolveProjectId } from '../utils/project.js';
import { handleError, UserError } from '../utils/errors.js';
import { printJson, printRaw } from '../output/formatter.js';
import { renderTable } from '../output/tables.js';
import { getPhaseShorthands, resolvePhaseInput } from '../utils/phaseShorthand.js';

/**
 * Substitute project variables into template content.
 * Unresolvable variables are preserved as-is.
 */
function substituteVariables(content: string, project: ProjectData): string {
  const vars: Record<string, string | undefined> = {
    'project': project.name,
    'slice': project.fileSlice,
    'task-file': project.fileTasks,
    'fileArch': project.fileArch,
    'fileHLD': project.fileHLD,
    'fileSpec': project.fileSpec,
    'development-phase': project.developmentPhase,
  };

  return content.replace(/\{(\w[\w-]*)}/g, (_match, varName: string) => {
    const value = vars[varName];
    return value !== undefined ? value : `{${varName}}`;
  });
}

export function registerPromptCommand(program: Command): void {
  const cmd = program
    .command('prompt')
    .description('Access prompt templates with variable substitution');

  cmd
    .command('list')
    .description('List available prompt templates')
    .option('--json', 'Output as JSON')
    .option('--project <id>', 'Project ID (overrides default)')
    .action(async (opts: { json?: boolean; project?: string }) => {
      try {
        const store = new FileProjectStore();
        const { id } = await resolveProjectId(opts.project, store);
        const project = await store.getById(id);

        if (!project) {
          throw new UserError(`Project not found: '${id}'.`);
        }
        if (!project.projectPath) {
          throw new UserError(
            `Project '${project.name}' has no projectPath configured.\n` +
              '  cf project set projectPath /path/to/project',
          );
        }

        const promptFilePath = path.join(project.projectPath, PROMPT_FILE_RELATIVE_PATH);
        const parser = new SystemPromptParser(promptFilePath);
        const prompts = await parser.getAllPrompts();

        // Build shorthand map for display
        const shorthands = await getPhaseShorthands(project.projectPath);
        const shorthandReverse = new Map<string, string>();
        for (const [key, name] of shorthands) {
          shorthandReverse.set(name.toLowerCase(), key);
        }

        const templates = prompts.map((p) => {
          const shorthand = shorthandReverse.get(p.name.replace(/\s*\(Phase \d+(?:\.\d+)?\)\s*/, '').toLowerCase()) ?? '';
          return {
            name: p.name,
            key: p.key,
            shorthand,
            parameterCount: p.parameters.length,
          };
        });

        if (opts.json) {
          printJson(templates);
          return;
        }

        const rows = templates.map((t) => [t.name, t.key, t.shorthand]);
        console.log(renderTable(['Name', 'Key', 'Shorthand'], rows));
      } catch (err) {
        handleError(err);
      }
    });

  cmd
    .command('get <phase>')
    .description('Get a prompt template with project variables substituted')
    .option('--project <id>', 'Project ID (overrides default)')
    .option('--raw', 'Output raw template without variable substitution')
    .action(async (phase: string, opts: { project?: string; raw?: boolean }) => {
      try {
        const store = new FileProjectStore();
        const { id } = await resolveProjectId(opts.project, store);
        const project = await store.getById(id);

        if (!project) {
          throw new UserError(`Project not found: '${id}'.`);
        }
        if (!project.projectPath) {
          throw new UserError(
            `Project '${project.name}' has no projectPath configured.\n` +
              '  cf project set projectPath /path/to/project',
          );
        }

        // Resolve shorthand or name to instruction key
        const resolvedPhase = await resolvePhaseInput(phase, project.projectPath);

        const promptFilePath = path.join(project.projectPath, PROMPT_FILE_RELATIVE_PATH);
        const parser = new SystemPromptParser(promptFilePath);
        const prompt = await parser.getPromptForInstruction(resolvedPhase);

        if (!prompt) {
          throw new UserError(
            `No prompt found for '${phase}'. Run cf prompt list to see available templates.`,
          );
        }

        const output = opts.raw ? prompt.content : substituteVariables(prompt.content, project);
        printRaw(output);
      } catch (err) {
        handleError(err);
      }
    });
}
