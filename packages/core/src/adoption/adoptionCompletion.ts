// Adoption completion (slice 263, D5): adoption is finished once a slice plan with a
// retroactive entry exists, because that is the observable sign that the existing-state plan
// has been written. Split into find and persist so the resolver can write after it renders
// the facts (R1). When 264 lands, `findRecordedPlan` delegates to its `findExistingStatePlan`.
import { basename } from 'path';
import { findPlanningArtifacts } from '../detection/planningArtifacts.js';
import { parseSlicePlan } from '../introspection/parsers/slicePlanParser.js';
import { writeAdoptionState } from './adoptionState.js';
import { AdoptionError } from './contracts.js';

/**
 * nnn-slices.*.md only. Arch and hld files can never hold a slice plan entry; the exported
 * SLICE_PLAN_FILE_PATTERN in planningArtifacts.ts replaces this local copy when 264 lands.
 */
const SLICE_PLAN_FILE_PATTERN = /^\d{3}-slices\..+\.md$/i;

/** The remedy a failed write names, so the person can finish the transition by hand. */
const COMPLETE_REMEDY = 'cf config set adoption.state complete';

/**
 * Absolute path of the first slice plan (sorted order) that holds a retroactive entry, or null.
 * A plan without one does not count: an adoption that recorded nothing built is not an
 * existing-state plan. Read-only.
 */
export async function findRecordedPlan(checkoutPath: string): Promise<string | null> {
  const artifacts = await findPlanningArtifacts(checkoutPath);
  for (const path of artifacts.filter((artifact) => SLICE_PLAN_FILE_PATTERN.test(basename(artifact)))) {
    const plan = await parseSlicePlan(path);
    if (plan.entries.some((entry) => entry.retroactive)) return path;
  }
  return null;
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
