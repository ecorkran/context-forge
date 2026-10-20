import * as fs from 'fs';
import * as path from 'path';
import { PROMPT_FILE_RELATIVE_PATH } from './constants.js';

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
    `No prompt file found at ${projectLocalPath}. Run 'cf guides install' to set up the AI project guide.`
  );
}
