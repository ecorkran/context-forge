import * as fs from 'fs';
import * as path from 'path';
import { SystemPromptParser } from './SystemPromptParser.js';
import { StatementManager } from './StatementManager.js';
import { ContextTemplateEngine } from './ContextTemplateEngine.js';
import { ContextIntegrator } from './ContextIntegrator.js';
import { STATEMENTS_FILE_RELATIVE_PATH } from './constants.js';
import { resolveTaskFilesForPrompt } from './taskFilesResolver.js';
import { resolveIntegrationBranchForPrompt } from './integrationBranchResolver.js';
import { resolvePermissivenessForPrompt } from './permissivenessResolver.js';
import { resolvePromptFilePath } from './promptFilePath.js';
import { createAdoptionResolver, type AdoptionStateWrites } from '../adoption/adoptionResolver.js';
import type { SquadronProbe } from '../adoption/contracts.js';
import { runSquadronProbe } from '../detection/squadronProbe.js';

// Defined in its own module so resolvers can use it without importing this factory.
export { resolvePromptFilePath };

/**
 * Creates a fully wired context assembly pipeline for a given project path.
 * Intended for use in non-renderer contexts (MCP server, CLI, tests).
 *
 * Uses the project-local ai-project-guide prompt file.
 * Throws if the guide is not installed.
 *
 * @param projectPath Absolute path to the project root
 * @param options.adoptionStateWrites Whether a first brownfield detection may persist adoption.state
 *   (`persist`) or must not (`read-only`, for previews). Required so every caller decides.
 * @param options.squadronProbe Runs `sq probe --json` for a brownfield build. Tests inject a fake;
 *   production callers omit it and get `runSquadronProbe`.
 * @returns { engine, integrator } ready for context generation
 */
export function createContextPipeline(
  projectPath: string,
  options: { adoptionStateWrites: AdoptionStateWrites; squadronProbe?: SquadronProbe },
): {
  engine: ContextTemplateEngine;
  integrator: ContextIntegrator;
} {
  const promptFilePath = resolvePromptFilePath(projectPath);
  const statementFilePath = path.join(projectPath, STATEMENTS_FILE_RELATIVE_PATH);

  const promptParser = new SystemPromptParser(promptFilePath);
  const statementManager = new StatementManager(statementFilePath);

  const engine = new ContextTemplateEngine(promptParser, statementManager);
  const readFileFn = (filePath: string): string => fs.readFileSync(filePath, 'utf-8');
  const integrator = new ContextIntegrator(
    engine,
    true,
    readFileFn,
    resolveTaskFilesForPrompt,
    resolveIntegrationBranchForPrompt,
    resolvePermissivenessForPrompt,
    createAdoptionResolver({
      stateWrites: options.adoptionStateWrites,
      squadronProbe: options.squadronProbe ?? runSquadronProbe,
    }),
  );

  return { engine, integrator };
}
