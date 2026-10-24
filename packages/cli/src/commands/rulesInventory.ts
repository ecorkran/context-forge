/**
 * The read-only inventory behind `cf rules inventory` and `cf rules resolve`
 * (slice 266): the guide's rules, the project's own rule sources, and the stored
 * resolutions. cf lists facts here; comparing rule meaning is the agent's job.
 */
import {
  projectRuleSources,
  readRuleResolutions,
  type ProjectRuleSource,
  type RuleResolution,
} from '@context-forge/core/node';
import { RuleExclusions } from '../ideInstall/exclusions.js';
import { guideRuleEntries, type GuideRuleEntry } from '../ideInstall/guideRules.js';
import { readInstalledPaths } from '../ideInstall/manifest.js';
import { requireGuideDir } from '../utils/guideReady.js';
import { readRulesExclude } from './setup-ide.js';

export interface RulesInventory {
  guideRules: GuideRuleEntry[];
  projectSources: ProjectRuleSource[];
  resolutions: RuleResolution[];
}

/** Builds the inventory for the checkout at `projectPath`. Writes nothing. */
export async function buildInventory(projectPath: string): Promise<RulesInventory> {
  const guideDir = await requireGuideDir(projectPath);
  const exclusions = new RuleExclusions(await readRulesExclude(projectPath));
  return {
    guideRules: guideRuleEntries(guideDir, projectPath, exclusions),
    projectSources: projectRuleSources(projectPath, readInstalledPaths(projectPath)),
    resolutions: readRuleResolutions(projectPath),
  };
}
