import { describe, it, expect } from 'vitest';
import {
  NO_EXISTING_STATE_PLAN_WARNING,
  UNSET_STATE_WARNING,
  decideAdoptionNav,
  outsideConceptPhaseWarning,
  type AdoptionNavInputs,
} from '../../src/introspection/adoptionNavigation.js';

function inputs(overrides: Partial<AdoptionNavInputs> = {}): AdoptionNavInputs {
  return {
    state: '',
    conceptInstruction: false,
    instruction: '',
    conceptExists: false,
    planningArtifactsExist: false,
    architecturePaths: [],
    existingStatePlanPath: null,
    registeredPlanPath: null,
    registeredPlanHasOpenEntry: false,
    ...overrides,
  };
}

const PLAN = '/p/project-documents/user/architecture/100-slices.existing.md';
const ARCH = '/p/project-documents/user/architecture/100-arch.existing.md';

describe('decideAdoptionNav: declined', () => {
  it('is not-adopting whatever else is set', () => {
    const everything = inputs({
      state: 'declined',
      conceptInstruction: true,
      conceptExists: true,
      architecturePaths: [ARCH],
      existingStatePlanPath: PLAN,
    });
    expect(decideAdoptionNav(everything)).toEqual({ kind: 'not-adopting' });
  });
});

describe("decideAdoptionNav: unset ('')", () => {
  const phase0WithConcept = { conceptInstruction: true, conceptExists: true };

  it('warns at Phase 0 with a concept and no planning artifact (D2)', () => {
    expect(decideAdoptionNav(inputs(phase0WithConcept))).toEqual({ kind: 'warn', warning: UNSET_STATE_WARNING });
  });

  it('does not warn when a planning artifact exists', () => {
    expect(decideAdoptionNav(inputs({ ...phase0WithConcept, planningArtifactsExist: true }))).toEqual({
      kind: 'not-adopting',
    });
  });

  it('does not warn without a concept', () => {
    expect(decideAdoptionNav(inputs({ conceptInstruction: true }))).toEqual({ kind: 'not-adopting' });
  });

  it('does not warn outside Phase 0', () => {
    expect(decideAdoptionNav(inputs({ conceptExists: true }))).toEqual({ kind: 'not-adopting' });
  });
});

describe('decideAdoptionNav: in_progress at Phase 0 (D4)', () => {
  const base = { state: 'in_progress' as const, conceptInstruction: true };

  it('no concept → concept', () => {
    expect(decideAdoptionNav(inputs(base))).toEqual({ kind: 'recommend', step: 'concept' });
  });

  it('concept, no architecture → architecture', () => {
    expect(decideAdoptionNav(inputs({ ...base, conceptExists: true }))).toEqual({
      kind: 'recommend',
      step: 'architecture',
    });
  });

  it('concept and architecture, no plan → existing-state-plan', () => {
    const nav = decideAdoptionNav(inputs({ ...base, conceptExists: true, architecturePaths: [ARCH] }));
    expect(nav).toEqual({ kind: 'recommend', step: 'existing-state-plan' });
  });

  it('an existing-state plan → record-completion, even with no concept (row 1 wins)', () => {
    const nav = decideAdoptionNav(inputs({ ...base, existingStatePlanPath: PLAN }));
    expect(nav).toEqual({ kind: 'recommend', step: 'record-completion' });
  });

  it('pins the artifact steps to the guide order as artifacts are added one by one', () => {
    const steps = [
      inputs(base),
      inputs({ ...base, conceptExists: true }),
      inputs({ ...base, conceptExists: true, architecturePaths: [ARCH] }),
    ].map((step) => decideAdoptionNav(step));
    expect(steps).toEqual([
      { kind: 'recommend', step: 'concept' },
      { kind: 'recommend', step: 'architecture' },
      { kind: 'recommend', step: 'existing-state-plan' },
    ]);
  });
});

describe('decideAdoptionNav: in_progress outside Phase 0 (D5)', () => {
  it('warns with the instruction and the resume command', () => {
    const nav = decideAdoptionNav(inputs({ state: 'in_progress', instruction: 'Phase 2: Architecture' }));
    expect(nav).toEqual({ kind: 'warn', warning: outsideConceptPhaseWarning('Phase 2: Architecture') });
    expect(nav.kind === 'warn' && nav.warning).toContain("'Phase 2: Architecture'");
    expect(nav.kind === 'warn' && nav.warning).toContain("cf set phase 'Phase 0: Concept'");
  });
});

describe('decideAdoptionNav: complete (D6)', () => {
  const base = { state: 'complete' as const };

  it('no existing-state plan → warn', () => {
    expect(decideAdoptionNav(inputs(base))).toEqual({ kind: 'warn', warning: NO_EXISTING_STATE_PLAN_WARNING });
  });

  it('plan not registered → register-plan', () => {
    expect(decideAdoptionNav(inputs({ ...base, existingStatePlanPath: PLAN }))).toEqual({
      kind: 'recommend',
      step: 'register-plan',
    });
  });

  it('registered plan is the existing-state plan with no open entry → plan-new-work', () => {
    const nav = decideAdoptionNav(inputs({ ...base, existingStatePlanPath: PLAN, registeredPlanPath: PLAN }));
    expect(nav).toEqual({ kind: 'recommend', step: 'plan-new-work' });
  });

  it('registered plan is the existing-state plan with an open entry → adopted', () => {
    const nav = decideAdoptionNav(
      inputs({ ...base, existingStatePlanPath: PLAN, registeredPlanPath: PLAN, registeredPlanHasOpenEntry: true }),
    );
    expect(nav).toEqual({ kind: 'adopted' });
  });

  it('a different plan registered, no open entry → adopted', () => {
    const nav = decideAdoptionNav(
      inputs({ ...base, existingStatePlanPath: PLAN, registeredPlanPath: '/p/other/200-slices.next.md' }),
    );
    expect(nav).toEqual({ kind: 'adopted' });
  });
});
