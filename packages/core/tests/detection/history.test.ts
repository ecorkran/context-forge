import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { existsSync } from 'fs';
import { mkdir, mkdtemp, rm, writeFile } from 'fs/promises';
import { spawnSync } from 'child_process';
import { dirname, join, parse } from 'path';
import { tmpdir } from 'os';
import { readHistory } from '../../src/detection/history.js';

// Real git by default; the timeout case swaps in a rejection.
const gitExecOverride = vi.hoisted(() => ({ error: null as Error | null }));
vi.mock('../../src/guides/gitExec.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/guides/gitExec.js')>();
  return {
    ...actual,
    gitExec: (...args: Parameters<typeof actual.gitExec>) =>
      gitExecOverride.error ? Promise.reject(gitExecOverride.error) : actual.gitExec(...args),
  };
});

function git(cwd: string, ...args: string[]): void {
  const result = spawnSync('git', args, { cwd, encoding: 'utf-8' });
  if (result.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${result.stderr}`);
}

function initRepo(dir: string): void {
  git(dir, 'init', '-q');
  git(dir, 'config', 'user.name', 'Test');
  git(dir, 'config', 'user.email', 'test@example.com');
  git(dir, 'config', 'commit.gpgsign', 'false');
}

async function commitFile(repo: string, relative: string, content: string): Promise<void> {
  const path = join(repo, relative);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content);
  git(repo, 'add', '-A');
  git(repo, 'commit', '-q', '-m', `change ${relative} ${content}`);
}

function hasGitAncestor(dir: string): boolean {
  for (let current = dir; ; current = dirname(current)) {
    if (existsSync(join(current, '.git'))) return true;
    if (current === parse(current).root) return false;
  }
}

describe('readHistory', () => {
  let scratch: string;

  beforeEach(async () => {
    scratch = await mkdtemp(join(tmpdir(), 'cf-history-'));
    gitExecOverride.error = null;
  });

  afterEach(async () => {
    await rm(scratch, { recursive: true, force: true });
  });

  it('counts commits in a full repo', async () => {
    initRepo(scratch);
    for (const n of ['1', '2', '3']) await commitFile(scratch, 'a.txt', n);
    expect(await readHistory(scratch)).toEqual({ kind: 'known', commits: 3, shallow: false });
  });

  it('reports a shallow clone', async () => {
    const source = join(scratch, 'source');
    await mkdir(source);
    initRepo(source);
    for (const n of ['1', '2', '3']) await commitFile(source, 'a.txt', n);
    const clone = join(scratch, 'clone');
    git(scratch, 'clone', '-q', '--depth', '1', `file://${source}`, clone);
    expect(await readHistory(clone)).toEqual({ kind: 'known', commits: 1, shallow: true });
  });

  it('scopes the count to the given subdirectory', async () => {
    initRepo(scratch);
    await commitFile(scratch, 'packages/app/a.txt', '1');
    await commitFile(scratch, 'packages/lib/b.txt', '1');
    await commitFile(scratch, 'packages/lib/b.txt', '2');
    await commitFile(scratch, 'packages/app/a.txt', '2');
    expect(await readHistory(join(scratch, 'packages/app'))).toEqual({
      kind: 'known',
      commits: 2,
      shallow: false,
    });
  });

  it('is unknown, with a reason, outside a repository', async () => {
    expect(hasGitAncestor(scratch)).toBe(false);
    const result = await readHistory(scratch);
    expect(result.kind).toBe('unknown');
    if (result.kind === 'unknown') expect(result.reason.length).toBeGreaterThan(0);
  });

  it('is unknown for a repository with no commits', async () => {
    initRepo(scratch);
    expect((await readHistory(scratch)).kind).toBe('unknown');
  });

  it('is unknown with a timeout reason when git times out', async () => {
    gitExecOverride.error = new Error('git rev-list failed in /x: timed out after 5s');
    const result = await readHistory(scratch);
    expect(result.kind).toBe('unknown');
    if (result.kind === 'unknown') expect(result.reason).toContain('timed out');
  });
});
