import { STATUS } from '../types.js';
import type { NormalizedStatus } from '../types.js';

/** Maps variant status spellings to normalized values (ported from parse.py _STATUS) */
const STATUS_MAP: Record<string, NormalizedStatus> = {
  complete: STATUS.Complete,
  completed: STATUS.Complete,
  done: STATUS.Complete,
  in_progress: STATUS.InProgress,
  'in-progress': STATUS.InProgress,
  'in progress': STATUS.InProgress,
  active: STATUS.InProgress,
  not_started: STATUS.NotStarted,
  'not-started': STATUS.NotStarted,
  'not started': STATUS.NotStarted,
  ready: STATUS.NotStarted,
  pending: STATUS.NotStarted,
  planned: STATUS.NotStarted,
  deprecated: STATUS.Deprecated,
  deferred: STATUS.Deferred,
};

/**
 * Normalize a raw status string to one of the canonical values.
 *
 * Returns `undefined` when the input was present but not recognized —
 * this is distinct from a real `not-started` and must not be conflated
 * with it.
 */
export function normalizeStatus(raw: string | undefined | null): NormalizedStatus | undefined {
  const key = (raw ?? '').toLowerCase().trim();
  return STATUS_MAP[key];
}
