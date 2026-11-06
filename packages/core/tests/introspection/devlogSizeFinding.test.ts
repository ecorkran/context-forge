import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { archiveRelPath } from '../../src/devlog/archiveDevlog.js';
import { NO_MOVE_REASON, NO_MOVE_REASON_TEXT } from '../../src/devlog/planDevlogArchive.js';
import { buildDevlogSizeFinding } from '../../src/introspection/devlogSizeFinding.js';

const section = (date: string, body: string): string => `## ${date}\n\n${body}\n\n`;
const BIG = 'x'.repeat(300);
const DEVLOG = '# Development Log\n\n' + section('20260301', BIG) + section('20251101', BIG) + section('20250701', BIG);

let dir: string;
const devlogPath = (): string => join(dir, 'DEVLOG.md');
const input = (overrides = {}) => ({
  checkoutPath: dir,
  projectName: 'demo',
  maxBytes: 600,
  targetBytes: 450,
  ...overrides,
});

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'devlog-finding-'));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('buildDevlogSizeFinding', () => {
  it('returns nothing when DEVLOG.md is missing', async () => {
    expect(await buildDevlogSizeFinding(input())).toBeNull();
  });

  it('returns nothing at and under the limit', async () => {
    await writeFile(devlogPath(), DEVLOG);
    const size = (await stat(devlogPath())).size;
    expect(await buildDevlogSizeFinding(input({ maxBytes: size, targetBytes: 10 }))).toBeNull();
    expect(await buildDevlogSizeFinding(input({ maxBytes: size + 1, targetBytes: 10 }))).toBeNull();
  });

  it('gives a fixable warning with the exact description and additionalPaths', async () => {
    await writeFile(devlogPath(), DEVLOG);
    const size = (await stat(devlogPath())).size;
    const finding = await buildDevlogSizeFinding(input());
    expect(finding).toEqual({
      rule: 'devlog-size',
      severity: 'warning',
      location: devlogPath(),
      description: `DEVLOG.md is ${size} bytes, over devlog.max_bytes (600)`,
      suggestedFix: 'Run cf check --fix, or cf devlog archive',
      fixable: true,
      fixAction: {
        type: 'archive-devlog',
        filePath: devlogPath(),
        additionalPaths: [join(dir, archiveRelPath('2025-Q4')), join(dir, archiveRelPath('2025-Q3'))],
        detail: { targetBytes: 450, projectName: 'demo' },
        subjectIndex: null,
      },
    });
  });

  it('gives the D5 non-fixable warning for a single huge section', async () => {
    await writeFile(devlogPath(), '# L\n\n' + section('20260301', 'z'.repeat(2000)));
    const finding = await buildDevlogSizeFinding(input());
    expect(finding).toMatchObject({ severity: 'warning', fixable: false });
    expect(finding?.suggestedFix).toBe(NO_MOVE_REASON_TEXT[NO_MOVE_REASON.NewestExceedsTarget]);
    expect(finding?.fixAction).toBeUndefined();
  });

  it('gives the D3 non-fixable warning when there are no dated headings', async () => {
    await writeFile(devlogPath(), '# L\n\n## Notes\n\n' + 'y'.repeat(2000));
    const finding = await buildDevlogSizeFinding(input());
    expect(finding).toMatchObject({ severity: 'warning', fixable: false });
    expect(finding?.suggestedFix).toBe(NO_MOVE_REASON_TEXT[NO_MOVE_REASON.NoDatedHeadings]);
  });

  it('gives an error finding for target >= max', async () => {
    await writeFile(devlogPath(), DEVLOG);
    const finding = await buildDevlogSizeFinding(input({ maxBytes: 600, targetBytes: 600 }));
    expect(finding).toMatchObject({ severity: 'error', fixable: false });
    expect(finding?.description).toMatch(/devlog\.target_bytes.*devlog\.max_bytes/);
  });

  it('gives an error finding for a non-ENOENT stat error', async () => {
    const filePath = join(dir, 'a-file');
    await writeFile(filePath, 'not a directory');
    const finding = await buildDevlogSizeFinding(input({ checkoutPath: filePath }));
    expect(finding).toMatchObject({ severity: 'error', fixable: false });
    expect(finding?.description).toContain('Cannot stat');
  });

  it('gives an error finding naming a non-UTF-8 archive', async () => {
    await mkdir(join(dir, 'project-documents/user/archive/devlog'), { recursive: true });
    const badPath = join(dir, archiveRelPath('2025-Q3'));
    await writeFile(badPath, Buffer.from([0x23, 0xff, 0xfe]));
    await writeFile(devlogPath(), DEVLOG);
    const finding = await buildDevlogSizeFinding(input());
    expect(finding).toMatchObject({ severity: 'error', fixable: false });
    expect(finding?.description).toContain(badPath);
  });
});
