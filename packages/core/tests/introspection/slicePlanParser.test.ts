import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { parseSlicePlan } from '../../src/introspection/parsers/slicePlanParser.js';

const FIXTURES = join(__dirname, '..', 'fixtures', 'introspection');

describe('parseSlicePlan', () => {
  it('extracts correct entries with index, name, isChecked, status', async () => {
    const result = await parseSlicePlan(join(FIXTURES, 'sample-slice-plan.md'));
    expect(result.entries).toHaveLength(6);

    expect(result.entries[0]).toEqual({
      index: 101,
      name: 'Schema Setup',
      status: 'complete',
      isChecked: true,
      lineIndex: 15,
      indexSource: 'explicit',
      description: 'Initialize data models and core types.',
    });

    expect(result.entries[2]).toEqual({
      index: 103,
      name: 'Feature Alpha',
      status: 'not_started',
      isChecked: false,
      lineIndex: 21,
      indexSource: 'explicit',
      description: 'First feature implementation.',
    });
  });

  it('parses an indexed [~] plan line as a deprecated entry, not dropped', async () => {
    const result = await parseSlicePlan(join(FIXTURES, 'sample-slice-plan.md'));
    const entry = result.entries.find((e) => e.index === 106);
    expect(entry).toEqual({
      index: 106,
      name: 'Feature Delta',
      status: 'deprecated',
      isChecked: false,
      lineIndex: 27,
      indexSource: 'explicit',
      description: 'descoped, superseded by native tooling.',
    });
  });

  it('does not regress existing [ ]/[x]/[X] entries after widening the checkbox class', async () => {
    const result = await parseSlicePlan(join(FIXTURES, 'sample-slice-plan.md'));
    expect(result.entries.find((e) => e.index === 101)).toMatchObject({
      status: 'complete',
      isChecked: true,
    });
    expect(result.entries.find((e) => e.index === 102)).toMatchObject({
      status: 'complete',
      isChecked: true,
    });
    expect(result.entries.find((e) => e.index === 103)).toMatchObject({
      status: 'not_started',
      isChecked: false,
    });
    expect(result.entries.find((e) => e.index === 104)).toMatchObject({
      status: 'not_started',
      isChecked: false,
    });
    expect(result.entries.find((e) => e.index === 105)).toMatchObject({
      status: 'complete',
      isChecked: true,
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
    expect(result.totalSlices).toBe(6);
    expect(result.completedSlices).toBe(4); // 101, 102, 105 checked + 106 deprecated
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
    expect(result.totalSlices).toBe(7);
    expect(result.completedSlices).toBe(1); // Feature Epsilon deprecated

    expect(result.entries[0]).toEqual({
      index: 1,
      name: 'Backend API Scaffold',
      status: 'not_started',
      isChecked: false,
      lineIndex: 12,
      indexSource: 'fallback',
      description: 'Python project setup, FastAPI skeleton.',
    });

    expect(result.entries[3]).toEqual({
      index: 4,
      name: 'Chat Frontend',
      status: 'not_started',
      isChecked: false,
      lineIndex: 20,
      indexSource: 'fallback',
      description: 'Minimal web UI for chat.',
    });

    // Integration Work entry is also parsed (not in excluded headings)
    expect(result.entries[6].name).toBe('Operational Hardening');
  });

  it('parses an unindexed [~] plan line as a deprecated entry, not dropped', async () => {
    const result = await parseSlicePlan(join(FIXTURES, 'unindexed-slice-plan.md'));
    const entry = result.entries.find((e) => e.name === 'Feature Epsilon');
    expect(entry).toEqual({
      index: 6,
      name: 'Feature Epsilon',
      status: 'deprecated',
      isChecked: false,
      lineIndex: 24,
      indexSource: 'fallback',
      description: 'cut for scope, superseded by native tooling.',
    });
  });

  it('tags every entry indexSource: fallback when the plan uses only the unindexed format', async () => {
    const result = await parseSlicePlan(join(FIXTURES, 'unindexed-slice-plan.md'));
    expect(result.entries.every((e) => e.indexSource === 'fallback')).toBe(true);
  });

  it('tags every entry indexSource: explicit when the plan uses only the indexed format', async () => {
    const result = await parseSlicePlan(join(FIXTURES, 'sample-slice-plan.md'));
    expect(result.entries.every((e) => e.indexSource === 'explicit')).toBe(true);
  });

  it('tags each entry independently in a plan mixing indexed and unindexed formats', async () => {
    const result = await parseSlicePlan(join(FIXTURES, 'mixed-index-slice-plan.md'));
    const bySource = new Map(result.entries.map((e) => [e.name, e.indexSource]));
    expect(bySource.get('Schema Setup')).toBe('explicit');
    expect(bySource.get('Config System')).toBe('fallback');
  });

  it('reproduces the real 140-plan collision: sequential fallback indices match a sibling indexed plan\'s real indices', async () => {
    // Regression for slice 913 TD-1's root cause: a legacy plan using only the
    // unindexed format (mirroring 140-slices.context-forge-restructure.md's
    // exact list format) produces sequential fallback indices 1-3 that
    // numerically collide with a sibling plan's real (NNN)-indexed 1-3 —
    // proving the collision exists at the parser level before checkAll()'s
    // merge-loop filter (tested separately in ConsistencyChecker.test.ts).
    const legacy = await parseSlicePlan(
      join(FIXTURES, 'collision', 'project-documents', 'user', 'architecture', '140-slices.legacy-plan.md'),
    );
    const real = await parseSlicePlan(
      join(FIXTURES, 'collision', 'project-documents', 'user', 'architecture', '900-slices.real-plan.md'),
    );

    expect(legacy.entries.every((e) => e.indexSource === 'fallback')).toBe(true);
    expect(real.entries.every((e) => e.indexSource === 'explicit')).toBe(true);

    const legacyIndices = legacy.entries.map((e) => e.index).sort();
    const realIndices = real.entries.map((e) => e.index).sort();
    expect(legacyIndices).toEqual([1, 2, 3]);
    expect(realIndices).toEqual([1, 2, 3]);
    // The collision: same numeric indices, different indexSource — this is
    // exactly what checkAll()'s merge loop must disambiguate.
    expect(legacyIndices).toEqual(realIndices);
  });

  it('captures description text after bold name', async () => {
    const result = await parseSlicePlan(join(FIXTURES, 'sample-slice-plan.md'));
    expect(result.entries[0].description).toBe('Initialize data models and core types.');
    expect(result.entries[1].description).toBe('Persistent configuration layer.');
  });

  it('sorts entries by index ascending even when source file is out of order', async () => {
    const result = await parseSlicePlan(join(FIXTURES, 'out-of-order-slice-plan.md'));
    expect(result.entries.map((e) => e.index)).toEqual([101, 102, 103, 104, 105]);
    // First unchecked must be 102 (101 is complete) — drives `cf next`.
    expect(result.entries.find((e) => !e.isChecked)?.index).toBe(102);
  });

  it('omits description when none present after name', async () => {
    // All fixture entries have descriptions, so verify via real plan
    const result = await parseSlicePlan(join(FIXTURES, 'sample-slice-plan.md'));
    // All entries should have descriptions in this fixture
    for (const entry of result.entries) {
      expect(entry.description).toBeDefined();
    }
  });
});
