import { join } from 'node:path';
import { readdir } from 'node:fs/promises';
import { Command } from 'commander';
import type { ProjectData } from '@context-forge/core';
import {
  FileProjectStore,
  parseSlicePlan,
} from '@context-forge/core/node';
import { resolveProjectWorktree } from '../utils/project.js';
import { handleError, UserError } from '../utils/errors.js';
import { printJson } from '../output/formatter.js';
import { renderTable } from '../output/tables.js';
import { label, success, dim } from '../output/styles.js';

/** Overlay worktree-scoped fields onto a project copy. */
function applyWorktreeOverlay(project: ProjectData, worktreeId: string): ProjectData {
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

export function registerPlanCommand(program: Command): void {
  const cmd = program
    .command('plan')
    .description('Manage slice plans');

  cmd
    .command('list')
    .description('List slice plan files from the architecture directory')
    .option('--json', 'Output as JSON')
    .option('--project <name|id>', 'Project name or ID (overrides default)')
    .action(async (opts: { json?: boolean; project?: string }) => {
      try {
        const store = new FileProjectStore();
        const { id, worktreeId } = await resolveProjectWorktree({ project: opts.project }, store);
        const rawProject = await store.getById(id);

        if (!rawProject) {
          throw new UserError(`Project not found: '${id}'.`);
        }

        const project = worktreeId ? applyWorktreeOverlay(rawProject, worktreeId) : rawProject;

        if (!project.projectPath) {
          throw new UserError(
            'No projectPath configured. Set one with: cf set projectPath /path/to/project',
          );
        }

        const archDir = join(project.projectPath, 'project-documents/user/architecture');
        let files: string[];
        try {
          files = await readdir(archDir);
        } catch {
          throw new UserError('Architecture directory not found: project-documents/user/architecture/');
        }

        const planFiles = files
          .filter((f) => /^\d+-slices\..*\.md$/.test(f))
          .sort();

        if (planFiles.length === 0) {
          console.log(dim('No slice plans found in project.'));
          return;
        }

        // Determine active plan stem (without .md)
        const activeStem = project.fileSlicePlan ?? null;

        const entries = await Promise.all(
          planFiles.map(async (f) => {
            const stem = f.replace(/\.md$/, '');
            const indexMatch = /^(\d+)-/.exec(f);
            const index = indexMatch ? indexMatch[1] : '—';
            const planPath = join(archDir, f);
            const result = await parseSlicePlan(planPath);
            const isActive = stem === activeStem;

            return {
              index,
              file: stem,
              completed: result.completedSlices,
              total: result.totalSlices,
              isActive,
            };
          }),
        );

        if (opts.json) {
          printJson(entries);
          return;
        }

        console.log(label('\nSlice Plans'));

        const rows = entries.map((e) => {
          const progress = e.total > 0
            ? `${e.completed}/${e.total}`
            : '—';
          const active = e.isActive ? success(' ← active') : '';
          const icon = e.total > 0 && e.completed === e.total ? success('✓') : dim('○');
          return [e.index, icon + ' ' + e.file, progress + active];
        });

        console.log(renderTable(['#', 'Plan', 'Progress'], rows));
      } catch (err) {
        handleError(err);
      }
    });
}
