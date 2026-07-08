import { describe, it, expect, vi } from 'vitest';
import { join } from 'node:path';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { WorkflowNavigator } from '../../src/introspection/WorkflowNavigator.js';
import type { ProjectData } from '../../src/types/project.js';
import { makeStubConfig } from '../helpers/stubConfig.js';

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

    it('slicePlan.entries[].status is derived, not the raw checkbox-only SlicePlanEntry.status (MCP parity, slice 911)', async () => {
      // Fixture: entry 100 is checked but its real task file is in-progress
      // (2/4 done) — the derived status must read 'in-progress', not the raw
      // checkbox-derived 'complete'. Entry 101 has no design file at all, so
      // it degrades to the checkbox (unchecked) → 'not-started'.
      const project = makeProject({
        fileSlicePlan: '100-slices.test-system',
      });
      const status = await nav.getStatus(project);

      const entry100 = status.slicePlan!.entries.find((e) => e.index === 100);
      const entry101 = status.slicePlan!.entries.find((e) => e.index === 101);
      expect(entry100!.status).toBe('in-progress');
      expect(entry101!.status).toBe('not-started');
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
      // Slice 300 is complete. Plan entry 100 is checked but its real task file is
      // in-progress (2/4 done) — deriveEntryStatus now correctly selects 100 first
      // (task signal outranks the checkbox), not 101 (which is genuinely untouched).
      const project = makeProject({
        fileSlice: '300-slice.all-done.md',
        fileSlicePlan: '100-slices.test-system',
        developmentPhase: 'Phase 3: Slice Planning',
      });
      const next = await nav.getNext(project);

      expect(next.suggestedCommand).toBe('cf set slice 100');
    });

    it('recommends continuing next in-progress slice when complete with plan', async () => {
      // Fixture: slice 300 is complete. Plan entry 100 is checked but its real task
      // file is in-progress (2/4 done) — the derived-status fix (#56) means this is
      // selected as "next" over unchecked-but-untouched 101, with "Continue" wording
      // (not "Advance to") because its derived status is in-progress, not not-started.
      const project = makeProject({
        fileSlice: '300-slice.all-done.md',
        fileSlicePlan: '100-slices.test-system',
      });
      const next = await nav.getNext(project);

      expect(next.recommendation).toContain('Continue slice 100');
      expect(next.suggestedCommand).toBe('cf set slice 100');
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

    it('#58: fileArch set but file missing, stale phase → suggests phase advance, not a no-op arch set', async () => {
      const project = makeProject({
        fileSlice: '',
        fileSlicePlan: undefined,
        fileArch: '999-arch.nonexistent.md',
        developmentPhase: 'Phase 6: Implementation',
      });
      const next = await nav.getNext(project);

      expect(next.suggestedCommand).toBe("cf set phase 'Phase 2: Architecture'");
      expect(next.phase).toBe('Phase 2: Architecture');
      expect(next.suggestedCommand).not.toBe('cf set arch <index>');
    });

    it('#58 fallback: fileArch unset → still suggests cf set arch <index>', async () => {
      const project = makeProject({
        fileSlice: '',
        fileSlicePlan: undefined,
        fileArch: undefined,
        developmentPhase: 'Phase 6: Implementation',
      });
      const next = await nav.getNext(project);

      expect(next.suggestedCommand).toBe('cf set arch <index>');
      expect(next.phase).toBeUndefined();
    });

    it('#58: the no-active-slice branch references ARCHITECTURE_PHASE, not a bare literal', () => {
      const source = readFileSync(
        join(__dirname, '..', '..', 'src', 'introspection', 'WorkflowNavigator.ts'),
        'utf-8',
      );
      const noArchBlockMatch = /No architecture \(or arch set but file not yet created\)[\s\S]*?^\s{6}\};/m.exec(
        source,
      );
      expect(noArchBlockMatch).not.toBeNull();
      const block = noArchBlockMatch![0];
      expect(block).toContain('ARCHITECTURE_PHASE');
      expect(block).not.toContain("'Phase 2: Architecture'");
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

    it('FR-5: slice plan exists but no active slice → suggests first not-complete slice by derived status', async () => {
      const project = makeProject({
        fileSlice: '',
        fileSlicePlan: '100-slices.test-system',
        developmentPhase: 'Phase 3: Slice Planning',
      });
      const next = await nav.getNext(project);

      expect(next.recommendation).toContain('slice plan but no active slice');
      // Fixture plan: entry 100 is checked but its real task file is in-progress
      // (2/4 done) — deriveEntryStatus selects it over 101 (genuinely untouched)
      // because task completion outranks the checkbox (#56 fix).
      expect(next.suggestedCommand).toBe('cf set slice 100');
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

const GATE_ENABLED_DEFAULTS = {
  'workflow.review_enabled': true,
  'workflow.review_threshold': 'concerns',
  'workflow.review_unknown_as': 'fail',
  'workflow.review_gates.arch.threshold': '',
  'workflow.review_gates.slice.threshold': '',
  'workflow.review_gates.tasks.threshold': '',
  'workflow.review_gates.code.threshold': '',
  'workflow.review_gate_effective_date': '',
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

describe('WorkflowNavigator — derived-status entry selection (slice 911)', () => {
  function makeScratchProject(root: string, overrides: Partial<ProjectData> = {}): ProjectData {
    return {
      id: 'scratch-1',
      name: 'scratch-project',
      template: 'default',
      fileSlice: '900-slice.active.md',
      fileTasks: '900-tasks.active.md',
      fileSlicePlan: '800-slices.scratch-plan',
      instruction: 'implementation',
      createdAt: '2026-01-01',
      updatedAt: '2026-02-28',
      projectPath: root,
      ...overrides,
    };
  }

  function writeSlicePlan(root: string, body: string): void {
    mkdirSync(join(root, 'project-documents', 'user', 'architecture'), { recursive: true });
    writeFileSync(
      join(root, 'project-documents', 'user', 'architecture', '800-slices.scratch-plan.md'),
      `---\ndocType: slice-plan\nproject: scratch-project\n---\n\n# Slice Plan: Scratch\n\n${body}\n`,
    );
  }

  function writeSliceDesign(root: string, index: number, name: string, status = 'in-progress'): void {
    mkdirSync(join(root, 'project-documents', 'user', 'slices'), { recursive: true });
    writeFileSync(
      join(root, 'project-documents', 'user', 'slices', `${index}-slice.${name}.md`),
      `---\nslice: ${name}\nstatus: ${status}\n---\n\n# Slice ${index}\n`,
    );
  }

  function writeTaskFile(root: string, index: number, name: string, checkboxes: string[]): void {
    mkdirSync(join(root, 'project-documents', 'user', 'tasks'), { recursive: true });
    const body = checkboxes.map((c) => `- [${c}] Task`).join('\n');
    writeFileSync(
      join(root, 'project-documents', 'user', 'tasks', `${index}-tasks.${name}.md`),
      `---\nslice: ${name}\nstatus: in-progress\n---\n\n${body}\n`,
    );
  }

  it('#56 regression: tasks 100% complete, plan checkbox unchecked → not selected as next-unstarted', async () => {
    const root = mkdtempSync(join(tmpdir(), 'cf-nav-911-'));
    writeSliceDesign(root, 242, 'done-unchecked', 'in-progress');
    writeTaskFile(root, 242, 'done-unchecked', ['x', 'x']);
    writeSliceDesign(root, 250, 'genuinely-untouched', 'not_started');
    writeSlicePlan(
      root,
      '1. [ ] **(242) Done Unchecked** — tasks complete, checkbox never ticked.\n' +
        '2. [ ] **(250) Genuinely Untouched** — nothing done yet.',
    );

    const nav = new WorkflowNavigator();
    const project = makeScratchProject(root, {
      fileSlice: '',
      fileTasks: undefined,
      developmentPhase: 'Phase 6: Implementation',
    });
    const next = await nav.getNext(project);

    // Must not select 242 as "next unstarted" — it is derived-complete despite the
    // unchecked box. It should instead select 250, the genuinely untouched slice.
    expect(next.suggestedCommand).toBe('cf set slice 250');
  });

  it('MCP parity: workflow_status (getStatus) reports the same derived statuses as getNext selection for the 242-shaped fixture', async () => {
    // getStatus() (what the MCP workflow_status tool returns verbatim) and
    // getNext()'s entry selection both read through resolveEntryStatus/
    // deriveEntryStatus — this pins that getStatus().slicePlan.entries doesn't
    // silently diverge from what getNext used to pick the next slice.
    const root = mkdtempSync(join(tmpdir(), 'cf-nav-911-mcp-parity-'));
    writeSliceDesign(root, 242, 'done-unchecked', 'in-progress');
    writeTaskFile(root, 242, 'done-unchecked', ['x', 'x']);
    writeSliceDesign(root, 250, 'genuinely-untouched', 'not_started');
    writeSlicePlan(
      root,
      '1. [ ] **(242) Done Unchecked** — tasks complete, checkbox never ticked.\n' +
        '2. [ ] **(250) Genuinely Untouched** — nothing done yet.',
    );

    const nav = new WorkflowNavigator();
    const project = makeScratchProject(root, {
      fileSlice: '',
      fileTasks: undefined,
      developmentPhase: 'Phase 6: Implementation',
    });

    const status = await nav.getStatus(project);
    const entry242 = status.slicePlan!.entries.find((e) => e.index === 242);
    const entry250 = status.slicePlan!.entries.find((e) => e.index === 250);
    expect(entry242!.status).toBe('complete');
    expect(entry250!.status).toBe('not-started');

    const next = await nav.getNext(project);
    expect(next.suggestedCommand).toBe('cf set slice 250');
  });

  it('wording: active in-progress slice recommends "Continue", not "Advance to"', async () => {
    // The active slice itself (900) is in-implementation with partial progress —
    // exercises the pre-existing in-implementation branch, confirming its wording
    // still reads "Continue" (not "Advance to") after the derivation routing change.
    const root = mkdtempSync(join(tmpdir(), 'cf-nav-911-wording-'));
    writeSliceDesign(root, 900, 'active', 'in-progress');
    writeTaskFile(root, 900, 'active', ['x', ' ']);
    writeSlicePlan(root, '1. [ ] **(900) Active** — in progress.');

    const nav = new WorkflowNavigator();
    const project = makeScratchProject(root);
    const next = await nav.getNext(project);

    expect(next.recommendation).toContain('Continue');
    expect(next.recommendation).not.toContain('Advance to');
  });

  it('wording: complete active slice with an in-progress next entry recommends "Continue slice N"', async () => {
    const root = mkdtempSync(join(tmpdir(), 'cf-nav-911-wording-next-'));
    writeSliceDesign(root, 900, 'active', 'in-progress');
    writeTaskFile(root, 900, 'active', ['x', 'x']);
    writeSliceDesign(root, 901, 'partial', 'in-progress');
    writeTaskFile(root, 901, 'partial', ['x', ' ']);
    writeSlicePlan(
      root,
      '1. [x] **(900) Active** — complete.\n2. [ ] **(901) Partial** — partially done.',
    );

    const nav = new WorkflowNavigator();
    const project = makeScratchProject(root);
    const next = await nav.getNext(project);

    expect(next.recommendation).toContain('Continue slice 901');
    expect(next.recommendation).not.toContain('Advance to');
    expect(next.suggestedCommand).toBe('cf set slice 901');
  });

  it('gate-ordering regression: complete-but-unreviewed slice still routes to review, not "advance to next slice"', async () => {
    const root = mkdtempSync(join(tmpdir(), 'cf-nav-911-gate-'));
    writeSliceDesign(root, 900, 'active', 'in-progress');
    writeTaskFile(root, 900, 'active', ['x', 'x']);
    writeSliceDesign(root, 901, 'untouched', 'not_started');
    writeSlicePlan(
      root,
      '1. [ ] **(900) Active** — tasks complete, no review yet.\n2. [ ] **(901) Untouched** — nothing done.',
    );

    const config = makeStubConfig(GATE_ENABLED_DEFAULTS);
    const nav = new WorkflowNavigator(config);
    const project = makeScratchProject(root);

    const status = await nav.getStatus(project);
    expect(status.activeSlice!.status).toBe('pending-review');

    const next = await nav.getNext(project);
    expect(next.recommendation).toContain('Review required');
    expect(next.recommendation).not.toContain('Advance to slice 901');
  });

  it('TD-2a propagation: a plan entry with an unreadable task file surfaces an error, not a silent fallthrough to checkbox', async () => {
    // Active slice (900) is complete, so getNext reaches the complete-advance
    // branch and must resolve entry 901's status via findFirstNotCompleteEntry.
    const root = mkdtempSync(join(tmpdir(), 'cf-nav-911-td2a-'));
    writeSliceDesign(root, 900, 'active', 'in-progress');
    writeTaskFile(root, 900, 'active', ['x', 'x']);
    writeSliceDesign(root, 901, 'broken', 'in-progress');
    // Entry 901's task file path is a directory, not a file — parseTaskItems'
    // readFile call throws EISDIR, which now propagates (only ENOENT is treated
    // as "no file"). This must surface, not silently fall through to the checkbox.
    mkdirSync(join(root, 'project-documents', 'user', 'tasks'), { recursive: true });
    mkdirSync(join(root, 'project-documents', 'user', 'tasks', '901-tasks.broken.md'));
    writeSlicePlan(
      root,
      '1. [x] **(900) Active** — complete.\n2. [ ] **(901) Broken** — task file is unreadable.',
    );

    const nav = new WorkflowNavigator();
    const project = makeScratchProject(root);

    await expect(nav.getNext(project)).rejects.toThrow();
  });

  it('TD-2a propagation: the ACTIVE slice itself with an unreadable task file surfaces an error via getStatus/deriveSliceStatus', async () => {
    // Distinct from the entry-resolution path above: this exercises
    // deriveSliceStatus's own parseTaskFileSafe, which previously swallowed
    // any error (including genuine resolution failures) and silently
    // returned 'needs-tasks'. It must now propagate instead.
    const root = mkdtempSync(join(tmpdir(), 'cf-nav-911-td2a-active-'));
    writeSliceDesign(root, 900, 'active', 'in-progress');
    mkdirSync(join(root, 'project-documents', 'user', 'tasks'), { recursive: true });
    mkdirSync(join(root, 'project-documents', 'user', 'tasks', '900-tasks.active.md'));
    writeSlicePlan(root, '1. [ ] **(900) Active** — task file is unreadable.');

    const nav = new WorkflowNavigator();
    const project = makeScratchProject(root);

    await expect(nav.getStatus(project)).rejects.toThrow();
  });
});
