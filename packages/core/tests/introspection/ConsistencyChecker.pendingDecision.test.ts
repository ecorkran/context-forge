import { join } from 'node:path';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { describe, it, expect } from 'vitest';
import { ConsistencyChecker } from '../../src/introspection/ConsistencyChecker.js';
import { ArtifactIntrospector } from '../../src/introspection/ArtifactIntrospector.js';
import { parseSlicePlan } from '../../src/introspection/parsers/slicePlanParser.js';
import type { IArtifactIntrospector } from '../../src/introspection/interfaces.js';
import type { ProjectData } from '../../src/types/project.js';
import { makeStubConfig } from '../helpers/stubConfig.js';

const RULE = 'pending-decision';
const GATE_ON = { 'workflow.decision_gate_enabled': true, 'workflow.review_enabled': false };

const designText = (...statuses: string[]): string =>
  `---\ndocType: slice-design\nstatus: in_progress\n---\n# Design\n${statuses
    .map((s, i) => `### D${i + 1} — Question ${i + 1}\nStatus: ${s}\n`)
    .join('\n')}`;

interface Fixture {
  root: string;
  planPath: string;
  userDir: string;
}

/** A project with a slice plan listing slices 5 and 6, and no designs yet. */
function makeFixture(): Fixture {
  const root = mkdtempSync(join(tmpdir(), 'cf-pending-decision-'));
  const userDir = join(root, 'project-documents', 'user');
  mkdirSync(join(userDir, 'architecture'), { recursive: true });
  mkdirSync(join(userDir, 'slices'), { recursive: true });
  mkdirSync(join(userDir, 'tasks'), { recursive: true });
  const planPath = join(userDir, 'architecture', '100-slices.pending.md');
  const lines = ['1. [ ] **(5) First** — one', '2. [ ] **(6) Second** — two'];
  writeFileSync(planPath, ['---', 'docType: slice-plan', '---', '', '## Slices', '', ...lines, ''].join('\n'));
  return { root, planPath, userDir };
}

function introspectorFor(planPath: string): IArtifactIntrospector {
  const real = new ArtifactIntrospector();
  return {
    parseSlicePlan: () => parseSlicePlan(planPath),
    parseTaskFile: real.parseTaskFile.bind(real),
    parseFrontmatter: real.parseFrontmatter.bind(real),
    parseFutureWork: real.parseFutureWork.bind(real),
    detectDocuments: real.detectDocuments.bind(real),
    summarize: real.summarize.bind(real),
  };
}

function projectFor(root: string): ProjectData {
  return {
    id: 'pd-1',
    name: 'pd-project',
    template: 'default',
    fileSlice: '5-slice.first',
    fileSlicePlan: '100-slices.pending',
    instruction: 'implementation',
    createdAt: '2026-01-01',
    updatedAt: '2026-10-01',
    projectPath: root,
  };
}

const findingsFor = async (fx: Fixture, config?: ReturnType<typeof makeStubConfig>) => {
  const checker = new ConsistencyChecker(introspectorFor(fx.planPath), config);
  return (await checker.checkAll(projectFor(fx.root))).findings.filter((f) => f.rule === RULE);
};

describe('ConsistencyChecker — pending-decision rule (slice 245)', () => {
  it('gives one non-blocking warning naming every pending decision', async () => {
    const fx = makeFixture();
    writeFileSync(join(fx.userDir, 'slices', '5-slice.first.md'), designText('pending-pm', 'tbd'));

    const checker = new ConsistencyChecker(introspectorFor(fx.planPath), makeStubConfig(GATE_ON));
    const result = await checker.checkAll(projectFor(fx.root));
    const findings = result.findings.filter((f) => f.rule === RULE);

    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe('warning');
    expect(findings[0].fixable).toBe(false);
    expect(findings[0].description).toContain('D1 — Question 1');
    expect(findings[0].description).toContain('D2 — Question 2');
    expect(result.findings.filter((f) => f.rule === RULE && f.severity === 'error')).toHaveLength(0);
  });

  it('gives no finding when nothing is pending', async () => {
    const fx = makeFixture();
    writeFileSync(join(fx.userDir, 'slices', '5-slice.first.md'), designText('decided'));
    expect(await findingsFor(fx, makeStubConfig(GATE_ON))).toEqual([]);
  });

  it('gives no finding for a complete slice', async () => {
    const fx = makeFixture();
    writeFileSync(join(fx.userDir, 'slices', '5-slice.first.md'), designText('pending-pm'));
    writeFileSync(
      join(fx.userDir, 'tasks', '5-tasks.first.md'),
      '---\ndocType: tasks\n---\n# Tasks\n- [x] Done\n',
    );
    expect(await findingsFor(fx, makeStubConfig(GATE_ON))).toEqual([]);
  });

  it('gives no finding when the gate is disabled or there is no config', async () => {
    const fx = makeFixture();
    writeFileSync(join(fx.userDir, 'slices', '5-slice.first.md'), designText('pending-pm'));
    const off = makeStubConfig({ ...GATE_ON, 'workflow.decision_gate_enabled': false });
    expect(await findingsFor(fx, off)).toEqual([]);
    expect(await findingsFor(fx)).toEqual([]);
  });

  it('reports an unreadable design as an error and still checks the next slice', async () => {
    const fx = makeFixture();
    // A directory where slice 5's design should be: detected, but not readable as a file.
    mkdirSync(join(fx.userDir, 'slices', '5-slice.first.md'));
    writeFileSync(join(fx.userDir, 'slices', '6-slice.second.md'), designText('pending-pm'));

    const findings = await findingsFor(fx, makeStubConfig(GATE_ON));

    expect(findings.map((f) => f.severity).sort()).toEqual(['error', 'warning']);
    const error = findings.find((f) => f.severity === 'error')!;
    expect(error.description).toContain('5-slice.first.md');
  });
});
