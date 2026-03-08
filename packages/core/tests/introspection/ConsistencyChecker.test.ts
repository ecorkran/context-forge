import { describe, it, expect, vi } from 'vitest';
import { ConsistencyChecker } from '../../src/introspection/ConsistencyChecker.js';
import type { IArtifactIntrospector } from '../../src/introspection/interfaces.js';
import type { ProjectData } from '../../src/types/project.js';
import type {
  SlicePlanResult,
  TaskFileResult,
  FrontmatterResult,
  DocumentDetectionResult,
} from '../../src/introspection/types.js';

function makeProject(overrides: Partial<ProjectData> = {}): ProjectData {
  return {
    id: 'test-1',
    name: 'test-project',
    template: 'default',
    fileSlice: '165-slice.test-feature',
    fileTasks: '165-tasks.test-feature',
    fileSlicePlan: '160-slices.test-system',
    instruction: 'implementation',
    createdAt: '2026-01-01',
    updatedAt: '2026-03-07',
    projectPath: '/fake/project',
    ...overrides,
  };
}

function makeMockIntrospector(overrides: Partial<IArtifactIntrospector> = {}): IArtifactIntrospector {
  return {
    parseSlicePlan: vi.fn<(path: string) => Promise<SlicePlanResult>>().mockResolvedValue({
      filePath: '/fake/plan.md',
      entries: [
        { index: 165, name: 'test-feature', status: 'in-progress', isChecked: false },
      ],
      totalSlices: 1,
      completedSlices: 0,
    }),
    parseTaskFile: vi.fn<(paths: string | string[]) => Promise<TaskFileResult>>().mockResolvedValue({
      filePath: '/fake/tasks.md',
      items: [
        { name: 'Task 1', done: true },
        { name: 'Task 2', done: true },
      ],
      totalTasks: 2,
      completedTasks: 2,
      inferredStatus: 'complete',
    }),
    parseFrontmatter: vi.fn<(path: string) => Promise<FrontmatterResult>>().mockResolvedValue({
      filePath: '/fake/slice.md',
      found: true,
      data: { status: 'in-progress' },
    }),
    parseFutureWork: vi.fn().mockResolvedValue({ filePath: '', items: [] }),
    detectDocuments: vi.fn<(projectPath: string, sliceIndex: number) => Promise<DocumentDetectionResult>>().mockResolvedValue({
      sliceDesign: 'project-documents/user/slices/165-slice.test-feature.md',
      taskFile: ['project-documents/user/tasks/165-tasks.test-feature.md'],
      architecture: null,
      slicePlan: null,
    }),
    summarize: vi.fn().mockResolvedValue({ artifacts: {} }),
    ...overrides,
  };
}

