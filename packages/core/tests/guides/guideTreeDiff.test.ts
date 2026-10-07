import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { chmodSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { diffGuideTrees } from '../../src/guides/guideTreeDiff.js';
import { EXCLUDE_RECORD_FILE, VERSION_MARKER_FILE } from '../../src/guides/types.js';
import { makeTempDir } from './helpers/guideArchiveFixture.js';

describe('diffGuideTrees()', () => {
  let root: string;
  let current: string;
  let staging: string;

  /** Write `files` (relative path to content) under `dir`. */
  function write(dir: string, files: Record<string, string>): void {
    for (const [relative, content] of Object.entries(files)) {
      const full = join(dir, relative);
      mkdirSync(dirname(full), { recursive: true });
      writeFileSync(full, content, 'utf-8');
    }
  }

  beforeEach(() => {
    root = makeTempDir('cf-tree-diff-');
    current = join(root, 'current');
    staging = join(root, 'staging');
    mkdirSync(current);
    mkdirSync(staging);
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  const base = { 'a.md': 'alpha', 'sub/b.md': 'beta' };

  it('reports all zeros for identical trees', async () => {
    write(current, base);
    write(staging, base);

    expect(await diffGuideTrees(current, staging)).toEqual({ added: 0, removed: 0, changed: 0 });
  });

  it('counts a file only in staging as added', async () => {
    write(current, base);
    write(staging, { ...base, 'new/c.md': 'gamma' });

    expect(await diffGuideTrees(current, staging)).toEqual({ added: 1, removed: 0, changed: 0 });
  });

  it('counts a file only in the current tree as removed', async () => {
    write(current, { ...base, 'old.md': 'gone' });
    write(staging, base);

    expect(await diffGuideTrees(current, staging)).toEqual({ added: 0, removed: 1, changed: 0 });
  });

  it('counts a same-size content change as changed', async () => {
    write(current, base);
    write(staging, { ...base, 'a.md': 'ALPHA' });

    expect(await diffGuideTrees(current, staging)).toEqual({ added: 0, removed: 0, changed: 1 });
  });

  it('counts a different-size change as changed', async () => {
    write(current, base);
    write(staging, { ...base, 'a.md': 'alpha and more' });

    expect(await diffGuideTrees(current, staging)).toEqual({ added: 0, removed: 0, changed: 1 });
  });

  it('ignores cf bookkeeping files that differ', async () => {
    write(current, { ...base, [VERSION_MARKER_FILE]: 'v1', [EXCLUDE_RECORD_FILE]: 'x\n' });
    write(staging, { ...base, [VERSION_MARKER_FILE]: 'v2' });

    expect(await diffGuideTrees(current, staging)).toEqual({ added: 0, removed: 0, changed: 0 });
  });

  it('counts a retargeted symlink as changed, without following it', async () => {
    write(current, base);
    write(staging, base);
    symlinkSync('a.md', join(current, 'link'));
    symlinkSync('sub/b.md', join(staging, 'link'));

    expect(await diffGuideTrees(current, staging)).toEqual({ added: 0, removed: 0, changed: 1 });
  });

  it('treats a missing current directory as everything added', async () => {
    write(staging, base);
    rmSync(current, { recursive: true });

    expect(await diffGuideTrees(current, staging)).toEqual({ added: 2, removed: 0, changed: 0 });
  });

  it('throws when the staging directory is missing', async () => {
    rmSync(staging, { recursive: true });

    await expect(diffGuideTrees(current, staging)).rejects.toThrow(staging);
  });

  // Mode bits do not stop reads on Windows (or when running as root).
  const canDenyRead = process.platform !== 'win32' && process.getuid?.() !== 0;
  it.skipIf(!canDenyRead)('throws naming the path of an unreadable file', async () => {
    write(current, base);
    write(staging, { ...base, 'a.md': 'ALPHA' });
    const unreadable = join(staging, 'a.md');
    chmodSync(unreadable, 0o000);

    try {
      await expect(diffGuideTrees(current, staging)).rejects.toThrow(unreadable);
    } finally {
      chmodSync(unreadable, 0o644);
    }
  });
});
