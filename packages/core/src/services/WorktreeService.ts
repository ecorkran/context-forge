import type { IProjectStore } from '../storage/interfaces.js';
import type { ProjectData } from '../types/project.js';
import type {
  WorktreeContext,
  CreateWorktreeInput,
  UpdateWorktreeInput,
  IndexRangeOverlap,
} from '../types/worktree.js';

/** Generate a unique worktree ID. */
function generateWorktreeId(): string {
  return `wt_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
}

/** The workflow fields on ProjectData that get migrated to/from WorktreeContext. */
const WORKFLOW_FIELDS = [
  'developmentPhase',
  'fileSlice',
  'fileTasks',
  'instruction',
  'workType',
  'fileArch',
  'fileSlicePlan',
] as const;

/** Check if a project has any non-empty workflow fields worth migrating. */
function hasWorkflowFields(project: ProjectData): boolean {
  return WORKFLOW_FIELDS.some((field) => {
    const value = project[field as keyof ProjectData];
    return value !== undefined && value !== '';
  });
}

/** Map ProjectData workflow fields to WorktreeContext fields. */
function mapProjectToWorktree(project: ProjectData): Partial<WorktreeContext> {
  return {
    developmentPhase: project.developmentPhase || undefined,
    activeSlice: project.fileSlice || undefined,
    activeTaskFile: project.fileTasks || undefined,
    instruction: project.instruction || undefined,
    workType: project.workType,
    archDoc: project.fileArch || undefined,
    slicePlan: project.fileSlicePlan || undefined,
  };
}

/** Map WorktreeContext fields back to ProjectData update fields. */
function mapWorktreeToProject(wt: WorktreeContext): Partial<ProjectData> {
  return {
    developmentPhase: wt.developmentPhase ?? '',
    fileSlice: wt.activeSlice ?? '',
    fileTasks: wt.activeTaskFile ?? '',
    instruction: wt.instruction ?? '',
    workType: wt.workType,
    fileArch: wt.archDoc ?? '',
    fileSlicePlan: wt.slicePlan ?? '',
  };
}

/** Validate that an index range has non-negative integers with start <= end. */
function validateIndexRange(range: [number, number]): void {
  const [start, end] = range;
  if (!Number.isInteger(start) || !Number.isInteger(end)) {
    throw new Error(`Index range values must be integers, got [${start}, ${end}]`);
  }
  if (start < 0 || end < 0) {
    throw new Error(`Index range values must be non-negative, got [${start}, ${end}]`);
  }
  if (start > end) {
    throw new Error(`Index range start must be <= end, got [${start}, ${end}]`);
  }
}

/**
 * Service for managing worktree contexts within a project.
 * Encapsulates CRUD operations and migration logic, using IProjectStore
 * as the persistence layer.
 */
export class WorktreeService {
  constructor(private readonly store: IProjectStore) {}

  /** Retrieve a project by ID, throwing if not found. */
  private async getProjectOrThrow(projectId: string): Promise<ProjectData> {
    const project = await this.store.getById(projectId);
    if (!project) {
      throw new Error(`Project not found: ${projectId}`);
    }
    return project;
  }

  /** List all worktree contexts for a project. */
  async listWorktrees(projectId: string): Promise<WorktreeContext[]> {
    const project = await this.getProjectOrThrow(projectId);
    return project.worktrees ?? [];
  }

  /** Get a worktree context by ID. Returns undefined if not found. */
  async getWorktree(projectId: string, worktreeId: string): Promise<WorktreeContext | undefined> {
    const project = await this.getProjectOrThrow(projectId);
    return (project.worktrees ?? []).find((wt) => wt.id === worktreeId);
  }

  /** Get a worktree context by name (case-insensitive). Returns undefined if not found. */
  async getWorktreeByName(projectId: string, name: string): Promise<WorktreeContext | undefined> {
    const project = await this.getProjectOrThrow(projectId);
    const lower = name.toLowerCase();
    return (project.worktrees ?? []).find((wt) => wt.name.toLowerCase() === lower);
  }

  /**
   * Add a new worktree context to a project.
   * Returns the created worktree, whether migration occurred, and any index range overlaps.
   */
  async addWorktree(
    projectId: string,
    input: CreateWorktreeInput,
  ): Promise<{ worktree: WorktreeContext; migrated: boolean; overlaps: IndexRangeOverlap[] }> {
    validateIndexRange(input.indexRange);
    const project = await this.getProjectOrThrow(projectId);

    const newWorktree: WorktreeContext = {
      id: generateWorktreeId(),
      name: input.name,
      indexRange: input.indexRange,
      worktreePath: input.worktreePath,
      archDoc: input.archDoc,
      slicePlan: input.slicePlan,
    };

    const isFirstWorktree = !project.worktrees || project.worktrees.length === 0;
    let migrated = false;

    if (isFirstWorktree && hasWorkflowFields(project)) {
      // Forward migration: move existing workflow fields into a "Default" worktree
      const defaultWorktree: WorktreeContext = {
        id: generateWorktreeId(),
        name: 'Default',
        indexRange: [0, 99],
        worktreePath: project.projectPath,
        ...mapProjectToWorktree(project),
      };

      const worktrees = [defaultWorktree, newWorktree];
      const clearedFields = {
        developmentPhase: '',
        fileSlice: '',
        fileTasks: '',
        instruction: '',
        workType: undefined as 'start' | 'continue' | undefined,
        fileArch: '',
        fileSlicePlan: '',
      };

      await this.store.update(projectId, { ...clearedFields, worktrees });
      migrated = true;
    } else {
      // No migration needed: just append
      const worktrees = [...(project.worktrees ?? []), newWorktree];
      await this.store.update(projectId, { worktrees });
    }

    return { worktree: newWorktree, migrated, overlaps: [] };
  }

  /**
   * Update an existing worktree context.
   * The `id` field cannot be changed.
   */
  async updateWorktree(
    projectId: string,
    worktreeId: string,
    updates: UpdateWorktreeInput,
  ): Promise<WorktreeContext> {
    if (updates.indexRange) {
      validateIndexRange(updates.indexRange);
    }

    const project = await this.getProjectOrThrow(projectId);
    const worktrees = [...(project.worktrees ?? [])];
    const index = worktrees.findIndex((wt) => wt.id === worktreeId);

    if (index === -1) {
      throw new Error(`Worktree not found: ${worktreeId}`);
    }

    const updated: WorktreeContext = { ...worktrees[index], ...updates, id: worktreeId };
    worktrees[index] = updated;

    await this.store.update(projectId, { worktrees });
    return updated;
  }

  /**
   * Remove a worktree context from a project.
   * Returns the removed worktree and whether reverse migration occurred.
   */
  async removeWorktree(
    projectId: string,
    worktreeId: string,
  ): Promise<{ removed: WorktreeContext; migrated: boolean }> {
    const project = await this.getProjectOrThrow(projectId);
    const worktrees = project.worktrees ?? [];
    const target = worktrees.find((wt) => wt.id === worktreeId);

    if (!target) {
      throw new Error(`Worktree not found: ${worktreeId}`);
    }

    const remaining = worktrees.filter((wt) => wt.id !== worktreeId);

    if (remaining.length === 0) {
      // Reverse migration: restore workflow fields to project, remove worktrees
      const restoredFields = mapWorktreeToProject(target);
      await this.store.update(projectId, {
        ...restoredFields,
        worktrees: undefined,
      });
      return { removed: target, migrated: true };
    }

    await this.store.update(projectId, { worktrees: remaining });
    return { removed: target, migrated: false };
  }
}
