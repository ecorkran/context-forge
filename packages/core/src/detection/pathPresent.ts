// Shared missing-file rule for detection checks.
// ENOENT on the queried path means "not present"; every other error is rethrown
// unchanged so the caller's message keeps the error code and path. existsSync is
// deliberately not used: it hides permission and loop errors.
import { lstatSync, statSync } from 'fs';

function isEnoent(error: unknown): boolean {
  return (error as NodeJS.ErrnoException | null)?.code === 'ENOENT';
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
