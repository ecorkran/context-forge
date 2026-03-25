/** A breaking CLI change that agents should be aware of. */
export interface BreakingChange {
  /** Version that introduced the breaking change. */
  since: string;
  /** Human-readable description of what changed. */
  change: string;
}

/**
 * Breaking changes since the last minor version bump.
 * Manually maintained — add entries when making breaking CLI changes.
 * Clear this array when bumping the minor version.
 */
export const BREAKING_CHANGES: BreakingChange[] = [
  { since: '0.6.20', change: 'cf slice list → cf list slices (and other artifact list commands)' },
  { since: '0.6.23', change: 'Bare cf build no longer outputs raw prompt — use cf build --json or /cf:build slash command' },
];
