// Path check for the codebase comprehension doc, shared by `cf prompt get --comprehension`
// and the `fileComprehension` setters (slice 274, D3).
import * as fs from 'node:fs';
import * as path from 'node:path';
import { toRootRelative } from './adoptionInputs.js';

/** Why a path failed the check. Callers map the reason to their own error type. */
export const PATH_CHECK_REASONS = {
  missing: 'missing',
  directory: 'directory',
  outsideRoot: 'outside-root',
} as const;

export type PathCheckReason = (typeof PATH_CHECK_REASONS)[keyof typeof PATH_CHECK_REASONS];

/** User-visible wording per reason. The argument is the resolved absolute path. */
export const PATH_CHECK_MESSAGES: Record<PathCheckReason, (resolved: string) => string> = {
  [PATH_CHECK_REASONS.missing]: (resolved) => `path does not exist: ${resolved}`,
  [PATH_CHECK_REASONS.directory]: (resolved) => `path is a directory, not a file: ${resolved}`,
  [PATH_CHECK_REASONS.outsideRoot]: (resolved) => `path is outside the project root: ${resolved}`,
};

/** Raised by the path check; `reason` says which rule failed. */
export class PathCheckError extends Error {
  readonly reason: PathCheckReason;

  constructor(reason: PathCheckReason, resolved: string) {
    super(PATH_CHECK_MESSAGES[reason](resolved));
    this.name = 'PathCheckError';
    this.reason = reason;
  }
}

export interface PathCheckOptions {
  /** When true, a path that resolves outside the root is rejected. */
  requireInsideRoot: boolean;
}

/** True when `resolved` is `root` or lies beneath it. */
function isInsideRoot(root: string, resolved: string): boolean {
  const relative = path.relative(root, resolved);
  return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

/**
 * Resolves `input` against the project root. The path must exist and be a file; with
 * `requireInsideRoot` it must also lie inside the root, compared by real path so a symlinked
 * spelling of the root (macOS `/var` vs `/private/var`) still counts as inside. cf never reads
 * the file: it only names the path to an agent that can already read the disk.
 * @returns the absolute resolved path
 */
export function resolveComprehensionPath(root: string, input: string, options: PathCheckOptions): string {
  const resolved = path.resolve(root, input);
  let stats: fs.Stats;
  try {
    stats = fs.statSync(resolved);
  } catch (error) {
    // statSync only throws filesystem errors, which carry a `code`.
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    throw new PathCheckError(PATH_CHECK_REASONS.missing, resolved);
  }
  if (stats.isDirectory()) throw new PathCheckError(PATH_CHECK_REASONS.directory, resolved);
  if (options.requireInsideRoot && !isInsideRoot(fs.realpathSync(root), fs.realpathSync(resolved))) {
    throw new PathCheckError(PATH_CHECK_REASONS.outsideRoot, resolved);
  }
  return resolved;
}

/**
 * Setter-side normalization for a path-valued field: `""` clears the field; any other input is
 * checked (inside the root) and returned relative to `root` with `/` separators.
 */
export function normalizePathFieldValue(root: string, input: string): string {
  if (input === '') return '';
  const resolved = resolveComprehensionPath(root, input, { requireInsideRoot: true });
  return toRootRelative(fs.realpathSync(root), fs.realpathSync(resolved));
}
