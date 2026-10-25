/**
 * The `agents:` rule marker (slice 935, issue #123): which outputs a guide rule
 * reaches. Audiences are per output file family, not per setup-ide target,
 * because AGENTS.md is written by three targets. Absent key: every audience.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { InstallContext } from './context.js';
import { excludedMessage } from './exclusions.js';
import { listMarkdownFiles } from './fsChecks.js';
import { FENCE } from './frontmatter.js';
import { toRecords } from './lines.js';

export const RULE_AUDIENCE = {
  /** CLAUDE.md block, .claude/rules/ */
  Claude: 'claude',
  /** AGENTS.md block and its scoped index */
  Agents: 'agents',
  /** copilot-instructions.md block, .github/instructions/ */
  Copilot: 'copilot',
  /** .cursor/rules/ */
  Cursor: 'cursor',
} as const;
export type RuleAudience = (typeof RULE_AUDIENCE)[keyof typeof RULE_AUDIENCE];

/** The audiences that own a composite managed block. */
export type CompositeAudience = Exclude<RuleAudience, typeof RULE_AUDIENCE.Cursor>;

const KNOWN: readonly string[] = Object.values(RULE_AUDIENCE);

/** Known audiences, comma-separated, for messages. */
export const KNOWN_AUDIENCES_TEXT = KNOWN.join(', ');

export interface AudienceList {
  known: RuleAudience[];
  /** Raw values that name no audience. */
  unknown: string[];
  /** `agents:` with no inline value (e.g. a block list): reaches no output. */
  notInline: boolean;
}

const AGENTS_KEY = /^agents:(.*)$/;
/** A YAML comment: `#` preceded by whitespace, to end of line. */
const TRAILING_COMMENT = /\s+#.*$/;

function isAudience(value: string): value is RuleAudience {
  return KNOWN.includes(value);
}

function parseValues(raw: string): string[] {
  const trimmed = raw.trim();
  const inner = trimmed.startsWith('[') && trimmed.endsWith(']') ? trimmed.slice(1, -1) : trimmed;
  return inner
    .split(',')
    .map((item) => item.trim().replace(/^["']/, '').replace(/["']$/, '').trim().toLowerCase())
    .filter((item) => item !== '');
}

/**
 * The rule's declared audiences, or null when the key is absent. Read from the
 * line after the opening fence to the closing fence (or end of file).
 */
export function ruleAudiences(text: string): AudienceList | null {
  let inFrontmatter = false;
  for (const line of toRecords(text)) {
    if (line === FENCE) {
      if (inFrontmatter) break;
      inFrontmatter = true;
      continue;
    }
    if (!inFrontmatter) continue;
    const match = AGENTS_KEY.exec(line);
    if (match === null) continue;
    const raw = match[1].replace(TRAILING_COMMENT, '').trim();
    if (raw === '') return { known: [], unknown: [], notInline: true };
    const list: AudienceList = { known: [], unknown: [], notInline: false };
    for (const value of parseValues(raw)) {
      if (isAudience(value)) list.known.push(value);
      else list.unknown.push(value);
    }
    return list;
  }
  return null;
}

/** True when a rule with this text reaches the given audience. */
export function reachesAudience(text: string, audience: RuleAudience): boolean {
  const list = ruleAudiences(text);
  return list === null || list.known.includes(audience);
}

/**
 * `⊘ Skipped <file> (agents: <list>)` when the rule does not reach the
 * audience, else null. Shared by every target that copies scoped rules, next to
 * the excluded message they already print.
 */
export function audienceSkipMessage(text: string, filename: string, audience: RuleAudience): string | null {
  const list = ruleAudiences(text);
  if (list === null || list.known.includes(audience)) return null;
  const named = list.known.length > 0 ? list.known.join(', ') : 'none';
  return `⊘ Skipped ${filename} (agents: ${named})`;
}

/**
 * True when a scoped rule must not be copied for this audience: excluded by
 * `rules.exclude`, or left out by its `agents:` marker. Prints the reason.
 * Shared by every target that copies scoped rules.
 */
export function scopedRuleSkipped(
  ctx: InstallContext,
  text: string,
  filename: string,
  audience: RuleAudience,
): boolean {
  if (ctx.exclusions.isExcluded(filename)) {
    ctx.out.status('yellow', excludedMessage(filename));
    return true;
  }
  const audienceSkip = audienceSkipMessage(text, filename, audience);
  if (audienceSkip === null) return false;
  ctx.out.status('yellow', audienceSkip);
  return true;
}

export interface AudienceProblem {
  rule: string;
  /** The unknown value, or null for a valueless `agents:` key. */
  value: string | null;
  /** True when no known value remains, so the rule reaches no output. */
  reachesNothing: boolean;
}

/** Unknown values and valueless keys across the rules directory, in file order. */
export function unknownAudienceValues(rulesDir: string): AudienceProblem[] {
  const problems: AudienceProblem[] = [];
  for (const file of listMarkdownFiles(rulesDir)) {
    const list = ruleAudiences(fs.readFileSync(file, 'utf-8'));
    if (list === null) continue;
    const rule = path.basename(file);
    const reachesNothing = list.known.length === 0;
    if (list.notInline) problems.push({ rule, value: null, reachesNothing });
    for (const value of list.unknown) problems.push({ rule, value, reachesNothing });
  }
  return problems;
}

/** The stderr warning for one problem. */
export function audienceProblemMessage(problem: AudienceProblem): string {
  if (problem.value === null) {
    return `⚠️  ${problem.rule}: agents must be written inline, e.g. agents: [claude] — rule reaches no output`;
  }
  const effect = problem.reachesNothing ? 'no known value left, so the rule reaches no output' : 'ignored';
  return `⚠️  ${problem.rule}: unknown agents value '${problem.value}' (known: ${KNOWN_AUDIENCES_TEXT}) — ${effect}`;
}
