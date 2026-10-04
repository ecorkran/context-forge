import { describe, it, expect } from 'vitest';
import { WorkflowNavigator } from '../../src/introspection/WorkflowNavigator.js';
import { makeProject } from '../helpers/workflowNavigatorFixtures.js';

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
      expect(status.activeSlice!.taskProgress!.inferredStatus).toBe('in_progress');
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
      expect(entry100!.status).toBe('in_progress');
      expect(entry101!.status).toBe('not_started');
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
});
