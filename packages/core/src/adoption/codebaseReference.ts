// Path check for the codebase comprehension doc, shared by `cf prompt get --comprehension`
// and the `fileComprehension` setters (slice 274, D3).
import * as fs from 'node:fs';
import * as path from 'node:path';
import { isFsError } from '../detection/pathPresent.js';
import {
  DOCS_MAP_ERROR_KIND,
  DOCS_MAP_STATE,
  DocsMapError,
  compareDocsMap,
  docsMapPath,
} from '../docs-map/index.js';
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

/** Which comprehension state the build reports (D5). */
export const COMPREHENSION_FACT = {
  None: 'none',
  Present: 'present',
  Missing: 'missing',
  NotReadable: 'not-readable',
} as const;

/** Which docs map state the build reports (D5). */
export const DOCS_MAP_FACT = {
  None: 'none',
  Current: 'current',
  OutOfDate: 'out-of-date',
  CannotCheck: 'cannot-check',
} as const;

/** Structured facts only: the wording lives in the section renderer. Paths are root-relative with `/`. */
export type ComprehensionFact =
  | { kind: typeof COMPREHENSION_FACT.None }
  | { kind: typeof COMPREHENSION_FACT.Present; path: string }
  | { kind: typeof COMPREHENSION_FACT.Missing; path: string; reason: string }
  | { kind: typeof COMPREHENSION_FACT.NotReadable; path: string; reason: string };

export type DocsMapFact =
  | { kind: typeof DOCS_MAP_FACT.None }
  | { kind: typeof DOCS_MAP_FACT.Current; path: string }
  | { kind: typeof DOCS_MAP_FACT.OutOfDate; path: string }
  | {
      kind: typeof DOCS_MAP_FACT.CannotCheck;
      /** Null when the project name cannot form a map path at all. */
      path: string | null;
      reason: string;
      /** True when the map's markers are the problem, so fixing them is the remedy. */
      markers: boolean;
    };

/** Which of the two build variables the active profile lists. */
export interface ListedReferences {
  comprehension: boolean;
  docsMap: boolean;
}

export interface CodebaseReferenceFacts {
  comprehension?: ComprehensionFact;
  docsMap?: DocsMapFact;
}

const NOT_A_FILE_REASON = 'is a directory, not a file';

async function readComprehensionFact(root: string, fileComprehension: string): Promise<ComprehensionFact> {
  if (fileComprehension === '') return { kind: COMPREHENSION_FACT.None };
  const resolved = path.resolve(root, fileComprehension);
  const relative = toRootRelative(root, resolved);
  try {
    const stats = await fs.promises.stat(resolved);
    if (stats.isDirectory()) return { kind: COMPREHENSION_FACT.NotReadable, path: relative, reason: NOT_A_FILE_REASON };
    await fs.promises.access(resolved, fs.constants.R_OK);
    return { kind: COMPREHENSION_FACT.Present, path: relative };
  } catch (error) {
    // Filesystem failures are reported as facts; anything else is a bug and propagates.
    if (!isFsError(error)) throw error;
    if (error.code === 'ENOENT') return { kind: COMPREHENSION_FACT.Missing, path: relative, reason: error.code };
    return { kind: COMPREHENSION_FACT.NotReadable, path: relative, reason: error.code };
  }
}

async function readDocsMapFact(root: string, projectName: string): Promise<DocsMapFact> {
  let mapPath: string | null = null;
  try {
    mapPath = toRootRelative(root, docsMapPath(root, projectName));
    const comparison = await compareDocsMap(root, projectName);
    if (comparison.state === DOCS_MAP_STATE.Absent) return { kind: DOCS_MAP_FACT.None };
    const kind = comparison.state === DOCS_MAP_STATE.Current ? DOCS_MAP_FACT.Current : DOCS_MAP_FACT.OutOfDate;
    return { kind, path: mapPath };
  } catch (error) {
    // The docs map reports its own failures as DocsMapError; raw filesystem errors can still
    // escape discovery. Both degrade to a fact. Anything else is a bug and propagates.
    if (error instanceof DocsMapError) {
      return {
        kind: DOCS_MAP_FACT.CannotCheck,
        path: mapPath,
        reason: error.reason,
        markers: error.kind === DOCS_MAP_ERROR_KIND.Markers,
      };
    }
    if (isFsError(error)) {
      return { kind: DOCS_MAP_FACT.CannotCheck, path: mapPath, reason: error.code, markers: false };
    }
    throw error;
  }
}

/**
 * The comprehension doc and docs map facts for the variables the profile lists (D5). Reads only:
 * the compare step never writes. Failures that D5 names become facts; any other error propagates.
 */
export async function readCodebaseReference(
  root: string,
  projectName: string,
  fileComprehension: string,
  listed: ListedReferences,
): Promise<CodebaseReferenceFacts> {
  const [comprehension, docsMap] = await Promise.all([
    listed.comprehension ? readComprehensionFact(root, fileComprehension) : undefined,
    listed.docsMap ? readDocsMapFact(root, projectName) : undefined,
  ]);
  return { comprehension, docsMap };
}
