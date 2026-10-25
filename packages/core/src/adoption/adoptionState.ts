import { ADOPTION_STATES, type AdoptionState } from '../config/ConfigKeys.js';
import { ConfigManager } from '../config/ConfigManager.js';
import { AdoptionError } from './contracts.js';

export { ADOPTION_STATES, type AdoptionState };

const ADOPTION_STATE_KEY = 'adoption.state';
const PROJECT_CONFIG_FILE = '.context-forge.toml';

function isAdoptionState(value: unknown): value is AdoptionState {
  return ADOPTION_STATES.some((state) => state === value);
}

/** Reads the persisted adoption state. A malformed TOML file propagates the parser's error. */
export async function readAdoptionState(root: string): Promise<AdoptionState> {
  const { value } = await new ConfigManager(root).get(ADOPTION_STATE_KEY);
  if (!isAdoptionState(value)) {
    const allowed = ADOPTION_STATES.map((state) => JSON.stringify(state)).join(', ');
    throw new AdoptionError(
      `adoption.state is ${JSON.stringify(value)}, which is not one of [${allowed}]. ` +
        `Fix or remove the [adoption] section in ${PROJECT_CONFIG_FILE}.`,
    );
  }
  return value;
}
