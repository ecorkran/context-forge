/**
 * `cf rules`: the deterministic half of conventions reconciliation (slice 266).
 * `inventory` lists the guide's rules and the project's own rule sources;
 * `resolve` records a PM decision about a conflict between a pair. cf never
 * judges whether two rules conflict: the guide prompt has the agent do that.
 */
import { Command } from 'commander';
import { handleError } from '../utils/errors.js';
import { withJsonOption, withProjectOption } from '../options.js';
import { printJson } from '../output/formatter.js';
import { resolvePathedProject } from '../utils/project.js';
import { buildInventory } from './rulesInventory.js';

export function registerRulesCommand(program: Command): void {
  const rulesCmd = program
    .command('rules')
    .description('Reconcile the project\'s own rules with the guide\'s rules');

  const inventoryCmd = rulesCmd
    .command('inventory')
    .description('List guide rules, project rule sources and stored resolutions as JSON (read-only)');
  // JSON is the only output; --json is accepted so the documented spelling works.
  withJsonOption(inventoryCmd);
  withProjectOption(inventoryCmd);
  inventoryCmd.action(async (opts: { project?: string }) => {
    try {
      const project = await resolvePathedProject(opts.project);
      printJson(await buildInventory(project.projectPath));
    } catch (err) {
      handleError(err);
    }
  });
}
