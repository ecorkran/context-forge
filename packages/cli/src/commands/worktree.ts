import * as os from 'node:os';
import { Command } from 'commander';
import {
  FileProjectStore,
  WorktreeService,
  GitWorktreeDiscovery,
  resolveFileByIndex,
} from '@context-forge/core/node';
import type { WorktreeInfo, WorktreePathStatus } from '@context-forge/core';
import { resolveProjectWorktree, findWorktreeByNameOrId } from '../utils/project.js';
import { handleError, UserError } from '../utils/errors.js';
import { askConfirmation } from '../utils/confirm.js';
import { printJson } from '../output/formatter.js';
import { renderTable } from '../output/tables.js';
import { success, dim, warn } from '../output/styles.js';

/** Shorten an absolute path by replacing the home directory with ~. */
function shortenPath(p: string): string {
  const home = os.homedir();
  if (p === home) return '~';
  if (p.startsWith(home + '/')) return '~' + p.slice(home.length);
  return p;
}

/** Parse and validate a range string like "100-199" into [start, end]. */
function parseRange(rangeStr: string): [number, number] {
  if (!/^\d+-\d+$/.test(rangeStr)) {
    throw new UserError(`Invalid range format. Use start-end, e.g. 100-199`);
  }
  const [startStr, endStr] = rangeStr.split('-');
  const start = parseInt(startStr, 10);
  const end = parseInt(endStr, 10);
  if (start > end) {
    throw new UserError(`Range start must be <= end, got ${start}-${end}`);
  }
  return [start, end];
}

