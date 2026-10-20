import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { MIN_GUIDE_VERSION, checkGuideMinimum } from '../../src/guides/guideMinimum.js';
import { GUIDE_RELATIVE_PATH, LOCAL_VERSION_MARKER, VERSION_MARKER_FILE } from '../../src/guides/types.js';

describe('checkGuideMinimum', () => {
  let projectPath: string;

  beforeEach(() => {
    projectPath = mkdtempSync(join(tmpdir(), 'cf-guide-min-'));
  });

  afterEach(() => {
    rmSync(projectPath, { recursive: true, force: true });
  });

  /** Tarball-style install: a guide directory with a version marker file (or none). */
  function installGuide(version: string | null): void {
    const guidePath = join(projectPath, GUIDE_RELATIVE_PATH);
    mkdirSync(guidePath, { recursive: true });
    if (version !== null) writeFileSync(join(guidePath, VERSION_MARKER_FILE), `${version}\n`);
  }

  it('is silent at the minimum', async () => {
    installGuide(`v${MIN_GUIDE_VERSION}`);
    expect(await checkGuideMinimum(projectPath)).toBeNull();
  });

  it('is silent above the minimum', async () => {
    installGuide('v9.0.0');
    expect(await checkGuideMinimum(projectPath)).toBeNull();
  });

  it('warns below the minimum, naming both versions and the update command', async () => {
    installGuide('v0.21.0');
    const message = await checkGuideMinimum(projectPath);
    expect(message).toContain('v0.21.0');
    expect(message).not.toContain('vv0.21.0');
    expect(message).toContain(`v${MIN_GUIDE_VERSION}`);
    expect(message).toContain('cf guides update');
  });

  it('warns about an unknown version when the marker is missing', async () => {
    installGuide(null);
    expect(await checkGuideMinimum(projectPath)).toContain('version is unknown');
  });

  it('treats the local marker as an unknown version', async () => {
    installGuide(LOCAL_VERSION_MARKER);
    expect(await checkGuideMinimum(projectPath)).toContain('version is unknown');
  });

  it('is silent when no guide is installed', async () => {
    expect(await checkGuideMinimum(projectPath)).toBeNull();
  });
});
