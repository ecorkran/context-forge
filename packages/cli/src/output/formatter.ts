export type OutputMode = 'terminal' | 'json';

/** Print structured data as formatted JSON to stdout. */
export function printJson(data: unknown): void {
  process.stdout.write(JSON.stringify(data, null, 2) + '\n');
}

/** Print raw text to stdout (no formatting, no trailing newline unless in text). */
export function printRaw(text: string): void {
  process.stdout.write(text);
}
