import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ProjectData } from '@context-forge/core';
import { checkoutLagWarning } from '../../src/utils/upstreamLag.js';

const IDENTITY = ['-c', 'user.name=t', '-c', 'user.email=t@example.com'];

function git(cwd: string, ...args: string[]): void {
  execFileSync('git', [...IDENTITY, ...args], { cwd, stdio: 'pipe' });
}

function commitFile(cwd: string, name: string): void {
  writeFileSync(join(cwd, name), `${name}\n`);
  git(cwd, 'add', name);
  git(cwd, 'commit', '-m', name);
}

let root: string;
let clone: string;
let origin: string;

function projectAt(path: string, extra: Partial<ProjectData> = {}): ProjectData {
  return { id: 'p', name: 'demo', projectPath: path, ...extra } as ProjectData;
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'cli-upstream-lag-'));
  origin = join(root, 'origin.git');
  clone = join(root, 'clone');
  git(root, 'init', '--bare', '-b', 'main', origin);
  git(root, 'clone', origin, clone);
  commitFile(clone, 'a.txt');
  git(clone, 'push', 'origin', 'HEAD:main');
  git(clone, 'branch', '--set-upstream-to=origin/main');
});

afterEach(() => rmSync(root, { recursive: true, force: true }));

describe('checkoutLagWarning', () => {
  it('null when the checkout is current', async () => {
    expect(await checkoutLagWarning(projectAt(clone))).toBeNull();
  });

  it('names the project when the checkout trails its upstream', async () => {
    const other = join(root, 'other');
    git(root, 'clone', origin, other);
    commitFile(other, 'b.txt');
    git(other, 'push', 'origin', 'HEAD:main');
    git(clone, 'fetch');
    expect(await checkoutLagWarning(projectAt(clone))).toBe(
      'demo is 1 commit behind origin/main; artifact lists may be incomplete',
    );
  });

  it('null when the path is not a git checkout', async () => {
    expect(await checkoutLagWarning(projectAt(root))).toBeNull();
  });
});
