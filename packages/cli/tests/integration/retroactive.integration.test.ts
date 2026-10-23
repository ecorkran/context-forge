import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Slice 263: `cf list slices --json` on an adopted project. Like list-derived-status.test.ts,
// only FileProjectStore is mocked; the artifacts are real files on disk.

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
    resolveProjectWorktree: vi.fn().mockResolvedValue({ id: 'proj_adopted', worktreeId: undefined }),
  };
});

import { sliceListAction } from '../../src/commands/slice.js';

const MARKER = '`retroactive`';

describe('cf list slices --json on an adopted project (slice 263)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  });

  it('shows retroactive true for 100-102 and false for 103-104', async () => {
    const root = mkdtempSync(join(tmpdir(), 'cf-retro-cli-'));
    const dir = join(root, 'project-documents', 'user', 'architecture');
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, '100-slices.existing.md'),
      '---\ndocType: slice-plan\nproject: adopted\n---\n\n# Slice Plan\n\n' +
        `1. [x] **(100) Existing Core** ${MARKER} — built before adoption.\n` +
        `2. [x] **(101) Existing CLI** ${MARKER} — built before adoption.\n` +
        `3. [x] **(102) Existing Docs** ${MARKER} — built before adoption.\n` +
        '4. [ ] **(103) New Feature** — first new work.\n' +
        '5. [ ] **(104) Another Feature** — second new work.\n',
    );
    mockGetById.mockResolvedValue({
      id: 'proj_adopted',
      name: 'adopted',
      template: 'default',
      projectPath: root,
      fileSlicePlan: '100-slices.existing',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    });

    await sliceListAction({ json: true });

    const parsed = JSON.parse(vi.mocked(process.stdout.write).mock.calls[0]?.[0] as string);
    expect(
      parsed.entries.map((e: { index: number; retroactive: boolean }) => [e.index, e.retroactive]),
    ).toEqual([
      [100, true],
      [101, true],
      [102, true],
      [103, false],
      [104, false],
    ]);
  });
});
