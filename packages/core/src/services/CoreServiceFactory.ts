import * as fs from 'fs';
import * as path from 'path';
import { SystemPromptParser } from './SystemPromptParser.js';
import { StatementManager } from './StatementManager.js';
import { ContextTemplateEngine } from './ContextTemplateEngine.js';
import { ContextIntegrator } from './ContextIntegrator.js';
import { PROMPT_FILE_RELATIVE_PATH, STATEMENTS_FILE_RELATIVE_PATH } from './constants.js';

/**
 * Resolve the system prompt file path for a project.
 * Requires the project to have ai-project-guide installed.
 * Throws if no prompt file is found.
 *
 * @param projectPath Absolute path to the project root
 * @returns Absolute path to the prompt file
 */
export function resolvePromptFilePath(projectPath: string): string {
  const projectLocalPath = path.join(projectPath, PROMPT_FILE_RELATIVE_PATH);
  if (fs.existsSync(projectLocalPath)) {
    return projectLocalPath;
  }
  throw new Error(
    `No prompt file found at ${projectLocalPath}. Run 'cf guide install' to set up the AI project guide.`
  );
}

/**
 * Creates a fully wired context assembly pipeline for a given project path.
 * Intended for use in non-renderer contexts (MCP server, CLI, tests).
 *
 * Uses the project-local ai-project-guide prompt file.
 * Throws if the guide is not installed.
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
