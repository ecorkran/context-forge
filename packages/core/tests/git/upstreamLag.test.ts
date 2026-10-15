import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { formatUpstreamLagWarning, upstreamLag } from '../../src/git/upstreamLag.js';

const GIT_IDENTITY = ['-c', 'user.name=t', '-c', 'user.email=t@example.com'];

function git(cwd: string, ...args: string[]): void {
  execFileSync('git', [...GIT_IDENTITY, ...args], { cwd, stdio: 'pipe' });
}

function commitFile(cwd: string, name: string): void {
  writeFileSync(join(cwd, name), `${name}\n`);
  git(cwd, 'add', name);
  git(cwd, 'commit', '-m', name);
}

let root: string;
let origin: string;
let clone: string;
let other: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'upstream-lag-'));
  origin = join(root, 'origin.git');
  clone = join(root, 'clone');
  other = join(root, 'other');
  git(root, 'init', '--bare', '-b', 'main', origin);
  git(root, 'clone', origin, clone);
  commitFile(clone, 'a.txt');
  git(clone, 'push', 'origin', 'HEAD:main');
  git(clone, 'branch', '--set-upstream-to=origin/main');
  git(root, 'clone', origin, other);
});

afterEach(() => rmSync(root, { recursive: true, force: true }));

describe('upstreamLag', () => {
  it('up to date: zero behind', async () => {
    expect(await upstreamLag(clone)).toEqual({ behind: 0, upstream: 'origin/main' });
  });

  it('counts commits fetched but not pulled', async () => {
    commitFile(other, 'b.txt');
    commitFile(other, 'c.txt');
    git(other, 'push', 'origin', 'HEAD:main');
    git(clone, 'fetch');
    expect(await upstreamLag(clone)).toEqual({ behind: 2, upstream: 'origin/main' });
  });

  it('is local only: an unfetched remote commit is not counted', async () => {
    commitFile(other, 'b.txt');
    git(other, 'push', 'origin', 'HEAD:main');
    expect((await upstreamLag(clone))?.behind).toBe(0);
  });

  it('no upstream configured: null', async () => {
    git(clone, 'checkout', '-b', 'local-only');
    expect(await upstreamLag(clone)).toBeNull();
  });

  it('detached HEAD: null', async () => {
    git(clone, 'checkout', '--detach');
    expect(await upstreamLag(clone)).toBeNull();
  });

  it('not a git repo: null', async () => {
    expect(await upstreamLag(root)).toBeNull();
  });
});

describe('formatUpstreamLagWarning', () => {
  it('names the checkout, count, upstream, and the consequence', () => {
    expect(formatUpstreamLagWarning('trading-data-maintenance', { behind: 16, upstream: 'origin/main' })).toBe(
      'trading-data-maintenance is 16 commits behind origin/main; artifact lists may be incomplete',
    );
  });

  it('uses the singular for one commit', () => {
    expect(formatUpstreamLagWarning('x', { behind: 1, upstream: 'origin/main' })).toContain('1 commit behind');
  });
});
