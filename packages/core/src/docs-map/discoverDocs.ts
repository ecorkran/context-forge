// Discovery for the docs map (slice 267, D2/D3): which existing docs and ADRs live under the
// checkout root. Candidate locations are slice 261's lists, never copied. The only file content
// read is the first H1, copied verbatim as link text; nothing branches on it.
import type { Dirent, Stats } from 'fs';
import { lstat, readdir, readFile } from 'fs/promises';
import { basename, extname, join, posix } from 'path';
import { isEnoent } from '../detection/pathPresent.js';
import { ADR_DIRS, DOC_PATHS, presentPaths } from '../detection/presentPaths.js';
import { EXCLUDED_DIRS } from '../detection/sourceVolume.js';
import { wrapFsError } from './docsMapError.js';

export interface MappedDoc {
  kind: 'adr' | 'doc';
  /** Root-relative, POSIX separators. */
  path: string;
  title: string;
}

export interface Discovery {
  docs: MappedDoc[];
  /** Root-relative POSIX paths of symlinks that were not followed. */
  skippedSymlinks: string[];
}

export const MARKDOWN_EXTENSIONS: readonly string[] = ['.md'];

const FRONTMATTER_FENCE = '---';

/** ATX level-1 heading: `#`, at least one space, text; a closing `#` run must follow a space. */
const H1_PATTERN = /^\s*#[ \t]+(.+?)(?:[ \t]+#+)?[ \t]*$/;

interface WalkResult {
  files: string[];
  symlinks: string[];
}

function isMarkdown(name: string): boolean {
  return MARKDOWN_EXTENSIONS.includes(extname(name).toLowerCase());
}

function isSkippedDirectory(name: string): boolean {
  return name.startsWith('.') || EXCLUDED_DIRS.includes(name);
}

/** Recursively collect Markdown files under `relDir`; symlinks are recorded, never followed. */
async function walkMarkdown(root: string, relDir: string, into: WalkResult): Promise<void> {
  let entries: Dirent[];
  try {
    entries = await readdir(join(root, relDir), { withFileTypes: true });
  } catch (error) {
    // The directory vanished after it was found: treat it as not present.
    if (isEnoent(error)) return;
    throw wrapFsError(relDir, 'read directory', error);
  }
  for (const entry of entries) {
    const relPath = posix.join(relDir, entry.name);
    if (entry.isSymbolicLink()) {
      into.symlinks.push(relPath);
    } else if (entry.isDirectory()) {
      if (!isSkippedDirectory(entry.name)) await walkMarkdown(root, relPath, into);
    } else if (entry.isFile() && isMarkdown(entry.name)) {
      into.files.push(relPath);
    }
  }
}

/** Expand one present candidate into the Markdown files it stands for. */
async function expandCandidate(root: string, candidate: string, into: WalkResult): Promise<void> {
  let stats: Stats;
  try {
    stats = await lstat(join(root, candidate));
  } catch (error) {
    // The candidate vanished after presentPaths found it: treat it as not present.
    if (isEnoent(error)) return;
    throw wrapFsError(candidate, 'inspect', error);
  }
  if (stats.isSymbolicLink()) {
    into.symlinks.push(candidate);
  } else if (stats.isDirectory()) {
    await walkMarkdown(root, candidate, into);
  } else {
    into.files.push(candidate);
  }
}

/** The first H1 of a Markdown file, skipping a leading frontmatter block. */
function firstHeading(content: string): string | undefined {
  const lines = content.split(/\r?\n/);
  let index = 0;
  if (lines[0]?.trimEnd() === FRONTMATTER_FENCE) {
    const close = lines.findIndex((line, i) => i > 0 && line.trimEnd() === FRONTMATTER_FENCE);
    // An unterminated block means the whole file is frontmatter: no heading inside it.
    if (close === -1) return undefined;
    index = close + 1;
  }
  for (; index < lines.length; index++) {
    const match = H1_PATTERN.exec(lines[index]);
    if (match) return match[1];
  }
  return undefined;
}

/** The title for a doc: its first H1, else the filename. `undefined` when the file vanished. */
async function readTitle(root: string, relPath: string): Promise<string | undefined> {
  let content: string;
  try {
    content = await readFile(join(root, relPath), 'utf8');
  } catch (error) {
    // The file vanished after the walk: the caller drops the entry.
    if (isEnoent(error)) return undefined;
    throw wrapFsError(relPath, 'read', error);
  }
  return firstHeading(content) ?? basename(relPath);
}

export async function discoverMappedDocs(root: string): Promise<Discovery> {
  const adrs: WalkResult = { files: [], symlinks: [] };
  for (const candidate of presentPaths(root, ADR_DIRS)) {
    await expandCandidate(root, candidate, adrs);
  }
  const docs: WalkResult = { files: [], symlinks: [] };
  for (const candidate of presentPaths(root, DOC_PATHS)) {
    await expandCandidate(root, candidate, docs);
  }

  const adrPaths = new Set(adrs.files);
  const kinds = new Map<string, MappedDoc['kind']>();
  for (const path of adrPaths) kinds.set(path, 'adr');
  for (const path of docs.files) if (!adrPaths.has(path)) kinds.set(path, 'doc');

  const mapped: MappedDoc[] = [];
  for (const [path, kind] of kinds) {
    const title = await readTitle(root, path);
    if (title !== undefined) mapped.push({ kind, path, title });
  }
  const skippedSymlinks = [...new Set([...adrs.symlinks, ...docs.symlinks])].sort();
  return { docs: mapped, skippedSymlinks };
}
