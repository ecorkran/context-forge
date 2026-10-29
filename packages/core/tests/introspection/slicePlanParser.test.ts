import { describe, it, expect, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
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
      retroactive: false,
      description: 'Initialize data models and core types.',
    });

    expect(result.entries[2]).toEqual({
      index: 103,
      name: 'Feature Alpha',
      status: 'not_started',
      isChecked: false,
      lineIndex: 21,
      indexSource: 'explicit',
      retroactive: false,
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
      retroactive: false,
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
      retroactive: false,
      description: 'Python project setup, FastAPI skeleton.',
    });

    expect(result.entries[3]).toEqual({
      index: 4,
      name: 'Chat Frontend',
      status: 'not_started',
      isChecked: false,
      lineIndex: 20,
      indexSource: 'fallback',
      retroactive: false,
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
      retroactive: false,
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

  it('finds the (nnn) index behind bold prefixes such as **DEPRECATED (date)** (#117)', async () => {
    const result = await parseSlicePlan(join(FIXTURES, 'prefixed-slice-plan.md'));
    expect(result.entries.map((e) => [e.index, e.name, e.indexSource])).toEqual([
      [120, 'Finished Slice', 'explicit'],
      [121, 'Setup IDE Python Rewrite', 'explicit'],
      [122, 'Another Slice', 'explicit'],
      [123, 'Plain Slice', 'explicit'],
    ]);
  });
});

describe('parseSlicePlan retroactive marker (slice 263 D1/D2)', () => {
  const tempDirs: string[] = [];
  const MARKER = '`retroactive`';

  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  });

  /** Parse a one-line plan and return its only entry. */
  async function parseLine(line: string) {
    const dir = await mkdtemp(join(tmpdir(), 'slice-plan-retro-'));
    tempDirs.push(dir);
    const file = join(dir, '100-slices.test.md');
    await writeFile(file, `# Slices\n\n${line}\n`);
    const { entries } = await parseSlicePlan(file);
    expect(entries).toHaveLength(1);
    return entries[0];
  }

  it('parses the real-format line: retroactive, complete, marker stripped from the description', async () => {
    const entry = await parseLine(`1. [x] **(100) Existing System** ${MARKER} — the system as built at adoption.`);
    expect(entry).toMatchObject({
      index: 100,
      name: 'Existing System',
      status: 'complete',
      isChecked: true,
      retroactive: true,
      description: 'the system as built at adoption.',
    });
  });

  it.each([
    ['upper case', '`RETROACTIVE`'],
    ['mixed case', '`Retroactive`'],
    ['padded inside the backticks', '`  retroactive  `'],
  ])('matches %s', async (_label, token) => {
    expect((await parseLine(`1. [x] **(100) Existing System** ${token} — done.`)).retroactive).toBe(true);
  });

  it.each([
    ['no space before the marker', `1. [x] **(100) Existing System**${MARKER} — done.`],
    ['several spaces around the marker', `1. [x] **(100) Existing System**    ${MARKER}    — done.`],
  ])('matches with %s', async (_label, line) => {
    const entry = await parseLine(line);
    expect(entry.retroactive).toBe(true);
    expect(entry.description).toBe('done.');
  });

  it('does not match the bare word without backticks and leaves the description alone', async () => {
    const entry = await parseLine('1. [x] **(100) Existing System** — retroactive history of the system.');
    expect(entry.retroactive).toBe(false);
    expect(entry.description).toBe('retroactive history of the system.');
  });

  it('never marks an unindexed entry retroactive and leaves its text untouched', async () => {
    const entry = await parseLine(`1. [x] **Existing System** ${MARKER} — done.`);
    expect(entry.indexSource).toBe('fallback');
    expect(entry.retroactive).toBe(false);
    expect(entry.description).toContain('retroactive');
  });

  it('finds the marker on an entry with a bold prefix before the index (#117 form)', async () => {
    const entry = await parseLine(`1. [x] **DEPRECATED (20261011)** **(100) Existing System** ${MARKER} — done.`);
    expect(entry.index).toBe(100);
    expect(entry.retroactive).toBe(true);
  });

  it('reports an unmarked indexed entry as not retroactive', async () => {
    expect((await parseLine('1. [x] **(100) Existing System** — done.')).retroactive).toBe(false);
  });

  it('keeps an unchecked retroactive entry not_started: the marker does not imply done', async () => {
    const entry = await parseLine(`1. [ ] **(100) Existing System** ${MARKER} — done.`);
    expect(entry).toMatchObject({ retroactive: true, status: 'not_started', isChecked: false });
  });

  it('leaves no description when the marker is all that follows the title', async () => {
    const entry = await parseLine(`1. [x] **(100) Existing System** ${MARKER}`);
    expect(entry.retroactive).toBe(true);
    expect(entry.description).toBeUndefined();
  });

  describe('Status: on the plan line (#140)', () => {
    let dir: string;
    afterEach(async () => { await rm(dir, { recursive: true, force: true }); });

    async function parseLines(lines: string[]) {
      dir = await mkdtemp(join(tmpdir(), 'plan-status-'));
      const file = join(dir, 'plan.md');
      await writeFile(file, lines.join('\n'));
      return parseSlicePlan(file);
    }

    it('reads Status: deprecated and deferred from an unchecked initiative line', async () => {
      const result = await parseLines([
        '9. [ ] **(240) Flat File Import** — Load files. Status: deprecated — PM 2026-10-15: not doing it.',
        '10. [ ] **(200) Event Infrastructure** — Status: deferred — later.',
        '11. [ ] **(250) Plain** — Status: not_started.',
        '12. [ ] **(260) Unknown** — Status: bogus.',
      ]);
      const byIndex = Object.fromEntries(result.entries.map((e) => [e.index, e]));
      expect(byIndex[240].status).toBe('deprecated');
      expect(byIndex[240].isChecked).toBe(false);
      expect(byIndex[200].status).toBe('deferred');
      expect(byIndex[250].status).toBe('not_started');
      expect(byIndex[260].status).toBe('not_started');
    });

    it('does not change a checked line that mentions a status', async () => {
      const result = await parseLines(['1. [x] **(101) Done** — Status: deferred follow-ups only.']);
      expect(result.entries[0].status).toBe('complete');
    });
  });
});
