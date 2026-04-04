import { join } from 'node:path';
import { readdir } from 'node:fs/promises';
import {
  FileProjectStore,
  ArtifactIntrospector,
  buildModel,
  mergeProjectModels,
  resolveInitiativePlanPath,
} from '@context-forge/core/node';
import { extractSliceIndex } from '@context-forge/core/node';
import { resolveProjectWorktree } from '../utils/project.js';
import { resolveProject } from '@context-forge/core';
import {
  resolveOperationPath,
  getWorktreeIndexRange,
  isInIndexRange,
  resolveAllOperationPaths,
} from '../utils/worktree-overlay.js';
import { UserError } from '../utils/errors.js';
import { printJson } from '../output/formatter.js';
import { renderTable } from '../output/tables.js';
import { label, success, dim } from '../output/styles.js';

/** Shared action handler for listing architecture initiatives. */
export async function archListAction(opts: { json?: boolean; all?: boolean; project?: string }): Promise<void> {
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

  let indexRange: [number, number] | undefined;
  let operationPath: string;

  if (opts.all && rawProject.worktrees?.length) {
    operationPath = project.projectPath;
    // No index filtering in --all mode
  } else {
    operationPath = resolveOperationPath(project, worktreeId) ?? project.projectPath;
    indexRange = getWorktreeIndexRange(rawProject, worktreeId);
  }

  // Attempt initiative-plan-driven listing first
  const initiativePlanPath = await resolveInitiativePlanPath(operationPath);

  if (initiativePlanPath) {
    await archListFromPlan(initiativePlanPath, operationPath, project, indexRange, opts);
    return;
  }

  // Fallback: filesystem-scan based listing (legacy buildModel behavior)
  await archListFromModel(opts, project, rawProject, operationPath, indexRange);
}

/** List initiatives driven from the initiative plan file (primary path). */
async function archListFromPlan(
  initiativePlanPath: string,
  operationPath: string,
  project: ReturnType<typeof resolveProject> extends Promise<infer T> ? NonNullable<T> : never,
  indexRange: [number, number] | undefined,
  opts: { json?: boolean; all?: boolean },
): Promise<void> {
  const introspector = new ArtifactIntrospector();
  const planResult = await introspector.parseSlicePlan(initiativePlanPath);

  const filteredEntries = planResult.entries.filter((e) => isInIndexRange(e.index, indexRange));

  if (filteredEntries.length === 0) {
    console.log(dim('No initiatives found in initiative plan.'));
    return;
  }

  // Active arch index — compare against fileArch on the project
  const activeArchIndex = extractSliceIndex(project.fileArch);

  // Resolve per-entry arch file existence
  const entries = await Promise.all(
    filteredEntries.map(async (entry) => {
      let archFile: string | null = null;
      try {
        const archDir = join(operationPath, 'project-documents/user/architecture');
        const files = await readdir(archDir);
        const pattern = new RegExp(`^${entry.index}-arch\\.`, 'i');
        const found = files.find((f) => pattern.test(f));
        if (found) {
          archFile = found;
        }
      } catch {
        // directory missing or unreadable — leave archFile null
      }

      const status = entry.isChecked
        ? 'complete'
        : archFile
          ? 'in_progress'
          : 'not_started';

      const isActive = activeArchIndex !== null && entry.index === activeArchIndex;

      return {
        index: entry.index,
        name: entry.name,
        status,
        archFile,
        isActive,
      };
    }),
  );

  if (opts.json) {
    printJson(entries);
    return;
  }

  const planName = initiativePlanPath.split('/').pop() ?? initiativePlanPath;
  console.log(label(`\nArchitecture Initiatives: ${planName}`));

  const rows = entries.map((e) => {
    const statusLabel =
      e.status === 'complete'
        ? success('✓ complete')
        : e.status === 'in_progress'
          ? dim('◑ in progress')
          : dim('○ not started');
    const file = e.archFile ? dim(e.archFile) : dim('—');
    const indicator = e.isActive ? success(' ← active') : '';
    return [String(e.index), e.name, statusLabel, file + indicator];
  });

  console.log(renderTable(['#', 'Initiative', 'Status', 'Arch File'], rows));
}

/** Fallback: list initiatives from buildModel filesystem scan. */
async function archListFromModel(
  opts: { json?: boolean; all?: boolean },
  project: ReturnType<typeof resolveProject> extends Promise<infer T> ? NonNullable<T> : never,
  rawProject: Awaited<ReturnType<InstanceType<typeof FileProjectStore>['getById']>>,
  operationPath: string,
  indexRange: [number, number] | undefined,
): Promise<void> {
  let model;

  if (opts.all && rawProject?.worktrees?.length) {
    const paths = resolveAllOperationPaths(rawProject);
    const models = (await Promise.all(
      paths.map((p) => buildModel(p).catch(() => null)),
    )).filter((m): m is NonNullable<typeof m> => m !== null);
    model = mergeProjectModels(models);
  } else {
    model = await buildModel(operationPath);
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

    const archName = init.arch?.name ?? '—';
    const planName = init.slicePlan?.name ?? '—';

    const completedSlices = init.slices.filter((s) => s.status === 'complete').length;
    const totalSlices = init.slices.length;
    const progress = totalSlices > 0 ? `${completedSlices}/${totalSlices}` : '—';

    const isActive = activeIndex !== null && init.slices.some(
      (s) => parseInt(s.index, 10) === activeIndex,
    );

    return {
      index: key,
      baseIndex: parseInt(key, 10),
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
}
