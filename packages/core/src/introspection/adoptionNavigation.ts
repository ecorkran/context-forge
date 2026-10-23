// Adoption-aware navigation for `cf next` (slice 264). Reads adoption.state (261) and the
// existing-state slice plan (263) and decides what the navigator recommends. Read-only (D3).
import { resolve } from 'path';
import type { AdoptionState } from '../config/ConfigKeys.js';
import { CONCEPT_PHASE } from '../schema/projectSchema.js';

/** Adoption steps the navigator can recommend (D4, D6). Internal: not exposed on NextAction. */
export type AdoptionNavStep =
  | 'concept'
  | 'architecture'
  | 'existing-state-plan'
  | 'record-completion' // D4
  | 'register-plan'
  | 'plan-new-work'; // D6

export type AdoptionNav =
  | { kind: 'not-adopting' } // declined, or '' with no warning: today's navigation
  | { kind: 'warn'; warning: string } // today's navigation plus one warning (D2, D5, D6)
  | { kind: 'recommend'; step: AdoptionNavStep }
  | { kind: 'adopted' }; // complete, plan registered with new work

export interface AdoptionNavInputs {
  state: AdoptionState;
  conceptInstruction: boolean; // resolvePhaseValue(project.instruction) === CONCEPT_PHASE
  instruction: string; // for the D5 warning
  conceptExists: boolean;
  planningArtifactsExist: boolean; // '' only (D2)
  architecturePaths: string[]; // ascending index
  existingStatePlanPath: string | null;
  registeredPlanPath: string | null; // fileSlicePlan resolved, file present
  registeredPlanHasOpenEntry: boolean; // only meaningful when registered === existing-state plan
}

const DECLINE_COMMAND = 'cf config set adoption.state declined';

export const UNSET_STATE_WARNING =
  'adoption.state is unset. If this is an existing codebase, run cf build before advancing the phase: ' +
  'at Phase 0 the build checks for existing code and starts adoption. Advancing skips that check. ' +
  `To mark the project as new and silence this: ${DECLINE_COMMAND}`;

export const NO_EXISTING_STATE_PLAN_WARNING =
  'adoption.state is complete, but no slice plan with retroactive entries was found. ' +
  'To write it: cf config set adoption.state in_progress, then cf build. ' +
  `To treat the project as new: ${DECLINE_COMMAND}`;

export function outsideConceptPhaseWarning(instruction: string): string {
  return (
    `adoption.state is in_progress, but the instruction is '${instruction}'. ` +
    'The brownfield adoption prompt runs only in Phase 0. ' +
    `To resume adoption: cf set phase '${CONCEPT_PHASE}'. To stop adopting: ${DECLINE_COMMAND}`
  );
}

const NOT_ADOPTING: AdoptionNav = { kind: 'not-adopting' };

/** D2: only where today's advice would skip detection on a possibly existing codebase. */
function decideUnset(inputs: AdoptionNavInputs): AdoptionNav {
  const detectionPending = inputs.conceptInstruction && inputs.conceptExists && !inputs.planningArtifactsExist;
  return detectionPending ? { kind: 'warn', warning: UNSET_STATE_WARNING } : NOT_ADOPTING;
}

/** D4 (the first matching row decides) and D5. */
function decideInProgress(inputs: AdoptionNavInputs): AdoptionNav {
  if (!inputs.conceptInstruction) return { kind: 'warn', warning: outsideConceptPhaseWarning(inputs.instruction) };
  if (inputs.existingStatePlanPath) return { kind: 'recommend', step: 'record-completion' };
  if (!inputs.conceptExists) return { kind: 'recommend', step: 'concept' };
  if (inputs.architecturePaths.length === 0) return { kind: 'recommend', step: 'architecture' };
  return { kind: 'recommend', step: 'existing-state-plan' };
}

/** D6 (the first matching row decides). */
function decideComplete(inputs: AdoptionNavInputs): AdoptionNav {
  if (!inputs.existingStatePlanPath) return { kind: 'warn', warning: NO_EXISTING_STATE_PLAN_WARNING };
  if (!inputs.registeredPlanPath) return { kind: 'recommend', step: 'register-plan' };
  const registeredIsExistingState = resolve(inputs.registeredPlanPath) === resolve(inputs.existingStatePlanPath);
  if (registeredIsExistingState && !inputs.registeredPlanHasOpenEntry) {
    return { kind: 'recommend', step: 'plan-new-work' };
  }
  return { kind: 'adopted' };
}

/** Pure: decides the adoption recommendation from gathered inputs. */
export function decideAdoptionNav(inputs: AdoptionNavInputs): AdoptionNav {
  switch (inputs.state) {
    case 'declined':
      return NOT_ADOPTING;
    case '':
      return decideUnset(inputs);
    case 'in_progress':
      return decideInProgress(inputs);
    case 'complete':
      return decideComplete(inputs);
    default: {
      const unhandled: never = inputs.state;
      throw new Error(`Unhandled adoption.state: ${String(unhandled)}`);
    }
  }
}
