import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { WorkflowNavigator } from '../../src/introspection/WorkflowNavigator.js';
import type { ProjectData } from '../../src/types/project.js';
import { makeStubConfig } from '../helpers/stubConfig.js';
import { GATE_ENABLED_DEFAULTS } from '../helpers/workflowNavigatorFixtures.js';

describe('WorkflowNavigator — getNext() phase attachment on review-gate branches (#66, slice 917 TD-5)', () => {
  function makeScratchProject(root: string, overrides: Partial<ProjectData> = {}): ProjectData {
    return {
      id: 'scratch-66',
      name: 'scratch-project-66',
      template: 'default',
      fileSlice: '900-slice.active.md',
      fileTasks: '900-tasks.active.md',
      instruction: 'implementation',
      createdAt: '2026-01-01',
      updatedAt: '2026-02-28',
      projectPath: root,
      ...overrides,
    };
  }

  function writeSliceDesign(root: string, index: number, name: string): void {
    mkdirSync(join(root, 'project-documents', 'user', 'slices'), { recursive: true });
    writeFileSync(
      join(root, 'project-documents', 'user', 'slices', `${index}-slice.${name}.md`),
      `---\nslice: ${name}\nstatus: complete\n---\n\n# Slice ${index}\n`,
    );
  }

  function writeTaskFile(root: string, index: number, name: string, checked = true): void {
    mkdirSync(join(root, 'project-documents', 'user', 'tasks'), { recursive: true });
    writeFileSync(
      join(root, 'project-documents', 'user', 'tasks', `${index}-tasks.${name}.md`),
      `---\nslice: ${name}\nstatus: complete\n---\n\n- [${checked ? 'x' : ' '}] Task one\n`,
    );
  }

  function writeReview(root: string, index: number, type: 'slice' | 'tasks' | 'code', name: string, verdict: string): void {
    mkdirSync(join(root, 'project-documents', 'user', 'reviews'), { recursive: true });
    writeFileSync(
      join(root, 'project-documents', 'user', 'reviews', `${index}-review.${type}.${name}.md`),
      `---\nslice: ${name}\nstatus: complete\nverdict: ${verdict}\n---\n\n# Review ${index}\n`,
    );
  }

  it('pending-review, slice reviewType, stale phase → suggests cf set phase Phase 4', async () => {
    const root = mkdtempSync(join(tmpdir(), 'cf-nav-66-slice-pending-'));
    writeSliceDesign(root, 900, 'active');
    // No task file, no review at all → preTasks (slice) boundary is pending.
    const config = makeStubConfig(GATE_ENABLED_DEFAULTS);
    const nav = new WorkflowNavigator(config);
    const project = makeScratchProject(root, {
      fileTasks: undefined,
      developmentPhase: 'Phase 6: Implementation',
    });

    const status = await nav.getStatus(project);
    expect(status.activeSlice!.status).toBe('pending-review');
    expect(status.activeSlice!.gateInfo?.reviewType).toBe('slice');

    const next = await nav.getNext(project);
    expect(next.phase).toBe('Phase 4: Slice Design');
    expect(next.suggestedCommand).toBe("cf set phase 'Phase 4: Slice Design'");
  });

  it('pending-review, slice reviewType, already-correct phase → no suggestedCommand', async () => {
    const root = mkdtempSync(join(tmpdir(), 'cf-nav-66-slice-pending-ok-'));
    writeSliceDesign(root, 900, 'active');
    const config = makeStubConfig(GATE_ENABLED_DEFAULTS);
    const nav = new WorkflowNavigator(config);
    const project = makeScratchProject(root, {
      fileTasks: undefined,
      developmentPhase: 'Phase 4: Slice Design',
    });

    const next = await nav.getNext(project);
    expect(next.phase).toBe('Phase 4: Slice Design');
    expect(next.suggestedCommand).toBeUndefined();
  });

  it('review-failed, slice reviewType, stale phase → suggests cf set phase Phase 4', async () => {
    const root = mkdtempSync(join(tmpdir(), 'cf-nav-66-slice-failed-'));
    writeSliceDesign(root, 900, 'active');
    writeReview(root, 900, 'slice', 'active', 'FAIL');
    const config = makeStubConfig(GATE_ENABLED_DEFAULTS);
    const nav = new WorkflowNavigator(config);
    const project = makeScratchProject(root, {
      fileTasks: undefined,
      developmentPhase: 'Phase 6: Implementation',
    });

    const status = await nav.getStatus(project);
    expect(status.activeSlice!.status).toBe('review-failed');
    expect(status.activeSlice!.gateInfo?.reviewType).toBe('slice');

    const next = await nav.getNext(project);
    expect(next.phase).toBe('Phase 4: Slice Design');
    expect(next.suggestedCommand).toBe("cf set phase 'Phase 4: Slice Design'");
  });

  it('review-failed, slice reviewType, already-correct phase → no suggestedCommand', async () => {
    const root = mkdtempSync(join(tmpdir(), 'cf-nav-66-slice-failed-ok-'));
    writeSliceDesign(root, 900, 'active');
    writeReview(root, 900, 'slice', 'active', 'FAIL');
    const config = makeStubConfig(GATE_ENABLED_DEFAULTS);
    const nav = new WorkflowNavigator(config);
    const project = makeScratchProject(root, {
      fileTasks: undefined,
      developmentPhase: 'Phase 4: Slice Design',
    });

    const next = await nav.getNext(project);
    expect(next.phase).toBe('Phase 4: Slice Design');
    expect(next.suggestedCommand).toBeUndefined();
  });

  it('pending-review, tasks reviewType → phase resolves to Phase 5', async () => {
    const root = mkdtempSync(join(tmpdir(), 'cf-nav-66-tasks-pending-'));
    writeSliceDesign(root, 900, 'active');
    // Zero task progress (freshly created task file) + slice review present and
    // passing + no tasks review → preImplementation (tasks) boundary pending.
    writeTaskFile(root, 900, 'active', false);
    writeReview(root, 900, 'slice', 'active', 'PASS');
    const config = makeStubConfig(GATE_ENABLED_DEFAULTS);
    const nav = new WorkflowNavigator(config);
    const project = makeScratchProject(root, { developmentPhase: 'Phase 6: Implementation' });

    const status = await nav.getStatus(project);
    expect(status.activeSlice!.status).toBe('pending-review');
    expect(status.activeSlice!.gateInfo?.reviewType).toBe('tasks');

    const next = await nav.getNext(project);
    expect(next.phase).toBe('Phase 5: Task Breakdown');
    expect(next.suggestedCommand).toBe("cf set phase 'Phase 5: Task Breakdown'");
  });

  it('review-failed, code reviewType → phase resolves to Phase 6', async () => {
    const root = mkdtempSync(join(tmpdir(), 'cf-nav-66-code-failed-'));
    writeSliceDesign(root, 900, 'active');
    writeTaskFile(root, 900, 'active');
    writeReview(root, 900, 'slice', 'active', 'PASS');
    writeReview(root, 900, 'tasks', 'active', 'PASS');
    writeReview(root, 900, 'code', 'active', 'FAIL');
    const config = makeStubConfig(GATE_ENABLED_DEFAULTS);
    const nav = new WorkflowNavigator(config);
    const project = makeScratchProject(root, {
      fileSlicePlan: undefined,
      developmentPhase: 'Phase 4: Slice Design',
    });

    const status = await nav.getStatus(project);
    expect(status.activeSlice!.status).toBe('review-failed');
    expect(status.activeSlice!.gateInfo?.reviewType).toBe('code');

    const next = await nav.getNext(project);
    expect(next.phase).toBe('Phase 6: Implementation');
    expect(next.suggestedCommand).toBe("cf set phase 'Phase 6: Implementation'");
  });
});
