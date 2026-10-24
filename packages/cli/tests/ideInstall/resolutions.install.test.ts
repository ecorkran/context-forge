import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RESOLUTIONS_HEADING } from '../../src/ideInstall/resolutions.js';
import { setupIdeAction } from '../../src/commands/setup-ide.js';
import {
  FIXTURE_RESOLUTION,
  STRIP_ANSI,
  bullet,
  read,
  writeProjectRules,
} from './resolutionsFixture.js';
import { makeProject, makeTmpDir, run, tree, writeFiles } from './harness.js';

// setupIdeAction's guide check asks the network for the latest tag; answer from disk.
vi.mock('@context-forge/core/node', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@context-forge/core/node')>();
  class LocalGuideDetector extends actual.GuideDetector {
    override detect(projectPath: string) {
      return this.detectLocal(projectPath);
    }
  }
  return { ...actual, GuideDetector: LocalGuideDetector };
});

describe('rule resolutions through the install', () => {
  let tmp: string;
  let project: string;
  let guide: string;

  beforeEach(() => {
    tmp = makeTmpDir();
    ({ project, guide } = makeProject(tmp));
    writeProjectRules(project);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('a valid resolution reaches the written block', () => {
    expect(run(guide, project, ['claude'], { ruleResolutions: [FIXTURE_RESOLUTION] }).code).toBe(0);
    const claude = read(project, 'CLAUDE.md');
    expect(claude).toContain(RESOLUTIONS_HEADING);
    expect(claude).toContain(bullet(FIXTURE_RESOLUTION));
  });

  it('no resolutions writes no section', () => {
    run(guide, project, ['claude']);
    expect(read(project, 'CLAUDE.md')).not.toContain(RESOLUTIONS_HEADING);
  });

  it('a stale resolution warns once, even for a target that writes two composites, and still exits 0', () => {
    const stale = { ...FIXTURE_RESOLUTION, guideRule: 'git-old.md' };
    const result = run(guide, project, ['copilot'], { ruleResolutions: [stale] });
    expect(result.code).toBe(0);
    const warnings = result.stderr
      .replace(STRIP_ANSI, '')
      .split('\n')
      .filter((line) => line.includes('names a guide rule the guide no longer has'));
    expect(warnings).toHaveLength(1);
    expect(read(project, '.github/copilot-instructions.md')).not.toContain(RESOLUTIONS_HEADING);
    expect(read(project, 'AGENTS.md')).not.toContain(RESOLUTIONS_HEADING);
  });

  it('a malformed resolutions file fails the install and changes nothing in the checkout', async () => {
    writeFiles(project, { '.context-forge/rule-resolutions.json': '{"version": 99, "resolutions": []}' });
    const before = tree(project);
    await expect(setupIdeAction(project, 'claude', { yes: true })).rejects.toThrow(/rule-resolutions\.json.*version/);
    expect(tree(project)).toEqual(before);
    expect(fs.existsSync(path.join(project, '.claude'))).toBe(false);
  });
});
