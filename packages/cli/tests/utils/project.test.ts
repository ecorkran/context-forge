import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resolveProjectId, findByNameOrId, findProjectByCwd } from '../../src/utils/project.js';
import { UserError } from '../../src/utils/errors.js';

// Mock ConfigManager and FileProjectStore
vi.mock('@context-forge/core/node', () => ({
  ConfigManager: vi.fn().mockImplementation(() => ({
    get: vi.fn(),
  })),
  FileProjectStore: vi.fn(),
}));

import { ConfigManager, FileProjectStore } from '@context-forge/core/node';

/** Helper to create a mock store with predefined projects. */
function mockStore(projects: Array<{ id: string; name: string; projectPath?: string }>) {
  return {
    getAll: vi.fn().mockResolvedValue(projects),
    getById: vi.fn(),
  } as unknown as FileProjectStore;
}

describe('findByNameOrId', () => {
  const projects = [
    { id: 'project_001', name: 'context-forge', projectPath: '/repos/cf' },
    { id: 'project_002', name: 'orchestration', projectPath: '/repos/orch' },
    { id: 'project_003', name: 'Context-Visualizer', projectPath: '/repos/cv' },
  ];

  it('returns exact ID match', async () => {
    const store = mockStore(projects);
    const result = await findByNameOrId('project_002', store);
    expect(result).toEqual(projects[1]);
  });

  it('returns case-insensitive name match', async () => {
    const store = mockStore(projects);
    const result = await findByNameOrId('ORCHESTRATION', store);
    expect(result).toEqual(projects[1]);
  });

  it('returns case-insensitive name match (mixed case)', async () => {
    const store = mockStore(projects);
    const result = await findByNameOrId('context-visualizer', store);
    expect(result).toEqual(projects[2]);
  });

  it('returns null when no match found', async () => {
    const store = mockStore(projects);
    const result = await findByNameOrId('nonexistent', store);
    expect(result).toBeNull();
  });

  it('ID match takes priority over name match', async () => {
    // Create a scenario where an ID could also be a name
    const ambiguous = [
      { id: 'orchestration', name: 'id-is-also-a-name', projectPath: '/a' },
      { id: 'project_999', name: 'orchestration', projectPath: '/b' },
    ];
    const store = mockStore(ambiguous);
    const result = await findByNameOrId('orchestration', store);
    // Should match the first project by ID, not the second by name
    expect(result).toEqual(ambiguous[0]);
  });
});

describe('findProjectByCwd', () => {
  const projects = [
    { id: 'p1', name: 'outer', projectPath: '/repos/outer' },
    { id: 'p2', name: 'inner', projectPath: '/repos/outer/packages/inner' },
    { id: 'p3', name: 'other', projectPath: '/repos/other' },
    { id: 'p4', name: 'no-path' },
  ];

  it('returns exact path match', async () => {
    vi.spyOn(process, 'cwd').mockReturnValue('/repos/other');
    const store = mockStore(projects);
    const result = await findProjectByCwd(store);
    expect(result).toEqual(projects[2]);
    vi.restoreAllMocks();
  });

  it('returns subdirectory match', async () => {
    vi.spyOn(process, 'cwd').mockReturnValue('/repos/other/src/components');
    const store = mockStore(projects);
    const result = await findProjectByCwd(store);
    expect(result).toEqual(projects[2]);
    vi.restoreAllMocks();
  });

  it('longest match wins when paths overlap', async () => {
    vi.spyOn(process, 'cwd').mockReturnValue('/repos/outer/packages/inner/src');
    const store = mockStore(projects);
    const result = await findProjectByCwd(store);
    // inner (/repos/outer/packages/inner) is longer than outer (/repos/outer)
    expect(result).toEqual(projects[1]);
    vi.restoreAllMocks();
  });

  it('returns null when no match', async () => {
    vi.spyOn(process, 'cwd').mockReturnValue('/completely/different');
    const store = mockStore(projects);
    const result = await findProjectByCwd(store);
    expect(result).toBeNull();
    vi.restoreAllMocks();
  });

  it('skips projects without projectPath', async () => {
    vi.spyOn(process, 'cwd').mockReturnValue('/repos/outer');
    const store = mockStore([{ id: 'p4', name: 'no-path' }]);
    const result = await findProjectByCwd(store);
    expect(result).toBeNull();
    vi.restoreAllMocks();
  });

  it('handles projectPath with trailing slash', async () => {
    vi.spyOn(process, 'cwd').mockReturnValue('/repos/trailing/src');
    const store = mockStore([{ id: 'p5', name: 'trailing', projectPath: '/repos/trailing/' }]);
    const result = await findProjectByCwd(store);
    expect(result).toEqual({ id: 'p5', name: 'trailing', projectPath: '/repos/trailing/' });
    vi.restoreAllMocks();
  });
});

describe('resolveProjectId', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns explicit ID when provided', async () => {
    const result = await resolveProjectId('my-project');
    expect(result).toBe('my-project');
  });

  it('falls back to default_project config', async () => {
    const mockGet = vi.fn().mockResolvedValue({ value: 'config-project' });
    vi.mocked(ConfigManager).mockImplementation(
      () => ({ get: mockGet }) as unknown as InstanceType<typeof ConfigManager>,
    );

    const result = await resolveProjectId();
    expect(result).toBe('config-project');
    expect(mockGet).toHaveBeenCalledWith('default_project');
  });

  it('throws UserError when no ID available', async () => {
    const mockGet = vi.fn().mockResolvedValue({ value: '' });
    vi.mocked(ConfigManager).mockImplementation(
      () => ({ get: mockGet }) as unknown as InstanceType<typeof ConfigManager>,
    );

    await expect(resolveProjectId()).rejects.toThrow(UserError);
    await expect(resolveProjectId()).rejects.toThrow('--project');
  });
});
