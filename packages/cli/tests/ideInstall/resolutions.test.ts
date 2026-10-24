import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { RuleResolution } from '@context-forge/core/node';
import type { GuideRuleEntry } from '../../src/ideInstall/guideRules.js';
import { Printer } from '../../src/ideInstall/output.js';
import {
  classifyResolutions,
  renderResolutions,
  warnStaleResolutions,
} from '../../src/ideInstall/resolutions.js';
import { makeTmpDir, writeFiles } from './harness.js';

const entry = (rule: string, excluded = false): GuideRuleEntry => ({
  rule,
  path: `guide/rules/${rule}`,
  kind: excluded ? 'scoped' : 'alwaysApply',
  excluded,
});
const resolution = (guideRule: string, projectSource: string, statement = 'Project wins.'): RuleResolution => ({
  guideRule,
  projectSource,
  statement,
});

const GIT_VS_CLAUDE = resolution('git.md', 'CLAUDE.md', 'Slice work merges only through a reviewed PR; never merge locally.');
const PYTHON_VS_CURSOR = resolution(
  'python.md',
  '.cursor/rules/team-style.mdc',
  'Use ruff for formatting; the black instruction in team-style.mdc is superseded.',
);

describe('renderResolutions', () => {
  it('renders nothing for an empty list', () => {
    expect(renderResolutions([])).toBe('');
  });

  it("matches the design's example for two records", () => {
    expect(renderResolutions([GIT_VS_CLAUDE, PYTHON_VS_CURSOR])).toBe(
      [
        '## Project Rule Resolutions',
        "Where a rule above conflicts with the project's own rules, the resolution below applies.",
        '',
        '- `git.md` vs `CLAUDE.md`: Slice work merges only through a reviewed PR; never merge locally.',
        '- `python.md` vs `.cursor/rules/team-style.mdc`: Use ruff for formatting; the black instruction in team-style.mdc is superseded.',
        '',
      ].join('\n'),
    );
  });

  it('keeps file order and renders a duplicate pair as two bullets', () => {
    const out = renderResolutions([resolution('b.md', 'X.md', 'one'), resolution('a.md', 'X.md', 'two'), resolution('b.md', 'X.md', 'three')]);
    const bullets = out.split('\n').filter((l) => l.startsWith('- '));
    expect(bullets).toEqual(['- `b.md` vs `X.md`: one', '- `a.md` vs `X.md`: two', '- `b.md` vs `X.md`: three']);
  });
});

describe('classifyResolutions and warnStaleResolutions', () => {
  let root: string;
  let stderr: string;
  let out: Printer;

  beforeEach(() => {
    root = makeTmpDir();
    writeFiles(root, { 'CLAUDE.md': 'x', '.cursor/rules/team-style.mdc': 'x' });
    stderr = '';
    out = new Printer({ stdout: () => undefined, stderr: (t) => (stderr += t) });
  });

  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  const plain = (): string => stderr.replace(/\x1b\[[0-9;]*m/g, '');

  it('puts resolutions whose identities exist in live', () => {
    const c = classifyResolutions([GIT_VS_CLAUDE], [entry('git.md')], root);
    expect(c).toEqual({ live: [GIT_VS_CLAUDE], staleGuide: [], staleProject: [] });
  });

  it('classifies a missing guide rule as stale and warns with the exact message', () => {
    const c = classifyResolutions([resolution('git-old.md', 'CLAUDE.md')], [entry('git.md')], root);
    expect(c.staleGuide).toHaveLength(1);
    expect(c.live).toEqual([]);
    warnStaleResolutions(c, out);
    expect(plain()).toBe(
      '⚠️  resolution git-old.md vs CLAUDE.md names a guide rule the guide no longer has; re-run reconciliation or edit .context-forge/rule-resolutions.json\n',
    );
  });

  it('classifies a missing project file as stale and warns with the exact message', () => {
    const c = classifyResolutions([resolution('git.md', 'team-rules.md')], [entry('git.md')], root);
    expect(c.staleProject).toHaveLength(1);
    expect(c.live).toEqual([]);
    warnStaleResolutions(c, out);
    expect(plain()).toBe(
      '⚠️  resolution git.md vs team-rules.md names a project file that no longer exists; re-run reconciliation or edit .context-forge/rule-resolutions.json\n',
    );
  });

  it('drops a resolution on an excluded scoped rule silently', () => {
    const c = classifyResolutions([resolution('python.md', 'CLAUDE.md')], [entry('python.md', true)], root);
    expect(c).toEqual({ live: [], staleGuide: [], staleProject: [] });
    warnStaleResolutions(c, out);
    expect(stderr).toBe('');
  });

  it('resolves projectSource against the root argument', () => {
    const other = makeTmpDir();
    try {
      writeFiles(other, { 'team-rules.md': 'x' });
      const r = resolution('git.md', 'team-rules.md');
      expect(classifyResolutions([r], [entry('git.md')], other).live).toEqual([r]);
      expect(classifyResolutions([r], [entry('git.md')], root).staleProject).toEqual([r]);
    } finally {
      fs.rmSync(other, { recursive: true, force: true });
    }
  });

  it('checks a nested project source path under the root', () => {
    const r = resolution('git.md', path.posix.join('.cursor', 'rules', 'team-style.mdc'));
    expect(classifyResolutions([r], [entry('git.md')], root).live).toEqual([r]);
  });
});
