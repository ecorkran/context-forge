/**
 * The bash file tests the installer is built on. Each follows symlinks, as
 * `[ -f ]`, `[ -d ]` and `[ -e ]` do, and is false for a missing path.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { byteOrder } from './lines.js';

function statOrNull(p: string): fs.Stats | null {
  return fs.statSync(p, { throwIfNoEntry: false }) ?? null;
}

/** `[ -f path ]` */
export function isFile(p: string): boolean {
  return statOrNull(p)?.isFile() ?? false;
}

/** `[ -d path ]` */
export function isDirectory(p: string): boolean {
  return statOrNull(p)?.isDirectory() ?? false;
}

/** `[ -e path ]` */
export function exists(p: string): boolean {
  return statOrNull(p) !== null;
}

/** `ls -A` is empty. */
export function isEmptyDirectory(p: string): boolean {
  return fs.readdirSync(p).length === 0;
}

/**
 * `"$dir"/*<suffix>` filtered by `[ -f ]`: full paths in byte order (the
 * LC_ALL=C glob order), dotfiles skipped. Empty when dir is missing.
 */
export function listMarkdownFiles(dir: string, suffix = '.md'): string[] {
  if (!isDirectory(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((name) => name.endsWith(suffix) && !name.startsWith('.'))
    .sort(byteOrder)
    .map((name) => path.join(dir, name))
    .filter(isFile);
}
