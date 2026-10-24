/**
 * `cf rules`: the deterministic half of conventions reconciliation (slice 266).
 * `inventory` lists the guide's rules and the project's own rule sources;
 * `resolve` records a PM decision about a conflict between a pair. cf never
 * judges whether two rules conflict: the guide prompt has the agent do that.
 */
import { Command } from 'commander';
import { addRuleResolution } from '@context-forge/core/node';
import { handleError, UserError } from '../utils/errors.js';
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

  const resolveCmd = rulesCmd
    .command('resolve')
    .description('Record the PM\'s decision about a conflict between a guide rule and a project rule source')
    .argument('<guideRule>', 'Guide rule file name, as listed by cf rules inventory')
    .argument('<projectSource>', 'Project rule source path, as listed by cf rules inventory')
    .requiredOption('--statement <text>', 'One line saying which rule applies and how');
  withProjectOption(resolveCmd);
  resolveCmd.action(
    async (guideRule: string, projectSource: string, opts: { statement: string; project?: string }) => {
      try {
        const project = await resolvePathedProject(opts.project);
        const inventory = await buildInventory(project.projectPath);

        const guideNames = inventory.guideRules.map((r) => r.rule);
        if (!guideNames.includes(guideRule)) {
          throw new UserError(`Unknown guide rule '${guideRule}'. Valid guide rules: ${guideNames.join(', ')}`);
        }
        const sourcePaths = inventory.projectSources.map((s) => s.path);
        if (!sourcePaths.includes(projectSource)) {
          throw new UserError(
            `Unknown project source '${projectSource}'. Valid project sources: ${sourcePaths.join(', ') || '(none)'}`,
          );
        }

        addRuleResolution(project.projectPath, { guideRule, projectSource, statement: opts.statement });
        console.log(`Recorded resolution ${guideRule} vs ${projectSource}. Run cf setup-ide <target> to apply.`);
      } catch (err) {
        handleError(err);
      }
    },
  );
}
