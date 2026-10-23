// Build-time adoption resolver (slice 261, D4 + D7). The one home of the selection
// rule and of the build's step order; decideOutcome and the renderer only consume
// what is gathered here.
import { readFile } from 'fs/promises';
import { relative, resolve } from 'path';
import type { AdoptionState } from '../config/ConfigKeys.js';
import { COMPREHENSION_PROFILE_VARIABLE, findComprehensionAnalysis } from '../detection/comprehensionAnalysis.js';
import { findPlanningArtifacts } from '../detection/planningArtifacts.js';
import { readHistory } from '../detection/history.js';
import { ADR_DIRS, DOC_PATHS, RULE_FILE_PATHS, presentPaths } from '../detection/presentPaths.js';
import { recognizeCi, type CiRecognition } from '../detection/ciDetection.js';
import { measureSourceVolume } from '../detection/sourceVolume.js';
import { MIN_GUIDE_VERSION } from '../guides/guideMinimum.js';
import { CONCEPT_PHASE, resolvePhaseValue } from '../schema/projectSchema.js';
import { ContextProfileParser } from '../services/ContextProfileParser.js';
import { resolvePromptFilePath } from '../services/promptFilePath.js';
import { SystemPromptParser } from '../services/SystemPromptParser.js';
import { findRecordedPlan, persistAdoptionComplete } from './adoptionCompletion.js';
import { NOT_EVALUATED, renderAdoptionFacts } from './adoptionFacts.js';
import { decideOutcome, type AdoptionOutcome } from './adoptionOutcome.js';
import { readAdoptionState, writeAdoptionState } from './adoptionState.js';
import {
  AdoptionError,
  BROWNFIELD_ADOPTION_INSTRUCTION,
  type AdoptionResolver,
  type SquadronProbe,
} from './contracts.js';

/** `persist`: a first brownfield detection writes `in_progress`. `read-only`: it never writes. */
export type AdoptionStateWrites = 'persist' | 'read-only';

const DECLINE_REMEDY = 'To treat the project as new instead: cf config set adoption.state declined';

interface Decision {
  state: AdoptionState;
  outcome: AdoptionOutcome | typeof NOT_EVALUATED;
}

/** Step 2: each fact is read only if the previous one did not decide. */
async function decide(
  checkoutPath: string,
  explicit: boolean,
  stateWrites: AdoptionStateWrites,
): Promise<Decision> {
  const state = await readAdoptionState(checkoutPath);
  if (explicit) return { state, outcome: NOT_EVALUATED };

  // 263 D5: an in-progress adoption completes when the existing-state slice plan has been recorded.
  // Read-only builds (template_preview) never complete. The write happens after the facts render (R1).
  if (state === 'in_progress' && stateWrites === 'persist') {
    const planPath = await findRecordedPlan(checkoutPath);
    if (planPath !== null) {
      return { state, outcome: { kind: 'adoption-completed', planPath: relative(resolve(checkoutPath), planPath) } };
    }
  }
  if (state !== '') return { state, outcome: decideOutcome({ state }) };

  const artifacts = await findPlanningArtifacts(checkoutPath);
  if (artifacts.length > 0) return { state, outcome: decideOutcome({ state, artifacts }) };

  const source = await measureSourceVolume(checkoutPath);
  return { state, outcome: decideOutcome({ state, artifacts, source }) };
}

/** Step 3: the brownfield prompt is selected for a brownfield outcome, a resumed adoption or an explicit instruction. */
function isSelected(outcome: Decision['outcome']): boolean {
  switch (outcome.kind) {
    case 'brownfield':
    case 'adoption-in-progress':
    case 'adoption-completed':
    case 'not-evaluated':
      return true;
    case 'adoption-closed':
    case 'already-planned':
    case 'greenfield':
      return false;
    default: {
      const unhandled: never = outcome;
      throw new Error(`Unhandled adoption outcome: ${JSON.stringify(unhandled)}`);
    }
  }
}

function missingGuidePart(part: 'profile' | 'prompt'): AdoptionError {
  return new AdoptionError(
    `This project is being adopted as an existing codebase, but the installed ai-project-guide has no ` +
      `${BROWNFIELD_ADOPTION_INSTRUCTION} ${part}. Run: cf guides update (needs v${MIN_GUIDE_VERSION}+). ${DECLINE_REMEDY}`,
  );
}

