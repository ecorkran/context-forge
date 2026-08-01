import { readFile } from 'node:fs/promises';
import { STATUS } from '../types.js';
import type { NormalizedStatus, SlicePlanEntry, SlicePlanResult } from '../types.js';

/** Checkbox character marking a plan-line entry as deprecated/descoped (GitHub #61). */
const DEPRECATED_MARKER = '~';

/** Matches `N. [ ] **(NNN) Slice Name** — description` — indexed format */
const PLAN_INDEXED_RE = new RegExp(`^(\\d+)\\.\\s+\\[([ xX${DEPRECATED_MARKER}])\\]\\s+\\*\\*\\((\\d+)\\)\\s+(.+?)\\*\\*\\s*(.*)`);

/** Matches `N. [ ] **Slice Name** — description` — unindexed format (no parenthesized index) */
const PLAN_UNINDEXED_RE = new RegExp(`^(\\d+)\\.\\s+\\[([ xX${DEPRECATED_MARKER}])\\]\\s+\\*\\*([^(].*?)\\*\\*\\s*(.*)`);

/** Maps a plan-line checkbox character to its resulting entry status/isChecked pair. */
function parseCheckboxStatus(checkboxChar: string): { status: NormalizedStatus; isChecked: boolean } {
  if (checkboxChar === DEPRECATED_MARKER) {
    return { status: STATUS.Deprecated, isChecked: false };
  }
  const isChecked = checkboxChar.toLowerCase() === 'x';
  return { status: isChecked ? STATUS.Complete : STATUS.NotStarted, isChecked };
}

/** Matches headings: #, ##, ### */
const HEADING_RE = /^#{1,3}\s+/;

/** Headings that do NOT contain slice entries */
const NON_SLICE_HEADINGS = ['future work', 'implementation order', 'notes', 'parent document'];

/** Strip leading ` — ` or ` - ` separator from description text. */
function parseDescription(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const trimmed = raw.replace(/^[\s—–-]+/, '').trim();
  return trimmed || undefined;
}

/**
 * Parse a slice plan document and extract entries with completion state.
 * Supports two entry formats:
 *   - Indexed:   `1. [ ] **(101) Slice Name**` — uses parenthesized index
 *   - Unindexed: `1. [ ] **Slice Name**` — uses sequential list number as index
 * Section-aware: skips entries under Future Work, Implementation Order, Notes, Parent Document.
 * Never throws — returns empty result on error.
 */
export async function parseSlicePlan(filePath: string): Promise<SlicePlanResult> {
  const empty: SlicePlanResult = { filePath, entries: [], totalSlices: 0, completedSlices: 0 };

  try {
    const content = await readFile(filePath, 'utf-8');
    const entries: SlicePlanEntry[] = [];
    let inSliceSection = true;
    let unindexedCounter = 0;

    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const stripped = lines[i].trim();

      if (HEADING_RE.test(stripped)) {
        const heading = stripped.replace(/^#+\s+/, '').toLowerCase();
        inSliceSection = !NON_SLICE_HEADINGS.some((ns) => heading.startsWith(ns));
        continue;
      }

      if (!inSliceSection) continue;

      // Try indexed format first (preferred)
      const indexed = PLAN_INDEXED_RE.exec(stripped);
      if (indexed) {
        const { status, isChecked } = parseCheckboxStatus(indexed[2]);
        const description = parseDescription(indexed[5]);
        entries.push({
          index: parseInt(indexed[3], 10),
          name: indexed[4].trim(),
          status,
          isChecked,
          lineIndex: i,
          indexSource: 'explicit',
          ...(description && { description }),
        });
        continue;
      }

      // Fall back to unindexed format — use sequential counter as index
      const unindexed = PLAN_UNINDEXED_RE.exec(stripped);
      if (unindexed) {
        unindexedCounter++;
        const { status, isChecked } = parseCheckboxStatus(unindexed[2]);
        const description = parseDescription(unindexed[4]);
        entries.push({
          index: unindexedCounter,
          name: unindexed[3].trim(),
          status,
          isChecked,
          lineIndex: i,
          indexSource: 'fallback',
          ...(description && { description }),
        });
      }
    }

    // Sort by index ascending. Slice plans usually appear in order, but entries
    // can be added out of order during planning — every consumer expects the
    // canonical order (display, "next slice" recommendation, consistency checks).
    entries.sort((a, b) => a.index - b.index);

    const completedSlices = entries.filter(
      (e) => e.isChecked || e.status === STATUS.Deprecated
    ).length;
    return {
      filePath,
      entries,
      totalSlices: entries.length,
      completedSlices,
    };
  } catch {
    return empty;
  }
}
