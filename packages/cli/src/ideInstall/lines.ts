/**
 * Line handling with the semantics the bash script got from awk, `read` and
 * command substitution. Every text transform in ideInstall/ goes through these,
 * so the edge cases (no final newline, CR, trailing blank lines) live in one place.
 */

/**
 * awk records: split on `\n`. A final line without a newline is still a record;
 * an empty text has none. `\r` stays part of its line, so `---\r` is not `---`.
 */
export function toRecords(text: string): string[] {
  if (text === '') return [];
  const records = text.split('\n');
  if (text.endsWith('\n')) records.pop();
  return records;
}

/** awk `print` of each record: every line gets a `\n`, including the last. */
export function fromRecords(records: readonly string[]): string {
  return records.map((record) => record + '\n').join('');
}

/**
 * Lines a `while IFS= read -r` loop sees: like records, except a final line
 * without a newline is dropped.
 */
export function toReadLines(text: string): string[] {
  const records = toRecords(text);
  if (text !== '' && !text.endsWith('\n')) records.pop();
  return records;
}

/** What `$(...)` keeps: the output with every trailing newline removed. */
export function stripTrailingNewlines(text: string): string {
  return text.replace(/\n+$/, '');
}

/** A line-based `grep -F needle` over text: true when some line contains it. */
export function anyLineContains(text: string, needle: string): boolean {
  return toRecords(text).some((line) => line.includes(needle));
}

/** A line-based `grep -E` over text: true when some line matches. */
export function anyLineMatches(text: string, pattern: RegExp): boolean {
  return toRecords(text).some((line) => pattern.test(line));
}

/** Plain code-unit order: the `LC_ALL=C` byte order bash sorted with. Never localeCompare. */
export function byteOrder(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
