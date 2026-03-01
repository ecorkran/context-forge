import type { NormalizedStatus } from '../types.js';

/** Maps variant status spellings to normalized values (ported from parse.py _STATUS) */
const STATUS_MAP: Record<string, NormalizedStatus> = {
  complete: 'complete',
  completed: 'complete',
  done: 'complete',
  in_progress: 'in-progress',
  'in-progress': 'in-progress',
  'in progress': 'in-progress',
  active: 'in-progress',
  not_started: 'not-started',
  'not-started': 'not-started',
  'not started': 'not-started',
  ready: 'not-started',
  pending: 'not-started',
  planned: 'not-started',
  deprecated: 'deprecated',
};

/** Normalize a raw status string to one of the canonical values */
export function normalizeStatus(raw: string | undefined | null): NormalizedStatus {
  const key = (raw ?? '').toLowerCase().trim();
  return STATUS_MAP[key] ?? 'not-started';
}
