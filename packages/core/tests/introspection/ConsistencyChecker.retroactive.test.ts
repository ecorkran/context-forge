import { join } from 'node:path';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { describe, it, expect } from 'vitest';
import { ConsistencyChecker } from '../../src/introspection/ConsistencyChecker.js';
import { ArtifactIntrospector } from '../../src/introspection/ArtifactIntrospector.js';
import type { ProjectData } from '../../src/types/project.js';
import type { ConsistencyFinding } from '../../src/introspection/types.js';
import { makeStubConfig } from '../helpers/stubConfig.js';
import { GATE_ENABLED_DEFAULTS } from '../helpers/workflowNavigatorFixtures.js';

const MARKER = '`retroactive`';

describe('ConsistencyChecker — retroactive entries and the review gate (slice 263 D3)', () => {
  function writePlan(root: string, name: string, body: string): string {
    const dir = join(root, 'project-documents', 'user', 'architecture');
    mkdirSync(dir, { recursive: true });
    const file = join(dir, `${name}.md`);
    writeFileSync(file, `---\ndocType: slice-plan\nproject: scratch-project\n---\n\n# Slice Plan\n\n${body}\n`);
    return file;
  }

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

  async function checkAll(root: string, planName: string, gatingOn = true): Promise<ConsistencyFinding[]> {
    const config = makeStubConfig({ ...GATE_ENABLED_DEFAULTS, 'workflow.review_enabled': gatingOn });
    const checker = new ConsistencyChecker(new ArtifactIntrospector(), config);
    return (await checker.checkAll(makeProject(root, planName))).findings;
  }

  const gateFindings = (findings: ConsistencyFinding[]) => findings.filter((f) => f.rule === 'review-gate');

  const MIXED_PLAN =
    `1. [x] **(100) Existing System** ${MARKER} — built before adoption.\n` +
    `2. [x] **(101) Existing Tooling** ${MARKER} — built before adoption.\n` +
    `3. [x] **(103) Existing Docs** ${MARKER} — built before adoption.\n` +
    '4. [ ] **(104) New Work** — not started.';

  it('reports one info per plan naming the retroactive ranges, with no pending or failed gate', async () => {
    const root = mkdtempSync(join(tmpdir(), 'cf-chk-263-'));
    const planPath = writePlan(root, '800-slices.mixed', MIXED_PLAN);
    const gate = gateFindings(await checkAll(root, '800-slices.mixed'));
    const skipInfo = gate.filter((f) => f.severity === 'info');
    expect(skipInfo).toHaveLength(1);
    expect(skipInfo[0].description).toContain('Slices 100–101, 103 are retroactive: recorded history, not reviewed.');
    expect(skipInfo[0].location).toBe(planPath);
    expect(skipInfo[0].fixable).toBe(false);
    expect(gate.filter((f) => f.severity !== 'info')).toEqual([]);
  });

  it('gives a retroactive entry that also has a slice design and no review no gate finding', async () => {
    const root = mkdtempSync(join(tmpdir(), 'cf-chk-263-'));
    writePlan(root, '800-slices.mixed', MIXED_PLAN);
    mkdirSync(join(root, 'project-documents', 'user', 'slices'), { recursive: true });
    writeFileSync(
      join(root, 'project-documents', 'user', 'slices', '100-slice.existing-system.md'),
      '---\nslice: existing-system\nstatus: complete\n---\n\n# Slice 100\n',
    );
    const gate = gateFindings(await checkAll(root, '800-slices.mixed'));
    expect(gate.filter((f) => f.severity !== 'info')).toEqual([]);
  });

  it('emits no skip info when gating is off', async () => {
    const root = mkdtempSync(join(tmpdir(), 'cf-chk-263-'));
    writePlan(root, '800-slices.mixed', MIXED_PLAN);
    expect(gateFindings(await checkAll(root, '800-slices.mixed', false))).toEqual([]);
  });

  it('emits one info per plan when two plans have retroactive entries', async () => {
    const root = mkdtempSync(join(tmpdir(), 'cf-chk-263-'));
    writePlan(root, '800-slices.first', `1. [x] **(100) First System** ${MARKER} — built before adoption.`);
    writePlan(root, '900-slices.second', `1. [x] **(200) Second System** ${MARKER} — built before adoption.`);
    const skipInfo = gateFindings(await checkAll(root, '800-slices.first')).filter((f) => f.severity === 'info');
    expect(skipInfo).toHaveLength(2);
    expect(skipInfo.map((f) => f.description).sort()).toEqual([
      expect.stringContaining('Slices 100 are'),
      expect.stringContaining('Slices 200 are'),
    ]);
  });

  it('never calls a retroactive entry reviewed, cleared or exempt', async () => {
    const root = mkdtempSync(join(tmpdir(), 'cf-chk-263-'));
    writePlan(root, '800-slices.mixed', MIXED_PLAN);
    const text = gateFindings(await checkAll(root, '800-slices.mixed'))
      .map((f) => `${f.description} ${f.suggestedFix}`)
      .join('\n')
      .replace(/not reviewed/g, '');
    expect(text).not.toMatch(/reviewed|cleared|exempt/i);
  });
});
