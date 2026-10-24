import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { installWorktrees } from '../../src/commands/setup-ide.js';
import { RESOLUTIONS_HEADING } from '../../src/ideInstall/resolutions.js';
import {
  FIXTURE_RESOLUTION,
  STRIP_ANSI,
  bullet,
  read,
  writeProjectRules,
} from './resolutionsFixture.js';
import { installFiles, makeProject, makeTmpDir, run, tree, writeFiles } from './harness.js';

const TARGETS = ['claude', 'agents', 'copilot', 'cursor'];

describe('rule resolutions: regression, dry run and worktrees', () => {
  let tmp: string;
  let project: string;
  let guide: string;

  beforeEach(() => {
    tmp = makeTmpDir();
    ({ project, guide } = makeProject(tmp));
    writeProjectRules(project);
  });

  afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

  // The pre-existing ideInstall snapshots pin the no-resolutions output byte for
  // byte; this adds the case where resolutions exist but none is live.
  it.each(TARGETS)('%s: output is byte-identical when no resolution is live', (target) => {
    const other = makeProject(path.join(tmp, 'other'));
    writeProjectRules(other.project);
    run(guide, project, [target]);
    const stale = { ...FIXTURE_RESOLUTION, guideRule: 'git-old.md' };
    expect(run(other.guide, other.project, [target], { ruleResolutions: [stale] }).code).toBe(0);

    const expected = installFiles(project);
    const actual = installFiles(other.project);
    expect([...actual.keys()]).toEqual([...expected.keys()]);
    for (const [rel, bytes] of expected) expect(actual.get(rel)?.equals(bytes), rel).toBe(true);
  });

  it('dry run reports the section as a change and writes nothing', () => {
    run(guide, project, ['claude']);
    const before = tree(project);
    const result = run(guide, project, ['claude', '--dry-run'], { ruleResolutions: [FIXTURE_RESOLUTION] });
    expect(result.code).toBe(0);
    expect(result.stdout.replace(STRIP_ANSI, '')).toContain('  ~ CLAUDE.md');
    expect(tree(project)).toEqual(before);
  });

  it('a worktree install renders that worktree\'s own resolutions file', async () => {
    const worktree = path.join(tmp, 'worktree');
    writeFiles(worktree, {
      'CLAUDE.md': '# Worktree rules\n',
      '.context-forge/rule-resolutions.json': JSON.stringify({
        version: 1,
        resolutions: [{ guideRule: 'always-b.md', projectSource: 'CLAUDE.md', statement: 'Worktree decision.' }],
      }),
    });
    writeFiles(project, {
      '.context-forge/rule-resolutions.json': JSON.stringify({ version: 1, resolutions: [FIXTURE_RESOLUTION] }),
    });

    const failed = await installWorktrees(
      { id: 'proj_001', name: 'p', projectPath: project, worktrees: [{ id: 'wt_1', name: 'wt', worktreePath: worktree }] },
      guide,
      'claude',
      { dryRun: false, writeLint: false, force: false },
    );
    expect(failed).toEqual([]);
    const text = read(worktree, 'CLAUDE.md');
    expect(text).toContain(bullet({ guideRule: 'always-b.md', projectSource: 'CLAUDE.md', statement: 'Worktree decision.' }));
    expect(text).not.toContain(FIXTURE_RESOLUTION.statement);
  });
});
