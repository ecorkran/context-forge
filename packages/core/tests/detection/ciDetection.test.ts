import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { CI_SIGNATURES, recognizeCi } from '../../src/detection/ciDetection.js';

function touch(base: string, relative: string): string {
  const full = join(base, relative);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, '');
  return full;
}

describe('recognizeCi', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'cf-ci-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  const fileSignatures = CI_SIGNATURES.filter((s) => s.kind === 'file').map((s) => s.path);
  it.each(fileSignatures)('recognizes single-file signature %s', (path) => {
    const file = touch(dir, path);
    expect(recognizeCi(dir)).toEqual({ recognized: true, matches: [file] });
  });

  describe.each(CI_SIGNATURES.filter((s) => s.kind === 'dir').map((s) => s.path))('directory %s', (path) => {
    it('recognizes a .yml file', () => {
      expect(recognizeCi((touch(dir, `${path}/test.yml`), dir)).recognized).toBe(true);
    });

    it('recognizes a .yaml file', () => {
      expect(recognizeCi((touch(dir, `${path}/ci.yaml`), dir)).recognized).toBe(true);
    });

    it('does not recognize a non-yaml file alone', () => {
      touch(dir, `${path}/notes.md`);
      expect(recognizeCi(dir)).toEqual({ recognized: false, matches: [] });
    });
  });

  it('finds CI at the repository root from a monorepo package', () => {
    mkdirSync(join(dir, '.git'));
    const rootCi = touch(dir, '.github/workflows/ci.yml');
    const pkg = join(dir, 'packages', 'app');
    mkdirSync(pkg, { recursive: true });
    const result = recognizeCi(pkg);
    expect(result.recognized).toBe(true);
    expect(result.matches).toContain(rootCi);
  });

  it('lists each match once when projectPath is the repository root', () => {
    mkdirSync(join(dir, '.git'));
    const ci = touch(dir, '.github/workflows/ci.yml');
    expect(recognizeCi(dir).matches).toEqual([ci]);
  });

  it('finds the root when .git is a file (worktree form)', () => {
    writeFileSync(join(dir, '.git'), 'gitdir: elsewhere');
    const rootCi = touch(dir, '.gitlab-ci.yml');
    const pkg = join(dir, 'sub');
    mkdirSync(pkg);
    expect(recognizeCi(pkg).matches).toEqual([rootCi]);
  });

  it('does not recognize CI in a parent directory when no repository exists', () => {
    // Precondition: no .git anywhere above the temp tree, else the test proves nothing.
    for (let current = dir; ; current = dirname(current)) {
      expect(existsSync(join(current, '.git'))).toBe(false);
      if (dirname(current) === current) break;
    }
    touch(dir, 'Jenkinsfile');
    const child = join(dir, 'child');
    mkdirSync(child);
    expect(recognizeCi(child)).toEqual({ recognized: false, matches: [] });
  });

  it('throws ENOTDIR when .github/workflows is a regular file', () => {
    touch(dir, '.github/workflows');
    expect(() => recognizeCi(dir)).toThrow(/ENOTDIR/);
  });
});
