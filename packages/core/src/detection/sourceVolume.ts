// Source-volume fact (slice 261, D2): a bounded async walk that counts non-blank
// source lines. It stops as soon as the brownfield threshold is reached, and fails
// loudly when the tree is too large to judge instead of guessing greenfield.
import type { Dirent } from 'fs';
import { lstat, readdir, readFile } from 'fs/promises';
import { extname, join } from 'path';
import { BROWNFIELD_MIN_SOURCE_LINES } from '../adoption/adoptionOutcome.js';
import { AdoptionError } from '../adoption/contracts.js';
import { isEnoent, isFsError } from './pathPresent.js';

export interface SourceVolume {
  files: number;
  lines: number;
  /** True when the walk stopped at the threshold, so `lines` is a lower bound. */
  capped: boolean;
}

/** Extensions (lowercase, no dot) counted as source. Adding a language is a one-line edit. */
export const SOURCE_EXTENSIONS: readonly string[] = [
  'ts', 'tsx', 'js', 'jsx', 'py', 'rb', 'go', 'rs', 'java', 'kt', 'swift', 'c', 'h', 'cpp', 'cs', 'php',
];

/** Directories never walked, besides any directory whose name starts with a dot. */
export const EXCLUDED_DIRS: readonly string[] = [
  'node_modules', 'vendor', 'dist', 'build', 'out', 'target', 'coverage', '__pycache__', 'venv',
  // cf's own footprint (guide, planning docs) must never tip a repo into brownfield.
  'project-documents',
];

/** Larger files are treated as generated or minified and skipped. */
export const MAX_SOURCE_FILE_BYTES = 512 * 1024;

/** Directory entries visited before the walk gives up on a large non-source tree. */
export const MAX_WALK_ENTRIES = 20_000;

const OVERRIDE_REMEDY =
  'To skip detection run `cf config set adoption.state in_progress` (treat as an existing codebase) ' +
  'or `cf config set adoption.state declined` (treat as new).';

interface Tally {
  files: number;
  lines: number;
  entries: number;
}

function walkFailure(path: string, error: unknown): AdoptionError {
  const code = isFsError(error) ? error.code : error instanceof Error ? error.name : 'unknown error';
  return new AdoptionError(`Cannot measure source volume: ${code} at ${path}. ${OVERRIDE_REMEDY}`, {
    cause: error,
  });
}

/** Sorted entries of a directory; a directory deleted mid-walk (ENOENT) is empty. */
async function listDirectory(dir: string): Promise<Dirent[]> {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    return entries.sort((a, b) => a.name.localeCompare(b.name));
  } catch (error) {
    if (isEnoent(error)) return [];
    throw walkFailure(dir, error);
  }
}

/** Non-blank line count of a source file, or null when skipped (oversized or deleted mid-walk). */
async function countSourceLines(path: string): Promise<number | null> {
  try {
    if ((await lstat(path)).size > MAX_SOURCE_FILE_BYTES) return null;
    const text = await readFile(path, 'utf-8');
    return text.split('\n').filter((line) => line.trim().length > 0).length;
  } catch (error) {
    if (isEnoent(error)) return null;
    throw walkFailure(path, error);
  }
}

function isSourceFile(name: string): boolean {
  return SOURCE_EXTENSIONS.includes(extname(name).slice(1).toLowerCase());
}

function isWalkedDirectory(name: string): boolean {
  return !name.startsWith('.') && !EXCLUDED_DIRS.includes(name);
}

async function walk(dir: string, tally: Tally): Promise<void> {
  for (const entry of await listDirectory(dir)) {
    if (tally.lines >= BROWNFIELD_MIN_SOURCE_LINES) return;
    tally.entries += 1;
    if (tally.entries >= MAX_WALK_ENTRIES) {
      throw new AdoptionError(
        `Cannot measure source volume: ${tally.entries} directory entries visited in ${dir} ` +
          `without reaching ${BROWNFIELD_MIN_SOURCE_LINES} source lines. ${OVERRIDE_REMEDY}`,
      );
    }
    // Dirent reports the entry itself, so a symlink is neither a directory nor a file here.
    const path = join(dir, entry.name);
    if (entry.isDirectory() && isWalkedDirectory(entry.name)) {
      await walk(path, tally);
    } else if (entry.isFile() && isSourceFile(entry.name)) {
      const lines = await countSourceLines(path);
      if (lines === null) continue;
      tally.files += 1;
      tally.lines += lines;
    }
  }
}

export async function measureSourceVolume(root: string): Promise<SourceVolume> {
  const tally: Tally = { files: 0, lines: 0, entries: 0 };
  await walk(root, tally);
  return {
    files: tally.files,
    lines: tally.lines,
    capped: tally.lines >= BROWNFIELD_MIN_SOURCE_LINES,
  };
}
