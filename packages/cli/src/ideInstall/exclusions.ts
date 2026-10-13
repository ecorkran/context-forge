/**
 * `rules.exclude`: scoped rule files to leave uninstalled, matched against the
 * basename with bash `case` glob rules. alwaysApply rules are deliberately not
 * excludable: they are compiled into the managed block, so excluding one would
 * silently drop general.md or git.md.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { listMarkdownFiles } from './fsChecks.js';
import { hasAlwaysApply } from './frontmatter.js';
import type { Printer } from './output.js';

/** Named in the active-exclusions notice. The only source since the env tier was dropped. */
const EXCLUDE_SOURCE = 'cf config rules.exclude';

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Index of the `]` closing a bracket expression opened at `open`, or -1. */
function bracketEnd(pattern: string, open: number): number {
  let i = open + 1;
  if (pattern[i] === '!' || pattern[i] === '^') i++;
  if (pattern[i] === ']') i++; // a leading ] is literal
  return pattern.indexOf(']', i);
}

function bracketClass(body: string): string {
  const negated = body.startsWith('!') || body.startsWith('^');
  const members = (negated ? body.slice(1) : body).replace(/[\\\]^[]/g, '\\$&');
  return `[${negated ? '^' : ''}${members}]`;
}

/**
 * A bash `case` pattern as an anchored RegExp: `*`, `?` and `[...]` are
 * special, `\` escapes the next character, everything else is literal.
 * POSIX classes such as `[[:alpha:]]` are not supported.
 */
export function caseGlobToRegExp(pattern: string): RegExp {
  let source = '';
  for (let i = 0; i < pattern.length; i++) {
    const char = pattern[i];
    if (char === '*') {
      source += '.*';
    } else if (char === '?') {
      source += '.';
    } else if (char === '\\' && i + 1 < pattern.length) {
      source += escapeRegExp(pattern[++i]);
    } else if (char === '[' && bracketEnd(pattern, i) !== -1) {
      const close = bracketEnd(pattern, i);
      source += bracketClass(pattern.slice(i + 1, close));
      i = close;
    } else {
      source += escapeRegExp(char);
    }
  }
  return new RegExp(`^${source}$`, 'su');
}

/** The exclusion patterns of one install run, and which of them matched a file. */
export class RuleExclusions {
  private readonly matched = new Set<string>();
  private readonly matchers: { pattern: string; regex: RegExp }[];

  constructor(private readonly patterns: readonly string[]) {
    this.matchers = patterns.map((pattern) => ({ pattern, regex: caseGlobToRegExp(pattern) }));
  }

  /** `rule_is_excluded`: true when a scoped rule file should be skipped. Records the match. */
  isExcluded(filename: string): boolean {
    const hit = this.matchers.find(({ regex }) => regex.test(filename));
    if (hit === undefined) return false;
    this.matched.add(hit.pattern);
    return true;
  }

  /**
   * `warn_unmatched_exclusions`, on stderr: name the source, then warn about
   * each pattern that skipped nothing, almost always a typo. A pattern naming
   * an alwaysApply rule gets its own message instead of "matched nothing".
   */
  warnUnmatched(rulesDir: string, out: Printer): void {
    if (this.patterns.length === 0) return;
    out.statusErr('blue', `ℹ️  Rule exclusions active from ${EXCLUDE_SOURCE}: ${this.patterns.join(',')}`);

    for (const { pattern, regex } of this.matchers) {
      if (this.matched.has(pattern)) continue;
      if (alwaysApplyRuleMatches(rulesDir, regex)) {
        out.statusErr('yellow', `⚠️  warning: rules.exclude pattern '${pattern}' names an always-on rule and was ignored`);
        out.statusErr('yellow', '   Always-on rules are compiled into the managed block, not installed as files.');
      } else {
        out.statusErr('yellow', `⚠️  warning: rules.exclude pattern '${pattern}' matched no rule files`);
      }
    }
  }
}

function alwaysApplyRuleMatches(rulesDir: string, regex: RegExp): boolean {
  return listMarkdownFiles(rulesDir).some(
    (file) => hasAlwaysApply(fs.readFileSync(file, 'utf-8')) && regex.test(path.basename(file)),
  );
}
