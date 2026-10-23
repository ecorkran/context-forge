// Adoption completion (slice 263, D5): adoption is finished once a slice plan with a
// retroactive entry exists, because that is the observable sign that the existing-state plan
// has been written. Split into find and persist so the resolver can write after it renders
// the facts (R1). `findRecordedPlan` delegates to `findExistingStatePlan` (264), the one
// definition of "a slice plan with a retroactive entry exists".
import { findExistingStatePlan } from '../introspection/parsers/existingStatePlan.js';
import { writeAdoptionState } from './adoptionState.js';
import { AdoptionError } from './contracts.js';

/** The remedy a failed write names, so the person can finish the transition by hand. */
const COMPLETE_REMEDY = 'cf config set adoption.state complete';

/**
 * Absolute path of the existing-state slice plan, or null. A plan without a retroactive entry
 * does not count: an adoption that recorded nothing built is not an existing-state plan.
 * Read-only.
 */
export function findRecordedPlan(checkoutPath: string): Promise<string | null> {
  return findExistingStatePlan(checkoutPath);
}

/** Writes `adoption.state: complete`. A failed write throws with the manual remedy (261 D9). */
export async function persistAdoptionComplete(checkoutPath: string): Promise<void> {
  try {
    await writeAdoptionState(checkoutPath, 'complete');
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new AdoptionError(
      `Cannot record adoption state in .context-forge.toml: ${detail}. To finish adoption by hand: ${COMPLETE_REMEDY}`,
      { cause: error },
    );
  }
}

/** The design's contract: find, then persist. Exported for 264's `cf next`. */
export async function completeAdoptionIfPlanRecorded(
  checkoutPath: string,
): Promise<{ completed: false } | { completed: true; planPath: string }> {
  const planPath = await findRecordedPlan(checkoutPath);
  if (planPath === null) return { completed: false };
  await persistAdoptionComplete(checkoutPath);
  return { completed: true, planPath };
}
