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

/** Plain Levenshtein distance — inputs are short status strings, so O(n*m) is fine. */
function editDistance(a: string, b: string): number {
  const dp: number[][] = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
  }
  return dp[a.length][b.length];
}

/**
 * Suggest the canonical status a raw value most likely intends, for fix
 * suggestions only — never for reading state. Tries the exact alias map
 * first, then a conservative typo match against the alias keys.
 *
 * Returns `undefined` when no safe suggestion exists: input too short to
 * fuzzy-match, no alias within edit distance, or the nearest aliases are
 * ambiguous (tie between different canonical values).
 */
export function suggestStatus(raw: string | undefined | null): NormalizedStatus | undefined {
  const exact = normalizeStatus(raw);
  if (exact) return exact;

  const key = (raw ?? '').toLowerCase().trim();
  // Short strings make distance-based matching unreliable (e.g. any 4-letter
  // word is close to 'done'); only attempt typo rescue on longer values.
  if (key.length < 6) return undefined;
  const maxDistance = 2;

  let bestDistance = maxDistance + 1;
  let candidates = new Set<NormalizedStatus>();
  for (const [alias, canonical] of Object.entries(STATUS_MAP)) {
    const d = editDistance(key, alias);
    if (d < bestDistance) {
      bestDistance = d;
      candidates = new Set([canonical]);
    } else if (d === bestDistance) {
      candidates.add(canonical);
    }
  }
  return candidates.size === 1 ? [...candidates][0] : undefined;
}
