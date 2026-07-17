import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { parseFrontmatter } from '../../src/introspection/parsers/frontmatterParser.js';
import { normalizeVerdict } from '../../src/introspection/reviewGate.js';

const FIXTURES = join(__dirname, '..', 'fixtures', 'introspection');

describe('parseFrontmatter', () => {
  it('extracts all key-value pairs from valid frontmatter', async () => {
    const result = await parseFrontmatter(join(FIXTURES, 'valid-frontmatter.md'));
    expect(result.found).toBe(true);
    expect(result.data.status).toBe('in-progress');
    expect(result.data.dateCreated).toBe('20260215');
    expect(result.data.dateUpdated).toBe('20260228');
    expect(result.data.project).toBe('context-forge');
    expect(result.data.parent).toBe('user/architecture/160-slices.project-workflow-system.md');
  });

  it('returns found: false for file without frontmatter', async () => {
    const result = await parseFrontmatter(join(FIXTURES, 'no-frontmatter.md'));
    expect(result.found).toBe(false);
    expect(result.data).toEqual({});
  });

  it('strips surrounding quotes from values', async () => {
    const result = await parseFrontmatter(join(FIXTURES, 'quoted-values.md'));
    expect(result.found).toBe(true);
    expect(result.data.name).toBe('Context Forge');
    expect(result.data.template).toBe('default-template');
    expect(result.data.plain).toBe('no-quotes');
  });

  it('preserves full value after first colon', async () => {
    const result = await parseFrontmatter(join(FIXTURES, 'colon-in-value.md'));
    expect(result.found).toBe(true);
    expect(result.data.description).toBe('Phase 4: Slice Design');
    expect(result.data.url).toBe('https://example.com/path');
  });

  it('returns found: false for frontmatter with no closing delimiter', async () => {
    const result = await parseFrontmatter(join(FIXTURES, 'unterminated-frontmatter.md'));
    expect(result.found).toBe(false);
    expect(result.data).toEqual({});
  });

  it('returns found: false for nonexistent file (no throw)', async () => {
    const result = await parseFrontmatter('/nonexistent/path/file.md');
    expect(result.found).toBe(false);
    expect(result.data).toEqual({});
    expect(result.filePath).toBe('/nonexistent/path/file.md');
  });

  it('returns found: false for empty file', async () => {
    // Create a temporary empty file path — use a fixture that will be empty
    const { writeFile, unlink } = await import('node:fs/promises');
    const tmpPath = join(FIXTURES, '_empty-test-temp.md');
    await writeFile(tmpPath, '');
    try {
      const result = await parseFrontmatter(tmpPath);
      expect(result.found).toBe(false);
      expect(result.data).toEqual({});
    } finally {
      await unlink(tmpPath);
    }
  });

  it('includes the filePath in the result', async () => {
    const path = join(FIXTURES, 'valid-frontmatter.md');
    const result = await parseFrontmatter(path);
    expect(result.filePath).toBe(path);
  });

  it('does not let a nested findings[].verdict clobber the top-level verdict', async () => {
    const result = await parseFrontmatter(join(FIXTURES, 'nested-collision.md'));
    expect(result.found).toBe(true);
    expect(result.data.verdict).toBe('CONCERNS (resolved — see verifiedUpdate)');
    expect(normalizeVerdict(result.data.verdict)).toBe('CONCERNS');
  });

  it('skips colon-bearing lines inside a folded block scalar', async () => {
    const result = await parseFrontmatter(join(FIXTURES, 'folded-scalar-with-colon.md'));
    expect(result.found).toBe(true);
    expect(result.data.status).toBe('in-progress');
    expect(result.data.dateCreated).toBe('20260215');
    expect(Object.keys(result.data).sort()).toEqual(['dateCreated', 'note', 'status']);
  });
});
