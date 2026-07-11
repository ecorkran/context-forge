import { UserError } from './errors.js';

/**
 * Parse and validate an `[archIndex]` positional argument shared by
 * `cf list slices` / `cf list tasks`. Throws UserError on non-numeric or
 * negative input; returns the parsed integer otherwise.
 */
export function parseArchIndex(raw: string): number {
  const archIndex = Number(raw);
  if (!Number.isInteger(archIndex) || archIndex < 0) {
    throw new UserError(`Invalid archIndex '${raw}' — must be a non-negative integer.`);
  }
  return archIndex;
}
