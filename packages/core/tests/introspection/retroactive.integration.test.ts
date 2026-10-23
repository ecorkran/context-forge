import { describe, it, expect, beforeAll } from 'vitest';
import { join } from 'node:path';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { ConsistencyChecker } from '../../src/introspection/ConsistencyChecker.js';
import { ArtifactIntrospector } from '../../src/introspection/ArtifactIntrospector.js';
import { WorkflowNavigator } from '../../src/introspection/WorkflowNavigator.js';
import { parseSlicePlan } from '../../src/introspection/parsers/slicePlanParser.js';
import type { ConsistencyFinding } from '../../src/introspection/types.js';
import type { ProjectData } from '../../src/types/project.js';
import { makeStubConfig } from '../helpers/stubConfig.js';
import { GATE_ENABLED_DEFAULTS } from '../helpers/workflowNavigatorFixtures.js';

// An adopted project (slice 263): a derived architecture, and a plan whose first three
// entries are retroactive history and whose last two are new work. Entries use the real
// format the adoption flow writes.
const ARCH_FILE = '100-arch.existing.md';
const PLAN_FILE = '100-slices.existing.md';
const PLAN_NAME = '100-slices.existing';
const MARKER = '`retroactive`';

function buildAdoptedProject(): string {
  const root = mkdtempSync(join(tmpdir(), 'cf-retro-integration-'));
  const dir = join(root, 'project-documents', 'user', 'architecture');
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, ARCH_FILE),
    '---\ndocType: architecture\nproject: adopted\nstatus: complete\narchIndex: 100\ncomponent: existing\n' +
      'provenance: derived\ndateCreated: 20261023\ndateUpdated: 20261023\n---\n\n# Architecture\n',
  );
  writeFileSync(
    join(dir, PLAN_FILE),
    '---\ndocType: slice-plan\nproject: adopted\nstatus: in_progress\ndateCreated: 20261023\ndateUpdated: 20261023\n---\n\n' +
      '# Slice Plan\n\n' +
      `1. [x] **(100) Existing Core** ${MARKER} — built before adoption.\n` +
      `2. [x] **(101) Existing CLI** ${MARKER} — built before adoption.\n` +
      `3. [x] **(102) Existing Docs** ${MARKER} — built before adoption.\n` +
      '4. [ ] **(103) New Feature** — first new work.\n' +
      '5. [ ] **(104) Another Feature** — second new work.\n',
  );
  return root;
}

function projectAt(root: string, fileSlice: string): ProjectData {
  return {
    id: 'adopted-1',
    name: 'adopted',
    template: 'default',
    fileSlice,
    fileSlicePlan: PLAN_NAME,
    instruction: 'implementation',
    createdAt: '2026-01-01',
    updatedAt: '2026-02-28',
    projectPath: root,
    developmentPhase: 'Phase 6: Implementation',
  };
}

describe('retroactive marker — adopted project integration (slice 263)', () => {
  let root: string;
  let findings: ConsistencyFinding[];
  const config = () => makeStubConfig(GATE_ENABLED_DEFAULTS);

  beforeAll(async () => {
    root = buildAdoptedProject();
    const checker = new ConsistencyChecker(new ArtifactIntrospector(), config());
    findings = (await checker.checkAll(projectAt(root, ''))).findings;
  });

  it('the parser reads the three marked entries and the two new ones', async () => {
    const plan = await parseSlicePlan(join(root, 'project-documents', 'user', 'architecture', PLAN_FILE));
    expect(plan.entries.map((e) => [e.index, e.retroactive, e.status])).toEqual([
      [100, true, 'complete'],
      [101, true, 'complete'],
      [102, true, 'complete'],
      [103, false, 'not_started'],
      [104, false, 'not_started'],
    ]);
  });

  it('checkAll reports no retroactive-entry errors and no gate finding for slices 100-102', () => {
    expect(findings.filter((f) => f.rule === 'retroactive-entry')).toEqual([]);
    const retroGate = findings.filter(
      (f) => f.rule === 'review-gate' && f.severity !== 'info' && /\[10[0-2]\]/.test(f.description),
    );
    expect(retroGate).toEqual([]);
    expect(findings.filter((f) => f.rule === 'review-gate' && f.location.endsWith(PLAN_FILE) && f.severity !== 'info')).toEqual([]);
  });

  it('checkAll shows exactly one retroactive skip info, and the derived architecture gate applies as for any architecture (D7)', () => {
    const skipInfo = findings.filter((f) => f.rule === 'review-gate' && f.severity === 'info');
    expect(skipInfo).toHaveLength(1);
    expect(skipInfo[0].description).toContain('Slices 100–102 are retroactive');
    const archGate = findings.filter((f) => f.rule === 'review-gate' && f.location.endsWith(ARCH_FILE));
    expect(archGate).toHaveLength(1);
    expect(archGate[0].severity).toBe('warning');
  });

  it('provenance: derived validates', () => {
    expect(findings.filter((f) => f.rule === 'frontmatter-schema' && f.description.includes('provenance'))).toEqual([]);
  });

  it('getNext after the retroactive slice 100 is slice 103, and so is the next with no active slice', async () => {
    const navigator = new WorkflowNavigator(config());
    const afterActive = await navigator.getNext(projectAt(root, '100-slice.existing-core.md'));
    expect(afterActive.suggestedCommand).toBe('cf set slice 103');
    const noActive = await navigator.getNext(projectAt(root, ''));
    expect(noActive.suggestedCommand).toBe('cf set slice 103');
  });
});
