import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { SystemPromptParser } from './SystemPromptParser.js';
import { StatementManager } from './StatementManager.js';
import { ContextTemplateEngine } from './ContextTemplateEngine.js';
import { ContextIntegrator } from './ContextIntegrator.js';
import { PROMPT_FILE_RELATIVE_PATH, STATEMENTS_FILE_RELATIVE_PATH } from './constants.js';

/** Absolute path to the bundled system prompt file shipped with @context-forge/core */
const BUNDLED_PROMPT_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'assets',
  'prompt.ai-project.system.md'
);

/**
 * Resolve the system prompt file path.
 * Prefers the project-local ai-project-guide copy; falls back to the bundled asset.
 */
function resolvePromptFilePath(projectPath: string): string {
  const projectLocalPath = path.join(projectPath, PROMPT_FILE_RELATIVE_PATH);
  if (fs.existsSync(projectLocalPath)) {
    return projectLocalPath;
  }
  return BUNDLED_PROMPT_PATH;
}

/**
 * Creates a fully wired context assembly pipeline for a given project path.
 * Intended for use in non-renderer contexts (MCP server, CLI, tests).
 *
 * Uses the project-local ai-project-guide prompt file if present,
 * otherwise falls back to the bundled prompt shipped with @context-forge/core.
 *
 * @param projectPath Absolute path to the project root
 * @returns { engine, integrator } ready for context generation
 */
export function createContextPipeline(projectPath: string): {
  engine: ContextTemplateEngine;
  integrator: ContextIntegrator;
} {
  const promptFilePath = resolvePromptFilePath(projectPath);
  const statementFilePath = path.join(projectPath, STATEMENTS_FILE_RELATIVE_PATH);

  const promptParser = new SystemPromptParser(promptFilePath);
  const statementManager = new StatementManager(statementFilePath);

  const engine = new ContextTemplateEngine(promptParser, statementManager);
  const readFileFn = (filePath: string): string => fs.readFileSync(filePath, 'utf-8');
  const integrator = new ContextIntegrator(engine, true, readFileFn);

  return { engine, integrator };
}
