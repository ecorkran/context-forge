/**
 * Pending-decision parser — pure, no file I/O, no config.
 *
 * A slice design records each decision with a `Status:` line. A line whose
 * value is a known pending word means the PM still owes an answer, and the
 * design must not advance to task breakdown or implementation. Any other value
 * is ignored, because `Status:` is also ordinary prose in older designs.
 */

import { closesFence, openingFence, splitLines, type OpenFence } from './markdownLines.js';

/** One undecided decision: its heading and the 1-based line of its status line. */
export interface PendingDecision {
  heading: string;
  line: number;
}

/** First-token values that mean "still pending". Changing this list is a deliberate behavior change. */
const PENDING_WORDS: ReadonlySet<string> = new Set([
  'pending-pm',
  'pending_pm',
  'pending',
  'tbd',
  'undecided',
  'open',
]);

/** Reported when a status line precedes every heading. */
const NO_HEADING = '(no heading)';

const FRONTMATTER_DELIMITER = '---';
const HEADING_PATTERN = /^#{1,6}\s+(.*)$/;
const BLOCKQUOTE_PREFIX = /^(?:\s*>)+/;
// Label only: optional bullet, optional emphasis, `status`, colon. The rest of the line is free text.
const STATUS_LABEL = /^(?:[-*+]\s+)?[*_]{0,2}status[*_]{0,2}\s*:/i;
const STATUS_TOKEN = /^[A-Za-z0-9_-]+/;
const LEADING_NOISE = /^[\s*_]+/;

/** Index of the first line after a leading frontmatter block, or 0 when there is none. */
function bodyStart(lines: string[]): number {
  if (lines[0]?.trim() !== FRONTMATTER_DELIMITER) return 0;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === FRONTMATTER_DELIMITER) return i + 1;
  }
  return 0;
}

/** The lowercased first token of a status line's value, or null when the line is not a status line. */
function statusToken(line: string): string | null {
  const text = line.replace(BLOCKQUOTE_PREFIX, '').trim();
  const label = STATUS_LABEL.exec(text);
  if (!label) return null;
  const value = text.slice(label[0].length).replace(LEADING_NOISE, '');
  return STATUS_TOKEN.exec(value)?.[0].toLowerCase() ?? '';
}

/** Every status line in the design whose value is a pending word, each named by its nearest heading. */
export function findPendingDecisions(text: string): PendingDecision[] {
  const lines = splitLines(text);
  const pending: PendingDecision[] = [];
  let heading = NO_HEADING;
  let fence: OpenFence | null = null;

  for (let i = bodyStart(lines); i < lines.length; i++) {
    const line = lines[i];
    if (fence) {
      if (closesFence(line, fence)) fence = null;
      continue;
    }
    fence = openingFence(line);
    if (fence) continue;

    const headingMatch = HEADING_PATTERN.exec(line);
    if (headingMatch) {
      heading = headingMatch[1].trim();
      continue;
    }
    const token = statusToken(line);
    if (token !== null && PENDING_WORDS.has(token)) {
      pending.push({ heading, line: i + 1 });
    }
  }
  return pending;
}
