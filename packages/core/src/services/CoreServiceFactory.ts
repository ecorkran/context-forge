import * as path from 'path';
import { SystemPromptParser } from './SystemPromptParser.js';
import { StatementManager } from './StatementManager.js';
import { ContextTemplateEngine } from './ContextTemplateEngine.js';
import { ContextIntegrator } from './ContextIntegrator.js';
import { PROMPT_FILE_RELATIVE_PATH, STATEMENTS_FILE_RELATIVE_PATH } from './constants.js';

/**
 * Creates a fully wired context assembly pipeline for a given project path.
 * Intended for use in non-renderer contexts (MCP server, CLI, tests).
 *
 * @param projectPath Absolute path to the project root
 * @returns { engine, integrator } ready for context generation
 */
export function createContextPipeline(projectPath: string): {
  engine: ContextTemplateEngine;
  integrator: ContextIntegrator;
} {
  const promptFilePath = path.join(projectPath, PROMPT_FILE_RELATIVE_PATH);
  const statementFilePath = path.join(projectPath, STATEMENTS_FILE_RELATIVE_PATH);

  const promptParser = new SystemPromptParser(promptFilePath);
  const statementManager = new StatementManager(statementFilePath);

  const engine = new ContextTemplateEngine(promptParser, statementManager);
  const integrator = new ContextIntegrator(engine);

  return { engine, integrator };
}
