import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ProjectData, WorktreeContext } from '@context-forge/core';

/**
 * Registered worktrees that receive setup-ide output: those whose path exists
 * and is not the project root. WorktreeService migrates a project's pre-worktree
 * workflow fields into the default worktree, whose worktreePath IS the project
 * root (see WorktreeService.ts); installing the root a second time as a
 * "worktree" would duplicate the root install, so it is filtered out.
 */
export function propagationTargets(project: ProjectData): WorktreeContext[] {
  const resolvedRootPath = path.resolve(project.projectPath!);
  return (project.worktrees ?? []).filter(
    (wt) => wt.worktreePath && fs.existsSync(wt.worktreePath) && path.resolve(wt.worktreePath) !== resolvedRootPath,
  );
}
