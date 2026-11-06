import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { Command } from 'commander';
import { registerDevlogCommand } from '../../src/commands/devlog.js';

const registered = vi.hoisted(() => ({ projects: [] as { id: string; name: string; projectPath: string }[] }));

// The registry is faked; the project files, config and archives are real.
vi.mock('@context-forge/core/node', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@context-forge/core/node')>();
  class FakeProjectStore {
    getAll = async () => registered.projects;
    getById = async (id: string) => registered.projects.find((p) => p.id === id) ?? null;
  }
  return { ...actual, FileProjectStore: FakeProjectStore };
});

class ExitSignal extends Error {
  constructor(readonly code: number | undefined) {
    super(`exit ${code}`);
  }
}

const section = (date: string, body: string): string => `## ${date}\n\n${body}\n\n`;
const BIG = 'x'.repeat(300);
const DEVLOG = '# Development Log\n\n' + section('20260301', BIG) + section('20251101', BIG) + section('20250701', BIG);
const ARCHIVE_Q4 = 'project-documents/user/archive/devlog/DEVLOG-2025-Q4.md';

describe('cf devlog archive', () => {
  let tmp: string;
  let project: string;
  let stdout: string;
  let stderr: string;
  let exitCode: number | undefined;

  function writeConfig(maxBytes: number, targetBytes: number): void {
    fs.writeFileSync(
      path.join(project, '.context-forge.toml'),
      `[devlog]\nmax_bytes = ${maxBytes}\ntarget_bytes = ${targetBytes}\n`,
    );
  }

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cf-devlog-cmd-'));
    project = path.join(tmp, 'project');
    fs.mkdirSync(project);
    registered.projects = [{ id: 'proj_001', name: 'test-project', projectPath: project }];
    stdout = '';
    stderr = '';
    exitCode = undefined;
    vi.spyOn(console, 'log').mockImplementation((...args) => {
      stdout += args.join(' ') + '\n';
    });
    vi.spyOn(console, 'error').mockImplementation((...args) => {
      stderr += args.join(' ') + '\n';
    });
    vi.spyOn(process, 'exit').mockImplementation((code) => {
      throw new ExitSignal(code as number | undefined);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  async function cf(...extra: string[]): Promise<void> {
    const program = new Command();
    program.exitOverride();
    registerDevlogCommand(program);
    try {
      await program.parseAsync(['node', 'cf', 'devlog', 'archive', '--project', 'proj_001', ...extra]);
    } catch (err) {
      if (!(err instanceof ExitSignal)) throw err;
      exitCode = err.code;
    }
  }

  it('moves sections and prints the before/after report with per-file counts', async () => {
    fs.writeFileSync(path.join(project, 'DEVLOG.md'), DEVLOG);
    writeConfig(600, 450);
    await cf();
    expect(exitCode).toBeUndefined();
    expect(stdout).toMatch(/^DEVLOG\.md: \d+ → \d+ bytes \(limit 600, target 450\)\nMoved 2 sections:\n/);
    expect(stdout).toContain(`  ${ARCHIVE_Q4}  1\n`);
    expect(fs.existsSync(path.join(project, ARCHIVE_Q4))).toBe(true);
  });

  it('prints Would move and writes nothing under --dry-run', async () => {
    fs.writeFileSync(path.join(project, 'DEVLOG.md'), DEVLOG);
    writeConfig(600, 450);
    await cf('--dry-run');
    expect(stdout).toContain('Would move 2 sections:');
    expect(fs.readFileSync(path.join(project, 'DEVLOG.md'), 'utf8')).toBe(DEVLOG);
    expect(fs.existsSync(path.join(project, 'project-documents'))).toBe(false);
  });

  it('reports within-limit and exits 0', async () => {
    fs.writeFileSync(path.join(project, 'DEVLOG.md'), DEVLOG);
    await cf();
    expect(exitCode).toBeUndefined();
    expect(stdout).toBe(
      `DEVLOG.md: ${Buffer.byteLength(DEVLOG)} bytes, within devlog.max_bytes (200000). Nothing to archive.\n`,
    );
  });

  it('prints the reason and exits 0 when nothing is movable', async () => {
    fs.writeFileSync(path.join(project, 'DEVLOG.md'), '# Log\n\n' + section('20260301', 'z'.repeat(2000)));
    writeConfig(600, 450);
    await cf();
    expect(exitCode).toBeUndefined();
    expect(stdout).toContain('over devlog.max_bytes (600)');
    expect(stdout).toContain('newest day section alone exceeds the limit');
  });

  it('exits 1 with the error text when DEVLOG.md is missing', async () => {
    await cf();
    expect(exitCode).toBe(1);
    expect(stderr).toContain(path.join(project, 'DEVLOG.md'));
  });
});
