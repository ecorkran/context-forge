import { describe, expect, it } from 'vitest';
import { PATH_CHECK_REASONS, PathCheckError } from '@context-forge/core/node';
import { UserError } from '../../src/utils/errors.js';
import { withPathCheckAsUserError } from '../../src/utils/pathCheck.js';

function userErrorFor(reason: (typeof PATH_CHECK_REASONS)[keyof typeof PATH_CHECK_REASONS]): UserError {
  try {
    withPathCheckAsUserError(() => {
      throw new PathCheckError(reason, '/some/path');
    });
  } catch (error) {
    if (error instanceof UserError) return error;
    throw error;
  }
  throw new Error('expected a UserError');
}

describe('withPathCheckAsUserError', () => {
  it('maps missing to ARTIFACT_NOT_FOUND', () => {
    expect(userErrorFor(PATH_CHECK_REASONS.missing).code).toBe('ARTIFACT_NOT_FOUND');
  });

  it('maps directory and outside-root to INVALID_ARGUMENT', () => {
    expect(userErrorFor(PATH_CHECK_REASONS.directory).code).toBe('INVALID_ARGUMENT');
    expect(userErrorFor(PATH_CHECK_REASONS.outsideRoot).code).toBe('INVALID_ARGUMENT');
  });

  it('keeps the core message', () => {
    expect(userErrorFor(PATH_CHECK_REASONS.missing).message).toContain('/some/path');
  });

  it('passes the result through when the check succeeds', () => {
    expect(withPathCheckAsUserError(() => 'ok')).toBe('ok');
  });

  it('rethrows other errors unchanged', () => {
    const boom = new Error('boom');
    expect(() =>
      withPathCheckAsUserError(() => {
        throw boom;
      }),
    ).toThrow(boom);
  });
});
