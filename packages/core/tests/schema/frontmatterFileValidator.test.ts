import { join, resolve } from 'node:path';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  validateFrontmatterFiles,
  PathOutcome,
} from '../../src/schema/frontmatterFileValidator.js';

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

describe('validateFrontmatterFiles per-path outcomes (#92/#96)', () => {
  it('reports a validated path as checked', async () => {
    const filePath = await writeDoc('slices', '910-slice.ok.md', VALID_SLICE);

    const result = await validateFrontmatterFiles(projectPath, [filePath]);

    expect(result.pathResults).toEqual([
      { inputPath: filePath, resolvedPath: filePath, outcome: PathOutcome.Checked },
    ]);
    expect(result.filesChecked).toBe(1);
  });

  it('reports an out-of-root path as skipped-out-of-scope', async () => {
    const outside = join(tmpDir, 'CHANGELOG.md');
    await writeFile(outside, VALID_SLICE, 'utf-8');

    const result = await validateFrontmatterFiles(projectPath, [outside]);

    expect(result.pathResults?.[0].outcome).toBe(PathOutcome.SkippedOutOfScope);
    expect(result.filesChecked).toBe(0);
  });

  it('reports a non-markdown path as skipped-not-markdown', async () => {
    const result = await validateFrontmatterFiles(projectPath, [join(userDir, 'slices/x.txt')]);

    expect(result.pathResults?.[0].outcome).toBe(PathOutcome.SkippedNotMarkdown);
    expect(result.filesChecked).toBe(0);
  });

  it('reports a nonexistent path as skipped-not-found', async () => {
    // A staged-file list legitimately contains deletions.
    const deleted = join(userDir, 'slices', '911-slice.deleted.md');
    await mkdir(join(userDir, 'slices'), { recursive: true });

    const result = await validateFrontmatterFiles(projectPath, [deleted]);

    expect(result.pathResults?.[0].outcome).toBe(PathOutcome.SkippedNotFound);
    expect(result.filesChecked).toBe(0);
  });

  it('reports a file without frontmatter as skipped-no-frontmatter', async () => {
    const filePath = await writeDoc('slices', '912-slice.bare.md', NO_FRONTMATTER);

    const result = await validateFrontmatterFiles(projectPath, [filePath]);

    expect(result.pathResults?.[0].outcome).toBe(PathOutcome.SkippedNoFrontmatter);
    expect(result.filesChecked).toBe(0);
  });

  it('counts only checked entries in filesChecked', async () => {
    const good = await writeDoc('slices', '913-slice.good.md', VALID_SLICE);
    const bare = await writeDoc('slices', '914-slice.bare.md', NO_FRONTMATTER);
    const outside = join(tmpDir, 'OUTSIDE.md');
    await writeFile(outside, VALID_SLICE, 'utf-8');

    const result = await validateFrontmatterFiles(projectPath, [
      good,
      bare,
      outside,
      join(userDir, 'slices/missing.md'),
      join(userDir, 'slices/notes.txt'),
    ]);

    const checked = result.pathResults!.filter((r) => r.outcome === PathOutcome.Checked);
    expect(checked).toHaveLength(1);
    expect(result.filesChecked).toBe(checked.length);
    expect(result.pathResults!.map((r) => r.outcome)).toEqual([
      PathOutcome.Checked,
      PathOutcome.SkippedNoFrontmatter,
      PathOutcome.SkippedOutOfScope,
      PathOutcome.SkippedNotFound,
      PathOutcome.SkippedNotMarkdown,
    ]);
  });

  it('still validates an in-scope file when paired with an out-of-scope one (#92)', async () => {
    const inScope = await writeDoc('slices', '915-slice.bad.md', INVALID_STATUS_SLICE);
    const outside = join(tmpDir, 'README.md');
    await writeFile(outside, VALID_SLICE, 'utf-8');

    const result = await validateFrontmatterFiles(projectPath, [outside, inScope]);

    // The pairing does not suppress the in-scope file's findings.
    expect(result.filesChecked).toBe(1);
    expect(result.findings.some((f) => f.fixAction?.field === 'status')).toBe(true);
  });

  it('preserves caller order and echoes the input path verbatim', async () => {
    const filePath = await writeDoc('slices', '916-slice.rel.md', VALID_SLICE);
    const relative = './does-not-exist.md';

    const result = await validateFrontmatterFiles(projectPath, [relative, filePath]);

    expect(result.pathResults?.[0].inputPath).toBe(relative);
    // Relative paths resolve against cwd, which is not the document root.
    expect(result.pathResults?.[0].resolvedPath).toBe(resolve(process.cwd(), relative));
    expect(result.pathResults?.[1].inputPath).toBe(filePath);
  });

  it('reports the scanned document root', async () => {
    const result = await validateFrontmatterFiles(projectPath);

    expect(result.documentRoot).toBe(userDir);
  });

  it('emits no per-path list for a full walk', async () => {
    await writeDoc('slices', '917-slice.walk.md', VALID_SLICE);

    const result = await validateFrontmatterFiles(projectPath);

    // ~500 discovered documents must not be synthesized into a path report.
    expect(result.pathResults).toBeUndefined();
    expect(result.filesChecked).toBe(1);
  });

  it('default-checkout behavior is unchanged for in-scope paths', async () => {
    const a = await writeDoc('slices', '918-slice.a.md', VALID_SLICE);
    const b = await writeDoc('slices', '919-slice.b.md', INVALID_STATUS_SLICE);

    const result = await validateFrontmatterFiles(projectPath, [a, b]);

    // The two pre-slice fields keep their exact meaning.
    expect(result.filesChecked).toBe(2);
    expect(result.findings.every((f) => f.filePath === a || f.filePath === b)).toBe(true);
    expect(result.findings.some((f) => f.fixAction?.field === 'status')).toBe(true);
  });
});
