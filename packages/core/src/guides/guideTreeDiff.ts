// Compares an installed guide directory with a staged one, for the update preview.
import { lstat, readFile, readdir, readlink } from 'fs/promises';
import { join } from 'path';
import { EXCLUDE_RECORD_FILE, VERSION_MARKER_FILE } from './types.js';
import type { GuidePreview } from './types.js';

/** cf's own bookkeeping, written fresh on every extract; never part of the guide content. */
const BOOKKEEPING_FILES: ReadonlySet<string> = new Set([VERSION_MARKER_FILE, EXCLUDE_RECORD_FILE]);

/** A regular file (compared by size, then bytes) or a symlink (compared by target, never followed). */
type TreeEntry = { kind: 'file'; path: string; size: number } | { kind: 'link'; target: string };

/** Run a filesystem call, naming the path in the error so a failed diff says what it could not read. */
async function atPath<T>(path: string, read: () => Promise<T>): Promise<T> {
  try {
    return await read();
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new Error(`Cannot read ${path} while comparing guide trees: ${reason}`, { cause: err });
  }
}

/** Whether anything exists at `path`; any error other than "not found" propagates. */
async function exists(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return true;
  } catch (err) {
    if (err instanceof Error && 'code' in err && err.code === 'ENOENT') return false;
    throw err;
  }
}

/** Relative path (forward slashes) to entry for every file and symlink under `root`. */
async function collectEntries(root: string, relative = '', into = new Map<string, TreeEntry>()): Promise<Map<string, TreeEntry>> {
  const directory = relative === '' ? root : join(root, relative);
  const children = await atPath(directory, () => readdir(directory, { withFileTypes: true }));

  for (const child of children) {
    const childRelative = relative === '' ? child.name : `${relative}/${child.name}`;
    const childPath = join(root, childRelative);
    if (child.isDirectory()) {
      await collectEntries(root, childRelative, into);
    } else if (child.isSymbolicLink()) {
      into.set(childRelative, { kind: 'link', target: await atPath(childPath, () => readlink(childPath)) });
    } else {
      const { size } = await atPath(childPath, () => lstat(childPath));
      into.set(childRelative, { kind: 'file', path: childPath, size });
    }
  }
  return into;
}

async function entriesDiffer(current: TreeEntry, staged: TreeEntry): Promise<boolean> {
  if (current.kind === 'link' || staged.kind === 'link') {
    return current.kind !== staged.kind || (current.kind === 'link' && staged.kind === 'link' && current.target !== staged.target);
  }
  if (current.size !== staged.size) return true;
  const [currentBytes, stagedBytes] = await Promise.all([
    atPath(current.path, () => readFile(current.path)),
    atPath(staged.path, () => readFile(staged.path)),
  ]);
  return !currentBytes.equals(stagedBytes);
}

/**
 * Count how the staged guide differs from the installed one. A missing
 * `currentDir` (nothing installed yet) is not an error: every staged file is
 * added. A missing `stagingDir` is an error, as is any unreadable path.
 */
export async function diffGuideTrees(currentDir: string, stagingDir: string): Promise<GuidePreview> {
  const staged = await collectEntries(stagingDir);
  // No installed guide yet (first install): everything staged counts as added.
  const current = (await exists(currentDir)) ? await collectEntries(currentDir) : new Map<string, TreeEntry>();
  for (const name of BOOKKEEPING_FILES) {
    staged.delete(name);
    current.delete(name);
  }

  let added = 0;
  let changed = 0;
  for (const [relative, stagedEntry] of staged) {
    const currentEntry = current.get(relative);
    if (!currentEntry) added++;
    else if (await entriesDiffer(currentEntry, stagedEntry)) changed++;
  }
  const removed = [...current.keys()].filter((relative) => !staged.has(relative)).length;

  return { added, removed, changed };
}
