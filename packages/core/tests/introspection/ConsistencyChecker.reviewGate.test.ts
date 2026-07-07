import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { ConsistencyChecker } from '../../src/introspection/ConsistencyChecker.js';
import { ArtifactIntrospector } from '../../src/introspection/ArtifactIntrospector.js';
import type { IArtifactIntrospector } from '../../src/introspection/interfaces.js';
import type { ProjectData } from '../../src/types/project.js';
import type { SlicePlanResult, SlicePlanEntry } from '../../src/introspection/types.js';
import { makeStubConfig } from '../helpers/stubConfig.js';

const PROJECT_ROOT = join(__dirname, '..', 'fixtures', 'introspection', 'project');

const GATE_ENABLED_DEFAULTS = {
  'workflow.review_enabled': true,
  'workflow.review_threshold': 'concerns',
  'workflow.review_unknown_as': 'fail',
  'workflow.review_gates.pre_slice_plan.threshold': '',
  'workflow.review_gates.pre_tasks.threshold': '',
  'workflow.review_gates.pre_implementation.threshold': '',
  'workflow.review_gates.pre_advance.threshold': '',
  'workflow.review_gate_effective_date': '',
};

function makeProject(overrides: Partial<ProjectData> = {}): ProjectData {
  return {
    id: 'test-1',
    name: 'test-project',
    template: 'default',
    fileSlice: '300-slice.all-done',
    fileTasks: '300-tasks.all-done',
    fileSlicePlan: '900-slices.review-gate-fixture',
    instruction: 'implementation',
    createdAt: '2026-01-01',
    updatedAt: '2026-03-07',
    projectPath: PROJECT_ROOT,
    ...overrides,
  };
}

/**
 * Wraps a real ArtifactIntrospector (so rules 1-5 see consistent real fixture
 * data) but overrides parseSlicePlan to hand back a synthetic entry for the
 * given index — these fixtures have no slice-plan file of their own.
 */
function makeIntrospectorWithPlanEntry(entry: Partial<SlicePlanEntry> & { index: number }): IArtifactIntrospector {
  const real = new ArtifactIntrospector();
  const planEntry: SlicePlanEntry = {
    name: 'gate-fixture',
    status: 'complete',
    isChecked: true,
    lineIndex: 0,
    ...entry,
  };
  const planResult: SlicePlanResult = {
    filePath: join(PROJECT_ROOT, 'project-documents/user/architecture/900-slices.review-gate-fixture.md'),
    entries: [planEntry],
    totalSlices: 1,
    completedSlices: planEntry.isChecked ? 1 : 0,
  };
  return {
    ...real,
    parseSlicePlan: async () => planResult,
  };
}

