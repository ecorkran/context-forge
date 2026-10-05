import { join } from 'node:path';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { describe, it, expect } from 'vitest';
import { ConsistencyChecker } from '../../src/introspection/ConsistencyChecker.js';
import { ArtifactIntrospector } from '../../src/introspection/ArtifactIntrospector.js';
import type { IArtifactIntrospector } from '../../src/introspection/interfaces.js';
import type { ProjectData } from '../../src/types/project.js';
import type { SlicePlanResult, SlicePlanEntry, ConsistencyFinding } from '../../src/introspection/types.js';
import { makeStubConfig } from '../helpers/stubConfig.js';

const PROJECT_ROOT = join(__dirname, '..', 'fixtures', 'introspection', 'project');

const GATE_ENABLED_DEFAULTS = {
  'workflow.review_enabled': true,
  'workflow.review_threshold': 'concerns',
  'workflow.review_unknown_as': 'fail',
  'workflow.review_weak_pass_as': 'pass',
  'workflow.review_gates.arch.threshold': '',
  'workflow.review_gates.slice.threshold': '',
  'workflow.review_gates.tasks.threshold': '',
  'workflow.review_gates.code.threshold': '',
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
    indexSource: 'explicit',
    ...entry,
  };
  const planResult: SlicePlanResult = {
    filePath: join(PROJECT_ROOT, 'project-documents/user/architecture/900-slices.review-gate-fixture.md'),
    entries: [planEntry],
    totalSlices: 1,
    completedSlices: planEntry.isChecked ? 1 : 0,
  };
  return {
    parseSlicePlan: async () => planResult,
    parseTaskFile: real.parseTaskFile.bind(real),
    parseFrontmatter: real.parseFrontmatter.bind(real),
    parseFutureWork: real.parseFutureWork.bind(real),
    detectDocuments: real.detectDocuments.bind(real),
    summarize: real.summarize.bind(real),
  };
}

