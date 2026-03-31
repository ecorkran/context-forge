import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { parseFutureWork } from '../../src/introspection/parsers/futureWorkParser.js';

const FIXTURES = join(__dirname, '..', 'fixtures', 'introspection');

describe('parseFutureWork', () => {
  it('extracts items from Future Work section', async () => {
    const result = await parseFutureWork(join(FIXTURES, 'sample-slice-plan.md'));
    expect(result.items.length).toBeGreaterThanOrEqual(2);
  });

  it('uses explicit (NNN) index when present', async () => {
    const result = await parseFutureWork(join(FIXTURES, 'sample-slice-plan.md'));
    const item200 = result.items.find((i) => i.index === '200');
    expect(item200).toBeDefined();
    expect(item200!.name).toBe('Advanced Analytics');
    expect(item200!.done).toBe(false);
  });

  it('assigns sequential indices from nextIndex for unnumbered items', async () => {
    const result = await parseFutureWork(join(FIXTURES, 'sample-slice-plan.md'), 300);
    // The unnumbered item should get index 300
    const autoItem = result.items.find((i) => i.index === '300');
    expect(autoItem).toBeDefined();
    expect(autoItem!.done).toBe(false);
  });

  it('uses "?" for unnumbered items when nextIndex is 0', async () => {
    const result = await parseFutureWork(join(FIXTURES, 'sample-slice-plan.md'), 0);
    const unknownItem = result.items.find((i) => i.index === '?');
    expect(unknownItem).toBeDefined();
  });

  it('extracts title before em-dash or colon', async () => {
    const result = await parseFutureWork(join(FIXTURES, 'sample-slice-plan.md'));
    const item200 = result.items.find((i) => i.index === '200');
    // "Advanced Analytics — Add analytics..." → title is "Advanced Analytics"
    expect(item200!.name).toBe('Advanced Analytics');
  });

  it('handles checked future work items', async () => {
    const result = await parseFutureWork(join(FIXTURES, 'sample-slice-plan.md'));
    const item201 = result.items.find((i) => i.index === '201');
    expect(item201).toBeDefined();
    expect(item201!.done).toBe(true);
    expect(item201!.name).toBe('Plugin System');
  });

  it('returns empty result for nonexistent file', async () => {
    const result = await parseFutureWork('/nonexistent/path.md');
    expect(result.items).toEqual([]);
  });

  it('returns empty result for file with no Future Work section', async () => {
    const result = await parseFutureWork(join(FIXTURES, 'valid-frontmatter.md'));
    expect(result.items).toEqual([]);
  });

  it('captures description text after title separator', async () => {
    const result = await parseFutureWork(join(FIXTURES, 'sample-slice-plan.md'));
    const item200 = result.items.find((i) => i.index === '200');
    expect(item200!.description).toBe('Add analytics dashboard and reporting.');

    const item201 = result.items.find((i) => i.index === '201');
    expect(item201!.description).toBe('Extensible plugin architecture.');
  });

  it('omits description when item has no separator', async () => {
    // "Future enhancement without explicit index" has " — " so it will have a description
    const result = await parseFutureWork(join(FIXTURES, 'sample-slice-plan.md'), 300);
    const autoItem = result.items.find((i) => i.index === '300');
    expect(autoItem!.description).toBe('better UI.');
  });
});
