/**
 * rules.exclude: what the exclusion list removes and warns about. cf reads the
 * value from config and passes it in (the cf-level test is in setup-ide.test.ts),
 * so the guide's env-var and cf-stub source tiers are not ported.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { assertSnapshot, makeProject, makeTmpDir, run, snapshot, writeFiles } from './harness.js';

const SCOPED_A = '.claude/rules/scoped-a.md';
const SCOPED_B = '.claude/rules/scoped-b.md';

let tmp: string;
beforeEach(() => {
  tmp = makeTmpDir();
});
afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

const exists = (project: string, rel: string): boolean => fs.existsSync(path.join(project, rel));

describe('rules.exclude', () => {
  it('test_rules_exclude_cf_value', async () => {
    const { project, guide } = makeProject(tmp);
    const result = run(guide, project, ['claude'], { rulesExclude: ['scoped-b.md'] });
    expect(exists(project, SCOPED_A)).toBe(true);
    expect(exists(project, SCOPED_B)).toBe(false);
    await assertSnapshot('test_rules_exclude_cf_value', snapshot(project, [result]));
  });

  it.each([
    ['unmatched', 'nomatch*.md'],
    ['always_on', 'always-a.md'],
  ])('test_rules_exclude_pattern_warnings[%s]', async (caseId, pattern) => {
    const { project, guide } = makeProject(tmp);
    const result = run(guide, project, ['claude'], { rulesExclude: [pattern] });
    await assertSnapshot(`test_rules_exclude_${caseId}`, snapshot(project, [result]));
  });

  it('test_rules_exclude_prunes_installed_rule', async () => {
    const { project, guide } = makeProject(tmp);
    const first = run(guide, project, ['claude']);
    expect(exists(project, SCOPED_B)).toBe(true);
    const second = run(guide, project, ['claude'], { rulesExclude: ['scoped-b.md'] });
    expect(exists(project, SCOPED_B)).toBe(false);
    await assertSnapshot('test_rules_exclude_prunes', snapshot(project, [first, second]));
  });

  it('test_lint_excluded_language_not_checked', async () => {
    const { project, guide } = makeProject(tmp);
    // The fixture guide has no python.md, so add one for the exclusion to name.
    writeFiles(path.join(guide, 'project-guides', 'rules'), {
      'python.md': '---\ndescription: Fixture Python rule.\npaths:\n  - "**/*.py"\n---\n\n### Python\n',
    });
    writeFiles(project, { 'pyproject.toml': '[project]\nname = "demo"\n' });
    const result = run(guide, project, ['agents', '--write-lint'], { rulesExclude: ['python.md'] });
    expect(result.stdout).not.toContain('Lint (python)');
    expect(exists(project, 'ruff.toml')).toBe(false);
    await assertSnapshot('test_lint_python_excluded', snapshot(project, [result]));
  });
});
