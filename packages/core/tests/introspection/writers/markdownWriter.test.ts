import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { join } from 'node:path';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { updateCheckbox, updateFrontmatterField } from '../../../src/introspection/writers/markdownWriter.js';

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), 'mw-test-'));
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

async function writeTempFile(name: string, content: string): Promise<string> {
  const filePath = join(tmpDir, name);
  await writeFile(filePath, content, 'utf-8');
  return filePath;
}

describe('updateCheckbox', () => {
  it('checks an unchecked checkbox', async () => {
    const filePath = await writeTempFile('plan.md', '- [ ] Slice 165\n- [ ] Slice 166\n');
    const entry = await updateCheckbox(filePath, 0, true);

    const result = await readFile(filePath, 'utf-8');
    expect(result).toBe('- [x] Slice 165\n- [ ] Slice 166\n');
    expect(entry.before).toBe('[ ]');
    expect(entry.after).toBe('[x]');
    expect(entry.action).toBe('update-checkbox');
    expect(entry.filePath).toBe(filePath);
  });

  it('unchecks a checked checkbox', async () => {
    const filePath = await writeTempFile('plan.md', '- [x] Slice 165\n- [ ] Slice 166\n');
    const entry = await updateCheckbox(filePath, 0, false);

    const result = await readFile(filePath, 'utf-8');
    expect(result).toBe('- [ ] Slice 165\n- [ ] Slice 166\n');
    expect(entry.before).toBe('[x]');
    expect(entry.after).toBe('[ ]');
  });

  it('throws on line without checkbox', async () => {
    const filePath = await writeTempFile('plan.md', '# Title\n- Some item\n');
    await expect(updateCheckbox(filePath, 1, true)).rejects.toThrow('does not contain a checkbox');
  });

  it('preserves surrounding content', async () => {
    const content = '# Plan\n\n- [x] Done\n- [ ] Todo\n\n## Notes\nSome text here.\n';
    const filePath = await writeTempFile('plan.md', content);
    await updateCheckbox(filePath, 3, true);

    const result = await readFile(filePath, 'utf-8');
    expect(result).toBe('# Plan\n\n- [x] Done\n- [x] Todo\n\n## Notes\nSome text here.\n');
  });

  it('throws for out-of-range line index', async () => {
    const filePath = await writeTempFile('plan.md', '- [ ] Item\n');
    await expect(updateCheckbox(filePath, 99, true)).rejects.toThrow('out of range');
  });
});

