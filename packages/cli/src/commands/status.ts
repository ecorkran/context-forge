import { join } from 'node:path';
import { Command } from 'commander';
import { FileProjectStore, WorkflowNavigator, GitWorktreeDiscovery, parseSlicePlan, resolveArtifactPath, ConfigManager } from '@context-forge/core/node';
import { resolveProject } from '@context-forge/core';
import { resolveProjectWorktree, findWorktreeByNameOrId, type ResolutionSource } from '../utils/project.js';
import { applyWorktreeOverlay } from '../utils/worktree-overlay.js';
import { handleError, UserError } from '../utils/errors.js';
import { withJsonOption, withProjectOption } from '../options.js';
import { printJson } from '../output/formatter.js';
import { renderTable } from '../output/tables.js';
import { label, value as valueStyle, success, dim, warn } from '../output/styles.js';

export function registerStatusCommand(program: Command): void {
  const statusCmd = program
    .command('status')
    .description('Show workflow status for the active project');
  withJsonOption(statusCmd);
  withProjectOption(statusCmd);
  statusCmd
    .option('--worktree <name>', 'Show status for a specific worktree')
    .option('--worktrees', 'Show summary of all worktrees');
  statusCmd.action(async (opts: { json?: boolean; project?: string; worktree?: string; worktrees?: boolean }) => {
      try {
        if (opts.worktree && opts.worktrees) {
          throw new UserError('--worktree and --worktrees are mutually exclusive.');
        }

        const store = new FileProjectStore();
        const { id, source, worktreeId: cwdWorktreeId } = await resolveProjectWorktree({ project: opts.project }, store);
        const rawProject = await store.getById(id);

        if (!rawProject) {
          throw new UserError(`Project not found: '${id}'. Run cf project list to see available projects.`);
        }

        // ── --worktrees dashboard ──────────────────────────────────────────
        if (opts.worktrees) {
          const worktrees = rawProject.worktrees ?? [];
          if (worktrees.length === 0) {
            if (opts.json) {
              printJson([]);
            } else {
              console.log(dim('No worktrees configured.'));
            }
            return;
          }

          const summaries = await Promise.all(
            worktrees.map(async (wt) => {
              const overlaid = applyWorktreeOverlay(rawProject, wt.id);
              let sliceProgress = '—';

              const wtPath = wt.worktreePath ?? rawProject.projectPath;
              if (overlaid.fileSlicePlan && wtPath) {
                const planRelPath = resolveArtifactPath('fileSlicePlan', overlaid.fileSlicePlan);
                if (planRelPath) {
                  try {
                    const planPath = join(wtPath, planRelPath);
                    const plan = await parseSlicePlan(planPath);
                    sliceProgress = `${plan.completedSlices}/${plan.totalSlices} slices`;
                  } catch {
                    // Plan file may not exist on disk
                  }
                }
              }

              const isActive = wt.id === cwdWorktreeId;
              return {
                id: wt.id,
                name: wt.name,
                range: wt.indexRange ? `${wt.indexRange[0]}-${wt.indexRange[1]}` : '—',
                phase: overlaid.developmentPhase || '—',
                slice: overlaid.fileSlice || '—',
                progress: sliceProgress,
                isActive,
              };
            }),
          );

          if (opts.json) {
            printJson(summaries);
            return;
          }

          console.log(label('Project:  ') + valueStyle(rawProject.name));
          console.log('');

          const rows = summaries.map((s) => {
            const activeSuffix = s.isActive ? success(' ← active') : '';
            return [s.name + activeSuffix, s.range, s.phase, s.slice, s.progress];
          });

          console.log(label('Worktrees'));
          console.log(renderTable(['Name', 'Range', 'Phase', 'Slice', 'Progress'], rows));
          return;
        }

        // ── Single worktree / default status ───────────────────────────────

        // Resolve worktree: explicit --worktree flag takes priority over CWD resolution
        let resolvedWorktreeId = cwdWorktreeId;
        if (opts.worktree) {
          const wt = await findWorktreeByNameOrId(id, opts.worktree, store);
          if (!wt) {
            throw new UserError(`Worktree '${opts.worktree}' not found. Run cf worktree list to see available worktrees.`);
          }
          resolvedWorktreeId = wt.id;
        }

        // Apply worktree overlay so navigator and display use correct fields
        const project = await resolveProject(store, id, resolvedWorktreeId);
        if (!project) {
          throw new UserError(`Project not found: '${id}'.`);
        }
        const worktreeCtx = resolvedWorktreeId
          ? (rawProject.worktrees ?? []).find((w) => w.id === resolvedWorktreeId)
          : undefined;

        const config = new ConfigManager(project.projectPath);
        const nav = new WorkflowNavigator(config);
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
        // First-run messaging: suggest cf worktree init if CWD is a git worktree of a known project
        if (err instanceof UserError) {
          const shown = await showWorktreeSuggestion();
          if (shown) return;
        }
        handleError(err);
      }
    });
}

/**
 * When project resolution fails, check if CWD is a git worktree of a known project.
 * If so, display a helpful suggestion to create a worktree context.
 * Returns true if a suggestion was displayed.
 */
async function showWorktreeSuggestion(): Promise<boolean> {
  try {
    const discovery = new GitWorktreeDiscovery();
    const gitWorktrees = await discovery.listWorktrees(process.cwd());
    if (gitWorktrees.length === 0) return false;

    // Main worktree is the first entry from git worktree list
    const mainWorktreePath = gitWorktrees[0].path;

    // Check if main worktree path matches a registered project
    const store = new FileProjectStore();
    const projects = await store.getAll();
    const matchingProject = projects.find((p) => p.projectPath === mainWorktreePath);
    if (!matchingProject) return false;

    // Derive suggested name from current git branch
    const currentBranch = gitWorktrees.find((wt) => {
      const cwd = process.cwd();
      return wt.path === cwd || cwd.startsWith(wt.path + '/');
    })?.branch;
    let suggestedName = 'my-worktree';
    if (currentBranch) {
      // Strip refs/heads/ and common prefixes like feature/, bugfix/
      suggestedName = currentBranch
        .replace(/^refs\/heads\//, '')
        .replace(/^(feature|bugfix|hotfix|fix|chore|refactor)\//, '');
    }

    // Suggest next available 100-block range
    const existingWorktrees = matchingProject.worktrees ?? [];
    let maxEnd = 99;
    for (const wt of existingWorktrees) {
      if (wt.indexRange[1] > maxEnd) maxEnd = wt.indexRange[1];
    }
    const rangeStart = Math.ceil((maxEnd + 1) / 100) * 100;
    const rangeEnd = rangeStart + 99;

    console.log('');
    console.log(warn(`This directory appears to be a git worktree of project '${matchingProject.name}'.`));
    console.log(`Create a worktree context: ${dim(`cf worktree init --name '${suggestedName}' --range ${rangeStart}-${rangeEnd}`)}`);
    console.log('');
    return true;
  } catch {
    return false;
  }
}
