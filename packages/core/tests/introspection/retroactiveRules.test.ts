import { join } from 'node:path';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { describe, it, expect } from 'vitest';
import { ConsistencyChecker } from '../../src/introspection/ConsistencyChecker.js';
import { ArtifactIntrospector } from '../../src/introspection/ArtifactIntrospector.js';
import { parseSlicePlan } from '../../src/introspection/parsers/slicePlanParser.js';
import { ruleRetroactiveEntries } from '../../src/introspection/retroactiveRules.js';
import type { ProjectData } from '../../src/types/project.js';
import type { ConsistencyFinding } from '../../src/introspection/types.js';
import { makeStubConfig } from '../helpers/stubConfig.js';
import { GATE_ENABLED_DEFAULTS } from '../helpers/workflowNavigatorFixtures.js';

const MARKER = '`retroactive`';
const RULE = 'retroactive-entry';

const retro = (n: number, box = 'x') => `1. [${box}] **(${n}) Existing ${n}** ${MARKER} — built before adoption.`;
const fresh = (n: number, box = ' ') => `1. [${box}] **(${n}) New ${n}** — new work.`;

function makeRoot(): string {
  return mkdtempSync(join(tmpdir(), 'cf-retro-263-'));
}

function writePlan(root: string, name: string, lines: string[], status?: string): string {
  const dir = join(root, 'project-documents', 'user', 'architecture');
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `${name}.md`);
  const statusLine = status ? `status: ${status}\n` : '';
  writeFileSync(file, `---\ndocType: slice-plan\nproject: scratch-project\n${statusLine}---\n\n# Slice Plan\n\n${lines.join('\n')}\n`);
  return file;
}

function writeArtifact(root: string, dir: 'slices' | 'tasks', file: string): void {
  mkdirSync(join(root, 'project-documents', 'user', dir), { recursive: true });
  writeFileSync(join(root, 'project-documents', 'user', dir, file), '---\nstatus: complete\n---\n\n# Doc\n');
}

async function rule(root: string, planFiles: string[]): Promise<ConsistencyFinding[]> {
  const plans = await Promise.all(planFiles.map((f) => parseSlicePlan(f)));
  return ruleRetroactiveEntries(root, plans);
}

describe('ruleRetroactiveEntries (slice 263 D4)', () => {
  it('1. a valid plan yields no findings', async () => {
    const root = makeRoot();
    const plan = writePlan(root, '800-slices.valid', [retro(100), retro(101), fresh(102)]);
    expect(await rule(root, [plan])).toEqual([]);
  });

  it('2. a retroactive entry with a slice design is one error naming the slice and the file', async () => {
    const root = makeRoot();
    const plan = writePlan(root, '800-slices.design', [retro(100), retro(101)]);
    writeArtifact(root, 'slices', '101-slice.cli.md');
    const findings = await rule(root, [plan]);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ rule: RULE, severity: 'error', fixable: false, location: plan });
    expect(findings[0].description).toContain('Slice 101');
    expect(findings[0].description).toContain('101-slice.cli.md');
  });

  it('3. a retroactive entry with a task file is one error', async () => {
    const root = makeRoot();
    const plan = writePlan(root, '800-slices.tasks', [retro(100), retro(101)]);
    writeArtifact(root, 'tasks', '101-tasks.cli.md');
    const findings = await rule(root, [plan]);
    expect(findings).toHaveLength(1);
    expect(findings[0].description).toContain('101-tasks.cli.md');
  });

  it.each([
    ['[ ]', ' '],
    ['[~]', '~'],
  ])('4. a retroactive entry written %s is one error saying to check it or remove the marker', async (_label, box) => {
    const root = makeRoot();
    const plan = writePlan(root, '800-slices.unchecked', [retro(100, box)]);
    const findings = await rule(root, [plan]);
    expect(findings).toHaveLength(1);
    expect(findings[0].suggestedFix).toBe('Check it, or remove the marker');
  });

  it('5. a retroactive entry indexed after new work is one ordering error', async () => {
    const root = makeRoot();
    const plan = writePlan(root, '800-slices.order', [retro(100), fresh(102), retro(103)]);
    const findings = await rule(root, [plan]);
    expect(findings).toHaveLength(1);
    expect(findings[0].description).toContain('Slice 103');
    expect(findings[0].description).toContain('after new work (slice 102)');
  });

  it('6. ordering holds across plans', async () => {
    const root = makeRoot();
    const planA = writePlan(root, '800-slices.a', [fresh(102)]);
    const planB = writePlan(root, '900-slices.b', [retro(103)]);
    const findings = await rule(root, [planA, planB]);
    expect(findings).toHaveLength(1);
    expect(findings[0].location).toBe(planB);
  });

  it('7. a deprecated entry with a lower index does not trigger the ordering error', async () => {
    const root = makeRoot();
    const plan = writePlan(root, '800-slices.deprecated', [fresh(50, '~'), retro(100)]);
    expect(await rule(root, [plan])).toEqual([]);
  });

  it('8. a fallback-index entry never produces a finding', async () => {
    const root = makeRoot();
    const plan = writePlan(root, '800-slices.fallback', [`1. [x] **Unindexed System** ${MARKER} — done.`]);
    writeArtifact(root, 'slices', '1-slice.unindexed.md');
    expect(await rule(root, [plan])).toEqual([]);
  });
});

