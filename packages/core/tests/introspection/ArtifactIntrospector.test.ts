import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { ArtifactIntrospector } from '../../src/introspection/ArtifactIntrospector.js';
import type { ProjectData } from '../../src/types/project.js';

const PROJECT_ROOT = join(__dirname, '..', 'fixtures', 'introspection', 'project');
const FIXTURES = join(__dirname, '..', 'fixtures', 'introspection');

function makeProject(overrides: Partial<ProjectData> = {}): ProjectData {
  return {
    id: 'test-1',
    name: 'test-project',
    template: 'default',
    fileSlice: '100-slice.test-feature.md',
    fileTasks: '100-tasks.test-feature.md',
    instruction: 'implementation',
    isMonorepo: false,
    createdAt: '2026-01-01',
    updatedAt: '2026-02-28',
    ...overrides,
  };
}

describe('ArtifactIntrospector', () => {
  const introspector = new ArtifactIntrospector();

  describe('parseSlicePlan', () => {
    it('delegates correctly and returns typed result', async () => {
      const result = await introspector.parseSlicePlan(
        join(FIXTURES, 'sample-slice-plan.md'),
      );
      expect(result.entries.length).toBeGreaterThan(0);
      expect(result.totalSlices).toBe(5);
    });
  });

  describe('parseTaskFile', () => {
    it('works with a single path', async () => {
      const result = await introspector.parseTaskFile(
        join(FIXTURES, 'sample-tasks.md'),
      );
      expect(result.totalTasks).toBe(8);
    });

    it('works with multiple paths', async () => {
      const result = await introspector.parseTaskFile([
        join(FIXTURES, 'sample-tasks.md'),
        join(FIXTURES, 'all-complete-tasks.md'),
      ]);
      expect(result.totalTasks).toBe(13);
    });
  });

  describe('parseFrontmatter', () => {
    it('delegates correctly', async () => {
      const result = await introspector.parseFrontmatter(
        join(FIXTURES, 'valid-frontmatter.md'),
      );
      expect(result.found).toBe(true);
      expect(result.data.status).toBe('in-progress');
    });
  });

  describe('parseFutureWork', () => {
    it('delegates correctly', async () => {
      const result = await introspector.parseFutureWork(
        join(FIXTURES, 'sample-slice-plan.md'),
      );
      expect(result.items.length).toBeGreaterThan(0);
    });
  });

  describe('detectDocuments', () => {
    it('delegates correctly', async () => {
      const result = await introspector.detectDocuments(PROJECT_ROOT, 100);
      expect(result.sliceDesign).not.toBeNull();
      expect(result.taskFile).not.toBeNull();
    });
  });

  describe('summarize', () => {
    it('returns full summary for fully populated project', async () => {
      const project = makeProject({
        projectPath: PROJECT_ROOT,
        fileSlicePlan: 'project-documents/user/architecture/100-slices.test-system.md',
        fileArch: 'project-documents/user/architecture/100-arch.test-system.md',
      });

      const summary = await introspector.summarize(project);

      // Slice plan summary
      expect(summary.slicePlan).toBeDefined();
      expect(summary.slicePlan!.totalSlices).toBe(1);
      expect(summary.slicePlan!.completedSlices).toBe(1);
      expect(summary.slicePlan!.summary).toBe('1 of 1 slices complete');

      // Task summary
      expect(summary.currentTasks).toBeDefined();
      expect(summary.currentTasks!.totalTasks).toBeGreaterThan(0);
      expect(summary.currentTasks!.summary).toMatch(/\d+ of \d+ tasks done/);

      // Artifact flags
      expect(summary.artifacts.hasSlicePlan).toBe(true);
      expect(summary.artifacts.hasArch).toBe(true);
      expect(summary.artifacts.hasCurrentSliceDesign).toBe(true);
      expect(summary.artifacts.hasCurrentTaskFile).toBe(true);
    });

    it('returns empty introspection for project without projectPath', async () => {
      const project = makeProject({ projectPath: undefined });
      const summary = await introspector.summarize(project);

      expect(summary.slicePlan).toBeUndefined();
      expect(summary.currentTasks).toBeUndefined();
      expect(summary.artifacts.hasSlicePlan).toBe(false);
      expect(summary.artifacts.hasHLD).toBe(false);
      expect(summary.artifacts.hasArch).toBe(false);
    });

    it('returns partial result when only some data is available', async () => {
      const project = makeProject({
        projectPath: PROJECT_ROOT,
        // No fileSlicePlan — should still get task data
      });

      const summary = await introspector.summarize(project);

      expect(summary.slicePlan).toBeUndefined();
      expect(summary.currentTasks).toBeDefined();
      expect(summary.artifacts.hasSlicePlan).toBe(false);
    });

    it('handles missing artifact references gracefully', async () => {
      const project = makeProject({
        projectPath: PROJECT_ROOT,
        fileSlicePlan: 'nonexistent/path.md',
        fileHLD: 'nonexistent/hld.md',
        fileArch: 'nonexistent/arch.md',
        fileSpec: 'nonexistent/spec.md',
      });

      const summary = await introspector.summarize(project);

      // Slice plan parsing should yield no results (file missing)
      expect(summary.slicePlan).toBeUndefined();
      // Artifact existence checks should be false
      expect(summary.artifacts.hasSlicePlan).toBe(false);
      expect(summary.artifacts.hasHLD).toBe(false);
      expect(summary.artifacts.hasArch).toBe(false);
      expect(summary.artifacts.hasSpec).toBe(false);
    });

    it('individual operation failure does not prevent other operations', async () => {
      const project = makeProject({
        projectPath: PROJECT_ROOT,
        fileSlicePlan: 'nonexistent/plan.md', // This will fail
        // fileTasks is valid and should still produce results
      });

      const summary = await introspector.summarize(project);

      // Slice plan failed but tasks should still work
      expect(summary.slicePlan).toBeUndefined();
      expect(summary.currentTasks).toBeDefined();
    });
  });
});
