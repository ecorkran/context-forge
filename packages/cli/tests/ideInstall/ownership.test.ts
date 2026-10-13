/**
 * Ownership: the manifest decides which files setup-ide may overwrite or delete.
 * These protect users' files. A regression here clobbers or deletes project files.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  assertSnapshot,
  FIXTURE_DATA,
  installFiles,
  makeProject,
  makeTmpDir,
  run,
  snapshot,
  writeFiles,
  type RunResult,
} from './harness.js';

const ANALYZE_SKILL = path.join(FIXTURE_DATA, 'analyze-SKILL.md');
const MANIFEST = '.context-forge/claude.manifest';
const SCOPED_A = '.claude/rules/scoped-a.md';
const SCOPED_B = '.claude/rules/scoped-b.md';
const LEGACY_SKILL = '.claude/skills/analyze/SKILL.md';

let tmp: string;
beforeEach(() => {
  tmp = makeTmpDir();
});
afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

/** A project with claude installed once. */
function installed(): { project: string; guide: string; first: RunResult } {
  const { project, guide } = makeProject(tmp);
  return { project, guide, first: run(guide, project, ['claude']) };
}

const guideRule = (guide: string, name: string): string => path.join(guide, 'project-guides', 'rules', name);
const read = (project: string, rel: string): string => fs.readFileSync(path.join(project, rel), 'utf-8');
const exists = (project: string, rel: string): boolean => fs.existsSync(path.join(project, rel));

describe('ownership', () => {
  it('test_ownership_run_twice_identical', async () => {
    const { project, guide, first } = installed();
    const afterFirst = installFiles(project);
    const second = run(guide, project, ['claude']);
    expect(installFiles(project)).toEqual(afterFirst);
    await assertSnapshot('test_ownership_run_twice', snapshot(project, [first, second]));
  });

  it('test_ownership_no_manifest_differing_file_skipped', async () => {
    const { project, guide } = makeProject(tmp);
    writeFiles(project, { [SCOPED_A]: 'my customized copy\n' });
    const result = run(guide, project, ['claude']);
    expect(read(project, SCOPED_A)).toBe('my customized copy\n');
    await assertSnapshot('test_ownership_no_manifest_differing', snapshot(project, [result]));
  });

  it('test_ownership_no_manifest_identical_file_adopted', async () => {
    const { project, guide, first } = installed();
    fs.rmSync(path.join(project, MANIFEST));
    const second = run(guide, project, ['claude']);
    expect(read(project, MANIFEST)).toContain(SCOPED_A);
    await assertSnapshot('test_ownership_no_manifest_identical', snapshot(project, [first, second]));
  });

  it('test_ownership_unlisted_differing_file_skipped', async () => {
    const { project, guide, first } = installed();
    // A rule the guide gains after the install, with a same-named project file.
    fs.copyFileSync(guideRule(guide, 'scoped-a.md'), guideRule(guide, 'scoped-c.md'));
    writeFiles(project, { '.claude/rules/scoped-c.md': "project's own scoped-c\n" });
    const second = run(guide, project, ['claude']);
    expect(read(project, '.claude/rules/scoped-c.md')).toBe("project's own scoped-c\n");
    expect(read(project, MANIFEST)).not.toContain('.claude/rules/scoped-c.md');
    await assertSnapshot('test_ownership_unlisted_differing', snapshot(project, [first, second]));
  });

  it('test_ownership_edited_file_kept', async () => {
    const { project, guide, first } = installed();
    const manifestBefore = read(project, MANIFEST);
    writeFiles(project, { [SCOPED_A]: 'edited after install\n' });
    const second = run(guide, project, ['claude']);
    expect(read(project, SCOPED_A)).toBe('edited after install\n');
    // The original manifest line is carried over, so the path stays guide-owned.
    expect(read(project, MANIFEST)).toBe(manifestBefore);
    await assertSnapshot('test_ownership_edited_kept', snapshot(project, [first, second]));
  });

  it('test_ownership_dropped_rule_removed', async () => {
    const { project, guide, first } = installed();
    fs.rmSync(guideRule(guide, 'scoped-b.md'));
    const second = run(guide, project, ['claude']);
    expect(exists(project, SCOPED_B)).toBe(false);
    await assertSnapshot('test_ownership_dropped_removed', snapshot(project, [first, second]));
  });

  it('test_ownership_dropped_skill_removes_empty_folder', async () => {
    const { project, guide, first } = installed();
    fs.rmSync(path.join(guide, 'project-guides', 'skills', 'skill-a'), { recursive: true });
    const second = run(guide, project, ['claude']);
    expect(exists(project, '.claude/skills/skill-a')).toBe(false);
    expect(fs.statSync(path.join(project, '.claude/skills')).isDirectory()).toBe(true);
    await assertSnapshot('test_ownership_dropped_skill_folder', snapshot(project, [first, second]));
  });

  it('test_ownership_dropped_rule_edited_kept', async () => {
    const { project, guide, first } = installed();
    writeFiles(project, { [SCOPED_B]: 'edited before the guide dropped it\n' });
    fs.rmSync(guideRule(guide, 'scoped-b.md'));
    const second = run(guide, project, ['claude']);
    expect(read(project, SCOPED_B)).toBe('edited before the guide dropped it\n');
    await assertSnapshot('test_ownership_dropped_edited_kept', snapshot(project, [first, second]));
  });

  it('test_ownership_legacy_analyze_skill_removed', async () => {
    const { project, guide } = makeProject(tmp);
    writeFiles(project, { [LEGACY_SKILL]: fs.readFileSync(ANALYZE_SKILL) });
    const result = run(guide, project, ['claude']);
    expect(exists(project, LEGACY_SKILL)).toBe(false);
    await assertSnapshot('test_ownership_legacy_removed', snapshot(project, [result]));
  });

  it('test_ownership_legacy_analyze_skill_edited_kept', async () => {
    const { project, guide } = makeProject(tmp);
    writeFiles(project, {
      [LEGACY_SKILL]: Buffer.concat([fs.readFileSync(ANALYZE_SKILL), Buffer.from('my addition\n')]),
    });
    const result = run(guide, project, ['claude']);
    expect(read(project, LEGACY_SKILL).endsWith('my addition\n')).toBe(true);
    await assertSnapshot('test_ownership_legacy_kept', snapshot(project, [result]));
  });
});
