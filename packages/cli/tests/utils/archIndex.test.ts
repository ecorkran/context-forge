import { describe, it, expect } from 'vitest';
import { parseArchIndex } from '../../src/utils/archIndex.js';
import { UserError } from '../../src/utils/errors.js';

describe('parseArchIndex', () => {
  it('parses a valid non-negative integer string', () => {
    expect(parseArchIndex('140')).toBe(140);
    expect(parseArchIndex('0')).toBe(0);
  });

  it('throws UserError for non-numeric input', () => {
    expect(() => parseArchIndex('abc')).toThrow(UserError);
    expect(() => parseArchIndex('abc')).toThrow(/Invalid archIndex/);
  });

  it('throws UserError for a negative number', () => {
    expect(() => parseArchIndex('-1')).toThrow(UserError);
  });

  it('throws UserError for a non-integer number', () => {
    expect(() => parseArchIndex('1.5')).toThrow(UserError);
  });

});
