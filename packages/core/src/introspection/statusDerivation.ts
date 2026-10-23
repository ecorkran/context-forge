import { STATUS, type DisplayStatus, type NormalizedStatus, type ResolvedSlicePlanEntry } from './types.js';

/**
 * Already-resolved signals for a single slice-plan entry. The caller is
 * responsible for I/O (detectDocuments / parseTaskFile / parseFrontmatter)
 * and for distinguishing "signal absent" (leave the field undefined) from
 * "signal present but failed to resolve" (do not call this function with a
 * placeholder — surface the resolution failure instead; see TD-2a).
 */
export interface EntryStatusSignals {
  /** Slice-design frontmatter status, if a design exists and normalized cleanly. */
  frontmatterStatus?: NormalizedStatus;
  /** Task file's inferred status, if a task file exists and parsed cleanly. */
  taskInferredStatus?: NormalizedStatus;
  /** The slice-plan line's own checkbox-derived status (`[~]` → deprecated). */
  planLineStatus?: NormalizedStatus;
  /** The slice-plan checkbox. Its only authority is asserting complete. */
  isChecked: boolean;
}

/**
 * Derive a slice-plan entry's status from the precedence lattice
 * (highest priority first): deprecated/deferred frontmatter > computed task
 * completion > slice-design frontmatter > plan checkbox.
 *
 * deprecated and deferred are both declarations of intent, not observations
 * of progress — a slice explicitly marked deferred should read as deferred
 * even if its task file shows partial or zero completion, the same way a
 * deprecated slice isn't reported as "in progress" just because some tasks
 * are checked.
 */
export function deriveEntryStatus(signals: EntryStatusSignals): NormalizedStatus {
  if (signals.planLineStatus === STATUS.Deprecated || signals.frontmatterStatus === STATUS.Deprecated) {
    return STATUS.Deprecated;
  }
  if (signals.frontmatterStatus === STATUS.Deferred) {
    return STATUS.Deferred;
  }
  if (signals.taskInferredStatus !== undefined) {
    return signals.taskInferredStatus;
  }
  if (signals.frontmatterStatus !== undefined) {
    return signals.frontmatterStatus;
  }
  return signals.isChecked ? STATUS.Complete : STATUS.NotStarted;
}

/**
 * Find the first plan entry whose derived status is not complete/deprecated/deferred.
 * Replaces the old `entries.find((e) => !e.isChecked)` — the direct #56 fix:
 * a slice with all tasks complete but an unchecked plan checkbox is no
 * longer selected as "next unstarted". A degraded entry (TD-2a) counts as
 * not-complete so it surfaces rather than being silently skipped. A deferred
 * entry is a "not now" declaration, same as deprecated is a "not ever" one —
 * neither should be offered as the next slice to work on.
 *
 * Reads the already-resolved `entry.status` (computed once by getStatus's
 * parseSlicePlanSafe) rather than re-deriving via a second filesystem pass —
 * avoids redundant I/O and, for a degraded entry, avoids pushing the same
 * TD-2a warning into the caller's warnings list twice (#62).
 */
export function findFirstNotCompleteEntry(
  entries: ResolvedSlicePlanEntry[],
): { entry: ResolvedSlicePlanEntry; status: DisplayStatus } | undefined {
  for (const entry of entries) {
    if (
      entry.status !== STATUS.Complete &&
      entry.status !== STATUS.Deprecated &&
      entry.status !== STATUS.Deferred
    ) {
      return { entry, status: entry.status };
    }
  }
  return undefined;
}
