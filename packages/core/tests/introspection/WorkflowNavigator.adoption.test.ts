import { describe, it, expect } from 'vitest';
import { WorkflowNavigator } from '../../src/introspection/WorkflowNavigator.js';
import {
  NO_EXISTING_STATE_PLAN_WARNING,
  UNSET_STATE_WARNING,
  outsideConceptPhaseWarning,
} from '../../src/introspection/adoptionNavigation.js';
import type { NextAction } from '../../src/introspection/types.js';
import { GATE_DISABLED_CONFIG } from '../helpers/workflowNavigatorFixtures.js';
import {
  ALL_RETROACTIVE_ENTRIES,
  MIXED_ENTRIES,
  createAdoptionFixture,
  type AdoptionFixtureOptions,
} from '../helpers/adoptionFixtures.js';

const CONCEPT_INSTRUCTION = 'Phase 0: Concept';
const REGISTERED = { fileArch: '100-arch.existing', fileSlicePlan: '100-slices.existing' };

async function nextFor(
  options: AdoptionFixtureOptions,
  overrides: Parameters<ReturnType<typeof createAdoptionFixture>['project']>[0] = {},
): Promise<NextAction> {
  const fixture = createAdoptionFixture(options);
  return new WorkflowNavigator(GATE_DISABLED_CONFIG).getNext(fixture.project(overrides));
}

function withoutWarning(action: NextAction, warning: string): NextAction {
  const remaining = (action.warnings ?? []).filter((text) => text !== warning);
  const { warnings: _dropped, ...rest } = action;
  return remaining.length > 0 ? { ...rest, warnings: remaining } : rest;
}

describe('WorkflowNavigator adoption: declined and unset', () => {
  const variants: Array<{ label: string; instruction: string; options: AdoptionFixtureOptions }> = [
    { label: 'no instruction', instruction: '', options: {} },
    { label: 'Phase 0 without a concept', instruction: CONCEPT_INSTRUCTION, options: {} },
    { label: 'Phase 0 with a concept', instruction: CONCEPT_INSTRUCTION, options: { concept: true } },
    { label: 'Phase 1', instruction: 'Phase 1: Initiative Plan', options: { concept: true } },
    { label: 'Phase 2', instruction: 'Phase 2: Architecture', options: { concept: true } },
    { label: 'Phase 3', instruction: 'Phase 3: Slice Planning', options: { concept: true, arch: true } },
  ];

  it.each(variants)('declined: $label matches the unset navigation, minus the D2 warning', async (variant) => {
    const declined = await nextFor({ ...variant.options, state: 'declined' }, { instruction: variant.instruction });
    const unset = await nextFor(variant.options, { instruction: variant.instruction });
    expect(declined.warnings ?? []).not.toContain(UNSET_STATE_WARNING);
    expect(withoutWarning(unset, UNSET_STATE_WARNING)).toEqual(declined);
  });

  it('unset at Phase 0 with a concept and no planning artifact adds exactly the D2 warning', async () => {
    const unset = await nextFor({ concept: true }, { instruction: CONCEPT_INSTRUCTION });
    const declined = await nextFor({ concept: true, state: 'declined' }, { instruction: CONCEPT_INSTRUCTION });
    expect(unset.warnings).toEqual([UNSET_STATE_WARNING]);
    expect(unset.recommendation).toBe(declined.recommendation);
  });

  it('unset at Phase 0 with a concept and a planning artifact adds no warning', async () => {
    const unset = await nextFor({ concept: true, arch: true }, { instruction: CONCEPT_INSTRUCTION });
    expect(unset.warnings ?? []).not.toContain(UNSET_STATE_WARNING);
  });
});

describe('WorkflowNavigator adoption: in_progress at Phase 0', () => {
  const steps: Array<{ step: string; options: AdoptionFixtureOptions; recommendation: string }> = [
    { step: 'concept', options: {}, recommendation: 'Next adoption step: baseline concept.' },
    {
      step: 'architecture',
      options: { concept: true },
      recommendation: 'Next adoption step: architecture derived from the code.',
    },
    {
      step: 'existing-state-plan',
      options: { concept: true, arch: true },
      recommendation: 'Next adoption step: existing-state slice plan.',
    },
    {
      step: 'record-completion',
      options: { concept: true, arch: true, plan: MIXED_ENTRIES },
      recommendation: 'The existing-state slice plan is written. Run cf build to record adoption as complete.',
    },
  ];

  it.each(steps)('step $step recommends cf build and never moves the phase', async ({ options, recommendation }) => {
    const next = await nextFor({ ...options, state: 'in_progress' }, { instruction: CONCEPT_INSTRUCTION });
    expect(next.recommendation).toBe(recommendation);
    expect(next.suggestedCommand).toBe('cf build');
    expect(next.phase).toBeUndefined();
    expect(JSON.stringify(next)).not.toContain('cf set phase');
  });
});

