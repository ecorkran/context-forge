import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { RuleExclusions } from '../../src/ideInstall/exclusions.js';
import { delivered, guideRuleEntries } from '../../src/ideInstall/guideRules.js';
import { Printer } from '../../src/ideInstall/output.js';
import { makeProject, makeTmpDir } from './harness.js';

describe('guideRuleEntries', () => {
  let tmp: string;
  let project: string;
  let guide: string;

  beforeEach(() => {
    tmp = makeTmpDir();
    ({ project, guide } = makeProject(tmp));
  });

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  const entries = (patterns: string[] = []) => guideRuleEntries(guide, project, new RuleExclusions(patterns));
  const byRule = (list: ReturnType<typeof entries>, rule: string) => list.find((e) => e.rule === rule);

  it('lists every rule with its kind and a checkout-relative path', () => {
    const list = entries();
    expect(list.map((e) => e.rule)).toEqual(['always-a.md', 'always-b.md', 'broken.md', 'scoped-a.md', 'scoped-b.md']);
    expect(byRule(list, 'always-a.md')).toEqual({
      rule: 'always-a.md',
      path: 'project-documents/ai-project-guide/project-guides/rules/always-a.md',
      kind: 'alwaysApply',
      excluded: false,
    });
    expect(byRule(list, 'scoped-a.md')?.kind).toBe('scoped');
    expect(list.every(delivered)).toBe(true);
  });

  it('marks a scoped rule excluded when a pattern matches its basename', () => {
    const list = entries(['scoped-a*']);
    expect(byRule(list, 'scoped-a.md')?.excluded).toBe(true);
    expect(delivered(byRule(list, 'scoped-a.md')!)).toBe(false);
    expect(delivered(byRule(list, 'scoped-b.md')!)).toBe(true);
  });

  it('keeps an alwaysApply rule delivered and records no match, so the ignored-pattern warning still prints', () => {
    const exclusions = new RuleExclusions(['always-a.md']);
    const list = guideRuleEntries(guide, project, exclusions);
    expect(byRule(list, 'always-a.md')?.excluded).toBe(false);

    const stderr: string[] = [];
    const out = new Printer({ stdout: () => undefined, stderr: (text) => stderr.push(text) });
    exclusions.warnUnmatched(path.join(guide, 'project-guides', 'rules'), out);
    expect(stderr.join('')).toContain("names an always-on rule and was ignored");
  });

  it('throws naming the path when the rules directory is missing', () => {
    fs.rmSync(path.join(guide, 'project-guides', 'rules'), { recursive: true });
    expect(() => entries()).toThrow(/Guide rules directory not found: .*rules/);
  });
});
