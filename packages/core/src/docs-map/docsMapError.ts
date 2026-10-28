// Failure of the docs map (slice 267): carries the path and the reason, and names both.
// Lives in its own file so discovery and the map writer can both import it without a cycle.
import { isFsError } from '../detection/pathPresent.js';

/** What went wrong, so callers choose a remedy without matching on message text. */
export const DOCS_MAP_ERROR_KIND = {
  /** The map's managed block is absent or broken: fixing the markers is the remedy. */
  Markers: 'markers',
  /** Any other failure: unreadable files, an unusable project name. */
  Other: 'other',
} as const;

export type DocsMapErrorKind = (typeof DOCS_MAP_ERROR_KIND)[keyof typeof DOCS_MAP_ERROR_KIND];

export class DocsMapError extends Error {
  constructor(
    readonly path: string,
    readonly reason: string,
    readonly kind: DocsMapErrorKind,
  ) {
    super(`Docs map: ${reason} (${path})`);
    this.name = 'DocsMapError';
  }
}

/**
 * Wrap a filesystem failure as a DocsMapError naming the path and system code.
 * Anything that is not a filesystem error is returned unchanged for the caller to rethrow.
 */
export function wrapFsError(path: string, action: string, error: unknown): unknown {
  if (!isFsError(error)) return error;
  return new DocsMapError(path, `cannot ${action}: ${error.code}`, DOCS_MAP_ERROR_KIND.Other);
}
