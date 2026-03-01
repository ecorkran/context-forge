import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { parseTaskItems, parseTaskFile } from '../../src/introspection/parsers/taskFileParser.js';

const FIXTURES = join(__dirname, '..', 'fixtures', 'introspection');

describe('parseTaskItems', () => {
  it('extracts checked and unchecked items from a task file', async () => {
    const items = await parseTaskItems(join(FIXTURES, 'sample-tasks.md'));
    expect(items.length).toBeGreaterThan(0);
    expect(items.some((i) => i.done)).toBe(true);
    expect(items.some((i) => !i.done)).toBe(true);
  });

  it('treats [X] (capital X) as checked', async () => {
    const items = await parseTaskItems(join(FIXTURES, 'all-complete-tasks.md'));
    // File has a [X] item — all should be done
    expect(items.every((i) => i.done)).toBe(true);
  });

  it('returns empty array for nonexistent file', async () => {
    const items = await parseTaskItems('/nonexistent/path.md');
    expect(items).toEqual([]);
  });

  it('truncates task names longer than 120 characters', async () => {
    const { writeFile, unlink } = await import('node:fs/promises');
    const longName = 'A'.repeat(150);
    const tmpPath = join(FIXTURES, '_long-name-test-temp.md');
    await writeFile(tmpPath, `- [ ] ${longName}\n`);
    try {
      const items = await parseTaskItems(tmpPath);
      expect(items).toHaveLength(1);
      expect(items[0].name.length).toBe(120);
      expect(items[0].name.endsWith('...')).toBe(true);
    } finally {
      await unlink(tmpPath);
    }
  });
});

describe('parseTaskFile', () => {
  it('returns correct counts for mixed checked/unchecked', async () => {
    const result = await parseTaskFile(join(FIXTURES, 'sample-tasks.md'));
    // sample-tasks.md has 8 checkbox items: 4 checked, 4 unchecked
    expect(result.totalTasks).toBe(8);
    expect(result.completedTasks).toBe(4);
    expect(result.inferredStatus).toBe('in-progress');
  });

  it('infers status "complete" when all items are checked', async () => {
    const result = await parseTaskFile(join(FIXTURES, 'all-complete-tasks.md'));
    expect(result.completedTasks).toBe(result.totalTasks);
    expect(result.inferredStatus).toBe('complete');
  });

  it('infers status "not-started" when no items exist', async () => {
    const result = await parseTaskFile(join(FIXTURES, 'empty-tasks.md'));
    expect(result.totalTasks).toBe(0);
    expect(result.completedTasks).toBe(0);
    expect(result.inferredStatus).toBe('not-started');
  });

  it('merges items from multiple files in path order', async () => {
    const result = await parseTaskFile([
      join(FIXTURES, 'sample-tasks.md'),
      join(FIXTURES, 'all-complete-tasks.md'),
    ]);
    // sample-tasks: 8 items, all-complete-tasks: 5 items
    expect(result.totalTasks).toBe(13);
    // Uses first file's path
    expect(result.filePath).toBe(join(FIXTURES, 'sample-tasks.md'));
    expect(result.inferredStatus).toBe('in-progress');
  });

  it('returns empty result for nonexistent file (no throw)', async () => {
    const result = await parseTaskFile('/nonexistent/path.md');
    expect(result.totalTasks).toBe(0);
    expect(result.items).toEqual([]);
    expect(result.inferredStatus).toBe('not-started');
  });
});
