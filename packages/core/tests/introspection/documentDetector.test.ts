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

  it('returns review: null for existing two-arg callers (unaffected by reviewType)', async () => {
    const result = await detectDocuments(PROJECT_ROOT, 100);
    expect(result.review).toBeNull();
  });

  describe('review detection (reviewType)', () => {
    it('returns null when reviewType is omitted, even when matching review files exist', async () => {
      const result = await detectDocuments(PROJECT_ROOT, 100);
      expect(result.review).toBeNull();
    });

    it('returns null when reviewType is an empty string (per-gate override default), even when matching review files exist', async () => {
      const result = await detectDocuments(PROJECT_ROOT, 100, '');
      expect(result.review).toBeNull();
    });

    it('returns the single match when exactly one review exists for a type', async () => {
      const result = await detectDocuments(PROJECT_ROOT, 100, 'arch');
      expect(result.review).toBe(
        'project-documents/user/reviews/100-review.arch.only-pass.md',
      );
    });

    it('returns the lexicographically last match when multiple reviews exist for a type', async () => {
      const result = await detectDocuments(PROJECT_ROOT, 100, 'code');
      expect(result.review).toBe(
        'project-documents/user/reviews/100-review.code.second-pass.md',
      );
    });

    it('returns null for a non-matching reviewType', async () => {
      const result = await detectDocuments(PROJECT_ROOT, 100, 'tasks');
      expect(result.review).toBeNull();
    });

    it('returns null for a non-matching index', async () => {
      const result = await detectDocuments(PROJECT_ROOT, 999, 'code');
      expect(result.review).toBeNull();
    });

    it('returns null when the reviews directory is missing', async () => {
      const result = await detectDocuments('/nonexistent/project', 100, 'code');
      expect(result.review).toBeNull();
    });
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
