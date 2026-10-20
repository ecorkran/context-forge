// Decides whether `cf next` offers the setup-ci skill (slice 260, D5-D7).
import { join } from 'path';
import type { ConfigManager } from '../config/ConfigManager.js';
import { hasBuildManifest } from '../detection/buildManifest.js';
import { recognizeCi } from '../detection/ciDetection.js';
import { isFsError, pathPresent } from '../detection/pathPresent.js';
import { SETUP_CI_OFFER_ID, type NextOffer } from './types.js';

const SETUP_CI_OFFER_KEY = 'workflow.setup_ci_offer';

/** A release skill in either location means the project already has a release process. */
const RELEASE_SKILL_PATHS: readonly string[] = [
  join('.claude', 'skills', 'release', 'SKILL.md'),
  join('.agents', 'skills', 'release', 'SKILL.md'),
];

const OFFER_MESSAGE =
  'No CI detected for this project. The setup-ci skill can add CI and a release skill. Not wanted? Run: cf config set workflow.setup_ci_offer false';

export interface OfferEvaluation {
  offer: NextOffer | null;
  /** Set when a filesystem check failed; the offer is then withheld. */
  warning: string | null;
}

const NO_OFFER: OfferEvaluation = { offer: null, warning: null };

async function isOfferEnabled(config: ConfigManager): Promise<boolean> {
  const { value } = await config.get(SETUP_CI_OFFER_KEY);
  if (typeof value !== 'boolean') {
    throw new Error(`Config key "${SETUP_CI_OFFER_KEY}" must be true or false, got ${JSON.stringify(value)}`);
  }
  return value;
}

/** True when the project has a build manifest and no recognized CI and no release skill. */
function offerConditionsMet(projectPath: string): boolean {
  if (!hasBuildManifest(projectPath)) return false;
  if (recognizeCi(projectPath).recognized) return false;
  return !RELEASE_SKILL_PATHS.some((relative) => pathPresent(join(projectPath, relative)));
}

export async function evaluateSetupCiOffer(projectPath: string, config: ConfigManager): Promise<OfferEvaluation> {
  // A non-boolean value is a configuration error and propagates.
  if (!(await isOfferEnabled(config))) return NO_OFFER;

  try {
    if (!offerConditionsMet(projectPath)) return NO_OFFER;
  } catch (error) {
    if (!isFsError(error)) throw error;
    // The offer is advisory: a filesystem error becomes a visible warning instead of
    // failing `cf next` (D6). Anything that is not a Node fs error still propagates.
    const location = error.path ? ` at ${error.path}` : '';
    return { offer: null, warning: `setup-ci offer skipped: could not check the project${location}: ${error.message}` };
  }
  return { offer: { id: SETUP_CI_OFFER_ID, message: OFFER_MESSAGE }, warning: null };
}
