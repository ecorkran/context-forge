import { resolveProject, type ResolvedProject } from '@context-forge/core';
import type { FileProjectStore } from '@context-forge/core/node';
import { UserError } from '../utils/errors.js';
import { registerAdoptedArtifacts } from '../utils/registerAdoptedArtifacts.js';
import { projectSetAction } from './project.js';

/**
 * Registers a completed adoption's artifacts on the project (#137) and returns the project as the
 * commands should see it: re-read after a registration, unchanged otherwise. Shared by every
 * command that needs the architecture, slice plan or concept.
 */
export async function withAdoptedArtifactsRegistered(
  project: ResolvedProject,
  store: FileProjectStore,
  target: { id: string; worktreeId?: string; projectOption?: string },
): Promise<ResolvedProject> {
  const changed = await registerAdoptedArtifacts(project, (field, value) =>
    projectSetAction(field, value, { project: target.projectOption }),
  );
  if (!changed) return project;
  const reread = await resolveProject(store, target.id, target.worktreeId);
  if (!reread) throw new UserError(`Project not found after registering adopted artifacts: '${target.id}'.`);
  return reread;
}
