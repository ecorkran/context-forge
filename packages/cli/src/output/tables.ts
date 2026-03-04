import Table from 'cli-table3';

/** Render a table with headers and rows as a string. */
export function renderTable(headers: string[], rows: string[][]): string {
  const table = new Table({
    head: headers,
    style: { head: ['cyan'], border: ['dim'] },
  });

  for (const row of rows) {
    table.push(row);
  }

  return table.toString();
}
