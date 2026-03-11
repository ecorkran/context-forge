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

// Mock GitWorktreeDiscovery for stale-worktree-path rule tests
const mockListGitWorktrees = vi.fn().mockResolvedValue([]);
vi.mock('../../src/git/index.js', () => ({
  GitWorktreeDiscovery: vi.fn().mockImplementation(() => ({
    listWorktrees: mockListGitWorktrees,
  })),
}));

// Mock existsSync for stale-worktree-path rule tests
const mockExistsSync = vi.fn().mockReturnValue(true);
vi.mock('node:fs', () => ({
  existsSync: (...args: unknown[]) => mockExistsSync(...args),
}));

// Mock the markdownWriter module for fix mode tests
vi.mock('../../src/introspection/writers/markdownWriter.js', () => ({
  updateCheckbox: vi.fn().mockResolvedValue({
    rule: '',
    action: 'update-checkbox',
    filePath: '/fake/plan.md',
    before: '[ ]',
    after: '[x]',
  }),
  updateFrontmatterField: vi.fn().mockResolvedValue({
    rule: '',
    action: 'update-frontmatter',
    filePath: '/fake/slice.md',
    field: 'status',
    before: 'in-progress',
    after: 'complete',
  }),
}));

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
        { index: 165, name: 'test-feature', status: 'in-progress', isChecked: false, lineIndex: 0 },
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
            { index: 165, name: 'test-feature', status: 'complete', isChecked: true, lineIndex: 0 },
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
          entries: [{ index: 165, name: 'test-feature', status: 'complete', isChecked: true, lineIndex: 0 }],
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
            { index: 999, name: 'other-feature', status: 'not-started', isChecked: false, lineIndex: 0 },
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
            { index: 165, name: 'test-feature', status: 'complete', isChecked: true, lineIndex: 0 },
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

    // --- Rule 5: Task file frontmatter status vs. computed completion ---

    it('Rule 5: warns when task file status is not complete but all tasks done', async () => {
      const mock = makeMockIntrospector({
        parseFrontmatter: vi.fn<(path: string) => Promise<FrontmatterResult>>().mockImplementation(async (path: string) => {
          if (path.includes('tasks')) {
            return { filePath: path, found: true, data: { status: 'in_progress' } };
          }
          return { filePath: path, found: true, data: { status: 'in-progress' } };
        }),
      });
      const checker = new ConsistencyChecker(mock);
      const result = await checker.check(makeProject());

      const finding = result.findings.find((f) => f.rule === 'task-file-status');
      expect(finding).toBeDefined();
      expect(finding!.severity).toBe('warning');
      expect(finding!.description).toContain('all tasks are complete');
      expect(finding!.fixable).toBe(true);
      expect(finding!.fixAction?.detail).toEqual({ key: 'status', value: 'complete' });
    });

    it('Rule 5: errors when task file status is complete but tasks incomplete', async () => {
      const mock = makeMockIntrospector({
        parseTaskFile: vi.fn().mockResolvedValue({
          filePath: '/fake/tasks.md',
          items: [{ name: 'Task 1', done: false }],
          totalTasks: 1,
          completedTasks: 0,
          inferredStatus: 'not-started',
        }),
        parseFrontmatter: vi.fn<(path: string) => Promise<FrontmatterResult>>().mockImplementation(async (path: string) => {
          if (path.includes('tasks')) {
            return { filePath: path, found: true, data: { status: 'complete' } };
          }
          return { filePath: path, found: true, data: { status: 'not-started' } };
        }),
      });
      const checker = new ConsistencyChecker(mock);
      const result = await checker.check(makeProject());

      const finding = result.findings.find((f) => f.rule === 'task-file-status');
      expect(finding).toBeDefined();
      expect(finding!.severity).toBe('error');
      expect(finding!.description).toContain('incomplete');
      expect(finding!.fixAction?.detail).toEqual({ key: 'status', value: 'in_progress' });
    });

    it('Rule 5: no finding when task file status matches computed state', async () => {
      const mock = makeMockIntrospector({
        parseFrontmatter: vi.fn<(path: string) => Promise<FrontmatterResult>>().mockImplementation(async (path: string) => {
          if (path.includes('tasks')) {
            return { filePath: path, found: true, data: { status: 'complete' } };
          }
          return { filePath: path, found: true, data: { status: 'complete' } };
        }),
      });
      const checker = new ConsistencyChecker(mock);
      const result = await checker.check(makeProject());

      const finding = result.findings.find((f) => f.rule === 'task-file-status');
      expect(finding).toBeUndefined();
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

  describe('fix()', () => {
    it('applies checkbox fix and populates fixLog', async () => {
      // Default mock: tasks complete, plan unchecked → fixable warning
      const checker = new ConsistencyChecker(makeMockIntrospector());
      const result = await checker.fix(makeProject());

      expect(result.fixed).toBeGreaterThan(0);
      expect(result.fixLog.length).toBeGreaterThan(0);

      const checkboxFix = result.fixLog.find((e) => e.action === 'update-checkbox');
      expect(checkboxFix).toBeDefined();
      expect(checkboxFix!.before).toBe('[ ]');
      expect(checkboxFix!.after).toBe('[x]');
    });

    it('applies frontmatter fix and populates fixLog', async () => {
      const checker = new ConsistencyChecker(makeMockIntrospector());
      const result = await checker.fix(makeProject());

      const fmFix = result.fixLog.find((e) => e.action === 'update-frontmatter');
      expect(fmFix).toBeDefined();
      expect(fmFix!.field).toBe('status');
      expect(fmFix!.before).toBe('in-progress');
      expect(fmFix!.after).toBe('complete');
    });

    it('skips non-fixable findings', async () => {
      const mock = makeMockIntrospector({
        parseSlicePlan: vi.fn().mockResolvedValue({
          filePath: '/fake/plan.md',
          entries: [
            { index: 999, name: 'other', status: 'not-started', isChecked: false, lineIndex: 0 },
          ],
          totalSlices: 1,
          completedSlices: 0,
        }),
        parseTaskFile: vi.fn().mockResolvedValue({
          filePath: '/fake/tasks.md',
          items: [{ name: 'Task 1', done: false }],
          totalTasks: 1,
          completedTasks: 0,
          inferredStatus: 'not-started',
        }),
        parseFrontmatter: vi.fn().mockResolvedValue({
          filePath: '/fake/slice.md',
          found: true,
          data: { status: 'not-started' },
        }),
      });
      const checker = new ConsistencyChecker(mock);
      const result = await checker.fix(makeProject());

      // Only info-level non-fixable findings (missing-artifact)
      const infoFindings = result.findings.filter((f) => !f.fixable);
      expect(infoFindings.length).toBeGreaterThan(0);
      // fixLog should be empty since no fixable findings
      expect(result.fixLog.length).toBe(0);
      expect(result.fixed).toBe(0);
    });

    it('captures fix errors without aborting other fixes', async () => {
      const { updateCheckbox } = await import('../../src/introspection/writers/markdownWriter.js');
      // Make checkbox update fail
      vi.mocked(updateCheckbox).mockRejectedValueOnce(new Error('Permission denied'));

      const checker = new ConsistencyChecker(makeMockIntrospector());
      const result = await checker.fix(makeProject());

      // Should have at least one fix error
      expect(result.fixErrors.length).toBeGreaterThan(0);
      expect(result.fixErrors[0]).toContain('Permission denied');
      // Frontmatter fix should still succeed
      const fmFix = result.fixLog.find((e) => e.action === 'update-frontmatter');
      expect(fmFix).toBeDefined();
    });

    it('fixed count matches applied fixes', async () => {
      const checker = new ConsistencyChecker(makeMockIntrospector());
      const result = await checker.fix(makeProject());

      expect(result.fixed).toBe(result.fixLog.length);
    });

    it('fixLog entries have rule populated from finding', async () => {
      const checker = new ConsistencyChecker(makeMockIntrospector());
      const result = await checker.fix(makeProject());

      for (const entry of result.fixLog) {
        expect(entry.rule).not.toBe('');
        expect(typeof entry.rule).toBe('string');
      }
    });
  });

  describe('checkAll()', () => {
    it('returns empty result when projectPath is missing', async () => {
      const checker = new ConsistencyChecker(makeMockIntrospector());
      const result = await checker.checkAll(makeProject({ projectPath: undefined }));
      expect(result.totalFindings).toBe(0);
    });

    it('returns empty result when no slice plan', async () => {
      const mock = makeMockIntrospector({
        parseSlicePlan: vi.fn().mockRejectedValue(new Error('not found')),
      });
      const checker = new ConsistencyChecker(mock);
      const result = await checker.checkAll(makeProject());
      expect(result.totalFindings).toBe(0);
    });

    it('returns empty result when slice plan has no entries', async () => {
      const mock = makeMockIntrospector({
        parseSlicePlan: vi.fn().mockResolvedValue({
          filePath: '/fake/plan.md',
          entries: [],
          totalSlices: 0,
          completedSlices: 0,
        }),
      });
      const checker = new ConsistencyChecker(mock);
      const result = await checker.checkAll(makeProject());
      expect(result.totalFindings).toBe(0);
    });

    it('iterates all slices and prefixes findings with slice index', async () => {
      const mock = makeMockIntrospector({
        parseSlicePlan: vi.fn().mockResolvedValue({
          filePath: '/fake/plan.md',
          entries: [
            { index: 170, name: 'slice-a', status: 'in-progress', isChecked: false, lineIndex: 0 },
            { index: 171, name: 'slice-b', status: 'in-progress', isChecked: false, lineIndex: 0 },
            { index: 172, name: 'slice-c', status: 'in-progress', isChecked: false, lineIndex: 0 },
          ],
          totalSlices: 3,
          completedSlices: 0,
        }),
        parseFrontmatter: vi.fn().mockResolvedValue({
          filePath: '/fake/slice.md',
          found: true,
          data: { status: 'in-progress' },
        }),
      });

      const checker = new ConsistencyChecker(mock);
      const result = await checker.checkAll(makeProject());

      // Each slice produces findings with [index] prefix
      const prefixed170 = result.findings.filter((f) => f.description.startsWith('[170]'));
      const prefixed171 = result.findings.filter((f) => f.description.startsWith('[171]'));
      const prefixed172 = result.findings.filter((f) => f.description.startsWith('[172]'));
      expect(prefixed170.length).toBeGreaterThan(0);
      expect(prefixed171.length).toBeGreaterThan(0);
      expect(prefixed172.length).toBeGreaterThan(0);
    });

    // --- Rule 6: Duplicate slice index ---

    it('Rule 6: detects duplicate slice indices', async () => {
      const mock = makeMockIntrospector({
        parseSlicePlan: vi.fn().mockResolvedValue({
          filePath: '/fake/plan.md',
          entries: [
            { index: 168, name: 'slice-foo', status: 'in-progress', isChecked: false, lineIndex: 0 },
            { index: 168, name: 'slice-bar', status: 'in-progress', isChecked: false, lineIndex: 0 },
            { index: 169, name: 'slice-baz', status: 'in-progress', isChecked: false, lineIndex: 0 },
          ],
          totalSlices: 3,
          completedSlices: 0,
        }),
        parseFrontmatter: vi.fn().mockResolvedValue({
          filePath: '/fake/slice.md',
          found: true,
          data: { status: 'in-progress' },
        }),
      });

      const checker = new ConsistencyChecker(mock);
      const result = await checker.checkAll(makeProject());

      const dupFinding = result.findings.find((f) => f.rule === 'duplicate-index');
      expect(dupFinding).toBeDefined();
      expect(dupFinding!.severity).toBe('error');
      expect(dupFinding!.fixable).toBe(false);
      expect(dupFinding!.description).toContain('168');
      expect(dupFinding!.description).toContain('slice-foo');
      expect(dupFinding!.description).toContain('slice-bar');
    });

    // --- Rule 7: Plan status vs entries ---

    it('Rule 7: warns when plan "complete" but entries unchecked', async () => {
      const mock = makeMockIntrospector({
        parseSlicePlan: vi.fn().mockResolvedValue({
          filePath: '/fake/plan.md',
          entries: [
            { index: 170, name: 'a', status: 'in-progress', isChecked: true, lineIndex: 0 },
            { index: 171, name: 'b', status: 'in-progress', isChecked: false, lineIndex: 0 },
          ],
          totalSlices: 2,
          completedSlices: 1,
        }),
        parseFrontmatter: vi.fn<(path: string) => Promise<FrontmatterResult>>().mockImplementation(async (path: string) => {
          if (path.includes('plan') || path.includes('slices')) {
            return { filePath: path, found: true, data: { status: 'complete' } };
          }
          return { filePath: path, found: true, data: { status: 'in-progress' } };
        }),
      });

      const checker = new ConsistencyChecker(mock);
      const result = await checker.checkAll(makeProject());

      const finding = result.findings.find((f) => f.rule === 'plan-status-vs-entries');
      expect(finding).toBeDefined();
      expect(finding!.severity).toBe('warning');
      expect(finding!.description).toContain('1/2');
      expect(finding!.fixable).toBe(true);
    });

    it('Rule 7: warns when all entries checked but plan not complete', async () => {
      const mock = makeMockIntrospector({
        parseSlicePlan: vi.fn().mockResolvedValue({
          filePath: '/fake/plan.md',
          entries: [
            { index: 170, name: 'a', status: 'complete', isChecked: true, lineIndex: 0 },
            { index: 171, name: 'b', status: 'complete', isChecked: true, lineIndex: 0 },
          ],
          totalSlices: 2,
          completedSlices: 2,
        }),
        parseFrontmatter: vi.fn<(path: string) => Promise<FrontmatterResult>>().mockImplementation(async (path: string) => {
          if (path.includes('plan') || path.includes('slices')) {
            return { filePath: path, found: true, data: { status: 'in-progress' } };
          }
          return { filePath: path, found: true, data: { status: 'complete' } };
        }),
      });

      const checker = new ConsistencyChecker(mock);
      const result = await checker.checkAll(makeProject());

      const finding = result.findings.find((f) => f.rule === 'plan-status-vs-entries');
      expect(finding).toBeDefined();
      expect(finding!.description).toContain('All 2 entries');
    });

    // --- Rule 9: Missing plan status ---

    it('Rule 9: warns when plan frontmatter has no status field, infers in-progress', async () => {
      const mock = makeMockIntrospector({
        parseSlicePlan: vi.fn().mockResolvedValue({
          filePath: '/fake/plan.md',
          entries: [
            { index: 170, name: 'a', status: 'in-progress', isChecked: false, lineIndex: 0 },
          ],
          totalSlices: 1,
          completedSlices: 0,
        }),
        parseFrontmatter: vi.fn<(path: string) => Promise<FrontmatterResult>>().mockImplementation(async (path: string) => {
          if (path.includes('plan') || path.includes('slices')) {
            return { filePath: path, found: true, data: { docType: 'slice-plan' } };
          }
          return { filePath: path, found: true, data: { status: 'in-progress' } };
        }),
      });
      const checker = new ConsistencyChecker(mock);
      const result = await checker.checkAll(makeProject());

      const finding = result.findings.find((f) => f.rule === 'missing-plan-status');
      expect(finding).toBeDefined();
      expect(finding!.severity).toBe('warning');
      expect(finding!.description).toContain('no "status" field');
      expect(finding!.description).toContain('in-progress');
      expect(finding!.fixable).toBe(true);
      expect(finding!.fixAction?.detail).toEqual({ key: 'status', value: 'in-progress' });
    });

    it('Rule 9: infers complete when all entries are checked', async () => {
      const mock = makeMockIntrospector({
        parseSlicePlan: vi.fn().mockResolvedValue({
          filePath: '/fake/plan.md',
          entries: [
            { index: 170, name: 'a', status: 'complete', isChecked: true, lineIndex: 0 },
          ],
          totalSlices: 1,
          completedSlices: 1,
        }),
        parseFrontmatter: vi.fn<(path: string) => Promise<FrontmatterResult>>().mockImplementation(async (path: string) => {
          if (path.includes('plan') || path.includes('slices')) {
            return { filePath: path, found: true, data: { docType: 'slice-plan' } };
          }
          return { filePath: path, found: true, data: { status: 'in-progress' } };
        }),
      });
      const checker = new ConsistencyChecker(mock);
      const result = await checker.checkAll(makeProject());

      const finding = result.findings.find((f) => f.rule === 'missing-plan-status');
      expect(finding).toBeDefined();
      expect(finding!.description).toContain('complete');
      expect(finding!.fixAction?.detail).toEqual({ key: 'status', value: 'complete' });
    });

    // --- Rule 8: Arch status vs plans ---

    it('Rule 8: warns when arch "complete" but plan has unchecked entries', async () => {
      const mock = makeMockIntrospector({
        parseSlicePlan: vi.fn().mockResolvedValue({
          filePath: '/fake/plan.md',
          entries: [
            { index: 170, name: 'a', status: 'in-progress', isChecked: false, lineIndex: 0 },
          ],
          totalSlices: 1,
          completedSlices: 0,
        }),
        parseFrontmatter: vi.fn<(path: string) => Promise<FrontmatterResult>>().mockImplementation(async (path: string) => {
          if (path.includes('arch')) {
            return { filePath: path, found: true, data: { status: 'complete' } };
          }
          if (path.includes('plan') || path.includes('slices')) {
            return { filePath: path, found: true, data: { status: 'in-progress' } };
          }
          return { filePath: path, found: true, data: { status: 'in-progress' } };
        }),
      });

      const checker = new ConsistencyChecker(mock);
      const result = await checker.checkAll(makeProject({ fileArch: '160-arch.test-system' }));

      const finding = result.findings.find((f) => f.rule === 'arch-status-vs-plans');
      expect(finding).toBeDefined();
      expect(finding!.severity).toBe('warning');
      expect(finding!.description).toContain('complete');
      expect(finding!.description).toContain('unchecked');
      expect(finding!.fixable).toBe(true);
    });

    it('Rule 8: warns when all plans complete but arch not complete', async () => {
      const mock = makeMockIntrospector({
        parseSlicePlan: vi.fn().mockResolvedValue({
          filePath: '/fake/plan.md',
          entries: [
            { index: 170, name: 'a', status: 'complete', isChecked: true, lineIndex: 0 },
          ],
          totalSlices: 1,
          completedSlices: 1,
        }),
        parseFrontmatter: vi.fn<(path: string) => Promise<FrontmatterResult>>().mockImplementation(async (path: string) => {
          if (path.includes('arch')) {
            return { filePath: path, found: true, data: { status: 'in-progress' } };
          }
          if (path.includes('plan') || path.includes('slices')) {
            return { filePath: path, found: true, data: { status: 'complete' } };
          }
          return { filePath: path, found: true, data: { status: 'complete' } };
        }),
      });

      const checker = new ConsistencyChecker(mock);
      const result = await checker.checkAll(makeProject({ fileArch: '160-arch.test-system' }));

      const finding = result.findings.find((f) => f.rule === 'arch-status-vs-plans');
      expect(finding).toBeDefined();
      expect(finding!.description).toContain('All 1 plan entries');
    });
  });

  describe('fixAll()', () => {
    it('applies fixes across multiple slices and returns log', async () => {
      const checker = new ConsistencyChecker(makeMockIntrospector({
        parseSlicePlan: vi.fn().mockResolvedValue({
          filePath: '/fake/plan.md',
          entries: [
            { index: 165, name: 'test-feature', status: 'in-progress', isChecked: false, lineIndex: 0 },
          ],
          totalSlices: 1,
          completedSlices: 0,
        }),
        parseFrontmatter: vi.fn().mockResolvedValue({
          filePath: '/fake/slice.md',
          found: true,
          data: { status: 'in-progress' },
        }),
      }));

      const result = await checker.fixAll(makeProject());

      expect(result.fixed).toBeGreaterThan(0);
      expect(result.fixLog.length).toBe(result.fixed);
      for (const entry of result.fixLog) {
        expect(entry.rule).not.toBe('');
        expect(entry.before).toBeDefined();
        expect(entry.after).toBeDefined();
      }
    });

    it('returns empty result for project with no slice plan', async () => {
      const mock = makeMockIntrospector({
        parseSlicePlan: vi.fn().mockRejectedValue(new Error('not found')),
      });
      const checker = new ConsistencyChecker(mock);
      const result = await checker.fixAll(makeProject());

      expect(result.fixed).toBe(0);
      expect(result.fixLog).toHaveLength(0);
      expect(result.fixErrors).toHaveLength(0);
    });
  });

  describe('stale-worktree-path rule', () => {
    it('flags worktree with missing path', async () => {
      mockExistsSync.mockReturnValue(false);
      mockListGitWorktrees.mockResolvedValue([
        { path: '/fake/project', head: 'abc', bare: false },
      ]);

      const checker = new ConsistencyChecker(makeMockIntrospector());
      const result = await checker.checkAll(makeProject({
        worktrees: [{
          id: 'wt_1', name: 'Stale', indexRange: [200, 299],
          worktreePath: '/fake/deleted-worktree',
        }],
      }));

      const staleFindings = result.findings.filter((f) => f.rule === 'stale-worktree-path');
      expect(staleFindings).toHaveLength(1);
      expect(staleFindings[0].severity).toBe('warning');
      expect(staleFindings[0].description).toContain('no longer exists on disk');
      expect(staleFindings[0].fixable).toBe(false);
    });

    it('flags worktree path not in git worktree list', async () => {
      mockExistsSync.mockReturnValue(true);
      mockListGitWorktrees.mockResolvedValue([
        { path: '/fake/project', head: 'abc', bare: false },
      ]);

      const checker = new ConsistencyChecker(makeMockIntrospector());
      const result = await checker.checkAll(makeProject({
        worktrees: [{
          id: 'wt_1', name: 'Not Git', indexRange: [200, 299],
          worktreePath: '/fake/not-a-worktree',
        }],
      }));

      const staleFindings = result.findings.filter((f) => f.rule === 'stale-worktree-path');
      expect(staleFindings).toHaveLength(1);
      expect(staleFindings[0].description).toContain('not a registered git worktree');
    });

    it('does not flag valid worktree paths', async () => {
      mockExistsSync.mockReturnValue(true);
      mockListGitWorktrees.mockResolvedValue([
        { path: '/fake/project', head: 'abc', bare: false },
        { path: '/fake/worktree', head: 'def', bare: false },
      ]);

      const checker = new ConsistencyChecker(makeMockIntrospector());
      const result = await checker.checkAll(makeProject({
        worktrees: [{
          id: 'wt_1', name: 'Valid', indexRange: [200, 299],
          worktreePath: '/fake/worktree',
        }],
      }));

      const staleFindings = result.findings.filter((f) => f.rule === 'stale-worktree-path');
      expect(staleFindings).toHaveLength(0);
    });

    it('does not flag worktrees with no path', async () => {
      mockListGitWorktrees.mockResolvedValue([]);

      const checker = new ConsistencyChecker(makeMockIntrospector());
      const result = await checker.checkAll(makeProject({
        worktrees: [{
          id: 'wt_1', name: 'Design Only', indexRange: [300, 399],
          // no worktreePath
        }],
      }));

      const staleFindings = result.findings.filter((f) => f.rule === 'stale-worktree-path');
      expect(staleFindings).toHaveLength(0);
    });

    it('produces no findings when project has no worktrees', async () => {
      const checker = new ConsistencyChecker(makeMockIntrospector());
      const result = await checker.checkAll(makeProject({ worktrees: undefined }));

      const staleFindings = result.findings.filter((f) => f.rule === 'stale-worktree-path');
      expect(staleFindings).toHaveLength(0);
    });

    it('degrades gracefully when git discovery fails', async () => {
      mockListGitWorktrees.mockRejectedValue(new Error('git not found'));

      const checker = new ConsistencyChecker(makeMockIntrospector());
      const result = await checker.checkAll(makeProject({
        worktrees: [{
          id: 'wt_1', name: 'Some', indexRange: [200, 299],
          worktreePath: '/fake/worktree',
        }],
      }));

      const staleFindings = result.findings.filter((f) => f.rule === 'stale-worktree-path');
      expect(staleFindings).toHaveLength(0);
    });
  });
});
