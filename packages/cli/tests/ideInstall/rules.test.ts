import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PERMISSIVENESS_FRAGMENT_DIR } from '@context-forge/core/node';
import { caseGlobToRegExp, RuleExclusions } from '../../src/ideInstall/exclusions.js';
import { listMarkdownFiles } from '../../src/ideInstall/fsChecks.js';
import { Printer } from '../../src/ideInstall/output.js';
import {
  alwaysOnFallbackTitle,
  claudeFallbackTitle,
  compileAlwaysOnRules,
  compileClaudeRules,
  ruleBody,
  sectionTitle,
} from '../../src/ideInstall/rules.js';
import { RULE_AUDIENCE } from '../../src/ideInstall/ruleAudience.js';
import { makeTmpDir, writeFiles } from './harness.js';

const ALWAYS = (body: string): string => `---\ndescription: d\nalwaysApply: true\n---\n${body}`;
const SCOPED = '---\ndescription: d\npaths:\n  - "**/*.x"\n---\n### Scoped\n';
// Real guide fragments, copied byte for byte into core's test fixtures.
const PERMISSIVENESS_FIXTURES = path.resolve(import.meta.dirname, '../../../core/tests/fixtures/permissiveness');

let tmp: string;
let stdout: string;
let stderr: string;
let printer: Printer;

beforeEach(() => {
  tmp = makeTmpDir();
  stdout = '';
  stderr = '';
  printer = new Printer({ stdout: (t) => (stdout += t), stderr: (t) => (stderr += t) });
});
afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

describe('caseGlobToRegExp', () => {
  const matches = (pattern: string, name: string): boolean => caseGlobToRegExp(pattern).test(name);

  it('handles * and ?', () => {
    expect(matches('swift*.md', 'swift-ui.md')).toBe(true);
    expect(matches('swift*.md', 'xswift.md')).toBe(false);
    expect(matches('dar?.md', 'dart.md')).toBe(true);
    expect(matches('dar?.md', 'da.md')).toBe(false);
  });

  it('handles bracket classes, negation and ranges', () => {
    expect(matches('[dp]*.md', 'python.md')).toBe(true);
    expect(matches('[!dp]*.md', 'python.md')).toBe(false);
    expect(matches('[a-c].md', 'b.md')).toBe(true);
    expect(matches('[]x].md', '].md')).toBe(true);
  });

  it('treats regex metacharacters and an unclosed bracket as literals', () => {
    expect(matches('a+b(1).md', 'a+b(1).md')).toBe(true);
    expect(matches('a.md', 'aXmd')).toBe(false);
    expect(matches('[oops.md', '[oops.md')).toBe(true);
    expect(matches('\\*.md', '*.md')).toBe(true);
    expect(matches('\\*.md', 'x.md')).toBe(false);
  });
});

describe('listMarkdownFiles', () => {
  it('lists .md files in byte order, skipping dotfiles and directories', () => {
    writeFiles(tmp, { 'b.md': '', 'C.md': '', 'a-b.md': '', '.hidden.md': '', 'x.txt': '', 'dir.md/f': '' });
    expect(listMarkdownFiles(tmp).map((f) => path.basename(f))).toEqual(['C.md', 'a-b.md', 'b.md']);
  });

  it('is empty for a missing directory', () => {
    expect(listMarkdownFiles(path.join(tmp, 'nope'))).toEqual([]);
  });
});

describe('sectionTitle', () => {
  it('takes the first heading after the frontmatter, outside code fences', () => {
    expect(sectionTitle(ALWAYS('```\n# not this\n```\n## Real Title\n### later\n'))).toBe('Real Title');
  });

  it('ignores headings inside the frontmatter and returns empty when none', () => {
    expect(sectionTitle('---\n# in fm\n---\nbody\n')).toBe('');
    expect(sectionTitle('# no frontmatter\n')).toBe('');
  });
});

describe('ruleBody', () => {
  const source = ALWAYS('# Title\n\n## Sub\n---\n```\n## in code\n---\n```\ntext');

  it('claude keeps --- after the frontmatter and promotes subheadings outside code', () => {
    expect(ruleBody(source, 'keep-after-frontmatter')).toBe('\n# Sub\n---\n```\n## in code\n---\n```\ntext\n');
  });

  it('always-on drops every --- line, inside code fences too', () => {
    expect(ruleBody(source, 'drop-all')).toBe('\n# Sub\n```\n## in code\n```\ntext\n');
  });

  it('prints code lines before the frontmatter, but not the closing fence', () => {
    expect(ruleBody('```\ncode\n```\n---\nx: 1\n---\n# T\nbody\n', 'drop-all')).toBe('```\ncode\nbody\n');
  });
});

describe('fallback titles', () => {
  it('claude capitalizes words and adds Rules; always-on only swaps dashes', () => {
    expect(claudeFallbackTitle('/r/my-rule.md')).toBe('My Rule Rules');
    expect(alwaysOnFallbackTitle('/r/my-rule.md')).toBe('my rule');
  });
});

