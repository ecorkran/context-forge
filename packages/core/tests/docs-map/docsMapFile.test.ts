import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { chmod, mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'fs/promises';
import { dirname, join } from 'path';
import { tmpdir } from 'os';
import { DOCS_MAP_STATE, DocsMapError, compareDocsMap, docsMapPath, writeDocsMap } from '../../src/docs-map/index.js';
import { DOCS_MAP_BEGIN, DOCS_MAP_END } from '../../src/docs-map/docsMapFile.js';

const runningAsRoot = process.getuid?.() === 0;

describe('docs map file', () => {
  let root: string;

  async function put(relPath: string, content = '# T\n'): Promise<void> {
    await mkdir(dirname(join(root, relPath)), { recursive: true });
    await writeFile(join(root, relPath), content);
  }

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'cf-docsmap-file-'));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('docsMapPath is the canonical path for the project name', () => {
    expect(docsMapPath('/r', 'acme')).toBe('/r/project-documents/user/architecture/050-docs-map.acme.md');
  });

  it('docsMapPath rejects a project name with a path separator', () => {
    expect(() => docsMapPath('/r', 'a/b')).toThrow(DocsMapError);
    expect(() => docsMapPath('/r', 'a\\b')).toThrow(DocsMapError);
  });

  describe('create', () => {
    it('quotes a project name that would be invalid as a plain YAML scalar', async () => {
      const result = await writeDocsMap(root, 'acme: v2 #1');
      const text = await readFile(result.path, 'utf8');
      expect(text).toContain('project: "acme: v2 #1"\n');
      expect(text).toContain('# Docs Map: acme: v2 #1');
    });

    it('leaves an ordinary project name unquoted', async () => {
      const result = await writeDocsMap(root, 'my-app.v2');
      expect(await readFile(result.path, 'utf8')).toContain('project: my-app.v2\n');
    });

    it('writes frontmatter, heading, block and Additional Material', async () => {
      await put('README.md', '# Acme Service\n');
      await put('docs/adr/0001-x.md', '# 1. Record\n');
      const result = await writeDocsMap(root, 'acme');

      expect(result).toMatchObject({ status: 'created', adrs: 1, docs: 1, skippedSymlinks: [] });
      expect(result.path).toBe(docsMapPath(root, 'acme'));
      const text = await readFile(result.path, 'utf8');
      expect(text).toMatch(/^---\ndocType: reference\nproject: acme\ndateCreated: \d{8}\ndateUpdated: \d{8}\n---\n/);
      expect(text).toContain('# Docs Map: acme');
      expect(text).toContain(`${DOCS_MAP_BEGIN}\n## Architecture Decision Records\n`);
      expect(text).toContain('[Acme Service](../../../README.md)');
      expect(text).toContain(`${DOCS_MAP_END}\n\n## Additional Material\n`);
    });

    it('writes an empty project as one placeholder line', async () => {
      const result = await writeDocsMap(root, 'acme');
      expect(result).toMatchObject({ status: 'created', adrs: 0, docs: 0 });
      expect(await readFile(result.path, 'utf8')).toContain(`${DOCS_MAP_BEGIN}\nNo existing docs or ADRs were found.\n${DOCS_MAP_END}`);
    });

    it('reads a non-ASCII title back as valid UTF-8', async () => {
      await put('docs/adr/0001-x.md', '# Décision\n');
      const { path } = await writeDocsMap(root, 'acme');
      const bytes = await readFile(path);
      expect(new TextDecoder('utf-8', { fatal: true }).decode(bytes)).toContain('[Décision]');
    });

    it.skipIf(runningAsRoot)('throws DocsMapError with path and code when the write fails', async () => {
      await put('README.md');
      const dir = join(root, 'project-documents/user/architecture');
      await mkdir(dir, { recursive: true });
      await chmod(dir, 0o555);
      try {
        const failure = await writeDocsMap(root, 'acme').catch((e: unknown) => e);
        expect(failure).toBeInstanceOf(DocsMapError);
        expect((failure as DocsMapError).message).toContain('050-docs-map.acme.md');
        expect((failure as DocsMapError).message).toContain('EACCES');
      } finally {
        await chmod(dir, 0o755);
      }
    });
  });

  describe('update', () => {
    async function mapText(): Promise<string> {
      return readFile(docsMapPath(root, 'acme'), 'utf8');
    }

    async function mapBytes(): Promise<Buffer> {
      return readFile(docsMapPath(root, 'acme'));
    }

    async function writeMapBytes(content: string | Buffer): Promise<void> {
      await mkdir(dirname(docsMapPath(root, 'acme')), { recursive: true });
      await writeFile(docsMapPath(root, 'acme'), content);
    }

    /** Everything outside the BEGIN..END lines, markers included in neither half. */
    function outsideBlock(text: string): [string, string] {
      const begin = text.indexOf(DOCS_MAP_BEGIN);
      const end = text.indexOf(DOCS_MAP_END);
      return [text.slice(0, begin), text.slice(end)];
    }

    it('reports unchanged on a second run and leaves bytes and mtime alone', async () => {
      await put('README.md');
      await writeDocsMap(root, 'acme');
      const before = { bytes: await mapBytes(), mtime: (await stat(docsMapPath(root, 'acme'))).mtimeMs };
      const result = await writeDocsMap(root, 'acme');
      expect(result.status).toBe('unchanged');
      expect(await mapBytes()).toEqual(before.bytes);
      expect((await stat(docsMapPath(root, 'acme'))).mtimeMs).toBe(before.mtime);
    });

    it('adds a new entry and keeps every byte outside the block', async () => {
      await put('README.md');
      await writeDocsMap(root, 'acme');
      const edited = (await mapText())
        .replace(/dateUpdated: \d{8}/, 'dateUpdated: 19990101')
        .replace('# Docs Map: acme', 'Hand note above the heading\n\n# Docs Map: acme')
        .concat('- [Runbook](../../../ops/runbook.md)\n');
      await writeMapBytes(edited);

      await put('docs/adr/0002-use-postgres.md', '# 2. Use Postgres\n');
      const result = await writeDocsMap(root, 'acme');

      expect(result).toMatchObject({ status: 'updated', adrs: 1, docs: 1 });
      const after = await mapText();
      expect(after).toContain('[2. Use Postgres](../../../docs/adr/0002-use-postgres.md)');
      expect(outsideBlock(after)).toEqual(outsideBlock(edited));
      expect(after).toContain('dateUpdated: 19990101');
    });

    describe.each([
      ['missing END', `# M\n${DOCS_MAP_BEGIN}\nx\n`, 'unpaired'],
      ['missing BEGIN', `# M\nx\n${DOCS_MAP_END}\n`, 'unpaired'],
      ['duplicated BEGIN', `${DOCS_MAP_BEGIN}\n${DOCS_MAP_BEGIN}\n${DOCS_MAP_END}\n`, 'duplicated'],
      ['END before BEGIN', `${DOCS_MAP_END}\n${DOCS_MAP_BEGIN}\n`, 'before'],
      ['no block at all', '# M\n\nJust hand-written text.\n', 'found'],
    ])('%s', (_label, content, problem) => {
      it('fails naming the file and the problem, leaving the file byte-identical', async () => {
        await put('README.md');
        await writeMapBytes(content);
        const failure = await writeDocsMap(root, 'acme').catch((e: unknown) => e);
        expect(failure).toBeInstanceOf(DocsMapError);
        expect((failure as DocsMapError).message).toContain('050-docs-map.acme.md');
        expect((failure as DocsMapError).message).toContain(problem);
        expect((await mapBytes()).toString('utf8')).toBe(content);
      });
    });

    it('finds markers that carry trailing whitespace', async () => {
      await put('README.md');
      await writeMapBytes(`# M\n${DOCS_MAP_BEGIN}  \nstale\n${DOCS_MAP_END}\t\n`);
      const result = await writeDocsMap(root, 'acme');
      expect(result.status).toBe('updated');
      expect(await mapText()).toContain('[T](../../../README.md)');
    });

    it('never edits frontmatter, even when it is malformed or lacks dateUpdated', async () => {
      await put('README.md');
      const content = `---\ndocType: reference\n: broken [yaml\n---\n\n${DOCS_MAP_BEGIN}\nstale\n${DOCS_MAP_END}\n`;
      await writeMapBytes(content);
      const result = await writeDocsMap(root, 'acme');
      expect(result.status).toBe('updated');
      const after = await mapText();
      expect(after.startsWith('---\ndocType: reference\n: broken [yaml\n---\n')).toBe(true);
      expect(after).not.toContain('dateUpdated');
    });

    it('preserves CRLF and invalid-UTF-8 bytes outside the block and writes titles as UTF-8', async () => {
      await put('docs/adr/0001-x.md', '# Décision\n');
      const before = Buffer.concat([
        Buffer.from(`# Map\r\nraw byte: `, 'latin1'),
        Buffer.from([0xff]),
        Buffer.from(`\r\n${DOCS_MAP_BEGIN}\r\nstale\r\n${DOCS_MAP_END}\r\n## Additional Material\r\n`, 'latin1'),
      ]);
      await writeMapBytes(before);

      await writeDocsMap(root, 'acme');

      const after = await mapBytes();
      expect(after.includes(0xff)).toBe(true);
      expect(after.subarray(0, 20).toString('latin1')).toBe(before.subarray(0, 20).toString('latin1'));
      expect(after.toString('latin1')).toContain(`${DOCS_MAP_BEGIN}\r\n## Architecture Decision Records\r\n`);
      expect(after.toString('latin1').endsWith(`${DOCS_MAP_END}\r\n## Additional Material\r\n`)).toBe(true);
      expect(after.includes(Buffer.from('[Décision]', 'utf8'))).toBe(true);
    });

    it.skipIf(runningAsRoot)('leaves the map untouched when a candidate doc cannot be read', async () => {
      await put('README.md');
      await writeDocsMap(root, 'acme');
      const before = { bytes: await mapBytes(), mtime: (await stat(docsMapPath(root, 'acme'))).mtimeMs };
      await put('docs/locked.md');
      await chmod(join(root, 'docs/locked.md'), 0o000);
      try {
        const failure = await writeDocsMap(root, 'acme').catch((e: unknown) => e);
        expect(failure).toBeInstanceOf(DocsMapError);
        expect((failure as DocsMapError).message).toContain('docs/locked.md');
      } finally {
        await chmod(join(root, 'docs/locked.md'), 0o644);
      }
      expect(await mapBytes()).toEqual(before.bytes);
      expect((await stat(docsMapPath(root, 'acme'))).mtimeMs).toBe(before.mtime);
    });

    it.skipIf(runningAsRoot)('throws DocsMapError with path and code when the update write fails', async () => {
      await put('README.md');
      await writeDocsMap(root, 'acme');
      await put('docs/new.md');
      await chmod(docsMapPath(root, 'acme'), 0o444);
      try {
        const failure = await writeDocsMap(root, 'acme').catch((e: unknown) => e);
        expect(failure).toBeInstanceOf(DocsMapError);
        expect((failure as DocsMapError).message).toContain('050-docs-map.acme.md');
        expect((failure as DocsMapError).message).toContain('EACCES');
      } finally {
        await chmod(docsMapPath(root, 'acme'), 0o644);
      }
    });
  });

  describe('compareDocsMap (slice 274, D5)', () => {
    const NAME = 'acme';

    it('reports absent when there is no map file, and creates none', async () => {
      const result = await compareDocsMap(root, NAME);
      expect(result.state).toBe(DOCS_MAP_STATE.Absent);
      await expect(stat(docsMapPath(root, NAME))).rejects.toThrow();
    });

    it('reports current for a map that was just written', async () => {
      await writeDocsMap(root, NAME);
      expect((await compareDocsMap(root, NAME)).state).toBe(DOCS_MAP_STATE.Current);
    });

    it('reports out-of-date when a doc is added under docs/, and counts it', async () => {
      await writeDocsMap(root, NAME);
      await put('docs/guide.md');
      const result = await compareDocsMap(root, NAME);
      expect(result.state).toBe(DOCS_MAP_STATE.OutOfDate);
      expect(result.docs).toBe(1);
    });

    it('raises the same DocsMapError message as writeDocsMap for broken markers', async () => {
      const path = docsMapPath(root, NAME);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, `# M\n${DOCS_MAP_BEGIN}\nx\n`);
      const compareError = await compareDocsMap(root, NAME).catch((error: unknown) => error);
      const writeError = await writeDocsMap(root, NAME).catch((error: unknown) => error);
      expect(compareError).toBeInstanceOf(DocsMapError);
      expect((compareError as DocsMapError).message).toBe((writeError as DocsMapError).message);
    });

    it('writes nothing: bytes and mtime are unchanged for an out-of-date map', async () => {
      await writeDocsMap(root, NAME);
      await put('docs/guide.md');
      const path = docsMapPath(root, NAME);
      const before = { bytes: await readFile(path), mtime: (await stat(path)).mtimeMs };
      await compareDocsMap(root, NAME);
      expect(await readFile(path)).toEqual(before.bytes);
      expect((await stat(path)).mtimeMs).toBe(before.mtime);
    });
  });
});
