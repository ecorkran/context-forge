import { describe, it, expect } from 'vitest';
import {
  BROWNFIELD_MIN_SOURCE_LINES,
  decideOutcome,
  decideStage,
  type AdoptionStage,
} from '../../src/adoption/adoptionOutcome.js';
import type { PlanningFacts } from '../../src/adoption/planningFacts.js';

const DERIVED_ARCH = '/x/100-arch.existing.md';
const OTHER_ARCH = '/x/200-arch.other.md';
const EXISTING_STATE_PLAN = '/x/100-slices.existing.md';
const MANY_LINES = 5000;

const source = (lines: number) => ({ files: 1, lines, capped: lines >= BROWNFIELD_MIN_SOURCE_LINES });

const facts = (overrides: Partial<PlanningFacts> = {}): PlanningFacts => ({
  artifacts: [],
  derivedArchitectures: [],
  existingStatePlan: null,
  ...overrides,
});

const DERIVED_ONLY = facts({ artifacts: [DERIVED_ARCH], derivedArchitectures: [DERIVED_ARCH] });
const ADOPTED = facts({
  artifacts: [DERIVED_ARCH, EXISTING_STATE_PLAN],
  derivedArchitectures: [DERIVED_ARCH],
  existingStatePlan: EXISTING_STATE_PLAN,
});

describe('decideStage', () => {
  it('opted out wins over a derived architecture', () => {
    expect(decideStage({ optedOut: true, facts: DERIVED_ONLY })).toEqual({ kind: 'opted-out' });
  });

  it('a derived architecture with no existing-state plan is adoption-incomplete', () => {
    expect(decideStage({ optedOut: false, facts: DERIVED_ONLY })).toEqual({
      kind: 'adoption-incomplete',
      derivedArchitectures: [DERIVED_ARCH],
    });
  });

  it('a derived architecture plus an existing-state plan is already-planned', () => {
    expect(decideStage({ optedOut: false, facts: ADOPTED })).toEqual({
      kind: 'already-planned',
      artifacts: ADOPTED.artifacts,
      existingStatePlan: EXISTING_STATE_PLAN,
    });
  });

  it('a non-derived architecture is already-planned', () => {
    expect(decideStage({ optedOut: false, facts: facts({ artifacts: [OTHER_ARCH] }) })).toEqual({
      kind: 'already-planned',
      artifacts: [OTHER_ARCH],
      existingStatePlan: null,
    });
  });

  it('no planning artifacts is unplanned', () => {
    expect(decideStage({ optedOut: false, facts: facts() })).toEqual({ kind: 'unplanned' });
  });
});

describe('decideOutcome', () => {
  const unplanned: AdoptionStage = { kind: 'unplanned' };

  it.each<AdoptionStage>([
    { kind: 'opted-out' },
    { kind: 'adoption-incomplete', derivedArchitectures: [DERIVED_ARCH] },
    { kind: 'already-planned', artifacts: [OTHER_ARCH], existingStatePlan: null },
  ])('passes the $kind stage through and ignores source', (stage) => {
    expect(decideOutcome({ stage, source: source(MANY_LINES) })).toEqual(stage);
    expect(decideOutcome({ stage })).toEqual(stage);
  });

  it('exactly the threshold is brownfield', () => {
    expect(decideOutcome({ stage: unplanned, source: source(BROWNFIELD_MIN_SOURCE_LINES) }).kind).toBe('brownfield');
  });

  it('one line under the threshold is greenfield', () => {
    expect(decideOutcome({ stage: unplanned, source: source(BROWNFIELD_MIN_SOURCE_LINES - 1) }).kind).toBe(
      'greenfield',
    );
  });

  it('carries the source volume on brownfield', () => {
    const s = source(MANY_LINES);
    expect(decideOutcome({ stage: unplanned, source: s })).toEqual({ kind: 'brownfield', source: s });
  });

  it('throws naming `source` when the stage is unplanned and source is missing', () => {
    expect(() => decideOutcome({ stage: unplanned })).toThrow(/source/);
  });
});
