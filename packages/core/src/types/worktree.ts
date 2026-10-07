/**
 * Per-initiative workflow state bound to a git worktree.
 * Each WorktreeContext holds the workflow fields that were previously
 * stored directly on ProjectData, scoped to an index range.
 */
export interface WorktreeContext {
  /** Auto-generated identifier (format: wt_{timestamp}_{random}) */
  id: string;
  /** Human-readable label for the worktree (e.g. "API Foundation") */
  name: string;
  /** Slice index band owned by this worktree, inclusive on both ends */
  indexRange: [number, number];
  /** Absolute filesystem path to the git worktree directory */
  worktreePath?: string;
  /** Path to the initiative architecture document */
  archDoc?: string;
  /** Path to the initiative slice plan */
  slicePlan?: string;
  /** Current development phase within this worktree */
  developmentPhase?: string;
  /** Active slice file path (maps to ProjectData.fileSlice) */
  activeSlice?: string;
  /** Active task file path (maps to ProjectData.fileTasks) */
  activeTaskFile?: string;
  /** Current instruction for the worktree */
  instruction?: string;
  /** Work type: starting fresh or continuing existing work */
  workType?: 'start' | 'continue';
  /** When true, this worktree intentionally overlaps other ranges (skips chop logic) */
  rangeOverride?: boolean;
  /** True only for the worktree forward migration created. Not user-settable. */
  isDefault?: boolean;
}

/**
 * Input for creating a new worktree context.
 * Excludes auto-generated `id` and workflow fields (which start undefined).
 */
export interface CreateWorktreeInput {
  /** Human-readable label for the worktree */
  name: string;
  /** Slice index band, inclusive on both ends */
  indexRange: [number, number];
  /** Absolute filesystem path to the git worktree directory */
  worktreePath?: string;
  /** Path to the initiative architecture document */
  archDoc?: string;
  /** Path to the initiative slice plan */
  slicePlan?: string;
  /** Skip range-chopping and allow intentional overlap */
  override?: boolean;
}

/**
 * Input for updating an existing worktree context.
 * All fields except `id` and `isDefault` are updatable.
 */
export type UpdateWorktreeInput = Partial<Omit<WorktreeContext, 'id' | 'isDefault'>>;

/**
 * Validation status for a worktree's filesystem path.
 * Used by stale path detection in list commands and consistency checks.
 */
export interface WorktreePathStatus {
  /** ID of the worktree context */
  worktreeId: string;
  /** Display name of the worktree context */
  worktreeName: string;
  /** Filesystem path (may be undefined for path-less worktrees) */
  worktreePath: string | undefined;
  /** Validation result */
  status: 'valid' | 'missing' | 'not-a-worktree' | 'no-path';
}

/**
 * Describes an overlap between two worktree index ranges.
 * Returned as advisory information — overlaps do not block operations.
 */
export interface IndexRangeOverlap {
  /** ID of the existing worktree whose range overlaps */
  existingWorktreeId: string;
  /** Name of the existing worktree whose range overlaps */
  existingWorktreeName: string;
  /** The existing worktree's full index range */
  existingRange: [number, number];
  /** Start of the overlapping region */
  overlapStart: number;
  /** End of the overlapping region */
  overlapEnd: number;
}

/**
 * Why removing a worktree did not hand its range back to the default worktree
 * (slice 932). Reported so a still-narrowed default is never silent.
 */
export const RangeRestoreSkipReason = {
  /** The default worktree is pinned with rangeOverride. */
  RangeOverride: 'range-override',
  /** The removed range does not touch the default's, so no single range holds both. */
  NotAdjacent: 'not-adjacent',
  /** The combined range would overlap another remaining worktree. */
  WouldOverlap: 'would-overlap',
} as const;

export type RangeRestoreSkipReason = (typeof RangeRestoreSkipReason)[keyof typeof RangeRestoreSkipReason];

/**
 * Result of WorktreeService.removeWorktree. When other worktrees remain, at
 * most one of `restoredRange` and `rangeNotRestored` is set, and neither when
 * no default worktree remains or the default itself was removed. Neither is
 * set when `migrated` is true (the last worktree was removed).
 */
export interface RemoveWorktreeResult {
  removed: WorktreeContext;
  /** True when the last worktree was removed and workflow fields went back to the project. */
  migrated: boolean;
  /** The default worktree's new range, after the removed range was handed back to it. */
  restoredRange?: [number, number];
  /** Why the default worktree kept its range, and what that range is. */
  rangeNotRestored?: { reason: RangeRestoreSkipReason; defaultRange: [number, number] };
  /** The default worktree, present whenever restoredRange or rangeNotRestored is. */
  defaultWorktree?: { id: string; name: string };
}
