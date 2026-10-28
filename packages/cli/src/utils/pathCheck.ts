import { PATH_CHECK_REASONS, PathCheckError } from '@context-forge/core/node';
import type { PathCheckReason } from '@context-forge/core/node';
import { UserError } from './errors.js';
import type { ErrorCode } from './errors.js';

/** Error code per path-check failure; shared by `cf prompt get --comprehension` and `cf set`. */
function errorCodeFor(reason: PathCheckReason): ErrorCode {
  switch (reason) {
    case PATH_CHECK_REASONS.missing:
      return 'ARTIFACT_NOT_FOUND';
    case PATH_CHECK_REASONS.directory:
    case PATH_CHECK_REASONS.outsideRoot:
      return 'INVALID_ARGUMENT';
  }
}

/** Runs a core path check, converting its `PathCheckError` into a `UserError`. Other errors pass through. */
export function withPathCheckAsUserError<T>(check: () => T): T {
  try {
    return check();
  } catch (error) {
    if (error instanceof PathCheckError) {
      throw new UserError(error.message, errorCodeFor(error.reason));
    }
    throw error;
  }
}
