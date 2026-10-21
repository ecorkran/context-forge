import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, mkdtemp, rm, writeFile } from 'fs/promises';
import { dirname, join } from 'path';
import { tmpdir } from 'os';
import { ADR_DIRS, DOC_PATHS, RULE_FILE_PATHS, presentPaths } from '../../src/detection/presentPaths.js';

describe('presentPaths', () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'cf-present-'));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('returns [] when nothing is present', () => {
    expect(presentPaths(root, DOC_PATHS)).toEqual([]);
  });

  it('finds a file and a directory, in candidate order', async () => {
    await mkdir(join(root, 'docs'));
    await writeFile(join(root, 'README.md'), '# x');
    expect(presentPaths(root, DOC_PATHS)).toEqual(['README.md', 'docs']);
  });

  describe.each([
    ['DOC_PATHS', DOC_PATHS],
    ['ADR_DIRS', ADR_DIRS],
    ['RULE_FILE_PATHS', RULE_FILE_PATHS],
  ])('%s', (_name, list) => {
    it.each(list)('finds %s when created', async (candidate) => {
      const path = join(root, candidate);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, 'x');
      expect(presentPaths(root, list)).toEqual([candidate]);
    });
  });

  it('throws for a path under a regular file (ENOTDIR)', async () => {
    await writeFile(join(root, 'docs'), 'not a directory');
    expect(() => presentPaths(root, ['docs/adr'])).toThrow(/ENOTDIR/);
  });
});
