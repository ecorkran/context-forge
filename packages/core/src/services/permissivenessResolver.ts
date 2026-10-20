import * as fs from 'fs';
import * as path from 'path';
import { ConfigManager } from '../config/ConfigManager.js';
import { PERMISSIVENESS_LEVELS, STANDARD_PERMISSIVENESS } from '../config/ConfigKeys.js';
import type { PermissivenessLevel } from '../config/ConfigKeys.js';
import {
  IMPLEMENTATION_PHASE,
  SLICE_DESIGN_PHASE,
  TASK_BREAKDOWN_PHASE,
} from '../schema/projectSchema.js';
import { PermissivenessFragmentError } from './ContextIntegrator.js';
import type { PermissivenessResolver } from './ContextIntegrator.js';
import { resolvePromptFilePath } from './promptFilePath.js';

/** Instruction values (schema phase strings) for which the fragment applies: phases 4-6. */
export const PERMISSIVENESS_PHASES: ReadonlySet<string> = new Set([
  SLICE_DESIGN_PHASE,
  TASK_BREAKDOWN_PHASE,
  IMPLEMENTATION_PHASE,
]);

/** Fragment directory, relative to the guide's `project-guides` directory. */
export const PERMISSIVENESS_FRAGMENT_DIR = 'rules/permissiveness';

const GUIDE_UPDATE_HINT = "Run 'cf guides update' to refresh the AI project guide.";

// A leading YAML frontmatter block. Lenient about CRLF, trailing spaces on the
// delimiter lines, and an empty block.
const FRONTMATTER_BLOCK = /^---[ \t]*\r?\n(?:[\s\S]*?\r?\n)?---[ \t]*(?:\r?\n|$)/;

function isPermissivenessLevel(value: unknown): value is PermissivenessLevel {
  return PERMISSIVENESS_LEVELS.some((level) => level === value);
}

function stripFrontmatter(raw: string): string {
  return raw.replace(FRONTMATTER_BLOCK, '').replace(/\r\n/g, '\n').trim();
}

function readFragment(fragmentPath: string, level: PermissivenessLevel): string {
  let raw: string;
  try {
    raw = fs.readFileSync(fragmentPath, 'utf-8');
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    const problem = code === 'ENOENT' ? 'is missing' : `could not be read (${code ?? String(err)})`;
    throw new Error(
      `workflow.permissiveness is "${level}" but its guide fragment ${problem}: ${fragmentPath}. ${GUIDE_UPDATE_HINT}`,
      { cause: err }
    );
  }
  const body = stripFrontmatter(raw);
  if (body === '') {
    throw new Error(
      `workflow.permissiveness is "${level}" but its guide fragment has no body: ${fragmentPath}. ${GUIDE_UPDATE_HINT}`
    );
  }
  return body;
}

async function loadFragment(checkoutPath: string): Promise<string> {
  const { value } = await new ConfigManager(checkoutPath).get('workflow.permissiveness');
  if (!isPermissivenessLevel(value)) {
    throw new Error(
      `workflow.permissiveness must be one of [${PERMISSIVENESS_LEVELS.join(', ')}], got ${JSON.stringify(value)}`
    );
  }
  if (value === STANDARD_PERMISSIVENESS) return '';

  const projectGuidesDir = path.dirname(resolvePromptFilePath(checkoutPath));
  const fragmentPath = path.join(projectGuidesDir, PERMISSIVENESS_FRAGMENT_DIR, `${value}.md`);
  return readFragment(fragmentPath, value);
}

/**
 * Resolves the guide fragment for workflow.permissiveness in one checkout.
 *
 * Returns '' when the instruction is not a phase 4-6 string or the level is
 * `standard`. Otherwise returns the body of `<level>.md` from the installed
 * guide, frontmatter removed. Any failure past the phase check (bad config
 * value, missing guide, or a missing, unreadable or body-less fragment) throws
 * PermissivenessFragmentError; there is no fallback to `standard`.
 */
export const resolvePermissivenessForPrompt: PermissivenessResolver = async (
  checkoutPath,
  instruction
) => {
  if (!PERMISSIVENESS_PHASES.has(instruction)) return '';
  try {
    return await loadFragment(checkoutPath);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new PermissivenessFragmentError(message, { cause: err });
  }
};
