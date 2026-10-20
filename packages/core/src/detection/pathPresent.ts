// Shared missing-file rule for detection checks.
// ENOENT on the queried path means "not present"; every other error is rethrown
// unchanged so the caller's message keeps the error code and path. existsSync is
// deliberately not used: it hides permission and loop errors.
import { lstatSync, statSync } from 'fs';

/** Node filesystem errors carry a string `code` (and usually `path`). */
export type FsError = Error & { code: string; path?: string };

export function isFsError(error: unknown): error is FsError {
  // The cast only reads `code` to narrow an unknown caught value; it is the one place this is done.
  return error instanceof Error && typeof (error as { code?: unknown }).code === 'string';
}

export function isEnoent(error: unknown): boolean {
  return isFsError(error) && error.code === 'ENOENT';
}

export function pathPresent(path: string): boolean {
  let isSymlink: boolean;
  try {
    isSymlink = lstatSync(path).isSymbolicLink();
  } catch (error) {
    if (isEnoent(error)) return false;
    throw error;
  }
  // lstat found an entry. A symlink whose target cannot be stat'd is broken
  // (or a loop) and is an error, not "not present".
  if (isSymlink) statSync(path);
  return true;
}
