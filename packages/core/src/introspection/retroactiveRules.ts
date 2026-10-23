import { RETROACTIVE_NOTE } from './reviewGate.js';
import type { ConsistencyFinding, SlicePlanResult } from './types.js';

/** Rule id the skip info is reported under: the review gate is what skips them (D3). */
const REVIEW_GATE_RULE = 'review-gate';

/** Collapse sorted indices into `A–B` ranges for consecutive runs, comma-separated otherwise. */
function formatIndexRanges(sortedIndices: number[]): string {
  const parts: string[] = [];
  let runStart = 0;
  for (let i = 1; i <= sortedIndices.length; i++) {
    const continuesRun = i < sortedIndices.length && sortedIndices[i] === sortedIndices[i - 1] + 1;
    if (continuesRun) continue;
    const first = sortedIndices[runStart];
    const last = sortedIndices[i - 1];
    parts.push(first === last ? `${first}` : `${first}–${last}`);
    runStart = i;
  }
  return parts.join(', ');
}

/**
 * D3: one `info` finding per plan that has retroactive entries, so a 20-entry baseline is
 * one line. Emitted whether or not the entries are checked: a retroactive entry is never in
 * flight. The caller emits these only while gating is on.
 */
export function retroactiveSkipFindings(plans: SlicePlanResult[]): ConsistencyFinding[] {
  const findings: ConsistencyFinding[] = [];
  for (const plan of plans) {
    const indices = [
      ...new Set(plan.entries.filter((e) => e.retroactive).map((e) => e.index)),
    ].sort((a, b) => a - b);
    if (indices.length === 0) continue;
    findings.push({
      rule: REVIEW_GATE_RULE,
      severity: 'info',
      location: plan.filePath,
      description: `Slices ${formatIndexRanges(indices)} are ${RETROACTIVE_NOTE}. The review gate skips them.`,
      suggestedFix: 'None needed: retroactive entries record work that predates adoption',
      fixable: false,
    });
  }
  return findings;
}
