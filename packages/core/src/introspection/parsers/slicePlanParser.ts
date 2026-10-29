import { readFile } from 'node:fs/promises';
import { STATUS } from '../types.js';
import { isFsError } from '../../detection/pathPresent.js';
import { normalizeStatus } from './statusNormalizer.js';
import type { NormalizedStatus, SlicePlanEntry, SlicePlanResult } from '../types.js';

/** Checkbox character marking a plan-line entry as deprecated/descoped (GitHub #61). */
const DEPRECATED_MARKER = '~';

/**
 * Matches `N. [ ] **(NNN) Slice Name** — description` — indexed format.
 * Bold prefixes before the index, e.g. `**DEPRECATED (20261011)** **(121) Name**`,
 * are skipped so the `(NNN)` is still found (GitHub #117).
 */
const PLAN_INDEXED_RE = new RegExp(`^(\\d+)\\.\\s+\\[([ xX${DEPRECATED_MARKER}])\\]\\s+(?:\\*\\*[^*]+\\*\\*\\s+)*\\*\\*\\((\\d+)\\)\\s+(.+?)\\*\\*\\s*(.*)`);

/** Matches `N. [ ] **Slice Name** — description` — unindexed format (no parenthesized index) */
const PLAN_UNINDEXED_RE = new RegExp(`^(\\d+)\\.\\s+\\[([ xX${DEPRECATED_MARKER}])\\]\\s+\\*\\*([^(].*?)\\*\\*\\s*(.*)`);

/**
 * D1: the retroactive marker, a backticked `retroactive` at the start of the text after
 * the entry title's closing `**`. Lenient on letter case and whitespace; the backticks
 * are required, so a description that merely starts with the word does not match.
 */
const RETROACTIVE_MARKER_RE = /^\s*`\s*retroactive\s*`\s*/i;

/** `Status: <value>` declared in the text after an entry title (#140); the value is one word. */
const LINE_STATUS_RE = /\bStatus:\s*([A-Za-z_-]+)/i;

/**
 * An unchecked entry may declare `Status: deprecated` or `Status: deferred` in its text; the
 * checkbox cannot express either. Only these two override — progress states stay derived.
 */
function applyLineStatus(base: { status: NormalizedStatus; isChecked: boolean }, text: string) {
  if (base.status !== STATUS.NotStarted) return base;
  const declared = normalizeStatus(LINE_STATUS_RE.exec(text)?.[1]);
  const isDeclaration = declared === STATUS.Deprecated || declared === STATUS.Deferred;
  return isDeclaration ? { ...base, status: declared } : base;
}

/** Maps a plan-line checkbox character to its resulting entry status/isChecked pair. */
function parseCheckboxStatus(checkboxChar: string): { status: NormalizedStatus; isChecked: boolean } {
  if (checkboxChar === DEPRECATED_MARKER) {
    return { status: STATUS.Deprecated, isChecked: false };
  }
  const isChecked = checkboxChar.toLowerCase() === 'x';
  return { status: isChecked ? STATUS.Complete : STATUS.NotStarted, isChecked };
}

/** Read errors that mean "no plan here" rather than a failure. */
const SKIPPABLE_READ_ERRORS: ReadonlySet<string> = new Set(['ENOENT', 'EISDIR']);

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
 * A missing file or a directory yields an empty result; other read errors throw.
 */
export async function parseSlicePlan(filePath: string): Promise<SlicePlanResult> {
  const empty: SlicePlanResult = { filePath, entries: [], totalSlices: 0, completedSlices: 0 };

  let content: string;
  try {
    content = await readFile(filePath, 'utf-8');
  } catch (error) {
    // A missing plan, or a path that is a directory, is a plan with no entries (slice 264 D7:
    // an unreadable plan is skipped by findExistingStatePlan). Other errors, such as
    // EACCES, are real failures and surface.
    if (isFsError(error) && SKIPPABLE_READ_ERRORS.has(error.code)) return empty;
    throw error;
  }

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
      const { status, isChecked } = applyLineStatus(parseCheckboxStatus(indexed[2]), indexed[5]);
      const retroactive = RETROACTIVE_MARKER_RE.test(indexed[5]);
      const description = parseDescription(indexed[5].replace(RETROACTIVE_MARKER_RE, ''));
      entries.push({
        index: parseInt(indexed[3], 10),
        name: indexed[4].trim(),
        status,
        isChecked,
        lineIndex: i,
        indexSource: 'explicit',
        retroactive,
        ...(description && { description }),
      });
      continue;
    }

    // Fall back to unindexed format — use sequential counter as index
    const unindexed = PLAN_UNINDEXED_RE.exec(stripped);
    if (unindexed) {
      unindexedCounter++;
      const { status, isChecked } = applyLineStatus(parseCheckboxStatus(unindexed[2]), unindexed[4]);
      const description = parseDescription(unindexed[4]);
      entries.push({
        index: unindexedCounter,
        name: unindexed[3].trim(),
        status,
        isChecked,
        lineIndex: i,
        indexSource: 'fallback',
        retroactive: false,
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
}
