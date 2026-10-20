import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, symlinkSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { pathPresent } from '../../src/detection/pathPresent.js';

describe('pathPresent', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'cf-pathpresent-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('returns true for a file', () => {
    const file = join(dir, 'a.txt');
    writeFileSync(file, 'x');
    expect(pathPresent(file)).toBe(true);
  });

  it('returns true for a directory', () => {
    const sub = join(dir, 'sub');
    mkdirSync(sub);
    expect(pathPresent(sub)).toBe(true);
  });

  it('returns false for a missing path', () => {
    expect(pathPresent(join(dir, 'missing'))).toBe(false);
  });

  it('throws for a path under a regular file (ENOTDIR)', () => {
    const file = join(dir, 'a.txt');
    writeFileSync(file, 'x');
    expect(() => pathPresent(join(file, 'child'))).toThrow(/ENOTDIR/);
  });

  it('throws naming the path for a broken symlink', () => {
    const link = join(dir, 'broken');
    symlinkSync(join(dir, 'nowhere'), link);
    expect(() => pathPresent(link)).toThrow(link);
  });

  it('throws for a symlink loop (ELOOP)', () => {
    const a = join(dir, 'a');
    const b = join(dir, 'b');
    symlinkSync(b, a);
    symlinkSync(a, b);
    expect(() => pathPresent(a)).toThrow(/ELOOP/);
  });
});
