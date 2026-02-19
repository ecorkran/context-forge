import envPaths from 'env-paths';
import { join } from 'path';
import { homedir } from 'os';

const paths = envPaths('context-forge', { suffix: '' });

/** Canonical storage path for context-forge data. Respects CONTEXT_FORGE_DATA_DIR override. */
export function getStoragePath(): string {
  return process.env.CONTEXT_FORGE_DATA_DIR || paths.config;
}

/**
 * Legacy Electron storage path (macOS only).
 * Returns the path Electron's `app.getPath('userData')` + `/context-forge` used,
 * or null on non-macOS platforms where env-paths typically resolves to the same location.
 */
export function getLegacyElectronPath(): string | null {
  if (process.platform === 'darwin') {
    return join(homedir(), 'Library', 'Application Support', 'context-forge', 'context-forge');
  }
  return null;
}
