// Type-only: sourceVolume.ts imports the threshold from this file, so a value import would cycle.
import type { SourceVolume } from '../detection/sourceVolume.js';
import type { PlanningFacts } from './planningFacts.js';

/**
 * Brownfield iff the project folder holds at least this many non-blank source lines (D1).
 * The one place the threshold is written; deliberately not configurable (the
 * `adoption.state = "declined"` opt-out is the safety valve).
 */
export const BROWNFIELD_MIN_SOURCE_LINES = 2000;

/** What the opt-out and the planning files decide, before any source walk (slice 269 D5). */
export type AdoptionStage =
  | { kind: 'opted-out' }
  | { kind: 'adoption-incomplete'; derivedArchitectures: string[] }
  | { kind: 'already-planned'; artifacts: string[]; existingStatePlan: string | null }
  | { kind: 'unplanned' };

export type AdoptionOutcome =
  | Exclude<AdoptionStage, { kind: 'unplanned' }>
  | { kind: 'brownfield'; source: SourceVolume }
  | { kind: 'greenfield'; source: SourceVolume };

export interface StageInput {
  optedOut: boolean;
  facts: PlanningFacts;
}

export interface OutcomeInput {
  stage: AdoptionStage;
  /** Source volume; read only when the stage is `unplanned`. */
  source?: SourceVolume;
}

/**
 * The stage order (D5): opted out → adoption incomplete → already planned → unplanned. Pure.
 * A derived architecture with no existing-state plan is mid-adoption; any other planning
 * artifact means the project is planned.
 */
export function decideStage({ optedOut, facts }: StageInput): AdoptionStage {
  if (optedOut) return { kind: 'opted-out' };
  if (facts.derivedArchitectures.length > 0 && facts.existingStatePlan === null) {
    return { kind: 'adoption-incomplete', derivedArchitectures: facts.derivedArchitectures };
  }
  if (facts.artifacts.length > 0) {
    return { kind: 'already-planned', artifacts: facts.artifacts, existingStatePlan: facts.existingStatePlan };
  }
  return { kind: 'unplanned' };
}

/**
 * The outcome (D5): a decided stage passes through; `unplanned` becomes brownfield or greenfield
 * by source volume. Pure. The caller measures source volume only for `unplanned`; leaving it out
 * then is a programming error.
 */
export function decideOutcome({ stage, source }: OutcomeInput): AdoptionOutcome {
  if (stage.kind !== 'unplanned') return stage;
  if (source === undefined) {
    throw new Error('decideOutcome: the stage is unplanned, so `source` is required');
  }
  return source.lines >= BROWNFIELD_MIN_SOURCE_LINES
    ? { kind: 'brownfield', source }
    : { kind: 'greenfield', source };
}
