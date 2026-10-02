import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { WorkflowNavigator } from '../../src/introspection/WorkflowNavigator.js';
import { EXEMPT_NOTE, EXEMPT_REASON } from '../../src/introspection/reviewGate.js';
import type { ResolvedProject } from '../../src/types/project.js';
import { makeStubConfig } from '../helpers/stubConfig.js';

const INDEX = 970;
const NAME = 'docs-only';
const NOTE = EXEMPT_NOTE[EXEMPT_REASON.ReviewNone];

const GATE_ENABLED = {
  'workflow.review_enabled': true,
  'workflow.review_threshold': 'concerns',
  'workflow.review_unknown_as': 'fail',
  'workflow.review_weak_pass_as': 'pass',
  'workflow.review_gates.arch.threshold': '',
  'workflow.review_gates.slice.threshold': '',
  'workflow.review_gates.tasks.threshold': '',
  'workflow.review_gates.code.threshold': '',
  'workflow.review_gate_effective_date': '',
};

interface SliceSpec {
  /** Extra slice-design frontmatter lines, e.g. 'review: none' */
  designFrontmatter?: string[];
  /** Task checkbox states; omitted → no task file */
  tasks?: boolean[];
  /** Review verdicts to write, keyed by review type */
  reviews?: Partial<Record<'slice' | 'tasks' | 'code', string>>;
}

function makeSliceProject(spec: SliceSpec): ResolvedProject {
  const root = mkdtempSync(join(tmpdir(), 'cf-review-visibility-'));
  const user = join(root, 'project-documents', 'user');
  for (const dir of ['slices', 'tasks', 'reviews']) mkdirSync(join(user, dir), { recursive: true });

  writeFileSync(
    join(user, 'slices', `${INDEX}-slice.${NAME}.md`),
    ['---', `slice: ${NAME}`, 'status: in_progress', 'dateCreated: 20261001', ...(spec.designFrontmatter ?? []), '---', '', '# Slice'].join('\n'),
  );
  if (spec.tasks) {
    const items = spec.tasks.map((done, i) => `- [${done ? 'x' : ' '}] Task ${i + 1}`);
    writeFileSync(
      join(user, 'tasks', `${INDEX}-tasks.${NAME}.md`),
      ['---', `slice: ${NAME}`, '---', '', '## Tasks', '', ...items, ''].join('\n'),
    );
  }
  for (const [type, verdict] of Object.entries(spec.reviews ?? {})) {
    writeFileSync(
      join(user, 'reviews', `${INDEX}-review.${type}.${NAME}.md`),
      ['---', 'docType: review', `verdict: ${verdict}`, '---', ''].join('\n'),
    );
  }

  return {
    id: 'visibility-1',
    name: 'visibility-project',
    template: 'default',
    fileSlice: `${INDEX}-slice.${NAME}.md`,
    fileTasks: spec.tasks ? `${INDEX}-tasks.${NAME}.md` : undefined,
    instruction: 'implementation',
    createdAt: '2026-01-01',
    updatedAt: '2026-10-01',
    projectPath: root,
  };
}

const REVIEW_NONE = ['review: none'];

describe('WorkflowNavigator — review exemption visibility (slice 928)', () => {
  const gated = new WorkflowNavigator(makeStubConfig(GATE_ENABLED));

  it('design only (needs-tasks) → note appended, gateExempt set', async () => {
    const project = makeSliceProject({ designFrontmatter: REVIEW_NONE });
    const status = await gated.getStatus(project);
    expect(status.activeSlice!.status).toBe('needs-tasks');
    expect(status.activeSlice!.gateExempt).toBe(EXEMPT_REASON.ReviewNone);

    const next = await gated.getNext(project);
    expect(next.rationale.endsWith(`(${NOTE})`)).toBe(true);
  });

  it('mid-implementation → note present, status still in-implementation', async () => {
    const project = makeSliceProject({ designFrontmatter: REVIEW_NONE, tasks: [true, false, false] });
    const status = await gated.getStatus(project);
    expect(status.activeSlice!.status).toBe('in-implementation');
    expect(status.activeSlice!.gateExempt).toBe(EXEMPT_REASON.ReviewNone);
    expect((await gated.getNext(project)).rationale).toContain(NOTE);
  });

  it('all tasks complete → note present', async () => {
    const project = makeSliceProject({ designFrontmatter: REVIEW_NONE, tasks: [true, true] });
    const status = await gated.getStatus(project);
    expect(status.activeSlice!.status).toBe('complete');
    expect((await gated.getNext(project)).rationale).toContain(NOTE);
  });

  it('gating off → no note, no gateExempt', async () => {
    const ungated = new WorkflowNavigator(makeStubConfig({ ...GATE_ENABLED, 'workflow.review_enabled': false }));
    const project = makeSliceProject({ designFrontmatter: REVIEW_NONE, tasks: [true, false] });
    expect((await ungated.getStatus(project)).activeSlice!.gateExempt).toBeUndefined();
    expect((await ungated.getNext(project)).rationale).not.toContain(NOTE);
  });

  it('no config at all → no note', async () => {
    const project = makeSliceProject({ designFrontmatter: REVIEW_NONE, tasks: [true, false] });
    expect((await new WorkflowNavigator().getNext(project)).rationale).not.toContain(NOTE);
  });

  it('grandfathered review: none slice → no note', async () => {
    const cutoff = new WorkflowNavigator(
      makeStubConfig({ ...GATE_ENABLED, 'workflow.review_gate_effective_date': '20270101' }),
    );
    const project = makeSliceProject({ designFrontmatter: REVIEW_NONE, tasks: [true, false] });
    expect((await cutoff.getStatus(project)).activeSlice!.gateExempt).toBeUndefined();
    expect((await cutoff.getNext(project)).rationale).not.toContain(NOTE);
  });

  it('normal slice with passing reviews → no note', async () => {
    const project = makeSliceProject({ tasks: [true, false], reviews: { slice: 'PASS', tasks: 'PASS' } });
    const status = await gated.getStatus(project);
    expect(status.activeSlice!.status).toBe('in-implementation');
    expect(status.activeSlice!.gateExempt).toBeUndefined();
    expect((await gated.getNext(project)).rationale).not.toContain('review gate skipped');
  });
});
