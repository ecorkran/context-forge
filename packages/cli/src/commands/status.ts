import { Command } from 'commander';
import { FileProjectStore, WorkflowNavigator } from '@context-forge/core/node';
import { resolveProjectWorktree, type ResolutionSource } from '../utils/project.js';
import { applyWorktreeOverlay } from '../utils/worktree-overlay.js';
import { handleError, UserError } from '../utils/errors.js';
import { printJson } from '../output/formatter.js';
import { label, value as valueStyle, dim } from '../output/styles.js';

export function registerStatusCommand(program: Command): void {
  program
    .command('status')
    .description('Show workflow status for the active project')
    .option('--json', 'Output as JSON')
    .option('--project <id>', 'Project ID or name (overrides default)')
    .action(async (opts: { json?: boolean; project?: string }) => {
      try {
        const store = new FileProjectStore();
        const { id, source, worktreeId } = await resolveProjectWorktree({ project: opts.project }, store);
        const rawProject = await store.getById(id);

        if (!rawProject) {
          throw new UserError(`Project not found: '${id}'. Run cf project list to see available projects.`);
        }

        // Apply worktree overlay so navigator and display use correct fields
        const project = worktreeId ? applyWorktreeOverlay(rawProject, worktreeId) : rawProject;
        const worktreeCtx = worktreeId
          ? (rawProject.worktrees ?? []).find((w) => w.id === worktreeId)
          : undefined;

        const nav = new WorkflowNavigator();
        const status = await nav.getStatus(project);

        if (opts.json) {
          printJson({ ...status, resolutionSource: source, ...(worktreeCtx ? { worktree: worktreeCtx } : {}) });
          return;
        }

        const sourceLabels: Record<ResolutionSource, string> = {
          flag: '(--project flag)',
          cwd: '(from CWD)',
          worktree: '(from CWD)',
          default: '(default)',
          none: '',
        };

        // When worktree is resolved, show a dedicated Worktree line instead of
        // embedding worktree info in the Project line's source label.
        const sourceLabel = sourceLabels[source];
        const projectLine = sourceLabel
          ? `${valueStyle(status.project)}  ${dim(sourceLabel)}`
          : valueStyle(status.project);
        console.log(label('Project:  ') + projectLine);

        if (worktreeCtx) {
          const range = worktreeCtx.indexRange
            ? ` [${worktreeCtx.indexRange[0]}-${worktreeCtx.indexRange[1]}]`
            : '';
          console.log(label('Worktree: ') + valueStyle(`${worktreeCtx.name}${range}`));
        }

        console.log(label('Date:     ') + valueStyle(project.dateProject || 'Not set'));
        console.log(label('Phase:    ') + valueStyle(status.phase ?? 'Not set'));
        console.log(label('Arch:     ') + valueStyle(project.fileArch || 'Not set'));
        console.log(label('Plan:     ') + valueStyle(project.fileSlicePlan || 'Not set'));
        console.log(label('Slice:    ') + valueStyle(project.fileSlice || 'Not set'));
        console.log(label('Tasks:    ') + valueStyle(project.fileTasks || 'Not set'));

        if (status.activeSlice?.taskProgress) {
          const { completed, total, inferredStatus } = status.activeSlice.taskProgress;
          console.log(label('Progress: ') + valueStyle(`${completed}/${total} tasks (${inferredStatus})`));
        }

        if (status.activeSlice && status.activeSlice.status !== 'no-active-slice') {
          console.log(label('Status:   ') + valueStyle(status.activeSlice.status));
        }

        if (status.slicePlan) {
          console.log('');
          console.log(label('Slice Plan'));
          console.log(dim(`  ${status.slicePlan.completed}/${status.slicePlan.total} slices complete`));
        }
      } catch (err) {
        handleError(err);
      }
    });
}
