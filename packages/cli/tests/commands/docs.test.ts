import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { Command } from 'commander';
import { registerDocsCommand } from '../../src/commands/docs.js';

const registered = vi.hoisted(() => ({ projects: [] as { id: string; name: string; projectPath: string }[] }));

// The registry is faked; the project files and the map are real.
vi.mock('@context-forge/core/node', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@context-forge/core/node')>();
  class FakeProjectStore {
    getAll = async () => registered.projects;
    getById = async (id: string) => registered.projects.find((p) => p.id === id) ?? null;
  }
  return { ...actual, FileProjectStore: FakeProjectStore };
});

class ExitSignal extends Error {}

const MAP_FILE = 'project-documents/user/architecture/050-docs-map.test-project.md';

describe('cf docs map', () => {
  let tmp: string;
  let project: string;
  let stdout: string;
  let stderr: string;

  function put(root: string, relPath: string, content = '# T\n'): void {
    fs.mkdirSync(path.dirname(path.join(root, relPath)), { recursive: true });
    fs.writeFileSync(path.join(root, relPath), content);
  }

  /** Content hash of every file under root except the map. */
  function hashTree(root: string): Record<string, string> {
    const hashes: Record<string, string> = {};
    const visit = (dir: string): void => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) visit(full);
        else if (path.relative(root, full) !== MAP_FILE) {
          hashes[path.relative(root, full)] = crypto.createHash('sha256').update(fs.readFileSync(full)).digest('hex');
        }
      }
    };
    visit(root);
    return hashes;
  }

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cf-docs-cmd-'));
    project = path.join(tmp, 'project');
    fs.mkdirSync(project);
    registered.projects = [{ id: 'proj_001', name: 'test-project', projectPath: project }];
    stdout = '';
    stderr = '';
    vi.spyOn(console, 'log').mockImplementation((...args) => {
      stdout += args.join(' ') + '\n';
    });
    vi.spyOn(console, 'error').mockImplementation((...args) => {
      stderr += args.join(' ') + '\n';
    });
    vi.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
      stderr += String(chunk);
      return true;
    });
    vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new ExitSignal();
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  /** Runs `cf docs map`; a failing command ends in handleError, which exits. */
  async function cf(...extra: string[]): Promise<void> {
    const program = new Command();
    program.exitOverride();
    registerDocsCommand(program);
    try {
      await program.parseAsync(['node', 'cf', 'docs', 'map', '--project', 'proj_001', ...extra]);
    } catch (err) {
      if (!(err instanceof ExitSignal)) throw err;
    }
  }

  it('prints created with counts, then unchanged on a re-run', async () => {
    put(project, 'README.md');
    put(project, 'docs/guide.md');
    put(project, 'docs/adr/0001-x.md');
    await cf();
    expect(stdout).toBe(`Docs map: ${MAP_FILE} (created)\n  ADRs: 1   Docs: 2\n`);

    stdout = '';
    await cf();
    expect(stdout).toContain('(unchanged)');
  });

  it('prints the symlink line only when a symlink was skipped', async () => {
    put(project, 'README.md');
    await cf();
    expect(stdout).not.toContain('Skipped symlinks');

    fs.mkdirSync(path.join(project, 'docs'));
    fs.symlinkSync(project, path.join(project, 'docs', 'vendor-docs'));
    stdout = '';
    await cf();
    expect(stdout).toContain('  Skipped symlinks (not followed): docs/vendor-docs\n');
  });

  it('exits 1 naming the file when the map block is broken', async () => {
    put(project, 'README.md');
    put(project, MAP_FILE, '# Map\n<!-- BEGIN:cf-docs-map -->\nstale\n');
    await cf();
    expect(process.exit).toHaveBeenCalledWith(1);
    expect(stderr).toMatch(/^Error: /m);
    expect(stderr).toContain('050-docs-map.test-project.md');
  });

  it('exits 1 for an unregistered project', async () => {
    const program = new Command();
    program.exitOverride();
    registerDocsCommand(program);
    await expect(program.parseAsync(['node', 'cf', 'docs', 'map', '--project', 'nope'])).rejects.toThrow(ExitSignal);
    expect(process.exit).toHaveBeenCalledWith(1);
    expect(stderr).toContain("Project 'nope' not found");
  });

  it('maps only the subdirectory for a monorepo project', async () => {
    const app = path.join(project, 'packages', 'app');
    put(project, 'README.md', '# Repo root\n');
    put(project, 'docs/root-guide.md');
    put(app, 'README.md', '# App\n');
    put(app, 'docs/app-guide.md');
    registered.projects = [{ id: 'proj_001', name: 'test-project', projectPath: app }];

    await cf();

    const map = fs.readFileSync(path.join(app, MAP_FILE), 'utf8');
    expect(map).toContain('[App](../../../README.md)');
    expect(map).toContain('docs/app-guide.md');
    expect(map).not.toContain('Repo root');
    expect(map).not.toContain('root-guide');
  });

  it('leaves every original file byte-identical', async () => {
    put(project, 'README.md');
    put(project, 'docs/guide.md');
    put(project, 'docs/adr/0001-x.md');
    const before = hashTree(project);
    await cf();
    expect(hashTree(project)).toEqual(before);
  });
});
