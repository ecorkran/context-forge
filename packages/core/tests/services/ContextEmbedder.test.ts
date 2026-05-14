import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, writeFile, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { embedReferencedFiles } from '../../src/services/ContextEmbedder.js';
import type { ProjectData } from '../../src/types/project.js';

function makeProject(overrides: Partial<ProjectData> = {}): ProjectData {
  return {
    id: 'test',
    name: 'test-project',
    projectPath: '',
    ...overrides,
  } as ProjectData;
}

describe('embedReferencedFiles', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'cf-embed-test-'));
    // Create the directory structure resolveArtifactPath expects
    await mkdir(join(tmpDir, 'project-documents/user/architecture'), { recursive: true });
    await mkdir(join(tmpDir, 'project-documents/user/slices'), { recursive: true });
    await mkdir(join(tmpDir, 'project-documents/user/tasks'), { recursive: true });
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('returns context unchanged when no artifact fields are set', async () => {
    const project = makeProject({ projectPath: tmpDir });
    const result = await embedReferencedFiles(project, tmpDir, 'base context');
    expect(result).toBe('base context');
  });

  it('embeds a present arch file after the base context', async () => {
    const archContent = '# Arch\nSome architecture content.';
    await writeFile(
      join(tmpDir, 'project-documents/user/architecture/100-arch.test.md'),
      archContent,
    );
    const project = makeProject({ projectPath: tmpDir, fileArch: '100-arch.test' });

    const result = await embedReferencedFiles(project, tmpDir, 'base context');

    expect(result).toContain('base context');
    expect(result).toContain('## Embedded: project-documents/user/architecture/100-arch.test.md');
    expect(result).toContain('# Arch');
    expect(result).toContain('Some architecture content.');
  });

  it('emits a warning for a referenced file that does not exist', async () => {
    const project = makeProject({ projectPath: tmpDir, fileArch: '999-arch.missing' });

    const result = await embedReferencedFiles(project, tmpDir, 'base context');

    expect(result).toContain('> Warning: referenced file not found and could not be embedded:');
    expect(result).toContain('999-arch.missing');
    // No fenced block for the missing file
    expect(result).not.toContain('## Embedded: project-documents/user/architecture/999-arch.missing.md');
  });

  it('embeds multiple artifact fields in declaration order', async () => {
    await writeFile(
      join(tmpDir, 'project-documents/user/architecture/100-arch.test.md'),
      '# Arch',
    );
    await writeFile(
      join(tmpDir, 'project-documents/user/architecture/100-slices.test.md'),
      '# Slice Plan',
    );
    const project = makeProject({
      projectPath: tmpDir,
      fileArch: '100-arch.test',
      fileSlicePlan: '100-slices.test',
    });

    const result = await embedReferencedFiles(project, tmpDir, 'base');

    const archPos = result.indexOf('100-arch.test.md');
    const planPos = result.indexOf('100-slices.test.md');
    expect(archPos).toBeGreaterThan(-1);
    expect(planPos).toBeGreaterThan(-1);
    // arch appears before slice plan
    expect(archPos).toBeLessThan(planPos);
  });

  it('embeds CLAUDE.md when present', async () => {
    await writeFile(join(tmpDir, 'CLAUDE.md'), '# Project Guidelines\nDo things well.');
    const project = makeProject({ projectPath: tmpDir });

    const result = await embedReferencedFiles(project, tmpDir, 'base context');

    expect(result).toContain('## Embedded: CLAUDE.md');
    expect(result).toContain('# Project Guidelines');
  });

  it('does not warn when CLAUDE.md is absent', async () => {
    const project = makeProject({ projectPath: tmpDir });
    const result = await embedReferencedFiles(project, tmpDir, 'base context');
    expect(result).not.toContain('CLAUDE.md');
    expect(result).not.toContain('Warning');
    expect(result).toBe('base context');
  });

  it('skips empty or whitespace-only artifact field values', async () => {
    const project = makeProject({ projectPath: tmpDir, fileArch: '   ', fileSlicePlan: '' });
    const result = await embedReferencedFiles(project, tmpDir, 'base context');
    expect(result).toBe('base context');
  });

  it('includes the Referenced Files separator section', async () => {
    await writeFile(
      join(tmpDir, 'project-documents/user/architecture/100-arch.test.md'),
      '# Arch',
    );
    const project = makeProject({ projectPath: tmpDir, fileArch: '100-arch.test' });

    const result = await embedReferencedFiles(project, tmpDir, 'base context');

    expect(result).toContain('# Referenced Files');
    expect(result).toContain('---');
  });

  it('warns for missing files and still embeds present ones', async () => {
    await writeFile(
      join(tmpDir, 'project-documents/user/architecture/100-arch.test.md'),
      '# Arch content',
    );
    const project = makeProject({
      projectPath: tmpDir,
      fileArch: '100-arch.test',
      fileSlicePlan: '999-slices.missing',
    });

    const result = await embedReferencedFiles(project, tmpDir, 'base context');

    expect(result).toContain('## Embedded: project-documents/user/architecture/100-arch.test.md');
    expect(result).toContain('> Warning:');
    expect(result).toContain('999-slices.missing');
  });
});
