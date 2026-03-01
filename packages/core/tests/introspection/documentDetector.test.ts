import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { detectDocuments, checkFileExists } from '../../src/introspection/parsers/documentDetector.js';

const PROJECT_ROOT = join(__dirname, '..', 'fixtures', 'introspection', 'project');

describe('detectDocuments', () => {
  it('detects existing slice design file for a known index', async () => {
    const result = await detectDocuments(PROJECT_ROOT, 100);
    expect(result.sliceDesign).toBe('project-documents/user/slices/100-slice.test-feature.md');
  });

  it('detects task files including split files', async () => {
    const result = await detectDocuments(PROJECT_ROOT, 100);
    expect(result.taskFile).not.toBeNull();
    expect(result.taskFile!.length).toBe(2);
    // Should include both main and split file
    expect(result.taskFile).toContain('project-documents/user/tasks/100-tasks.test-feature-1.md');
    expect(result.taskFile).toContain('project-documents/user/tasks/100-tasks.test-feature.md');
  });

  it('detects architecture file', async () => {
    const result = await detectDocuments(PROJECT_ROOT, 100);
    expect(result.architecture).toBe('project-documents/user/architecture/100-arch.test-system.md');
  });

  it('detects slice plan file', async () => {
    const result = await detectDocuments(PROJECT_ROOT, 100);
    expect(result.slicePlan).toBe('project-documents/user/architecture/100-slices.test-system.md');
  });

  it('returns null for indices with no matching files', async () => {
    const result = await detectDocuments(PROJECT_ROOT, 999);
    expect(result.sliceDesign).toBeNull();
    expect(result.taskFile).toBeNull();
    expect(result.architecture).toBeNull();
    expect(result.slicePlan).toBeNull();
  });

  it('returns all nulls for nonexistent project path (no throw)', async () => {
    const result = await detectDocuments('/nonexistent/project', 100);
    expect(result.sliceDesign).toBeNull();
    expect(result.taskFile).toBeNull();
    expect(result.architecture).toBeNull();
    expect(result.slicePlan).toBeNull();
  });
});

describe('checkFileExists', () => {
  it('returns true for existing relative path', async () => {
    const exists = await checkFileExists(
      PROJECT_ROOT,
      'project-documents/user/slices/100-slice.test-feature.md',
    );
    expect(exists).toBe(true);
  });

  it('returns false for nonexistent relative path', async () => {
    const exists = await checkFileExists(PROJECT_ROOT, 'nonexistent/file.md');
    expect(exists).toBe(false);
  });
});
