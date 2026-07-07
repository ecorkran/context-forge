import { join } from 'node:path';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { describe, it, expect } from 'vitest';
import { WorkflowNavigator } from '../../src/introspection/WorkflowNavigator.js';
import { ConsistencyChecker } from '../../src/introspection/ConsistencyChecker.js';
import { ArtifactIntrospector } from '../../src/introspection/ArtifactIntrospector.js';
import type { ProjectData } from '../../src/types/project.js';
import { makeStubConfig } from '../helpers/stubConfig.js';

/**
 * Slice 912 success criterion 5: the effective-date grandfather cutoff (slice 911) is
 * boundary-agnostic — every caller of evaluateReviewGate() inherits it automatically,
 * with no per-caller cutoff plumbing. This suite proves that holds through the actual
 * getNext() (TD-2) and checkAll() (TD-3) call sites this slice rewired, not just the
 * evaluateReviewGate() primitive itself (already covered by reviewGate.test.ts).
 */

const GATE_ENABLED_DEFAULTS = {
  'workflow.review_enabled': true,
  'workflow.review_threshold': 'concerns',
  'workflow.review_unknown_as': 'fail',
  'workflow.review_gates.pre_slice_plan.threshold': '',
  'workflow.review_gates.pre_tasks.threshold': '',
  'workflow.review_gates.pre_implementation.threshold': '',
  'workflow.review_gates.pre_advance.threshold': '',
  'workflow.review_gate_effective_date': '20260601',
};

function writeArchDoc(root: string, index: number, name: string, dateCreated: string): void {
  mkdirSync(join(root, 'project-documents', 'user', 'architecture'), { recursive: true });
  writeFileSync(
    join(root, 'project-documents', 'user', 'architecture', `${index}-arch.${name}.md`),
    `---\ndocType: architecture\nproject: scratch\ndateCreated: ${dateCreated}\n---\n\n# Arch ${index}\n`,
  );
}

function writeSliceDesign(root: string, index: number, name: string, dateCreated: string): void {
  mkdirSync(join(root, 'project-documents', 'user', 'slices'), { recursive: true });
  writeFileSync(
    join(root, 'project-documents', 'user', 'slices', `${index}-slice.${name}.md`),
    `---\nslice: ${name}\nstatus: complete\ndateCreated: ${dateCreated}\n---\n\n# Slice ${index}\n`,
  );
}

function writeTaskFile(root: string, index: number, name: string): void {
  mkdirSync(join(root, 'project-documents', 'user', 'tasks'), { recursive: true });
  writeFileSync(
    join(root, 'project-documents', 'user', 'tasks', `${index}-tasks.${name}.md`),
    `---\nslice: ${name}\nstatus: complete\n---\n\n- [x] Task\n`,
  );
}

function writeSlicePlan(root: string, planIndex: number, body: string): void {
  mkdirSync(join(root, 'project-documents', 'user', 'architecture'), { recursive: true });
  writeFileSync(
    join(root, 'project-documents', 'user', 'architecture', `${planIndex}-slices.scratch-plan.md`),
    `---\ndocType: slice-plan\nproject: scratch\n---\n\n# Slice Plan\n\n${body}\n`,
  );
}

function makeProject(root: string, overrides: Partial<ProjectData> = {}): ProjectData {
  return {
    id: 'cutoff-1',
    name: 'scratch-project',
    template: 'default',
    fileSlice: '',
    fileTasks: undefined,
    fileSlicePlan: '800-slices.scratch-plan',
    instruction: 'implementation',
    createdAt: '2026-01-01',
    updatedAt: '2026-02-28',
    projectPath: root,
    ...overrides,
  };
}

describe('review gate cutoff — cross-boundary integration (slice 912 success criterion 5)', () => {
  it('getNext(): a grandfathered architecture produces no pending arch review, even with a slice plan present (TD-2 path)', async () => {
    const root = mkdtempSync(join(tmpdir(), 'cf-cutoff-nav-'));
    writeArchDoc(root, 700, 'old-arch', '20260101');
    writeSlicePlan(root, 800, '1. [ ] **(900) Placeholder** — not built yet.');

    const config = makeStubConfig(GATE_ENABLED_DEFAULTS);
    const nav = new WorkflowNavigator(config);
    const project = makeProject(root, { fileArch: '700-arch.old-arch', developmentPhase: 'Phase 3: Slice Planning' });

    const next = await nav.getNext(project);
    expect(next.recommendation).not.toContain('Review required');
    expect(next.recommendation).not.toContain('Blocked');
  });

  it('getNext(): a non-grandfathered architecture (dated on/after cutoff) still surfaces the pending arch review', async () => {
    const root = mkdtempSync(join(tmpdir(), 'cf-cutoff-nav-new-'));
    writeArchDoc(root, 700, 'new-arch', '20260701');
    writeSlicePlan(root, 800, '1. [ ] **(900) Placeholder** — not built yet.');

    const config = makeStubConfig(GATE_ENABLED_DEFAULTS);
    const nav = new WorkflowNavigator(config);
    const project = makeProject(root, { fileArch: '700-arch.new-arch', developmentPhase: 'Phase 3: Slice Planning' });

    const next = await nav.getNext(project);
    expect(next.recommendation).toContain('Review required before creating the slice plan');
  });

  it('checkAll(): a grandfathered slice + architecture produce zero review-gate findings across all four boundaries', async () => {
    const root = mkdtempSync(join(tmpdir(), 'cf-cutoff-checkall-'));
    writeArchDoc(root, 700, 'old-arch', '20260101');
    writeSliceDesign(root, 900, 'old-slice', '20260101');
    writeTaskFile(root, 900, 'old-slice');
    writeSlicePlan(root, 800, '1. [x] **(900) Old Slice** — grandfathered.');

    const config = makeStubConfig(GATE_ENABLED_DEFAULTS);
    const checker = new ConsistencyChecker(new ArtifactIntrospector(), config);
    const project = makeProject(root, { fileArch: '700-arch.old-arch' });

    const result = await checker.checkAll(project);
    expect(result.findings.filter((f) => f.rule === 'review-gate')).toHaveLength(0);
  });

  it('checkAll(): a non-grandfathered slice + architecture (dated on/after cutoff) gate normally across all four boundaries', async () => {
    const root = mkdtempSync(join(tmpdir(), 'cf-cutoff-checkall-new-'));
    writeArchDoc(root, 700, 'new-arch', '20260701');
    writeSliceDesign(root, 900, 'new-slice', '20260701');
    writeTaskFile(root, 900, 'new-slice');
    writeSlicePlan(root, 800, '1. [x] **(900) New Slice** — not grandfathered.');

    const config = makeStubConfig(GATE_ENABLED_DEFAULTS);
    const checker = new ConsistencyChecker(new ArtifactIntrospector(), config);
    const project = makeProject(root, { fileArch: '700-arch.new-arch' });

    const result = await checker.checkAll(project);
    const findings = result.findings.filter((f) => f.rule === 'review-gate');

    // All four boundaries owed: arch (preSlicePlan), slice (preTasks), tasks (preImplementation), code (preAdvance).
    expect(findings.length).toBeGreaterThanOrEqual(4);
    const reviewTypesNamed = findings.map((f) => f.suggestedFix);
    expect(reviewTypesNamed.some((s) => s.includes('arch review'))).toBe(true);
    expect(reviewTypesNamed.some((s) => s.includes('slice review'))).toBe(true);
    expect(reviewTypesNamed.some((s) => s.includes('tasks review'))).toBe(true);
    expect(reviewTypesNamed.some((s) => s.includes('code review'))).toBe(true);
  });
});
