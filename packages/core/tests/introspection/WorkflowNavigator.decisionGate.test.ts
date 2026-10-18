import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { WorkflowNavigator } from '../../src/introspection/WorkflowNavigator.js';
import { makeStubConfig } from '../helpers/stubConfig.js';
import { makeProject, GATE_ENABLED_DEFAULTS } from '../helpers/workflowNavigatorFixtures.js';

const SLICE_FILE = '500-slice.decision-gate.md';
const TASK_FILE = '500-tasks.decision-gate.md';
const PENDING_DESIGN_LINE = 6;

const designText = (status: string, extraFrontmatter = ''): string =>
  `---\ndocType: slice-design\n${extraFrontmatter}---\n# Design\n### D1 — Open question\nStatus: ${status}\n`;

const taskText = (...boxes: boolean[]): string =>
  `---\ndocType: tasks\n---\n# Tasks\n${boxes.map((b, i) => `- [${b ? 'x' : ' '}] Task ${i + 1}`).join('\n')}\n`;

const GATE_ON = { 'workflow.decision_gate_enabled': true, 'workflow.review_enabled': false };

describe('WorkflowNavigator — decision gate (slice 245)', () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'cf-decision-gate-'));
    await mkdir(join(root, 'project-documents/user/slices'), { recursive: true });
    await mkdir(join(root, 'project-documents/user/tasks'), { recursive: true });
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  const writeDesign = (text: string): Promise<void> =>
    writeFile(join(root, 'project-documents/user/slices', SLICE_FILE), text);
  const writeTasks = (text: string): Promise<void> =>
    writeFile(join(root, 'project-documents/user/tasks', TASK_FILE), text);
  const project = (overrides = {}) =>
    makeProject({ fileSlice: SLICE_FILE, projectPath: root, ...overrides });

  describe('fires', () => {
    it('with no task file: next blocks and status carries the payload', async () => {
      await writeDesign(designText('pending-pm'));
      const nav = new WorkflowNavigator(makeStubConfig(GATE_ON));
      const decisions = [{ heading: 'D1 — Open question', line: PENDING_DESIGN_LINE }];

      const next = await nav.getNext(project());
      expect(next.recommendation).toBe('Blocked: design has pending PM decisions');
      expect(next.pendingDecisions).toEqual(decisions);
      expect(next.rationale).toContain('1 decision pending PM confirmation');
      expect(next.rationale).toContain(`D1 — Open question (line ${PENDING_DESIGN_LINE})`);
      expect(next.summary).toBe('Blocked — slice 500 has 1 pending PM decision');
      expect(next.phase).toBe('Phase 4: Slice Design');

      const status = await nav.getStatus(project());
      expect(status.activeSlice?.status).toBe('pending-decision');
      expect(status.activeSlice?.pendingDecisions).toEqual(decisions);
    });

    it('pluralizes the summary for several decisions', async () => {
      await writeDesign(`${designText('open')}### D2 — Another\nStatus: tbd\n`);
      const next = await new WorkflowNavigator(makeStubConfig(GATE_ON)).getNext(project());
      expect(next.pendingDecisions).toHaveLength(2);
      expect(next.summary).toBe('Blocked — slice 500 has 2 pending PM decisions');
    });

    it('with a task file of zero tasks', async () => {
      await writeDesign(designText('pending-pm'));
      await writeTasks('---\ndocType: tasks\n---\n# Tasks\n');
      const next = await new WorkflowNavigator(makeStubConfig(GATE_ON)).getNext(project());
      expect(next.pendingDecisions).toHaveLength(1);
    });

    it('with zero progress and with partial progress', async () => {
      await writeDesign(designText('pending-pm'));
      const nav = new WorkflowNavigator(makeStubConfig(GATE_ON));

      await writeTasks(taskText(false, false));
      expect((await nav.getStatus(project())).activeSlice?.status).toBe('pending-decision');

      await writeTasks(taskText(true, false));
      expect((await nav.getStatus(project())).activeSlice?.status).toBe('pending-decision');
    });

    it('does not fire when every task is checked', async () => {
      await writeDesign(designText('pending-pm'));
      await writeTasks(taskText(true, true));
      const status = await new WorkflowNavigator(makeStubConfig(GATE_ON)).getStatus(project());
      expect(status.activeSlice?.status).toBe('complete');
      expect(status.activeSlice?.pendingDecisions).toBeUndefined();
    });
  });

  describe('precedence over review gates', () => {
    const reviewOn = makeStubConfig({ ...GATE_ENABLED_DEFAULTS, 'workflow.decision_gate_enabled': true });

    it('wins over a missing review artifact', async () => {
      await writeDesign(designText('pending-pm'));
      const next = await new WorkflowNavigator(reviewOn).getNext(project());
      expect(next.recommendation).toBe('Blocked: design has pending PM decisions');
    });

    it('still fires for a review: none design', async () => {
      await writeDesign(designText('pending-pm', 'review: none\n'));
      const status = await new WorkflowNavigator(reviewOn).getStatus(project());
      expect(status.activeSlice?.status).toBe('pending-decision');
    });
  });

  describe('off', () => {
    it('with the key set to false, gives the pre-245 result', async () => {
      await writeDesign(designText('pending-pm'));
      const config = makeStubConfig({ ...GATE_ON, 'workflow.decision_gate_enabled': false });
      const next = await new WorkflowNavigator(config).getNext(project());
      expect(next.recommendation).toBe('Create task breakdown (Phase 5)');
      expect(next.pendingDecisions).toBeUndefined();
    });

    it('with no ConfigManager, gives the pre-245 result', async () => {
      await writeDesign(designText('pending-pm'));
      const next = await new WorkflowNavigator().getNext(project());
      expect(next.recommendation).toBe('Create task breakdown (Phase 5)');
    });

    it('returns the normal recommendation once the decision is decided', async () => {
      await writeDesign(designText('decided'));
      const next = await new WorkflowNavigator(makeStubConfig(GATE_ON)).getNext(project());
      expect(next.recommendation).toBe('Create task breakdown (Phase 5)');
    });
  });

  it('rejects when the design cannot be read', async () => {
    // A directory where the design file should be: detected, but unreadable as a file.
    await mkdir(join(root, 'project-documents/user/slices', SLICE_FILE));
    const nav = new WorkflowNavigator(makeStubConfig(GATE_ON));
    await expect(nav.getNext(project())).rejects.toThrow();
  });

  it('suggests moving the project back to Phase 4 when it is set to Phase 6', async () => {
    await writeDesign(designText('pending-pm'));
    await writeTasks(taskText(true, false));
    const next = await new WorkflowNavigator(makeStubConfig(GATE_ON)).getNext(
      project({ developmentPhase: 'Phase 6: Implementation' }),
    );
    expect(next.suggestedCommand).toBe("cf set phase 'Phase 4: Slice Design'");
  });
});
