// Adoption warnings for navigation (slice 269 D6): one line for an unadopted brownfield repo and
// one for an incomplete adoption. Navigation never returns an adoption step.
import { measureSourceVolume, type SourceVolume } from '../detection/sourceVolume.js';
import { decideOutcome, decideStage, type AdoptionOutcome, type AdoptionStage } from './adoptionOutcome.js';
import { legacyAdoptionStateNotice, readAdoptionOptOut } from './adoptionState.js';
import { AdoptionError, OPT_OUT_COMMAND } from './contracts.js';
import { readPlanningFacts } from './planningFacts.js';

const OPT_OUT_SENTENCE = `To treat the project as new: ${OPT_OUT_COMMAND}`;
const SQ_ONBOARD = 'sq onboard';

export const BROWNFIELD_LINE =
  'This project has existing code and no planning artifacts. ' +
  `Adopting an existing codebase arrives with ${SQ_ONBOARD}. ${OPT_OUT_SENTENCE}`;

export const INCOMPLETE_ADOPTION_LINE =
  'A derived architecture exists, but no slice plan has retroactive entries, so adoption is incomplete. ' +
  `It resumes through ${SQ_ONBOARD}. ${OPT_OUT_SENTENCE}`;

export function inconclusiveDetectionLine(reason: string): string {
  return `cf could not tell whether this project holds existing code: ${reason}. ${OPT_OUT_SENTENCE}`;
}

/** The one outcome-to-line mapping (slice 271 D9): navigation, `cf detect` and `cf init` all use it. */
export function outcomeLine(outcome: AdoptionOutcome): string | null {
  switch (outcome.kind) {
    case 'brownfield':
      return BROWNFIELD_LINE;
    case 'adoption-incomplete':
      return INCOMPLETE_ADOPTION_LINE;
    case 'opted-out':
    case 'already-planned':
    case 'greenfield':
      return null;
    default: {
      const unhandled: never = outcome;
      throw new Error(`Unhandled adoption outcome: ${JSON.stringify(unhandled)}`);
    }
  }
}

function withLine(warnings: string[], line: string | null): string[] {
  return line === null ? warnings : [...warnings, line];
}

export interface AdoptionNavLines {
  warnings: string[];
  /** True for an adopted project: first-run logic must not treat it as fresh. */
  skipFirstRun: boolean;
}

export type SourceVolumeMeasurer = (root: string) => Promise<SourceVolume>;

/** The warnings navigation adds for adoption, and whether first-run logic is skipped (D6). */
export async function adoptionNavLines(
  projectPath: string,
  measure: SourceVolumeMeasurer = measureSourceVolume,
): Promise<AdoptionNavLines> {
  const optOut = await readAdoptionOptOut(projectPath);
  const warnings = optOut.ignoredLegacyValue === null ? [] : [legacyAdoptionStateNotice(optOut.ignoredLegacyValue)];
  if (optOut.optedOut) return { warnings, skipFirstRun: false };

  // Planning-file read errors propagate (264 D7): an unreadable planning directory is a real
  // problem to fix, unlike a source walk that can't finish, which only weakens a hint.
  const stage = decideStage({ optedOut: false, facts: await readPlanningFacts(projectPath) });
  switch (stage.kind) {
    case 'opted-out':
      throw new Error('adoptionNavLines: the opt-out returned before the planning facts were read');
    case 'adoption-incomplete':
      return { warnings: withLine(warnings, outcomeLine(stage)), skipFirstRun: false };
    case 'already-planned':
      return { warnings, skipFirstRun: stage.existingStatePlan !== null };
    case 'unplanned':
      return codeSignalLines(projectPath, stage, warnings, measure);
    default: {
      const unhandled: never = stage;
      throw new Error(`Unhandled adoption stage: ${JSON.stringify(unhandled)}`);
    }
  }
}

/** The brownfield/greenfield step for an unplanned project; a failed walk is advisory (D6). */
async function codeSignalLines(
  projectPath: string,
  stage: Extract<AdoptionStage, { kind: 'unplanned' }>,
  warnings: string[],
  measure: SourceVolumeMeasurer,
): Promise<AdoptionNavLines> {
  let source: SourceVolume;
  try {
    source = await measure(projectPath);
  } catch (error) {
    // The warning is advisory and must not block cf next: a failed walk becomes a visible line
    // naming the cause, not a silent greenfield. Other errors are bugs and propagate.
    if (!(error instanceof AdoptionError)) throw error;
    return { warnings: [...warnings, inconclusiveDetectionLine(error.message)], skipFirstRun: false };
  }
  const outcome = decideOutcome({ stage, source });
  return { warnings: withLine(warnings, outcomeLine(outcome)), skipFirstRun: false };
}
