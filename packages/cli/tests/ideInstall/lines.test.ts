import { describe, expect, it } from 'vitest';
import {
  anyLineContains,
  anyLineMatches,
  byteOrder,
  fromRecords,
  stripTrailingNewlines,
  toReadLines,
  toRecords,
} from '../../src/ideInstall/lines.js';

describe('toRecords / fromRecords', () => {
  it('has no records for an empty file', () => {
    expect(toRecords('')).toEqual([]);
    expect(fromRecords([])).toBe('');
  });

  it('keeps a final line without a newline, and writes it back with one', () => {
    expect(toRecords('a\nb')).toEqual(['a', 'b']);
    expect(fromRecords(toRecords('a\nb'))).toBe('a\nb\n');
  });

  it('round-trips a file that ends with a newline', () => {
    expect(fromRecords(toRecords('a\nb\n'))).toBe('a\nb\n');
  });

  it('leaves CR in place, so CRLF lines keep it', () => {
    expect(toRecords('---\r\nx\r\n')).toEqual(['---\r', 'x\r']);
    expect(fromRecords(toRecords('a\r\nb'))).toBe('a\r\nb\n');
  });

  it('keeps blank lines, including several trailing ones', () => {
    expect(toRecords('a\n\n\n')).toEqual(['a', '', '']);
    expect(toRecords('\n')).toEqual(['']);
  });
});

describe('toReadLines', () => {
  it('drops a final line without a newline, as `while read` does', () => {
    expect(toReadLines('a\nb')).toEqual(['a']);
    expect(toReadLines('a\nb\n')).toEqual(['a', 'b']);
    expect(toReadLines('only')).toEqual([]);
    expect(toReadLines('')).toEqual([]);
  });
});

describe('stripTrailingNewlines', () => {
  it('removes every trailing newline and nothing else', () => {
    expect(stripTrailingNewlines('a\n\n\n')).toBe('a');
    expect(stripTrailingNewlines('a\n b \n')).toBe('a\n b ');
    expect(stripTrailingNewlines('a\r\n')).toBe('a\r');
    expect(stripTrailingNewlines('\n\n')).toBe('');
  });
});

describe('line greps', () => {
  it('match per line, never across a newline', () => {
    expect(anyLineContains('ab\ncd', 'bc')).toBe(false);
    expect(anyLineContains('ab\ncd', 'cd')).toBe(true);
    expect(anyLineMatches('x\n--- y', /^---/)).toBe(true);
    expect(anyLineMatches('', /.*/)).toBe(false);
  });
});

describe('byteOrder', () => {
  it('sorts uppercase before lowercase and - before letters, as LC_ALL=C does', () => {
    expect(['b', 'B', 'a-b', 'a'].sort(byteOrder)).toEqual(['B', 'a', 'a-b', 'b']);
  });
});
