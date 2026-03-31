import { readFile } from 'node:fs/promises';
import type { FutureWorkItem, FutureWorkResult } from '../types.js';

/** Numbered checkbox items: `N. [ ] text` (from parse.py _FW_ITEM_RE) */
const FW_ITEM_RE = /^\d+\.\s+\[([ xX])\]\s+(.+)$/;

/** Explicit index in text: `(NNN) ...` (from parse.py _FW_INDEX_RE) */
const FW_INDEX_RE = /^\((\d+)\)\s*/;

/** Heading pattern: #, ##, ### */
const HEADING_RE = /^#{1,3}\s+/;

/** Future Work heading pattern */
const FUTURE_WORK_HEADING_RE = /^#{1,3}\s+Future Work/i;

/**
 * Extract short title and description from a future work item.
 * Title is the text before em-dash or colon; description is the rest.
 * Ported from parse.py _fw_title().
 */
function extractTitleAndDescription(text: string): { title: string; description?: string } {
  for (const sep of [' — ', ': ']) {
    const pos = text.indexOf(sep);
    if (pos > 0) {
      const desc = text.slice(pos + sep.length).trim();
      return { title: text.slice(0, pos).trim(), ...(desc && { description: desc }) };
    }
  }
  return { title: text };
}

/**
 * Parse the Future Work section from a slice plan document.
 * Items with explicit `(NNN)` index use that index; unnumbered items get sequential indices.
 * Never throws — returns empty result on error.
 */
export async function parseFutureWork(
  filePath: string,
  nextIndex: number = 0,
): Promise<FutureWorkResult> {
  const empty: FutureWorkResult = { filePath, items: [] };

  try {
    const content = await readFile(filePath, 'utf-8');
    const items: FutureWorkItem[] = [];
    let inSection = false;
    let autoIdx = nextIndex;

    for (const line of content.split('\n')) {
      const stripped = line.trim();

      if (FUTURE_WORK_HEADING_RE.test(stripped)) {
        inSection = true;
        continue;
      }

      // Next heading ends the section
      if (inSection && HEADING_RE.test(stripped)) {
        break;
      }

      if (!inSection) continue;

      const m = FW_ITEM_RE.exec(stripped);
      if (!m) continue;

      const done = m[1].toLowerCase() === 'x';
      let text = m[2].trim();

      // Strip leading " — " that sometimes follows an index
      text = text.replace(/^—\s*/, '');

      // Check for explicit index like "(780) Config System..."
      const idxMatch = FW_INDEX_RE.exec(text);
      let index: string;
      if (idxMatch) {
        index = idxMatch[1];
        text = text.slice(idxMatch[0].length).replace(/^[\s—-]+/, '');
      } else {
        index = autoIdx > 0 ? String(autoIdx) : '?';
        if (autoIdx > 0) autoIdx++;
      }

      const { title: name, description } = extractTitleAndDescription(text);
      items.push({ index, name, done, ...(description && { description }) });
    }

    return { filePath, items };
  } catch {
    return empty;
  }
}
