import { describe, it, expect } from 'vitest';
import { STATUS, type NormalizedStatus } from '../../src/introspection/types.js';

describe('STATUS', () => {
  it('exposes the four normalized status values', () => {
    expect(STATUS.Complete).toBe('complete');
    expect(STATUS.InProgress).toBe('in-progress');
    expect(STATUS.NotStarted).toBe('not-started');
    expect(STATUS.Deprecated).toBe('deprecated');
  });

  it('derives a NormalizedStatus union admitting exactly the four STATUS values', () => {
    const values: NormalizedStatus[] = [
      STATUS.Complete,
      STATUS.InProgress,
      STATUS.NotStarted,
      STATUS.Deprecated,
    ];
    expect(values).toEqual(['complete', 'in-progress', 'not-started', 'deprecated']);
  });
});
