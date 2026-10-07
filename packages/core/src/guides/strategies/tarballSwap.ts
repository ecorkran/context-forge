// Staging and swap helpers for the tarball strategy's replace-the-guide step.
import { existsSync, renameSync, rmSync } from 'fs';
import { basename, dirname, join } from 'path';

/**
 * Suffixes for the sibling directories used next to the guide directory
 * (e.g. project-documents/.ai-project-guide.staging). Siblings, so both
 * renames stay on one filesystem.
 */
const STAGING_SUFFIX = '.staging';
const PREVIOUS_SUFFIX = '.previous';

function siblingPath(targetDir: string, suffix: string): string {
  return join(dirname(targetDir), `.${basename(targetDir)}${suffix}`);
}

/** Where the new guide is built before it replaces `targetDir`. */
export function stagingPathFor(targetDir: string): string {
  return siblingPath(targetDir, STAGING_SUFFIX);
}

/** Remove the staging directory; safe when it does not exist. */
export function removeStaging(targetDir: string): void {
  rmSync(stagingPathFor(targetDir), { recursive: true, force: true });
}

/** Remove staging and backup directories left behind by an earlier crash. */
export function clearLeftovers(targetDir: string): void {
  removeStaging(targetDir);
  rmSync(siblingPath(targetDir, PREVIOUS_SUFFIX), { recursive: true, force: true });
}

/**
 * Replace `targetDir` with the staged guide. A failed swap restores the
 * previous guide and rethrows.
 */
export function swapIntoPlace(targetDir: string): void {
  const staging = stagingPathFor(targetDir);
  const previous = siblingPath(targetDir, PREVIOUS_SUFFIX);

  const hadGuide = existsSync(targetDir);
  if (hadGuide) renameSync(targetDir, previous);
  try {
    renameSync(staging, targetDir);
  } catch (err) {
    if (hadGuide) restorePrevious(previous, targetDir, err);
    throw err;
  }
  rmSync(previous, { recursive: true, force: true });
}

/**
 * Move the previous guide back after a failed swap. If that also fails, the
 * guide exists only at `previous`: throw an error that says where, keeping
 * the swap failure as the cause so the root error is not lost.
 */
function restorePrevious(previous: string, targetDir: string, swapError: unknown): void {
  let restoreFailure: { reason: string } | null = null;
  try {
    renameSync(previous, targetDir);
  } catch (restoreError) {
    restoreFailure = { reason: restoreError instanceof Error ? restoreError.message : String(restoreError) };
  }
  // Thrown outside the catch: the cause is the swap failure, not the restore failure.
  if (restoreFailure) {
    throw new Error(
      `Installing the new guide failed, and restoring the previous guide also failed (${restoreFailure.reason}). ` +
        `The previous guide is at ${previous}; move it back to ${targetDir} by hand.`,
      { cause: swapError }
    );
  }
}
