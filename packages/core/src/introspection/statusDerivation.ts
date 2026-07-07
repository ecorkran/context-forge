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
  /** The slice-plan checkbox. Its only authority is asserting complete. */
  isChecked: boolean;
}

/**
 * Derive a slice-plan entry's status from the precedence lattice
 * (highest priority first): deprecated frontmatter > computed task
 * completion > slice-design frontmatter > plan checkbox.
 */
export function deriveEntryStatus(signals: EntryStatusSignals): NormalizedStatus {
  if (signals.frontmatterStatus === STATUS.Deprecated) {
    return STATUS.Deprecated;
  }
  if (signals.taskInferredStatus !== undefined) {
    return signals.taskInferredStatus;
  }
  if (signals.frontmatterStatus !== undefined) {
    return signals.frontmatterStatus;
  }
  return signals.isChecked ? STATUS.Complete : STATUS.NotStarted;
}
