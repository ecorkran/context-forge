import { describe, it, expect } from 'vitest';
import { COMPOSITE_RULE_FILES } from '@context-forge/core/node';
import { TARGETS } from '../../src/commands/ideTargets.js';

// core cannot import the cli's target table, so this pins the two lists together.
describe('COMPOSITE_RULE_FILES', () => {
  it('is exactly the set of files the targets write a managed block into', () => {
    const fromTargets = new Set(Object.values(TARGETS).flatMap((t) => t.markerFiles));
    expect([...COMPOSITE_RULE_FILES].sort()).toEqual([...fromTargets].sort());
  });
});
