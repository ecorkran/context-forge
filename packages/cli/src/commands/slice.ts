import { join } from 'node:path';
import { FileProjectStore, ArtifactIntrospector, resolveArtifactPath } from '@context-forge/core/node';
import { extractSliceIndex } from '@context-forge/core/node';
import { resolveProjectWorktree } from '../utils/project.js';
import { resolveProject, deriveEntryStatus, normalizeStatus, STATUS } from '@context-forge/core';
import type { NormalizedStatus } from '@context-forge/core';
import { resolveOperationPath, getWorktreeIndexRange, isInIndexRange } from '../utils/worktree-overlay.js';
import { UserError } from '../utils/errors.js';
import { printJson } from '../output/formatter.js';
import { renderTable } from '../output/tables.js';
import { label, success, dim } from '../output/styles.js';
import { renderEntryStatus, type DisplayStatus } from '../output/entryStatusDisplay.js';

/** Shared action handler for listing slices from the active slice plan. */
export async function sliceListAction(opts: { json?: boolean; project?: string }): Promise<void> {
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

  // Filter entries by worktree index range — but skip filtering when the plan itself
  // is outside the range (user explicitly switched to a different initiative)
  const planBaseIndex = /^(\d+)-/.exec(project.fileSlicePlan ?? '')?.[1];
  const planOutsideRange = planBaseIndex && indexRange && !isInIndexRange(parseInt(planBaseIndex, 10), indexRange);
  const filteredEntries = planOutsideRange
    ? planResult.entries
    : planResult.entries.filter((e) => isInIndexRange(e.index, indexRange));

  // Check for design files, task files, and derived status per entry.
  // TD-2a: a signal that exists but fails to resolve (task file present but
  // unreadable, frontmatter status present but unrecognized) is rendered with
  // a distinct degraded indicator rather than silently falling through to the
  // checkbox — this must not abort the whole listing for one bad entry.
  const entries = await Promise.all(
    filteredEntries.map(async (entry) => {
      let designFile: string | null = null;
      let derivedStatus: DisplayStatus = entry.isChecked ? STATUS.Complete : STATUS.NotStarted;
      try {
        const docs = await introspector.detectDocuments(operationPath, entry.index);
        designFile = docs.sliceDesign;

        let taskInferredStatus: NormalizedStatus | undefined;
        let taskResolutionFailed = false;
        if (docs.taskFile) {
          const taskPaths = docs.taskFile.map((p) => join(operationPath, p));
          try {
            const taskResult = await introspector.parseTaskFile(taskPaths);
            taskInferredStatus = taskResult.inferredStatus;
          } catch {
            taskResolutionFailed = true;
          }
        }

        let frontmatterStatus: NormalizedStatus | undefined;
        let frontmatterResolutionFailed = false;
        if (docs.sliceDesign) {
          const fm = await introspector.parseFrontmatter(join(operationPath, docs.sliceDesign));
          if (fm.found) {
            const normalized = normalizeStatus(fm.data.status);
            if (normalized === undefined) {
              frontmatterResolutionFailed = true;
            } else {
              frontmatterStatus = normalized;
            }
          }
        }

        derivedStatus = taskResolutionFailed || frontmatterResolutionFailed
          ? 'degraded'
          : deriveEntryStatus({ frontmatterStatus, taskInferredStatus, isChecked: entry.isChecked });
      } catch {
        derivedStatus = 'degraded';
      }

      const isActive = activeIndex !== null && entry.index === activeIndex;
      const isNext = !isActive && derivedStatus !== STATUS.Complete && derivedStatus !== STATUS.Deprecated && activeIndex === null;

      return { ...entry, designFile, derivedStatus, isActive, isNext };
    }),
  );

  // Mark first not-complete entry as next if no active match
  if (!entries.some((e) => e.isActive)) {
    const firstNotComplete = entries.find(
      (e) => e.derivedStatus !== STATUS.Complete && e.derivedStatus !== STATUS.Deprecated,
    );
    if (firstNotComplete) {
      firstNotComplete.isNext = true;
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
        status: e.derivedStatus,
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
    const status = renderEntryStatus(e.derivedStatus, e.isChecked);
    const file = e.designFile
      ? dim(e.designFile.split('/').pop() ?? e.designFile)
      : dim('—');
    const indicator = e.isActive ? success(' ← active') : e.isNext ? dim(' ← next') : '';
    return [String(e.index), e.name, status, file + indicator];
  });

  console.log(renderTable(['#', 'Slice', 'Status', 'File'], rows));
}
