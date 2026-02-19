import { copyFile, readdir, unlink, readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';

/** Maximum number of versioned backups to retain per file. */
export const MAX_VERSIONED_BACKUPS = 10;

/** Filesystem operations used by backup functions — injectable for testing. */
export interface BackupFsDeps {
  existsSync: (path: string) => boolean;
  copyFile: (src: string, dest: string) => Promise<void>;
  readdir: (path: string) => Promise<string[]>;
  unlink: (path: string) => Promise<void>;
  readFile: (path: string, encoding: string) => Promise<string>;
}

/** Default deps using real fs — used in production. */
const defaultDeps: BackupFsDeps = {
  existsSync,
  copyFile,
  readdir: readdir as (path: string) => Promise<string[]>,
  unlink,
  readFile: readFile as (path: string, encoding: string) => Promise<string>,
};

/**
 * Create a versioned timestamped backup of a file in the storage directory,
 * then prune old backups beyond the retention limit.
 */
export async function createVersionedBackup(
  storagePath: string,
  filename: string,
  fs: BackupFsDeps = defaultDeps
): Promise<void> {
  const filePath = join(storagePath, filename);
  if (!fs.existsSync(filePath)) return;

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const versionedPath = join(storagePath, `${filename}.${timestamp}.backup`);
  await fs.copyFile(filePath, versionedPath);
  console.log(`Versioned backup created: ${filename}.${timestamp}.backup`);

  await pruneOldBackups(storagePath, filename, fs);
}

/**
 * Prune old versioned backups beyond the retention limit.
 * Rotation failure must not block the caller.
 */
export async function pruneOldBackups(
  storagePath: string,
  filename: string,
  fs: BackupFsDeps = defaultDeps
): Promise<void> {
  try {
    const entries = await fs.readdir(storagePath);
    const versionedPattern = `${filename}.`;
    const versionedBackups = entries
      .filter(
        (e) =>
          e.startsWith(versionedPattern) &&
          e.endsWith('.backup') &&
          e !== `${filename}.backup`
      )
      .sort()
      .reverse(); // newest first (ISO timestamps sort lexicographically)

    if (versionedBackups.length > MAX_VERSIONED_BACKUPS) {
      const toDelete = versionedBackups.slice(MAX_VERSIONED_BACKUPS);
      for (const old of toDelete) {
        await fs.unlink(join(storagePath, old));
      }
      console.log(
        `Pruned ${toDelete.length} old versioned backup(s) for ${filename}`
      );
    }
  } catch (err) {
    console.error(`Backup rotation failed for ${filename}:`, err);
  }
}

/**
 * Write guard for projects.json: prevents catastrophic data loss by refusing
 * to overwrite a multi-project file with near-empty data.
 *
 * Returns null if write is allowed, or an error message string if blocked.
 */
export async function checkWriteGuard(
  storagePath: string,
  filename: string,
  incomingData: string,
  fs: BackupFsDeps = defaultDeps
): Promise<string | null> {
  if (filename !== 'projects.json') return null;

  const filePath = join(storagePath, filename);
  if (!fs.existsSync(filePath)) return null;

  try {
    const existing = await fs.readFile(filePath, 'utf-8');
    const existingParsed = JSON.parse(existing);
    const incomingParsed = JSON.parse(incomingData);

    if (Array.isArray(existingParsed) && Array.isArray(incomingParsed)) {
      if (existingParsed.length > 2 && incomingParsed.length <= 1) {
        const msg = `Write guard: significant data reduction detected (${existingParsed.length} → ${incomingParsed.length})`;
        console.error(
          `Write guard: refusing to overwrite ${existingParsed.length} projects with ${incomingParsed.length}`
        );
        return msg;
      }
    }
  } catch (err) {
    // Guard itself failed (e.g., existing file unparseable) — allow write through
    console.error(
      `Write guard check failed for ${filename}, allowing write:`,
      err
    );
  }

  return null;
}
