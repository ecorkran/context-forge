import { join } from 'path';
import { getStoragePath } from '../storage/storagePaths.js';

/** Returns the user-level config file path: {storagePath}/config.toml */
export function getUserConfigPath(): string {
  return join(getStoragePath(), 'config.toml');
}

/** Returns the project-level config file path: {projectPath}/.context-forge.toml */
export function getProjectConfigPath(projectPath: string): string {
  return join(projectPath, '.context-forge.toml');
}
