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

    it('creates Default worktree with mapped fields on first addWorktree', async () => {
      const result = await service.addWorktree('proj_1', {
        name: 'API',
        indexRange: [100, 199],
      });

      expect(result.migrated).toBe(true);
      const worktrees = await service.listWorktrees('proj_1');
      expect(worktrees).toHaveLength(2);

      const defaultWt = worktrees[0];
      expect(defaultWt.name).toBe('Default');
      expect(defaultWt.indexRange).toEqual([0, 99]);
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
      await service.addWorktree('proj_1', { name: 'API', indexRange: [100, 199] });

      const project = await store.getById('proj_1');
      expect(project!.developmentPhase).toBe('');
      expect(project!.fileSlice).toBe('');
      expect(project!.fileTasks).toBe('');
      expect(project!.instruction).toBe('');
      expect(project!.fileArch).toBe('');
      expect(project!.fileSlicePlan).toBe('');
    });

    it('does NOT create Default when project has no workflow fields', async () => {
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

    it('creates Default with only populated fields mapped for partially-set project', async () => {
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
      await service.addWorktree('proj_1', { name: 'First', indexRange: [100, 199] });
      const result = await service.addWorktree('proj_1', { name: 'Second', indexRange: [200, 299] });

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

      await service.addWorktree('proj_1', { name: 'API', indexRange: [100, 199] });

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
});
