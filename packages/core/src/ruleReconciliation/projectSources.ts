// Project-owned rule sources (slice 266, D6/D7). Core records which rule files
// the project owns and where a composite file's managed block sits; it never
// reads rule text for meaning.
import { MANAGED_BEGIN_MARKER, MANAGED_END_MARKER } from './markers.js';

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
