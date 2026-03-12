import { existsSync } from 'node:fs';
import type { IProjectStore } from '../storage/interfaces.js';
import type { ProjectData } from '../types/project.js';
import type {
  WorktreeContext,
  CreateWorktreeInput,
  UpdateWorktreeInput,
  IndexRangeOverlap,
  WorktreePathStatus,
} from '../types/worktree.js';
import type { WorktreeInfo } from '../types/git.js';

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

/** Extract the leading numeric prefix from a filename (e.g. '200-arch.foo.md' → 200). */
function extractIndexFromFilename(filename: string): number | null {
  const match = /^(\d+)-/.exec(filename);
  if (!match) return null;
  return parseInt(match[1], 10);
}

/** Artifact fields on WorktreeContext that carry index-bearing filenames. */
const ARTIFACT_FIELDS = ['archDoc', 'slicePlan', 'activeSlice', 'activeTaskFile'] as const;

/** Get parsed indices from a worktree's artifact reference fields. */
function getWorktreeArtifactIndices(
  wt: WorktreeContext,
): { field: string; filename: string; index: number }[] {
  const results: { field: string; filename: string; index: number }[] = [];
  for (const field of ARTIFACT_FIELDS) {
    const value = wt[field];
    if (!value) continue;
    const index = extractIndexFromFilename(value);
    if (index !== null) {
      results.push({ field, filename: value, index });
    }
  }
  return results;
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
  ): Promise<{ worktree: WorktreeContext; migrated: boolean; overlaps: IndexRangeOverlap[]; chopWarning?: string }> {
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
    let chopWarning: string | undefined;

    if (isFirstWorktree && hasWorkflowFields(project)) {
      // Forward migration: move existing workflow fields into a "default" worktree
      const defaultWorktree: WorktreeContext = {
        id: generateWorktreeId(),
        name: 'default',
        indexRange: [100, 799],
        worktreePath: project.projectPath,
        ...mapProjectToWorktree(project),
      };

      const worktrees = [defaultWorktree, newWorktree];
      const chopResult = this.chopDefaultRange(worktrees, input.indexRange, newWorktree.id);
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
      chopWarning = chopResult.warning;
    } else {
      // No migration needed: just append
      const worktrees = [...(project.worktrees ?? []), newWorktree];
      const chopResult = this.chopDefaultRange(worktrees, input.indexRange, newWorktree.id);
      await this.store.update(projectId, { worktrees });
      chopWarning = chopResult.warning;
    }

    const overlaps = await this.findOverlaps(projectId, input.indexRange, newWorktree.id);
    return { worktree: newWorktree, migrated, overlaps, chopWarning };
  }

  /**
   * Update an existing worktree context.
   * The `id` field cannot be changed.
   */
  async updateWorktree(
    projectId: string,
    worktreeId: string,
    updates: UpdateWorktreeInput,
  ): Promise<WorktreeContext & { chopWarning?: string }> {
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

    let chopWarning: string | undefined;
    if (updates.indexRange) {
      const chopResult = this.chopDefaultRange(worktrees, updates.indexRange, worktreeId);
      chopWarning = chopResult.warning;
    }

    await this.store.update(projectId, { worktrees });
    return { ...updated, chopWarning };
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

  /**
   * Shrink the default worktree's range when a new/updated range overlaps it.
   * Mutates the worktrees array in place. Returns whether chopping occurred and any warning.
   */
  private chopDefaultRange(
    worktrees: WorktreeContext[],
    newRange: [number, number],
    excludeId?: string,
  ): { chopped: boolean; warning?: string } {
    const defaultWt = worktrees.find(
      (wt) => wt.name.toLowerCase() === 'default' && wt.id !== excludeId,
    );
    if (!defaultWt) return { chopped: false };

    const [dStart, dEnd] = defaultWt.indexRange;
    const [nStart, nEnd] = newRange;

    // No overlap → nothing to chop
    if (nStart > dEnd || nEnd < dStart) return { chopped: false };

    // Compute candidate blocks within default's current range, excluding newRange
    const lowerValid = nStart > dStart;
    const upperValid = nEnd < dEnd;
    const lowerBlock: [number, number] | null = lowerValid ? [dStart, nStart - 1] : null;
    const upperBlock: [number, number] | null = upperValid ? [nEnd + 1, dEnd] : null;

    // Select candidate: prefer lower block per design
    let candidate: [number, number] | null = null;
    if (lowerBlock) {
      candidate = lowerBlock;
    } else if (upperBlock) {
      candidate = upperBlock;
    }

    if (!candidate) {
      // New range covers entire default — check collisions first
      const artifacts = getWorktreeArtifactIndices(defaultWt);
      for (const art of artifacts) {
        // Any artifact would fall outside [0,0] sentinel
        if (art.index >= dStart && art.index <= dEnd) {
          throw new Error(
            `Cannot shrink default worktree range — artifact '${art.filename}' (index ${art.index}) ` +
              `would fall outside the new range [0, 0]. Move the artifact to another worktree first.`,
          );
        }
      }
      defaultWt.indexRange = [0, 0];
      return {
        chopped: true,
        warning:
          'Default worktree has no remaining index range. Consider removing it or assigning a new range.',
      };
    }

    // Check artifact collisions: artifacts in default's current range that won't be in candidate
    const artifacts = getWorktreeArtifactIndices(defaultWt);
    for (const art of artifacts) {
      if (art.index < candidate[0] || art.index > candidate[1]) {
        throw new Error(
          `Cannot shrink default worktree range — artifact '${art.filename}' (index ${art.index}) ` +
            `would fall outside the new range [${candidate[0]}, ${candidate[1]}]. ` +
            `Move the artifact to another worktree first.`,
        );
      }
    }

    defaultWt.indexRange = candidate;
    return { chopped: true };
  }

  /**
   * Find index range overlaps between a given range and existing worktrees.
   * Optionally exclude a worktree by ID (useful when updating a worktree's range).
   */
  async findOverlaps(
    projectId: string,
    range: [number, number],
    excludeId?: string,
  ): Promise<IndexRangeOverlap[]> {
    const worktrees = await this.listWorktrees(projectId);
    const overlaps: IndexRangeOverlap[] = [];

    for (const wt of worktrees) {
      if (excludeId && wt.id === excludeId) continue;

      // Ranges overlap when a[0] <= b[1] && b[0] <= a[1]
      if (range[0] <= wt.indexRange[1] && wt.indexRange[0] <= range[1]) {
        overlaps.push({
          existingWorktreeId: wt.id,
          existingWorktreeName: wt.name,
          existingRange: wt.indexRange,
          overlapStart: Math.max(range[0], wt.indexRange[0]),
          overlapEnd: Math.min(range[1], wt.indexRange[1]),
        });
      }
    }

    return overlaps;
  }

  /**
   * Validate filesystem paths for all worktree contexts in a project.
   * Checks each worktree's path against both the filesystem and git worktree list.
   *
   * @param projectId - Project to validate
   * @param gitWorktrees - Current git worktrees from GitWorktreeDiscovery
   * @param pathExists - Filesystem check callback (defaults to fs.existsSync for testability)
   */
  async validateWorktreePaths(
    projectId: string,
    gitWorktrees: WorktreeInfo[],
    pathExists: (p: string) => boolean = existsSync,
  ): Promise<WorktreePathStatus[]> {
    const worktrees = await this.listWorktrees(projectId);
    const gitPaths = new Set(gitWorktrees.map((wt) => wt.path));

    return worktrees.map((wt) => {
      const base = { worktreeId: wt.id, worktreeName: wt.name, worktreePath: wt.worktreePath };

      if (wt.worktreePath === undefined) {
        return { ...base, status: 'no-path' as const };
      }
      if (!pathExists(wt.worktreePath)) {
        return { ...base, status: 'missing' as const };
      }
      if (!gitPaths.has(wt.worktreePath)) {
        return { ...base, status: 'not-a-worktree' as const };
      }
      return { ...base, status: 'valid' as const };
    });
  }
}
