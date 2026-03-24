import { Command } from 'commander';
import { FileProjectStore, detectDocuments, checkFileExists } from '@context-forge/core/node';
import { resolveProject } from '@context-forge/core';
import { projectSetAction } from './project.js';
import { buildAndPrint } from './build.js';
import { resolveProjectWorktree } from '../utils/project.js';
import { resolveOperationPath } from '../utils/worktree-overlay.js';
import { handleError } from '../utils/errors.js';
import { warn } from '../output/styles.js';

/** Warn to stderr if an artifact already exists for the given index. */
async function warnIfArtifactExists(
  projectPath: string,
  index: number,
  field: 'architecture' | 'slicePlan' | 'sliceDesign' | 'taskFile',
  label: string,
): Promise<void> {
  try {
    const docs = await detectDocuments(projectPath, index);
    const value = docs[field];
    const exists = Array.isArray(value) ? value.length > 0 : value !== null;
    if (exists) {
      process.stderr.write(warn(`${label} already exists for index ${index}. Building prompt anyway.\n`));
    }
  } catch {
    // Detection failure is not fatal
  }
}

/** Warn to stderr if the concept document already exists. */
async function warnIfConceptExists(opts: { project?: string }): Promise<void> {
  try {
    const store = new FileProjectStore();
    const { id, worktreeId } = await resolveProjectWorktree({ project: opts.project }, store);
    const project = await resolveProject(store, id, worktreeId);
    if (!project?.projectPath || !project.fileConcept) return;
    const opPath = resolveOperationPath(project, worktreeId) ?? project.projectPath;
    const exists = await checkFileExists(opPath, project.fileConcept);
    if (exists) {
      process.stderr.write(warn('Concept document already exists. Building concept prompt anyway.\n'));
    }
  } catch {
    // Detection failure is not fatal
  }
}

/** Resolve the operation path for artifact detection. */
async function getOperationPath(opts: { project?: string }): Promise<string | undefined> {
  try {
    const store = new FileProjectStore();
    const { id, worktreeId } = await resolveProjectWorktree({ project: opts.project }, store);
    const project = await resolveProject(store, id, worktreeId);
    if (!project?.projectPath) return undefined;
    return resolveOperationPath(project, worktreeId) ?? project.projectPath;
  } catch {
    return undefined;
  }
}

export function registerWorkflowCommands(program: Command): void {
  // cf concept
  program
    .command('concept')
    .description('Set phase to Concept and build prompt')
    .option('--project <name|id>', 'Project name or ID')
    .option('--project-level', 'Force project-level field updates')
    .action(async (opts: { project?: string; projectLevel?: boolean }) => {
      try {
        await warnIfConceptExists(opts);
        await projectSetAction('developmentPhase', 'Phase 0: Concept', opts);
        await buildAndPrint(opts);
      } catch (err) {
        handleError(err);
      }
    });

  // cf initiatives
  program
    .command('initiatives')
    .description('Set phase to Initiative Plan and build prompt')
    .option('--project <name|id>', 'Project name or ID')
    .option('--project-level', 'Force project-level field updates')
    .action(async (opts: { project?: string; projectLevel?: boolean }) => {
      try {
        await projectSetAction('developmentPhase', 'Phase 1: Initiative Plan', opts);
        await buildAndPrint(opts);
      } catch (err) {
        handleError(err);
      }
    });

  // cf arch <index>
  program
    .command('arch <index>')
    .description('Set architecture initiative and build prompt')
    .option('--project <name|id>', 'Project name or ID')
    .option('--project-level', 'Force project-level field updates')
    .action(async (index: string, opts: { project?: string; projectLevel?: boolean }) => {
      try {
        await projectSetAction('fileArch', index, opts);
        await projectSetAction('developmentPhase', 'Phase 2: Architecture', opts);
        const opPath = await getOperationPath(opts);
        if (opPath) {
          await warnIfArtifactExists(opPath, parseInt(index, 10), 'architecture', 'Architecture document');
        }
        await buildAndPrint(opts);
      } catch (err) {
        handleError(err);
      }
    });

  // cf plan <index>
  program
    .command('plan <index>')
    .description('Set slice plan and build prompt')
    .option('--project <name|id>', 'Project name or ID')
    .option('--project-level', 'Force project-level field updates')
    .action(async (index: string, opts: { project?: string; projectLevel?: boolean }) => {
      try {
        await projectSetAction('fileSlicePlan', index, opts);
        await projectSetAction('developmentPhase', 'Phase 3: Slice Planning', opts);
        const opPath = await getOperationPath(opts);
        if (opPath) {
          await warnIfArtifactExists(opPath, parseInt(index, 10), 'slicePlan', 'Slice plan');
        }
        await buildAndPrint(opts);
      } catch (err) {
        handleError(err);
      }
    });

  // cf slice <index>
  program
    .command('slice <index>')
    .description('Set active slice and build prompt')
    .option('--project <name|id>', 'Project name or ID')
    .option('--project-level', 'Force project-level field updates')
    .action(async (index: string, opts: { project?: string; projectLevel?: boolean }) => {
      try {
        await projectSetAction('fileSlice', index, opts);
        await projectSetAction('developmentPhase', 'Phase 4: Slice Design', opts);
        const opPath = await getOperationPath(opts);
        if (opPath) {
          await warnIfArtifactExists(opPath, parseInt(index, 10), 'sliceDesign', 'Slice design');
        }
        await buildAndPrint(opts);
      } catch (err) {
        handleError(err);
      }
    });

  // cf tasks <index>
  program
    .command('tasks <index>')
    .description('Set active task file and build prompt')
    .option('--project <name|id>', 'Project name or ID')
    .option('--project-level', 'Force project-level field updates')
    .action(async (index: string, opts: { project?: string; projectLevel?: boolean }) => {
      try {
        await projectSetAction('fileTasks', index, opts);
        await projectSetAction('developmentPhase', 'Phase 5: Task Breakdown', opts);
        const opPath = await getOperationPath(opts);
        if (opPath) {
          await warnIfArtifactExists(opPath, parseInt(index, 10), 'taskFile', 'Task file');
        }
        await buildAndPrint(opts);
      } catch (err) {
        handleError(err);
      }
    });

  // cf implement <index>
  program
    .command('implement <index>')
    .description('Set active slice for implementation and build prompt')
    .option('--project <name|id>', 'Project name or ID')
    .option('--project-level', 'Force project-level field updates')
    .action(async (index: string, opts: { project?: string; projectLevel?: boolean }) => {
      try {
        await projectSetAction('fileSlice', index, opts);
        await projectSetAction('developmentPhase', 'Phase 6: Implementation', opts);
        // No artifact warning for implement — implementation is always continuation
        await buildAndPrint(opts);
      } catch (err) {
        handleError(err);
      }
    });
}
