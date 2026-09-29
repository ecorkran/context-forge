import { describe, it, expect } from 'vitest';
import chalk from 'chalk';
import { renderTable } from '../../src/output/tables.js';

// eslint-disable-next-line no-control-regex
const plain = (s: string): string => s.replace(/\x1B\[[0-9;]*m/g, '');
const visibleLines = (out: string): string[] => plain(out).split('\n');

const LONG_NAME = 'Pipeline SDK Session Control — Seeding Without a Turn, Dispatch That Waits';
const LONG_FILE = '932-slice.pipeline-sdk-session-control-seeding-without-a-turn-dispatch.md';
const HEADERS = ['#', 'Slice', 'File', ''];

describe('renderTable width fitting', () => {
  it('leaves output untouched when maxWidth is unlimited (non-TTY)', () => {
    const out = renderTable(HEADERS, [['932', LONG_NAME, LONG_FILE, '← active']], undefined, Infinity);
    expect(plain(out)).toContain(LONG_NAME);
    expect(plain(out)).toContain(LONG_FILE);
  });

  it('leaves output untouched when the table already fits', () => {
    const rows = [['1', 'short', 'a.md', '']];
    expect(renderTable(HEADERS, rows, undefined, 200)).toBe(renderTable(HEADERS, rows, undefined, Infinity));
  });

  it('shrinks the widest columns so every line fits', () => {
    const rows = [['932', LONG_NAME, LONG_FILE, '← active']];
    const lines = visibleLines(renderTable(HEADERS, rows, undefined, 80));
    for (const line of lines) expect(line.length).toBeLessThanOrEqual(80);
    expect(lines[2]).toContain('…');
  });

  it('keeps the marker column intact when neighbours are truncated', () => {
    const rows = [['932', LONG_NAME, LONG_FILE, '← active']];
    const lines = visibleLines(renderTable(HEADERS, rows, undefined, 70));
    expect(lines[2].endsWith('← active')).toBe(true);
  });

  it('truncates ANSI-styled cells without breaking the escape codes', () => {
    const rows = [['1', chalk.green(LONG_NAME), LONG_FILE, '']];
    const out = renderTable(HEADERS, rows, undefined, 60);
    const dataLine = out.split('\n')[2];
    expect(plain(dataLine)).toContain('…');
    // no dangling partial escape sequence
    expect(dataLine).not.toMatch(/\x1B(?!\[[0-9;]*m)/);
    for (const line of visibleLines(out)) expect(line.length).toBeLessThanOrEqual(60);
  });

  it('does not shrink columns below the minimum, even if the table still overflows', () => {
    const rows = [['1', LONG_NAME, LONG_FILE, '']];
    expect(() => renderTable(HEADERS, rows, undefined, 10)).not.toThrow();
  });

  it('accounts for row prefixes in the available width', () => {
    const rows = [['1', LONG_NAME, LONG_FILE, '']];
    const prefixes = ['>>>>>> '];
    const lines = visibleLines(renderTable(HEADERS, rows, prefixes, 80));
    expect(lines[2].length).toBeLessThanOrEqual(80);
  });

  it('draws no underline under an empty-header marker column', () => {
    const lines = visibleLines(renderTable(HEADERS, [['1', 'a', 'b', '← next']], undefined, Infinity));
    expect(lines[1]).not.toMatch(/─\s+─\s+─\s+─/);
    expect(lines[1]).toMatch(/─+$/);
  });
});
