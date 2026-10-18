/**
 * CommonMark fence and line helpers shared by the heading validator and the
 * pending-decision parser.
 */

// CommonMark fences: up to 3 spaces of indent, 3+ backticks or tildes.
const FENCE_PATTERN = /^ {0,3}(`{3,}|~{3,})(.*)$/;

/** An open fence's marker character and length; it closes on the same char, at least as long. */
export interface OpenFence {
  char: string;
  length: number;
}

/** The fence a line opens, or null. A backtick fence's info string may not contain backticks. */
export function openingFence(line: string): OpenFence | null {
  const match = FENCE_PATTERN.exec(line);
  if (!match) return null;
  const [, marker, info] = match;
  if (marker[0] === '`' && info.includes('`')) return null;
  return { char: marker[0], length: marker.length };
}

/** Whether a line closes the open fence: same char, at least as long, nothing after. */
export function closesFence(line: string, open: OpenFence): boolean {
  const match = FENCE_PATTERN.exec(line);
  if (!match) return false;
  const [, marker, rest] = match;
  return marker[0] === open.char && marker.length >= open.length && rest.trim() === '';
}

/** Split text into lines with any trailing `\r` removed, so CRLF input matches. */
export function splitLines(text: string): string[] {
  return text.split('\n').map((line) => line.replace(/\r$/, ''));
}
