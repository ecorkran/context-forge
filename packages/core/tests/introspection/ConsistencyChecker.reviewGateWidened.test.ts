import { join } from 'node:path';
import { describe, it, expect, vi } from 'vitest';
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
 * Wraps a real ArtifactIntrospector, overriding only parseSlicePlan for a synthetic
 * entry. Binds methods explicitly (rather than object-spreading the instance) so
 * prototype methods like detectDocuments survive — an object spread on a class
 * instance drops its prototype methods, which would silently no-op detectDocuments.
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
    parseSlicePlan: async () => planResult,
    parseTaskFile: real.parseTaskFile.bind(real),
    parseFrontmatter: real.parseFrontmatter.bind(real),
    parseFutureWork: real.parseFutureWork.bind(real),
    detectDocuments: real.detectDocuments.bind(real),
    summarize: real.summarize.bind(real),
  };
}

describe('ConsistencyChecker — widened review-gate coverage (slice 912 TD-3/TD-5)', () => {
  describe('preTasks (slice) boundary', () => {
    it('slice-design present, no slice review → pending finding naming the slice review', async () => {
      const introspector = makeIntrospectorWithPlanEntry({ index: 200, isChecked: false });
      const config = makeStubConfig(GATE_ENABLED_DEFAULTS);
      const checker = new ConsistencyChecker(introspector, config);

      const result = await checker.check(makeProject({ fileSlice: '200-slice.design-only', fileTasks: undefined }));

      const findings = result.findings.filter((f) => f.rule === 'review-gate');
      expect(findings).toHaveLength(1);
      expect(findings[0].severity).toBe('warning');
      expect(findings[0].suggestedFix).toContain('slice review');
      expect(findings[0].suggestedFix).not.toContain('code review');
    });

    it('FAIL verdict on slice review → error finding naming the slice review', async () => {
      const introspector = makeIntrospectorWithPlanEntry({ index: 403, isChecked: false });
      const config = makeStubConfig(GATE_ENABLED_DEFAULTS);
      const checker = new ConsistencyChecker(introspector, config);

      const result = await checker.check(makeProject({ fileSlice: '403-slice.gate-slice-fail', fileTasks: undefined }));

      const findings = result.findings.filter((f) => f.rule === 'review-gate');
      expect(findings).toHaveLength(1);
      expect(findings[0].severity).toBe('error');
      expect(findings[0].suggestedFix).toContain('slice review');
    });

    it('slice-design absent → no preTasks finding (existence guard holds)', async () => {
      const introspector = makeIntrospectorWithPlanEntry({ index: 999, isChecked: false });
      const config = makeStubConfig(GATE_ENABLED_DEFAULTS);
      const checker = new ConsistencyChecker(introspector, config);

      const result = await checker.check(makeProject({ fileSlice: '999-slice.nonexistent', fileTasks: undefined }));

      expect(result.findings.filter((f) => f.rule === 'review-gate')).toHaveLength(0);
    });
  });

  describe('preImplementation (tasks) boundary', () => {
    it('task file present, no tasks review → pending finding naming the tasks review', async () => {
      const introspector = makeIntrospectorWithPlanEntry({ index: 400, isChecked: false });
      const config = makeStubConfig(GATE_ENABLED_DEFAULTS);
      const checker = new ConsistencyChecker(introspector, config);

      const result = await checker.check(makeProject({ fileSlice: '400-slice.gate-code-fail', fileTasks: '400-tasks.gate-code-fail' }));

      const findings = result.findings.filter((f) => f.rule === 'review-gate');
      const tasksFinding = findings.find((f) => f.suggestedFix.includes('tasks review'));
      expect(tasksFinding).toBeDefined();
      expect(tasksFinding!.severity).toBe('warning');
    });
  });

  describe('preAdvance (code) boundary — existing behavior, new wording', () => {
    it('plan entry checked, no code review → finding names the code review', async () => {
      const introspector = makeIntrospectorWithPlanEntry({ index: 300, isChecked: true });
      const config = makeStubConfig(GATE_ENABLED_DEFAULTS);
      const checker = new ConsistencyChecker(introspector, config);

      const result = await checker.check(makeProject({ fileSlice: '300-slice.all-done', fileTasks: '300-tasks.all-done' }));

      const findings = result.findings.filter((f) => f.rule === 'review-gate');
      const codeFinding = findings.find((f) => f.suggestedFix.includes('code review'));
      expect(codeFinding).toBeDefined();
    });
  });

  describe('all three slice-keyed boundaries together', () => {
    it('slice-design + task file present, plan checked, no reviews at all → three findings, one per boundary', async () => {
      const introspector = makeIntrospectorWithPlanEntry({ index: 300, isChecked: true });
      const config = makeStubConfig(GATE_ENABLED_DEFAULTS);
      const checker = new ConsistencyChecker(introspector, config);

      const result = await checker.check(makeProject({ fileSlice: '300-slice.all-done', fileTasks: '300-tasks.all-done' }));

      const findings = result.findings.filter((f) => f.rule === 'review-gate');
      expect(findings).toHaveLength(3);
      const reviewTypesNamed = findings.map((f) => f.suggestedFix);
      expect(reviewTypesNamed.some((s) => s.includes('slice review'))).toBe(true);
      expect(reviewTypesNamed.some((s) => s.includes('tasks review'))).toBe(true);
      expect(reviewTypesNamed.some((s) => s.includes('code review'))).toBe(true);
    });
  });

  describe('ruleArchReviewGate (checkAll-only aggregate rule)', () => {
    it('arch file present, no arch review, gating on → checkAll() reports a pending arch review', async () => {
      const introspector = makeIntrospectorWithPlanEntry({ index: 300, isChecked: false });
      const config = makeStubConfig(GATE_ENABLED_DEFAULTS);
      const checker = new ConsistencyChecker(introspector, config);

      // Arch 050 has no review artifact at all.
      const result = await checker.checkAll(
        makeProject({ fileSlice: '', fileTasks: undefined, fileArch: '050-arch.hld-test-project' }),
      );

      const archFinding = result.findings.find(
        (f) => f.rule === 'review-gate' && f.suggestedFix.includes('arch review') && f.suggestedFix.includes('50'),
      );
      expect(archFinding).toBeDefined();
      expect(archFinding!.severity).toBe('warning');
    });

    it('arch review present-and-passing → no finding for that arch', async () => {
      const introspector = makeIntrospectorWithPlanEntry({ index: 300, isChecked: false });
      // unknownAs=pass because fixture 100's arch review has no verdict field.
      const config = makeStubConfig({ ...GATE_ENABLED_DEFAULTS, 'workflow.review_unknown_as': 'pass' });
      const checker = new ConsistencyChecker(introspector, config);

      const result = await checker.checkAll(
        makeProject({ fileSlice: '', fileTasks: undefined, fileArch: '100-arch.test-system' }),
      );

      const archFinding = result.findings.find(
        (f) => f.rule === 'review-gate' && f.suggestedFix.includes('architecture 100'),
      );
      expect(archFinding).toBeUndefined();
    });

    it('single-slice check() is unaffected by the arch aggregate rule', async () => {
      const introspector = makeIntrospectorWithPlanEntry({ index: 300, isChecked: false });
      const config = makeStubConfig(GATE_ENABLED_DEFAULTS);
      const checker = new ConsistencyChecker(introspector, config);

      const result = await checker.check(
        makeProject({ fileSlice: '200-slice.design-only', fileTasks: undefined, fileArch: '050-arch.hld-test-project' }),
      );

      const archFinding = result.findings.find(
        (f) => f.rule === 'review-gate' && f.suggestedFix.includes('architecture'),
      );
      expect(archFinding).toBeUndefined();
    });
  });

  describe('error isolation (TD-5)', () => {
    it('a throwing evaluateReviewGate() degrades to one error finding for that boundary, siblings still evaluate', async () => {
      // evaluateReviewGate() never throws in practice today (parseFrontmatter/detectDocuments
      // are both lenient-by-design), so TD-5's isolation is exercised by forcing a throw at
      // the reviewGate module boundary — proving the safeEvaluateGate() wrapper holds even
      // though nothing in the current codebase can trigger it organically.
      const { evaluateReviewGate: real } = await vi.importActual<typeof import('../../src/introspection/reviewGate.js')>(
        '../../src/introspection/reviewGate.js',
      );
      const spy = vi.spyOn(await import('../../src/introspection/reviewGate.js'), 'evaluateReviewGate');
      spy.mockImplementation(async (projectPath, index, boundary, config, resolved) => {
        if (boundary === 'preTasks') {
          throw new Error('simulated malformed review-gate frontmatter');
        }
        return real(projectPath, index, boundary, config, resolved);
      });

      try {
        const introspector = makeIntrospectorWithPlanEntry({ index: 300, isChecked: true });
        const config = makeStubConfig(GATE_ENABLED_DEFAULTS);
        const checker = new ConsistencyChecker(introspector, config);

        const result = await checker.check(
          makeProject({ fileSlice: '300-slice.all-done', fileTasks: '300-tasks.all-done' }),
        );

        // Run did not throw (implicit — reaching this line) and other boundaries
        // (preImplementation, preAdvance) still produced their normal findings.
        const findings = result.findings.filter((f) => f.rule === 'review-gate');
        expect(findings).toHaveLength(3);

        const errorFinding = findings.find((f) => f.severity === 'error' && f.description.includes('Failed to evaluate'));
        expect(errorFinding).toBeDefined();
        expect(errorFinding!.description).toContain('slice review');
        expect(errorFinding!.description).toContain('simulated malformed review-gate frontmatter');

        const tasksFinding = findings.find((f) => f.suggestedFix.includes('tasks review'));
        const codeFinding = findings.find((f) => f.suggestedFix.includes('code review'));
        expect(tasksFinding).toBeDefined();
        expect(codeFinding).toBeDefined();
      } finally {
        spy.mockRestore();
      }
    });

    it('a throwing arch gate evaluation degrades to one error finding, other arch indices still evaluate', async () => {
      const { evaluateReviewGate: real } = await vi.importActual<typeof import('../../src/introspection/reviewGate.js')>(
        '../../src/introspection/reviewGate.js',
      );
      const spy = vi.spyOn(await import('../../src/introspection/reviewGate.js'), 'evaluateReviewGate');
      spy.mockImplementation(async (projectPath, index, boundary, config, resolved) => {
        if (boundary === 'preSlicePlan' && index === 50) {
          throw new Error('simulated malformed arch review-gate frontmatter');
        }
        return real(projectPath, index, boundary, config, resolved);
      });

      try {
        const introspector = makeIntrospectorWithPlanEntry({ index: 300, isChecked: false });
        const config = makeStubConfig(GATE_ENABLED_DEFAULTS);
        const checker = new ConsistencyChecker(introspector, config);

        // Both 050 (forced throw) and 404 (real CONCERNS-verdict arch) are discovered.
        const result = await checker.checkAll(
          makeProject({ fileSlice: '', fileTasks: undefined, fileArch: '050-arch.hld-test-project' }),
        );

        const archFindings = result.findings.filter((f) => f.rule === 'review-gate');
        const errorFinding = archFindings.find((f) => f.severity === 'error' && f.description.includes('Failed to evaluate'));
        expect(errorFinding).toBeDefined();
        expect(errorFinding!.description).toContain('arch review');

        // 404's arch review (CONCERNS verdict) still surfaces despite 050's throw.
        const otherArchFinding = archFindings.find((f) => f.description.includes('CONCERNS') || f.severity === 'error');
        expect(archFindings.length).toBeGreaterThan(1);
        expect(otherArchFinding).toBeDefined();
      } finally {
        spy.mockRestore();
      }
    });
  });
});
