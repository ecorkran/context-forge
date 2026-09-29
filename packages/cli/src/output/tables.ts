import chalk from 'chalk';

/** Columns are never shrunk below this width (or their natural width, if smaller). */
const MIN_TRUNCATED_COLUMN_WIDTH = 8;
const ELLIPSIS = '…';
// eslint-disable-next-line no-control-regex
const ANSI_PATTERN = /(\x1B\[[0-9;]*m)/;

/**
 * Width of the attached terminal, or Infinity when output is not a TTY
 * (pipes, redirects) — in which case tables are never truncated.
 */
function terminalWidth(): number {
  return process.stdout.isTTY && process.stdout.columns ? process.stdout.columns : Infinity;
}

/**
 * Render a borderless table with bold/cyan headers and an underline separator.
 * Matches orchestration CLI style: no cell borders, column-aligned with padding.
 *
 * When the table is wider than `maxWidth` (defaults to the terminal width on
 * a TTY, unlimited otherwise), the widest columns are shrunk with a trailing "…".
 * A column with an empty header holds a marker (e.g. "← active") and is
 * rendered without an underline; keep such markers in their own column so
 * truncating a neighbouring column never cuts them off.
 */
export function renderTable(
  headers: string[],
  rows: string[][],
  rowPrefixes?: string[],
  maxWidth: number = terminalWidth(),
): string {
  // Calculate column widths from headers and data
  const colWidths = headers.map((h, i) => {
    const dataMax = rows.reduce((max, row) => Math.max(max, stripAnsi(row[i] ?? '').length), 0);
    return Math.max(stripAnsi(h).length, dataMax);
  });

  const pad = 2; // spacing between columns
  const indent = '  ';
  const lines: string[] = [];

  const prefixWidth = Math.max(indent.length, ...(rowPrefixes ?? []).map((p) => stripAnsi(p).length));
  fitColumnWidths(colWidths, maxWidth - prefixWidth - pad * (headers.length - 1));

  // Header row — bold cyan
  const headerLine = headers
    .map((h, i) => chalk.bold.cyan(h.padEnd(colWidths[i])))
    .join(' '.repeat(pad));
  lines.push(indent + headerLine.trimEnd());

  // Underline — thin dash under each named column
  const underline = colWidths
    .map((w, i) => (headers[i] ? '─' : ' ').repeat(w))
    .join(' '.repeat(pad));
  lines.push(indent + chalk.dim(underline.trimEnd()));

  // Data rows
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    const prefix = rowPrefixes ? rowPrefixes[r] : indent;
    const rowLine = row
      .map((cell, i) => {
        const fitted = truncateCell(cell ?? '', colWidths[i]);
        const padding = colWidths[i] - stripAnsi(fitted).length;
        return fitted + ' '.repeat(Math.max(0, padding));
      })
      .join(' '.repeat(pad));
    lines.push(prefix + rowLine.trimEnd());
  }

  return lines.join('\n');
}

/**
 * Shrink the widest column one character at a time until the columns fit in
 * `available` characters. Stops if every column is at its minimum — a table
 * that still doesn't fit is left to wrap.
 */
function fitColumnWidths(colWidths: number[], available: number): void {
  const total = () => colWidths.reduce((sum, w) => sum + w, 0);
  while (total() > available) {
    let widest = -1;
    for (let i = 0; i < colWidths.length; i++) {
      if (colWidths[i] <= MIN_TRUNCATED_COLUMN_WIDTH) continue;
      if (widest === -1 || colWidths[i] > colWidths[widest]) widest = i;
    }
    if (widest === -1) return;
    colWidths[widest]--;
  }
}

/** Cut a cell to `width` visible characters plus "…", preserving ANSI codes. */
function truncateCell(cell: string, width: number): string {
  if (stripAnsi(cell).length <= width) return cell;
  let remaining = width - ELLIPSIS.length;
  let cut = false;
  return cell
    .split(ANSI_PATTERN)
    .map((token) => {
      if (ANSI_PATTERN.test(token)) return token; // keep codes so styles still close
      const kept = token.slice(0, Math.max(0, remaining));
      remaining -= kept.length;
      if (kept.length === token.length || cut) return kept;
      cut = true;
      return kept + ELLIPSIS;
    })
    .join('');
}

/** Strip ANSI escape codes to get visible character length. */
function stripAnsi(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1B\[[0-9;]*m/g, '');
}
