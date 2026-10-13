/**
 * Smoke test: every target against the repo's installed guide, assertions only.
 * No snapshot: real rules change often, and this only has to catch an install
 * that breaks on content the fixture guide does not have.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { makeProject, makeTmpDir, REPO_ROOT, run } from './harness.js';

const INSTALLED_GUIDE = path.join(REPO_ROOT, 'project-documents', 'ai-project-guide', 'project-guides');

/** Top-level files each target writes. */
const EXPECTED: Record<string, string[]> = {
  agents: ['AGENTS.md'],
  claude: ['CLAUDE.md', '.claude/rules', '.claude/agents'],
  copilot: ['AGENTS.md', '.github/copilot-instructions.md', '.github/instructions'],
  cursor: ['AGENTS.md', '.cursor/rules'],
};

let tmp: string;
beforeEach(() => {
  tmp = makeTmpDir();
});
afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

describe('real guide', () => {
  it.each(Object.keys(EXPECTED))('test_real_guide_target_installs[%s]', (target) => {
    const { project, guide } = makeProject(tmp, INSTALLED_GUIDE);
    const result = run(guide, project, [target]);
    expect(result.code, result.stdout + result.stderr).toBe(0);
    expect(result.stdout + result.stderr).not.toContain('❌');
    for (const rel of EXPECTED[target]) expect(fs.existsSync(path.join(project, rel)), rel).toBe(true);
  });
});
