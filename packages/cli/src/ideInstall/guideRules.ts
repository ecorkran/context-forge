/**
 * The guide's rule files as rule reconciliation sees them (slice 266, D1/D7):
 * one entry per rule with its delivery state. Delivery is decided here and
 * nowhere else; the inventory and the resolution renderer both read it through
 * `delivered`, which is the one predicate issue #123 later extends.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { RuleExclusions } from './exclusions.js';
import { isDirectory, listMarkdownFiles } from './fsChecks.js';
import { hasAlwaysApply } from './frontmatter.js';
import { guidePaths, relativeToRoot } from './paths.js';

export type GuideRuleKind = 'alwaysApply' | 'scoped';

export interface GuideRuleEntry {
  /** Basename in the guide's `rules/` directory: the identity a resolution keys on. */
  rule: string;
  /** Path relative to the checkout (absolute when the guide lies outside it). */
  path: string;
  kind: GuideRuleKind;
  excluded: boolean;
}

/**
 * The guide's rules, sorted by name. `root` is the checkout the paths are shown
 * relative to. An alwaysApply rule is compiled into every managed block and is
 * never excluded, so it must not be passed to `exclusions.isExcluded`: that call
 * records a match and would hide the "names an always-on rule" warning.
 */
export function guideRuleEntries(
  guideDir: string,
  root: string,
  exclusions: RuleExclusions,
): GuideRuleEntry[] {
  const rulesDir = guidePaths(guideDir).rules;
  if (!isDirectory(rulesDir)) throw new Error(`Guide rules directory not found: ${rulesDir}`);
  return listMarkdownFiles(rulesDir).map((file) => {
    const rule = path.basename(file);
    const kind: GuideRuleKind = hasAlwaysApply(fs.readFileSync(file, 'utf-8')) ? 'alwaysApply' : 'scoped';
    return {
      rule,
      path: relativeToRoot(path.resolve(root), file),
      kind,
      excluded: kind === 'scoped' && exclusions.isExcluded(rule),
    };
  });
}

/** True when the rule reaches the composite blocks (and so its resolutions render). */
export function delivered(entry: GuideRuleEntry): boolean {
  return !entry.excluded;
}