export function registerWorktreeCommand(program: Command): void {
  const worktree = program
    .command('worktree')
    .description('Manage worktree contexts for a project');

  // ── cf worktree init ────────────────────────────────────────────────────────
  worktree
    .command('init')
    .description('Register a new worktree context for the active project')
    .requiredOption('--name <name>', 'Name for this worktree context')
    .requiredOption('--range <start-end>', 'Slice index range, e.g. 100-199')
    .option('--path <path>', 'Absolute path to the git worktree directory (default: CWD)')
    .option('--project <name|id>', 'Project name or ID (overrides default)')
    .action(async (opts: { name: string; range: string; path?: string; project?: string }) => {
      try {
        const indexRange = parseRange(opts.range);
        const store = new FileProjectStore();
        const resolved = await resolveProjectWorktree({ project: opts.project }, store);
        const projectId = resolved.id;

        const project = await store.getById(projectId);
        if (!project) {
          throw new UserError(`Project not found: '${projectId}'.`);
        }

        const worktreePath = opts.path ?? process.cwd();

        // Validate path via git (warn if unavailable, hard-error if path not in list)
        if (project.projectPath) {
          const gitWorktrees = await new GitWorktreeDiscovery().listWorktrees(project.projectPath);
          if (gitWorktrees.length === 0) {
            console.error(
              warn(
                `Warning: could not verify path is a git worktree (git unavailable or not a git repo). Proceeding anyway.`,
              ),
            );
          } else {
            const known = gitWorktrees.map((wt: WorktreeInfo) => wt.path);
            const normalizedPath = worktreePath.endsWith('/') ? worktreePath.slice(0, -1) : worktreePath;
            if (!known.includes(normalizedPath)) {
              throw new UserError(
                `Path '${worktreePath}' is not a registered git worktree.\n` +
                  `  Run 'git worktree list' to see available worktrees.\n` +
                  `  Use 'git worktree add <path>' to create a new one first.`,
              );
            }
          }
        }

        // Auto-discover archDoc and slicePlan from range base
        const base = String(indexRange[0]);
        let archDoc: string | undefined;
        let slicePlan: string | undefined;

        if (project.projectPath) {
          try {
            const resolved = resolveFileByIndex(project.projectPath, 'fileArch', base);
            if (resolved) archDoc = resolved;
          } catch {
            // No arch file for this range base — skip
          }
          try {
            const resolved = resolveFileByIndex(project.projectPath, 'fileSlicePlan', base);
            if (resolved) slicePlan = resolved;
          } catch {
            // No slice plan for this range base — skip
          }
        }

        const svc = new WorktreeService(store);
        const { worktree: created, migrated, overlaps } = await svc.addWorktree(projectId, {
          name: opts.name,
          indexRange,
          worktreePath,
          archDoc,
          slicePlan,
        });

        if (migrated) {
          console.log(
            dim(
              `Note: Existing workflow fields were migrated to a 'Default' worktree context (range 0-99).`,
            ),
          );
        }

        if (overlaps.length > 0) {
          for (const o of overlaps) {
            console.log(
              warn(
                `Warning: Range ${indexRange[0]}-${indexRange[1]} overlaps with worktree '${o.existingWorktreeName}' (${o.existingRange[0]}-${o.existingRange[1]}) at ${o.overlapStart}-${o.overlapEnd}.`,
              ),
            );
          }
        }

        console.log(
          success(
            `Worktree context '${created.name}' created (${indexRange[0]}-${indexRange[1]}) on project '${project.name}'.`,
          ),
        );
        if (archDoc) console.log(dim(`  arch:  ${archDoc}`));
        if (slicePlan) console.log(dim(`  plan:  ${slicePlan}`));
      } catch (err) {
        handleError(err);
      }
    });

  // ── cf worktree list ────────────────────────────────────────────────────────
  worktree
    .command('list')
    .description('List worktree contexts for the active project')
    .option('--project <name|id>', 'Project name or ID (overrides default)')
    .option('--json', 'Output as JSON')
    .action(async (opts: { project?: string; json?: boolean }) => {
      try {
        const store = new FileProjectStore();
        const resolved = await resolveProjectWorktree({ project: opts.project }, store);
        const projectId = resolved.id;
        const activeWorktreeId = resolved.worktreeId;

        const project = await store.getById(projectId);
        if (!project) {
          throw new UserError(`Project not found: '${projectId}'.`);
        }

        const worktrees = project.worktrees ?? [];

        // Validate worktree paths against git worktree list
        let pathStatuses: WorktreePathStatus[] = [];
        if (worktrees.length > 0 && project.projectPath) {
          try {
            const gitWorktrees = await new GitWorktreeDiscovery().listWorktrees(project.projectPath);
            const svc = new WorktreeService(store);
            pathStatuses = await svc.validateWorktreePaths(projectId, gitWorktrees);
          } catch {
            // Git discovery failure — proceed without status indicators
          }
        }
        const statusMap = new Map(pathStatuses.map((s) => [s.worktreeId, s.status]));

        if (opts.json) {
          printJson({ worktrees, activeWorktreeId, pathStatuses: pathStatuses.length > 0 ? pathStatuses : undefined });
          return;
        }

        if (worktrees.length === 0) {
          console.log(
            `  No worktree contexts registered for project '${project.name}'. Run cf worktree init to create one.`,
          );
          return;
        }

        const rows: string[][] = [];
        const prefixes: string[] = [];

        for (const wt of worktrees) {
          const isActive = wt.id === activeWorktreeId;
          const rangeStr = `[${wt.indexRange[0]}-${wt.indexRange[1]}]`;
          let pathStr = wt.worktreePath ? shortenPath(wt.worktreePath) : dim('—');

          // Append stale path indicator
          const pathStatus = statusMap.get(wt.id);
          if (pathStatus === 'missing') {
            pathStr += ' ' + warn('(removed)');
          } else if (pathStatus === 'not-a-worktree') {
            pathStr += ' ' + warn('(not a git worktree)');
          }

          const archStr = wt.archDoc ?? dim('—');
          const planStr = wt.slicePlan ?? dim('—');

          if (isActive) {
            rows.push([success(wt.name), success(rangeStr), success(pathStr), success(archStr), success(planStr)]);
            prefixes.push(success('* '));
          } else {
            rows.push([wt.name, rangeStr, pathStr, archStr, planStr]);
            prefixes.push('  ');
          }
        }

        console.log(renderTable(['Name', 'Range', 'Path', 'Arch', 'Plan'], rows, prefixes));
      } catch (err) {
        handleError(err);
      }
    });

  // ── cf worktree update ─────────────────────────────────────────────────────
  worktree
    .command('update [nameOrId]')
    .description('Update a worktree context (rename, change range or path)')
    .option('--name <name>', 'New display name')
    .option('--range <start-end>', 'New slice index range, e.g. 150-249')
    .option('--path <path>', 'New worktree directory path')
    .option('--project <name|id>', 'Project name or ID (overrides default)')
    .action(
      async (
        nameOrId: string | undefined,
        opts: { name?: string; range?: string; path?: string; project?: string },
      ) => {
        try {
          if (!opts.name && !opts.range && !opts.path) {
            throw new UserError(
              `At least one update option is required: --name, --range, or --path`,
            );
          }

          const store = new FileProjectStore();
          const resolved = await resolveProjectWorktree({ project: opts.project }, store);
          const projectId = resolved.id;

          const project = await store.getById(projectId);
          if (!project) {
            throw new UserError(`Project not found: '${projectId}'.`);
          }

          // Resolve target worktree
          let targetId: string | undefined;

          if (nameOrId) {
            const found = await findWorktreeByNameOrId(projectId, nameOrId, store);
            if (!found) {
              throw new UserError(
                `Worktree '${nameOrId}' not found on project '${project.name}'.\n` +
                  `  Run 'cf worktree list' to see available worktrees.`,
              );
            }
            targetId = found.id;
          } else if (resolved.worktreeId) {
            targetId = resolved.worktreeId;
          } else {
            throw new UserError(
              `No worktree specified and none resolved from CWD.\n` +
                `  Run 'cf worktree list' to see available worktrees, then:\n` +
                `  cf worktree update <name|id> --name <new-name>`,
            );
          }

          // Build updates object
          const updates: Record<string, unknown> = {};

          if (opts.name) {
            updates.name = opts.name;
          }

          let indexRange: [number, number] | undefined;
          if (opts.range) {
            indexRange = parseRange(opts.range);
            updates.indexRange = indexRange;
          }

          if (opts.path) {
            // Validate path against git worktree list (same as init)
            if (project.projectPath) {
              const gitWorktrees = await new GitWorktreeDiscovery().listWorktrees(
                project.projectPath,
              );
              if (gitWorktrees.length === 0) {
                console.error(
                  warn(
                    `Warning: could not verify path is a git worktree (git unavailable or not a git repo). Proceeding anyway.`,
                  ),
                );
              } else {
                const known = gitWorktrees.map((wt: WorktreeInfo) => wt.path);
                const normalizedPath = opts.path.endsWith('/') ? opts.path.slice(0, -1) : opts.path;
                if (!known.includes(normalizedPath)) {
                  throw new UserError(
                    `Path '${opts.path}' is not a registered git worktree.\n` +
                      `  Run 'git worktree list' to see available worktrees.\n` +
                      `  Use 'git worktree add <path>' to create a new one first.`,
                  );
                }
              }
            }
            updates.worktreePath = opts.path;
          }

          const svc = new WorktreeService(store);
          const updated = await svc.updateWorktree(projectId, targetId, updates);

          // Check for overlaps when range changed
          if (indexRange) {
            const overlaps = await svc.findOverlaps(projectId, indexRange, targetId);
            for (const o of overlaps) {
              console.log(
                warn(
                  `Warning: Range ${indexRange[0]}-${indexRange[1]} overlaps with worktree '${o.existingWorktreeName}' (${o.existingRange[0]}-${o.existingRange[1]}) at ${o.overlapStart}-${o.overlapEnd}.`,
                ),
              );
            }
          }

          console.log(success(`Worktree context '${updated.name}' updated.`));
        } catch (err) {
          handleError(err);
        }
      },
    );

  // ── cf worktree rm ──────────────────────────────────────────────────────────
  worktree
    .command('rm [nameOrId]')
    .description('Remove a worktree context from the active project')
    .option('--project <name|id>', 'Project name or ID (overrides default)')
    .option('--yes', 'Skip confirmation prompt')
    .action(async (nameOrId: string | undefined, opts: { project?: string; yes?: boolean }) => {
      try {
        const store = new FileProjectStore();
        const resolved = await resolveProjectWorktree({ project: opts.project }, store);
        const projectId = resolved.id;

        const project = await store.getById(projectId);
        if (!project) {
          throw new UserError(`Project not found: '${projectId}'.`);
        }

        // Resolve target worktree
        let targetId: string | undefined;

        if (nameOrId) {
          const found = await findWorktreeByNameOrId(projectId, nameOrId, store);
          if (!found) {
            throw new UserError(
              `Worktree '${nameOrId}' not found on project '${project.name}'.\n` +
                `  Run 'cf worktree list' to see available worktrees.`,
            );
          }
          targetId = found.id;
        } else if (resolved.worktreeId) {
          targetId = resolved.worktreeId;
        } else {
          throw new UserError(
            `No worktree specified and none resolved from CWD.\n` +
              `  Run 'cf worktree list' to see available worktrees, then:\n` +
              `  cf worktree rm <name|id>`,
          );
        }

        const worktrees = project.worktrees ?? [];
        const target = worktrees.find((wt) => wt.id === targetId);
        if (!target) {
          throw new UserError(
            `Worktree not found on project '${project.name}'.\n` +
              `  Run 'cf worktree list' to see available worktrees.`,
          );
        }

        if (!opts.yes) {
          console.log(`  Name:    ${target.name}`);
          console.log(`  Range:   ${target.indexRange[0]}-${target.indexRange[1]}`);
          console.log(`  Path:    ${target.worktreePath ?? dim('—')}`);
          console.log(`  Project: ${project.name}`);
          console.log(dim(`  Note: This removes the worktree context record only. Files on disk are not deleted.`));
          const confirmed = await askConfirmation(`Remove worktree '${target.name}'? [y/N] `);
          if (!confirmed) {
            console.log('Cancelled.');
            return;
          }
        }

        const svc = new WorktreeService(store);
        const { migrated } = await svc.removeWorktree(projectId, targetId);

        if (migrated) {
          console.log(
            dim(`Note: Workflow fields were restored to project level (last worktree removed).`),
          );
        }

        console.log(success(`Worktree context '${target.name}' removed from project '${project.name}'.`));
      } catch (err) {
        handleError(err);
      }
    });
}
