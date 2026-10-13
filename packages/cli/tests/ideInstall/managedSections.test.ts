/**
 * Managed sections: how setup-ide merges its block into CLAUDE.md / AGENTS.md.
 * Bytes outside the managed block belong to the project and must pass through
 * untouched. Marker text is repeated here on purpose: the markers are a
 * contract with files already in users' projects.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { assertSnapshot, makeProject, makeTmpDir, run, snapshot, writeFiles } from './harness.js';

const BEGIN = '<!-- BEGIN:context-forge -->';
const END = '<!-- END:context-forge -->';
const LEGACY = '[//]: # (context-forge:managed)';
const LEGACY_END = '[//]: # (context-forge:managed end)';

/** [target, file, the H1 the generated block starts with]; extended as each target lands. */
const TARGETS: [string, string, string][] = [
  ['claude', 'CLAUDE.md', '# Project Guidelines for Claude'],
  ['agents', 'AGENTS.md', '# Project Guidelines'],
];

const BROKEN: [string, string][] = [
  ['two_begin', `top\n${BEGIN}\none\n${BEGIN}\ntwo\n${END}\n`],
  ['end_before_begin', `top\n${END}\nmiddle\n${BEGIN}\nbottom\n`],
];

let tmp: string;
beforeEach(() => {
  tmp = makeTmpDir();
});
afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

const name = (base: string, target: string): string => `test_managed_${base}_${target}`;
const ORIGINAL = Buffer.from('# My Notes\n\nhand-written guidance\n');

describe.each(TARGETS)('managed sections [%s]', (target, filename, h1) => {
  const file = (project: string): string => path.join(project, filename);
  const backup = (project: string): string => file(project) + '.pre-context-forge';

  it('test_managed_file_absent', async () => {
    const { project, guide } = makeProject(tmp);
    const result = run(guide, project, [target]);
    expect(fs.readFileSync(file(project), 'utf-8').startsWith(`${BEGIN}\n${h1}\n`)).toBe(true);
    await assertSnapshot(name('absent', target), snapshot(project, [result]));
  });

  it('test_managed_no_markers_backed_up', async () => {
    const { project, guide } = makeProject(tmp);
    writeFiles(project, { [filename]: ORIGINAL });
    const result = run(guide, project, [target]);
    expect(fs.readFileSync(backup(project)).equals(ORIGINAL)).toBe(true);
    expect(fs.readFileSync(file(project)).subarray(0, ORIGINAL.length).equals(ORIGINAL)).toBe(true);
    await assertSnapshot(name('no_markers', target), snapshot(project, [result]));
  });

  it('test_managed_backup_not_overwritten', async () => {
    const { project, guide } = makeProject(tmp);
    writeFiles(project, { [filename]: ORIGINAL });
    const first = run(guide, project, [target]);
    const second = run(guide, project, [target]);
    expect(fs.readFileSync(backup(project)).equals(ORIGINAL)).toBe(true);
    await assertSnapshot(name('backup_kept', target), snapshot(project, [first, second]));
  });

  it('test_managed_block_replaced_outside_bytes_untouched', async () => {
    const { project, guide } = makeProject(tmp);
    const above = 'above one\r\nabove two\r\n';
    const below = 'below one\r\nlast line, no final newline';
    writeFiles(project, { [filename]: `${above}${BEGIN}\nstale generated content\n${END}\n${below}` });
    const result = run(guide, project, [target]);
    const data = fs.readFileSync(file(project), 'utf-8');
    expect(data.startsWith(`${above}${BEGIN}\n${h1}`)).toBe(true);
    // Recorded quirk (#38): awk adds a final newline the file did not have.
    expect(data.endsWith(`${END}\n${below}\n`)).toBe(true);
    expect(data).not.toContain('stale generated content');
    expect(fs.existsSync(backup(project))).toBe(false);
    await assertSnapshot(name('block_replaced', target), snapshot(project, [result]));
  });

  it('test_managed_legacy_marker_migrated', async () => {
    const { project, guide } = makeProject(tmp);
    writeFiles(project, { [filename]: `${h1}\n\nproject intro\n\n${LEGACY}\nold generated content\n` });
    const result = run(guide, project, [target]);
    const text = fs.readFileSync(file(project), 'utf-8');
    expect(text.split(`${h1}\n`).length - 1).toBe(1);
    expect(text).toContain('project intro');
    expect(text).not.toContain('old generated content');
    expect(text).not.toContain(LEGACY);
    await assertSnapshot(name('legacy', target), snapshot(project, [result]));
  });

  it('test_managed_legacy_end_marker_keeps_tail', async () => {
    const { project, guide } = makeProject(tmp);
    writeFiles(project, {
      [filename]: `${h1}\n\nproject intro\n\n${LEGACY}\nold generated content\n${LEGACY_END}\nproject tail after the end marker\n`,
    });
    const result = run(guide, project, [target]);
    const text = fs.readFileSync(file(project), 'utf-8');
    expect(text.endsWith(`${END}\nproject tail after the end marker\n`)).toBe(true);
    expect(text).not.toContain('old generated content');
    await assertSnapshot(name('legacy_end', target), snapshot(project, [result]));
  });

  it.each(BROKEN)('test_managed_broken_markers_unchanged[%s]', async (caseId, broken) => {
    const { project, guide } = makeProject(tmp);
    writeFiles(project, { [filename]: broken });
    const result = run(guide, project, [target]);
    expect(fs.readFileSync(file(project), 'utf-8')).toBe(broken);
    await assertSnapshot(`test_managed_broken_${caseId}-${target}`, snapshot(project, [result]));
  });
});
