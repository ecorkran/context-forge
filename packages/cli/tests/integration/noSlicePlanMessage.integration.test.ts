import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mkdtempSync } from 'node:fs';
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
});
