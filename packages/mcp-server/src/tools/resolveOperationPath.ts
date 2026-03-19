import { FileProjectStore } from '@context-forge/core/node';
import { resolveProjectId } from './resolveProjectId.js';

export interface ResolvedOperation {
  operationPath: string;
  indexRange?: [number, number];
}

/**
 * Resolve the operation path and optional index range for a worktree-aware
 * MCP tool call. When worktreeId is provided, looks up the worktree by
 * ID or name and returns its path and index range.
 *
 * For the default worktree, indexRange is undefined (no filtering).
 */
export async function resolveOperationContext(
  args: { projectId?: string; worktreeId?: string },
): Promise<ResolvedOperation> {
  const resolvedId = await resolveProjectId(args.projectId);
  const store = new FileProjectStore();
  const project = await store.getById(resolvedId);

  if (!project) {
    throw new Error(
      `Project not found: '${resolvedId}'. Use the project_list tool to see available projects.`,
    );
  }

  if (!project.projectPath) {
    throw new Error(
      `Project '${resolvedId}' has no projectPath configured. Set it with project_update.`,
    );
  }

  if (!args.worktreeId) {
    return { operationPath: project.projectPath };
  }

  if (!project.worktrees) {
    return { operationPath: project.projectPath };
  }

  const wt = project.worktrees.find(
    (w) => w.id === args.worktreeId || w.name.toLowerCase() === args.worktreeId!.toLowerCase(),
  );

  if (!wt) {
    return { operationPath: project.projectPath };
  }

  const operationPath = wt.worktreePath ?? project.projectPath;
  const indexRange = wt.name === 'default' ? undefined : wt.indexRange;
  return { operationPath, indexRange };
}
