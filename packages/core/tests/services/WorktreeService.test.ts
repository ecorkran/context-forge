import { describe, it, expect, beforeEach } from 'vitest';
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
});