describe('updateFrontmatterField', () => {
  it('updates an existing field value', async () => {
    const content = '---\nstatus: in-progress\nproject: test\n---\n# Content\n';
    const filePath = await writeTempFile('slice.md', content);
    const entry = await updateFrontmatterField(filePath, 'status', 'complete', '20260809');

    const result = await readFile(filePath, 'utf-8');
    expect(result).toBe('---\nstatus: complete\nproject: test\ndateUpdated: 20260809\n---\n# Content\n');
    expect(entry.before).toBe('in-progress');
    expect(entry.after).toBe('complete');
    expect(entry.field).toBe('status');
    expect(entry.action).toBe('update-frontmatter');
  });

  it('handles quoted values', async () => {
    const content = '---\nname: "My Project"\nstatus: in-progress\n---\n';
    const filePath = await writeTempFile('slice.md', content);
    const entry = await updateFrontmatterField(filePath, 'name', 'New Name', '20260809');

    const result = await readFile(filePath, 'utf-8');
    expect(result).toBe('---\nname: New Name\nstatus: in-progress\ndateUpdated: 20260809\n---\n');
    expect(entry.before).toBe('My Project');
    expect(entry.after).toBe('New Name');
  });

  it('throws when frontmatter is missing', async () => {
    const content = '# No frontmatter here\nJust content.\n';
    const filePath = await writeTempFile('doc.md', content);
    await expect(updateFrontmatterField(filePath, 'status', 'complete', '20260809')).rejects.toThrow(
      'does not contain YAML frontmatter'
    );
  });

  it('inserts new key when not found in frontmatter', async () => {
    const content = '---\nproject: test\n---\n# Content\n';
    const filePath = await writeTempFile('slice.md', content);
    const entry = await updateFrontmatterField(filePath, 'status', 'in-progress', '20260809');

    const result = await readFile(filePath, 'utf-8');
    expect(result).toBe('---\nproject: test\nstatus: in-progress\ndateUpdated: 20260809\n---\n# Content\n');
    expect(entry.before).toBe('');
    expect(entry.after).toBe('in-progress');
    expect(entry.field).toBe('status');
  });

  it('preserves rest of file', async () => {
    const content = '---\nstatus: in-progress\nproject: test\n---\n\n# Title\n\nParagraph one.\n\nParagraph two.\n';
    const filePath = await writeTempFile('slice.md', content);
    await updateFrontmatterField(filePath, 'status', 'complete', '20260809');

    const result = await readFile(filePath, 'utf-8');
    expect(result).toBe(
      '---\nstatus: complete\nproject: test\ndateUpdated: 20260809\n---\n\n# Title\n\nParagraph one.\n\nParagraph two.\n'
    );
  });

  it('throws when frontmatter is not closed', async () => {
    const content = '---\nstatus: in-progress\nproject: test\n';
    const filePath = await writeTempFile('broken.md', content);
    await expect(updateFrontmatterField(filePath, 'status', 'complete', '20260809')).rejects.toThrow(
      'not closed'
    );
  });

  it('replaces an existing dateUpdated line with the stamp', async () => {
    const content = '---\nstatus: in-progress\ndateUpdated: 20260101\n---\n';
    const filePath = await writeTempFile('slice.md', content);
    await updateFrontmatterField(filePath, 'status', 'complete', '20260809');

    const result = await readFile(filePath, 'utf-8');
    expect(result).toBe('---\nstatus: complete\ndateUpdated: 20260809\n---\n');
  });

  it('inserts dateUpdated when the field is absent', async () => {
    const content = '---\nstatus: in-progress\n---\n';
    const filePath = await writeTempFile('slice.md', content);
    await updateFrontmatterField(filePath, 'status', 'complete', '20260809');

    const result = await readFile(filePath, 'utf-8');
    expect(result).toBe('---\nstatus: complete\ndateUpdated: 20260809\n---\n');
  });

  it('writes the caller value when key is dateUpdated, without a second stamp write', async () => {
    const content = '---\nstatus: in-progress\ndateCreated: 20250101\n---\n';
    const filePath = await writeTempFile('slice.md', content);
    const entry = await updateFrontmatterField(filePath, 'dateUpdated', '20250101', '20260809');

    const result = await readFile(filePath, 'utf-8');
    expect(result).toBe('---\nstatus: in-progress\ndateCreated: 20250101\ndateUpdated: 20250101\n---\n');
    expect(entry.field).toBe('dateUpdated');
    expect(entry.after).toBe('20250101');
  });

  it('stamps dateUpdated even when dateCreated is absent', async () => {
    const content = '---\nstatus: in-progress\n---\n';
    const filePath = await writeTempFile('slice.md', content);
    await updateFrontmatterField(filePath, 'status', 'complete', '20260809');

    const result = await readFile(filePath, 'utf-8');
    expect(result).toContain('dateUpdated: 20260809');
  });

  it('reports the primary field before/after unchanged by the stamp', async () => {
    const content = '---\nstatus: in-progress\nproject: test\n---\n';
    const filePath = await writeTempFile('slice.md', content);
    const entry = await updateFrontmatterField(filePath, 'status', 'complete', '20260809');

    expect(entry.field).toBe('status');
    expect(entry.before).toBe('in-progress');
    expect(entry.after).toBe('complete');
  });
});
