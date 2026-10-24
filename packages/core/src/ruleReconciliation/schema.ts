// Persisted rule-resolution format (slice 266, D2/D3/D5). A resolution is a
// PM-approved statement about which rule wins, keyed by the file pair
// (guide rule basename, project source path), never by rule text. cf stores and
// renders the statement verbatim and never reads it for meaning.
import {
  GENERATED_MARKER,
  MANAGED_BEGIN_MARKER,
  MANAGED_END_MARKER,
} from './markers.js';

export const RULE_RESOLUTIONS_VERSION = 1;
export const RULE_RESOLUTIONS_FILE = 'rule-resolutions.json';
export const RULE_RESOLUTIONS_DIR = '.context-forge';

export interface RuleResolution {
  /** Basename in the guide's `rules/` directory (same convention as `rules.exclude`). */
  guideRule: string;
  /** Checkout-relative path with `/` separators. */
  projectSource: string;
  /** One line of PM-approved text saying which rule applies and how. */
  statement: string;
}

export interface RuleResolutionsFile {
  version: number;
  resolutions: RuleResolution[];
}

/** A malformed resolutions file or record. The message names the file and the problem. */
export class RuleResolutionsError extends Error {
  constructor(file: string, problem: string) {
    super(`${file}: ${problem}`);
    this.name = 'RuleResolutionsError';
  }
}

/** Markers that must never appear inside a statement: they would corrupt the managed block. */
const FORBIDDEN_STATEMENT_MARKERS = [MANAGED_BEGIN_MARKER, MANAGED_END_MARKER, GENERATED_MARKER];

/** The renderer wraps both names in backticks, so a backtick is rejected rather than escaped. */
const BACKTICK = '`';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireString(record: Record<string, unknown>, field: string, file: string): string {
  const value = record[field];
  if (typeof value !== 'string' || value === '') {
    throw new RuleResolutionsError(file, `"${field}" must be a non-empty string`);
  }
  return value;
}

/** Validates one record (D5). `file` is used only to name the source in errors. */
export function validateRuleResolution(r: unknown, file: string): RuleResolution {
  if (!isRecord(r)) throw new RuleResolutionsError(file, 'a resolution must be an object');
  const guideRule = requireString(r, 'guideRule', file);
  const projectSource = requireString(r, 'projectSource', file);
  const statement = requireString(r, 'statement', file);

  for (const [field, value] of [['guideRule', guideRule], ['projectSource', projectSource]] as const) {
    if (value.includes(BACKTICK)) {
      throw new RuleResolutionsError(file, `"${field}" must not contain a backtick`);
    }
  }
  if (/[\r\n]/.test(statement)) {
    throw new RuleResolutionsError(file, '"statement" must be a single line');
  }
  const marker = FORBIDDEN_STATEMENT_MARKERS.find((m) => statement.includes(m));
  if (marker) {
    throw new RuleResolutionsError(file, `"statement" must not contain the marker ${marker}`);
  }
  return { guideRule, projectSource, statement };
}

/** Validates a parsed file: version, shape and every record. */
export function validateRuleResolutionsFile(data: unknown, file: string): RuleResolutionsFile {
  if (!isRecord(data)) throw new RuleResolutionsError(file, 'expected a JSON object');
  if (data.version !== RULE_RESOLUTIONS_VERSION) {
    throw new RuleResolutionsError(
      file,
      `unsupported "version" ${JSON.stringify(data.version)}; expected ${RULE_RESOLUTIONS_VERSION}`,
    );
  }
  if (!Array.isArray(data.resolutions)) {
    throw new RuleResolutionsError(file, '"resolutions" must be an array');
  }
  return {
    version: RULE_RESOLUTIONS_VERSION,
    resolutions: data.resolutions.map((r) => validateRuleResolution(r, file)),
  };
}
