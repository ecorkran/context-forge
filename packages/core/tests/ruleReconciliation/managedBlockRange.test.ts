import { describe, it, expect } from 'vitest';
import {
  MANAGED_BEGIN_MARKER as BEGIN,
  MANAGED_END_MARKER as END,
  managedBlockRange,
} from '../../src/ruleReconciliation/index.js';

describe('managedBlockRange', () => {
  it('returns none when there are no markers', () => {
    expect(managedBlockRange(['# Mine', 'text'])).toBe('none');
    expect(managedBlockRange([])).toBe('none');
  });

  it('returns the 1-based inclusive range of one valid pair', () => {
    expect(managedBlockRange(['# Mine', BEGIN, 'rule', 'rule', END, 'after'])).toEqual({ beginLine: 2, endLine: 5 });
  });

  it('accepts an empty block', () => {
    expect(managedBlockRange([BEGIN, END])).toEqual({ beginLine: 1, endLine: 2 });
  });

  it.each([
    ['two BEGIN', [BEGIN, 'a', BEGIN, END]],
    ['two END', [BEGIN, END, 'a', END]],
    ['END before BEGIN', [END, 'a', BEGIN]],
    ['BEGIN only', ['a', BEGIN, 'b']],
    ['END only', ['a', END, 'b']],
  ])('returns broken for %s', (_label, lines) => {
    expect(managedBlockRange(lines)).toBe('broken');
  });

  it('matches whole lines only', () => {
    expect(managedBlockRange([`  ${BEGIN}`, `${END} trailing`])).toBe('none');
    expect(managedBlockRange([`note: ${BEGIN}`, END])).toBe('broken');
  });
});
