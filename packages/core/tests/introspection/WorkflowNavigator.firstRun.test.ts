import { describe, it, expect } from 'vitest';
import { WorkflowNavigator } from '../../src/introspection/WorkflowNavigator.js';
import { PROJECT_ROOT, makeProject } from '../helpers/workflowNavigatorFixtures.js';

describe('WorkflowNavigator', () => {
  const nav = new WorkflowNavigator();

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
});
