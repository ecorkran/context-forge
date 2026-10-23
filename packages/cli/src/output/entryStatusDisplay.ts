import type { NormalizedStatus } from '@context-forge/core';
import { STATUS } from '@context-forge/core';
import { success, dim, warn } from './styles.js';

/** A derived status, or the TD-2a degraded case for a signal that failed to resolve. */
export type DisplayStatus = NormalizedStatus | 'degraded';

/**
 * Render a plan/arch entry's derived status for table display.
 * Distinguishes a signed-off complete entry (checkbox ticked) from a
 * derived-complete-but-unchecked one (tasks done, awaiting sign-off) — this
 * is presentation only; callers must branch on the underlying NormalizedStatus,
 * never on this rendered label (CLAUDE.md: labels are not logical structure).
 * A checked retroactive entry (slice 263 D8) reads `✓ retroactive`, so the list does not
 * present recorded history as reviewed work.
 */
export function renderEntryStatus(status: DisplayStatus, isChecked: boolean, retroactive = false): string {
  if (status === 'degraded') return warn('⚠ unreadable');
  switch (status) {
    case STATUS.Deprecated:
      return dim('⊘ deprecated');
    case STATUS.Deferred:
      return dim('⏸ deferred');
    case STATUS.Complete:
      if (!isChecked) return success('● tasks done');
      return success(retroactive ? '✓ retroactive' : '✓ complete');
    case STATUS.InProgress:
      return warn('◐ in progress');
    case STATUS.NotStarted:
      return dim('○ not started');
  }
}
