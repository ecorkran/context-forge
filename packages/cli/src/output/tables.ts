import chalk from 'chalk';

/**
 * Render a borderless table with bold/cyan headers and an underline separator.
 * Matches orchestration CLI style: no cell borders, column-aligned with padding.
 */
export function renderTable(headers: string[], rows: string[][]): string {
  // Calculate column widths from headers and data
  const colWidths = headers.map((h, i) => {
    const dataMax = rows.reduce((max, row) => Math.max(max, stripAnsi(row[i] ?? '').length), 0);
    return Math.max(stripAnsi(h).length, dataMax);
  });

  const pad = 2; // spacing between columns
  const lines: string[] = [];

  // Header row — bold cyan
  const headerLine = headers
    .map((h, i) => chalk.bold.cyan(h.padEnd(colWidths[i])))
    .join(' '.repeat(pad));
  lines.push('  ' + headerLine);

  // Underline — thin dash under each column
  const underline = colWidths
    .map((w) => '─'.repeat(w))
    .join(' '.repeat(pad));
  lines.push('  ' + chalk.dim(underline));

  // Data rows
  for (const row of rows) {
    const rowLine = row
      .map((cell, i) => {
        const visible = stripAnsi(cell ?? '');
        const padding = colWidths[i] - visible.length;
        return (cell ?? '') + ' '.repeat(Math.max(0, padding));
      })
      .join(' '.repeat(pad));
    lines.push('  ' + rowLine);
  }

  return lines.join('\n');
}

/** Strip ANSI escape codes to get visible character length. */
function stripAnsi(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1B\[[0-9;]*m/g, '');
}
