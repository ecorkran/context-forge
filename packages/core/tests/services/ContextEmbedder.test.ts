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

  it('adds no artifact blocks or warnings when no artifact fields are set', async () => {
    await writeFile(join(tmpDir, 'CLAUDE.md'), '# Guidelines');
    const project = makeProject({ projectPath: tmpDir });
    const result = await embedReferencedFiles(project, tmpDir, 'base context');
    expect(result).toContain('base context');
    expect(result).toContain('## Embedded: CLAUDE.md');
    expect(result).not.toContain('Warning: referenced file not found');
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

  it('embeds AGENTS.md when CLAUDE.md is absent', async () => {
    await writeFile(join(tmpDir, 'AGENTS.md'), '# Agent Guidelines\nFollow these rules.');
    const project = makeProject({ projectPath: tmpDir });

    const result = await embedReferencedFiles(project, tmpDir, 'base context');

    expect(result).toContain('## Embedded: AGENTS.md');
    expect(result).toContain('# Agent Guidelines');
  });

  it('embeds .github/copilot-instructions.md when it is the only conventions file', async () => {
    await mkdir(join(tmpDir, '.github'), { recursive: true });
    await writeFile(
      join(tmpDir, '.github/copilot-instructions.md'),
      '# Copilot Guidelines\nFollow these rules.',
    );
    const project = makeProject({ projectPath: tmpDir });

    const result = await embedReferencedFiles(project, tmpDir, 'base context');

    expect(result).toContain('## Embedded: .github/copilot-instructions.md');
    expect(result).toContain('# Copilot Guidelines');
  });

  it('embeds exactly one conventions file when all three are present, following CONVENTIONS_FILES order', async () => {
    await writeFile(join(tmpDir, 'CLAUDE.md'), '# Claude Guidelines');
    await writeFile(join(tmpDir, 'AGENTS.md'), '# Agent Guidelines');
    await mkdir(join(tmpDir, '.github'), { recursive: true });
    await writeFile(join(tmpDir, '.github/copilot-instructions.md'), '# Copilot Guidelines');
    const project = makeProject({ projectPath: tmpDir });

    const result = await embedReferencedFiles(project, tmpDir, 'base context');

    const conventionsHeaders = (result.match(/## Embedded: [^\n]+/g) ?? []).filter(
      (h) => h.includes('CLAUDE.md') || h.includes('AGENTS.md') || h.includes('copilot-instructions.md'),
    );
    expect(conventionsHeaders).toEqual(['## Embedded: CLAUDE.md']);
  });

  it('warns with the full CONVENTIONS_FILES list and embeds no conventions block when none is present', async () => {
    const project = makeProject({ projectPath: tmpDir });

    const result = await embedReferencedFiles(project, tmpDir, 'base context');

    expect(result).toContain(
      'Warning: no conventions file found (looked for: CLAUDE.md, AGENTS.md, .github/copilot-instructions.md) — the embedded context has no project conventions',
    );
    expect(result).not.toContain('## Embedded: CLAUDE.md');
    expect(result).not.toContain('## Embedded: AGENTS.md');
    expect(result).not.toContain('## Embedded: .github/copilot-instructions.md');
  });

  it('emits the no-conventions warning even when every artifact file resolves successfully', async () => {
    await writeFile(
      join(tmpDir, 'project-documents/user/architecture/100-arch.test.md'),
      '# Arch',
    );
    const project = makeProject({ projectPath: tmpDir, fileArch: '100-arch.test' });

    const result = await embedReferencedFiles(project, tmpDir, 'base context');

    expect(result).toContain('## Embedded: project-documents/user/architecture/100-arch.test.md');
    expect(result).toContain('no conventions file found');
  });

  it('skips empty or whitespace-only artifact field values', async () => {
    await writeFile(join(tmpDir, 'CLAUDE.md'), '# Guidelines');
    const project = makeProject({ projectPath: tmpDir, fileArch: '   ', fileSlicePlan: '' });
    const result = await embedReferencedFiles(project, tmpDir, 'base context');
    expect(result).not.toContain('Warning: referenced file not found');
    expect(result).toContain('## Embedded: CLAUDE.md');
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
