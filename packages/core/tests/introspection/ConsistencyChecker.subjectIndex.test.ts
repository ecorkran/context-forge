import { join } from 'node:path';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { ConsistencyChecker } from '../../src/introspection/ConsistencyChecker.js';
import { ArtifactIntrospector } from '../../src/introspection/ArtifactIntrospector.js';
import type { ConsistencyFinding } from '../../src/introspection/types.js';
import type { ProjectData } from '../../src/types/project.js';

/**
 * Slice 213 D1: every fixable finding carries `fixAction.subjectIndex`, the
 * index of the document or plan entry the fix is about. Runs the real
 * introspector over a real document tree that trips every fixable rule once.
 */

const PROJECT = 'subject-index';
const DATES = 'dateCreated: 20260101\ndateUpdated: 20260101';

let root: string;
let findings: ConsistencyFinding[];

async function put(rel: string, content: string): Promise<void> {
  const full = join(root, 'project-documents', 'user', rel);
  await mkdir(join(full, '..'), { recursive: true });
  await writeFile(full, content, 'utf-8');
}

function fm(fields: string, dates = DATES): string {
  return `---\n${fields}\nproject: ${PROJECT}\n${dates}\n---\n`;
}

beforeAll(async () => {
  root = realpathSync(await mkdtemp(join(tmpdir(), 'cc-subject-index-')));

  // Slice plan 120, marked complete while entries disagree → plan-status-vs-entries.
  // 121: tasks done, entry unchecked → task-vs-plan (check).
  // 122: entry checked, tasks partial → task-vs-plan (uncheck).
  // 123: design complete, entry unchecked, no tasks → plan-vs-frontmatter (checkbox).
  await put(
    'architecture/120-slices.alpha.md',
    fm('docType: slice-plan\nstatus: complete') +
      '\n# Plan\n\n' +
      '1. [ ] **(121) Slice One** — one\n' +
      '2. [x] **(122) Slice Two** — two\n' +
      '3. [ ] **(123) Slice Three** — three\n',
  );
  // 121 design in_progress with tasks complete → frontmatter-vs-computed.
  await put('slices/121-slice.slice-one.md', fm('docType: slice-design\nslice: slice-one\nstatus: in_progress'));
  // 121 task file status in_progress with all tasks done → task-file-status.
  await put(
    'tasks/121-tasks.slice-one.md',
    fm('docType: tasks\nslice: slice-one\nstatus: in_progress') + '\n- [x] a\n- [x] b\n',
  );
  // 122 design not_started, entry checked → plan-vs-frontmatter (frontmatter).
  await put('slices/122-slice.slice-two.md', fm('docType: slice-design\nslice: slice-two\nstatus: not_started'));
  await put(
    'tasks/122-tasks.slice-two.md',
    fm('docType: tasks\nslice: slice-two\nstatus: in_progress') + '\n- [x] a\n- [ ] b\n',
  );
  await put('slices/123-slice.slice-three.md', fm('docType: slice-design\nslice: slice-three\nstatus: complete'));

  // Arch 120 complete while its plan has unchecked entries → arch-status-vs-plans.
  await put('architecture/120-arch.alpha.md', fm('docType: architecture\narchIndex: 120\ncomponent: alpha\nstatus: complete'));
  // Arch 130 in_progress while its initiative entry is checked → initiative-entry-vs-arch (frontmatter).
  await put('architecture/130-arch.beta.md', fm('docType: architecture\narchIndex: 130\ncomponent: beta\nstatus: in_progress'));

  // Initiative plan complete with an unchecked entry → initiative-plan-status-vs-entries.
  // Entry 120 unchecked while arch 120 is complete → initiative-entry-vs-arch (checkbox).
  await put(
    'project-guides/001-initiative-plan.test.md',
    fm('docType: initiative-plan\nstatus: complete') +
      '\n# Initiatives\n\n' +
      '1. [ ] **(120) Alpha** — alpha\n' +
      '2. [x] **(130) Beta** — beta\n',
  );

  // Frontmatter-schema backfill fixes: one indexed, one unindexed filename.
  await put('reviews/140-review.slice.thing.md', fm('docType: review\nstatus: complete', 'dateCreated: 20260101'));
  await put('reviews/notes-unindexed.md', fm('docType: review\nstatus: complete', 'dateCreated: 20260101'));

  const project: ProjectData = {
    id: 'p1',
    name: PROJECT,
    template: 'default',
    instruction: 'implementation',
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
    projectPath: root,
  };
  const result = await new ConsistencyChecker(new ArtifactIntrospector()).checkAll(project);
  findings = result.findings;
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

/** Fixable findings for `rule`, optionally narrowed to one fix action type. */
function fixable(rule: string, type?: 'update-checkbox' | 'update-frontmatter'): ConsistencyFinding[] {
  return findings.filter(
    (f) => f.fixable && f.rule === rule && (!type || f.fixAction?.type === type),
  );
}

function subjects(list: ConsistencyFinding[]): (number | null)[] {
  return list.map((f) => f.fixAction!.subjectIndex).sort((a, b) => (a ?? -1) - (b ?? -1));
}

describe('ConsistencyChecker — fixAction.subjectIndex coverage (slice 213 D1)', () => {
  it('every fixable finding has a subjectIndex key that is a number or null', () => {
    const all = findings.filter((f) => f.fixable);
    expect(all.length).toBeGreaterThan(0);
    for (const f of all) {
      expect(f.fixAction, `${f.rule}: ${f.description}`).toBeDefined();
      expect('subjectIndex' in f.fixAction!, `${f.rule}: ${f.description}`).toBe(true);
      const idx = f.fixAction!.subjectIndex;
      expect(idx === null || typeof idx === 'number', `${f.rule}: ${f.description}`).toBe(true);
    }
  });

  it('task-vs-plan: slice index of the plan entry (both fixes)', () => {
    expect(subjects(fixable('task-vs-plan'))).toEqual([121, 122]);
  });

  it('plan-vs-frontmatter: slice index of the plan entry (both fixes)', () => {
    expect(subjects(fixable('plan-vs-frontmatter', 'update-frontmatter'))).toEqual([122]);
    expect(subjects(fixable('plan-vs-frontmatter', 'update-checkbox'))).toEqual([123]);
  });

  it('frontmatter-vs-computed: slice index', () => {
    expect(subjects(fixable('frontmatter-vs-computed'))).toContain(121);
  });

  it('task-file-status: slice index', () => {
    expect(subjects(fixable('task-file-status'))).toEqual([121]);
  });

  it('plan-status-vs-entries: slice plan index', () => {
    expect(subjects(fixable('plan-status-vs-entries'))).toEqual([120]);
  });

  it('arch-status-vs-plans: architecture index', () => {
    expect(subjects(fixable('arch-status-vs-plans'))).toEqual([120]);
  });

  it('initiative-entry-vs-arch: architecture / initiative entry index (both fixes)', () => {
    expect(subjects(fixable('initiative-entry-vs-arch', 'update-checkbox'))).toEqual([120]);
    expect(subjects(fixable('initiative-entry-vs-arch', 'update-frontmatter'))).toEqual([130]);
  });

  it('initiative-plan-status-vs-entries: initiative plan index', () => {
    expect(subjects(fixable('initiative-plan-status-vs-entries'))).toEqual([1]);
  });

  it('frontmatter-schema: the leading filename index, or null when unindexed', () => {
    const schema = findings.filter((f) => f.fixable && f.rule === 'frontmatter-schema');
    const byFile = (name: string) => schema.find((f) => f.location.endsWith(name));
    expect(byFile('140-review.slice.thing.md')?.fixAction?.subjectIndex).toBe(140);
    expect(byFile('notes-unindexed.md')?.fixAction?.subjectIndex).toBeNull();
  });
});
