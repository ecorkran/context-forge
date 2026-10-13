/**
 * Target behavior: what each setup-ide target installs. The guide's
 * no-target, unknown-target and run-from-subdirectory runs tested the bash
 * argument parser and project-root search; cf resolves both before installIde.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { assertSnapshot, installFiles, makeProject, makeTmpDir, run, snapshot } from './harness.js';

/** Targets ported so far; extended as each target lands. */
const TARGETS = ['claude'] as const;

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

  it.each([['CLAUDE', 'claude']])('test_targets_alias_matches_reference[%s]', (alias, reference) => {
    // Fixed directory names: CLAUDE and claude collide on case-insensitive disks.
    expect(installed(path.join(tmp, 'alias'), alias)).toEqual(installed(path.join(tmp, 'reference'), reference));
  });
});
