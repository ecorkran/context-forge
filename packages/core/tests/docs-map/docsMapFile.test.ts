import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import { dirname, join } from 'path';
import { tmpdir } from 'os';
import { DocsMapError, docsMapPath, writeDocsMap } from '../../src/docs-map/index.js';
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

  describe('create', () => {
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
});
