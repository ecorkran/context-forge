import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { addRuleResolution, ConfigManager } from '@context-forge/core/node';
import { buildInventory } from '../../src/commands/rulesInventory.js';
import { makeProject, makeTmpDir, run, writeFiles } from '../ideInstall/harness.js';

// The real detect() asks the network for the latest guide tag; the inventory
// only needs the on-disk answer, which detectLocal() gives.
vi.mock('@context-forge/core/node', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@context-forge/core/node')>();
  class LocalGuideDetector extends actual.GuideDetector {
    override detect(projectPath: string) {
      return this.detectLocal(projectPath);
    }
  }
  return { ...actual, GuideDetector: LocalGuideDetector };
});

const HAND_WRITTEN = '# Team rules\nNever commit directly to main.\n';

describe('buildInventory', () => {
  let tmp: string;
  let project: string;
  let guide: string;

  beforeEach(() => {
    tmp = makeTmpDir();
    ({ project, guide } = makeProject(tmp));
  });

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('lists delivered and excluded guide rules', async () => {
    await new ConfigManager(project).set('rules.exclude', 'scoped-a.md', 'project');
    const { guideRules } = await buildInventory(project);
    const state = Object.fromEntries(guideRules.map((r) => [r.rule, r.excluded]));
    expect(state).toEqual({
      'always-a.md': false,
      'always-b.md': false,
      'broken.md': false,
      'scoped-a.md': true,
      'scoped-b.md': false,
    });
  });

  it('reports a hand-written CLAUDE.md as a composite with its block range after a real setup-ide run', async () => {
    writeFiles(project, { 'CLAUDE.md': HAND_WRITTEN });
    expect(run(guide, project, ['claude']).code).toBe(0);
    const lines = fs.readFileSync(path.join(project, 'CLAUDE.md'), 'utf-8').split('\n');
    const beginLine = lines.findIndex((l) => l.includes('BEGIN:context-forge')) + 1;
    const endLine = lines.findIndex((l) => l.includes('END:context-forge')) + 1;

    const { projectSources } = await buildInventory(project);
    expect(projectSources).toEqual([
      { path: 'CLAUDE.md', kind: 'composite', managedBlock: { beginLine, endLine } },
    ]);
    expect(beginLine).toBeGreaterThan(2);
  });

  it('omits the files cf installed', async () => {
    writeFiles(project, { 'CLAUDE.md': HAND_WRITTEN, '.claude/rules/team-style.md': 'team\n' });
    run(guide, project, ['claude']);
    expect(fs.existsSync(path.join(project, '.claude/rules/scoped-a.md'))).toBe(true);
    const { projectSources } = await buildInventory(project);
    expect(projectSources.map((s) => s.path)).toEqual(['CLAUDE.md', '.claude/rules/team-style.md']);
  });

  it('reports broken markers', async () => {
    writeFiles(project, { 'CLAUDE.md': '<!-- BEGIN:context-forge -->\nunterminated\n' });
    const { projectSources } = await buildInventory(project);
    expect(projectSources).toEqual([{ path: 'CLAUDE.md', kind: 'composite', managedBlock: 'broken' }]);
  });

  it('echoes existing resolutions', async () => {
    const resolution = { guideRule: 'always-a.md', projectSource: 'CLAUDE.md', statement: 'Project wins.' };
    addRuleResolution(project, resolution);
    expect((await buildInventory(project)).resolutions).toEqual([resolution]);
  });

  it('fails naming the file when the resolutions file is malformed', async () => {
    writeFiles(project, { '.context-forge/rule-resolutions.json': '{"version": 9}' });
    await expect(buildInventory(project)).rejects.toThrow(/rule-resolutions\.json.*version/);
  });

  it('fails explicitly when the guide is not installed', async () => {
    fs.rmSync(path.join(project, 'project-documents'), { recursive: true });
    await expect(buildInventory(project)).rejects.toThrow(/Guides are not installed/);
  });
});
