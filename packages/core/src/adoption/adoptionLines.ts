// Adoption warnings for navigation (slice 269 D6): one line for an unadopted brownfield repo and
// one for an incomplete adoption. Navigation never returns an adoption step.
import { measureSourceVolume, type SourceVolume } from '../detection/sourceVolume.js';
import { decideOutcome, decideStage } from './adoptionOutcome.js';
import { legacyAdoptionStateNotice, readAdoptionOptOut } from './adoptionState.js';
import { AdoptionError } from './contracts.js';
import { readPlanningFacts } from './planningFacts.js';

export const BROWNFIELD_LINE =
  'This project has existing code and no planning artifacts. Adopting an existing codebase arrives with sq onboard. ' +
  'To treat the project as new: cf config set adoption.state declined';

export const INCOMPLETE_ADOPTION_LINE =
  'A derived architecture exists, but no slice plan has retroactive entries, so adoption is incomplete. ' +
  'It resumes through sq onboard. To treat the project as new: cf config set adoption.state declined';

export function inconclusiveDetectionLine(reason: string): string {
  return (
    `cf could not tell whether this project holds existing code: ${reason}. ` +
    'To treat the project as new: cf config set adoption.state declined'
  );
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

  const stage = decideStage({ optedOut: false, facts: await readPlanningFacts(projectPath) });
  if (stage.kind === 'adoption-incomplete') {
    return { warnings: [...warnings, INCOMPLETE_ADOPTION_LINE], skipFirstRun: false };
  }
  if (stage.kind === 'already-planned') return { warnings, skipFirstRun: stage.existingStatePlan !== null };
  // Unreachable (the opt-out returned above); narrows the stage to `unplanned`.
  if (stage.kind === 'opted-out') return { warnings, skipFirstRun: false };

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
  return outcome.kind === 'brownfield'
    ? { warnings: [...warnings, BROWNFIELD_LINE], skipFirstRun: false }
    : { warnings, skipFirstRun: false };
}
