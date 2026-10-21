import { describe, it, expect } from 'vitest';
import { BROWNFIELD_MIN_SOURCE_LINES, decideOutcome } from '../../src/adoption/adoptionOutcome.js';

const source = (lines: number) => ({ files: 1, lines, capped: lines >= BROWNFIELD_MIN_SOURCE_LINES });

describe('decideOutcome', () => {
  it('in_progress wins over artifacts and zero lines', () => {
    expect(decideOutcome({ state: 'in_progress', artifacts: ['/x/260-arch.md'], source: source(0) })).toEqual({
      kind: 'adoption-in-progress',
    });
  });

  it.each(['complete', 'declined'] as const)('%s is adoption-closed even with 5000 lines', (state) => {
    expect(decideOutcome({ state, artifacts: [], source: source(5000) })).toEqual({
      kind: 'adoption-closed',
      state,
    });
  });

  it('artifacts win over 5000 lines', () => {
    const artifacts = ['/x/260-arch.a.md'];
    expect(decideOutcome({ state: '', artifacts, source: source(5000) })).toEqual({
      kind: 'already-planned',
      artifacts,
    });
  });

  it('exactly the threshold is brownfield', () => {
    expect(decideOutcome({ state: '', artifacts: [], source: source(2000) }).kind).toBe('brownfield');
  });

  it('one line under the threshold is greenfield', () => {
    expect(decideOutcome({ state: '', artifacts: [], source: source(1999) }).kind).toBe('greenfield');
  });

  it('carries the source volume on brownfield and greenfield', () => {
    const s = source(2500);
    expect(decideOutcome({ state: '', artifacts: [], source: s })).toEqual({ kind: 'brownfield', source: s });
  });

  it('throws naming `artifacts` when state is unset and artifacts are missing', () => {
    expect(() => decideOutcome({ state: '' })).toThrow(/artifacts/);
  });

  it('throws naming `source` when nothing is planned and source is missing', () => {
    expect(() => decideOutcome({ state: '', artifacts: [] })).toThrow(/source/);
  });
});
