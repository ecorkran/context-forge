/**
 * Managed-section merge for the composite files (CLAUDE.md, AGENTS.md,
 * copilot-instructions.md): generated content lives between a BEGIN/END pair,
 * and everything outside it belongs to the project.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  MANAGED_BEGIN_MARKER,
  MANAGED_END_MARKER,
  MANAGED_MARKER,
  MANAGED_MARKER_END,
} from '../commands/ideTargets.js';
import { isFile } from './fsChecks.js';
import { fromRecords, toRecords } from './lines.js';
import type { Printer } from './output.js';
import { PREMANAGED_BACKUP_SUFFIX } from './paths.js';

/** Temp file a merge is written to before it is renamed into place. */
const MERGE_TEMP_SUFFIX = '.context-forge.tmp';

/**
 * Project files are handled as latin1 strings: one char per byte, so bytes
 * outside the block round-trip exactly even when they are not valid UTF-8.
 * The markers are ASCII, so whole-line matches are unaffected.
 */
const BYTES = 'latin1';

function readBytes(file: string): string {
  return fs.readFileSync(file, BYTES);
}

/**
 * - absent: no file
 * - unmanaged: a file never written to
 * - legacy: carries the pre-merge single marker
 * - managed: one BEGIN before one END
 * - broken: markers present but unusable (unpaired, out of order, duplicated)
 */
export type ManagedState = 'absent' | 'unmanaged' | 'legacy' | 'managed' | 'broken';

/** `managed_state`: classifies by whole-line marker matches (`grep -Fx`). */
export function managedState(file: string): ManagedState {
  if (!isFile(file)) return 'absent';
  const lines = toRecords(readBytes(file));
  const begins = lines.flatMap((line, i) => (line === MANAGED_BEGIN_MARKER ? [i] : []));
  const ends = lines.flatMap((line, i) => (line === MANAGED_END_MARKER ? [i] : []));

  if (begins.length === 0 && ends.length === 0) {
    return lines.includes(MANAGED_MARKER) ? 'legacy' : 'unmanaged';
  }
  if (begins.length !== 1 || ends.length !== 1) return 'broken';
  return begins[0] < ends[0] ? 'managed' : 'broken';
}

/** One-time backup before first touching a file we did not write. Never overwritten. */
function backupPremanagedFile(file: string, out: Printer): void {
  const backup = file + PREMANAGED_BACKUP_SUFFIX;
  if (isFile(backup)) return;
  fs.copyFileSync(file, backup);
  out.status('yellow', `💾 Backed up existing ${path.basename(file)} → ${path.basename(backup)}`);
}

function block(content: string): string {
  return `${MANAGED_BEGIN_MARKER}\n${content}${MANAGED_END_MARKER}\n`;
}

/**
 * Legacy layout: generated content ran from the marker to EOF. Keeps what is
 * above the marker, minus a first-line H1 the new block re-emits (and the blank
 * line after it), and anything after a hand-added end marker.
 */
function migrateLegacy(original: string, content: string): string {
  const firstContentLine = toRecords(content)[0] ?? '';
  const generatedH1 = firstContentLine.startsWith('# ') ? firstContentLine : '';
  const lines = toRecords(original);

  const above: string[] = [];
  let skippedH1 = false;
  for (const [index, line] of lines.entries()) {
    if (line === MANAGED_MARKER) break;
    if (index === 0 && generatedH1 !== '' && line === generatedH1) {
      skippedH1 = true;
      continue;
    }
    if (index === 1 && skippedH1 && line === '') continue;
    above.push(line);
  }

  const tail: string[] = [];
  let pastMarker = false;
  let keep = false;
  for (const line of lines) {
    if (line === MANAGED_MARKER) {
      pastMarker = true;
      continue;
    }
    if (pastMarker && line === MANAGED_MARKER_END) {
      keep = true;
      continue;
    }
    if (keep) tail.push(line);
  }
  return fromRecords(above) + block(content) + fromRecords(tail);
}

/**
 * Replaces the block's contents. Bytes outside the block pass through
 * untouched, including a missing final newline. (bash rewrote every line as an
 * awk record and so added one: #38, fixed here.)
 */
function replaceBlock(original: string, content: string): string {
  const out: string[] = [];
  let inBlock = false;
  for (const line of toRecords(original)) {
    if (line === MANAGED_BEGIN_MARKER) {
      out.push(line, ...toRecords(content));
      inBlock = true;
    } else if (line === MANAGED_END_MARKER) {
      inBlock = false;
      out.push(line);
    } else if (!inBlock) {
      out.push(line);
    }
  }
  const merged = fromRecords(out);
  return original === '' || original.endsWith('\n') ? merged : merged.slice(0, -1);
}

/**
 * `write_managed_section`: merge content into target's block, keeping
 * everything outside it. Returns false (file untouched) for broken markers.
 */
export function writeManagedSection(
  targetFile: string,
  compiled: string,
  label: string,
  out: Printer,
): boolean {
  const state = managedState(targetFile);
  const content = Buffer.from(compiled, 'utf-8').toString(BYTES);
  if (state === 'broken') {
    out.status('red', `❌ ${label} has unbalanced context-forge markers`);
    out.status(
      'yellow',
      `   Expected exactly one ${MANAGED_BEGIN_MARKER} and one ${MANAGED_END_MARKER}, in that order.`,
    );
    out.status('yellow', '   Left unchanged — fix the markers by hand, then re-run.');
    return false;
  }

  fs.mkdirSync(path.dirname(targetFile), { recursive: true });
  let merged: string;
  switch (state) {
    case 'absent':
      merged = block(content);
      break;
    case 'unmanaged': {
      backupPremanagedFile(targetFile, out);
      // The forced newline guarantees separation when the file lacks a final one.
      merged = readBytes(targetFile) + '\n' + block(content);
      out.status('yellow', `📎 Preserved existing ${label}; appended managed block`);
      break;
    }
    case 'legacy': {
      backupPremanagedFile(targetFile, out);
      const original = readBytes(targetFile);
      merged = migrateLegacy(original, content);
      out.status('yellow', `🔄 Migrated ${label} to BEGIN/END markers`);
      out.status(
        'yellow',
        toRecords(original).includes(MANAGED_MARKER_END)
          ? '   Content between the old markers was generated and has been replaced; content after the end marker was kept.'
          : '   Content below the old marker was generated and has been replaced.',
      );
      break;
    }
    case 'managed':
      merged = replaceBlock(readBytes(targetFile), content);
      break;
  }

  const temp = targetFile + MERGE_TEMP_SUFFIX;
  fs.writeFileSync(temp, merged, BYTES);
  fs.renameSync(temp, targetFile);
  return true;
}
