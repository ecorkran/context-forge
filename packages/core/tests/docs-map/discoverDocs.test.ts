import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { chmod, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'fs/promises';
import { dirname, join } from 'path';
import { tmpdir } from 'os';
import { discoverMappedDocs } from '../../src/docs-map/discoverDocs.js';
import { DocsMapError } from '../../src/docs-map/docsMapError.js';
import { ADR_DIRS, DOC_PATHS } from '../../src/detection/presentPaths.js';
import { EXCLUDED_DIRS } from '../../src/detection/sourceVolume.js';

// readFile is wrapped so single tests can make one path fail; it defaults to the real thing.
vi.mock('fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs/promises')>();
  return { ...actual, readFile: vi.fn(actual.readFile) };
});

const actualFs = await vi.importActual<typeof import('fs/promises')>('fs/promises');
const runningAsRoot = process.getuid?.() === 0;

describe('discoverMappedDocs', () => {
  let root: string;

  async function put(relPath: string, content = '# T\n'): Promise<void> {
    await mkdir(dirname(join(root, relPath)), { recursive: true });
    await writeFile(join(root, relPath), content);
  }

  async function discover(): Promise<Record<string, { kind: string; title: string }>> {
    const { docs } = await discoverMappedDocs(root);
    return Object.fromEntries(docs.map((d) => [d.path, { kind: d.kind, title: d.title }]));
  }

  /** Make readFile fail with `code` for paths ending in `suffix`; other reads go to the real one. */
  function failReadFor(suffix: string, code: string): void {
    // The cast is test-only: readFile is overloaded and the wrapper forwards its arguments untouched.
    vi.mocked(readFile).mockImplementation(((path: string, ...rest: unknown[]) => {
      if (String(path).endsWith(suffix)) {
        return Promise.reject(Object.assign(new Error(code), { code }));
      }
      return (actualFs.readFile as (...args: unknown[]) => Promise<unknown>)(path, ...rest);
    }) as typeof readFile);
  }

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'cf-docsmap-'));
  });

  afterEach(async () => {
    vi.mocked(readFile).mockImplementation(actualFs.readFile);
    await rm(root, { recursive: true, force: true });
  });

  it('returns nothing for an empty project', async () => {
    expect(await discoverMappedDocs(root)).toEqual({ docs: [], skippedSymlinks: [] });
  });

  describe.each(ADR_DIRS.map((dir) => [dir]))('ADR dir %s', (dir) => {
    it('is discovered as adr', async () => {
      await put(`${dir}/0001-x.md`);
      expect(await discover()).toEqual({ [`${dir}/0001-x.md`]: { kind: 'adr', title: 'T' } });
    });
  });

  describe.each(DOC_PATHS.map((path) => [path]))('doc path %s', (candidate) => {
    it('is discovered as doc', async () => {
      if (candidate.includes('.') || candidate === 'README') await put(candidate);
      else await put(`${candidate}/guide.md`);
      const found = await discover();
      const expected = candidate.includes('.') || candidate === 'README' ? candidate : `${candidate}/guide.md`;
      expect(found).toEqual({ [expected]: { kind: 'doc', title: 'T' } });
    });
  });

  it('recurses into nested directories and lists docs/adr files once, as adr', async () => {
    await put('docs/a/b/deep.md');
    await put('docs/adr/0001-x.md');
    const found = await discover();
    expect(Object.keys(found).sort()).toEqual(['docs/a/b/deep.md', 'docs/adr/0001-x.md']);
    expect(found['docs/adr/0001-x.md'].kind).toBe('adr');
    expect(found['docs/a/b/deep.md'].kind).toBe('doc');
  });

  it('does not walk dot directories or EXCLUDED_DIRS', async () => {
    await put('docs/.vitepress/cache.md');
    await put('docs/.git/x.md');
    for (const dir of EXCLUDED_DIRS) await put(`docs/${dir}/x.md`);
    await put('docs/keep.md');
    expect(Object.keys(await discover())).toEqual(['docs/keep.md']);
  });

  it('does not follow symlinks, collects them, and survives a loop', async () => {
    await put('docs/real.md');
    await put('outside/secret.md');
    await symlink(join(root, 'outside'), join(root, 'docs/vendor-docs'));
    await symlink(join(root, 'outside/secret.md'), join(root, 'docs/linked.md'));
    await symlink(join(root, 'docs'), join(root, 'docs/loop'));
    const result = await discoverMappedDocs(root);
    expect(result.docs.map((d) => d.path)).toEqual(['docs/real.md']);
    expect(result.skippedSymlinks).toEqual(['docs/linked.md', 'docs/loop', 'docs/vendor-docs']);
  });

  it('matches extensions case-insensitively and only maps Markdown', async () => {
    await put('docs/upper.MD');
    await put('docs/notes.rst');
    await put('docs/notes.txt');
    expect(Object.keys(await discover())).toEqual(['docs/upper.MD']);
  });

  it.skipIf(runningAsRoot)('throws DocsMapError naming the path on a non-ENOENT walk error', async () => {
    await put('docs/locked/x.md');
    await chmod(join(root, 'docs/locked'), 0o000);
    try {
      await expect(discoverMappedDocs(root)).rejects.toThrow(/docs\/locked.*EACCES|EACCES.*docs\/locked/);
      await expect(discoverMappedDocs(root)).rejects.toBeInstanceOf(DocsMapError);
    } finally {
      await chmod(join(root, 'docs/locked'), 0o755);
    }
  });

  describe('titles', () => {
    async function titleOf(content: string): Promise<string> {
      await put('docs/t.md', content);
      return (await discover())['docs/t.md'].title;
    }

    it('reads a plain H1', async () => {
      expect(await titleOf('# Plain\n\ntext\n')).toBe('Plain');
    });

    it('skips frontmatter, including a # comment line inside it', async () => {
      expect(await titleOf('---\n# not a heading\nstatus: accepted\n---\n\n# Real\n')).toBe('Real');
    });

    it('strips trailing hashes and surrounding whitespace', async () => {
      expect(await titleOf('#   Title ##  \n')).toBe('Title');
    });

    it('keeps a hash that is part of the text', async () => {
      expect(await titleOf('# Learning C#\n')).toBe('Learning C#');
    });

    it('accepts an indented H1 and CRLF endings', async () => {
      expect(await titleOf('  # Indented\r\n')).toBe('Indented');
    });

    it('does not take a level-2 heading', async () => {
      expect(await titleOf('## Second\n')).toBe('t.md');
    });

    it('falls back to the filename when there is no heading', async () => {
      expect(await titleOf('just text\n')).toBe('t.md');
    });

    it('falls back to the filename when frontmatter never closes', async () => {
      expect(await titleOf('---\ntitle: x\n# Heading\n')).toBe('t.md');
    });

    it('finds the H1 on line 3 of a README that starts with a badge', async () => {
      await put('README.md', '[![build](https://img.shields.io/x.svg)](https://ci)\n\n# Acme Service\n');
      expect((await discover())['README.md'].title).toBe('Acme Service');
    });

    it('reads a Nygard-style ADR', async () => {
      await put('docs/adr/0001-record.md', '# 1. Record architecture decisions\n\nDate: 2026-01-01\n\n## Status\n\nAccepted\n');
      expect((await discover())['docs/adr/0001-record.md'].title).toBe('1. Record architecture decisions');
    });

    it('reads a MADR-style ADR with frontmatter', async () => {
      await put(
        'docs/decisions/0002-use-postgres.md',
        '---\nstatus: accepted\ndate: 2026-01-01\n---\n\n# Use Postgres\n\n## Context and Problem Statement\n',
      );
      expect((await discover())['docs/decisions/0002-use-postgres.md'].title).toBe('Use Postgres');
    });
  });

  describe('read failures', () => {
    it('drops an entry whose file vanished between the walk and the read', async () => {
      await put('docs/gone.md');
      await put('docs/kept.md');
      failReadFor('gone.md', 'ENOENT');
      expect(Object.keys(await discover())).toEqual(['docs/kept.md']);
    });

    it('throws DocsMapError naming the file on any other read error', async () => {
      await put('docs/locked.md');
      failReadFor('locked.md', 'EACCES');
      const failure = await discoverMappedDocs(root).catch((e: unknown) => e);
      expect(failure).toBeInstanceOf(DocsMapError);
      expect((failure as DocsMapError).message).toContain('docs/locked.md');
      expect((failure as DocsMapError).message).toContain('EACCES');
    });
  });
});
