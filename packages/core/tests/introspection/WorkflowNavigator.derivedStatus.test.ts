import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { WorkflowNavigator } from '../../src/introspection/WorkflowNavigator.js';
import type { ProjectData } from '../../src/types/project.js';
import { makeStubConfig } from '../helpers/stubConfig.js';
import { GATE_ENABLED_DEFAULTS } from '../helpers/workflowNavigatorFixtures.js';

describe('WorkflowNavigator — derived-status entry selection (slice 911)', () => {
  function makeScratchProject(root: string, overrides: Partial<ProjectData> = {}): ProjectData {
    return {
      id: 'scratch-1',
      name: 'scratch-project',
      template: 'default',
      fileSlice: '900-slice.active.md',
      fileTasks: '900-tasks.active.md',
      fileSlicePlan: '800-slices.scratch-plan',
      instruction: 'implementation',
      createdAt: '2026-01-01',
      updatedAt: '2026-02-28',
      projectPath: root,
      ...overrides,
    };
  }

  function writeSlicePlan(root: string, body: string): void {
    mkdirSync(join(root, 'project-documents', 'user', 'architecture'), { recursive: true });
    writeFileSync(
      join(root, 'project-documents', 'user', 'architecture', '800-slices.scratch-plan.md'),
      `---\ndocType: slice-plan\nproject: scratch-project\n---\n\n# Slice Plan: Scratch\n\n${body}\n`,
    );
  }

  function writeSliceDesign(root: string, index: number, name: string, status = 'in-progress'): void {
    mkdirSync(join(root, 'project-documents', 'user', 'slices'), { recursive: true });
    writeFileSync(
      join(root, 'project-documents', 'user', 'slices', `${index}-slice.${name}.md`),
      `---\nslice: ${name}\nstatus: ${status}\n---\n\n# Slice ${index}\n`,
    );
  }

  function writeTaskFile(root: string, index: number, name: string, checkboxes: string[]): void {
    mkdirSync(join(root, 'project-documents', 'user', 'tasks'), { recursive: true });
    const body = checkboxes.map((c) => `- [${c}] Task`).join('\n');
    writeFileSync(
      join(root, 'project-documents', 'user', 'tasks', `${index}-tasks.${name}.md`),
      `---\nslice: ${name}\nstatus: in-progress\n---\n\n${body}\n`,
    );
  }

  it('#56 regression: tasks 100% complete, plan checkbox unchecked → not selected as next-unstarted', async () => {
    const root = mkdtempSync(join(tmpdir(), 'cf-nav-911-'));
    writeSliceDesign(root, 242, 'done-unchecked', 'in-progress');
    writeTaskFile(root, 242, 'done-unchecked', ['x', 'x']);
    writeSliceDesign(root, 250, 'genuinely-untouched', 'not_started');
    writeSlicePlan(
      root,
      '1. [ ] **(242) Done Unchecked** — tasks complete, checkbox never ticked.\n' +
        '2. [ ] **(250) Genuinely Untouched** — nothing done yet.',
    );

    const nav = new WorkflowNavigator();
    const project = makeScratchProject(root, {
      fileSlice: '',
      fileTasks: undefined,
      developmentPhase: 'Phase 6: Implementation',
    });
    const next = await nav.getNext(project);

    // Must not select 242 as "next unstarted" — it is derived-complete despite the
    // unchecked box. It should instead select 250, the genuinely untouched slice.
    expect(next.suggestedCommand).toBe('cf set slice 250');
  });

  it('MCP parity: workflow_status (getStatus) reports the same derived statuses as getNext selection for the 242-shaped fixture', async () => {
    // getStatus() (what the MCP workflow_status tool returns verbatim) and
    // getNext()'s entry selection both read through resolveEntryStatus/
    // deriveEntryStatus — this pins that getStatus().slicePlan.entries doesn't
    // silently diverge from what getNext used to pick the next slice.
    const root = mkdtempSync(join(tmpdir(), 'cf-nav-911-mcp-parity-'));
    writeSliceDesign(root, 242, 'done-unchecked', 'in-progress');
    writeTaskFile(root, 242, 'done-unchecked', ['x', 'x']);
    writeSliceDesign(root, 250, 'genuinely-untouched', 'not_started');
    writeSlicePlan(
      root,
      '1. [ ] **(242) Done Unchecked** — tasks complete, checkbox never ticked.\n' +
        '2. [ ] **(250) Genuinely Untouched** — nothing done yet.',
    );

    const nav = new WorkflowNavigator();
    const project = makeScratchProject(root, {
      fileSlice: '',
      fileTasks: undefined,
      developmentPhase: 'Phase 6: Implementation',
    });

    const status = await nav.getStatus(project);
    const entry242 = status.slicePlan!.entries.find((e) => e.index === 242);
    const entry250 = status.slicePlan!.entries.find((e) => e.index === 250);
    expect(entry242!.status).toBe('complete');
    expect(entry250!.status).toBe('not_started');

    const next = await nav.getNext(project);
    expect(next.suggestedCommand).toBe('cf set slice 250');
  });

  it('#62: an unrecognized slice-design status degrades that entry instead of throwing, for both getStatus and getNext', async () => {
    const root = mkdtempSync(join(tmpdir(), 'cf-nav-62-'));
    writeSliceDesign(root, 125, 'done', 'complete');
    writeSliceDesign(root, 127, 'bad-status', 'design'); // "design" is not a recognized status
    writeSlicePlan(
      root,
      '1. [x] **(125) Done** — complete.\n' +
        '2. [ ] **(127) Bad Status** — has an unrecognized frontmatter status.',
    );

    const nav = new WorkflowNavigator();
    const project = makeScratchProject(root, {
      fileSlice: '',
      fileTasks: undefined,
      developmentPhase: 'Phase 6: Implementation',
    });

    // getStatus must not throw — the whole command must keep running (cf status).
    const status = await nav.getStatus(project);
    const entry127 = status.slicePlan!.entries.find((e) => e.index === 127);
    expect(entry127!.status).toBe('degraded');
    expect(status.warnings).toBeDefined();
    expect(status.warnings!.some((w) => w.includes('Slice 127') && w.includes('not a recognized status'))).toBe(true);

    // getNext must also not throw, and must surface the same warning rather than
    // silently skipping the degraded entry (cf next).
    const next = await nav.getNext(project);
    expect(next.suggestedCommand).toBe('cf set slice 127');
    expect(next.warnings).toBeDefined();
    expect(next.warnings!.some((w) => w.includes('Slice 127') && w.includes('not a recognized status'))).toBe(true);
  });

  it('a "deferred" slice-design status is recognized, does not warn, and is skipped by getNext like deprecated', async () => {
    const root = mkdtempSync(join(tmpdir(), 'cf-nav-deferred-'));
    writeSliceDesign(root, 125, 'done', 'complete');
    writeSliceDesign(root, 127, 'shelved', 'deferred');
    writeSliceDesign(root, 130, 'genuinely-next', 'not-started');
    writeSlicePlan(
      root,
      '1. [x] **(125) Done** — complete.\n' +
        '2. [ ] **(127) Shelved** — deferred, not now.\n' +
        '3. [ ] **(130) Genuinely Next** — nothing done yet.',
    );

    const nav = new WorkflowNavigator();
    const project = makeScratchProject(root, {
      fileSlice: '',
      fileTasks: undefined,
      developmentPhase: 'Phase 6: Implementation',
    });

    const status = await nav.getStatus(project);
    const entry127 = status.slicePlan!.entries.find((e) => e.index === 127);
    expect(entry127!.status).toBe('deferred');
    expect(status.warnings ?? []).toEqual([]);

    // getNext must skip the deferred entry and land on the next real candidate,
    // not throw and not treat deferred as "not started".
    const next = await nav.getNext(project);
    expect(next.suggestedCommand).toBe('cf set slice 130');
    expect(next.warnings ?? []).toEqual([]);
  });

  it('a "[~]" plan-line-deprecated entry with no slice-design/task file is skipped by getNext like deprecated', async () => {
    const root = mkdtempSync(join(tmpdir(), 'cf-nav-plan-deprecated-'));
    writeSliceDesign(root, 125, 'done', 'complete');
    writeSliceDesign(root, 130, 'genuinely-next', 'not-started');
    writeSlicePlan(
      root,
      '1. [x] **(125) Done** — complete.\n' +
        '2. [~] **(127) Descoped** — cut for scope.\n' +
        '3. [ ] **(130) Genuinely Next** — nothing done yet.',
    );

    const nav = new WorkflowNavigator();
    const project = makeScratchProject(root, {
      fileSlice: '',
      fileTasks: undefined,
      developmentPhase: 'Phase 6: Implementation',
    });

    const status = await nav.getStatus(project);
    const entry127 = status.slicePlan!.entries.find((e) => e.index === 127);
    expect(entry127!.status).toBe('deprecated');
    expect(status.warnings ?? []).toEqual([]);

    // getNext must skip the plan-line-deprecated entry (no slice-design/task
    // file exists for it — the parser's [~] marker is the only signal) and
    // land on the next real candidate, not throw and not treat it as
    // "not started". This requires no production code change: entry.status
    // already carries Deprecated from the parser, and Decision 4/8 already
    // thread it through resolveEntryStatus into deriveEntryStatus.
    const next = await nav.getNext(project);
    expect(next.suggestedCommand).toBe('cf set slice 130');
    expect(next.warnings ?? []).toEqual([]);
  });

  it('wording: active in-progress slice recommends "Continue", not "Advance to"', async () => {
    // The active slice itself (900) is in-implementation with partial progress —
    // exercises the pre-existing in-implementation branch, confirming its wording
    // still reads "Continue" (not "Advance to") after the derivation routing change.
    const root = mkdtempSync(join(tmpdir(), 'cf-nav-911-wording-'));
    writeSliceDesign(root, 900, 'active', 'in-progress');
    writeTaskFile(root, 900, 'active', ['x', ' ']);
    writeSlicePlan(root, '1. [ ] **(900) Active** — in progress.');

    const nav = new WorkflowNavigator();
    const project = makeScratchProject(root);
    const next = await nav.getNext(project);

    expect(next.recommendation).toContain('Continue');
    expect(next.recommendation).not.toContain('Advance to');
  });

  it('wording: complete active slice with an in-progress next entry recommends "Continue slice N"', async () => {
    const root = mkdtempSync(join(tmpdir(), 'cf-nav-911-wording-next-'));
    writeSliceDesign(root, 900, 'active', 'in-progress');
    writeTaskFile(root, 900, 'active', ['x', 'x']);
    writeSliceDesign(root, 901, 'partial', 'in-progress');
    writeTaskFile(root, 901, 'partial', ['x', ' ']);
    writeSlicePlan(
      root,
      '1. [x] **(900) Active** — complete.\n2. [ ] **(901) Partial** — partially done.',
    );

    const nav = new WorkflowNavigator();
    const project = makeScratchProject(root);
    const next = await nav.getNext(project);

    expect(next.recommendation).toContain('Continue slice 901');
    expect(next.recommendation).not.toContain('Advance to');
    expect(next.suggestedCommand).toBe('cf set slice 901');
  });

  it('gate-ordering regression: complete-but-unreviewed slice still routes to review, not "advance to next slice"', async () => {
    const root = mkdtempSync(join(tmpdir(), 'cf-nav-911-gate-'));
    writeSliceDesign(root, 900, 'active', 'in-progress');
    writeTaskFile(root, 900, 'active', ['x', 'x']);
    writeSliceDesign(root, 901, 'untouched', 'not_started');
    writeSlicePlan(
      root,
      '1. [ ] **(900) Active** — tasks complete, no review yet.\n2. [ ] **(901) Untouched** — nothing done.',
    );

    const config = makeStubConfig(GATE_ENABLED_DEFAULTS);
    const nav = new WorkflowNavigator(config);
    const project = makeScratchProject(root);

    const status = await nav.getStatus(project);
    expect(status.activeSlice!.status).toBe('pending-review');

    const next = await nav.getNext(project);
    expect(next.recommendation).toContain('Review required');
    expect(next.recommendation).not.toContain('Advance to slice 901');
  });

  it('#62: a plan entry with an unreadable task file degrades that entry (warning) rather than aborting getNext', async () => {
    // Active slice (900) is complete, so getNext reaches the complete-advance
    // branch and must resolve entry 901's status via findFirstNotCompleteEntry.
    // Originally (slice 911) this propagated as a thrown error; #62 established
    // that a single bad entry must not abort the whole command — it now degrades
    // that entry and surfaces the failure as a warning instead (see
    // resolveEntryStatusSafe). The underlying failure is still surfaced, not
    // silently discarded — just no longer fatal to the whole command.
    const root = mkdtempSync(join(tmpdir(), 'cf-nav-911-td2a-'));
    writeSliceDesign(root, 900, 'active', 'in-progress');
    writeTaskFile(root, 900, 'active', ['x', 'x']);
    writeSliceDesign(root, 901, 'broken', 'in-progress');
    // Entry 901's task file path is a directory, not a file — parseTaskItems'
    // readFile call throws EISDIR, which now propagates (only ENOENT is treated
    // as "no file"). This must surface as a warning, not a silent fallthrough
    // to the checkbox and not an aborted command.
    mkdirSync(join(root, 'project-documents', 'user', 'tasks'), { recursive: true });
    mkdirSync(join(root, 'project-documents', 'user', 'tasks', '901-tasks.broken.md'));
    writeSlicePlan(
      root,
      '1. [x] **(900) Active** — complete.\n2. [ ] **(901) Broken** — task file is unreadable.',
    );

    const nav = new WorkflowNavigator();
    const project = makeScratchProject(root);

    const next = await nav.getNext(project);
    expect(next.suggestedCommand).toBe('cf set slice 901');
    expect(next.warnings).toBeDefined();
    expect(next.warnings!.some((w) => w.includes('EISDIR'))).toBe(true);
  });

  it('TD-2a propagation: the ACTIVE slice itself with an unreadable task file surfaces an error via getStatus/deriveSliceStatus', async () => {
    // Distinct from the entry-resolution path above: this exercises
    // deriveSliceStatus's own parseTaskFileSafe, which previously swallowed
    // any error (including genuine resolution failures) and silently
    // returned 'needs-tasks'. It must now propagate instead.
    const root = mkdtempSync(join(tmpdir(), 'cf-nav-911-td2a-active-'));
    writeSliceDesign(root, 900, 'active', 'in-progress');
    mkdirSync(join(root, 'project-documents', 'user', 'tasks'), { recursive: true });
    mkdirSync(join(root, 'project-documents', 'user', 'tasks', '900-tasks.active.md'));
    writeSlicePlan(root, '1. [ ] **(900) Active** — task file is unreadable.');

    const nav = new WorkflowNavigator();
    const project = makeScratchProject(root);

    await expect(nav.getStatus(project)).rejects.toThrow();
  });
});
