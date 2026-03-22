import type { ProjectData } from '../types/index.js';

/** Overlay worktree-scoped fields onto a project copy. */
export function applyWorktreeOverlay(project: ProjectData, worktreeId: string): ProjectData {
  const wt = (project.worktrees ?? []).find((w) => w.id === worktreeId);
  if (!wt) return project;
  return {
    ...project,
    ...(wt.worktreePath && { projectPath: wt.worktreePath }),
    developmentPhase: wt.developmentPhase,
    instruction: wt.instruction,
    workType: wt.workType,
    fileArch: wt.archDoc,
    fileSlicePlan: wt.slicePlan,
    fileSlice: wt.activeSlice,
    fileTasks: wt.activeTaskFile,
  };
}
