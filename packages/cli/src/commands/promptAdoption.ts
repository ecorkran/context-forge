import * as fs from 'node:fs';
import * as path from 'node:path';
import { UserError } from '../utils/errors.js';

/**
 * Resolves `--comprehension` against the project root (D7 item 3). The path must exist and be a
 * file. cf never reads it and does no containment check: it only names the path to an agent that
 * can already read the disk.
 */
export function resolveComprehensionPath(root: string, input: string): string {
  const resolved = path.resolve(root, input);
  let stats: fs.Stats;
  try {
    stats = fs.statSync(resolved);
  } catch (error) {
    // statSync only throws filesystem errors, which carry a `code`.
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    throw new UserError(`--comprehension path does not exist: ${resolved}`, 'ARTIFACT_NOT_FOUND');
  }
  if (stats.isDirectory()) {
    throw new UserError(`--comprehension path is a directory, not a file: ${resolved}`, 'INVALID_ARGUMENT');
  }
  return resolved;
}
