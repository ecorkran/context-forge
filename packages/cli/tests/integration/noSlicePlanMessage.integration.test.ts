import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Slice 273 run defect: with no slice plan set, the error named `cf set slicePlan`,
// which is not a settable field (the field is fileSlicePlan, alias `plan`).

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
    resolveProjectWorktree: vi.fn().mockResolvedValue({ id: 'proj_noplan', worktreeId: undefined }),
  };
});

const mockSetAction = vi.hoisted(() => vi.fn());
vi.mock('../../src/commands/project.js', () => ({ projectSetAction: mockSetAction }));

import { sliceListAction } from '../../src/commands/slice.js';

describe('cf list slices with no slice plan configured', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('suggests the real `cf set plan` command', async () => {
    mockGetById.mockResolvedValue({
      id: 'proj_noplan',
      name: 'noplan',
      template: 'default',
      projectPath: mkdtempSync(join(tmpdir(), 'cf-noplan-')),
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    });

    const failure = await sliceListAction({}).then(
      () => null,
      (err: Error) => err,
    );

    expect(failure?.message).toContain('cf set plan <path>');
    expect(failure?.message).not.toContain('slicePlan');
  });

  // #137: the files exist after a completed adoption, but nothing set them on the project.
  it('registers a completed adoption\'s architecture and plan instead of failing', async () => {
    const root = mkdtempSync(join(tmpdir(), 'cf-adopted-'));
    const dir = join(root, 'project-documents', 'user', 'architecture');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, '100-arch.adopted.md'), '---\ndocType: architecture\nprovenance: derived\n---\n\n# Arch\n');
    writeFileSync(
      join(dir, '100-slices.adopted.md'),
      '---\ndocType: slice-plan\nproject: adopted\n---\n\n# Slice Plan\n\n' +
        '1. [x] **(100) Existing Core** `retroactive` — built before adoption.\n' +
        '2. [ ] **(103) New Feature** — first new work.\n',
    );
    const project: Record<string, unknown> = {
      id: 'proj_noplan',
      name: 'adopted',
      template: 'default',
      projectPath: root,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    };
    mockGetById.mockImplementation(async () => ({ ...project }));
    // Stands in for `cf set arch`: it also sets the plan, as computeAutoSetFields does.
    mockSetAction.mockImplementation(async (field: string, value: string) => {
      if (field === 'arch') {
        project.fileArch = value;
        project.fileSlicePlan = value.replace('-arch.', '-slices.');
      }
    });
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    await sliceListAction({ json: true });

    const parsed = JSON.parse(vi.mocked(process.stdout.write).mock.calls[0]?.[0] as string);
    expect(parsed.entries.map((e: { index: number }) => e.index)).toEqual([100, 103]);
  });
});
