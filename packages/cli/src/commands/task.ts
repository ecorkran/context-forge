import { join } from 'node:path';
import { readdir } from 'node:fs/promises';
import {
  FileProjectStore,
  resolveArtifactPath,
  resolveSlicePlanPathByIndex,
  extractSliceIndex,
  parseSlicePlan,
  parseTaskFile,
} from '@context-forge/core/node';
import { resolveProjectWorktree } from '../utils/project.js';
import { resolveProject } from '@context-forge/core';
import { resolveOperationPath, getWorktreeIndexRange, isInIndexRange, resolveAllOperationPaths } from '../utils/worktree-overlay.js';
import { UserError } from '../utils/errors.js';
import { printJson } from '../output/formatter.js';
import { label, success, dim } from '../output/styles.js';

/** Shared action handler for listing task files. */
export async function taskListAction(opts: { json?: boolean; all?: boolean; project?: string; archIndex?: string }): Promise<void> {
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

  if (opts.archIndex !== undefined && opts.all) {
    throw new UserError(
      'cannot combine an explicit index with --all — --all lists tasks across worktrees of the active plan',
    );
  }

  if (opts.archIndex !== undefined) {
    // An explicit index request targets one specific plan directly, never
    // touching project state — no worktree/--all aggregation.
    const archIndex = Number(opts.archIndex);
    if (!Number.isInteger(archIndex) || archIndex < 0) {
      throw new UserError(`Invalid archIndex '${opts.archIndex}' — must be a non-negative integer.`);
    }
    const operationPath = resolveOperationPath(project, worktreeId) ?? project.projectPath!;
    const resolvedPath = await resolveSlicePlanPathByIndex(operationPath, archIndex);
    if (!resolvedPath) {
      throw new UserError(
        `No slice plan found for index '${archIndex}' (searched project-documents/user/architecture/).`,
      );
    }
    await listTaskFiles(project, [operationPath], undefined, opts.json, resolvedPath);
  } else if (opts.all && rawProject.worktrees?.length) {
    const paths = resolveAllOperationPaths(rawProject);
    await listTaskFiles(project, paths, undefined, opts.json);
  } else {
    const operationPath = resolveOperationPath(project, worktreeId) ?? project.projectPath!;
    const indexRange = getWorktreeIndexRange(rawProject, worktreeId);
    await listTaskFiles(project, [operationPath], indexRange, opts.json);
  }
}

/** Shared action handler for listing task items from the active task file. */
export async function taskItemsAction(opts: { json?: boolean; project?: string }): Promise<void> {
  const store = new FileProjectStore();
  const { id, worktreeId } = await resolveProjectWorktree({ project: opts.project }, store);
  const project = await resolveProject(store, id, worktreeId);

  if (!project) {
    throw new UserError(`Project not found: '${id}'.`);
  }

  if (!project.projectPath) {
    throw new UserError(
      'No projectPath configured. Set one with: cf set projectPath /path/to/project',
    );
  }

  const operationPath = resolveOperationPath(project, worktreeId) ?? project.projectPath!;
  await listTaskItems(project, operationPath, opts.json);
}

async function listTaskItems(
  project: { fileTasks?: string; projectPath?: string; fileSlice?: string },
  operationPath: string,
  json?: boolean,
): Promise<void> {
  if (!project.fileTasks) {
    throw new UserError(
      'No task file configured. Set one with: cf set tasks <filename>',
    );
  }

  const taskRelPath = resolveArtifactPath('fileTasks', project.fileTasks);
  if (!taskRelPath) {
    throw new UserError('Could not resolve task file path.');
  }

  // Detect split task files via index
  const sliceIndex = extractSliceIndex(project.fileSlice);
  let taskPaths: string[];

  if (sliceIndex !== null) {
    const tasksDir = join(operationPath, 'project-documents/user/tasks');
    try {
      const files = await readdir(tasksDir);
      const matching = files
        .filter((f) => f.startsWith(`${sliceIndex}-tasks.`) && f.endsWith('.md'))
        .sort()
        .map((f) => join(tasksDir, f));
      taskPaths = matching.length > 0 ? matching : [join(operationPath, taskRelPath)];
    } catch {
      taskPaths = [join(operationPath, taskRelPath)];
    }
  } else {
    taskPaths = [join(operationPath, taskRelPath)];
  }

  const taskResult = await parseTaskFile(taskPaths);

  if (json) {
    printJson(taskResult);
    return;
  }

  const fileName = project.fileTasks.split('/').pop() ?? project.fileTasks;
  console.log(
    label(`\nTasks: ${fileName}`) +
    dim(`  (${taskResult.completedTasks}/${taskResult.totalTasks} complete)`),
  );

  for (const item of taskResult.items) {
    const icon = item.done ? success('  ✓ ') : dim('  ○ ');
    const text = item.done ? dim(item.name) : item.name;
    console.log(icon + text);
  }
}

