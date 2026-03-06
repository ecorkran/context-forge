import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resolveFileByIndex } from '../../src/schema/resolveFileByIndex.js';

vi.mock('node:fs', () => ({
  readdirSync: vi.fn(),
}));

import { readdirSync } from 'node:fs';
const mockReaddir = vi.mocked(readdirSync);

describe('resolveFileByIndex', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('resolves fileSlice by index', () => {
    mockReaddir.mockReturnValue(['171-slice.project-schema.md'] as unknown as ReturnType<typeof readdirSync>);
    expect(resolveFileByIndex('/project', 'fileSlice', '171')).toBe('171-slice.project-schema');
  });

  it('resolves fileTasks by index', () => {
    mockReaddir.mockReturnValue(['171-tasks.project-schema.md'] as unknown as ReturnType<typeof readdirSync>);
    expect(resolveFileByIndex('/project', 'fileTasks', '171')).toBe('171-tasks.project-schema');
  });

  it('resolves fileArch by index', () => {
    mockReaddir.mockReturnValue(['160-arch.project-workflow-system.md'] as unknown as ReturnType<typeof readdirSync>);
    expect(resolveFileByIndex('/project', 'fileArch', '160')).toBe('160-arch.project-workflow-system');
  });

  it('resolves fileSlicePlan by index', () => {
    mockReaddir.mockReturnValue(['160-slices.project-workflow-system.md'] as unknown as ReturnType<typeof readdirSync>);
    expect(resolveFileByIndex('/project', 'fileSlicePlan', '160')).toBe('160-slices.project-workflow-system');
  });

  it('resolves fileHLD with hld. prefix', () => {
    mockReaddir.mockReturnValue(['050-hld.context-forge.md'] as unknown as ReturnType<typeof readdirSync>);
    expect(resolveFileByIndex('/project', 'fileHLD', '050')).toBe('050-hld.context-forge');
  });

  it('resolves fileHLD with arch.hld- prefix', () => {
    mockReaddir.mockReturnValue(['050-arch.hld-context-forge.md'] as unknown as ReturnType<typeof readdirSync>);
    expect(resolveFileByIndex('/project', 'fileHLD', '050')).toBe('050-arch.hld-context-forge');
  });

  it('throws when no match is found', () => {
    mockReaddir.mockReturnValue(['999-slice.other.md'] as unknown as ReturnType<typeof readdirSync>);
    expect(() => resolveFileByIndex('/project', 'fileSlice', '171'))
      .toThrow(/No file matching index '171'/);
  });

  it('throws when multiple matches exist', () => {
    mockReaddir.mockReturnValue([
      '171-slice.alpha.md',
      '171-slice.beta.md',
    ] as unknown as ReturnType<typeof readdirSync>);
    expect(() => resolveFileByIndex('/project', 'fileSlice', '171'))
      .toThrow(/Multiple files match/);
  });

  it('returns null for non-artifact fields', () => {
    expect(resolveFileByIndex('/project', 'name', '42')).toBeNull();
    expect(resolveFileByIndex('/project', 'developmentPhase', '6')).toBeNull();
  });

  it('throws when directory does not exist', () => {
    mockReaddir.mockImplementation(() => { throw new Error('ENOENT'); });
    expect(() => resolveFileByIndex('/project', 'fileSlice', '171'))
      .toThrow(/Cannot scan directory/);
  });

  it('ignores non-.md files', () => {
    mockReaddir.mockReturnValue([
      '171-slice.project-schema.md',
      '171-slice.project-schema.bak',
    ] as unknown as ReturnType<typeof readdirSync>);
    expect(resolveFileByIndex('/project', 'fileSlice', '171')).toBe('171-slice.project-schema');
  });
});
