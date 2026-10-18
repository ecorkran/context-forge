/**
 * Slice-design structure check — pure, no file I/O.
 *
 * Ported from the guide's `scripts/validate-slice-design`. The template marks a
 * heading as required by putting `<!-- required -->` on the next line; a
 * document passes when it has a heading of the same level whose normalized
 * text starts with each required heading's normalized text.
 */

import { closesFence, openingFence, splitLines, type OpenFence } from './markdownLines.js';

/** A heading's level and normalized text, used for matching. */
export interface HeadingKey {
  level: number;
  text: string;
}

/** A required template heading: original line for messages, plus its match key. */
export interface RequiredHeading {
  heading: string;
  key: HeadingKey;
}

// Column 0 only, like the guide script. CommonMark also allows 1-3 spaces of
// indent, but rejecting those makes an indented required heading fail loudly
// rather than risk counting indented example text.
const HEADING_PATTERN = /^(#{1,6})\s+(.*)$/;
const REQUIRED_MARKER = '<!-- required -->';

/** Normalize a heading line into its key, or null if the line is not a heading. */
function headingKey(line: string): HeadingKey | null {
  const match = HEADING_PATTERN.exec(line);
  if (!match) return null;

  let text = match[2].replace(/<!--.*-->/g, '').replace(/\([^)]*\)/g, '');
  const brace = text.indexOf('{');
  if (brace !== -1) text = text.slice(0, brace);

  return { level: match[1].length, text: text.trim().toLowerCase() };
}

/** Every template heading whose next line, trimmed, is the required marker. */
export function requiredHeadings(templateText: string): RequiredHeading[] {
  const lines = splitLines(templateText);
  const required: RequiredHeading[] = [];

  for (let i = 0; i < lines.length - 1; i++) {
    const key = headingKey(lines[i]);
    if (key && lines[i + 1].trim() === REQUIRED_MARKER) {
      required.push({ heading: lines[i].trim(), key });
    }
  }
  return required;
}

/** Every heading in a document, skipping fenced code blocks. */
export function documentHeadingKeys(docText: string): HeadingKey[] {
  const keys: HeadingKey[] = [];
  let fence: OpenFence | null = null;

  for (const line of splitLines(docText)) {
    if (fence) {
      if (closesFence(line, fence)) fence = null;
      continue;
    }
    fence = openingFence(line);
    if (fence) continue;

    const key = headingKey(line);
    if (key) keys.push(key);
  }
  return keys;
}

/** Required headings with no same-level document heading whose text starts with theirs. */
export function missingHeadings(
  required: RequiredHeading[],
  docKeys: HeadingKey[],
): RequiredHeading[] {
  return required.filter(
    ({ key }) => !docKeys.some((doc) => doc.level === key.level && doc.text.startsWith(key.text)),
  );
}
