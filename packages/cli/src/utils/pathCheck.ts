import { PATH_CHECK_REASONS, PathCheckError } from '@context-forge/core/node';
import type { PathCheckReason } from '@context-forge/core/node';
import { UserError } from './errors.js';
import type { ErrorCode } from './errors.js';

/** Error code per path-check failure; shared by `cf prompt get --comprehension` and `cf set`. */
const PATH_CHECK_ERROR_CODES: Record<PathCheckReason, ErrorCode> = {
  [PATH_CHECK_REASONS.missing]: 'ARTIFACT_NOT_FOUND',
  [PATH_CHECK_REASONS.directory]: 'INVALID_ARGUMENT',
  [PATH_CHECK_REASONS.outsideRoot]: 'INVALID_ARGUMENT',
};

/** Runs a core path check, converting its `PathCheckError` into a `UserError`. Other errors pass through. */
export function withPathCheckAsUserError<T>(check: () => T): T {
  try {
    return check();
  } catch (error) {
    if (error instanceof PathCheckError) {
      throw new UserError(error.message, PATH_CHECK_ERROR_CODES[error.reason]);
    }
    throw error;
  }
}
