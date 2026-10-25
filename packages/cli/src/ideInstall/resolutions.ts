/**
 * Rendering stored rule resolutions into the composite managed blocks, and
 * warning about resolutions whose file pair no longer exists (slice 266, D4/D5).
 * cf renders each statement verbatim and never reads it for meaning.
 */
import * as path from 'node:path';
import {
  pathPresent,
  RULE_RESOLUTIONS_DIR,
  RULE_RESOLUTIONS_FILE,
  type RuleResolution,
} from '@context-forge/core/node';
import { deliveredTo, type GuideRuleEntry } from './guideRules.js';
import type { Printer } from './output.js';
import { RULE_AUDIENCE, type CompositeAudience } from './ruleAudience.js';

/** The audiences with a composite block, each rendered with its own section. */
export const COMPOSITE_AUDIENCES: readonly CompositeAudience[] = [
  RULE_AUDIENCE.Claude,
  RULE_AUDIENCE.Agents,
  RULE_AUDIENCE.Copilot,
];

/** Heading of the section, the last thing inside each composite block. */
export const RESOLUTIONS_HEADING = '## Project Rule Resolutions';

/** The line under the heading that tells the agent how to read the bullets. */
export const RESOLUTIONS_PRECEDENCE =
  "Where a rule above conflicts with the project's own rules, the resolution below applies.";

export interface ResolutionClassification {
  /** Both identities exist and the guide rule reaches a composite block: rendered there. */
  live: RuleResolution[];
  /** `guideRule` is not in the guide: warned about, not rendered. */
  staleGuide: RuleResolution[];
  /** `projectSource` is not in the checkout: warned about, not rendered. */
  staleProject: RuleResolution[];
}

/**
 * Splits resolutions by whether their identities still exist. A resolution on a
 * rule that exists but reaches no composite block (excluded, or marked for
 * other agents only) is in none of the lists: it is neither rendered nor reported.
 */
export function classifyResolutions(
  resolutions: readonly RuleResolution[],
  guideEntries: readonly GuideRuleEntry[],
  projectRoot: string,
): ResolutionClassification {
  const result: ResolutionClassification = { live: [], staleGuide: [], staleProject: [] };
  for (const resolution of resolutions) {
    const entry = guideEntries.find((e) => e.rule === resolution.guideRule);
    if (entry === undefined) {
      result.staleGuide.push(resolution);
    } else if (!pathPresent(path.join(projectRoot, resolution.projectSource))) {
      result.staleProject.push(resolution);
    } else if (COMPOSITE_AUDIENCES.some((audience) => deliveredTo(entry, audience))) {
      result.live.push(resolution);
    }
  }
  return result;
}

/**
 * The section for the live resolutions whose guide rule reaches `audience`, in
 * file order; `''` when there are none.
 */
export function renderResolutions(
  live: readonly RuleResolution[],
  guideEntries: readonly GuideRuleEntry[],
  audience: CompositeAudience,
): string {
  const shown = live.filter((r) => {
    const entry = guideEntries.find((e) => e.rule === r.guideRule);
    return entry !== undefined && deliveredTo(entry, audience);
  });
  if (shown.length === 0) return '';
  const bullets = shown.map((r) => `- \`${r.guideRule}\` vs \`${r.projectSource}\`: ${r.statement}`);
  return [RESOLUTIONS_HEADING, RESOLUTIONS_PRECEDENCE, '', ...bullets].join('\n') + '\n';
}

/** One section per composite block, each '' until resolutions are rendered. */
export const EMPTY_RESOLUTION_SECTIONS: Readonly<Record<CompositeAudience, string>> = Object.freeze(
  Object.fromEntries(COMPOSITE_AUDIENCES.map((audience) => [audience, ''])) as Record<CompositeAudience, string>,
);

/** The section for every composite block, built from `COMPOSITE_AUDIENCES`. */
export function renderAllResolutions(
  live: readonly RuleResolution[],
  guideEntries: readonly GuideRuleEntry[],
): Readonly<Record<CompositeAudience, string>> {
  // fromEntries loses the key type; the keys are exactly COMPOSITE_AUDIENCES.
  return Object.fromEntries(
    COMPOSITE_AUDIENCES.map((audience) => [audience, renderResolutions(live, guideEntries, audience)]),
  ) as Record<CompositeAudience, string>;
}

const REMEDY = `re-run reconciliation or edit ${RULE_RESOLUTIONS_DIR}/${RULE_RESOLUTIONS_FILE}`;

/** Stale-identity warnings on stderr. They never change the exit code. */
export function warnStaleResolutions(classification: ResolutionClassification, out: Printer): void {
  for (const r of classification.staleGuide) {
    out.statusErr(
      'yellow',
      `⚠️  resolution ${r.guideRule} vs ${r.projectSource} names a guide rule the guide no longer has; ${REMEDY}`,
    );
  }
  for (const r of classification.staleProject) {
    out.statusErr(
      'yellow',
      `⚠️  resolution ${r.guideRule} vs ${r.projectSource} names a project file that no longer exists; ${REMEDY}`,
    );
  }
}
