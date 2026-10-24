import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { Command } from 'commander';
import { registerRulesCommand } from '../../src/commands/rules.js';
import { makeProject, makeTmpDir, run, writeFiles } from '../ideInstall/harness.js';

const registered = vi.hoisted(() => ({ projects: [] as { id: string; name: string; projectPath: string }[] }));

// The registry is faked; the guide, project files and resolutions are real.
// detect() asks the network for the latest guide tag, so it answers from disk.
vi.mock('@context-forge/core/node', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@context-forge/core/node')>();
  class LocalGuideDetector extends actual.GuideDetector {
    override detect(projectPath: string) {
      return this.detectLocal(projectPath);
    }
  }
  class FakeProjectStore {
    getAll = async () => registered.projects;
    getById = async (id: string) => registered.projects.find((p) => p.id === id) ?? null;
  }
  return { ...actual, GuideDetector: LocalGuideDetector, FileProjectStore: FakeProjectStore };
});

class ExitSignal extends Error {}

describe('cf rules', () => {
  let tmp: string;
  let project: string;
  let guide: string;
  let stdout: string;
  let stderr: string;

  beforeEach(() => {
    tmp = makeTmpDir();
    ({ project, guide } = makeProject(tmp));
    registered.projects = [{ id: 'proj_001', name: 'test-project', projectPath: project }];
    stdout = '';
    stderr = '';
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      stdout += String(chunk);
      return true;
    });
    vi.spyOn(console, 'log').mockImplementation((...args) => {
      stdout += args.join(' ') + '\n';
    });
    vi.spyOn(console, 'error').mockImplementation((...args) => {
      stderr += args.join(' ') + '\n';
    });
    vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new ExitSignal();
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  /** Runs `cf rules ...`; a failing command ends in handleError, which exits. */
  async function cf(...args: string[]): Promise<void> {
    const program = new Command();
    program.exitOverride();
    registerRulesCommand(program);
    try {
      await program.parseAsync(['node', 'cf', 'rules', ...args, '--project', 'proj_001']);
    } catch (err) {
      if (!(err instanceof ExitSignal)) throw err;
    }
  }

  describe('inventory', () => {
    beforeEach(() => {
      writeFiles(project, { 'CLAUDE.md': '# Team rules\n' });
      run(guide, project, ['claude']);
    });

    it('--json prints the three keys', async () => {
      await cf('inventory', '--json');
      const out = JSON.parse(stdout) as Record<string, unknown>;
      expect(Object.keys(out)).toEqual(['guideRules', 'projectSources', 'resolutions']);
    });

    it('plain inventory prints the same JSON', async () => {
      await cf('inventory', '--json');
      const withFlag = stdout;
      stdout = '';
      await cf('inventory');
      expect(stdout).toBe(withFlag);
    });

    it('reports the project sources and writes nothing', async () => {
      const before = fs.readdirSync(path.join(project, '.context-forge')).sort();
      await cf('inventory');
      const out = JSON.parse(stdout) as { projectSources: { path: string }[] };
      expect(out.projectSources.map((s) => s.path)).toEqual(['CLAUDE.md']);
      expect(fs.readdirSync(path.join(project, '.context-forge')).sort()).toEqual(before);
    });

    it('fails with a message for an unknown project', async () => {
      const program = new Command();
      program.exitOverride();
      registerRulesCommand(program);
      await expect(
        program.parseAsync(['node', 'cf', 'rules', 'inventory', '--project', 'nope']),
      ).rejects.toThrow(ExitSignal);
      expect(stderr).toContain("Project 'nope' not found");
    });
  });

  describe('resolve', () => {
    const resolutionsFile = () => path.join(project, '.context-forge', 'rule-resolutions.json');
    const stored = () => (JSON.parse(fs.readFileSync(resolutionsFile(), 'utf-8')) as { resolutions: unknown[] }).resolutions;

    beforeEach(() => {
      writeFiles(project, { 'CLAUDE.md': '# Team rules\n' });
      run(guide, project, ['claude']);
    });

    it('records a valid resolution and prints the confirmation', async () => {
      await cf('resolve', 'always-a.md', 'CLAUDE.md', '--statement', 'Project wins.');
      expect(stdout).toBe('Recorded resolution always-a.md vs CLAUDE.md. Run cf setup-ide <target> to apply.\n');
      expect(stored()).toEqual([{ guideRule: 'always-a.md', projectSource: 'CLAUDE.md', statement: 'Project wins.' }]);
    });

    it('accepts a composite as the project source and keeps two resolutions for the same pair', async () => {
      await cf('resolve', 'always-a.md', 'CLAUDE.md', '--statement', 'First.');
      await cf('resolve', 'always-a.md', 'CLAUDE.md', '--statement', 'Second.');
      expect(stored()).toHaveLength(2);
    });

    it('rejects an unknown guide rule, listing the valid names', async () => {
      await cf('resolve', 'nope.md', 'CLAUDE.md', '--statement', 'x');
      expect(stderr).toContain("Unknown guide rule 'nope.md'");
      expect(stderr).toContain('always-a.md, always-b.md, broken.md, scoped-a.md, scoped-b.md');
      expect(fs.existsSync(resolutionsFile())).toBe(false);
    });

    it('rejects an unknown project source, listing the valid paths', async () => {
      await cf('resolve', 'always-a.md', 'GEMINI.md', '--statement', 'x');
      expect(stderr).toContain("Unknown project source 'GEMINI.md'");
      expect(stderr).toContain('Valid project sources: CLAUDE.md');
      expect(fs.existsSync(resolutionsFile())).toBe(false);
    });

    it('requires --statement', async () => {
      await expect(
        (async () => {
          const program = new Command();
          program.exitOverride();
          program.configureOutput({ writeErr: () => undefined });
          registerRulesCommand(program);
          await program.parseAsync(['node', 'cf', 'rules', 'resolve', 'always-a.md', 'CLAUDE.md', '--project', 'proj_001']);
        })(),
      ).rejects.toThrow(/--statement/);
      expect(fs.existsSync(resolutionsFile())).toBe(false);
    });

    it.each([
      ['a multi-line statement', 'always-a.md', 'one\ntwo', /single line/],
      ['a statement containing a marker', 'always-a.md', 'x <!-- END:context-forge --> y', /marker/],
      ['a backtick in the guide rule name', 'always`a.md', 'x', /Unknown guide rule/],
    ])('rejects %s and leaves no file', async (_label, guideRule, statement, message) => {
      await cf('resolve', guideRule, 'CLAUDE.md', '--statement', statement);
      expect(stderr).toMatch(message);
      expect(fs.existsSync(resolutionsFile())).toBe(false);
    });

    it('surfaces an error naming the path when .context-forge is a file', async () => {
      fs.rmSync(path.join(project, '.context-forge'), { recursive: true });
      fs.writeFileSync(path.join(project, '.context-forge'), 'in the way');
      await cf('resolve', 'always-a.md', 'CLAUDE.md', '--statement', 'x');
      expect(stderr).toContain('.context-forge');
    });
  });
});
