import { detectDocuments } from './parsers/documentDetector.js';
import { RETROACTIVE_NOTE } from './reviewGate.js';
import { STATUS } from './types.js';
import type { ConsistencyFinding, SlicePlanEntry, SlicePlanResult } from './types.js';

/** Rule id for the structural checks on the marker (D4). */
const RETROACTIVE_ENTRY_RULE = 'retroactive-entry';

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

/** One structural error on a retroactive entry; every cause needs a human decision (D4). */
function structuralError(
  planPath: string,
  description: string,
  suggestedFix: string,
): ConsistencyFinding {
  return { rule: RETROACTIVE_ENTRY_RULE, severity: 'error', location: planPath, description, suggestedFix, fixable: false };
}

/** Indexed entries are the only ones that can be retroactive; a fallback index is not a real slice index. */
function isExplicit(entry: SlicePlanEntry): boolean {
  return entry.indexSource === 'explicit';
}

/** Lowest index of any explicit entry that is new work: neither retroactive nor deprecated. */
function lowestNewWorkIndex(plans: SlicePlanResult[]): number | null {
  let lowest: number | null = null;
  for (const plan of plans) {
    for (const entry of plan.entries) {
      if (!isExplicit(entry) || entry.retroactive || entry.status === STATUS.Deprecated) continue;
      if (lowest === null || entry.index < lowest) lowest = entry.index;
    }
  }
  return lowest;
}

/**
 * D4: the three structural rules that bound what the marker can do. Runs once per checkAll over
 * every parsed plan, whether or not gating is on.
 *   1. a retroactive entry has no slice design or task file (this closes the gate loophole:
 *      new work always produces them);
 *   2. it is checked;
 *   3. it is indexed before all new work.
 */
export async function ruleRetroactiveEntries(
  projectPath: string,
  plans: SlicePlanResult[],
): Promise<ConsistencyFinding[]> {
  const findings: ConsistencyFinding[] = [];
  const firstNewWork = lowestNewWorkIndex(plans);

  for (const plan of plans) {
    for (const entry of plan.entries) {
      if (!entry.retroactive || !isExplicit(entry)) continue;

      const docs = await detectDocuments(projectPath, entry.index);
      const files = [docs.sliceDesign, ...(docs.taskFile ?? [])].filter((f): f is string => f !== null);
      if (files.length > 0) {
        findings.push(structuralError(
          plan.filePath,
          `Slice ${entry.index} is marked retroactive but has a slice design / task file (${files.join(', ')}). ` +
            'Retroactive entries record work that predates adoption and never have them.',
          'Remove the marker, or remove the files if they were created by mistake',
        ));
      }
      if (!entry.isChecked) {
        findings.push(structuralError(
          plan.filePath,
          `Slice ${entry.index} is marked retroactive but is not checked. A retroactive entry records completed work.`,
          'Check it, or remove the marker',
        ));
      }
      if (firstNewWork !== null && entry.index > firstNewWork) {
        findings.push(structuralError(
          plan.filePath,
          `Slice ${entry.index} is marked retroactive but is indexed after new work (slice ${firstNewWork}). ` +
            'Retroactive entries precede all new work.',
          'Renumber it before the new work, or remove the marker',
        ));
      }
    }
  }
  return findings;
}
