import { readFile, writeFile, copyFile, rename, unlink, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import type { IStorageService, StorageReadResult } from './interfaces.js';
import { checkWriteGuard } from './backupService.js';

/** Error thrown when a filename contains path-traversal characters. */
class InvalidFilenameError extends Error {
  constructor(filename: string) {
    super(`Invalid filename: ${filename}`);
    this.name = 'InvalidFilenameError';
  }
}

/** Validate a filename — reject path-traversal characters. */
function validateFilename(filename: string): void {
  if (
    filename.includes('..') ||
    filename.includes('/') ||
    filename.includes('\\')
  ) {
    throw new InvalidFilenameError(filename);
  }
}

/**
 * Low-level filesystem storage service implementing atomic writes,
 * backup on write, and recovery from corrupted files.
 */
export class FileStorageService implements IStorageService {
  constructor(private readonly storagePath: string) {}

  async read(filename: string): Promise<StorageReadResult> {
    validateFilename(filename);

    const filePath = join(this.storagePath, filename);
    const backupPath = join(this.storagePath, `${filename}.backup`);

    // Try main file first
    try {
      const data = await readFile(filePath, 'utf-8');
      JSON.parse(data); // validate JSON
      return { data };
    } catch (mainError) {
      // Main file missing or corrupted — try backup recovery
      try {
        const backupData = await readFile(backupPath, 'utf-8');
        JSON.parse(backupData); // validate backup JSON

        // Restore main file from backup
        try {
          await copyFile(backupPath, filePath);
        } catch {
          // Recovery of main file failed — still return backup data
        }

        return {
          data: backupData,
          recovered: true,
          message: 'Data recovered from backup file',
        };
      } catch {
        // Neither main nor backup available/valid
        if (
          mainError instanceof Error &&
          'code' in mainError &&
          (mainError as NodeJS.ErrnoException).code === 'ENOENT'
        ) {
          throw mainError; // propagate file-not-found
        }
        throw new Error(
          'File corrupted and no valid backup available'
        );
      }
    }
  }

  async write(filename: string, data: string): Promise<void> {
    validateFilename(filename);

    // Ensure storage directory exists
    if (!existsSync(this.storagePath)) {
      await mkdir(this.storagePath, { recursive: true });
    }

    const filePath = join(this.storagePath, filename);
    const tempPath = join(this.storagePath, `${filename}.tmp`);
    const backupPath = join(this.storagePath, `${filename}.backup`);

    // Write guard: prevent catastrophic data loss for projects.json
    const guardError = await checkWriteGuard(
      this.storagePath,
      filename,
      data
    );
    if (guardError) {
      throw new Error(guardError);
    }

    // Backup existing file (single .backup, overwritten each write)
    if (existsSync(filePath)) {
      await copyFile(filePath, backupPath);
    }

    // Write to temp file
    await writeFile(tempPath, data, 'utf-8');

    // Validate JSON
    try {
      JSON.parse(data);
    } catch {
      if (existsSync(tempPath)) {
        await unlink(tempPath);
      }
      throw new Error('Invalid JSON data');
    }

    // Atomic rename
    await rename(tempPath, filePath);
  }

  async createBackup(filename: string): Promise<void> {
    validateFilename(filename);

    const filePath = join(this.storagePath, filename);
    const backupPath = join(this.storagePath, `${filename}.backup`);

    if (existsSync(filePath)) {
      await copyFile(filePath, backupPath);
    }
  }

  async exists(filename: string): Promise<boolean> {
    validateFilename(filename);
    return existsSync(join(this.storagePath, filename));
  }
}
