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
import { delivered, type GuideRuleEntry } from './guideRules.js';
import type { Printer } from './output.js';

/** Heading of the section, the last thing inside each composite block. */
export const RESOLUTIONS_HEADING = '## Project Rule Resolutions';

/** The line under the heading that tells the agent how to read the bullets. */
export const RESOLUTIONS_PRECEDENCE =
  "Where a rule above conflicts with the project's own rules, the resolution below applies.";

export interface ResolutionClassification {
  /** Both identities exist and the guide rule is delivered: rendered. */
  live: RuleResolution[];
  /** `guideRule` is not in the guide: warned about, not rendered. */
  staleGuide: RuleResolution[];
  /** `projectSource` is not in the checkout: warned about, not rendered. */
  staleProject: RuleResolution[];
}

/**
 * Splits resolutions by whether their identities still exist. A resolution on a
 * rule that exists but is not delivered (excluded) is in none of the lists: it
 * is neither rendered nor reported.
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
    } else if (delivered(entry)) {
      result.live.push(resolution);
    }
  }
  return result;
}

/** The section for the live resolutions, in file order; `''` when there are none. */
export function renderResolutions(live: readonly RuleResolution[]): string {
  if (live.length === 0) return '';
  const bullets = live.map((r) => `- \`${r.guideRule}\` vs \`${r.projectSource}\`: ${r.statement}`);
  return [RESOLUTIONS_HEADING, RESOLUTIONS_PRECEDENCE, '', ...bullets].join('\n') + '\n';
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