describe('ConsistencyChecker', () => {
  describe('check()', () => {
    // --- Graceful handling ---

    it('returns empty result when projectPath is missing', async () => {
      const checker = new ConsistencyChecker(makeMockIntrospector());
      const result = await checker.check(makeProject({ projectPath: undefined }));
      expect(result.totalFindings).toBe(0);
      expect(result.summary).toBe('No inconsistencies found');
    });

    it('returns empty result when fileSlice has no numeric index', async () => {
      const checker = new ConsistencyChecker(makeMockIntrospector());
      const result = await checker.check(makeProject({ fileSlice: 'no-index-slice' }));
      expect(result.totalFindings).toBe(0);
    });

    it('handles missing slice/plan fields without crash', async () => {
      const mock = makeMockIntrospector({
        detectDocuments: vi.fn().mockResolvedValue({
          sliceDesign: null,
          taskFile: null,
          architecture: null,
          slicePlan: null,
        }),
        parseSlicePlan: vi.fn().mockRejectedValue(new Error('not found')),
      });
      const checker = new ConsistencyChecker(mock);
      const result = await checker.check(makeProject());
      // Should not throw — returns partial results
      expect(result.projectPath).toBe('/fake/project');
    });

    // --- Rule 1: Task completion vs. slice plan checkbox ---

    it('Rule 1: warns when tasks complete but slice unchecked', async () => {
      const checker = new ConsistencyChecker(makeMockIntrospector());
      const result = await checker.check(makeProject());

      const finding = result.findings.find(
        (f) => f.rule === 'task-vs-plan' && f.severity === 'warning',
      );
      expect(finding).toBeDefined();
      expect(finding!.description).toContain('Tasks complete');
      expect(finding!.description).toContain('unchecked');
      expect(finding!.fixable).toBe(true);
      expect(finding!.fixAction?.type).toBe('update-checkbox');
    });

    it('Rule 1: errors when slice checked but tasks incomplete', async () => {
      const mock = makeMockIntrospector({
        parseSlicePlan: vi.fn().mockResolvedValue({
          filePath: '/fake/plan.md',
          entries: [
            { index: 165, name: 'test-feature', status: 'complete', isChecked: true },
          ],
          totalSlices: 1,
          completedSlices: 1,
        }),
        parseTaskFile: vi.fn().mockResolvedValue({
          filePath: '/fake/tasks.md',
          items: [{ name: 'Task 1', done: true }, { name: 'Task 2', done: false }],
          totalTasks: 2,
          completedTasks: 1,
          inferredStatus: 'in-progress',
        }),
      });
      const checker = new ConsistencyChecker(mock);
      const result = await checker.check(makeProject());

      const finding = result.findings.find(
        (f) => f.rule === 'task-vs-plan' && f.severity === 'error',
      );
      expect(finding).toBeDefined();
      expect(finding!.description).toContain('checked in plan');
      expect(finding!.description).toContain('incomplete');
      expect(finding!.fixable).toBe(true);
    });

    it('Rule 1: no finding when consistent (both incomplete)', async () => {
      const mock = makeMockIntrospector({
        parseTaskFile: vi.fn().mockResolvedValue({
          filePath: '/fake/tasks.md',
          items: [{ name: 'Task 1', done: false }],
          totalTasks: 1,
          completedTasks: 0,
          inferredStatus: 'not-started',
        }),
      });
      const checker = new ConsistencyChecker(mock);
      const result = await checker.check(makeProject());

      const finding = result.findings.find((f) => f.rule === 'task-vs-plan');
      expect(finding).toBeUndefined();
    });

    // --- Rule 2: Frontmatter status vs. computed state ---

    it('Rule 2: errors when frontmatter "complete" but tasks incomplete', async () => {
      const mock = makeMockIntrospector({
        parseFrontmatter: vi.fn().mockResolvedValue({
          filePath: '/fake/slice.md',
          found: true,
          data: { status: 'complete' },
        }),
        parseTaskFile: vi.fn().mockResolvedValue({
          filePath: '/fake/tasks.md',
          items: [{ name: 'Task 1', done: false }],
          totalTasks: 1,
          completedTasks: 0,
          inferredStatus: 'not-started',
        }),
        parseSlicePlan: vi.fn().mockResolvedValue({
          filePath: '/fake/plan.md',
          entries: [{ index: 165, name: 'test-feature', status: 'complete', isChecked: true }],
          totalSlices: 1,
          completedSlices: 1,
        }),
      });
      const checker = new ConsistencyChecker(mock);
      const result = await checker.check(makeProject());

      const finding = result.findings.find(
        (f) => f.rule === 'frontmatter-vs-computed' && f.severity === 'error',
      );
      expect(finding).toBeDefined();
      expect(finding!.description).toContain('"complete"');
      expect(finding!.description).toContain('incomplete');
      expect(finding!.fixAction?.detail).toEqual({ key: 'status', value: 'in-progress' });
    });

    it('Rule 2: warns when frontmatter "in-progress" but tasks complete', async () => {
      // Default mock has tasks complete and frontmatter in-progress
      const checker = new ConsistencyChecker(makeMockIntrospector());
      const result = await checker.check(makeProject());

      const finding = result.findings.find(
        (f) => f.rule === 'frontmatter-vs-computed' && f.severity === 'warning',
      );
      expect(finding).toBeDefined();
      expect(finding!.description).toContain('"in-progress"');
      expect(finding!.description).toContain('all tasks are complete');
    });

    it('Rule 2: no finding when consistent (both complete)', async () => {
      const mock = makeMockIntrospector({
        parseFrontmatter: vi.fn().mockResolvedValue({
          filePath: '/fake/slice.md',
          found: true,
          data: { status: 'complete' },
        }),
      });
      const checker = new ConsistencyChecker(mock);
      const result = await checker.check(makeProject());

      const finding = result.findings.find((f) => f.rule === 'frontmatter-vs-computed');
      expect(finding).toBeUndefined();
    });

    // --- Rule 3: Missing artifact cross-references ---

    it('Rule 3: info when task file exists but no plan entry', async () => {
      const mock = makeMockIntrospector({
        parseSlicePlan: vi.fn().mockResolvedValue({
          filePath: '/fake/plan.md',
          entries: [
            { index: 999, name: 'other-feature', status: 'not-started', isChecked: false },
          ],
          totalSlices: 1,
          completedSlices: 0,
        }),
      });
      const checker = new ConsistencyChecker(mock);
      const result = await checker.check(makeProject());

      const finding = result.findings.find(
        (f) => f.rule === 'missing-artifact' && f.description.includes('no matching slice plan'),
      );
      expect(finding).toBeDefined();
      expect(finding!.severity).toBe('info');
      expect(finding!.fixable).toBe(false);
    });

    it('Rule 3: info when plan entry exists but no task file', async () => {
      const mock = makeMockIntrospector({
        detectDocuments: vi.fn().mockResolvedValue({
          sliceDesign: 'project-documents/user/slices/165-slice.test-feature.md',
          taskFile: null,
          architecture: null,
          slicePlan: null,
        }),
      });
      const checker = new ConsistencyChecker(mock);
      const result = await checker.check(makeProject());

      const finding = result.findings.find(
        (f) => f.rule === 'missing-artifact' && f.description.includes('no task file'),
      );
      expect(finding).toBeDefined();
      expect(finding!.severity).toBe('info');
      expect(finding!.fixable).toBe(false);
    });

    // --- Rule 4: Plan checkbox vs. slice frontmatter status ---

    it('Rule 4: warns when plan checked but frontmatter not complete', async () => {
      const mock = makeMockIntrospector({
        parseSlicePlan: vi.fn().mockResolvedValue({
          filePath: '/fake/plan.md',
          entries: [
            { index: 165, name: 'test-feature', status: 'complete', isChecked: true },
          ],
          totalSlices: 1,
          completedSlices: 1,
        }),
        parseFrontmatter: vi.fn().mockResolvedValue({
          filePath: '/fake/slice.md',
          found: true,
          data: { status: 'in-progress' },
        }),
      });
      const checker = new ConsistencyChecker(mock);
      const result = await checker.check(makeProject());

      const finding = result.findings.find(
        (f) => f.rule === 'plan-vs-frontmatter' && f.description.includes('checked but frontmatter'),
      );
      expect(finding).toBeDefined();
      expect(finding!.severity).toBe('warning');
      expect(finding!.fixable).toBe(true);
      expect(finding!.fixAction?.type).toBe('update-frontmatter');
    });

    it('Rule 4: warns when frontmatter complete but plan unchecked', async () => {
      const mock = makeMockIntrospector({
        parseFrontmatter: vi.fn().mockResolvedValue({
          filePath: '/fake/slice.md',
          found: true,
          data: { status: 'complete' },
        }),
      });
      const checker = new ConsistencyChecker(mock);
      const result = await checker.check(makeProject());

      const finding = result.findings.find(
        (f) => f.rule === 'plan-vs-frontmatter' && f.description.includes('complete" but slice plan entry is unchecked'),
      );
      expect(finding).toBeDefined();
      expect(finding!.severity).toBe('warning');
      expect(finding!.fixable).toBe(true);
      expect(finding!.fixAction?.type).toBe('update-checkbox');
    });

    // --- Summary format ---

    it('formats summary string correctly', async () => {
      const checker = new ConsistencyChecker(makeMockIntrospector());
      const result = await checker.check(makeProject());

      // Default mock produces warnings (task-vs-plan, frontmatter-vs-computed)
      expect(result.totalFindings).toBeGreaterThan(0);
      expect(result.summary).toMatch(/\d+ finding/);
      expect(result.errors + result.warnings + result.infos).toBe(result.totalFindings);
    });
  });
});
