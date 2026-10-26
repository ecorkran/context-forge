// Errors and texts shared by the adoption and detection modules.
import { ADOPTION_OPT_OUT } from '../config/ConfigKeys.js';

/**
 * Raised when adoption state or detection cannot be read or decided (for example an
 * `adoption.state` value outside the allowed set). The message carries the remedy.
 */
export class AdoptionError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'AdoptionError';
  }
}

/** The command that opts a project out of adoption detection. */
export const OPT_OUT_COMMAND = `cf config set adoption.state ${ADOPTION_OPT_OUT}`;

/** Remedy appended to detection errors: the opt-out that skips detection. */
export const OVERRIDE_REMEDY = `To treat the project as new and skip detection: ${OPT_OUT_COMMAND}`;
