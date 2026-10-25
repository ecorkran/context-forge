// Failure of the docs map (slice 267): carries the path and the reason, and names both.
// Lives in its own file so discovery and the map writer can both import it without a cycle.
import { isFsError } from '../detection/pathPresent.js';

export class DocsMapError extends Error {
  constructor(
    readonly path: string,
    readonly reason: string,
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
  return new DocsMapError(path, `cannot ${action}: ${error.code}`);
}
