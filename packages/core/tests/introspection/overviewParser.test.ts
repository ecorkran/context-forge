import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { extractOverview } from '../../src/introspection/parsers/overviewParser.js';

describe('extractOverview', () => {
  it('extracts first paragraph from real arch file', async () => {
    const archPath = join(
      __dirname, '..', '..', '..', '..',
      'project-documents', 'user', 'architecture',
      '900-arch.maintenance-and-refactoring.md',
    );
    const overview = await extractOverview(archPath);
    expect(overview).toBeDefined();
    expect(overview).toContain('maintenance');
  });

  it('returns undefined for file without Overview section', async () => {
    const taskPath = join(
      __dirname, '..', 'fixtures', 'introspection',
      'sample-slice-plan.md',
    );
    const overview = await extractOverview(taskPath);
    expect(overview).toBeUndefined();
  });

  it('returns undefined for nonexistent file', async () => {
    const overview = await extractOverview('/nonexistent/file.md');
    expect(overview).toBeUndefined();
  });
});
