import { join } from 'node:path';
import { readdir } from 'node:fs/promises';
import { Command } from 'commander';
import {
  FileProjectStore,
  parseSlicePlan,
} from '@context-forge/core/node';
import { resolveProjectWorktree } from '../utils/project.js';
import { applyWorktreeOverlay, resolveOperationPath, getWorktreeIndexRange, isInIndexRange, resolveAllOperationPaths } from '../utils/worktree-overlay.js';
import { handleError, UserError } from '../utils/errors.js';
import { printJson } from '../output/formatter.js';
import { renderTable } from '../output/tables.js';
import { label, success, dim } from '../output/styles.js';

export function registerPlanCommand(program: Command): void {
  const cmd = program
    .command('plan')
    .description('Manage slice plans');

  cmd
    .command('list')
    .description('List slice plan files from the architecture directory')
    .option('--json', 'Output as JSON')
    .option('--all', 'Show slice plans from all worktrees')
    .option('--project <name|id>', 'Project name or ID (overrides default)')
    .action(async (opts: { json?: boolean; all?: boolean; project?: string }) => {
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

        let scanPaths: string[];
        let indexRange: [number, number] | undefined;

        if (opts.all && rawProject.worktrees?.length) {
          scanPaths = resolveAllOperationPaths(rawProject);
          // No index filtering in --all mode
        } else {
          const operationPath = resolveOperationPath(project, worktreeId) ?? project.projectPath!;
          scanPaths = [operationPath];
          indexRange = getWorktreeIndexRange(rawProject, worktreeId);
        }

        // Collect plan files from all scan paths, deduplicate by filename
        const seen = new Set<string>();
        const planFiles: { filename: string; archDir: string }[] = [];
        for (const sp of scanPaths) {
          const archDir = join(sp, 'project-documents/user/architecture');
          let files: string[];
          try {
            files = await readdir(archDir);
          } catch {
            continue;
          }
          for (const f of files) {
            if (!/^\d+-slices\..*\.md$/.test(f)) continue;
            const m = /^(\d+)-/.exec(f);
            if (m && !isInIndexRange(parseInt(m[1], 10), indexRange)) continue;
            if (!seen.has(f)) {
              seen.add(f);
              planFiles.push({ filename: f, archDir });
            }
          }
        }
        planFiles.sort((a, b) => a.filename.localeCompare(b.filename));

        if (scanPaths.length > 0 && planFiles.length === 0 && !seen.size) {
          throw new UserError('Architecture directory not found: project-documents/user/architecture/');
        }

        if (planFiles.length === 0) {
          console.log(dim('No slice plans found in project.'));
          return;
        }

        // Determine active plan stem (without .md)
        const activeStem = project.fileSlicePlan ?? null;

        const entries = await Promise.all(
          planFiles.map(async ({ filename, archDir }) => {
            const stem = filename.replace(/\.md$/, '');
            const indexMatch = /^(\d+)-/.exec(filename);
            const index = indexMatch ? indexMatch[1] : '—';
            const planPath = join(archDir, filename);
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
