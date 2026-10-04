import { describe, it, expect } from 'vitest';
import { WorkflowNavigator } from '../../src/introspection/WorkflowNavigator.js';
import { makeStubConfig } from '../helpers/stubConfig.js';
import { makeProject, GATE_ENABLED_DEFAULTS, GATE_DISABLED_CONFIG } from '../helpers/workflowNavigatorFixtures.js';

describe('WorkflowNavigator — review gate (slice 241)', () => {
  describe('pre-advance (code) boundary', () => {
    it('absent review → pending-review / review recommendation', async () => {
      // Fixture 300: all-done, complete, no review file at all
      const config = makeStubConfig(GATE_ENABLED_DEFAULTS);
      const nav = new WorkflowNavigator(config);
      const project = makeProject({ fileSlice: '300-slice.all-done.md' });

      const status = await nav.getStatus(project);
      expect(status.activeSlice!.status).toBe('pending-review');

      const next = await nav.getNext(project);
      expect(next.recommendation).toContain('Review required');
      expect(next.rationale).toContain('code');
    });

    it('FAIL verdict → review-failed / blocked recommendation naming verdict and threshold', async () => {
      const config = makeStubConfig(GATE_ENABLED_DEFAULTS);
      const nav = new WorkflowNavigator(config);
      const project = makeProject({ fileSlice: '400-slice.gate-code-fail.md' });

      const status = await nav.getStatus(project);
      expect(status.activeSlice!.status).toBe('review-failed');

      const next = await nav.getNext(project);
      expect(next.recommendation).toContain('Blocked');
      expect(next.rationale).toContain('FAIL');
      expect(next.rationale).toContain('concerns');
    });

    it('CONCERNS verdict clears under threshold=concerns → complete / advance unchanged', async () => {
      const config = makeStubConfig(GATE_ENABLED_DEFAULTS);
      const nav = new WorkflowNavigator(config);
      const project = makeProject({ fileSlice: '401-slice.gate-code-clears.md' });

      const status = await nav.getStatus(project);
      expect(status.activeSlice!.status).toBe('complete');
    });

    it('present file with no verdict field → UNKNOWN → review-failed under default unknownAs=fail', async () => {
      const config = makeStubConfig(GATE_ENABLED_DEFAULTS);
      const nav = new WorkflowNavigator(config);
      const project = makeProject({ fileSlice: '402-slice.gate-code-unknown.md' });

      const status = await nav.getStatus(project);
      expect(status.activeSlice!.status).toBe('review-failed');
    });

    it('present file with no verdict field clears under unknownAs=pass', async () => {
      const config = makeStubConfig({ ...GATE_ENABLED_DEFAULTS, 'workflow.review_unknown_as': 'pass' });
      const nav = new WorkflowNavigator(config);
      const project = makeProject({ fileSlice: '402-slice.gate-code-unknown.md' });

      const status = await nav.getStatus(project);
      expect(status.activeSlice!.status).toBe('complete');
    });
  });

  describe('pre-tasks (slice) boundary', () => {
    it('FAIL verdict → review-failed with slice reviewType sought', async () => {
      const config = makeStubConfig(GATE_ENABLED_DEFAULTS);
      const nav = new WorkflowNavigator(config);
      const project = makeProject({ fileSlice: '403-slice.gate-slice-fail.md' });

      const status = await nav.getStatus(project);
      expect(status.activeSlice!.status).toBe('review-failed');
      expect(status.activeSlice!.gateInfo?.reviewType).toBe('slice');
    });

    it('absent review on a design-only slice → pending-review naming slice reviewType', async () => {
      // Fixture 200: design-only, no task file, no review
      const config = makeStubConfig(GATE_ENABLED_DEFAULTS);
      const nav = new WorkflowNavigator(config);
      const project = makeProject({ fileSlice: '200-slice.design-only.md' });

      const status = await nav.getStatus(project);
      expect(status.activeSlice!.status).toBe('pending-review');
      expect(status.activeSlice!.gateInfo?.reviewType).toBe('slice');
    });
  });

  describe('pre-slice-plan (arch) boundary', () => {
    it('CONCERNS verdict blocked under threshold=pass, regardless of phase', async () => {
      const config = makeStubConfig({ ...GATE_ENABLED_DEFAULTS, 'workflow.review_threshold': 'pass' });
      const nav = new WorkflowNavigator(config);
      const project = makeProject({
        fileSlice: '',
        fileArch: '404-arch.gate-arch-concerns',
        developmentPhase: 'Phase 3: Slice Planning',
      });

      const next = await nav.getNext(project);
      expect(next.recommendation).toContain('Blocked');
      expect(next.rationale).toContain('CONCERNS');
    });

    it('CONCERNS verdict blocked even with no phase set (gate precedes first-run welcome message)', async () => {
      const config = makeStubConfig({ ...GATE_ENABLED_DEFAULTS, 'workflow.review_threshold': 'pass' });
      const nav = new WorkflowNavigator(config);
      const project = makeProject({
        fileSlice: '',
        fileArch: '404-arch.gate-arch-concerns',
        developmentPhase: undefined,
      });

      const next = await nav.getNext(project);
      expect(next.recommendation).toContain('Blocked');
    });

    it('CONCERNS verdict clears under default threshold=concerns', async () => {
      const config = makeStubConfig(GATE_ENABLED_DEFAULTS);
      const nav = new WorkflowNavigator(config);
      const project = makeProject({
        fileSlice: '',
        fileArch: '404-arch.gate-arch-concerns',
        developmentPhase: 'Phase 3: Slice Planning',
      });

      const next = await nav.getNext(project);
      expect(next.recommendation).not.toContain('Blocked');
      expect(next.recommendation).not.toContain('Review required');
    });

    it('#59 Gap 1: arch gate still fires when a slice plan already exists (previously orphaned)', async () => {
      const config = makeStubConfig(GATE_ENABLED_DEFAULTS);
      const nav = new WorkflowNavigator(config);
      // Arch 050 has no review artifact at all; slice plan is present (the previously-orphaning state).
      const project = makeProject({
        fileSlice: '',
        fileArch: '050-arch.hld-test-project',
        fileSlicePlan: '100-slices.test-system',
        developmentPhase: 'Phase 3: Slice Planning',
      });

      const next = await nav.getNext(project);
      expect(next.recommendation).toContain('Review required before creating the slice plan');
    });

    it('#59 Gap 1: arch gate clears when the arch review exists and passes, slice plan present', async () => {
      // Fixture 100's arch review has no verdict field (UNKNOWN); treat UNKNOWN as pass here
      // so this test isolates the "review present, gate clears" case from verdict-threshold behavior.
      const config = makeStubConfig({ ...GATE_ENABLED_DEFAULTS, 'workflow.review_unknown_as': 'pass' });
      const nav = new WorkflowNavigator(config);
      // Arch 100 has a passing review; pair with its own slice plan (also present).
      const project = makeProject({
        fileSlice: '',
        fileArch: '100-arch.test-system',
        fileSlicePlan: '100-slices.test-system',
        developmentPhase: 'Phase 3: Slice Planning',
      });

      const next = await nav.getNext(project);
      expect(next.recommendation).not.toContain('Review required');
      expect(next.recommendation).not.toContain('Blocked');
    });

    it('#59 Gap 1 regression: arch gate still fires when no slice plan exists (pre-existing case, unaffected)', async () => {
      const config = makeStubConfig(GATE_ENABLED_DEFAULTS);
      const nav = new WorkflowNavigator(config);
      const project = makeProject({
        fileSlice: '',
        fileArch: '050-arch.hld-test-project',
        fileSlicePlan: undefined,
        developmentPhase: 'Phase 3: Slice Planning',
      });

      const next = await nav.getNext(project);
      expect(next.recommendation).toContain('Review required before creating the slice plan');
    });
  });

  describe('gating-off regression (conservative-by-default)', () => {
    it('no config: byte-identical to pre-241 for a complete slice with no review', async () => {
      const nav = new WorkflowNavigator();
      const project = makeProject({
        fileSlice: '300-slice.all-done.md',
        fileSlicePlan: '100-slices.test-system',
      });

      const status = await nav.getStatus(project);
      expect(status.activeSlice!.status).toBe('complete');

      const next = await nav.getNext(project);
      expect(next.recommendation).not.toContain('Review required');
      expect(next.recommendation).not.toContain('Blocked');
    });

    it('review_enabled=false: byte-identical to pre-241 across representative states', async () => {
      const nav = new WorkflowNavigator(GATE_DISABLED_CONFIG);

      const needsDesign = await nav.getStatus(makeProject({ fileSlice: '999-slice.nonexistent.md' }));
      expect(needsDesign.activeSlice!.status).toBe('needs-design');

      const needsTasks = await nav.getStatus(makeProject({ fileSlice: '200-slice.design-only.md' }));
      expect(needsTasks.activeSlice!.status).toBe('needs-tasks');

      const inImplementation = await nav.getStatus(
        makeProject({ fileSlice: '100-slice.test-feature.md', fileSlicePlan: '100-slices.test-system' }),
      );
      expect(inImplementation.activeSlice!.status).toBe('in-implementation');

      const complete = await nav.getStatus(makeProject({ fileSlice: '300-slice.all-done.md' }));
      expect(complete.activeSlice!.status).toBe('complete');
    });

    it('no artifact lookup occurs when gating is off (no unexpected config keys requested)', async () => {
      // GATE_DISABLED_CONFIG's stub throws on any key it wasn't told to expect beyond
      // review_enabled; resolveGateConfig returns null right after reading review_enabled,
      // so no threshold/unknownAs keys are ever requested when gating is off.
      const nav = new WorkflowNavigator(GATE_DISABLED_CONFIG);
      const project = makeProject({ fileSlice: '300-slice.all-done.md' });
      await expect(nav.getStatus(project)).resolves.toBeDefined();
    });
  });
});
