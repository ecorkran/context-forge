import { join } from 'node:path';
import { Command } from 'commander';
import { FileProjectStore, ArtifactIntrospector, resolveArtifactPath } from '@context-forge/core/node';
import { extractSliceIndex } from '@context-forge/core/node';
import { resolveProjectWorktree } from '../utils/project.js';
import { resolveProject } from '@context-forge/core';
import { resolveOperationPath, getWorktreeIndexRange, isInIndexRange } from '../utils/worktree-overlay.js';
import { handleError, UserError } from '../utils/errors.js';
import { printJson } from '../output/formatter.js';
import { renderTable } from '../output/tables.js';
import { label, success, dim } from '../output/styles.js';

export function registerSliceCommand(program: Command): void {
  const cmd = program
    .command('slice')
    .description('Manage slices');

  cmd
    .command('list')
    .description('List slices from the active slice plan')
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

        const project = await resolveProject(store, id, worktreeId);
        if (!project) {
          throw new UserError(`Project not found: '${id}'.`);
        }

        if (!project.fileSlicePlan) {
          throw new UserError(
            'No slice plan configured. Set one with: cf set slicePlan <path>',
          );
        }

        if (!project.projectPath) {
          throw new UserError(
            'No projectPath configured. Set one with: cf set projectPath /path/to/project',
          );
        }

        const operationPath = resolveOperationPath(project, worktreeId) ?? project.projectPath!;
        const indexRange = getWorktreeIndexRange(rawProject, worktreeId);

        const planRelPath = resolveArtifactPath('fileSlicePlan', project.fileSlicePlan);
        if (!planRelPath) {
          throw new UserError('Could not resolve slice plan path.');
        }
        const planPath = join(operationPath, planRelPath);
        const introspector = new ArtifactIntrospector();
        const planResult = await introspector.parseSlicePlan(planPath);

        // Determine active slice index
        const activeIndex = extractSliceIndex(project.fileSlice);

        // Filter entries by worktree index range
        const filteredEntries = planResult.entries.filter((e) => isInIndexRange(e.index, indexRange));

        // Check for design files per entry
        const entries = await Promise.all(
          filteredEntries.map(async (entry) => {
            let designFile: string | null = null;
            try {
              const docs = await introspector.detectDocuments(operationPath, entry.index);
              designFile = docs.sliceDesign;
            } catch {
              // skip
            }

            const isActive = activeIndex !== null && entry.index === activeIndex;
            const isNext = !isActive && !entry.isChecked && activeIndex === null;

            return { ...entry, designFile, isActive, isNext };
          }),
        );

        // Mark first unchecked as next if no active match
        if (!entries.some((e) => e.isActive)) {
          const firstUnchecked = entries.find((e) => !e.isChecked);
          if (firstUnchecked) {
            firstUnchecked.isNext = true;
          }
        }

        if (opts.json) {
          const planName = project.fileSlicePlan.split('/').pop() ?? project.fileSlicePlan;
          printJson({
            slicePlan: planName,
            total: planResult.totalSlices,
            completed: planResult.completedSlices,
            entries: entries.map((e) => ({
              index: e.index,
              name: e.name,
              isChecked: e.isChecked,
              designFile: e.designFile,
              isActive: e.isActive,
              isNext: e.isNext,
            })),
          });
          return;
        }

        // Render table
        const planName = project.fileSlicePlan.split('/').pop() ?? project.fileSlicePlan;
        console.log(label(`\nSlice Plan: ${planName}`));

        const rows = entries.map((e) => {
          const status = e.isChecked
            ? success('✓ complete')
            : dim('○ not started');
          const file = e.designFile
            ? dim(e.designFile.split('/').pop() ?? e.designFile)
            : dim('—');
          const indicator = e.isActive ? success(' ← active') : e.isNext ? dim(' ← next') : '';
          return [String(e.index), e.name, status, file + indicator];
        });

        console.log(renderTable(['#', 'Slice', 'Status', 'File'], rows));
      } catch (err) {
        handleError(err);
      }
    });
}
