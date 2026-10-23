// Renders the "### Adoption Facts" section (slice 261, D8). Facts only: the guide
// prompt, not this section, tells the agent which path to take.
import type { AdoptionState } from '../config/ConfigKeys.js';
import type { CiRecognition } from '../detection/ciDetection.js';
import type { HistoryFact } from '../detection/history.js';
import type { SourceVolume } from '../detection/sourceVolume.js';
import {
  SQUADRON_PROBE_MAX_BUFFER_BYTES,
  SQUADRON_PROBE_TIMEOUT_MS,
  SUPPORTED_PROBE_VERSION,
  type ProbeOutcome,
  type ProbeUnavailableReason,
} from '../detection/squadronProbe.js';
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
  probe: ProbeOutcome;
}

const NONE_FOUND = 'none found';

const MILLIS_PER_SECOND = 1000;
const BYTES_PER_MIB = 1024 * 1024;
const MIN_FENCE_LENGTH = 3;
const JSON_INDENT = '  ';
/** Nested bullets must indent at least the width of the parent `- ` marker. */
const LIST_INDENT = '  ';

/** D2: the one place a probe failure becomes text. */
function describeUnavailableReason(reason: ProbeUnavailableReason): string {
  switch (reason.kind) {
    case 'not-found':
      return '`sq` was not found on PATH';
    case 'could-not-run':
      return (
        '`sq probe` could not run or did not finish within ' +
        `${SQUADRON_PROBE_TIMEOUT_MS / MILLIS_PER_SECOND} s with at most ` +
        `${SQUADRON_PROBE_MAX_BUFFER_BYTES / BYTES_PER_MIB} MiB of output (${reason.detail})`
      );
    case 'non-zero-exit':
      return `\`sq probe --json\` exited with code ${reason.exitCode}`;
    case 'unreadable-output':
      return '`sq probe --json` printed output that is not a JSON object';
    case 'unsupported-version':
      return `\`sq probe\` reports probe_version ${reason.value}; this cf supports ${SUPPORTED_PROBE_VERSION}`;
    default: {
      const unhandled: never = reason;
      throw new Error(`Unhandled probe reason: ${JSON.stringify(unhandled)}`);
    }
  }
}

/** A fence one backtick longer than the longest backtick run in the text, so it cannot close early. */
function fenceFor(text: string): string {
  // A loop, not Math.max(...runs): spreading one argument per run overflows the call stack on large input.
  let longestRun = 0;
  for (const run of text.match(/`+/g) ?? []) longestRun = Math.max(longestRun, run.length);
  return '`'.repeat(Math.max(MIN_FENCE_LENGTH, longestRun + 1));
}

function renderProbeWarnings(warnings: readonly string[]): string[] {
  const label = '- Probe warnings (stderr, verbatim):';
  if (warnings.length === 0) return [`${label} none`];
  return [label, ...warnings.map((line) => `${LIST_INDENT}- ${line}`)];
}

/** D6: the squadron part of the section, as ready-made bullet lines. */
export function renderSquadronFacts(outcome: ProbeOutcome): string[] {
  if (outcome.kind === 'unavailable') {
    const lines = [`- Squadron: unavailable. ${describeUnavailableReason(outcome.reason)}.`];
    return outcome.warnings.length > 0 ? [...lines, ...renderProbeWarnings(outcome.warnings)] : lines;
  }
  const fence = fenceFor(outcome.json);
  return [
    '- Squadron probe (`sq probe --json`), verbatim:',
    `${JSON_INDENT}${fence}json`,
    ...outcome.json.split('\n').map((line) => `${JSON_INDENT}${line}`),
    `${JSON_INDENT}${fence}`,
    ...renderProbeWarnings(outcome.warnings),
  ];
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
    case 'adoption-completed':
      return 'adoption completed by this build';
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
    case 'adoption-completed':
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

function describeState(
  state: AdoptionState,
  stateSetByBuild: boolean,
  outcome: AdoptionFactsInput['outcome'],
): string {
  const shown = state === '' ? 'unset' : state;
  if (outcome.kind === 'adoption-completed') {
    return (
      `adoption.state: ${shown}. adoption.state was set to ${shown} by this build: ` +
      `existing-state slice plan found at ${outcome.planPath}. ` +
      'Adoption is finished; run `cf next` for the next step.'
    );
  }
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
    describeState(input.state, input.stateSetByBuild, input.outcome),
    ...(sourceVolume === null ? [] : [`Source volume: ${sourceVolume}`]),
    `History: ${describeHistory(input.history)}`,
    `Docs: ${listOrNone(input.docs)}`,
    `ADRs: ${listOrNone(input.adrs)}`,
    `Rule files: ${listOrNone(input.ruleFiles)}`,
    `CI: ${listOrNone(input.ci.matches)}`,
  ];
  return [
    '### Adoption Facts',
    '',
    ...bullets.map((bullet) => `- ${bullet}`),
    ...renderSquadronFacts(input.probe),
  ].join('\n');
}
