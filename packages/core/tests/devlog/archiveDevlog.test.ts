import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { chmod, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  DEVLOG_ARCHIVE_DIR,
  DEVLOG_FILE,
  archiveDevlog,
  archiveRelPath,
  type ArchiveDevlogOptions,
} from '../../src/devlog/archiveDevlog.js';
import { SQUADRON_ARCHIVE_EXCERPT } from '../fixtures/devlog.js';

const PREAMBLE = '# Development Log\n\nNewest entries first.\n\n---\n\n';
const section = (date: string, body: string): string => `## ${date}\n\n${body}\n\n`;
const BIG = 'x'.repeat(300);

const THREE_SECTIONS = PREAMBLE + section('20260301', BIG) + section('20251101', BIG) + section('20250701', BIG);

let dir: string;
const devlogPath = (): string => join(dir, DEVLOG_FILE);
const archiveDir = (): string => join(dir, DEVLOG_ARCHIVE_DIR);

function options(overrides: Partial<ArchiveDevlogOptions> = {}): ArchiveDevlogOptions {
  return {
    checkoutPath: dir,
    maxBytes: 600,
    targetBytes: 450,
    projectName: 'demo',
    today: '20261105',
    dryRun: false,
    ...overrides,
  };
}

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'archive-devlog-'));
});

afterEach(async () => {
  await chmod(archiveDir(), 0o755).catch(() => undefined);
  await rm(dir, { recursive: true, force: true });
});