describe('ConsistencyChecker — review-gate rule (slice 242)', () => {
  it('absent review → warning finding, not fixable', async () => {
    const introspector = makeIntrospectorWithPlanEntry({ index: 300, isChecked: true });
    const config = makeStubConfig(GATE_ENABLED_DEFAULTS);
    const checker = new ConsistencyChecker(introspector, config);

    const result = await checker.check(makeProject({ fileSlice: '300-slice.all-done', fileTasks: '300-tasks.all-done' }));

    const codeFinding = result.findings.find((f) => f.rule === 'review-gate' && f.suggestedFix.includes('code'));
    expect(codeFinding).toBeDefined();
    expect(codeFinding!.severity).toBe('warning');
    expect(codeFinding!.fixable).toBe(false);
    expect(codeFinding!.fixAction).toBeUndefined();
  });

  it('failing verdict → error finding, not fixable', async () => {
    const introspector = makeIntrospectorWithPlanEntry({ index: 400, isChecked: true });
    const config = makeStubConfig(GATE_ENABLED_DEFAULTS);
    const checker = new ConsistencyChecker(introspector, config);

    const result = await checker.check(makeProject({ fileSlice: '400-slice.gate-code-fail', fileTasks: '400-tasks.gate-code-fail' }));

    const codeFinding = result.findings.find((f) => f.rule === 'review-gate' && f.suggestedFix.includes('code'));
    expect(codeFinding).toBeDefined();
    expect(codeFinding!.severity).toBe('error');
    expect(codeFinding!.fixable).toBe(false);
    expect(codeFinding!.location).toContain('400-review.code.first.md');
  });

  it('clearing verdict → no code-boundary review-gate finding', async () => {
    const introspector = makeIntrospectorWithPlanEntry({ index: 401, isChecked: true });
    const config = makeStubConfig(GATE_ENABLED_DEFAULTS);
    const checker = new ConsistencyChecker(introspector, config);

    const result = await checker.check(makeProject({ fileSlice: '401-slice.gate-code-clears', fileTasks: '401-tasks.gate-code-clears' }));

    // Fixture 401 has no slice/tasks reviews on disk, so preTasks/preImplementation
    // still surface their own pending-review findings — only the code (preAdvance)
    // boundary is under test here, and it must clear.
    const codeFinding = result.findings.find((f) => f.rule === 'review-gate' && f.suggestedFix.includes('code'));
    expect(codeFinding).toBeUndefined();
  });

  it('incomplete slice (isChecked=false) → no code-boundary finding regardless of review state', async () => {
    const introspector = makeIntrospectorWithPlanEntry({ index: 400, isChecked: false });
    const config = makeStubConfig(GATE_ENABLED_DEFAULTS);
    const checker = new ConsistencyChecker(introspector, config);

    const result = await checker.check(makeProject({ fileSlice: '400-slice.gate-code-fail', fileTasks: '400-tasks.gate-code-fail' }));

    // isChecked only guards the preAdvance/code boundary (ConsistencyChecker.ts:605);
    // preTasks/preImplementation still fire independently for this fixture (no
    // slice/tasks reviews on disk) and are out of scope for this test.
    const codeFinding = result.findings.find((f) => f.rule === 'review-gate' && f.suggestedFix.includes('code'));
    expect(codeFinding).toBeUndefined();
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

    const codeFinding = result.findings.find((f) => f.rule === 'review-gate' && f.suggestedFix.includes('code'));
    expect(codeFinding).toBeDefined();
    expect(codeFinding!.severity).toBe('error');
  });

  it('cf check --fix does not touch the review-gate finding or its files', async () => {
    const introspector = makeIntrospectorWithPlanEntry({ index: 400, isChecked: true });
    const config = makeStubConfig(GATE_ENABLED_DEFAULTS);
    const checker = new ConsistencyChecker(introspector, config);

    const fixResult = await checker.applyFixes(await checker.check(makeProject({ fileSlice: '400-slice.gate-code-fail', fileTasks: '400-tasks.gate-code-fail' })));

    const codeFinding = fixResult.findings.find((f) => f.rule === 'review-gate' && f.suggestedFix.includes('code'));
    expect(codeFinding).toBeDefined();
    expect(fixResult.fixLog.some((entry) => entry.rule === 'review-gate')).toBe(false);
  });

  it('nested findings[].verdict does not clobber a clearing top-level verdict (#64)', async () => {
    const introspector = makeIntrospectorWithPlanEntry({ index: 406, isChecked: true });
    const config = makeStubConfig(GATE_ENABLED_DEFAULTS);
    const checker = new ConsistencyChecker(introspector, config);

    const result = await checker.check(
      makeProject({ fileSlice: '406-slice.gate-code-nested-collision', fileTasks: '406-tasks.gate-code-nested-collision' }),
    );

    // Fixture 406's review has a top-level verdict: CONCERNS (which clears
    // under the default threshold) plus nested findings[].verdict: CONFIRMED
    // sub-fields. Pre-fix, the flat scanner let the last nested verdict line
    // clobber data.verdict, producing a false review-gate failure.
    const codeFinding = result.findings.find((f) => f.rule === 'review-gate' && f.suggestedFix.includes('code'));
    expect(codeFinding).toBeUndefined();
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

describe('ConsistencyChecker — exemption and weak-clear info findings (slice 928)', () => {
  const infoFindings = (findings: ConsistencyFinding[]) =>
    findings.filter((f) => f.rule === 'review-gate' && f.severity === 'info');

  describe('review: none exemption', () => {
    const project = makeProject({ fileSlice: '405-slice.gate-docs-only', fileTasks: '405-tasks.gate-docs-only' });

    it('unchecked plan entry → exactly one info finding at the slice design, not one per boundary', async () => {
      const checker = new ConsistencyChecker(
        makeIntrospectorWithPlanEntry({ index: 405, isChecked: false }), makeStubConfig(GATE_ENABLED_DEFAULTS),
      );
      const infos = infoFindings((await checker.check(project)).findings);
      expect(infos).toHaveLength(1);
      expect(infos[0].description).toContain('Slice 405 is review-exempt');
      expect(infos[0].description).toContain('review: none');
      expect(infos[0].location).toContain('405-slice.gate-docs-only.md');
      expect(infos[0].fixable).toBe(false);
    });

    it('checked plan entry → no info finding', async () => {
      const checker = new ConsistencyChecker(
        makeIntrospectorWithPlanEntry({ index: 405, isChecked: true }), makeStubConfig(GATE_ENABLED_DEFAULTS),
      );
      expect(infoFindings((await checker.check(project)).findings)).toHaveLength(0);
    });
  });

  describe('weak-provenance clear', () => {
    const INDEX = 980;

    /** Temp project with a slice design, an in-progress task file, and slice/tasks reviews. */
    function makeWeakProject(sliceReviewProvenance: string[]): ProjectData {
      const root = mkdtempSync(join(tmpdir(), 'cf-check-weak-'));
      const user = join(root, 'project-documents', 'user');
      for (const dir of ['slices', 'tasks', 'reviews']) mkdirSync(join(user, dir), { recursive: true });
      writeFileSync(join(user, 'slices', `${INDEX}-slice.weak.md`), '---\nslice: weak\nstatus: in_progress\n---\n');
      writeFileSync(join(user, 'tasks', `${INDEX}-tasks.weak.md`), '---\nslice: weak\n---\n\n- [x] One\n- [ ] Two\n');
      writeFileSync(
        join(user, 'reviews', `${INDEX}-review.slice.weak.md`),
        ['---', 'docType: review', 'verdict: PASS', ...sliceReviewProvenance, '---', ''].join('\n'),
      );
      writeFileSync(join(user, 'reviews', `${INDEX}-review.tasks.weak.md`), '---\ndocType: review\nverdict: PASS\nverdictSource: stated\n---\n');
      return makeProject({ projectPath: root, fileSlice: `${INDEX}-slice.weak`, fileTasks: `${INDEX}-tasks.weak` });
    }

    const checkerFor = (isChecked: boolean) => new ConsistencyChecker(
      makeIntrospectorWithPlanEntry({ index: INDEX, isChecked }), makeStubConfig(GATE_ENABLED_DEFAULTS),
    );

    it('derived PASS at default policy, unchecked entry → one info finding naming the review and derived', async () => {
      const result = await checkerFor(false).check(makeWeakProject(['verdictSource: derived']));
      const infos = infoFindings(result.findings);
      expect(infos).toHaveLength(1);
      expect(infos[0].location).toContain(`${INDEX}-review.slice.weak.md`);
      expect(infos[0].description).toContain('derived');
      expect(infos[0].description).toContain('workflow.review_weak_pass_as');
    });

    it('derived PASS with checked entry → no info finding', async () => {
      const result = await checkerFor(true).check(makeWeakProject(['verdictSource: derived']));
      expect(infoFindings(result.findings)).toHaveLength(0);
    });

    it('clean stated PASS → no info finding', async () => {
      const result = await checkerFor(false).check(makeWeakProject(['verdictSource: stated']));
      expect(infoFindings(result.findings)).toHaveLength(0);
    });
  });
});
