import { Command } from 'commander';
import { FileProjectStore, FutureWorkCollector } from '@context-forge/core/node';
import { resolveProjectWorktree } from '../utils/project.js';
import { resolveOperationPath, getWorktreeIndexRange, isInIndexRange, resolveAllOperationPaths } from '../utils/worktree-overlay.js';
import { handleError, UserError } from '../utils/errors.js';
import { withJsonOption, withAllOption, withProjectOption } from '../options.js';
import { printJson } from '../output/formatter.js';
import { label, value as valueStyle, dim, success } from '../output/styles.js';

export function registerFutureCommand(program: Command): void {
  const futureCmd = program
    .command('future')
    .description('Show consolidated future work across slice plans');
  withJsonOption(futureCmd);
  withAllOption(futureCmd);
  withProjectOption(futureCmd);
  futureCmd.option('--status <filter>', 'Filter by status: all, pending, completed', 'all');
  futureCmd.action(async (opts: { json?: boolean; all?: boolean; project?: string; status: string }) => {
      try {
        const store = new FileProjectStore();
        const { id, worktreeId } = await resolveProjectWorktree({ project: opts.project }, store);
        const project = await store.getById(id);

        if (!project) {
          throw new UserError(`Project not found: '${id}'. Run cf project list to see available projects.`);
        }

        const statusFilter = opts.status as 'all' | 'pending' | 'completed';
        const collector = new FutureWorkCollector();
        let result;

        if (opts.all && project.worktrees?.length) {
          const paths = resolveAllOperationPaths(project);
          // Collect from all paths, merge results (deduplicate by initiative name)
          const results = await Promise.all(
            paths.map((p) => collector.collect(p, statusFilter).catch(() => null)),
          );
          const validResults = results.filter((r): r is NonNullable<typeof r> => r !== null);
          if (validResults.length === 0) {
            throw new UserError('No future work found across any worktree path.');
          }
          // Merge: deduplicate groups by initiativeName (first wins)
          const seenGroups = new Set<string>();
          const mergedGroups = [];
          for (const r of validResults) {
            for (const g of r.groups) {
              if (!seenGroups.has(g.initiativeName)) {
                seenGroups.add(g.initiativeName);
                mergedGroups.push(g);
              }
            }
          }
          result = {
            ...validResults[0],
            groups: mergedGroups,
            totalItems: mergedGroups.reduce((sum, g) => sum + g.totalItems, 0),
            completedItems: mergedGroups.reduce((sum, g) => sum + g.completedItems, 0),
            pendingItems: 0,
            markdown: '',
          };
          result.pendingItems = result.totalItems - result.completedItems;
        } else {
          const operationPath = resolveOperationPath(project, worktreeId);
          if (!operationPath) {
            throw new UserError(
              `Project '${project.name}' has no projectPath configured.\n` +
                '  cf project set projectPath /path/to/project',
            );
          }

          const indexRange = getWorktreeIndexRange(project, worktreeId);
          result = await collector.collect(operationPath, statusFilter);

          // Filter groups by index range
          if (indexRange) {
            result.groups = result.groups.filter((g) => {
              const m = /^(\d+)/.exec(g.initiativeName);
              return m ? isInIndexRange(parseInt(m[1], 10), indexRange) : true;
            });
            result.totalItems = result.groups.reduce((sum, g) => sum + g.totalItems, 0);
            result.completedItems = result.groups.reduce((sum, g) => sum + g.completedItems, 0);
            result.pendingItems = result.totalItems - result.completedItems;
          }
        }

        if (opts.json) {
          printJson(result);
          return;
        }

        // Terminal output: grouped by initiative
        for (const group of result.groups) {
          console.log(label(`\n${group.initiativeName}`));
          for (const item of group.items) {
            const marker = item.done ? success('[x]') : dim('[ ]');
            console.log(`  ${marker} ${item.name}`);
          }
          console.log(dim(`  ${group.completedItems}/${group.totalItems} complete`));
        }

        console.log('');
        console.log(
          valueStyle(`Total: ${result.totalItems} items, ${result.pendingItems} pending`),
        );
      } catch (err) {
        handleError(err);
      }
    });
}