describe('WorkflowNavigator adoption: in_progress outside Phase 0 (D5)', () => {
  it('keeps the Phase 2 recommendation and adds the D5 warning', async () => {
    const instruction = 'Phase 2: Architecture';
    const options = { concept: true };
    const inProgress = await nextFor({ ...options, state: 'in_progress' }, { instruction });
    const declined = await nextFor({ ...options, state: 'declined' }, { instruction });
    expect(inProgress.warnings).toEqual([outsideConceptPhaseWarning(instruction)]);
    expect(withoutWarning(inProgress, outsideConceptPhaseWarning(instruction))).toEqual(declined);
  });
});

describe('WorkflowNavigator adoption: complete (D6)', () => {
  const COMPLETE = { state: 'complete', concept: true, arch: true } as const;

  it('without an existing-state plan: today navigation plus the row 1 warning', async () => {
    const complete = await nextFor(COMPLETE, { instruction: CONCEPT_INSTRUCTION });
    const declined = await nextFor({ ...COMPLETE, state: 'declined' }, { instruction: CONCEPT_INSTRUCTION });
    expect(complete.warnings).toEqual([NO_EXISTING_STATE_PLAN_WARNING]);
    expect(withoutWarning(complete, NO_EXISTING_STATE_PLAN_WARNING)).toEqual(declined);
  });

  it('plan present but unregistered → register the architecture', async () => {
    const next = await nextFor({ ...COMPLETE, plan: MIXED_ENTRIES }, { instruction: CONCEPT_INSTRUCTION });
    expect(next.suggestedCommand).toBe('cf set arch 100-arch.existing');
  });

  it('plan registered with new entries → pick the first new slice, not Phase 1', async () => {
    const next = await nextFor({ ...COMPLETE, plan: MIXED_ENTRIES }, { instruction: CONCEPT_INSTRUCTION, ...REGISTERED });
    expect(next.suggestedCommand).toBe('cf set slice 102');
    expect(next.recommendation).not.toContain('Advance to Phase 1');
  });

  it('plan registered, all entries retroactive → plan new work in Phase 3', async () => {
    const next = await nextFor(
      { ...COMPLETE, plan: ALL_RETROACTIVE_ENTRIES },
      { instruction: CONCEPT_INSTRUCTION, ...REGISTERED },
    );
    expect(next.suggestedCommand).toBe("cf set phase 'Phase 3: Slice Planning'");
    expect(next.recommendation).not.toContain('Advance to Phase 1');
  });

  it('a different plan registered → normal navigation on that plan', async () => {
    const next = await nextFor(
      { ...COMPLETE, plan: MIXED_ENTRIES, otherPlan: true },
      { instruction: CONCEPT_INSTRUCTION, fileArch: '100-arch.existing', fileSlicePlan: '200-slices.other' },
    );
    expect(next.suggestedCommand).toBe('cf set slice 200');
  });

  it('a registered plan whose file is missing is treated as unregistered', async () => {
    const next = await nextFor(
      { ...COMPLETE, plan: MIXED_ENTRIES },
      { instruction: CONCEPT_INSTRUCTION, fileSlicePlan: '999-slices.missing' },
    );
    expect(next.suggestedCommand).toBe('cf set arch 100-arch.existing');
  });
});

describe('WorkflowNavigator adoption: active slice', () => {
  const states = ['declined', 'in_progress', 'complete'];

  it.each(states)('state %s leaves navigation unchanged when a slice is active', async (state) => {
    const options = { concept: true, arch: true, plan: MIXED_ENTRIES };
    const overrides = { instruction: CONCEPT_INSTRUCTION, fileSlice: '102-slice.new-work.md', ...REGISTERED };
    const baseline = await nextFor(options, overrides);
    expect(await nextFor({ ...options, state }, overrides)).toEqual(baseline);
  });
});

describe('WorkflowNavigator adoption: read-only (D3)', () => {
  const cases: AdoptionFixtureOptions[] = [
    { state: 'in_progress', concept: true, arch: true, plan: MIXED_ENTRIES },
    { state: 'complete', concept: true, arch: true, plan: MIXED_ENTRIES },
    { concept: true },
  ];

  it.each(cases)('cf next writes nothing for %j', async (options) => {
    const fixture = createAdoptionFixture(options);
    const project = fixture.project({ instruction: CONCEPT_INSTRUCTION });
    const configBefore = fixture.configBytes();
    const projectBefore = JSON.stringify(project);
    await new WorkflowNavigator(GATE_DISABLED_CONFIG).getNext(project);
    expect(fixture.configBytes()).toBe(configBefore);
    expect(JSON.stringify(project)).toBe(projectBefore);
  });
});

describe('WorkflowNavigator adoption: failure modes (D7)', () => {
  it('rejects an out-of-enum adoption.state with the readAdoptionState message', async () => {
    const fixture = createAdoptionFixture({ state: 'bogus', concept: true });
    const attempt = new WorkflowNavigator(GATE_DISABLED_CONFIG).getNext(fixture.project());
    await expect(attempt).rejects.toThrow(/adoption\.state is "bogus", which is not one of/);
  });
});
