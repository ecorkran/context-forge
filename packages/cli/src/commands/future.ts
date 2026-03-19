import { Command } from 'commander';
import { FileProjectStore, FutureWorkCollector } from '@context-forge/core/node';
import { resolveProjectWorktree } from '../utils/project.js';
import { resolveOperationPath, getWorktreeIndexRange, isInIndexRange } from '../utils/worktree-overlay.js';
import { handleError, UserError } from '../utils/errors.js';
import { printJson } from '../output/formatter.js';
import { label, value as valueStyle, dim, success } from '../output/styles.js';

export function registerFutureCommand(program: Command): void {
  program
    .command('future')
    .description('Show consolidated future work across slice plans')
    .option('--json', 'Output as JSON')
    .option('--project <id>', 'Project ID or name (overrides default)')
    .option('--status <filter>', 'Filter by status: all, pending, completed', 'all')
    .action(async (opts: { json?: boolean; project?: string; status: string }) => {
      try {
        const store = new FileProjectStore();
        const { id, worktreeId } = await resolveProjectWorktree({ project: opts.project }, store);
        const project = await store.getById(id);

        if (!project) {
          throw new UserError(`Project not found: '${id}'. Run cf project list to see available projects.`);
        }

        const operationPath = resolveOperationPath(project, worktreeId);
        if (!operationPath) {
          throw new UserError(
            `Project '${project.name}' has no projectPath configured.\n` +
              '  cf project set projectPath /path/to/project',
          );
        }

        const indexRange = getWorktreeIndexRange(project, worktreeId);
        const statusFilter = opts.status as 'all' | 'pending' | 'completed';
        const collector = new FutureWorkCollector();
        const result = await collector.collect(operationPath, statusFilter);

        // Filter groups by index range when in a non-default worktree
        if (indexRange) {
          result.groups = result.groups.filter((g) => {
            const m = /^(\d+)/.exec(g.initiativeName);
            return m ? isInIndexRange(parseInt(m[1], 10), indexRange) : true;
          });
          result.totalItems = result.groups.reduce((sum, g) => sum + g.totalItems, 0);
          result.completedItems = result.groups.reduce((sum, g) => sum + g.completedItems, 0);
          result.pendingItems = result.totalItems - result.completedItems;
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
