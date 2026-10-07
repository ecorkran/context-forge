import { describe, it, expect, afterEach } from 'vitest';
import { existsSync, mkdirSync, rmSync, statSync } from 'fs';
import { join } from 'path';
import { extract, list } from 'tar';
import {
  buildGuideArchive,
  truncateArchive,
  makeTempDir,
  readText,
  DEFAULT_GUIDE_FILES,
} from './guideArchiveFixture.js';

describe('guideArchiveFixture', () => {
  const dirs: string[] = [];

  function tempDir(): string {
    const dir = makeTempDir();
    dirs.push(dir);
    return dir;
  }

  afterEach(() => {
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  it('builds an archive that extracts with strip:1 to the expected files', async () => {
    const dir = tempDir();
    const archive = await buildGuideArchive({ dir });
    const out = join(dir, 'out');
    mkdirSync(out);

    await extract({ file: archive, cwd: out, strip: 1 });

    for (const [relative, content] of Object.entries(DEFAULT_GUIDE_FILES)) {
      expect(readText(join(out, relative))).toBe(content);
    }
  });

  it('adds a second top-level directory when asked', async () => {
    const archive = await buildGuideArchive({ dir: tempDir(), secondRoot: 'other-root' });
    const roots = new Set<string>();
    await list({ file: archive, onReadEntry: (entry) => roots.add(entry.path.split('/')[0]) });

    expect([...roots].sort()).toEqual(['ai-project-guide', 'other-root']);
  });

  it('writes a smaller truncated copy', async () => {
    const dir = tempDir();
    const archive = await buildGuideArchive({ dir });
    const truncated = truncateArchive(archive);

    expect(existsSync(truncated)).toBe(true);
    expect(statSync(truncated).size).toBeLessThan(statSync(archive).size);
  });
});
