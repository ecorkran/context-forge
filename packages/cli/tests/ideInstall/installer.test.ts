/** installIde's error boundary: which failures become exit 1 and which propagate. */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { installIde } from '../../src/ideInstall/installer.js';
import { makeProject, makeTmpDir, run } from './harness.js';

let tmp: string;
beforeEach(() => {
  tmp = makeTmpDir();
});
afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

describe('installIde error boundary', () => {
  it('turns a missing rules directory into its messages and exit 1', () => {
    const { project, guide } = makeProject(tmp);
    fs.rmSync(path.join(guide, 'project-guides', 'rules'), { recursive: true });
    const result = run(guide, project, ['claude']);
    expect(result.code).toBe(1);
    expect(result.stdout).toContain('❌ Error: Rules source directory not found:');
    expect(result.stdout).toContain("💡 Make sure you're running this from a project that includes ai-project-guide");
  });

  it('turns a filesystem error into a ❌ line on stderr and exit 1', () => {
    const { project, guide } = makeProject(tmp);
    // A file where the install needs a directory: mkdir fails with EEXIST/ENOTDIR.
    fs.writeFileSync(path.join(project, '.claude'), 'not a directory\n');
    const result = run(guide, project, ['claude']);
    expect(result.code).toBe(1);
    expect(result.stderr).toMatch(/❌ E[A-Z]+: /);
  });

  it('lets any other exception propagate', () => {
    const { project, guide } = makeProject(tmp);
    const bug = (): void => {
      throw new TypeError('a bug');
    };
    const install = (): unknown =>
      installIde({
        guideDir: guide,
        projectRoot: project,
        targetRoot: project,
        target: 'claude',
        dryRun: false,
        writeLint: false,
        rulesExclude: [],
        out: { stdout: bug, stderr: bug },
      });
    expect(install).toThrow('a bug');
  });
});