/** Step 4 (D9): the guide the build reads must carry both the profile and the prompt. Returns the profile's variables. */
async function assertGuideSupportsAdoption(projectPath: string): Promise<string[]> {
  const promptFile = resolvePromptFilePath(projectPath);
  const profiles = new ContextProfileParser().parseProfiles(await readFile(promptFile, 'utf-8'));
  const profileVariables = profiles[BROWNFIELD_ADOPTION_INSTRUCTION];
  if (profileVariables === undefined) throw missingGuidePart('profile');

  const prompt = await new SystemPromptParser(promptFile).getPromptForInstruction(
    BROWNFIELD_ADOPTION_INSTRUCTION,
  );
  if (prompt === null) throw missingGuidePart('prompt');
  return profileVariables;
}

/** Step 5 (D9): a failed write stops the build; building anyway would lose adoption on the next build. */
async function persistInProgress(checkoutPath: string): Promise<void> {
  try {
    await writeAdoptionState(checkoutPath, 'in_progress');
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new AdoptionError(
      `Cannot record adoption state in .context-forge.toml: ${detail}. ` +
        `Build the brownfield prompt without saving: cf build --it ${BROWNFIELD_ADOPTION_INSTRUCTION}. ${DECLINE_REMEDY}`,
      { cause: error },
    );
  }
}

/** CI files relative to the checkout, like the other path facts (a repository-root file reads ../..). */
function relativeCi(checkoutPath: string): CiRecognition {
  const ci = recognizeCi(checkoutPath);
  const base = resolve(checkoutPath);
  return { ...ci, matches: ci.matches.map((match) => relative(base, match)) };
}

/** The state the facts show: what this build is about to write, else what is persisted (R5). */
function stateShownFor(decision: Decision, stateSetByBuild: boolean): AdoptionState {
  if (decision.outcome.kind === 'adoption-completed') return 'complete';
  return stateSetByBuild ? 'in_progress' : decision.state;
}

/** Step 6: the render-only facts and the comprehension pointer, gathered only for a selected build. */
async function renderFacts(
  checkoutPath: string,
  decision: Decision,
  stateSetByBuild: boolean,
  options: { squadronProbe: SquadronProbe; profileVariables: readonly string[] },
): Promise<{ facts: string; fileComprehension: string | undefined }> {
  // The comprehension document is resolved only when the guide's profile carries it (D5).
  const wantsComprehension = options.profileVariables.includes(COMPREHENSION_PROFILE_VARIABLE);
  const [history, probe, fileComprehension] = await Promise.all([
    readHistory(checkoutPath),
    options.squadronProbe(checkoutPath),
    wantsComprehension ? findComprehensionAnalysis(checkoutPath) : undefined,
  ]);
  const facts = renderAdoptionFacts({
    outcome: decision.outcome,
    state: stateShownFor(decision, stateSetByBuild),
    stateSetByBuild,
    history,
    probe,
    docs: presentPaths(checkoutPath, DOC_PATHS),
    adrs: presentPaths(checkoutPath, ADR_DIRS),
    ruleFiles: presentPaths(checkoutPath, RULE_FILE_PATHS),
    ci: relativeCi(checkoutPath),
  });
  return { facts, fileComprehension };
}

export function createAdoptionResolver(options: {
  stateWrites: AdoptionStateWrites;
  squadronProbe: SquadronProbe;
}): AdoptionResolver {
  return async (projectPath, checkoutPath, instruction) => {
    // Step 1: eligible only where the concept prompt would run (D4); no I/O otherwise.
    const explicit = instruction === BROWNFIELD_ADOPTION_INSTRUCTION;
    if (!explicit && resolvePhaseValue(instruction) !== CONCEPT_PHASE) return { selected: false };

    const decision = await decide(checkoutPath, explicit, options.stateWrites);
    if (!isSelected(decision.outcome)) return { selected: false };

    const profileVariables = await assertGuideSupportsAdoption(projectPath);

    // Gather the facts before writing: a probe failure must not leave in_progress persisted
    // for a build that produced no prompt.
    const stateSetByBuild = decision.outcome.kind === 'brownfield' && options.stateWrites === 'persist';
    const { facts, fileComprehension } = await renderFacts(checkoutPath, decision, stateSetByBuild, {
      squadronProbe: options.squadronProbe,
      profileVariables,
    });
    if (stateSetByBuild) await persistInProgress(checkoutPath);
    if (decision.outcome.kind === 'adoption-completed') await persistAdoptionComplete(checkoutPath);

    return {
      selected: true,
      instruction: BROWNFIELD_ADOPTION_INSTRUCTION,
      facts,
      ...(fileComprehension === undefined ? {} : { fileComprehension }),
    };
  };
}
