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
});