describe('archiveDevlog', () => {
  it('changes nothing at or under the limit', async () => {
    await writeFile(devlogPath(), THREE_SECTIONS);
    const size = (await stat(devlogPath())).size;
    const result = await archiveDevlog(options({ maxBytes: size, targetBytes: size - 1 }));
    expect(result).toEqual({ status: 'within-limit', sizeBytes: size });
    expect(await readFile(devlogPath(), 'utf8')).toBe(THREE_SECTIONS);
    await expect(readdir(archiveDir())).rejects.toThrow();
  });

  it('creates new archives with valid frontmatter and trims DEVLOG.md to the target', async () => {
    await writeFile(devlogPath(), THREE_SECTIONS);
    const result = await archiveDevlog(options());
    expect(result).toMatchObject({ status: 'archived', movedCount: 2 });
    expect(Buffer.byteLength(await readFile(devlogPath(), 'utf8'))).toBeLessThanOrEqual(450);
    const q4 = await readFile(join(dir, archiveRelPath('2025-Q4')), 'utf8');
    expect(
      q4.startsWith('---\ndocType: devlog\nproject: demo\ndateCreated: 20261105\ndateUpdated: 20261105\n---\n'),
    ).toBe(true);
    expect(q4).toContain('# Development Log Archive: 2025 Q4');
    expect(q4).toContain('## 20251101');
    expect(await readFile(join(dir, archiveRelPath('2025-Q3')), 'utf8')).toContain('## 20250701');
  });

  it('prepends into a squadron-format archive, leaving preamble and old sections unchanged', async () => {
    await mkdir(archiveDir(), { recursive: true });
    await writeFile(join(dir, archiveRelPath('2026-Q3')), SQUADRON_ARCHIVE_EXCERPT);
    await writeFile(
      devlogPath(),
      PREAMBLE + section('20261001', BIG) + section('20260801', 'moved me') + section('20260715', BIG),
    );
    await archiveDevlog(options({ maxBytes: 500, targetBytes: 420 }));
    const merged = await readFile(join(dir, archiveRelPath('2026-Q3')), 'utf8');
    const oldNewest = merged.indexOf('## 20260930');
    expect(merged.indexOf('## 20260801')).toBeLessThan(oldNewest);
    expect(merged.slice(0, SQUADRON_ARCHIVE_EXCERPT.indexOf('## 20260930'))).toBe(
      SQUADRON_ARCHIVE_EXCERPT.slice(0, SQUADRON_ARCHIVE_EXCERPT.indexOf('## 20260930')),
    );
    expect(merged.endsWith(SQUADRON_ARCHIVE_EXCERPT.slice(SQUADRON_ARCHIVE_EXCERPT.indexOf('## 20260930')))).toBe(true);
  });

  it('appends to an archive that has no dated heading', async () => {
    await mkdir(archiveDir(), { recursive: true });
    await writeFile(join(dir, archiveRelPath('2025-Q4')), '# Notes only');
    await writeFile(devlogPath(), THREE_SECTIONS);
    await archiveDevlog(options());
    const q4 = await readFile(join(dir, archiveRelPath('2025-Q4')), 'utf8');
    expect(q4.startsWith('# Notes only\n## 20251101')).toBe(true);
  });

  it('writes nothing on dry-run', async () => {
    await writeFile(devlogPath(), THREE_SECTIONS);
    const result = await archiveDevlog(options({ dryRun: true }));
    expect(result).toMatchObject({ status: 'dry-run', movedCount: 2 });
    expect(await readFile(devlogPath(), 'utf8')).toBe(THREE_SECTIONS);
    await expect(readdir(archiveDir())).rejects.toThrow();
  });

  it('names the expected path when DEVLOG.md is missing', async () => {
    await expect(archiveDevlog(options())).rejects.toThrow(devlogPath());
  });

  it('rejects target >= max naming both keys', async () => {
    await expect(archiveDevlog(options({ maxBytes: 100, targetBytes: 100 }))).rejects.toThrow(
      /devlog\.target_bytes.*devlog\.max_bytes/,
    );
  });

  it('reports nothing-movable for one huge section', async () => {
    await writeFile(devlogPath(), PREAMBLE + section('20260301', 'z'.repeat(2000)));
    expect(await archiveDevlog(options())).toMatchObject({
      status: 'nothing-movable',
      reason: 'newest-exceeds-target',
    });
  });

  it('fails before any write on a non-UTF-8 archive, naming it', async () => {
    await mkdir(archiveDir(), { recursive: true });
    const badPath = join(dir, archiveRelPath('2025-Q3'));
    await writeFile(badPath, Buffer.from([0x23, 0xff, 0xfe, 0x0a]));
    await writeFile(devlogPath(), THREE_SECTIONS);
    await expect(archiveDevlog(options())).rejects.toThrow(badPath);
    expect(await readFile(devlogPath(), 'utf8')).toBe(THREE_SECTIONS);
    expect(await readdir(archiveDir())).toEqual(['DEVLOG-2025-Q3.md']);
  });

  it('fails on a concurrent DEVLOG.md edit, keeps the new entry, and a re-run does not duplicate', async () => {
    await writeFile(devlogPath(), THREE_SECTIONS);
    const edited = section('20260302', 'late entry') + THREE_SECTIONS.slice(PREAMBLE.length);
    const concurrent = PREAMBLE + edited;
    const failing = archiveDevlog(options(), { beforeFinalWrite: () => writeFile(devlogPath(), concurrent) });
    await expect(failing).rejects.toThrow(/changed during the run.*DEVLOG-2025-Q4\.md/s);
    expect(await readFile(devlogPath(), 'utf8')).toBe(concurrent);

    await archiveDevlog(options());
    const kept = await readFile(devlogPath(), 'utf8');
    expect(kept).toContain('late entry');
    expect(Buffer.byteLength(kept)).toBeLessThanOrEqual(450);
    const q4 = await readFile(join(dir, archiveRelPath('2025-Q4')), 'utf8');
    expect(q4.split('## 20251101').length - 1).toBe(1);
    const q3 = await readFile(join(dir, archiveRelPath('2025-Q3')), 'utf8');
    expect(q3.split('## 20250701').length - 1).toBe(1);
  });

  // File modes do not stop root, so the EACCES this test relies on never happens there.
  it.skipIf(process.getuid?.() === 0)('names the path, cause and files already written when a write fails', async () => {
    await mkdir(archiveDir(), { recursive: true });
    const lockedPath = join(dir, archiveRelPath('2025-Q3'));
    await writeFile(lockedPath, '# Locked\n');
    await chmod(lockedPath, 0o444);
    await writeFile(devlogPath(), THREE_SECTIONS);
    await expect(archiveDevlog(options())).rejects.toThrow(/EACCES.*Already written: .*DEVLOG-2025-Q4\.md/s);
    expect(await readFile(devlogPath(), 'utf8')).toBe(THREE_SECTIONS);
  });
});
