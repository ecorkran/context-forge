// Adoption-aware navigation for `cf next` (slice 264). Reads adoption.state (261) and the
// existing-state slice plan (263) and decides what the navigator recommends. Read-only (D3).
import { basename, join, resolve } from 'path';
import { readAdoptionState } from '../adoption/adoptionState.js';
import type { AdoptionState } from '../config/ConfigKeys.js';
import { pathPresent } from '../detection/pathPresent.js';
import { fileIndexOf, findArchitectureArtifacts, findPlanningArtifacts } from '../detection/planningArtifacts.js';
import { CONCEPT_PHASE, SLICE_PLANNING_PHASE, resolvePhaseValue } from '../schema/projectSchema.js';
import { resolveArtifactPath } from '../schema/resolveFileByIndex.js';
import type { ResolvedProject } from '../types/index.js';
import { findExistingStatePlan } from './parsers/existingStatePlan.js';
import { findFirstNotCompleteEntry } from './statusDerivation.js';
import type { NextAction, WorkflowStatus } from './types.js';

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

const BUILD_COMMAND = 'cf build';

/** Shared by the four D4 steps: every one is `cf build`, which resumes from the artifacts present. */
const BUILD_RATIONALE =
  'cf build assembles the brownfield adoption prompt, which resumes from the artifacts that exist. ' +
  `To stop adopting: ${DECLINE_COMMAND}`;

const BUILD_STEP_RECOMMENDATIONS = {
  concept: 'Next adoption step: baseline concept.',
  architecture: 'Next adoption step: architecture derived from the code.',
  'existing-state-plan': 'Next adoption step: existing-state slice plan.',
  'record-completion': 'The existing-state slice plan is written. Run cf build to record adoption as complete.',
} as const;

function stem(path: string): string {
  return basename(path, '.md');
}

function buildRegisterPlanAction(inputs: AdoptionNavInputs): NextAction {
  const plan = inputs.existingStatePlanPath;
  if (!plan) throw new Error('register-plan requires an existing-state plan path');
  const sameIndexArch = inputs.architecturePaths.find((path) => fileIndexOf(path) === fileIndexOf(plan));
  const suggestedCommand = sameIndexArch ? `cf set arch ${stem(sameIndexArch)}` : `cf set plan ${stem(plan)}`;
  return {
    recommendation: 'Adoption is complete. Register the derived architecture and existing-state slice plan.',
    rationale: sameIndexArch
      ? 'Setting the architecture also sets the slice plan that shares its index.'
      : 'No architecture shares the plan index, so register the slice plan on its own.',
    suggestedCommand,
    summary: 'Register the existing-state architecture and slice plan',
  };
}

function buildPlanNewWorkAction(inputs: AdoptionNavInputs): NextAction {
  const plan = inputs.existingStatePlanPath;
  if (!plan) throw new Error('plan-new-work requires an existing-state plan path');
  return {
    recommendation:
      `Adoption is complete. Every entry in ${stem(plan)} is recorded history. ` +
      'Plan the first new work as entries after the retroactive ones.',
    rationale: `Then run cf build to plan the new slices, or cf build alone if the phase is already ${SLICE_PLANNING_PHASE}.`,
    suggestedCommand: `cf set phase '${SLICE_PLANNING_PHASE}'`,
    summary: `Plan new work in ${stem(plan)}`,
  };
}

/** Pure: the action for a recommended step. The navigator runs the D4 arch gate before using it (R6). */
export function buildAdoptionStepAction(step: AdoptionNavStep, inputs: AdoptionNavInputs): NextAction {
  switch (step) {
    case 'concept':
    case 'architecture':
    case 'existing-state-plan':
    case 'record-completion':
      return {
        recommendation: BUILD_STEP_RECOMMENDATIONS[step],
        rationale: BUILD_RATIONALE,
        suggestedCommand: BUILD_COMMAND,
        summary: BUILD_STEP_RECOMMENDATIONS[step],
      };
    case 'register-plan':
      return buildRegisterPlanAction(inputs);
    case 'plan-new-work':
      return buildPlanNewWorkAction(inputs);
    default: {
      const unhandled: never = step;
      throw new Error(`Unhandled adoption step: ${String(unhandled)}`);
    }
  }
}

/** The registered slice plan as an absolute path, or null when unset or its file is missing. */
function resolveRegisteredPlan(project: ResolvedProject, projectPath: string): string | null {
  if (!project.fileSlicePlan) return null;
  const relative = resolveArtifactPath('fileSlicePlan', project.fileSlicePlan);
  if (relative === null) return null;
  const absolute = join(projectPath, relative);
  return pathPresent(absolute) ? absolute : null;
}

/**
 * Reads what the adoption state needs and leaves the other fields empty (Data Flow).
 * `conceptExists` is the value computeNext already has (R4). A read error propagates (D7).
 */
export async function gatherAdoptionInputs(
  project: ResolvedProject,
  status: WorkflowStatus,
  conceptExists: boolean,
): Promise<AdoptionNavInputs> {
  const projectPath = project.projectPath;
  if (!projectPath) throw new Error('gatherAdoptionInputs requires project.projectPath');

  const instruction = project.instruction ?? '';
  const inputs: AdoptionNavInputs = {
    state: await readAdoptionState(projectPath),
    conceptInstruction: resolvePhaseValue(instruction) === CONCEPT_PHASE,
    instruction,
    conceptExists,
    planningArtifactsExist: false,
    architecturePaths: [],
    existingStatePlanPath: null,
    registeredPlanPath: null,
    registeredPlanHasOpenEntry: false,
  };

  switch (inputs.state) {
    case 'declined':
      return inputs;
    case '':
      if (inputs.conceptInstruction && conceptExists) {
        inputs.planningArtifactsExist = (await findPlanningArtifacts(projectPath)).length > 0;
      }
      return inputs;
    case 'in_progress':
    case 'complete': {
      inputs.architecturePaths = await findArchitectureArtifacts(projectPath);
      inputs.existingStatePlanPath = await findExistingStatePlan(projectPath);
      inputs.registeredPlanPath = resolveRegisteredPlan(project, projectPath);
      const registeredIsExistingState =
        inputs.registeredPlanPath !== null &&
        inputs.existingStatePlanPath !== null &&
        resolve(inputs.registeredPlanPath) === resolve(inputs.existingStatePlanPath);
      if (registeredIsExistingState) {
        inputs.registeredPlanHasOpenEntry = findFirstNotCompleteEntry(status.slicePlan?.entries ?? []) !== undefined;
      }
      return inputs;
    }
    default: {
      const unhandled: never = inputs.state;
      throw new Error(`Unhandled adoption.state: ${String(unhandled)}`);
    }
  }
}
