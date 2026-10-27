// Presence-only facts for the detection report (`cf detect`, slice 271), docs map
// discovery and rule reconciliation. Core records which well-known paths exist; it
// never reads them for meaning. Exported from detection/index.ts: rule reconciliation
// (slice 266) enumerates the same list.
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
  '.github/instructions',
  '.claude/rules',
];

/**
 * The rule files `setup-ide` writes a managed block into: the project's own text
 * sits outside the block. Every other `RULE_FILE_PATHS` entry is project-owned whole.
 */
export const COMPOSITE_RULE_FILES: readonly string[] = [
  'CLAUDE.md',
  'AGENTS.md',
  '.github/copilot-instructions.md',
];

/** The candidates (relative to root) that exist, in candidate order. Non-ENOENT errors throw. */
export function presentPaths(root: string, candidates: readonly string[]): string[] {
  return candidates.filter((candidate) => pathPresent(join(root, candidate)));
}
