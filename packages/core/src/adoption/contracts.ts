// Errors shared by the adoption and detection modules.

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

/** Remedy appended to detection errors: the opt-out that skips detection. */
export const OVERRIDE_REMEDY = 'To treat the project as new and skip detection: cf config set adoption.state declined';
