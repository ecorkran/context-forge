import { describe, it, expect } from 'vitest';
import { deriveEntryStatus } from '../../src/introspection/statusDerivation.js';
import { STATUS } from '../../src/introspection/types.js';

describe('deriveEntryStatus', () => {
  it('deprecated frontmatter wins regardless of task/checkbox state', () => {
    expect(
      deriveEntryStatus({
        frontmatterStatus: STATUS.Deprecated,
        taskInferredStatus: STATUS.Complete,
        isChecked: false,
      }),
    ).toBe(STATUS.Deprecated);

    expect(
      deriveEntryStatus({
        frontmatterStatus: STATUS.Deprecated,
        taskInferredStatus: STATUS.InProgress,
        isChecked: true,
      }),
    ).toBe(STATUS.Deprecated);
  });

  it('task in-progress wins over frontmatter complete', () => {
    expect(
      deriveEntryStatus({
        frontmatterStatus: STATUS.Complete,
        taskInferredStatus: STATUS.InProgress,
        isChecked: false,
      }),
    ).toBe(STATUS.InProgress);
  });

  it('task complete wins over unchecked checkbox (the #56 regression shape)', () => {
    expect(
      deriveEntryStatus({
        taskInferredStatus: STATUS.Complete,
        isChecked: false,
      }),
    ).toBe(STATUS.Complete);
  });

  it('task not-started wins over frontmatter', () => {
    expect(
      deriveEntryStatus({
        frontmatterStatus: STATUS.InProgress,
        taskInferredStatus: STATUS.NotStarted,
        isChecked: false,
      }),
    ).toBe(STATUS.NotStarted);
  });

  it('frontmatter-only (no task signal) returns frontmatter value', () => {
    expect(
      deriveEntryStatus({
        frontmatterStatus: STATUS.InProgress,
        isChecked: false,
      }),
    ).toBe(STATUS.InProgress);
  });

  it('neither signal, checked → complete', () => {
    expect(deriveEntryStatus({ isChecked: true })).toBe(STATUS.Complete);
  });

  it('neither signal, unchecked → not-started', () => {
    expect(deriveEntryStatus({ isChecked: false })).toBe(STATUS.NotStarted);
  });
});
