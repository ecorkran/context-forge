import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Slice 913 TD-3: [archIndex] positional argument on `cf list slices` / `cf
// list tasks` targets a non-active slice plan directly, without mutating
// project state (project.fileArch/fileSlicePlan/fileSlice). Exercises real
// scratch filesystem fixtures (only FileProjectStore is mocked), matching
// list-derived-status.test.ts's convention.

const mockGetById = vi.fn();

vi.mock('@context-forge/core/node', async () => {
  const actual = await vi.importActual('@context-forge/core/node');
  return {
    ...actual,
    FileProjectStore: vi.fn().mockImplementation(() => ({
      getById: mockGetById,
      getAll: vi.fn().mockResolvedValue([]),
    })),
  };
});

vi.mock('../../src/utils/project.js', async () => {
  const actual = await vi.importActual('../../src/utils/project.js');
  return {
    ...actual,
    resolveProjectWorktree: vi.fn().mockResolvedValue({ id: 'proj_scratch', worktreeId: undefined }),
  };
});

import { sliceListAction } from '../../src/commands/slice.js';
import { taskListAction } from '../../src/commands/task.js';

function makeProject(projectPath: string, overrides: Record<string, unknown> = {}) {
  return {
    id: 'proj_scratch',
    name: 'scratch-project',
    template: 'default',
    projectPath,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function writeSlicePlan(root: string, filename: string, body: string): void {
  mkdirSync(join(root, 'project-documents', 'user', 'architecture'), { recursive: true });
  writeFileSync(
    join(root, 'project-documents', 'user', 'architecture', filename),
    `---\ndocType: slice-plan\nproject: scratch\n---\n\n# Slice Plan\n\n${body}\n`,
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

describe('cf list slices [archIndex] (slice 913 TD-3)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  });

  it('valid archIndex returns the target plan entries without reading project.fileSlicePlan', async () => {
    const root = mkdtempSync(join(tmpdir(), 'cf-list-slices-archidx-'));
    writeSlicePlan(root, '700-slices.other-initiative.md', '1. [x] **(701) Other Slice** — from a different plan.');
    // Active project has NO fileSlicePlan configured at all — proves the
    // archIndex path never depends on it.
    mockGetById.mockResolvedValue(makeProject(root));

    await sliceListAction({ json: true, archIndex: '700' });

    const output = vi.mocked(process.stdout.write).mock.calls[0]?.[0] as string;
    const parsed = JSON.parse(output);
    expect(parsed.slicePlan).toBe('700-slices.other-initiative');
    expect(parsed.entries).toHaveLength(1);
    expect(parsed.entries[0].index).toBe(701);
    expect(parsed.entries[0].name).toBe('Other Slice');
  });

  it('missing archIndex throws a UserError naming the index and searched directory', async () => {
    const root = mkdtempSync(join(tmpdir(), 'cf-list-slices-archidx-missing-'));
    mkdirSync(join(root, 'project-documents', 'user', 'architecture'), { recursive: true });
    mockGetById.mockResolvedValue(makeProject(root));

    await expect(sliceListAction({ json: true, archIndex: '999' }))
      .rejects.toThrow(/No slice plan found for index '999'.*project-documents\/user\/architecture/);
  });

  it('non-numeric archIndex throws a UserError', async () => {
    const root = mkdtempSync(join(tmpdir(), 'cf-list-slices-archidx-nan-'));
    mockGetById.mockResolvedValue(makeProject(root));

    await expect(sliceListAction({ json: true, archIndex: 'abc' }))
      .rejects.toThrow(/Invalid archIndex/);
  });

  it('project state is byte-identical before and after an archIndex call', async () => {
    const root = mkdtempSync(join(tmpdir(), 'cf-list-slices-archidx-nomutate-'));
    writeSlicePlan(root, '700-slices.other-initiative.md', '1. [x] **(701) Other Slice** — untouched.');
    const project = makeProject(root, { fileSlicePlan: '900-slices.active.md', fileArch: '900-arch.active', fileSlice: '905-slice.active' });
    mockGetById.mockResolvedValue(project);

    const before = JSON.stringify(project);
    await sliceListAction({ json: true, archIndex: '700' });
    const after = JSON.stringify(project);

    expect(after).toBe(before);
  });
});

describe('cf list tasks [archIndex] (slice 913 TD-3)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  });

  it('valid archIndex returns the target plan task summaries without reading project.fileSlicePlan', async () => {
    const root = mkdtempSync(join(tmpdir(), 'cf-list-tasks-archidx-'));
    writeSlicePlan(root, '700-slices.other-initiative.md', '1. [ ] **(701) Other Slice** — from a different plan.');
    writeTaskFile(root, 701, 'other-slice', ['x', ' ']);
    mockGetById.mockResolvedValue(makeProject(root));

    await taskListAction({ json: true, archIndex: '700' });

    const output = vi.mocked(process.stdout.write).mock.calls[0]?.[0] as string;
    const parsed = JSON.parse(output);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].index).toBe(701);
    expect(parsed[0].total).toBe(2);
    expect(parsed[0].completed).toBe(1);
  });

  it('missing archIndex throws a UserError naming the index and searched directory', async () => {
    const root = mkdtempSync(join(tmpdir(), 'cf-list-tasks-archidx-missing-'));
    mkdirSync(join(root, 'project-documents', 'user', 'architecture'), { recursive: true });
    mockGetById.mockResolvedValue(makeProject(root));

    await expect(taskListAction({ json: true, archIndex: '999' }))
      .rejects.toThrow(/No slice plan found for index '999'.*project-documents\/user\/architecture/);
  });

  it('archIndex combined with --all throws the mutual-exclusion UserError', async () => {
    const root = mkdtempSync(join(tmpdir(), 'cf-list-tasks-archidx-all-'));
    mockGetById.mockResolvedValue(makeProject(root));

    await expect(taskListAction({ json: true, archIndex: '700', all: true }))
      .rejects.toThrow(/cannot combine an explicit index with --all/);
  });

  it('project state is byte-identical before and after an archIndex call', async () => {
    const root = mkdtempSync(join(tmpdir(), 'cf-list-tasks-archidx-nomutate-'));
    writeSlicePlan(root, '700-slices.other-initiative.md', '1. [ ] **(701) Other Slice** — untouched.');
    writeTaskFile(root, 701, 'other-slice', [' ']);
    const project = makeProject(root, { fileSlicePlan: '900-slices.active.md', fileArch: '900-arch.active', fileSlice: '905-slice.active' });
    mockGetById.mockResolvedValue(project);

    const before = JSON.stringify(project);
    await taskListAction({ json: true, archIndex: '700' });
    const after = JSON.stringify(project);

    expect(after).toBe(before);
  });
});
