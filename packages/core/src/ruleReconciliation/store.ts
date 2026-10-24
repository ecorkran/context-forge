// Read and append rule resolutions in `<root>/.context-forge/rule-resolutions.json`.
// An absent file is the valid empty state; anything malformed throws. Writes go to
// a temp file in the same directory and are renamed into place (atomic).
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs';
import { join } from 'path';
import { isEnoent } from '../detection/pathPresent.js';
import {
  RULE_RESOLUTIONS_DIR,
  RULE_RESOLUTIONS_FILE,
  RULE_RESOLUTIONS_VERSION,
  RuleResolutionsError,
  validateRuleResolution,
  validateRuleResolutionsFile,
  type RuleResolution,
  type RuleResolutionsFile,
} from './schema.js';

function resolutionsPath(root: string): string {
  return join(root, RULE_RESOLUTIONS_DIR, RULE_RESOLUTIONS_FILE);
}

/** Records in file order. Absent file → []. Malformed file → RuleResolutionsError. */
export function readRuleResolutions(root: string): RuleResolution[] {
  const file = resolutionsPath(root);
  let text: string;
  try {
    text = readFileSync(file, 'utf-8');
  } catch (error) {
    // ENOENT means no resolutions recorded yet; every other read error propagates.
    if (isEnoent(error)) return [];
    throw error;
  }
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new RuleResolutionsError(file, `not valid JSON (${reason})`);
  }
  return validateRuleResolutionsFile(data, file).resolutions;
}

/** Validates, appends and atomically rewrites the file. A malformed existing file throws before any write. */
export function addRuleResolution(root: string, resolution: RuleResolution): void {
  const file = resolutionsPath(root);
  const record = validateRuleResolution(resolution, file);
  const existing = readRuleResolutions(root);
  const content: RuleResolutionsFile = {
    version: RULE_RESOLUTIONS_VERSION,
    resolutions: [...existing, record],
  };
  mkdirSync(join(root, RULE_RESOLUTIONS_DIR), { recursive: true });
  const temp = `${file}.tmp`;
  writeFileSync(temp, JSON.stringify(content, null, 2) + '\n', 'utf-8');
  renameSync(temp, file);
}
