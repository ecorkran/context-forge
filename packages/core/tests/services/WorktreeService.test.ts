import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { ProjectData, CreateProjectData, UpdateProjectData } from '../../src/types/project.js';
import type { IProjectStore } from '../../src/storage/interfaces.js';
import { WorktreeService } from '../../src/services/WorktreeService.js';
import { createTestProjectData } from '../helpers/testData.js';

/**
 * In-memory mock of IProjectStore for testing WorktreeService.
 */
class MockProjectStore implements IProjectStore {
  projects: ProjectData[] = [];

  async getAll(): Promise<ProjectData[]> {
    return [...this.projects];
  }

  async getById(id: string): Promise<ProjectData | undefined> {
    return this.projects.find((p) => p.id === id);
  }

  async create(data: CreateProjectData): Promise<ProjectData> {
    const project: ProjectData = {
      ...data,
      id: `project_mock_${Date.now()}`,
      fileTasks: data.fileTasks ?? '',
      instruction: data.instruction ?? '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.projects.push(project);
    return project;
  }

  async update(id: string, updates: UpdateProjectData): Promise<void> {
    const index = this.projects.findIndex((p) => p.id === id);
    if (index === -1) throw new Error(`Project not found: ${id}`);
    this.projects[index] = {
      ...this.projects[index],
      ...updates,
      updatedAt: new Date().toISOString(),
    };
  }

  async delete(id: string): Promise<void> {
    this.projects = this.projects.filter((p) => p.id !== id);
  }
}

/** Project with workflow fields populated — triggers forward migration on first addWorktree. */
function createProjectWithWorkflowFields(overrides?: Partial<ProjectData>): ProjectData {
  return createTestProjectData({
    id: 'proj_1',
    developmentPhase: 'Phase 6: Implementation',
    fileSlice: '100-slice.auth',
    fileTasks: '100-tasks.auth',
    instruction: 'implementation',
    workType: 'start',
    fileArch: 'arch/100-arch.api.md',
    fileSlicePlan: 'slices/100-slices.api.md',
    projectPath: '/projects/my-app',
    ...overrides,
  });
}

/** Project with empty workflow fields — no migration triggered. */
function createEmptyProject(overrides?: Partial<ProjectData>): ProjectData {
  return createTestProjectData({
    id: 'proj_1',
    developmentPhase: '',
    fileSlice: '',
    fileTasks: '',
    instruction: '',
    workType: undefined,
    fileArch: '',
    fileSlicePlan: '',
    projectPath: '/projects/my-app',
    ...overrides,
  });
}

describe('WorktreeService', () => {
  let store: MockProjectStore;
  let service: WorktreeService;

  beforeEach(() => {
    store = new MockProjectStore();
    service = new WorktreeService(store);
    // Use empty project for CRUD tests to avoid triggering forward migration
    store.projects.push(createEmptyProject());
  });

  describe('addWorktree', () => {
    it('creates worktree with wt_ prefixed ID', async () => {
      const result = await service.addWorktree('proj_1', {
        name: 'API Foundation',
        indexRange: [100, 199],
      });
      expect(result.worktree.id).toMatch(/^wt_\d+_[a-z0-9]+$/);
    });

    it('stores name, indexRange, and worktreePath correctly', async () => {
      const result = await service.addWorktree('proj_1', {
        name: 'API Foundation',
        indexRange: [100, 199],
        worktreePath: '/projects/my-app-api',
      });
      expect(result.worktree.name).toBe('API Foundation');
      expect(result.worktree.indexRange).toEqual([100, 199]);
      expect(result.worktree.worktreePath).toBe('/projects/my-app-api');
    });

    it('leaves workflow fields undefined on creation', async () => {
      const result = await service.addWorktree('proj_1', {
        name: 'API Foundation',
        indexRange: [100, 199],
      });
      expect(result.worktree.developmentPhase).toBeUndefined();
      expect(result.worktree.activeSlice).toBeUndefined();
      expect(result.worktree.activeTaskFile).toBeUndefined();
      expect(result.worktree.instruction).toBeUndefined();
      expect(result.worktree.workType).toBeUndefined();
    });

    it('throws for negative range values', async () => {
      await expect(
        service.addWorktree('proj_1', { name: 'Bad', indexRange: [-1, 99] }),
      ).rejects.toThrow('non-negative');
    });

    it('throws for start > end', async () => {
      await expect(
        service.addWorktree('proj_1', { name: 'Bad', indexRange: [200, 100] }),
      ).rejects.toThrow('start must be <= end');
    });

    it('throws for non-integer range values', async () => {
      await expect(
        service.addWorktree('proj_1', { name: 'Bad', indexRange: [1.5, 99] }),
      ).rejects.toThrow('integers');
    });

    it('second addWorktree appends to existing array', async () => {
      await service.addWorktree('proj_1', { name: 'First', indexRange: [100, 199] });
      await service.addWorktree('proj_1', { name: 'Second', indexRange: [200, 299] });

      const worktrees = await service.listWorktrees('proj_1');
      expect(worktrees).toHaveLength(2);
      expect(worktrees[0].name).toBe('First');
      expect(worktrees[1].name).toBe('Second');
    });
  });

  describe('getWorktree', () => {
    it('returns worktree by ID', async () => {
      const { worktree } = await service.addWorktree('proj_1', {
        name: 'API',
        indexRange: [100, 199],
      });
      const found = await service.getWorktree('proj_1', worktree.id);
      expect(found).toBeDefined();
      expect(found!.name).toBe('API');
    });

    it('returns undefined for unknown ID', async () => {
      const found = await service.getWorktree('proj_1', 'wt_nonexistent');
      expect(found).toBeUndefined();
    });
  });

  describe('getWorktreeByName', () => {
    it('matches case-insensitively', async () => {
      await service.addWorktree('proj_1', { name: 'API Foundation', indexRange: [100, 199] });
      const found = await service.getWorktreeByName('proj_1', 'api foundation');
      expect(found).toBeDefined();
      expect(found!.name).toBe('API Foundation');
    });

    it('returns undefined for unknown name', async () => {
      const found = await service.getWorktreeByName('proj_1', 'nonexistent');
      expect(found).toBeUndefined();
    });
  });

  describe('listWorktrees', () => {
    it('returns all worktrees', async () => {
      await service.addWorktree('proj_1', { name: 'A', indexRange: [100, 199] });
      await service.addWorktree('proj_1', { name: 'B', indexRange: [200, 299] });
      const list = await service.listWorktrees('proj_1');
      expect(list).toHaveLength(2);
    });

    it('returns empty array for project with no worktrees', async () => {
      const list = await service.listWorktrees('proj_1');
      expect(list).toEqual([]);
    });
  });

  describe('updateWorktree', () => {
    it('applies partial updates', async () => {
      const { worktree } = await service.addWorktree('proj_1', {
        name: 'API',
        indexRange: [100, 199],
      });
      const updated = await service.updateWorktree('proj_1', worktree.id, {
        name: 'API v2',
        activeSlice: '105-slice.endpoints',
      });
      expect(updated.name).toBe('API v2');
      expect(updated.activeSlice).toBe('105-slice.endpoints');
      expect(updated.indexRange).toEqual([100, 199]);
    });

    it('preserves id even if updates object has id-like changes', async () => {
      const { worktree } = await service.addWorktree('proj_1', {
        name: 'API',
        indexRange: [100, 199],
      });
      const updated = await service.updateWorktree('proj_1', worktree.id, {
        name: 'Changed',
      });
      expect(updated.id).toBe(worktree.id);
    });

    it('revalidates index range on range change', async () => {
      const { worktree } = await service.addWorktree('proj_1', {
        name: 'API',
        indexRange: [100, 199],
      });
      await expect(
        service.updateWorktree('proj_1', worktree.id, { indexRange: [300, 200] }),
      ).rejects.toThrow('start must be <= end');
    });

    it('throws for unknown worktree ID', async () => {
      await expect(
        service.updateWorktree('proj_1', 'wt_nonexistent', { name: 'X' }),
      ).rejects.toThrow('Worktree not found');
    });
  });

  describe('removeWorktree', () => {
    it('removes worktree by ID', async () => {
      const { worktree } = await service.addWorktree('proj_1', {
        name: 'API',
        indexRange: [100, 199],
      });
      const result = await service.removeWorktree('proj_1', worktree.id);
      expect(result.removed.id).toBe(worktree.id);

      const list = await service.listWorktrees('proj_1');
      expect(list).toHaveLength(0);
    });

    it('throws for unknown worktree ID', async () => {
      await expect(
        service.removeWorktree('proj_1', 'wt_nonexistent'),
      ).rejects.toThrow('Worktree not found');
    });
  });

  describe('forward migration', () => {
    beforeEach(() => {
      // Replace the empty project with one that has workflow fields
      store.projects = [createProjectWithWorkflowFields()];
    });

    it('creates default worktree with mapped fields on first addWorktree', async () => {
      const result = await service.addWorktree('proj_1', {
        name: 'API',
        indexRange: [300, 399],
      });

      expect(result.migrated).toBe(true);
      const worktrees = await service.listWorktrees('proj_1');
      expect(worktrees).toHaveLength(2);

      const defaultWt = worktrees[0];
      expect(defaultWt.name).toBe('default');
      // Default starts at [100, 799] but chops to [100, 299] because new range is [300, 399]
      expect(defaultWt.indexRange).toEqual([100, 299]);
      expect(defaultWt.worktreePath).toBe('/projects/my-app');
      expect(defaultWt.activeSlice).toBe('100-slice.auth');
      expect(defaultWt.activeTaskFile).toBe('100-tasks.auth');
      expect(defaultWt.instruction).toBe('implementation');
      expect(defaultWt.workType).toBe('start');
      expect(defaultWt.developmentPhase).toBe('Phase 6: Implementation');
      expect(defaultWt.archDoc).toBe('arch/100-arch.api.md');
      expect(defaultWt.slicePlan).toBe('slices/100-slices.api.md');
    });

    it('clears project workflow fields after forward migration', async () => {
      await service.addWorktree('proj_1', { name: 'API', indexRange: [300, 399] });

      const project = await store.getById('proj_1');
      expect(project!.developmentPhase).toBe('');
      expect(project!.fileSlice).toBe('');
      expect(project!.fileTasks).toBe('');
      expect(project!.instruction).toBe('');
      expect(project!.fileArch).toBe('');
      expect(project!.fileSlicePlan).toBe('');
    });

    it('does NOT create default when project has no workflow fields', async () => {
      store.projects = [createEmptyProject()];
      const result = await service.addWorktree('proj_1', {
        name: 'API',
        indexRange: [100, 199],
      });

      expect(result.migrated).toBe(false);
      const worktrees = await service.listWorktrees('proj_1');
      expect(worktrees).toHaveLength(1);
      expect(worktrees[0].name).toBe('API');
    });

    it('creates default with only populated fields mapped for partially-set project', async () => {
      store.projects = [createTestProjectData({
        id: 'proj_1',
        developmentPhase: 'Phase 4',
        fileSlice: '150-slice.design',
        fileTasks: '',
        instruction: '',
        workType: undefined,
        fileArch: '',
        fileSlicePlan: '',
        projectPath: '/projects/partial',
      })];

      const result = await service.addWorktree('proj_1', {
        name: 'UX',
        indexRange: [200, 299],
      });

      expect(result.migrated).toBe(true);
      const worktrees = await service.listWorktrees('proj_1');
      const defaultWt = worktrees[0];
      expect(defaultWt.developmentPhase).toBe('Phase 4');
      expect(defaultWt.activeSlice).toBe('150-slice.design');
      expect(defaultWt.activeTaskFile).toBeUndefined();
      expect(defaultWt.instruction).toBeUndefined();
    });

    it('second addWorktree does not trigger migration', async () => {
      await service.addWorktree('proj_1', { name: 'First', indexRange: [300, 399] });
      const result = await service.addWorktree('proj_1', { name: 'Second', indexRange: [400, 499] });

      expect(result.migrated).toBe(false);
      const worktrees = await service.listWorktrees('proj_1');
      // Default + First + Second = 3
      expect(worktrees).toHaveLength(3);
    });
  });

  describe('reverse migration', () => {
    it('restores worktree fields to project when last worktree removed', async () => {
      store.projects = [createEmptyProject()];
      const { worktree } = await service.addWorktree('proj_1', {
        name: 'API',
        indexRange: [100, 199],
      });
      // Set some workflow fields on the worktree
      await service.updateWorktree('proj_1', worktree.id, {
        activeSlice: '105-slice.endpoints',
        activeTaskFile: '105-tasks.endpoints',
        developmentPhase: 'Phase 6',
        instruction: 'implementation',
      });

      const result = await service.removeWorktree('proj_1', worktree.id);
      expect(result.migrated).toBe(true);

      const project = await store.getById('proj_1');
      expect(project!.fileSlice).toBe('105-slice.endpoints');
      expect(project!.fileTasks).toBe('105-tasks.endpoints');
      expect(project!.developmentPhase).toBe('Phase 6');
      expect(project!.instruction).toBe('implementation');
      expect(project!.worktrees).toBeUndefined();
    });

    it('does NOT trigger reverse migration when other worktrees remain', async () => {
      store.projects = [createEmptyProject()];
      const { worktree: wt1 } = await service.addWorktree('proj_1', {
        name: 'A',
        indexRange: [100, 199],
      });
      await service.addWorktree('proj_1', { name: 'B', indexRange: [200, 299] });

      const result = await service.removeWorktree('proj_1', wt1.id);
      expect(result.migrated).toBe(false);

      const worktrees = await service.listWorktrees('proj_1');
      expect(worktrees).toHaveLength(1);
      expect(worktrees[0].name).toBe('B');
    });

    it('reverse migration with empty workflow fields leaves project fields empty', async () => {
      store.projects = [createEmptyProject()];
      const { worktree } = await service.addWorktree('proj_1', {
        name: 'Empty',
        indexRange: [100, 199],
      });
      // Don't set any workflow fields — leave them undefined

      const result = await service.removeWorktree('proj_1', worktree.id);
      expect(result.migrated).toBe(true);

      const project = await store.getById('proj_1');
      expect(project!.fileSlice).toBe('');
      expect(project!.worktrees).toBeUndefined();
    });
  });

  describe('migration atomicity', () => {
    it('calls store.update exactly once for addWorktree with migration', async () => {
      store.projects = [createProjectWithWorkflowFields()];
      const spy = vi.spyOn(store, 'update');

      await service.addWorktree('proj_1', { name: 'API', indexRange: [300, 399] });

      expect(spy).toHaveBeenCalledTimes(1);
    });

    it('calls store.update exactly once for removeWorktree with migration', async () => {
      store.projects = [createEmptyProject()];
      const { worktree } = await service.addWorktree('proj_1', {
        name: 'API',
        indexRange: [100, 199],
      });
      const spy = vi.spyOn(store, 'update');
      spy.mockClear();

      await service.removeWorktree('proj_1', worktree.id);

      expect(spy).toHaveBeenCalledTimes(1);
    });
  });

  describe('findOverlaps', () => {
    it('no overlap for adjacent ranges', async () => {
      await service.addWorktree('proj_1', { name: 'A', indexRange: [100, 199] });
      const overlaps = await service.findOverlaps('proj_1', [200, 299]);
      expect(overlaps).toEqual([]);
    });

    it('overlap for touching ranges', async () => {
      await service.addWorktree('proj_1', { name: 'A', indexRange: [100, 199] });
      const overlaps = await service.findOverlaps('proj_1', [199, 299]);
      expect(overlaps).toHaveLength(1);
      expect(overlaps[0].overlapStart).toBe(199);
      expect(overlaps[0].overlapEnd).toBe(199);
    });

    it('overlap for fully contained range', async () => {
      await service.addWorktree('proj_1', { name: 'A', indexRange: [100, 199] });
      const overlaps = await service.findOverlaps('proj_1', [120, 150]);
      expect(overlaps).toHaveLength(1);
      expect(overlaps[0].overlapStart).toBe(120);
      expect(overlaps[0].overlapEnd).toBe(150);
    });

    it('overlap for partial overlap', async () => {
      await service.addWorktree('proj_1', { name: 'A', indexRange: [100, 199] });
      const overlaps = await service.findOverlaps('proj_1', [150, 249]);
      expect(overlaps).toHaveLength(1);
      expect(overlaps[0].overlapStart).toBe(150);
      expect(overlaps[0].overlapEnd).toBe(199);
      expect(overlaps[0].existingWorktreeName).toBe('A');
    });

    it('excludeId correctly excludes the worktree being updated', async () => {
      const { worktree } = await service.addWorktree('proj_1', { name: 'A', indexRange: [100, 199] });
      const overlaps = await service.findOverlaps('proj_1', [100, 199], worktree.id);
      expect(overlaps).toEqual([]);
    });

    it('addWorktree returns overlaps array in result', async () => {
      await service.addWorktree('proj_1', { name: 'A', indexRange: [100, 199] });
      const result = await service.addWorktree('proj_1', { name: 'B', indexRange: [150, 249] });
      expect(result.overlaps).toHaveLength(1);
      expect(result.overlaps[0].overlapStart).toBe(150);
      expect(result.overlaps[0].overlapEnd).toBe(199);
    });

    it('addWorktree still succeeds when overlaps exist', async () => {
      await service.addWorktree('proj_1', { name: 'A', indexRange: [100, 199] });
      const result = await service.addWorktree('proj_1', { name: 'B', indexRange: [150, 249] });
      expect(result.worktree.name).toBe('B');

      const list = await service.listWorktrees('proj_1');
      expect(list).toHaveLength(2);
    });
  });

  describe('validateWorktreePaths', () => {
    const gitWorktrees = [
      { path: '/projects/my-app', head: 'abc123', bare: false },
      { path: '/projects/my-app-api', head: 'def456', bare: false },
    ];

    it('returns no-path for worktree without worktreePath', async () => {
      await service.addWorktree('proj_1', {
        name: 'Design Only',
        indexRange: [300, 399],
        // no worktreePath
      });

      const statuses = await service.validateWorktreePaths('proj_1', gitWorktrees, () => true);
      expect(statuses).toHaveLength(1);
      expect(statuses[0].status).toBe('no-path');
      expect(statuses[0].worktreeName).toBe('Design Only');
      expect(statuses[0].worktreePath).toBeUndefined();
    });

    it('returns missing for worktree with non-existent path', async () => {
      await service.addWorktree('proj_1', {
        name: 'Stale',
        indexRange: [200, 299],
        worktreePath: '/projects/deleted-branch',
      });

      const statuses = await service.validateWorktreePaths('proj_1', gitWorktrees, () => false);
      expect(statuses).toHaveLength(1);
      expect(statuses[0].status).toBe('missing');
      expect(statuses[0].worktreePath).toBe('/projects/deleted-branch');
    });

    it('returns not-a-worktree for path that exists but is not in git list', async () => {
      await service.addWorktree('proj_1', {
        name: 'Not Git',
        indexRange: [200, 299],
        worktreePath: '/projects/some-other-dir',
      });

      const statuses = await service.validateWorktreePaths('proj_1', gitWorktrees, () => true);
      expect(statuses).toHaveLength(1);
      expect(statuses[0].status).toBe('not-a-worktree');
    });

    it('returns valid for path that exists and is in git list', async () => {
      await service.addWorktree('proj_1', {
        name: 'API',
        indexRange: [100, 199],
        worktreePath: '/projects/my-app-api',
      });

      const statuses = await service.validateWorktreePaths('proj_1', gitWorktrees, () => true);
      expect(statuses).toHaveLength(1);
      expect(statuses[0].status).toBe('valid');
    });

    it('returns correct mixed statuses for multiple worktrees', async () => {
      await service.addWorktree('proj_1', {
        name: 'Valid',
        indexRange: [100, 199],
        worktreePath: '/projects/my-app',
      });
      await service.addWorktree('proj_1', {
        name: 'Missing',
        indexRange: [200, 299],
        worktreePath: '/projects/deleted',
      });
      await service.addWorktree('proj_1', {
        name: 'No Path',
        indexRange: [300, 399],
      });

      const pathExistsFn = (p: string) => p !== '/projects/deleted';
      const statuses = await service.validateWorktreePaths('proj_1', gitWorktrees, pathExistsFn);
      expect(statuses).toHaveLength(3);
      expect(statuses[0].status).toBe('valid');
      expect(statuses[1].status).toBe('missing');
      expect(statuses[2].status).toBe('no-path');
    });

    it('returns empty array for project with no worktrees', async () => {
      const statuses = await service.validateWorktreePaths('proj_1', gitWorktrees, () => true);
      expect(statuses).toEqual([]);
    });
  });

  describe('chopDefaultRange', () => {
    /** Set up a project with an existing default worktree at the given range. */
    async function setupDefault(range: [number, number], artifacts?: Partial<WorktreeContext>): Promise<void> {
      store.projects = [createEmptyProject({ worktrees: [{
        id: 'wt_default',
        name: 'default',
        indexRange: range,
        worktreePath: '/projects/my-app',
        ...artifacts,
      }] })];
    }

    it('new worktree [300, 399] with default [100, 799] → default shrinks to [100, 299]', async () => {
      await setupDefault([100, 799]);
      await service.addWorktree('proj_1', { name: 'Pipeline', indexRange: [300, 399] });
      const worktrees = await service.listWorktrees('proj_1');
      const defaultWt = worktrees.find((wt) => wt.name === 'default')!;
      expect(defaultWt.indexRange).toEqual([100, 299]);
    });

    it('new worktree [100, 199] with default [100, 799] → default shrinks to [200, 799]', async () => {
      await setupDefault([100, 799]);
      await service.addWorktree('proj_1', { name: 'Core', indexRange: [100, 199] });
      const worktrees = await service.listWorktrees('proj_1');
      const defaultWt = worktrees.find((wt) => wt.name === 'default')!;
      expect(defaultWt.indexRange).toEqual([200, 799]);
    });

    it('new worktree [400, 599] with default [100, 799] → default shrinks to [100, 399] (prefer lower)', async () => {
      await setupDefault([100, 799]);
      await service.addWorktree('proj_1', { name: 'Middle', indexRange: [400, 599] });
      const worktrees = await service.listWorktrees('proj_1');
      const defaultWt = worktrees.find((wt) => wt.name === 'default')!;
      expect(defaultWt.indexRange).toEqual([100, 399]);
    });

    it('new worktree [100, 799] covers entire default → default becomes [0, 0] sentinel with warning', async () => {
      await setupDefault([100, 799]);
      const result = await service.addWorktree('proj_1', { name: 'Everything', indexRange: [100, 799] });
      const worktrees = await service.listWorktrees('proj_1');
      const defaultWt = worktrees.find((wt) => wt.name === 'default')!;
      expect(defaultWt.indexRange).toEqual([0, 0]);
      expect(result.chopWarning).toContain('no remaining index range');
    });

    it('no overlap when new range is outside default → no chop', async () => {
      await setupDefault([100, 299]);
      await service.addWorktree('proj_1', { name: 'Far', indexRange: [500, 599] });
      const worktrees = await service.listWorktrees('proj_1');
      const defaultWt = worktrees.find((wt) => wt.name === 'default')!;
      expect(defaultWt.indexRange).toEqual([100, 299]);
    });

    it('second chop — default [100, 299], new [200, 299] → default shrinks to [100, 199]', async () => {
      await setupDefault([100, 299]);
      await service.addWorktree('proj_1', { name: 'Second', indexRange: [200, 299] });
      const worktrees = await service.listWorktrees('proj_1');
      const defaultWt = worktrees.find((wt) => wt.name === 'default')!;
      expect(defaultWt.indexRange).toEqual([100, 199]);
    });

    it('updateWorktree with new range triggers chop on default', async () => {
      await setupDefault([100, 799]);
      // Add a non-default worktree with non-overlapping range first
      const { worktree } = await service.addWorktree('proj_1', { name: 'Other', indexRange: [900, 999] });
      // Now update its range to overlap default
      await service.updateWorktree('proj_1', worktree.id, { indexRange: [300, 399] });
      const worktrees = await service.listWorktrees('proj_1');
      const defaultWt = worktrees.find((wt) => wt.name === 'default')!;
      expect(defaultWt.indexRange).toEqual([100, 299]);
    });

    it('non-default worktrees are never chopped', async () => {
      // Set up two non-default worktrees with overlapping ranges
      store.projects = [createEmptyProject({ worktrees: [
        { id: 'wt_a', name: 'Alpha', indexRange: [100, 299] as [number, number], worktreePath: '/a' },
      ] })];
      await service.addWorktree('proj_1', { name: 'Beta', indexRange: [200, 399] });
      const worktrees = await service.listWorktrees('proj_1');
      const alpha = worktrees.find((wt) => wt.name === 'Alpha')!;
      // Alpha's range should be unchanged — only default gets chopped
      expect(alpha.indexRange).toEqual([100, 299]);
    });
  });

  describe('rangeOverride', () => {
    async function setupDefault(range: [number, number]): Promise<void> {
      store.projects = [createEmptyProject({ worktrees: [{
        id: 'wt_default',
        name: 'default',
        indexRange: range,
        worktreePath: '/projects/my-app',
      }] })];
    }

    it('addWorktree with override: true skips chopDefaultRange', async () => {
      await setupDefault([100, 799]);
      const result = await service.addWorktree('proj_1', {
        name: 'Cross',
        indexRange: [300, 399],
        override: true,
      });
      expect(result.worktree.rangeOverride).toBe(true);
      const worktrees = await service.listWorktrees('proj_1');
      const defaultWt = worktrees.find((wt) => wt.name === 'default')!;
      // Default range should be unchanged — chop was skipped
      expect(defaultWt.indexRange).toEqual([100, 799]);
    });

    it('addWorktree with override: true still returns overlaps', async () => {
      await setupDefault([100, 799]);
      const result = await service.addWorktree('proj_1', {
        name: 'Cross',
        indexRange: [300, 399],
        override: true,
      });
      // findOverlaps still runs — advisory only
      expect(result.overlaps).toHaveLength(1);
      expect(result.overlaps[0].existingWorktreeName).toBe('default');
    });

    it('addWorktree with override: true on first worktree (migration path)', async () => {
      store.projects = [createProjectWithWorkflowFields()];
      const result = await service.addWorktree('proj_1', {
        name: 'Cross',
        indexRange: [100, 199],
        override: true,
      });
      expect(result.migrated).toBe(true);
      expect(result.worktree.rangeOverride).toBe(true);
      const worktrees = await service.listWorktrees('proj_1');
      const defaultWt = worktrees.find((wt) => wt.name === 'default')!;
      // Default range NOT chopped — override skips chop
      expect(defaultWt.indexRange).toEqual([100, 799]);
    });

    it('updateWorktree with rangeOverride: true skips chop', async () => {
      await setupDefault([100, 799]);
      const { worktree } = await service.addWorktree('proj_1', {
        name: 'Other',
        indexRange: [900, 999],
      });
      // Update range to overlap default, with rangeOverride
      const updated = await service.updateWorktree('proj_1', worktree.id, {
        indexRange: [300, 399],
        rangeOverride: true,
      });
      expect(updated.rangeOverride).toBe(true);
      const worktrees = await service.listWorktrees('proj_1');
      const defaultWt = worktrees.find((wt) => wt.name === 'default')!;
      expect(defaultWt.indexRange).toEqual([100, 799]);
    });

    it('updateWorktree clears rangeOverride when updating range without override flag', async () => {
      await setupDefault([100, 799]);
      // Create worktree with override
      const { worktree } = await service.addWorktree('proj_1', {
        name: 'Cross',
        indexRange: [300, 399],
        override: true,
      });
      // Update range without rangeOverride → clears override, runs chop
      const updated = await service.updateWorktree('proj_1', worktree.id, {
        indexRange: [300, 399],
      });
      expect(updated.rangeOverride).toBeUndefined();
      const worktrees = await service.listWorktrees('proj_1');
      const defaultWt = worktrees.find((wt) => wt.name === 'default')!;
      // Chop should have run now
      expect(defaultWt.indexRange).toEqual([100, 299]);
    });

    it('updateWorktree preserves rangeOverride when not changing range', async () => {
      await setupDefault([100, 799]);
      const { worktree } = await service.addWorktree('proj_1', {
        name: 'Cross',
        indexRange: [300, 399],
        override: true,
      });
      // Update name only — rangeOverride should persist
      const updated = await service.updateWorktree('proj_1', worktree.id, {
        name: 'Cross v2',
      });
      expect(updated.rangeOverride).toBe(true);
      expect(updated.name).toBe('Cross v2');
    });
  });

  describe('collision detection', () => {
    async function setupDefault(range: [number, number], artifacts?: Partial<WorktreeContext>): Promise<void> {
      store.projects = [createEmptyProject({ worktrees: [{
        id: 'wt_default',
        name: 'default',
        indexRange: range,
        worktreePath: '/projects/my-app',
        ...artifacts,
      }] })];
    }

    it('blocks when artifact index falls outside chopped range (archDoc)', async () => {
      await setupDefault([100, 799], { archDoc: '180-arch.something.md' });
      // New worktree [100, 199] → default would chop to [200, 799]
      // But index 180 is NOT in [200, 799] → collision
      await expect(
        service.addWorktree('proj_1', { name: 'Core', indexRange: [100, 199] }),
      ).rejects.toThrow(/artifact '180-arch.something.md' \(index 180\)/);
    });

    it('allows chop when artifact index stays within chopped range', async () => {
      await setupDefault([100, 799], { archDoc: '180-arch.something.md' });
      // New worktree [300, 399] → default chops to [100, 299]
      // Index 180 IS in [100, 299] → no collision
      await service.addWorktree('proj_1', { name: 'Pipeline', indexRange: [300, 399] });
      const worktrees = await service.listWorktrees('proj_1');
      const defaultWt = worktrees.find((wt) => wt.name === 'default')!;
      expect(defaultWt.indexRange).toEqual([100, 299]);
    });

    it('blocks when activeSlice index falls outside chopped range', async () => {
      await setupDefault([100, 799], { activeSlice: '250-slice.foo' });
      // New worktree [200, 299] → default chops to [100, 199]
      // Index 250 NOT in [100, 199] → collision
      await expect(
        service.addWorktree('proj_1', { name: 'Core', indexRange: [200, 299] }),
      ).rejects.toThrow(/artifact '250-slice.foo' \(index 250\)/);
    });

    it('no collision when default has no artifact references', async () => {
      await setupDefault([100, 799]);
      // No artifacts set → chop always succeeds
      await service.addWorktree('proj_1', { name: 'Core', indexRange: [100, 199] });
      const worktrees = await service.listWorktrees('proj_1');
      const defaultWt = worktrees.find((wt) => wt.name === 'default')!;
      expect(defaultWt.indexRange).toEqual([200, 799]);
    });
  });
});
