import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { chmod, mkdir, mkdtemp, rm, symlink, writeFile } from 'fs/promises';
import { dirname, join } from 'path';
import { tmpdir } from 'os';
import {
  EXCLUDED_DIRS,
  MAX_SOURCE_FILE_BYTES,
  MAX_WALK_ENTRIES,
  SOURCE_EXTENSIONS,
  measureSourceVolume,
} from '../../src/detection/sourceVolume.js';
import { AdoptionError } from '../../src/adoption/contracts.js';
import { BROWNFIELD_MIN_SOURCE_LINES } from '../../src/adoption/adoptionOutcome.js';

const lines = (n: number): string => Array.from({ length: n }, (_, i) => `const a${i} = ${i};`).join('\n');

describe('measureSourceVolume', () => {
  let root: string;
  let outside: string;

  async function put(relative: string, content: string): Promise<void> {
    const path = join(root, relative);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, content);
  }

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'cf-volume-root-'));
    outside = await mkdtemp(join(tmpdir(), 'cf-volume-outside-'));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  });

  describe('extensions', () => {
    it.each(SOURCE_EXTENSIONS)('counts .%s files', async (ext) => {
      await put(`file.${ext}`, lines(3));
      expect(await measureSourceVolume(root)).toEqual({ files: 1, lines: 3, capped: false });
    });

    it('does not count .md, .json, .lock or LICENSE', async () => {
      await put('README.md', lines(50));
      await put('package.json', lines(50));
      await put('pnpm.lock', lines(50));
      await put('LICENSE', lines(50));
      expect(await measureSourceVolume(root)).toEqual({ files: 0, lines: 0, capped: false });
    });

    it('does not count blank or whitespace-only lines', async () => {
      await put('a.ts', 'one\n\n   \n\t\ntwo\n');
      expect((await measureSourceVolume(root)).lines).toBe(2);
    });
  });

  describe('exclusions', () => {
    it.each([...EXCLUDED_DIRS, '.git', '.hidden'])('does not count lines under %s/', async (dir) => {
      await put(`${dir}/deep/a.ts`, lines(10));
      expect(await measureSourceVolume(root)).toEqual({ files: 0, lines: 0, capped: false });
    });

    it('ignores project-documents even when it holds source files', async () => {
      await put('project-documents/user/guide/example.py', lines(3000));
      expect((await measureSourceVolume(root)).lines).toBe(0);
    });

    it('skips a file just over MAX_SOURCE_FILE_BYTES', async () => {
      await put('big.ts', 'x'.repeat(MAX_SOURCE_FILE_BYTES + 1));
      expect(await measureSourceVolume(root)).toEqual({ files: 0, lines: 0, capped: false });
    });
  });

  it('does not follow symlinked directories or files', async () => {
    await writeFile(join(outside, 'big.ts'), lines(3000));
    await symlink(outside, join(root, 'linked-dir'));
    await symlink(join(outside, 'big.ts'), join(root, 'linked-file.ts'));
    expect(await measureSourceVolume(root)).toEqual({ files: 0, lines: 0, capped: false });
  });

  it('stops at the threshold: ten 1000-line files read as two', async () => {
    for (let i = 0; i < 10; i++) await put(`f${i}.ts`, lines(1000));
    expect(await measureSourceVolume(root)).toEqual({
      files: 2,
      lines: BROWNFIELD_MIN_SOURCE_LINES,
      capped: true,
    });
  });

  it('reports exact totals below the threshold', async () => {
    await put('a.ts', lines(300));
    await put('src/b.py', lines(400));
    await put('src/deep/c.go', lines(200));
    expect(await measureSourceVolume(root)).toEqual({ files: 3, lines: 900, capped: false });
  });

  it('throws AdoptionError naming the count and the override at MAX_WALK_ENTRIES', async () => {
    const perDir = Math.ceil((MAX_WALK_ENTRIES + 1) / 4);
    for (let d = 0; d < 4; d++) {
      const dir = join(root, `d${d}`);
      await mkdir(dir);
      await Promise.all(
        Array.from({ length: perDir }, (_, i) => writeFile(join(dir, `f${i}.txt`), '')),
      );
    }
    const attempt = measureSourceVolume(root);
    await expect(attempt).rejects.toBeInstanceOf(AdoptionError);
    await expect(attempt).rejects.toThrow(String(MAX_WALK_ENTRIES));
    await expect(attempt).rejects.toThrow('declined');
  }, 30_000);

  describe('unreadable directory', () => {
    const isRoot = typeof process.getuid === 'function' && process.getuid() === 0;
    const skip = isRoot || process.platform === 'win32';
    let locked: string;

    afterEach(async () => {
      if (locked) await chmod(locked, 0o755);
    });

    it.skipIf(skip)('throws AdoptionError naming the path and EACCES', async () => {
      locked = join(root, 'locked');
      await mkdir(locked);
      await chmod(locked, 0o000);
      const attempt = measureSourceVolume(root);
      await expect(attempt).rejects.toBeInstanceOf(AdoptionError);
      await expect(attempt).rejects.toThrow(locked);
      await expect(attempt).rejects.toThrow('EACCES');
    });
  });
});