describe('ConsistencyChecker.checkAll with retroactive entries (slice 263)', () => {
  function makeProject(root: string, planName: string): ProjectData {
    return {
      id: 'scratch-1',
      name: 'scratch-project',
      template: 'default',
      fileSlicePlan: planName,
      instruction: 'implementation',
      createdAt: '2026-01-01',
      updatedAt: '2026-02-28',
      projectPath: root,
    };
  }

  async function checkAll(root: string, planName: string, gatingOn = true) {
    const config = makeStubConfig({ ...GATE_ENABLED_DEFAULTS, 'workflow.review_enabled': gatingOn });
    const checker = new ConsistencyChecker(new ArtifactIntrospector(), config);
    return checker.checkAll(makeProject(root, planName));
  }

  const lines = [retro(100), retro(101), fresh(102)];

  it('1. a valid adopted plan has no retroactive-entry findings and shows the skip info', async () => {
    const root = makeRoot();
    writePlan(root, '800-slices.valid', lines);
    const { findings } = await checkAll(root, '800-slices.valid');
    expect(findings.filter((f) => f.rule === RULE)).toEqual([]);
    expect(findings.filter((f) => f.rule === 'review-gate' && f.severity === 'info')).toHaveLength(1);
  });

  it.each([true, false])('2. a retroactive entry with a design file is reported with gating %s', async (gatingOn) => {
    const root = makeRoot();
    writePlan(root, '800-slices.design', lines);
    writeArtifact(root, 'slices', '100-slice.existing.md');
    const result = await checkAll(root, '800-slices.design', gatingOn);
    const errors = result.findings.filter((f) => f.rule === RULE);
    expect(errors).toHaveLength(1);
    expect(result.findings.filter((f) => f.severity === 'error').length).toBeGreaterThan(0);
  });

  it('3. a project with no retroactive entries gets no retroactive findings at all', async () => {
    const root = makeRoot();
    writePlan(root, '800-slices.plain', [fresh(100), fresh(101)]);
    const { findings } = await checkAll(root, '800-slices.plain');
    expect(findings.filter((f) => f.rule === RULE)).toEqual([]);
    expect(findings.filter((f) => f.rule === 'review-gate' && f.severity === 'info')).toEqual([]);
  });

  it('4. an all-retroactive checked plan: in_progress suggests complete, complete is quiet', async () => {
    const rootBehind = makeRoot();
    writePlan(rootBehind, '800-slices.done', [retro(100), retro(101)], 'in_progress');
    const behind = (await checkAll(rootBehind, '800-slices.done')).findings.filter(
      (f) => f.rule === 'plan-status-vs-entries',
    );
    expect(behind).toHaveLength(1);
    expect(behind[0].suggestedFix).toContain('"complete"');

    const rootDone = makeRoot();
    writePlan(rootDone, '800-slices.done', [retro(100), retro(101)], 'complete');
    const done = (await checkAll(rootDone, '800-slices.done')).findings.filter(
      (f) => f.rule === 'plan-status-vs-entries',
    );
    expect(done).toEqual([]);
  });
});
