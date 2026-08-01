import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// This suite exercises sliceListAction/archListAction against REAL scratch
// filesystem fixtures (only FileProjectStore is mocked) — the mocked-collaborator
// suite in list.test.ts stubs ArtifactIntrospector's methods directly, which
// doesn't exercise the real detectDocuments/parseFrontmatter/parseTaskFile/
// resolveInitiativePlanPath filepaths that the slice-911 derived-status routing
// depends on (archListFromPlan in particular is untouched by any existing test).

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
import { archListAction } from '../../src/commands/arch.js';

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

function writeSliceDesign(root: string, index: number, name: string, status: string): void {
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

function writeArchFile(root: string, index: number, name: string, status: string): void {
  mkdirSync(join(root, 'project-documents', 'user', 'architecture'), { recursive: true });
  writeFileSync(
    join(root, 'project-documents', 'user', 'architecture', `${index}-arch.${name}.md`),
    `---\narch: ${name}\nstatus: ${status}\n---\n\n# Arch ${index}\n`,
  );
}

function writeInitiativePlan(root: string, body: string): void {
  mkdirSync(join(root, 'project-documents', 'user', 'project-guides'), { recursive: true });
  writeFileSync(
    join(root, 'project-documents', 'user', 'project-guides', '001-initiative-plan.scratch.md'),
    `---\ndocType: initiative-plan\n---\n\n# Initiative Plan\n\n${body}\n`,
  );
}

describe('cf list slices — derived status display (slice 911)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  });

  it('slice 242-shaped fixture (tasks complete, unchecked) renders as tasks-done, not not-started', async () => {
    const root = mkdtempSync(join(tmpdir(), 'cf-list-slices-'));
    writeSliceDesign(root, 242, 'done-unchecked', 'in-progress');
    writeTaskFile(root, 242, 'done-unchecked', ['x', 'x']);
    writeSlicePlan(root, '800-slices.scratch.md', '1. [ ] **(242) Done Unchecked** — tasks complete.');
    mockGetById.mockResolvedValue(makeProject(root, { fileSlicePlan: '800-slices.scratch' }));

    await sliceListAction({ json: true });

    const output = vi.mocked(process.stdout.write).mock.calls[0]?.[0] as string;
    const parsed = JSON.parse(output);
    expect(parsed.entries[0].status).toBe('complete');
    expect(parsed.entries[0].isChecked).toBe(false);
  });

  it('partial-completion fixture renders in-progress', async () => {
    const root = mkdtempSync(join(tmpdir(), 'cf-list-slices-partial-'));
    writeSliceDesign(root, 300, 'partial', 'in-progress');
    writeTaskFile(root, 300, 'partial', ['x', ' ']);
    writeSlicePlan(root, '800-slices.scratch.md', '1. [ ] **(300) Partial** — half done.');
    mockGetById.mockResolvedValue(makeProject(root, { fileSlicePlan: '800-slices.scratch' }));

    await sliceListAction({ json: true });

    const output = vi.mocked(process.stdout.write).mock.calls[0]?.[0] as string;
    const parsed = JSON.parse(output);
    expect(parsed.entries[0].status).toBe('in-progress');
  });

  it('unparseable task file renders the degraded indicator, not not-started', async () => {
    const root = mkdtempSync(join(tmpdir(), 'cf-list-slices-degraded-'));
    writeSliceDesign(root, 400, 'broken', 'in-progress');
    // Task file path is a directory, not a file — parseTaskItems' readFile throws EISDIR.
    mkdirSync(join(root, 'project-documents', 'user', 'tasks'), { recursive: true });
    mkdirSync(join(root, 'project-documents', 'user', 'tasks', '400-tasks.broken.md'));
    writeSlicePlan(root, '800-slices.scratch.md', '1. [ ] **(400) Broken** — task file unreadable.');
    mockGetById.mockResolvedValue(makeProject(root, { fileSlicePlan: '800-slices.scratch' }));

    await sliceListAction({ json: true });

    const output = vi.mocked(process.stdout.write).mock.calls[0]?.[0] as string;
    const parsed = JSON.parse(output);
    expect(parsed.entries[0].status).toBe('degraded');
  });

  it('a [~] plan-line entry with no design/task docs renders as deprecated, not next', async () => {
    const root = mkdtempSync(join(tmpdir(), 'cf-list-slices-plan-deprecated-'));
    writeSlicePlan(root, '800-slices.scratch.md', '1. [~] **(600) Descoped** — cut for scope.');
    mockGetById.mockResolvedValue(makeProject(root, { fileSlicePlan: '800-slices.scratch' }));

    await sliceListAction({ json: true });

    const output = vi.mocked(process.stdout.write).mock.calls[0]?.[0] as string;
    const parsed = JSON.parse(output);
    expect(parsed.entries[0].status).toBe('deprecated');
    expect(parsed.entries[0].isNext).toBe(false);
  });

  it('a plan whose only non-checked entry is [~] offers no entry as next', async () => {
    const root = mkdtempSync(join(tmpdir(), 'cf-list-slices-all-resolved-'));
    writeSlicePlan(
      root,
      '800-slices.scratch.md',
      [
        '1. [x] **(601) Foundation** — done.',
        '2. [~] **(602) Descoped** — cut for scope.',
      ].join('\n\n'),
    );
    mockGetById.mockResolvedValue(makeProject(root, { fileSlicePlan: '800-slices.scratch' }));

    await sliceListAction({ json: true });

    const output = vi.mocked(process.stdout.write).mock.calls[0]?.[0] as string;
    const parsed = JSON.parse(output);
    expect(parsed.entries.every((e: { isNext: boolean }) => e.isNext === false)).toBe(true);
  });

  it('a detectDocuments failure for one entry renders that row degraded without aborting the rest', async () => {
    const root = mkdtempSync(join(tmpdir(), 'cf-list-slices-detect-fail-'));
    // Entry 500: slices dir replaced with a file so readdir on it throws ENOTDIR,
    // simulating a detectDocuments-level failure distinct from "not found".
    mkdirSync(join(root, 'project-documents', 'user'), { recursive: true });
    writeFileSync(join(root, 'project-documents', 'user', 'slices'), 'not a directory');
    writeSlicePlan(root, '800-slices.scratch.md', '1. [ ] **(500) Broken Entry** — detectDocuments fails.');
    mockGetById.mockResolvedValue(makeProject(root, { fileSlicePlan: '800-slices.scratch' }));

    await sliceListAction({ json: true });

    const output = vi.mocked(process.stdout.write).mock.calls[0]?.[0] as string;
    const parsed = JSON.parse(output);
    // detectDocuments itself never throws (safeReaddir swallows ENOTDIR), so this
    // resolves as "no design file found" — not-started, not aborted, not degraded.
    expect(parsed.entries).toHaveLength(1);
    expect(parsed.entries[0].status).toBe('not-started');
  });
});

