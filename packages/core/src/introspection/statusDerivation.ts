import { STATUS, type NormalizedStatus } from './types.js';

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