describe('compileAlwaysOnRules', () => {
  it('compiles always-on rules in byte order inside the block, with trailing content', () => {
    const rules = path.join(tmp, 'rules');
    writeFiles(rules, { 'b.md': ALWAYS('# B\nbee\n'), 'a.md': ALWAYS('no heading\n'), 's.md': SCOPED });
    const outFile = path.join(tmp, 'out', 'AGENTS.md');
    const ok = compileAlwaysOnRules({ rulesDir: rules, outFile, label: 'AGENTS.md', h1: 'H', trailing: 'TAIL\n', audience: RULE_AUDIENCE.Agents, out: printer });
    expect(ok).toBe(true);
    expect(fs.readFileSync(outFile, 'utf-8')).toBe(
      '<!-- BEGIN:context-forge -->\n# H\n\n## a\n\n## B\nbee\n\nTAIL\n<!-- END:context-forge -->\n',
    );
    expect(stdout).toContain('📋 Compiled 2 alwaysApply rules → AGENTS.md');
  });

  it('ignores guide permissiveness fragments in the rules subdirectory (slice 246, D2)', () => {
    // cf build, not setup-ide, delivers these; a setup-ide that installed them would defeat the setting.
    const fragment = fs.readFileSync(path.join(PERMISSIVENESS_FIXTURES, 'autonomous.md'), 'utf-8');
    const rules = path.join(tmp, 'rules');
    writeFiles(rules, {
      'general.md': ALWAYS('# General\nbody\n'),
      // The rules dir here is the guide's `rules/`, so only the last path segment applies.
      [`${path.basename(PERMISSIVENESS_FRAGMENT_DIR)}/autonomous.md`]: fragment,
    });
    expect(fragment).toContain('### Permissiveness: autonomous');

    expect(listMarkdownFiles(rules).map((f) => path.basename(f))).toEqual(['general.md']);

    const outFile = path.join(tmp, 'out', 'AGENTS.md');
    compileAlwaysOnRules({ rulesDir: rules, outFile, label: 'AGENTS.md', h1: 'H', trailing: '', audience: RULE_AUDIENCE.Agents, out: printer });
    expect(fs.readFileSync(outFile, 'utf-8')).not.toContain('Permissiveness: autonomous');
  });
});

describe('RuleExclusions', () => {
  it('records matches and warns on stderr about unmatched and always-on patterns', () => {
    const rules = path.join(tmp, 'rules');
    writeFiles(rules, { 'always-a.md': ALWAYS('# A\n'), 'dart.md': SCOPED });
    const exclusions = new RuleExclusions(['dart.md', 'nomatch*.md', 'always-a.md']);
    expect(exclusions.isExcluded('dart.md')).toBe(true);
    expect(exclusions.isExcluded('python.md')).toBe(false);

    exclusions.warnUnmatched(rules, printer);
    expect(stdout).toBe('');
    expect(stderr).toBe(
      '\x1b[0;34mℹ️  Rule exclusions active from cf config rules.exclude: dart.md,nomatch*.md,always-a.md\x1b[0m\n' +
        "\x1b[1;33m⚠️  warning: rules.exclude pattern 'nomatch*.md' matched no rule files\x1b[0m\n" +
        "\x1b[1;33m⚠️  warning: rules.exclude pattern 'always-a.md' names an always-on rule and was ignored\x1b[0m\n" +
        '\x1b[1;33m   Always-on rules are compiled into the managed block, not installed as files.\x1b[0m\n',
    );
  });

  it('says nothing when there are no patterns', () => {
    new RuleExclusions([]).warnUnmatched(tmp, printer);
    expect(stderr).toBe('');
  });
});

describe('compileClaudeRules trailing', () => {
  const compile = (trailing: string): string => {
    writeFiles(tmp, { 'rules/a.md': ALWAYS('## A\nbody a\n'), 'rules/b.md': ALWAYS('## B\nbody b\n') });
    const target = path.join(tmp, 'CLAUDE.md');
    expect(compileClaudeRules(path.join(tmp, 'rules'), target, trailing, printer)).toBe(true);
    return fs.readFileSync(target, 'utf-8');
  };

  it('empty trailing adds nothing after the last rule (existing snapshots cover the full output)', () => {
    expect(compile('').endsWith('body b\n\n<!-- END:context-forge -->\n')).toBe(true);
  });

  it('non-empty trailing lands inside the BEGIN/END pair, after the last rule', () => {
    const text = compile('## Extra\nline\n');
    const lines = text.split('\n');
    const begin = lines.indexOf('<!-- BEGIN:context-forge -->');
    const end = lines.indexOf('<!-- END:context-forge -->');
    const extra = lines.indexOf('## Extra');
    expect(begin).toBeGreaterThanOrEqual(0);
    expect(extra).toBeGreaterThan(lines.lastIndexOf('body b'));
    expect(extra).toBeLessThan(end);
    expect(lines.slice(begin, end).join('\n')).toContain('line');
  });
});
