import { readFile } from 'node:fs/promises';
import type { SlicePlanEntry, SlicePlanResult } from '../types.js';

/** Matches `N. [ ] **(NNN) Slice Name**` (from parse.py) */
const PLAN_SLICE_RE = /^\d+\.\s+\[([ xX])\]\s+\*\*\((\d+)\)\s+(.+?)\*\*/;

/** Matches headings: #, ##, ### */
const HEADING_RE = /^#{1,3}\s+/;

/** Headings that do NOT contain slice entries (from parse.py) */
const NON_SLICE_HEADINGS = ['future work', 'implementation order', 'notes', 'parent document'];

/**
 * Parse a slice plan document and extract entries with completion state.
 * Section-aware: skips entries under Future Work, Implementation Order, Notes, Parent Document.
 * Never throws — returns empty result on error.
 */
export async function parseSlicePlan(filePath: string): Promise<SlicePlanResult> {
  const empty: SlicePlanResult = { filePath, entries: [], totalSlices: 0, completedSlices: 0 };

  try {
    const content = await readFile(filePath, 'utf-8');
    const entries: SlicePlanEntry[] = [];
    let inSliceSection = true; // Assume slice sections until a non-slice heading

    for (const line of content.split('\n')) {
      const stripped = line.trim();

      if (HEADING_RE.test(stripped)) {
        const heading = stripped.replace(/^#+\s+/, '').toLowerCase();
        inSliceSection = !NON_SLICE_HEADINGS.some((ns) => heading.includes(ns));
        continue;
      }

      if (!inSliceSection) continue;

      const m = PLAN_SLICE_RE.exec(stripped);
      if (!m) continue;

      const isChecked = m[1].toLowerCase() === 'x';
      entries.push({
        index: parseInt(m[2], 10),
        name: m[3].trim(),
        status: isChecked ? 'complete' : 'not-started',
        isChecked,
      });
    }

    const completedSlices = entries.filter((e) => e.isChecked).length;
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
