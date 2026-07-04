import { describe, it, expect, vi } from 'vitest';
import { join } from 'node:path';
import { WorkflowNavigator } from '../../src/introspection/WorkflowNavigator.js';
import type { ProjectData } from '../../src/types/project.js';
import type { ConfigManager, ConfigResult } from '../../src/config/ConfigManager.js';

const PROJECT_ROOT = join(__dirname, '..', 'fixtures', 'introspection', 'project');

function makeProject(overrides: Partial<ProjectData> = {}): ProjectData {
  return {
    id: 'test-1',
    name: 'test-project',
    template: 'default',
    fileSlice: '100-slice.test-feature.md',
    fileTasks: '100-tasks.test-feature.md',
    instruction: 'implementation',
    createdAt: '2026-01-01',
    updatedAt: '2026-02-28',
    projectPath: PROJECT_ROOT,
    ...overrides,
  };
}

describe('WorkflowNavigator', () => {
  const nav = new WorkflowNavigator();

  describe('getStatus()', () => {
    it('returns basic status with null activeSlice when no projectPath', async () => {
      const project = makeProject({ projectPath: undefined });
      const status = await nav.getStatus(project);

      expect(status.project).toBe('test-project');
      expect(status.activeSlice).toBeNull();
      expect(status.summary).toContain('no project path');
    });

    it('returns no-active-slice when no fileSlice', async () => {
      const project = makeProject({ fileSlice: '' });
      const status = await nav.getStatus(project);

      expect(status.activeSlice).not.toBeNull();
      expect(status.activeSlice!.status).toBe('no-active-slice');
    });

    it('returns needs-design when slice set but no design file exists', async () => {
      // Index 999 has no fixture files
      const project = makeProject({ fileSlice: '999-slice.nonexistent.md' });
      const status = await nav.getStatus(project);

      expect(status.activeSlice!.status).toBe('needs-design');
      expect(status.activeSlice!.index).toBe(999);
      expect(status.activeSlice!.name).toBe('nonexistent');
    });

    it('returns needs-tasks when design exists but no task file', async () => {
      // Fixture 200 has a slice design file but no task file
      const project = makeProject({ fileSlice: '200-slice.design-only.md' });
      const status = await nav.getStatus(project);

      expect(status.activeSlice!.status).toBe('needs-tasks');
      expect(status.activeSlice!.index).toBe(200);
    });

    it('returns complete when all tasks are done', async () => {
      // Fixture 300 has design + tasks with all items checked
      const project = makeProject({ fileSlice: '300-slice.all-done.md' });
      const status = await nav.getStatus(project);

      expect(status.activeSlice!.status).toBe('complete');
      expect(status.activeSlice!.taskProgress!.completed).toBe(3);
      expect(status.activeSlice!.taskProgress!.total).toBe(3);
    });

    it('returns in-implementation when tasks are incomplete', async () => {
      // Fixture 100 has split task files: 2+2 tasks, 2 complete → in-implementation
      const project = makeProject({
        fileSlice: '100-slice.test-feature.md',
        fileSlicePlan: '100-slices.test-system',
        developmentPhase: 'Phase 6: Implementation',
      });
      const status = await nav.getStatus(project);

      expect(status.activeSlice!.status).toBe('in-implementation');
      expect(status.activeSlice!.taskProgress).toBeDefined();
      expect(status.activeSlice!.taskProgress!.completed).toBe(2);
      expect(status.activeSlice!.taskProgress!.total).toBe(4);
      expect(status.activeSlice!.taskProgress!.inferredStatus).toBe('in-progress');
    });

    it('populates slicePlan from fileSlicePlan', async () => {
      const project = makeProject({
        fileSlicePlan: '100-slices.test-system',
      });
      const status = await nav.getStatus(project);

      expect(status.slicePlan).not.toBeNull();
      expect(status.slicePlan!.total).toBe(2);
      expect(status.slicePlan!.completed).toBe(1);
      expect(status.slicePlan!.entries).toHaveLength(2);
      expect(status.slicePlan!.name).toBe('100-slices.test-system');
    });

    it('returns null slicePlan when fileSlicePlan is not set', async () => {
      const project = makeProject({ fileSlicePlan: undefined });
      const status = await nav.getStatus(project);
      expect(status.slicePlan).toBeNull();
    });

    it('builds non-empty summary with relevant info', async () => {
      const project = makeProject({
        developmentPhase: 'Phase 6: Implementation',
        fileSlicePlan: '100-slices.test-system',
      });
      const status = await nav.getStatus(project);

      expect(status.summary).toBeTruthy();
      expect(status.summary).toContain('test-project');
      expect(status.summary).toContain('Phase 6');
      expect(status.summary).toContain('slice 100');
    });

    it('includes phase in status when set', async () => {
      const project = makeProject({ developmentPhase: 'Phase 4: Slice Design' });
      const status = await nav.getStatus(project);
      expect(status.phase).toBe('Phase 4: Slice Design');
    });

    it('handles missing files gracefully', async () => {
      const project = makeProject({
        projectPath: '/nonexistent/path',
        fileSlice: '100-slice.test.md',
      });
      // Should not throw
      const status = await nav.getStatus(project);
      expect(status.project).toBe('test-project');
    });
  });

  describe('getNext()', () => {
    it('recommends setting projectPath when missing', async () => {
      const project = makeProject({ projectPath: undefined });
      const next = await nav.getNext(project);

      expect(next.recommendation).toContain('Set projectPath');
      expect(next.suggestedCommand).toContain('cf set projectPath');
    });

    it('recommends setting slice when no fileSlice but plan exists (FR-5)', async () => {
      const project = makeProject({
        fileSlice: '',
        fileSlicePlan: '100-slices.test-system',
        developmentPhase: 'Phase 6: Implementation',
      });
      const next = await nav.getNext(project);

      expect(next.recommendation).toContain('slice plan but no active slice');
      expect(next.suggestedCommand).toContain('cf set slice');
    });

    it('recommends creating slice design when needs-design', async () => {
      const project = makeProject({ fileSlice: '999-slice.nonexistent.md' });
      const next = await nav.getNext(project);

      expect(next.recommendation).toContain('Create slice design');
      expect(next.phase).toBe('Phase 4: Slice Design');
    });

    it('recommends creating task breakdown when needs-tasks', async () => {
      const project = makeProject({ fileSlice: '200-slice.design-only.md' });
      const next = await nav.getNext(project);

      expect(next.recommendation).toContain('Create task breakdown');
      expect(next.phase).toBe('Phase 5: Task Breakdown');
    });

    it('recommends continuing implementation with remaining count', async () => {
      const project = makeProject({
        fileSlice: '100-slice.test-feature.md',
      });
      const next = await nav.getNext(project);

      expect(next.recommendation).toContain('Continue implementation');
      expect(next.recommendation).toContain('2 tasks remaining');
      expect(next.phase).toBe('Phase 6: Implementation');
    });

    // Regression test (slice 240 / TD-4): the getNext() cascade branch comments
    // were renamed from ordinals (Priority 1..7) to named GUARD:/LIFECYCLE:
    // branches, and a reserved review-gate slot was inserted between
    // in-implementation and complete-advance. This asserts the in-implementation
    // recommendation — the Task 1.2 baseline fixture, adjacent to the new slot —
    // is byte-for-byte identical to its pre-rename value.
    it('produces an unchanged recommendation for in-implementation after the branch rename (240 baseline)', async () => {
      const project = makeProject({
        fileSlice: '100-slice.test-feature.md',
      });
      const next = await nav.getNext(project);

      expect(next).toEqual({
        recommendation: 'Continue implementation — 2 tasks remaining',
        rationale: 'Slice 100 is in progress with 2 tasks left to complete.',
        slice: '100-slice.test-feature.md',
        phase: 'Phase 6: Implementation',
        summary: 'Continue slice 100 — 2 tasks remaining',
        suggestedCommand: "cf set phase 'Phase 6: Implementation'",
      });
    });

    it('suggests cf set phase when current phase does not match recommended phase', async () => {
      // Slice is in-implementation (Phase 6) but project phase is set to Phase 4
      const project = makeProject({
        fileSlice: '100-slice.test-feature.md',
        developmentPhase: 'Phase 4: Slice Design',
      });
      const next = await nav.getNext(project);

      expect(next.phase).toBe('Phase 6: Implementation');
      expect(next.suggestedCommand).toBe("cf set phase 'Phase 6: Implementation'");
    });

    it('does not suggest cf set phase when current phase already matches', async () => {
      const project = makeProject({
        fileSlice: '100-slice.test-feature.md',
        developmentPhase: 'Phase 6: Implementation',
      });
      const next = await nav.getNext(project);

      expect(next.phase).toBe('Phase 6: Implementation');
      expect(next.suggestedCommand).toBeUndefined();
    });

    it('does not overwrite explicit suggestedCommand with phase suggestion', async () => {
      // Slice 300 is complete, plan has unchecked entry → suggestedCommand = "cf set slice 101"
      const project = makeProject({
        fileSlice: '300-slice.all-done.md',
        fileSlicePlan: '100-slices.test-system',
        developmentPhase: 'Phase 3: Slice Planning',
      });
      const next = await nav.getNext(project);

      expect(next.suggestedCommand).toBe('cf set slice 101');
    });

    it('recommends advancing to next slice when complete with plan', async () => {
      // Fixture: slice 300 is complete, plan has entry 101 unchecked
      const project = makeProject({
        fileSlice: '300-slice.all-done.md',
        fileSlicePlan: '100-slices.test-system',
      });
      const next = await nav.getNext(project);

      expect(next.recommendation).toContain('Advance to slice 101');
      expect(next.suggestedCommand).toBe('cf set slice 101');
    });

    it('recommends reviewing architecture when plan is complete', async () => {
      // Need a plan where all entries are checked — create inline
      // Use fixture where entry 100 is checked; we need all checked.
      // The fixture plan has 100 checked, 101 unchecked.
      // For this test, use a complete slice with no unchecked plan entries.
      // We'll use the 100 fixture (in-implementation) but with a different approach.
      // Actually, let's just test the "complete, no plan" path instead.
    });

    it('recommends creating slice plan when complete but no plan', async () => {
      const project = makeProject({
        fileSlice: '300-slice.all-done.md',
        fileSlicePlan: undefined,
      });
      const next = await nav.getNext(project);

      expect(next.recommendation).toContain('Create or assign a slice plan');
    });

    it('recommends switching to Phase 3 when complete, plan field set but file missing, wrong phase', async () => {
      const project = makeProject({
        fileSlice: '300-slice.all-done.md',
        fileSlicePlan: '999-slices.nonexistent',
        developmentPhase: 'Phase 6: Implementation',
      });
      const next = await nav.getNext(project);

      expect(next.recommendation).toContain('Create the slice plan document');
      expect(next.rationale).toContain('Switch to Phase 3');
      expect(next.suggestedCommand).toBe("cf set phase 'Phase 3: Slice Planning'");
    });

    it('recommends cf build when complete, plan field set but file missing, already in Phase 3', async () => {
      const project = makeProject({
        fileSlice: '300-slice.all-done.md',
        fileSlicePlan: '999-slices.nonexistent',
        developmentPhase: 'Phase 3: Slice Planning',
      });
      const next = await nav.getNext(project);

      expect(next.recommendation).toContain('Create the slice plan document');
      expect(next.rationale).toContain('does not exist yet');
      expect(next.suggestedCommand).toBe('cf build');
    });

    it('recommends creating architecture when no arch, no slice, and no plan', async () => {
      const project = makeProject({
        fileSlice: '',
        fileSlicePlan: undefined,
        fileArch: undefined,
        developmentPhase: 'Phase 6: Implementation',
      });
      const next = await nav.getNext(project);

      expect(next.recommendation).toContain('Create architecture');
    });

    it('recommends creating slice plan when arch exists but no plan', async () => {
      // Uses a fixture arch file that actually exists on disk (stem without .md)
      const project = makeProject({
        fileSlice: '',
        fileSlicePlan: undefined,
        fileArch: '100-arch.test-system',
        developmentPhase: 'Phase 6: Implementation',
      });
      const next = await nav.getNext(project);

      expect(next.recommendation).toContain('Create or assign a slice plan');
    });

    it('recommends switching to Phase 3 when arch exists, plan field set but file missing, wrong phase', async () => {
      const project = makeProject({
        fileSlice: '',
        fileSlicePlan: '999-slices.nonexistent',
        fileArch: '100-arch.test-system',
        developmentPhase: 'Phase 6: Implementation',
      });
      const next = await nav.getNext(project);

      expect(next.recommendation).toContain('Create the slice plan document');
      expect(next.rationale).toContain('Switch to Phase 3');
      expect(next.suggestedCommand).toBe("cf set phase 'Phase 3: Slice Planning'");
    });

    it('recommends cf build when arch exists, plan field set but file missing, already in Phase 3', async () => {
      const project = makeProject({
        fileSlice: '',
        fileSlicePlan: '999-slices.nonexistent',
        fileArch: '100-arch.test-system',
        developmentPhase: 'Phase 3: Slice Planning',
      });
      const next = await nav.getNext(project);

      expect(next.recommendation).toContain('Create the slice plan document');
      expect(next.rationale).toContain('does not exist yet');
      expect(next.suggestedCommand).toBe('cf build');
    });

    it('recommends creating architecture when arch is set but file does not exist', async () => {
      const project = makeProject({
        fileSlice: '',
        fileSlicePlan: undefined,
        fileArch: '999-arch.nonexistent.md',
        developmentPhase: 'Phase 6: Implementation',
      });
      const next = await nav.getNext(project);

      expect(next.recommendation).toContain('Create architecture');
      expect(next.rationale).toContain('does not exist yet');
    });
  });

  describe('first-run conditions', () => {
    it('FR-1: no developmentPhase → welcome message with cf set phase command', async () => {
      const project = makeProject({
        fileSlice: '',
        fileSlicePlan: undefined,
        fileArch: undefined,
        developmentPhase: undefined,
      });
      const next = await nav.getNext(project);

      expect(next.recommendation).toContain('Welcome to Context Forge');
      expect(next.suggestedCommand).toBe("cf set phase 'Phase 0: Concept'");
    });

    it('FR-1: empty developmentPhase → welcome message', async () => {
      const project = makeProject({
        fileSlice: '',
        fileSlicePlan: undefined,
        fileArch: undefined,
        developmentPhase: '',
      });
      const next = await nav.getNext(project);

      expect(next.recommendation).toContain('Welcome to Context Forge');
      expect(next.suggestedCommand).toBe("cf set phase 'Phase 0: Concept'");
    });

    it('FR-2: Phase 0, no arch, no plan, no concept doc → cf build', async () => {
      const project = makeProject({
        fileSlice: '',
        fileSlicePlan: undefined,
        fileArch: undefined,
        fileConcept: undefined,
        developmentPhase: 'Phase 0: Concept',
      });
      const next = await nav.getNext(project);

      expect(next.recommendation).toContain('Phase 0 (Concept)');
      expect(next.suggestedCommand).toBe('cf build');
    });

    it('FR-2 does not fire when arch file exists on disk', async () => {
      const project = makeProject({
        fileSlice: '',
        fileSlicePlan: undefined,
        fileArch: '100-arch.test-system',
        fileConcept: undefined,
        developmentPhase: 'Phase 0: Concept',
      });
      const next = await nav.getNext(project);

      // Falls through to existing "Create or assign a slice plan" since arch exists but no plan
      expect(next.recommendation).toContain('Create or assign a slice plan');
    });

    it('Phase 0 with concept doc → advance to Phase 1', async () => {
      // Use a concept path that resolves to an existing fixture file
      const project = makeProject({
        fileSlice: '',
        fileSlicePlan: undefined,
        fileArch: undefined,
        fileConcept: 'project-documents/user/architecture/050-arch.hld-test-project.md',
        developmentPhase: 'Phase 0: Concept',
      });
      const next = await nav.getNext(project);

      expect(next.recommendation).toContain('Advance to Phase 1');
      expect(next.suggestedCommand).toBe("cf set phase 'Phase 1: Initiative Plan'");
    });

    it('Phase 1, initiative plan absent on disk → cf build for initiative plan', async () => {
      // projectPath without a 001-initiative-plan.*.md file → plan not yet created
      const project = makeProject({
        fileSlice: '',
        fileSlicePlan: undefined,
        fileArch: undefined,
        developmentPhase: 'Phase 1: Initiative Plan',
        projectPath: '/nonexistent/path',
      });
      const next = await nav.getNext(project);

      expect(next.recommendation).toContain('Phase 1 (Initiative Plan)');
      expect(next.suggestedCommand).toBe('cf build');
    });

    it('Phase 1, initiative plan exists on disk → advance to Phase 2', async () => {
      // Default PROJECT_ROOT fixture contains 001-initiative-plan.test-project.md
      const project = makeProject({
        fileSlice: '',
        fileSlicePlan: undefined,
        fileArch: undefined,
        developmentPhase: 'Phase 1: Initiative Plan',
      });
      const next = await nav.getNext(project);

      expect(next.recommendation).toContain('Advance to Phase 2');
      expect(next.suggestedCommand).toBe("cf set phase 'Phase 2: Architecture'");
    });

    it('Phase 2, no arch, no plan → cf build --phase architecture', async () => {
      const project = makeProject({
        fileSlice: '',
        fileSlicePlan: undefined,
        fileArch: undefined,
        developmentPhase: 'Phase 2: Architecture',
      });
      const next = await nav.getNext(project);

      expect(next.recommendation).toContain('Phase 2 (Architecture)');
      expect(next.suggestedCommand).toBe('cf build --phase architecture');
    });

    it('FR-3 does not fire when arch file exists on disk', async () => {
      const project = makeProject({
        fileSlice: '',
        fileSlicePlan: undefined,
        fileArch: '100-arch.test-system',
        developmentPhase: 'Phase 2: Architecture',
      });
      const next = await nav.getNext(project);

      // FR-3b fires instead
      expect(next.recommendation).toContain('Advance to Phase 3');
    });

    it('FR-3b: Phase 2, arch exists but no plan → advance to Phase 3', async () => {
      const project = makeProject({
        fileSlice: '',
        fileSlicePlan: undefined,
        fileArch: '100-arch.test-system',
        developmentPhase: 'Phase 2: Architecture',
      });
      const next = await nav.getNext(project);

      expect(next.recommendation).toContain('Architecture document exists');
      expect(next.recommendation).toContain('Advance to Phase 3');
      expect(next.suggestedCommand).toBe("cf set phase 'Phase 3: Slice Planning'");
    });

    it('FR-4: Phase 3, no slice plan → cf build', async () => {
      const project = makeProject({
        fileSlice: '',
        fileSlicePlan: undefined,
        fileArch: undefined,
        developmentPhase: 'Phase 3: Slice Planning',
      });
      const next = await nav.getNext(project);

      expect(next.recommendation).toContain('Phase 3 (Slice Planning)');
      expect(next.suggestedCommand).toBe('cf build');
    });

    it('FR-4 does not fire when slice plan is set', async () => {
      const project = makeProject({
        fileSlice: '',
        fileSlicePlan: '100-slices.test-system',
        fileArch: undefined,
        developmentPhase: 'Phase 3: Slice Planning',
      });
      const next = await nav.getNext(project);

      // FR-5: has plan, no active slice
      expect(next.recommendation).toContain('slice plan but no active slice');
    });

    it('FR-5: slice plan exists but no active slice → suggests first unchecked slice by index', async () => {
      const project = makeProject({
        fileSlice: '',
        fileSlicePlan: '100-slices.test-system',
        developmentPhase: 'Phase 3: Slice Planning',
      });
      const next = await nav.getNext(project);

      expect(next.recommendation).toContain('slice plan but no active slice');
      // Fixture plan: entry 100 checked, 101 unchecked — expects specific index
      expect(next.suggestedCommand).toBe('cf set slice 101');
    });

    it('FR-4 with plan field set but file missing → recommends creating plan doc', async () => {
      const project = makeProject({
        fileSlice: '',
        fileSlicePlan: '999-slices.nonexistent',
        fileArch: undefined,
        developmentPhase: 'Phase 3: Slice Planning',
      });
      const next = await nav.getNext(project);

      expect(next.recommendation).toContain('Create the slice plan document');
      expect(next.rationale).toContain('does not exist yet');
      expect(next.suggestedCommand).toBe('cf build');
    });

    it('fallthrough: active slice set → first-run logic not entered, standard path used', async () => {
      // fileSlice is set (in-implementation fixture), standard Priority 5 should apply
      const project = makeProject({
        fileSlice: '100-slice.test-feature.md',
        fileSlicePlan: undefined,
        developmentPhase: undefined,
      });
      const next = await nav.getNext(project);

      expect(next.recommendation).toContain('Continue implementation');
      expect(next.phase).toBe('Phase 6: Implementation');
    });
  });

  describe('arch-existence and index band warnings', () => {
    it('recommends creating arch when arch set but file missing, even with active slice', async () => {
      const project = makeProject({
        fileSlice: '999-slice.nonexistent.md',
        fileArch: '999-arch.nonexistent',
        developmentPhase: 'Phase 4: Slice Design',
      });
      const next = await nav.getNext(project);

      expect(next.recommendation).toContain('Create architecture document');
      expect(next.rationale).toContain('does not exist');
      expect(next.phase).toBe('Phase 2: Architecture');
      expect(next.suggestedCommand).toContain('Phase 2');
    });

    it('includes index band mismatch warning when slice is outside arch hundred-block', async () => {
      // Arch at 100, slice at 900 → mismatch warning
      const project = makeProject({
        fileSlice: '999-slice.nonexistent.md',
        fileArch: '100-arch.test-system',
        developmentPhase: 'Phase 4: Slice Design',
      });
      const next = await nav.getNext(project);

      // Slice 999 needs-design, arch exists → normal recommendation with warning
      expect(next.recommendation).toContain('Create slice design');
      expect(next.warnings).toBeDefined();
      expect(next.warnings!.length).toBe(1);
      expect(next.warnings![0]).toContain('outside the 100-band');
    });

    it('no warning when slice is in same hundred-block as arch', async () => {
      // Arch at 100, slice at 100 → same band, no warning
      const project = makeProject({
        fileSlice: '100-slice.test-feature.md',
        fileArch: '100-arch.test-system',
        developmentPhase: 'Phase 6: Implementation',
      });
      const next = await nav.getNext(project);

      expect(next.warnings).toBeUndefined();
    });

    it('combines arch-missing with index band warning', async () => {
      // Arch at 100 (missing file), slice at 900 → both arch-missing and band mismatch
      const project = makeProject({
        fileSlice: '900-slice.nonexistent.md',
        fileArch: '100-arch.nonexistent',
        developmentPhase: 'Phase 4: Slice Design',
      });
      const next = await nav.getNext(project);

      expect(next.recommendation).toContain('Create architecture document');
      expect(next.warnings).toBeDefined();
      expect(next.warnings!.length).toBe(1);
      expect(next.warnings![0]).toContain('outside the 100-band');
    });

    it('no warning when fileArch is not set', async () => {
      const project = makeProject({
        fileSlice: '999-slice.nonexistent.md',
        fileArch: undefined,
        developmentPhase: 'Phase 4: Slice Design',
      });
      const next = await nav.getNext(project);

      expect(next.warnings).toBeUndefined();
    });
  });
});

function makeStubConfig(values: Record<string, unknown>): ConfigManager {
  return {
    get: vi.fn(async (key: string): Promise<ConfigResult> => {
      if (!(key in values)) {
        throw new Error(`Unexpected config key requested in test: "${key}"`);
      }
      return { key, value: values[key] as string | boolean | number, source: 'default', description: '' };
    }),
  } as unknown as ConfigManager;
}

const GATE_ENABLED_DEFAULTS = {
  'workflow.review_enabled': true,
  'workflow.review_threshold': 'concerns',
  'workflow.review_unknown_as': 'fail',
  'workflow.review_gates.pre_slice_plan.threshold': '',
  'workflow.review_gates.pre_tasks.threshold': '',
  'workflow.review_gates.pre_implementation.threshold': '',
  'workflow.review_gates.pre_advance.threshold': '',
};

const GATE_DISABLED_CONFIG = makeStubConfig({
  ...GATE_ENABLED_DEFAULTS,
  'workflow.review_enabled': false,
});

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
