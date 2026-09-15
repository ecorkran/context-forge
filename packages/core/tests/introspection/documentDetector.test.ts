import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
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

  describe('zero-padded index matching (slice 913 TD-6)', () => {
    it('matches a zero-padded filename (050-arch.*.md) when queried by its numeric index (50)', async () => {
      const result = await detectDocuments(PROJECT_ROOT, 50);
      expect(result.architecture).toBe('project-documents/user/architecture/050-arch.hld-test-project.md');
    });

    it('still matches a non-padded filename (100-arch.*.md) when queried by its numeric index (100) — no regression', async () => {
      const result = await detectDocuments(PROJECT_ROOT, 100);
      expect(result.architecture).toBe('project-documents/user/architecture/100-arch.test-system.md');
    });

    it('does not match a near-miss index sharing a numeric prefix (140 vs 1400)', async () => {
      // Guards the existing suffix-boundary behavior: an index of 140 must not
      // match a 1400-arch.*.md file just because "1400" starts with "140".
      const root = mkdtempSync(join(tmpdir(), 'document-detector-nearmiss-'));
      const archDir = join(root, 'project-documents', 'user', 'architecture');
      mkdirSync(archDir, { recursive: true });
      writeFileSync(join(archDir, '1400-arch.decoy.md'), '---\narch: decoy\n---\n');

      const result = await detectDocuments(root, 140);
      expect(result.architecture).toBeNull();
    });
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

  describe('review docType filtering (#90 — same-prefix sibling shadowing)', () => {
    let root: string;
    let reviewsDir: string;

    function setup(): void {
      root = mkdtempSync(join(tmpdir(), 'document-detector-doctype-'));
      reviewsDir = join(root, 'project-documents', 'user', 'reviews');
      mkdirSync(reviewsDir, { recursive: true });
    }

    function teardown(): void {
      rmSync(root, { recursive: true, force: true });
    }

    it('excludes a same-prefix sibling with a different declared docType, even when it sorts last', async () => {
      setup();
      try {
        // Reproduces the reported case: 382-review.code.review-a-pr.md (the
        // real review, no verdict issue) plus a
        // ...response.md sibling that sorts after it and shadows it under
        // the old "lexicographically last wins" rule.
        writeFileSync(
          join(reviewsDir, '382-review.code.review-a-pr.md'),
          '---\ndocType: review\nverdict: CONCERNS\n---\n\n# Real review\n',
        );
        writeFileSync(
          join(reviewsDir, '382-review.code.review-a-pr.response.md'),
          '---\ndocType: review-response\n---\n\n# Response, not a review\n',
        );

        const result = await detectDocuments(root, 382, 'code');
        expect(result.review).toBe(
          'project-documents/user/reviews/382-review.code.review-a-pr.md',
        );
      } finally {
        teardown();
      }
    });

    it('still picks the lexicographically last match among same-typed (or untyped) candidates', async () => {
      setup();
      try {
        writeFileSync(
          join(reviewsDir, '500-review.code.first-pass.md'),
          '---\ndocType: review\nverdict: FAIL\n---\n\n# First pass\n',
        );
        writeFileSync(
          join(reviewsDir, '500-review.code.second-pass.md'),
          '---\ndocType: review\nverdict: PASS\n---\n\n# Second pass\n',
        );

        const result = await detectDocuments(root, 500, 'code');
        expect(result.review).toBe(
          'project-documents/user/reviews/500-review.code.second-pass.md',
        );
      } finally {
        teardown();
      }
    });

    it('keeps a candidate with no docType field at all (predates the convention)', async () => {
      setup();
      try {
        writeFileSync(
          join(reviewsDir, '600-review.code.first.md'),
          '---\nverdict: CONCERNS\n---\n\n# No docType field\n',
        );

        const result = await detectDocuments(root, 600, 'code');
        expect(result.review).toBe(
          'project-documents/user/reviews/600-review.code.first.md',
        );
      } finally {
        teardown();
      }
    });

    it('returns null when every same-prefix candidate has a different declared docType', async () => {
      setup();
      try {
        writeFileSync(
          join(reviewsDir, '700-review.code.only.md'),
          '---\ndocType: devlog\n---\n\n# Not actually a review\n',
        );

        const result = await detectDocuments(root, 700, 'code');
        expect(result.review).toBeNull();
      } finally {
        teardown();
      }
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
