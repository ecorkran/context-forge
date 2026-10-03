import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ProjectData } from '@context-forge/core';
import { UserError } from '../utils/errors.js';
import { normalizeTarget, TARGETS } from './ideTargets.js';

/**
 * Propagate IDE-generated files from the project root to all registered worktrees.
 *
 * The setup-ide script always writes to the project root (its find_project_root()
 * walks up to the nearest directory containing project-documents/, which is always
 * the root). Worktrees share the same guides submodule source but have independent
 * working trees, so without propagation their compiled IDE files go stale after
 * every root setup-ide run.
 *
 * Descriptor-driven: each target's `markerFiles` and `propagateDirs` (see TARGETS)
 * define exactly what is copied. `.claude/settings.local.json` and `.claude/worktrees/`
 * stay out because neither appears in any target's `propagateDirs` — the former is
 * worktree-specific, the latter is the cf worktree registry and root-only.
 */
export function propagateToWorktrees(project: ProjectData, target: string): void {
  const rootPath = project.projectPath!;
  const resolvedRootPath = path.resolve(rootPath);

  // WorktreeService migrates a project's pre-worktree workflow fields into a
  // "default" worktree context whose worktreePath IS the project root (see
  // WorktreeService.ts). Propagating the root onto itself is a no-op at best;
  // fs.cpSync throws ERR_FS_CP_EINVAL when src and dest are the same path, so
  // this must be filtered out rather than merely being harmless.
  const worktrees = (project.worktrees ?? []).filter(
    (wt) => wt.worktreePath && fs.existsSync(wt.worktreePath) && path.resolve(wt.worktreePath) !== resolvedRootPath,
  );
  if (worktrees.length === 0) return;

  const resolvedTarget = normalizeTarget(target);
  if (!resolvedTarget) {
    throw new UserError(`No propagation descriptor for target '${target}'.`);
  }
  const descriptor = TARGETS[resolvedTarget];

  for (const wt of worktrees) {
    const wtPath = wt.worktreePath!;
    console.log(`  → propagating to worktree: ${wt.name ?? wt.id} (${wtPath})`);

    for (const relFile of descriptor.markerFiles) {
      const srcFile = path.join(rootPath, ...relFile.split('/'));
      if (!fs.existsSync(srcFile)) continue;
      const dstFile = path.join(wtPath, ...relFile.split('/'));
      fs.mkdirSync(path.dirname(dstFile), { recursive: true });
      fs.copyFileSync(srcFile, dstFile);
    }

    for (const relDir of descriptor.propagateDirs) {
      const srcDir = path.join(rootPath, ...relDir.split('/'));
      if (!fs.existsSync(srcDir)) continue;
      const dstDir = path.join(wtPath, ...relDir.split('/'));
      fs.cpSync(srcDir, dstDir, { recursive: true });
    }
  }

  console.log(`  Propagated to ${worktrees.length} worktree${worktrees.length !== 1 ? 's' : ''}.`);
}
