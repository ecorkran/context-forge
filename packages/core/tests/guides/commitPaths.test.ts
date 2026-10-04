import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { commitPathsIfChanged, restorePathsToHead } from '../../src/guides/gitExec.js';
import {
  createGitWorktreeFixture,
  commitCount,
  git,
  installRejectingPreCommitHook,
  lastSubject,
  porcelain,
  writeRel,
  type GitWorktreeFixture,
} from '../helpers/gitWorktreeFixture.js';

const MESSAGE = 'docs: test commit';

let fx: GitWorktreeFixture;
let wt: string;

beforeEach(() => {
  fx = createGitWorktreeFixture(['b'], (primary) => {
    writeRel(primary, 'docs/a.md', 'a0\n');
    writeRel(primary, 'docs/b.md', 'b0\n');
    writeRel(primary, 'docs/other.md', 'o0\n');
  });
  wt = fx.worktrees.b;
});

afterEach(() => fx.cleanup());

/** Paths changed by the HEAD commit. */
function headFiles(checkout: string): string[] {
  return git(checkout, 'show', '--name-only', '--format=', 'HEAD').split('\n').filter(Boolean).sort();
}

describe('commitPathsIfChanged', () => {
  it('commits exactly the changed paths and returns the sha', async () => {
    writeRel(wt, 'docs/a.md', 'a1\n');
    writeRel(wt, 'docs/b.md', 'b1\n');

    const sha = await commitPathsIfChanged(wt, ['docs/a.md', 'docs/b.md'], MESSAGE);

    expect(sha).toBe(git(wt, 'rev-parse', 'HEAD'));
    expect(headFiles(wt)).toEqual(['docs/a.md', 'docs/b.md']);
    expect(lastSubject(wt)).toBe(MESSAGE);
    expect(porcelain(wt)).toBe('');
  });

  it('returns null and makes no commit when nothing changed', async () => {
    const before = commitCount(wt);
    expect(await commitPathsIfChanged(wt, ['docs/a.md', 'docs/b.md'], MESSAGE)).toBeNull();
    expect(commitCount(wt)).toBe(before);
  });

  it('leaves an unrelated staged file staged and out of the commit', async () => {
    writeRel(wt, 'docs/other.md', 'o1\n');
    git(wt, 'add', 'docs/other.md');
    writeRel(wt, 'docs/a.md', 'a1\n');

    await commitPathsIfChanged(wt, ['docs/a.md'], MESSAGE);

    expect(headFiles(wt)).toEqual(['docs/a.md']);
    expect(porcelain(wt)).toBe('M  docs/other.md');
  });

  it('throws when the path is not a git repository', async () => {
    const plain = realpathSync(mkdtempSync(join(tmpdir(), 'cf-not-repo-')));
    try {
      await expect(commitPathsIfChanged(plain, ['x.md'], MESSAGE)).rejects.toThrow();
    } finally {
      rmSync(plain, { recursive: true, force: true });
    }
  });

  it('throws when a pre-commit hook rejects, and makes no commit', async () => {
    installRejectingPreCommitHook(fx, wt);
    writeRel(wt, 'docs/a.md', 'a1\n');
    const before = commitCount(wt);

    await expect(commitPathsIfChanged(wt, ['docs/a.md'], MESSAGE)).rejects.toThrow(/rejected by test hook/);
    expect(commitCount(wt)).toBe(before);
  });
});

describe('restorePathsToHead', () => {
  it('returns a modified and staged path to HEAD content, unstaged', async () => {
    writeRel(wt, 'docs/a.md', 'a1\n');
    git(wt, 'add', 'docs/a.md');

    await restorePathsToHead(wt, ['docs/a.md']);

    expect(readFileSync(join(wt, 'docs/a.md'), 'utf-8')).toBe('a0\n');
    expect(porcelain(wt)).toBe('');
  });

  it('leaves an unrelated modified file untouched', async () => {
    writeRel(wt, 'docs/a.md', 'a1\n');
    writeRel(wt, 'docs/other.md', 'o1\n');

    await restorePathsToHead(wt, ['docs/a.md']);

    expect(readFileSync(join(wt, 'docs/other.md'), 'utf-8')).toBe('o1\n');
    expect(porcelain(wt)).toBe('M docs/other.md');
  });
});
