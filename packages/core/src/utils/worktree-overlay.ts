import type { ProjectData } from '../types/index.js';

/** Overlay worktree-scoped fields onto a project copy. */
export function applyWorktreeOverlay(project: ProjectData, worktreeId: string): ProjectData {
  const wt = (project.worktrees ?? []).find((w) => w.id === worktreeId);
  if (!wt) return project;
  return {
    ...project,
    developmentPhase: wt.developmentPhase || project.developmentPhase,
    instruction: wt.instruction || project.instruction,
    workType: wt.workType || project.workType,
    fileArch: wt.archDoc || project.fileArch,
    fileSlicePlan: wt.slicePlan || project.fileSlicePlan,
    fileSlice: wt.activeSlice || project.fileSlice,
    fileTasks: wt.activeTaskFile || project.fileTasks,
  };
}
