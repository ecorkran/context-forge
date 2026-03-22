import { Command } from 'commander';
import { FileProjectStore, buildModel, mergeProjectModels } from '@context-forge/core/node';
import { extractSliceIndex } from '@context-forge/core/node';
import { resolveProjectWorktree } from '../utils/project.js';
import { resolveProject } from '@context-forge/core';
import { resolveOperationPath, getWorktreeIndexRange, isInIndexRange, resolveAllOperationPaths } from '../utils/worktree-overlay.js';
import { handleError, UserError } from '../utils/errors.js';
import { printJson } from '../output/formatter.js';
import { renderTable } from '../output/tables.js';
import { label, success, dim } from '../output/styles.js';

export function registerArchCommand(program: Command): void {
  const cmd = program
    .command('arch')
    .description('Manage architecture');

  cmd
    .command('list')
    .description('List architecture initiatives from the project')
    .option('--json', 'Output as JSON')
    .option('--all', 'Show initiatives from all worktrees')
    .option('--project <name|id>', 'Project name or ID (overrides default)')
    .action(async (opts: { json?: boolean; all?: boolean; project?: string }) => {
      try {
        const store = new FileProjectStore();
        const { id, worktreeId } = await resolveProjectWorktree({ project: opts.project }, store);
        const rawProject = await store.getById(id);

        if (!rawProject) {
          throw new UserError(`Project not found: '${id}'.`);
        }

        const project = await resolveProject(store, id, worktreeId);
        if (!project) {
          throw new UserError(`Project not found: '${id}'.`);
        }

        if (!project.projectPath) {
          throw new UserError(
            'No projectPath configured. Set one with: cf set projectPath /path/to/project',
          );
        }

        let model;
        let indexRange: [number, number] | undefined;

        if (opts.all && rawProject.worktrees?.length) {
          const paths = resolveAllOperationPaths(rawProject);
          const models = (await Promise.all(
            paths.map((p) => buildModel(p).catch(() => null)),
          )).filter((m): m is NonNullable<typeof m> => m !== null);
          model = mergeProjectModels(models);
          // No index filtering in --all mode
        } else {
          const operationPath = resolveOperationPath(project, worktreeId) ?? project.projectPath;
          indexRange = getWorktreeIndexRange(rawProject, worktreeId);
          model = await buildModel(operationPath!);
        }

        const initiativeKeys = Object.keys(model.initiatives)
          .filter((key) => isInIndexRange(parseInt(key, 10), indexRange))
          .sort((a, b) => parseInt(a, 10) - parseInt(b, 10));

        if (initiativeKeys.length === 0) {
          console.log(dim('No initiatives found in project.'));
          return;
        }

        const activeIndex = extractSliceIndex(project.fileSlice);

        const entries = initiativeKeys.map((key) => {
          const init = model.initiatives[key];
          const baseIndex = parseInt(key, 10);

          const archName = init.arch?.name ?? '—';
          const planName = init.slicePlan?.name ?? '—';

          const completedSlices = init.slices.filter(
            (s) => s.status === 'complete',
          ).length;
          const totalSlices = init.slices.length;
          const progress = totalSlices > 0
            ? `${completedSlices}/${totalSlices}`
            : '—';

          // Determine if this initiative contains the active slice
          const isActive = activeIndex !== null && init.slices.some(
            (s) => parseInt(s.index, 10) === activeIndex,
          );

          return {
            index: key,
            baseIndex,
            name: init.name,
            archDoc: archName,
            slicePlan: planName,
            progress,
            completedSlices,
            totalSlices,
            isActive,
          };
        });

        if (opts.json) {
          printJson(entries);
          return;
        }

        console.log(label('\nArchitecture Initiatives'));

        const rows = entries.map((e) => {
          const indicator = e.isActive ? success(' ← active') : '';
          return [
            e.index,
            e.name,
            dim(e.archDoc),
            dim(e.slicePlan),
            e.progress + indicator,
          ];
        });

        console.log(renderTable(
          ['Index', 'Initiative', 'Arch Doc', 'Slice Plan', 'Progress'],
          rows,
        ));
      } catch (err) {
        handleError(err);
      }
    });
}
