/**
 * Flag behavior: dry run, and installing into a root outside the guide. The
 * guide's --capabilities, --root parsing and flag-order tests covered the bash
 * argument parser, which cf replaces with commander and normalizeTarget.
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DRY_RUN_SANDBOX_PREFIX } from '../../src/ideInstall/dryRun.js';
import { assertSnapshot, makeGuide, makeProject, makeTmpDir, run, snapshot, tree, writeFiles } from './harness.js';

let tmp: string;
beforeEach(() => {
  tmp = makeTmpDir();
});
afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

/** Everything in the project except the guide folder. */
function projectTree(project: string): Map<string, Buffer> {
  return new Map([...tree(project)].filter(([rel]) => !rel.startsWith('project-documents/')));
}

function sandboxes(): string[] {
  return fs.readdirSync(os.tmpdir()).filter((name) => name.startsWith(DRY_RUN_SANDBOX_PREFIX));
}

describe('flags', () => {
  it('test_flags_dry_run_fresh', async () => {
    const { project, guide } = makeProject(tmp);
    const before = projectTree(project);
    const result = run(guide, project, ['claude', '--dry-run']);
    expect(projectTree(project)).toEqual(before);
    await assertSnapshot('test_flags_dry_run_fresh', snapshot(project, [result]));
  });

  it('test_flags_dry_run_no_changes', async () => {
    const { project, guide } = makeProject(tmp);
    const install = run(guide, project, ['claude']);
    const before = projectTree(project);
    const result = run(guide, project, ['claude', '--dry-run']);
    expect(projectTree(project)).toEqual(before);
    await assertSnapshot('test_flags_dry_run_no_changes', snapshot(project, [install, result]));
  });

  it('test_flags_dry_run_guide_changed', async () => {
    const { project, guide } = makeProject(tmp);
    const install = run(guide, project, ['claude']);
    const rules = path.join(guide, 'project-guides', 'rules');
    writeFiles(rules, {
      'scoped-c.md': '---\ndescription: New scoped rule C.\npaths:\n  - "**/*.cc"\n---\n\n### Scoped C\n',
      'scoped-a.md': '---\ndescription: Edited scoped rule A.\npaths:\n  - "**/*.aa"\n---\n\n### Scoped A edited\n',
    });
    fs.rmSync(path.join(rules, 'scoped-b.md'));
    const before = projectTree(project);
    const result = run(guide, project, ['claude', '--dry-run']);
    expect(projectTree(project)).toEqual(before);
    await assertSnapshot('test_flags_dry_run_guide_changed', snapshot(project, [install, result]));
  });

  it('test_flags_root_outside_guide', async () => {
    const guide = makeGuide(path.join(tmp, 'guide'));
    const target = path.join(tmp, 'target');
    fs.mkdirSync(target);
    const result = run(guide, target, ['claude', '--root', target]);
    await assertSnapshot('test_flags_root_separate', snapshot(target, [result]));
  });

  it('removes the dry-run sandbox when the install aborts', () => {
    const { project, guide } = makeProject(tmp);
    fs.rmSync(path.join(guide, 'project-guides', 'rules'), { recursive: true });
    const before = sandboxes();
    const result = run(guide, project, ['claude', '--dry-run']);
    expect(result.code).toBe(1);
    expect(sandboxes()).toEqual(before);
  });
});
