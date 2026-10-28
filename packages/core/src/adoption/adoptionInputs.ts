// Adoption artifacts (slice 271, D3): the three planning files `sq onboard` needs to resume an
// adoption, reported as root-relative paths so consumers need not know cf's file names. Read-only.
import { isAbsolute, relative, sep } from 'node:path';
import { resolveConceptPath } from '../introspection/parsers/projectGuideFile.js';
import { CODEBASE_REFERENCE_VARIABLES } from '../services/constants.js';
import { readPlanningFacts, type PlanningFacts } from './planningFacts.js';

export interface AdoptionArtifacts {
  concept: string | null;
  derivedArchitectures: string[];
  existingStatePlan: string | null;
}

/**
 * A path relative to `root` with `/` separators (D3). A path outside the root keeps its climbing
 * `../` segments, which is how a monorepo's root-level CI file is reported (D2).
 */
export function toRootRelative(root: string, absolutePath: string): string {
  return relative(root, absolutePath).split(sep).join('/');
}

/**
 * The concept, derived architectures and existing-state plan under `root`. Planning-file read
 * errors (`AdoptionError`) propagate unchanged; the caller attaches the error code. Pass `facts`
 * when the caller has already read them, so one call never reads the planning files twice.
 */
export async function readAdoptionArtifacts(root: string, facts?: PlanningFacts): Promise<AdoptionArtifacts> {
  const [conceptPath, planning] = await Promise.all([resolveConceptPath(root), facts ?? readPlanningFacts(root)]);
  const relativeToRoot = (path: string): string => toRootRelative(root, path);
  return {
    concept: conceptPath === null ? null : relativeToRoot(conceptPath),
    derivedArchitectures: planning.derivedArchitectures.map(relativeToRoot),
    existingStatePlan: planning.existingStatePlan === null ? null : relativeToRoot(planning.existingStatePlan),
  };
}

/** The guide's context-profile variable that marks a prompt as taking a comprehension doc (D10: the guide's name). */
export const COMPREHENSION_PROFILE_VARIABLE = CODEBASE_REFERENCE_VARIABLES.comprehension;

export const ADOPTION_INPUTS_HEADING = '## Adoption Inputs';
export const ADOPTION_INPUT_LABELS = {
  comprehension: 'Codebase comprehension',
  concept: 'Concept',
  derivedArchitecture: 'Derived architecture',
  existingStatePlan: 'Existing-state slice plan',
} as const;
export const NO_COMPREHENSION_SENTENCE = 'No codebase comprehension analysis was provided.';
export const ABSENT_ARTIFACT = 'none';

/** Root-relative with `/` when inside `root`, the absolute path otherwise (D7 item 3). */
function displayPath(root: string, absolutePath: string): string {
  const fromRoot = relative(root, absolutePath);
  const outside = fromRoot === '..' || fromRoot.startsWith(`..${sep}`) || isAbsolute(fromRoot);
  return outside ? absolutePath : fromRoot.split(sep).join('/');
}

/**
 * The `## Adoption Inputs` section appended to a prompt whose profile lists the comprehension
 * variable (D7). `comprehensionPath` is absolute, or null when none was passed.
 */
export function renderAdoptionInputs(
  root: string,
  comprehensionPath: string | null,
  artifacts: AdoptionArtifacts,
): string {
  const labeled = (label: string, value: string | null): string => `- ${label}: ${value ?? ABSENT_ARTIFACT}`;
  const comprehension =
    comprehensionPath === null
      ? `- ${NO_COMPREHENSION_SENTENCE}`
      : labeled(ADOPTION_INPUT_LABELS.comprehension, displayPath(root, comprehensionPath));
  const derived = artifacts.derivedArchitectures.length > 0 ? artifacts.derivedArchitectures.join(', ') : null;
  return [
    ADOPTION_INPUTS_HEADING,
    comprehension,
    labeled(ADOPTION_INPUT_LABELS.concept, artifacts.concept),
    labeled(ADOPTION_INPUT_LABELS.derivedArchitecture, derived),
    labeled(ADOPTION_INPUT_LABELS.existingStatePlan, artifacts.existingStatePlan),
  ].join('\n');
}
