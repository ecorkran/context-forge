import type { ProjectData } from './types/project.js';

/** Fields that are routed to WorktreeContext when a worktree is active. */
export const WORKTREE_SCOPED_FIELDS = new Set([
  'developmentPhase',
  'instruction',
  'workType',
  'fileArch',
  'fileSlicePlan',
  'fileSlice',
  'fileTasks',
]);

/** Map ProjectData field names to their WorktreeContext counterparts. */
export const PROJECT_TO_WORKTREE_FIELD: Record<string, string> = {
  fileSlice: 'activeSlice',
  fileTasks: 'activeTaskFile',
  fileArch: 'archDoc',
  fileSlicePlan: 'slicePlan',
  developmentPhase: 'developmentPhase',
  instruction: 'instruction',
  workType: 'workType',
};

/**
 * Format a Date as a YYYYMMDD string.
 * Defaults to the current date if none is provided.
 */
export function formatDateProject(date?: Date): string {
  const d = date ?? new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
}

export interface ProjectCreationOptions {
  name: string;
  projectPath: string;
  developmentPhase?: string;
  template?: string;
}

/**
 * Build sensible defaults for a new project.
 * Callers may spread additional overrides on top of the returned object.
 */
export function buildProjectCreationDefaults(opts: ProjectCreationOptions): Partial<ProjectData> {
  const phase = opts.developmentPhase || 'Phase 1: Concept';
  return {
    name: opts.name,
    projectPath: opts.projectPath,
    dateProject: formatDateProject(),
    template: opts.template || 'default',
    fileSlice: '',
    instruction: phase,
    developmentPhase: phase,
  };
}

export interface AutoSetResult {
  /** Additional fields to set alongside the original update. */
  derivedUpdates: Record<string, string>;
  /** Human-readable descriptions of what was derived (for CLI logging). */
  descriptions: string[];
}