async function listTaskFiles(
  project: { fileSlicePlan?: string; fileSlice?: string; projectPath?: string },
  operationPaths: string[],
  indexRange: [number, number] | undefined,
  json?: boolean,
  explicitPlanPath?: string,
): Promise<void> {
  let plan;

  if (explicitPlanPath) {
    // An explicit archIndex request reads the target plan directly — never
    // resolves via project.fileSlicePlan, never mutates project state.
    plan = await parseSlicePlan(explicitPlanPath);
  } else {
    if (!project.fileSlicePlan) {
      throw new UserError('No slice plan configured. Set one with: cf set slicePlan <path>');
    }

    const planRelPath = resolveArtifactPath('fileSlicePlan', project.fileSlicePlan);
    if (!planRelPath) {
      throw new UserError('Could not resolve slice plan path.');
    }

    // Try to find the plan file across operation paths
    for (const op of operationPaths) {
      try {
        plan = await parseSlicePlan(join(op, planRelPath));
        break;
      } catch {
        continue;
      }
    }
    if (!plan) {
      throw new UserError('Could not resolve slice plan path.');
    }
  }

  const activeIndex = extractSliceIndex(project.fileSlice);

  // Collect task files from all operation paths, deduplicate by filename
  const fileMap = new Map<string, string>(); // filename -> full path to tasks dir
  for (const op of operationPaths) {
    const tasksDir = join(op, 'project-documents/user/tasks');
    try {
      const files = await readdir(tasksDir);
      for (const f of files) {
        if (!fileMap.has(f)) fileMap.set(f, tasksDir);
      }
    } catch {
      continue;
    }
  }

  if (fileMap.size === 0) {
    if (json) {
      console.log(JSON.stringify([]));
      return;
    }
    console.log('No task files found.');
    return;
  }

  const summaries: { index: number; name: string; files: string[]; completed: number; total: number; isActive: boolean }[] = [];

  // Skip range filtering when the plan itself is outside the range
  const planBaseIndex = /^(\d+)-/.exec(project.fileSlicePlan ?? '')?.[1];
  const planOutsideRange = planBaseIndex && indexRange && !isInIndexRange(parseInt(planBaseIndex, 10), indexRange);
  const filteredEntries = planOutsideRange
    ? plan.entries
    : plan.entries.filter((e) => isInIndexRange(e.index, indexRange));
  for (const entry of filteredEntries) {
    const matching = [...fileMap.entries()]
      .filter(([f]) => f.startsWith(`${entry.index}-tasks.`) && f.endsWith('.md'))
      .sort(([a], [b]) => a.localeCompare(b));

    if (matching.length === 0) continue;

    const paths = matching.map(([f, dir]) => join(dir, f));
    try {
      const result = await parseTaskFile(paths);
      summaries.push({
        index: entry.index,
        name: entry.name,
        files: matching.map(([f]) => f),
        completed: result.completedTasks,
        total: result.totalTasks,
        isActive: entry.index === activeIndex,
      });
    } catch {
      summaries.push({
        index: entry.index,
        name: entry.name,
        files: matching.map(([f]) => f),
        completed: 0,
        total: 0,
        isActive: entry.index === activeIndex,
      });
    }
  }

  if (json) {
    printJson(summaries);
    return;
  }

  console.log(label('\nTask Files'));
  for (const s of summaries) {
    const active = s.isActive ? success(' ← active') : '';
    const progress = s.total > 0 ? dim(` (${s.completed}/${s.total})`) : dim(' (empty)');
    const icon = s.total > 0 && s.completed === s.total ? success('  ✓ ') : dim('  ○ ');
    console.log(icon + `${s.index} ${s.name}` + progress + active);
  }
}
