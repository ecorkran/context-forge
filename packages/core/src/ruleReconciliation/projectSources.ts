// Project-owned rule sources (slice 266, D6/D7). Core records which rule files
// the project owns and where a composite file's managed block sits; it never
// reads rule text for meaning.
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { COMPOSITE_RULE_FILES, RULE_FILE_PATHS, presentPaths } from '../detection/presentPaths.js';
import {
  GENERATED_MARKER,
  MANAGED_BEGIN_MARKER,
  MANAGED_END_MARKER,
  PREMANAGED_BACKUP_SUFFIX,
} from './markers.js';

/** 1-based, inclusive line numbers of a managed BEGIN/END pair. */
export interface ManagedBlockRange {
  beginLine: number;
  endLine: number;
}

/** `'none'`: no markers at all. `'broken'`: markers present but unusable. */
export type ManagedBlock = ManagedBlockRange | 'none' | 'broken';

/**
 * The one BEGIN/END rule: whole-line marker matches over the file's lines.
 * No markers is `'none'`; exactly one BEGIN before exactly one END is a range;
 * anything else (unpaired, duplicated, out of order) is `'broken'`.
 */
export function managedBlockRange(lines: readonly string[]): ManagedBlock {
  const begins = lines.flatMap((line, i) => (line === MANAGED_BEGIN_MARKER ? [i] : []));
  const ends = lines.flatMap((line, i) => (line === MANAGED_END_MARKER ? [i] : []));
  if (begins.length === 0 && ends.length === 0) return 'none';
  if (begins.length !== 1 || ends.length !== 1 || begins[0] > ends[0]) return 'broken';
  return { beginLine: begins[0] + 1, endLine: ends[0] + 1 };
}

export type ProjectRuleSource =
  | { path: string; kind: 'standalone' }
  | { path: string; kind: 'composite'; managedBlock: ManagedBlock };

/** awk-style records: split on `\n`; a final newline does not start another line. */
function toLines(text: string): string[] {
  if (text === '') return [];
  const lines = text.split('\n');
  if (text.endsWith('\n')) lines.pop();
  return lines;
}

function readRuleFile(root: string, relPath: string): string {
  try {
    return readFileSync(join(root, relPath), 'utf-8');
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`Cannot read rule file ${relPath}: ${reason}`, { cause: error });
  }
}

/** Every file under a directory entry, checkout-relative with `/` separators. Plain code-unit order. */
function filesUnder(root: string, relDir: string): string[] {
  const files: string[] = [];
  for (const name of readdirSync(join(root, relDir))) {
    const rel = `${relDir}/${name}`;
    if (statSync(join(root, rel)).isDirectory()) files.push(...filesUnder(root, rel));
    else files.push(rel);
  }
  return files.sort();
}

/** The rule files in `RULE_FILE_PATHS` that are present, with directory entries expanded to their files. */
function candidateFiles(root: string): string[] {
  return presentPaths(root, RULE_FILE_PATHS).flatMap((rel) =>
    statSync(join(root, rel)).isDirectory() ? filesUnder(root, rel) : [rel],
  );
}

/**
 * The project's own rule sources in `root` (D6): `RULE_FILE_PATHS` that exist,
 * minus cf's output (`installedPaths`, generated-marker files, pre-cf backups).
 * Deterministic: candidate order, directory contents sorted. Root level only.
 * A composite keeps its project-owned text outside `managedBlock`.
 */
export function projectRuleSources(root: string, installedPaths: readonly string[]): ProjectRuleSource[] {
  const installed = new Set(installedPaths);
  const sources: ProjectRuleSource[] = [];
  for (const rel of candidateFiles(root)) {
    if (installed.has(rel) || rel.endsWith(PREMANAGED_BACKUP_SUFFIX)) continue;
    const text = readRuleFile(root, rel);
    if (text.includes(GENERATED_MARKER)) continue;
    if (COMPOSITE_RULE_FILES.includes(rel)) {
      sources.push({ path: rel, kind: 'composite', managedBlock: managedBlockRange(toLines(text)) });
    } else {
      sources.push({ path: rel, kind: 'standalone' });
    }
  }
  return sources;
}
