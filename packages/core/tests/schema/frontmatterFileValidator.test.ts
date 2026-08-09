import { join } from 'node:path';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { validateFrontmatterFiles } from '../../src/schema/frontmatterFileValidator.js';

let tmpDir: string;
let projectPath: string;
let userDir: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), 'fmfv-test-'));
  projectPath = tmpDir;
  userDir = join(projectPath, 'project-documents', 'user');
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

async function writeDoc(relDir: string, name: string, content: string): Promise<string> {
  const dir = join(userDir, relDir);
  await mkdir(dir, { recursive: true });
  const filePath = join(dir, name);
  await writeFile(filePath, content, 'utf-8');
  return filePath;
}

const VALID_SLICE = '---\ndocType: slice-design\nslice: test\nproject: test-project\nstatus: complete\ndateCreated: 20260101\ndateUpdated: 20260102\n---\n\n# Test\n';
const INVALID_STATUS_SLICE = '---\ndocType: slice-design\nslice: bad\nproject: test-project\nstatus: in-progress\ndateCreated: 20260101\ndateUpdated: 20260102\n---\n\n# Bad\n';
const NO_FRONTMATTER = '# No frontmatter\nJust content.\n';

describe('validateFrontmatterFiles', () => {
  it('no-paths walk finds documents across multiple scan dirs', async () => {
    await writeDoc('slices', '900-slice.a.md', VALID_SLICE);
    await writeDoc('tasks', '900-tasks.a.md', VALID_SLICE.replace('slice-design', 'tasks'));
    await writeDoc('architecture', '900-arch.a.md', VALID_SLICE.replace('slice-design', 'architecture'));

    const result = await validateFrontmatterFiles(projectPath);
    expect(result.filesChecked).toBe(3);
  });

  it('validates an explicit in-root .md path', async () => {
    const filePath = await writeDoc('slices', '901-slice.b.md', VALID_SLICE);

    const result = await validateFrontmatterFiles(projectPath, [filePath]);
    expect(result.filesChecked).toBe(1);
  });

  it('silently skips an out-of-root .md path', async () => {
    const outsidePath = join(tmpDir, 'outside.md');
    await writeFile(outsidePath, VALID_SLICE, 'utf-8');

    const result = await validateFrontmatterFiles(projectPath, [outsidePath]);
    expect(result.filesChecked).toBe(0);
    expect(result.findings).toHaveLength(0);
  });

  it('silently skips a non-.md path', async () => {
    const tsPath = join(tmpDir, 'file.ts');
    await writeFile(tsPath, 'export const x = 1;\n', 'utf-8');

    const result = await validateFrontmatterFiles(projectPath, [tsPath]);
    expect(result.filesChecked).toBe(0);
    expect(result.findings).toHaveLength(0);
  });

  it('silently skips a nonexistent path with no error', async () => {
    const missingPath = join(userDir, 'slices', 'does-not-exist.md');

    const result = await validateFrontmatterFiles(projectPath, [missingPath]);
    expect(result.filesChecked).toBe(0);
    expect(result.findings).toHaveLength(0);
  });

  it('a mixed list of all four kinds validates exactly the valid ones', async () => {
    const inRoot = await writeDoc('slices', '902-slice.c.md', VALID_SLICE);
    const outOfRoot = join(tmpDir, 'outside2.md');
    await writeFile(outOfRoot, VALID_SLICE, 'utf-8');
    const nonMd = join(tmpDir, 'notes.txt');
    await writeFile(nonMd, 'hi', 'utf-8');
    const missing = join(userDir, 'slices', 'missing.md');

    const result = await validateFrontmatterFiles(projectPath, [inRoot, outOfRoot, nonMd, missing]);
    expect(result.filesChecked).toBe(1);
  });

  it('skips a file with no frontmatter and does not count it', async () => {
    await writeDoc('slices', '903-slice.d.md', NO_FRONTMATTER);

    const result = await validateFrontmatterFiles(projectPath);
    expect(result.filesChecked).toBe(0);
  });

  it('validates an explicitly named file outside the scan dirs but inside the document root', async () => {
    const filePath = await writeDoc('notes', 'scratch.md', VALID_SLICE);

    const result = await validateFrontmatterFiles(projectPath, [filePath]);
    expect(result.filesChecked).toBe(1);
  });

  it('produces a finding with a fixAction for an invalid status value', async () => {
    await writeDoc('slices', '904-slice.e.md', INVALID_STATUS_SLICE);

    const result = await validateFrontmatterFiles(projectPath);
    const statusFinding = result.findings.find(
      (f) => f.fixAction?.field === 'status'
    );
    expect(statusFinding).toBeDefined();
    expect(statusFinding!.fixAction!.value).toBe('in_progress');
  });
});
