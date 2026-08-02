import envPaths from 'env-paths';
import { existsSync, mkdirSync as fsMkdirSync, renameSync } from 'fs';
import { homedir } from 'os';
import { join, dirname } from 'path';

const paths = envPaths('context-forge', { suffix: '' });

/** Filesystem/platform operations used by storage-path resolution — injectable for testing. */
export interface StoragePathDeps {
  platform: NodeJS.Platform;
  homedir: () => string;
  existsSync: (path: string) => boolean;
  /** Always creates intermediate directories — there is no non-recursive use case here. */
  mkdirSyncRecursive: (path: string) => void;
  renameSync: (oldPath: string, newPath: string) => void;
}

/** Default deps using the real platform/os/fs — used in production. */
const defaultDeps: StoragePathDeps = {
  platform: process.platform,
  homedir,
  existsSync,
  mkdirSyncRecursive: (path: string) => fsMkdirSync(path, { recursive: true }),
  renameSync,
};

/** Legacy env-paths config location on macOS (~/Library/Preferences/context-forge). */
export function getLegacyPreferencesPath(deps: StoragePathDeps): string {
  return join(deps.homedir(), 'Library', 'Preferences', 'context-forge');
}

/**
 * One-time move of the legacy macOS Preferences directory into the new
 * XDG-style location, when the new location doesn't already exist. Best
 * effort: `rename` is atomic, so a failure leaves the source untouched —
 * logging and falling through to fresh-location behavior is safer than
 * throwing out of every subsequent command over a convenience migration.
 */
function migrateLegacyPreferences(newPath: string, deps: StoragePathDeps): void {
  if (deps.existsSync(newPath)) return;

  const legacyPath = getLegacyPreferencesPath(deps);
  if (!deps.existsSync(legacyPath)) return;

  try {
    deps.mkdirSyncRecursive(dirname(newPath));
    deps.renameSync(legacyPath, newPath);
    console.log(`Migrated context-forge config from ${legacyPath} to ${newPath}`);
  } catch (err) {
    console.error(
      `Failed to migrate context-forge config from ${legacyPath} to ${newPath} — continuing with a fresh location at ${newPath}. Move the old directory manually if needed.`,
      err
    );
  }
}

/**
 * Resolves the canonical storage path for context-forge data.
 * Respects CONTEXT_FORGE_DATA_DIR override. On macOS, defaults to
 * ~/.config/context-forge (XDG-consistent with sibling tooling), migrating
 * any existing ~/Library/Preferences/context-forge install transparently.
 * Linux and Windows are unaffected — env-paths already resolves Linux to
 * ~/.config/context-forge via XDG_CONFIG_HOME.
 */
export function resolveStoragePath(deps: StoragePathDeps = defaultDeps): string {
  if (process.env.CONTEXT_FORGE_DATA_DIR) {
    return process.env.CONTEXT_FORGE_DATA_DIR;
  }

  if (deps.platform !== 'darwin') {
    return paths.config;
  }

  const newPath = join(deps.homedir(), '.config', 'context-forge');
  migrateLegacyPreferences(newPath, deps);
  return newPath;
}

/** Canonical storage path for context-forge data. Respects CONTEXT_FORGE_DATA_DIR override. */
export function getStoragePath(): string {
  return resolveStoragePath();
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
