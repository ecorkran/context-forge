/**
 * Target behavior: what each setup-ide target installs. The guide's
 * no-target, unknown-target and run-from-subdirectory runs tested the bash
 * argument parser and project-root search; cf resolves both before installIde.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { assertSnapshot, installFiles, makeProject, makeTmpDir, run, snapshot, writeFiles } from './harness.js';

const TARGETS = ['claude', 'cursor', 'copilot', 'agents'] as const;

const GENERATED_MARKER = '<!-- context-forge:generated -->';

let tmp: string;
beforeEach(() => {
  tmp = makeTmpDir();
});
afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

function installed(dir: string, target: string): Map<string, Buffer> {
  const { project, guide } = makeProject(dir);
  const result = run(guide, project, [target]);
  expect(result.code).toBe(0);
  return installFiles(project);
}

describe('targets', () => {
  it.each(TARGETS)('test_targets_fresh[%s]', async (target) => {
    const { project, guide } = makeProject(tmp);
    const result = run(guide, project, [target]);
    await assertSnapshot(`test_targets_${target}_fresh`, snapshot(project, [result]));
  });

  it.each([
    ['codex', 'agents'],
    ['openai', 'agents'],
    ['CLAUDE', 'claude'],
  ])('test_targets_alias_matches_reference[%s]', (alias, reference) => {
    // Fixed directory names: CLAUDE and claude collide on case-insensitive disks.
    expect(installed(path.join(tmp, 'alias'), alias)).toEqual(installed(path.join(tmp, 'reference'), reference));
  });

  it('test_targets_copilot_removes_generated_prompts_keeps_user_prompts', async () => {
    const { project, guide } = makeProject(tmp);
    writeFiles(project, {
      '.github/prompts/old.prompt.md': `${GENERATED_MARKER}\nold generated\n`,
      '.github/prompts/mine.prompt.md': 'my own prompt\n',
    });
    const result = run(guide, project, ['copilot']);
    expect(fs.existsSync(path.join(project, '.github/prompts/old.prompt.md'))).toBe(false);
    expect(fs.existsSync(path.join(project, '.github/prompts/mine.prompt.md'))).toBe(true);
    await assertSnapshot('test_targets_copilot_prompts', snapshot(project, [result]));
  });

  it('test_targets_copilot_instruction_files_carry_marker', () => {
    const { project, guide } = makeProject(tmp);
    run(guide, project, ['copilot']);
    const dir = path.join(project, '.github/instructions');
    const files = fs.readdirSync(dir).filter((name) => name.endsWith('.instructions.md'));
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) expect(fs.readFileSync(path.join(dir, file), 'utf-8')).toContain(GENERATED_MARKER);
  });

  it('test_targets_cursor_removes_superseded_always_on_mdc', async () => {
    const { project, guide } = makeProject(tmp);
    writeFiles(project, { '.cursor/rules/always-a.mdc': 'from an earlier run\n' });
    const result = run(guide, project, ['cursor']);
    expect(fs.existsSync(path.join(project, '.cursor/rules/always-a.mdc'))).toBe(false);
    await assertSnapshot('test_targets_cursor_superseded_mdc', snapshot(project, [result]));
  });

  it('test_targets_cursor_agents_folder_warned_and_kept', async () => {
    const { project, guide } = makeProject(tmp);
    writeFiles(project, { '.cursor/agents/old-agent.md': 'left by an older run\n' });
    const result = run(guide, project, ['cursor']);
    expect(fs.existsSync(path.join(project, '.cursor/agents/old-agent.md'))).toBe(true);
    await assertSnapshot('test_targets_cursor_agents_dir', snapshot(project, [result]));
  });
});
