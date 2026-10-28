import * as path from 'node:path';
import { Command } from 'commander';
import {
  COMPREHENSION_PROFILE_VARIABLE,
  FileProjectStore,
  SystemPromptParser,
  readAdoptionArtifacts,
  renderAdoptionInputs,
  resolveComprehensionPath,
} from '@context-forge/core/node';
import { PROMPT_FILE_RELATIVE_PATH, applyWorktreeOverlay } from '@context-forge/core';
import type { ProjectData } from '@context-forge/core';
import { findProjectByCwd, resolveProjectWorktree } from '../utils/project.js';
import { resolveOperationPath } from '../utils/worktree-overlay.js';
import { ensureGuideReady, warnIfGuideOutdated } from '../utils/guideReady.js';
import { handleError, UserError } from '../utils/errors.js';
import { withPathCheckAsUserError } from '../utils/pathCheck.js';
import { withJsonOption, withProjectOption, withRawOption } from '../options.js';
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

/**
 * The project a prompt is rendered for. `--path` picks the registered project at that directory
 * (worktree-aware); otherwise the usual `--project` / current-directory resolution applies.
 */
async function resolvePromptProject(
  store: FileProjectStore,
  opts: { project?: string; path?: string },
): Promise<{ project: ProjectData; worktreeId?: string }> {
  if (opts.path !== undefined) {
    if (opts.project) {
      throw new UserError('--path and --project cannot be used together.', 'INVALID_ARGUMENT');
    }
    const directory = path.resolve(opts.path);
    const match = await findProjectByCwd(store, directory);
    if (!match) {
      throw new UserError(
        `Project not found: no registered project at '${directory}'.`,
        'PROJECT_NOT_FOUND',
        'Run cf init in that directory first, or cf project list to see registered projects.',
      );
    }
    return match;
  }
  const { id, worktreeId } = await resolveProjectWorktree({ project: opts.project }, store);
  const project = await store.getById(id);
  if (!project) {
    throw new UserError(`Project not found: '${id}'.`);
  }
  return { project, worktreeId };
}

export function registerPromptCommand(program: Command): void {
  const cmd = program
    .command('prompt')
    .description('Access prompt templates with variable substitution');

  const listCmd = cmd.command('list').description('List available prompt templates');
  withJsonOption(listCmd);
  withProjectOption(listCmd);
  listCmd.action(async (opts: { json?: boolean; project?: string }) => {
      try {
        const store = new FileProjectStore();
        const { id, worktreeId } = await resolveProjectWorktree({ project: opts.project }, store);
        const project = await store.getById(id);

        if (!project) {
          throw new UserError(`Project not found: '${id}'.`);
        }
        const opPath = resolveOperationPath(project, worktreeId);
        if (!opPath) {
          throw new UserError(
            `Project '${project.name}' has no projectPath configured.\n` +
              '  cf project set projectPath /path/to/project',
          );
        }

        // The prompt file lives inside the guide, so the checkout must exist
        // before it is read (#80).
        await ensureGuideReady(project.projectPath!, opPath);

        const promptFilePath = path.join(opPath, PROMPT_FILE_RELATIVE_PATH);
        const parser = new SystemPromptParser(promptFilePath);
        const prompts = await parser.getAllPrompts();

        // Build shorthand map for display
        const shorthands = await getPhaseShorthands(opPath);
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

  const getCmd = cmd.command('get <phase>').description('Get a prompt template with project variables substituted');
  withProjectOption(getCmd);
  withRawOption(getCmd);
  getCmd.option('--path <dir>', 'Use the registered project at this directory (default: resolve from the current directory)');
  getCmd.option(
    '--comprehension <path>',
    'Codebase comprehension file to name in the Adoption Inputs section (only for prompts whose profile lists it)',
  );
  getCmd.action(async (phase: string, opts: { project?: string; raw?: boolean; path?: string; comprehension?: string }) => {
      try {
        if (opts.raw && opts.comprehension !== undefined) {
          throw new UserError('--comprehension cannot be used with --raw: raw output is the unrendered template.', 'INVALID_ARGUMENT');
        }
        const store = new FileProjectStore();
        const { project, worktreeId } = await resolvePromptProject(store, opts);
        const opPath = resolveOperationPath(project, worktreeId);
        if (!opPath) {
          throw new UserError(
            `Project '${project.name}' has no projectPath configured.\n` +
              '  cf project set projectPath /path/to/project',
          );
        }

        // The prompt file lives inside the guide, so the checkout must exist
        // before anything reads it (#80) — including shorthand resolution,
        // which opens the prompt file for P<n> inputs.
        await ensureGuideReady(project.projectPath!, opPath);

        // Resolve shorthand or name to instruction key
        const resolvedPhase = await resolvePhaseInput(phase, opPath);

        const promptFilePath = path.join(opPath, PROMPT_FILE_RELATIVE_PATH);
        const parser = new SystemPromptParser(promptFilePath);
        const prompt = await parser.getPromptForInstruction(resolvedPhase);

        if (!prompt) {
          throw new UserError(
            `No prompt found for '${phase}'. Run cf prompt list to see available templates.`,
          );
        }

        // The guide's profile decides which prompts take adoption inputs; cf names no prompt key.
        const takesAdoptionInputs = (await parser.getProfileVariables(prompt.key)).includes(COMPREHENSION_PROFILE_VARIABLE);
        if (opts.comprehension !== undefined && !takesAdoptionInputs) {
          throw new UserError(
            `--comprehension is not accepted by prompt '${prompt.key}': its context profile does not list ${COMPREHENSION_PROFILE_VARIABLE}.`,
            'INVALID_ARGUMENT',
          );
        }
        const comprehensionInput = opts.comprehension;
        const comprehensionPath =
          comprehensionInput === undefined
            ? null
            : withPathCheckAsUserError(() =>
                resolveComprehensionPath(opPath, comprehensionInput, { requireInsideRoot: false }),
              );

        const resolved = worktreeId ? applyWorktreeOverlay(project, worktreeId) : project;
        let output = opts.raw ? prompt.content : substituteVariables(prompt.content, resolved);
        if (takesAdoptionInputs && !opts.raw) {
          const section = renderAdoptionInputs(opPath, comprehensionPath, await readAdoptionArtifacts(opPath));
          output = `${output.trimEnd()}\n\n${section}\n`;
        }
        // Guide-version warning goes to stderr; stdout and the exit code are unchanged (slice 272, D4).
        await warnIfGuideOutdated(opPath);
        printRaw(output);
      } catch (err) {
        handleError(err);
      }
    });
}
