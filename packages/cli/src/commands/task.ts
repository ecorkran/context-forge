import { join } from 'node:path';
import { readdir } from 'node:fs/promises';
import { Command } from 'commander';
import {
  FileProjectStore,
  resolveArtifactPath,
  extractSliceIndex,
  parseSlicePlan,
  parseTaskFile,
} from '@context-forge/core/node';
import { resolveProjectWorktree } from '../utils/project.js';
import { applyWorktreeOverlay } from '../utils/worktree-overlay.js';
import { handleError, UserError } from '../utils/errors.js';
import { printJson } from '../output/formatter.js';
import { label, success, dim } from '../output/styles.js';

export function registerTaskCommand(program: Command): void {
  const cmd = program
    .command('task')
    .description('Manage tasks');

  cmd
    .command('list')
    .description('List task files from the slice plan')
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

        await listTaskFiles(project, opts.json);
      } catch (err) {
        handleError(err);
      }
    });

  cmd
    .command('items')
    .description('Show individual task items from the active task file')
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

        await listTaskItems(project, opts.json);
      } catch (err) {
        handleError(err);
      }
    });
}

async function listTaskItems(
  project: { fileTasks?: string; projectPath?: string; fileSlice?: string },
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
    const tasksDir = join(project.projectPath!, 'project-documents/user/tasks');
    try {
      const files = await readdir(tasksDir);
      const matching = files
        .filter((f) => f.startsWith(`${sliceIndex}-tasks.`) && f.endsWith('.md'))
        .sort()
        .map((f) => join(tasksDir, f));
      taskPaths = matching.length > 0 ? matching : [join(project.projectPath!, taskRelPath)];
    } catch {
      taskPaths = [join(project.projectPath!, taskRelPath)];
    }
  } else {
    taskPaths = [join(project.projectPath!, taskRelPath)];
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
  json?: boolean,
): Promise<void> {
  if (!project.fileSlicePlan) {
    throw new UserError('No slice plan configured. Set one with: cf set slicePlan <path>');
  }

  const planRelPath = resolveArtifactPath('fileSlicePlan', project.fileSlicePlan);
  if (!planRelPath) {
    throw new UserError('Could not resolve slice plan path.');
  }

  const planPath = join(project.projectPath!, planRelPath);
  const plan = await parseSlicePlan(planPath);
  const activeIndex = extractSliceIndex(project.fileSlice);
  const tasksDir = join(project.projectPath!, 'project-documents/user/tasks');

  let allFiles: string[];
  try {
    allFiles = await readdir(tasksDir);
  } catch {
    throw new UserError('Tasks directory not found: project-documents/user/tasks/');
  }

  const summaries: { index: number; name: string; files: string[]; completed: number; total: number; isActive: boolean }[] = [];

  for (const entry of plan.entries) {
    const matching = allFiles
      .filter((f) => f.startsWith(`${entry.index}-tasks.`) && f.endsWith('.md'))
      .sort();

    if (matching.length === 0) continue;

    const paths = matching.map((f) => join(tasksDir, f));
    try {
      const result = await parseTaskFile(paths);
      summaries.push({
        index: entry.index,
        name: entry.name,
        files: matching,
        completed: result.completedTasks,
        total: result.totalTasks,
        isActive: entry.index === activeIndex,
      });
    } catch {
      summaries.push({
        index: entry.index,
        name: entry.name,
        files: matching,
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
