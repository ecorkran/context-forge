import { describe, it, expect } from 'vitest';
import {
  buildAdoptionStepAction,
  type AdoptionNavInputs,
  type AdoptionNavStep,
} from '../../src/introspection/adoptionNavigation.js';

const DIR = '/p/project-documents/user/architecture';

function inputs(overrides: Partial<AdoptionNavInputs> = {}): AdoptionNavInputs {
  return {
    state: 'in_progress',
    conceptInstruction: true,
    instruction: 'Phase 0: Concept',
    conceptExists: false,
    planningArtifactsExist: false,
    architecturePaths: [],
    existingStatePlanPath: null,
    registeredPlanPath: null,
    registeredPlanHasOpenEntry: false,
    ...overrides,
  };
}

describe('buildAdoptionStepAction: build steps (D4)', () => {
  const cases: Array<[AdoptionNavStep, string]> = [
    ['concept', 'Next adoption step: baseline concept.'],
    ['architecture', 'Next adoption step: architecture derived from the code.'],
    ['existing-state-plan', 'Next adoption step: existing-state slice plan.'],
    [
      'record-completion',
      'The existing-state slice plan is written. Run cf build to record adoption as complete.',
    ],
  ];

  it.each(cases)('%s → exact recommendation, cf build, no phase change', (step, recommendation) => {
    const action = buildAdoptionStepAction(step, inputs());
    expect(action.recommendation).toBe(recommendation);
    expect(action.suggestedCommand).toBe('cf build');
    expect(action.phase).toBeUndefined();
    expect(JSON.stringify(action)).not.toContain('cf set phase');
    expect(action.rationale).toContain('cf config set adoption.state declined');
    expect(action.summary).not.toBe('');
  });
});

describe('buildAdoptionStepAction: register-plan (D6)', () => {
  it('registers the architecture when one shares the plan index', () => {
    const action = buildAdoptionStepAction(
      'register-plan',
      inputs({
        state: 'complete',
        architecturePaths: [`${DIR}/100-arch.existing.md`],
        existingStatePlanPath: `${DIR}/100-slices.existing.md`,
      }),
    );
    expect(action.suggestedCommand).toBe('cf set arch 100-arch.existing');
  });

  it('registers the plan alone when no architecture shares its index', () => {
    const action = buildAdoptionStepAction(
      'register-plan',
      inputs({
        state: 'complete',
        architecturePaths: [`${DIR}/100-arch.existing.md`],
        existingStatePlanPath: `${DIR}/200-slices.x.md`,
      }),
    );
    expect(action.suggestedCommand).toBe('cf set plan 200-slices.x');
  });
});

describe('buildAdoptionStepAction: plan-new-work (D6)', () => {
  it('moves to slice planning and names the plan', () => {
    const action = buildAdoptionStepAction(
      'plan-new-work',
      inputs({ state: 'complete', existingStatePlanPath: `${DIR}/100-slices.existing.md` }),
    );
    expect(action.suggestedCommand).toBe("cf set phase 'Phase 3: Slice Planning'");
    expect(action.recommendation).toContain('100-slices.existing');
  });
});
