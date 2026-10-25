import {
  ADOPTION_OPT_OUT,
  ADOPTION_STATES,
  LEGACY_ADOPTION_STATES,
  type AdoptionState,
  type LegacyAdoptionState,
} from '../config/ConfigKeys.js';
import { ConfigManager } from '../config/ConfigManager.js';
import { AdoptionError } from './contracts.js';

export { ADOPTION_STATES, type AdoptionState };

const ADOPTION_STATE_KEY = 'adoption.state';
const PROJECT_CONFIG_FILE = '.context-forge.toml';

function isAdoptionState(value: unknown): value is AdoptionState {
  return ADOPTION_STATES.some((state) => state === value);
}

function isLegacyAdoptionState(value: unknown): value is LegacyAdoptionState {
  return LEGACY_ADOPTION_STATES.some((state) => state === value);
}

function outOfEnumError(value: unknown): AdoptionError {
  const allowed = ADOPTION_STATES.map((state) => JSON.stringify(state)).join(', ');
  return new AdoptionError(
    `adoption.state is ${JSON.stringify(value)}, which is not one of [${allowed}]. ` +
      `Fix or remove the [adoption] section in ${PROJECT_CONFIG_FILE}.`,
  );
}

export interface AdoptionOptOut {
  optedOut: boolean;
  /** A pre-269 value found in config and ignored (D2), or null. */
  ignoredLegacyValue: LegacyAdoptionState | null;
}

/**
 * Reads the adoption opt-out (D2). `declined` opts out; absent or empty does not; a legacy value
 * does not and is reported. Any other value throws. A malformed TOML file propagates the parser's error.
 */
export async function readAdoptionOptOut(root: string): Promise<AdoptionOptOut> {
  const { value } = await new ConfigManager(root).get(ADOPTION_STATE_KEY);
  if (isLegacyAdoptionState(value)) return { optedOut: false, ignoredLegacyValue: value };
  if (!isAdoptionState(value)) throw outOfEnumError(value);
  return { optedOut: value === ADOPTION_OPT_OUT, ignoredLegacyValue: null };
}

/** The notice shown while a legacy value is stored (D3). The only place this text is built. */
export function legacyAdoptionStateNotice(value: LegacyAdoptionState): string {
  return (
    `adoption.state is "${value}", which is no longer used and is ignored: adoption progress now comes ` +
    `from the project's files. Remove it with: cf config unset adoption.state`
  );
}

/** Reads the persisted adoption state. A malformed TOML file propagates the parser's error. */
export async function readAdoptionState(root: string): Promise<AdoptionState> {
  const { value } = await new ConfigManager(root).get(ADOPTION_STATE_KEY);
  if (!isAdoptionState(value)) throw outOfEnumError(value);
  return value;
}
