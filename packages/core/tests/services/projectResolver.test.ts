import { describe, it, expect, beforeEach } from 'vitest';
import type { ProjectData, CreateProjectData, UpdateProjectData } from '../../src/types/project.js';
import type { IProjectStore } from '../../src/storage/interfaces.js';
import { resolveProject } from '../../src/services/projectResolver.js';
import { createTestProjectData } from '../helpers/testData.js';

/**
 * In-memory mock of IProjectStore for testing resolveProject.
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

const projectWithWorktrees = createTestProjectData({
  id: 'proj_001',
  name: 'test-project',
  projectPath: '/tmp/test',
  developmentPhase: 'Phase 3: Slice Planning',
  instruction: 'Phase 3: Slice Planning',
  workType: 'new-feature',
  fileArch: '050-arch.core-system',
  fileSlicePlan: '050-slices.core',
  fileSlice: '050-slice.core-auth',
  fileTasks: '050-tasks.core-auth',
  worktrees: [
    {
      id: 'wt_001',
      name: 'Feature A',
      indexRange: [100, 199] as [number, number],
      worktreePath: '/repos/feature-a',
      developmentPhase: 'Phase 6: Implementation',
      instruction: 'Phase 6: Implementation',
      workType: 'bugfix',
      archDoc: '180-arch.initiative-context-worktree',
      slicePlan: '180-slices.initiative-context-worktree',
      activeSlice: '183-slice.worktree-cli-commands',
      activeTaskFile: '183-tasks.worktree-cli-commands',
    },
    {
      id: 'wt_002',
      name: 'API Layer',
      indexRange: [200, 299] as [number, number],
      developmentPhase: 'Phase 4: Slice Design',
      archDoc: '200-arch.developer-onboarding',
      slicePlan: '200-slices.developer-onboarding',
      activeSlice: '207-slice.worktree-resolved-project-view',
      activeTaskFile: '207-tasks.worktree-resolved-project-view',
    },
  ],
});

describe('resolveProject', () => {
  let store: MockProjectStore;

  beforeEach(() => {
    store = new MockProjectStore();
    store.projects = [{ ...projectWithWorktrees }];
  });

  it('returns null when project not found', async () => {
    const result = await resolveProject(store, 'nonexistent_id');
    expect(result).toBeNull();
  });

  it('returns raw project without resolvedWorktree when worktreeId omitted', async () => {
    const result = await resolveProject(store, 'proj_001');
    expect(result).not.toBeNull();
    expect(result!.id).toBe('proj_001');
    expect(result!.fileSlice).toBe('050-slice.core-auth');
    expect(result!.developmentPhase).toBe('Phase 3: Slice Planning');
    expect(result!.resolvedWorktree).toBeUndefined();
  });

  it('returns overlay-applied project when valid worktree ID provided', async () => {
    const result = await resolveProject(store, 'proj_001', 'wt_001');
    expect(result).not.toBeNull();
    expect(result!.fileSlice).toBe('183-slice.worktree-cli-commands');
    expect(result!.fileTasks).toBe('183-tasks.worktree-cli-commands');
    expect(result!.fileArch).toBe('180-arch.initiative-context-worktree');
    expect(result!.fileSlicePlan).toBe('180-slices.initiative-context-worktree');
    expect(result!.developmentPhase).toBe('Phase 6: Implementation');
    expect(result!.instruction).toBe('Phase 6: Implementation');
    expect(result!.workType).toBe('bugfix');
    expect(result!.projectPath).toBe('/repos/feature-a');
  });

  it('returns overlay-applied project when valid worktree name provided', async () => {
    const result = await resolveProject(store, 'proj_001', 'Feature A');
    expect(result).not.toBeNull();
    expect(result!.fileSlice).toBe('183-slice.worktree-cli-commands');
    expect(result!.resolvedWorktree).toEqual({ id: 'wt_001', name: 'Feature A' });
  });

  it('throws when worktreeId provided but worktree not found', async () => {
    await expect(resolveProject(store, 'proj_001', 'nonexistent_wt')).rejects.toThrow(
      /Worktree 'nonexistent_wt' not found/,
    );
  });

  it('resolvedWorktree contains correct id and name from matched worktree', async () => {
    const result = await resolveProject(store, 'proj_001', 'wt_001');
    expect(result!.resolvedWorktree).toEqual({ id: 'wt_001', name: 'Feature A' });

    const result2 = await resolveProject(store, 'proj_001', 'wt_002');
    expect(result2!.resolvedWorktree).toEqual({ id: 'wt_002', name: 'API Layer' });
  });

  it('preserves projectPath when worktree has no worktreePath', async () => {
    const result = await resolveProject(store, 'proj_001', 'wt_002');
    expect(result!.projectPath).toBe('/tmp/test');
  });
});
