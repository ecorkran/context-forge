import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { FutureWorkCollector } from '../../src/introspection/FutureWorkCollector.js';

const PROJECT_ROOT = join(__dirname, '..', 'fixtures', 'introspection', 'project');

describe('FutureWorkCollector', () => {
  it('standalone file detection: 780-band group exists with 3 items', async () => {
    const collector = new FutureWorkCollector();
    const result = await collector.collect(PROJECT_ROOT);
    const group = result.groups.find((g) => g.initiativeIndex === '780');
    expect(group).toBeDefined();
    expect(group!.items).toHaveLength(3);
  });

  it('standalone file: 1 completed, 2 pending', async () => {
    const collector = new FutureWorkCollector();
    const result = await collector.collect(PROJECT_ROOT);
    const group = result.groups.find((g) => g.initiativeIndex === '780');
    expect(group!.completedItems).toBe(1);
    expect(group!.pendingItems).toBe(2);
  });

  it('source attribution: 780-band group has correct fields', async () => {
    const collector = new FutureWorkCollector();
    const result = await collector.collect(PROJECT_ROOT);
    const group = result.groups.find((g) => g.initiativeIndex === '780');
    expect(group!.initiativeIndex).toBe('780');
    expect(group!.sourceFile).toMatch(/780-slices\.future\.test-future\.md$/);
    // Items carry source attribution
    for (const item of group!.items) {
      expect(item.sourceInitiativeIndex).toBe('780');
      expect(item.sourceFile).toMatch(/780-slices\.future\.test-future\.md$/);
    }
  });

  it('inline future work: 100-band group is absent (no ## Future Work in fixture)', async () => {
    const collector = new FutureWorkCollector();
    const result = await collector.collect(PROJECT_ROOT);
    // The 100-initiative slice plan has no ## Future Work section, so no group
    const group = result.groups.find((g) => g.initiativeIndex === '100');
    expect(group).toBeUndefined();
  });

  it('status filter pending: only done=false items returned', async () => {
    const collector = new FutureWorkCollector();
    const result = await collector.collect(PROJECT_ROOT, 'pending');
    for (const group of result.groups) {
      for (const item of group.items) {
        expect(item.done).toBe(false);
      }
    }
    expect(result.completedItems).toBe(0);
    expect(result.pendingItems).toBeGreaterThan(0);
  });

  it('status filter completed: only done=true items returned', async () => {
    const collector = new FutureWorkCollector();
    const result = await collector.collect(PROJECT_ROOT, 'completed');
    for (const group of result.groups) {
      for (const item of group.items) {
        expect(item.done).toBe(true);
      }
    }
    expect(result.pendingItems).toBe(0);
    expect(result.completedItems).toBeGreaterThan(0);
  });

  it('empty project: returns empty result without throwing', async () => {
    const collector = new FutureWorkCollector();
    const result = await collector.collect('/tmp/nonexistent-project-12345');
    expect(result.groups).toEqual([]);
    expect(result.totalItems).toBe(0);
    expect(result.pendingItems).toBe(0);
    expect(result.completedItems).toBe(0);
  });

  it('markdown output: contains header and 780 initiative section', async () => {
    const collector = new FutureWorkCollector();
    const result = await collector.collect(PROJECT_ROOT);
    expect(result.markdown).toContain('## Future Work Summary');
    expect(result.markdown).toContain('### 780');
  });

  it('markdown output: item lines use correct checkbox format', async () => {
    const collector = new FutureWorkCollector();
    const result = await collector.collect(PROJECT_ROOT);
    expect(result.markdown).toContain('- [x] (780)');
    expect(result.markdown).toContain('- [ ] (781)');
  });

  it('markdown output: footer contains total counts', async () => {
    const collector = new FutureWorkCollector();
    const result = await collector.collect(PROJECT_ROOT);
    expect(result.markdown).toMatch(/\*\*Total: \d+ items \(\d+ pending, \d+ completed\)\*\*/);
  });

  it('top-level totals aggregate across all groups', async () => {
    const collector = new FutureWorkCollector();
    const result = await collector.collect(PROJECT_ROOT);
    expect(result.totalItems).toBe(result.pendingItems + result.completedItems);
    const groupSum = result.groups.reduce((s, g) => s + g.totalItems, 0);
    expect(result.totalItems).toBe(groupSum);
  });
});