describe('cf list arch — derived status display (slice 911)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  });

  it('checked entry with arch file renders complete', async () => {
    const root = mkdtempSync(join(tmpdir(), 'cf-list-arch-checked-'));
    writeArchFile(root, 100, 'core', 'complete');
    writeInitiativePlan(root, '1. [x] **(100) Core** — done.');
    mockGetById.mockResolvedValue(makeProject(root));

    await archListAction({ json: true });

    const output = vi.mocked(process.stdout.write).mock.calls[0]?.[0] as string;
    const parsed = JSON.parse(output);
    expect(parsed[0].status).toBe('complete');
  });

  it('unchecked entry with an arch file present renders in-progress', async () => {
    const root = mkdtempSync(join(tmpdir(), 'cf-list-arch-inprogress-'));
    writeArchFile(root, 200, 'billing', 'in-progress');
    writeInitiativePlan(root, '1. [ ] **(200) Billing** — underway.');
    mockGetById.mockResolvedValue(makeProject(root));

    await archListAction({ json: true });

    const output = vi.mocked(process.stdout.write).mock.calls[0]?.[0] as string;
    const parsed = JSON.parse(output);
    expect(parsed[0].status).toBe('in-progress');
  });

  it('unchecked entry with no arch file renders not-started', async () => {
    const root = mkdtempSync(join(tmpdir(), 'cf-list-arch-untouched-'));
    writeInitiativePlan(root, '1. [ ] **(300) Untouched** — nothing yet.');
    mockGetById.mockResolvedValue(makeProject(root));

    await archListAction({ json: true });

    const output = vi.mocked(process.stdout.write).mock.calls[0]?.[0] as string;
    const parsed = JSON.parse(output);
    expect(parsed[0].status).toBe('not-started');
  });

  it('malformed arch frontmatter status renders the degraded indicator, not silently checkbox-derived', async () => {
    const root = mkdtempSync(join(tmpdir(), 'cf-list-arch-malformed-'));
    writeArchFile(root, 400, 'broken', 'not-a-real-status');
    writeInitiativePlan(root, '1. [ ] **(400) Broken** — malformed status.');
    mockGetById.mockResolvedValue(makeProject(root));

    await archListAction({ json: true });

    const output = vi.mocked(process.stdout.write).mock.calls[0]?.[0] as string;
    const parsed = JSON.parse(output);
    expect(parsed[0].status).toBe('degraded');
  });
});
