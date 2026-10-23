import type { AdoptionState } from '../config/ConfigKeys.js';
// Type-only: sourceVolume.ts imports the threshold from this file, so a value import would cycle.
import type { SourceVolume } from '../detection/sourceVolume.js';

/**
 * Brownfield iff the project folder holds at least this many non-blank source lines (D1).
 * The one place the threshold is written; deliberately not configurable (the
 * `adoption.state` override is the safety valve).
 */
export const BROWNFIELD_MIN_SOURCE_LINES = 2000;

export type AdoptionOutcome =
  | { kind: 'adoption-in-progress' }
  // Built by the resolver, not decideOutcome: it needs the recorded plan's path (slice 263 R5).
  | { kind: 'adoption-completed'; planPath: string }
  | { kind: 'adoption-closed'; state: 'complete' | 'declined' }
  | { kind: 'already-planned'; artifacts: string[] }
  | { kind: 'brownfield'; source: SourceVolume }
  | { kind: 'greenfield'; source: SourceVolume };

export interface OutcomeInput {
  state: AdoptionState;
  /** Planning artifacts found; read only when `state` is unset. */
  artifacts?: string[];
  /** Source volume; read only when `state` is unset and nothing is planned. */
  source?: SourceVolume;
}

/**
 * The outcome order (D1): persisted state → already planned → source volume.
 * Pure. The caller supplies each fact only when the previous one did not decide;
 * a fact the order needs but the caller left out is a programming error.
 */
export function decideOutcome(input: OutcomeInput): AdoptionOutcome {
  const { state, artifacts, source } = input;
  if (state === 'in_progress') return { kind: 'adoption-in-progress' };
  if (state === 'complete' || state === 'declined') return { kind: 'adoption-closed', state };

  if (artifacts === undefined) {
    throw new Error('decideOutcome: state is unset, so `artifacts` is required');
  }
  if (artifacts.length > 0) return { kind: 'already-planned', artifacts };

  if (source === undefined) {
    throw new Error('decideOutcome: state is unset and nothing is planned, so `source` is required');
  }
  return source.lines >= BROWNFIELD_MIN_SOURCE_LINES
    ? { kind: 'brownfield', source }
    : { kind: 'greenfield', source };
}
