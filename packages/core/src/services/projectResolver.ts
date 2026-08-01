import type { ResolvedProject } from '../types/index.js';
import type { IProjectStore } from '../storage/interfaces.js';
import { WorktreeService } from './WorktreeService.js';
import { applyWorktreeOverlay } from '../utils/worktree-overlay.js';

export type { ResolvedProject } from '../types/index.js';

/**
 * Load a project and optionally apply a worktree overlay.
 *
 * When worktreeId is provided, looks up the worktree by ID first, then by name,
 * applies the overlay, and annotates the result with resolution metadata.
 *
 * @returns null if the project is not found.
 * @throws Error if worktreeId is provided but the worktree does not exist.
 */
export async function resolveProject(
  store: IProjectStore,
  projectId: string,
  worktreeId?: string,
): Promise<ResolvedProject | null> {
  const project = await store.getById(projectId);
  if (!project) return null;
  if (!worktreeId) return project;

  const service = new WorktreeService(store);
  let wt = await service.getWorktree(projectId, worktreeId);
  if (!wt) {
    wt = await service.getWorktreeByName(projectId, worktreeId);
  }
  if (!wt) {
    throw new Error(
      `Worktree '${worktreeId}' not found on project '${projectId}'. ` +
        `Use worktree_list to see available worktrees.`,
    );
  }

  const resolved = applyWorktreeOverlay(project, wt.id);
  return {
    ...resolved,
    resolvedWorktree: { id: wt.id, name: wt.name },
  };
}
