// Renders the "### Adoption Facts" section (slice 261, D8). Facts only: the guide
// prompt, not this section, tells the agent which path to take.
import type { AdoptionState } from '../config/ConfigKeys.js';
import type { CiRecognition } from '../detection/ciDetection.js';
import type { HistoryFact } from '../detection/history.js';
import type { SourceVolume } from '../detection/sourceVolume.js';
import { BROWNFIELD_MIN_SOURCE_LINES, type AdoptionOutcome } from './adoptionOutcome.js';
import { BROWNFIELD_ADOPTION_INSTRUCTION } from './contracts.js';

/** Outcome used when an explicit brownfield-adoption instruction skipped detection (D4). */
export const NOT_EVALUATED = { kind: 'not-evaluated' } as const;

export interface AdoptionFactsInput {
  outcome: AdoptionOutcome | typeof NOT_EVALUATED;
  state: AdoptionState;
  /** True when this build wrote `in_progress`. */
  stateSetByBuild: boolean;
  history: HistoryFact;
  docs: readonly string[];
  adrs: readonly string[];
  ruleFiles: readonly string[];
  ci: CiRecognition;
}

const NONE_FOUND = 'none found';

/** Slice 262 replaces this bullet with the probe output or its own unavailable statement. */
export function renderSquadronFact(): string {
  return "Squadron: unavailable. This cf version does not run squadron's capability probe, so no probe output is present.";
}

function describeSource(source: SourceVolume): string {
  const lines = source.capped
    ? `${source.lines}+ non-blank source lines (count stopped at the threshold)`
    : `${source.lines} non-blank source lines`;
  return `${lines} in ${source.files} source files`;
}

function describeOutcome(outcome: AdoptionFactsInput['outcome']): string {
  switch (outcome.kind) {
    case 'not-evaluated':
      return `not evaluated (explicit ${BROWNFIELD_ADOPTION_INSTRUCTION} instruction)`;
    case 'adoption-in-progress':
      return 'adoption in progress (adoption.state is in_progress)';
    case 'adoption-closed':
      return `adoption closed (adoption.state is ${outcome.state})`;
    case 'already-planned':
      return `already planned (${outcome.artifacts.length} planning artifact files exist)`;
    case 'brownfield':
      return `brownfield: ${outcome.source.lines}${outcome.source.capped ? '+' : ''} non-blank source lines ` +
        `(threshold ${BROWNFIELD_MIN_SOURCE_LINES}${outcome.source.capped ? '; count stopped at the threshold' : ''})`;
    case 'greenfield':
      return `greenfield: ${outcome.source.lines} non-blank source lines (threshold ${BROWNFIELD_MIN_SOURCE_LINES})`;
    default: {
      // A new outcome kind (slice 263) fails to compile here until it is handled.
      const unhandled: never = outcome;
      throw new Error(`Unhandled adoption outcome: ${JSON.stringify(unhandled)}`);
    }
  }
}

function describeSourceVolume(outcome: AdoptionFactsInput['outcome']): string | null {
  switch (outcome.kind) {
    case 'brownfield':
    case 'greenfield':
      return describeSource(outcome.source);
    case 'not-evaluated':
    case 'adoption-in-progress':
    case 'adoption-closed':
    case 'already-planned':
      return null;
    default: {
      const unhandled: never = outcome;
      throw new Error(`Unhandled adoption outcome: ${JSON.stringify(unhandled)}`);
    }
  }
}

function describeHistory(history: HistoryFact): string {
  if (history.kind === 'unknown') return `unknown: ${history.reason}`;
  return `${history.commits} commits${history.shallow ? ' (shallow clone: history is truncated)' : ''}`;
}

function listOrNone(items: readonly string[]): string {
  return items.length > 0 ? items.join(', ') : NONE_FOUND;
}

function describeState(state: AdoptionState, stateSetByBuild: boolean): string {
  const shown = state === '' ? 'unset' : state;
  if (!stateSetByBuild) return `adoption.state: ${shown}`;
  return (
    `adoption.state: ${shown}. adoption.state was set to in_progress by this build. ` +
    'To treat the project as new instead: `cf config set adoption.state declined`.'
  );
}

export function renderAdoptionFacts(input: AdoptionFactsInput): string {
  const sourceVolume = describeSourceVolume(input.outcome);
  const bullets = [
    `Outcome: ${describeOutcome(input.outcome)}`,
    describeState(input.state, input.stateSetByBuild),
    ...(sourceVolume === null ? [] : [`Source volume: ${sourceVolume}`]),
    `History: ${describeHistory(input.history)}`,
    `Docs: ${listOrNone(input.docs)}`,
    `ADRs: ${listOrNone(input.adrs)}`,
    `Rule files: ${listOrNone(input.ruleFiles)}`,
    `CI: ${listOrNone(input.ci.matches)}`,
    renderSquadronFact(),
  ];
  return ['### Adoption Facts', '', ...bullets.map((bullet) => `- ${bullet}`)].join('\n');
}