describe('ConsistencyChecker — review-gate rule (slice 242)', () => {
  it('absent review → warning finding, not fixable', async () => {
    const introspector = makeIntrospectorWithPlanEntry({ index: 300, isChecked: true });
    const config = makeStubConfig(GATE_ENABLED_DEFAULTS);
    const checker = new ConsistencyChecker(introspector, config);

    const result = await checker.check(makeProject({ fileSlice: '300-slice.all-done', fileTasks: '300-tasks.all-done' }));

    const findings = result.findings.filter((f) => f.rule === 'review-gate');
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe('warning');
    expect(findings[0].fixable).toBe(false);
    expect(findings[0].fixAction).toBeUndefined();
  });

  it('failing verdict → error finding, not fixable', async () => {
    const introspector = makeIntrospectorWithPlanEntry({ index: 400, isChecked: true });
    const config = makeStubConfig(GATE_ENABLED_DEFAULTS);
    const checker = new ConsistencyChecker(introspector, config);

    const result = await checker.check(makeProject({ fileSlice: '400-slice.gate-code-fail', fileTasks: '400-tasks.gate-code-fail' }));

    const findings = result.findings.filter((f) => f.rule === 'review-gate');
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe('error');
    expect(findings[0].fixable).toBe(false);
    expect(findings[0].location).toContain('400-review.code.first.md');
  });

  it('clearing verdict → no review-gate finding', async () => {
    const introspector = makeIntrospectorWithPlanEntry({ index: 401, isChecked: true });
    const config = makeStubConfig(GATE_ENABLED_DEFAULTS);
    const checker = new ConsistencyChecker(introspector, config);

    const result = await checker.check(makeProject({ fileSlice: '401-slice.gate-code-clears', fileTasks: '401-tasks.gate-code-clears' }));

    const findings = result.findings.filter((f) => f.rule === 'review-gate');
    expect(findings).toHaveLength(0);
  });

  it('incomplete slice (isChecked=false) → no finding regardless of review state', async () => {
    const introspector = makeIntrospectorWithPlanEntry({ index: 400, isChecked: false });
    const config = makeStubConfig(GATE_ENABLED_DEFAULTS);
    const checker = new ConsistencyChecker(introspector, config);

    const result = await checker.check(makeProject({ fileSlice: '400-slice.gate-code-fail', fileTasks: '400-tasks.gate-code-fail' }));

    const findings = result.findings.filter((f) => f.rule === 'review-gate');
    expect(findings).toHaveLength(0);
  });

  it('gating off (no config) → no review-gate finding, identical to pre-242 rule set', async () => {
    const introspector = makeIntrospectorWithPlanEntry({ index: 400, isChecked: true });
    const checker = new ConsistencyChecker(introspector);

    const result = await checker.check(makeProject({ fileSlice: '400-slice.gate-code-fail', fileTasks: '400-tasks.gate-code-fail' }));

    expect(result.findings.filter((f) => f.rule === 'review-gate')).toHaveLength(0);
  });

  it('gating off (review_enabled=false) → no review-gate finding', async () => {
    const introspector = makeIntrospectorWithPlanEntry({ index: 400, isChecked: true });
    const config = makeStubConfig({ ...GATE_ENABLED_DEFAULTS, 'workflow.review_enabled': false });
    const checker = new ConsistencyChecker(introspector, config);

    const result = await checker.check(makeProject({ fileSlice: '400-slice.gate-code-fail', fileTasks: '400-tasks.gate-code-fail' }));

    expect(result.findings.filter((f) => f.rule === 'review-gate')).toHaveLength(0);
  });

  it('present but no verdict (UNKNOWN) under default policy → error finding', async () => {
    const introspector = makeIntrospectorWithPlanEntry({ index: 402, isChecked: true });
    const config = makeStubConfig(GATE_ENABLED_DEFAULTS);
    const checker = new ConsistencyChecker(introspector, config);

    const result = await checker.check(makeProject({ fileSlice: '402-slice.gate-code-unknown', fileTasks: '402-tasks.gate-code-unknown' }));

    const findings = result.findings.filter((f) => f.rule === 'review-gate');
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe('error');
  });

  it('cf check --fix does not touch the review-gate finding or its files', async () => {
    const introspector = makeIntrospectorWithPlanEntry({ index: 400, isChecked: true });
    const config = makeStubConfig(GATE_ENABLED_DEFAULTS);
    const checker = new ConsistencyChecker(introspector, config);

    const fixResult = await checker.fix(makeProject({ fileSlice: '400-slice.gate-code-fail', fileTasks: '400-tasks.gate-code-fail' }));

    const findings = fixResult.findings.filter((f) => f.rule === 'review-gate');
    expect(findings).toHaveLength(1);
    expect(fixResult.fixLog.some((entry) => entry.rule === 'review-gate')).toBe(false);
  });

  it('checkAll() surfaces the same review-gate finding as check()', async () => {
    const introspector = makeIntrospectorWithPlanEntry({ index: 400, isChecked: true });
    const config = makeStubConfig(GATE_ENABLED_DEFAULTS);
    const checker = new ConsistencyChecker(introspector, config);

    const result = await checker.checkAll(makeProject({ fileSlice: '400-slice.gate-code-fail', fileTasks: '400-tasks.gate-code-fail' }));

    // checkAll() now also surfaces the widened per-slice boundaries (preTasks/preImplementation,
    // slice 912 TD-3) and the project-wide arch aggregate rule (ruleArchReviewGate), so filter down
    // to the specific code-boundary finding for slice 400 that check() also produces.
    const codeFinding = result.findings.find(
      (f) => f.rule === 'review-gate' && f.description.includes('slice 400') && f.suggestedFix.includes('code'),
    );
    expect(codeFinding).toBeDefined();
    expect(codeFinding!.severity).toBe('error');
  });
});
