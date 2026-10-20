import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { BUILD_MANIFESTS, hasBuildManifest } from '../../src/detection/buildManifest.js';

describe('hasBuildManifest', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'cf-manifest-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it.each(BUILD_MANIFESTS)('recognizes %s', (name) => {
    writeFileSync(join(dir, name), '');
    expect(hasBuildManifest(dir)).toBe(true);
  });

  it('returns false for an empty directory', () => {
    expect(hasBuildManifest(dir)).toBe(false);
  });

  it('does not walk upward to a parent manifest', () => {
    writeFileSync(join(dir, 'package.json'), '{}');
    const child = join(dir, 'child');
    mkdirSync(child);
    expect(hasBuildManifest(child)).toBe(false);
  });
});
