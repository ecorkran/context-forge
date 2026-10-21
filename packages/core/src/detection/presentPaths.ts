// Presence-only facts for the Adoption Facts section (slice 261, D5). Core records
// which well-known paths exist; it never reads them for meaning. Not re-exported
// from detection/index.ts: other slices decide their own needs.
import { join } from 'path';
import { pathPresent } from './pathPresent.js';

export const DOC_PATHS: readonly string[] = ['README.md', 'README', 'docs', 'doc'];

export const ADR_DIRS: readonly string[] = [
  'docs/adr',
  'docs/adrs',
  'docs/decisions',
  'docs/architecture/decisions',
  'doc/adr',
  'adr',
  'adrs',
];

export const RULE_FILE_PATHS: readonly string[] = [
  'CLAUDE.md',
  'AGENTS.md',
  'GEMINI.md',
  '.cursorrules',
  '.cursor/rules',
  '.windsurfrules',
  '.github/copilot-instructions.md',
  '.claude/rules',
];

/** The candidates (relative to root) that exist, in candidate order. Non-ENOENT errors throw. */
export function presentPaths(root: string, candidates: readonly string[]): string[] {
  return candidates.filter((candidate) => pathPresent(join(root, candidate)));
}
