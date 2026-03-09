import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { parseSlicePlan } from '../../src/introspection/parsers/slicePlanParser.js';

const FIXTURES = join(__dirname, '..', 'fixtures', 'introspection');

describe('parseSlicePlan', () => {
  it('extracts correct entries with index, name, isChecked, status', async () => {
    const result = await parseSlicePlan(join(FIXTURES, 'sample-slice-plan.md'));
    expect(result.entries).toHaveLength(5);

    expect(result.entries[0]).toEqual({
      index: 101,
      name: 'Schema Setup',
      status: 'complete',
      isChecked: true,
      lineIndex: 15,
    });

    expect(result.entries[2]).toEqual({
      index: 103,
      name: 'Feature Alpha',
      status: 'not-started',
      isChecked: false,
      lineIndex: 21,
    });
  });

  it('skips entries in Future Work, Implementation Order, Notes sections', async () => {
    const result = await parseSlicePlan(join(FIXTURES, 'sample-slice-plan.md'));
    // Should NOT contain 200, 201, or 999
    const indices = result.entries.map((e) => e.index);
    expect(indices).not.toContain(200);
    expect(indices).not.toContain(201);
    expect(indices).not.toContain(999);
  });

  it('computes totalSlices and completedSlices correctly', async () => {
    const result = await parseSlicePlan(join(FIXTURES, 'sample-slice-plan.md'));
    expect(result.totalSlices).toBe(5);
    expect(result.completedSlices).toBe(3); // 101, 102, 105
  });

  it('returns empty result for nonexistent file', async () => {
    const result = await parseSlicePlan('/nonexistent/path.md');
    expect(result.entries).toEqual([]);
    expect(result.totalSlices).toBe(0);
    expect(result.completedSlices).toBe(0);
  });

  it('validates against real project slice plan', async () => {
    const realPlan = join(
      __dirname,
      '..', '..', '..', '..', // up to repo root
      'project-documents', 'user', 'architecture',
      '160-slices.project-workflow-system.md',
    );
    const result = await parseSlicePlan(realPlan);

    // We know at least 7 slices exist (161-167)
    expect(result.totalSlices).toBeGreaterThanOrEqual(7);

    // 161 and 162 are complete
    const s161 = result.entries.find((e) => e.index === 161);
    expect(s161).toBeDefined();
    expect(s161!.isChecked).toBe(true);
    expect(s161!.status).toBe('complete');

    const s162 = result.entries.find((e) => e.index === 162);
    expect(s162).toBeDefined();
    expect(s162!.isChecked).toBe(true);

    // 163 is complete (slice 163 delivered)
    const s163 = result.entries.find((e) => e.index === 163);
    expect(s163).toBeDefined();
    expect(s163!.isChecked).toBe(true);
    expect(s163!.status).toBe('complete');

    expect(result.completedSlices).toBeGreaterThanOrEqual(2);
  });

  it('includes filePath in the result', async () => {
    const path = join(FIXTURES, 'sample-slice-plan.md');
    const result = await parseSlicePlan(path);
    expect(result.filePath).toBe(path);
  });

  it('parses unindexed format using sequential numbering', async () => {
    const result = await parseSlicePlan(join(FIXTURES, 'unindexed-slice-plan.md'));
    expect(result.totalSlices).toBe(6);
    expect(result.completedSlices).toBe(0);

    expect(result.entries[0]).toEqual({
      index: 1,
      name: 'Backend API Scaffold',
      status: 'not-started',
      isChecked: false,
      lineIndex: 12,
    });

    expect(result.entries[3]).toEqual({
      index: 4,
      name: 'Chat Frontend',
      status: 'not-started',
      isChecked: false,
      lineIndex: 20,
    });

    // Integration Work entry is also parsed (not in excluded headings)
    expect(result.entries[5].name).toBe('Operational Hardening');
  });
});
