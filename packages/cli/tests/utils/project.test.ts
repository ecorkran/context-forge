import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  resolveProjectId,
  resolveProjectWorktree,
  findByNameOrId,
  findProjectByCwd,
} from '../../src/utils/project.js';
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
function mockStore(projects: Array<Record<string, unknown>>) {
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
    const ambiguous = [
      { id: 'orchestration', name: 'id-is-also-a-name', projectPath: '/a' },
      { id: 'project_999', name: 'orchestration', projectPath: '/b' },
    ];
    const store = mockStore(ambiguous);
    const result = await findByNameOrId('orchestration', store);
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

  it('returns CwdMatch with project on exact path match', async () => {
    vi.spyOn(process, 'cwd').mockReturnValue('/repos/other');
    const store = mockStore(projects);
    const result = await findProjectByCwd(store);
    expect(result?.project).toEqual(projects[2]);
    expect(result?.worktreeId).toBeUndefined();
    vi.restoreAllMocks();
  });

  it('returns CwdMatch with project on subdirectory match', async () => {
    vi.spyOn(process, 'cwd').mockReturnValue('/repos/other/src/components');
    const store = mockStore(projects);
    const result = await findProjectByCwd(store);
    expect(result?.project).toEqual(projects[2]);
    expect(result?.worktreeId).toBeUndefined();
    vi.restoreAllMocks();
  });

  it('longest match wins when paths overlap', async () => {
    vi.spyOn(process, 'cwd').mockReturnValue('/repos/outer/packages/inner/src');
    const store = mockStore(projects);
    const result = await findProjectByCwd(store);
    expect(result?.project).toEqual(projects[1]);
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
    expect(result?.project.id).toBe('p5');
    expect(result?.worktreeId).toBeUndefined();
    vi.restoreAllMocks();
  });

  it('matches via worktreePath and returns worktreeId', async () => {
    vi.spyOn(process, 'cwd').mockReturnValue('/repos/project-api/src');
    const projectWithWorktrees = [
      {
        id: 'p1',
        name: 'project',
        projectPath: '/repos/project',
        worktrees: [
          { id: 'wt_001', name: 'api-worktree', worktreePath: '/repos/project-api' },
        ],
      },
    ];
    const store = mockStore(projectWithWorktrees);
    const result = await findProjectByCwd(store);
    expect(result?.project.id).toBe('p1');
    expect(result?.worktreeId).toBe('wt_001');
    vi.restoreAllMocks();
  });

  it('matches via projectPath when CWD is in project root (no worktrees)', async () => {
    vi.spyOn(process, 'cwd').mockReturnValue('/repos/project/src');
    const projectNoWorktrees = [
      { id: 'p1', name: 'project', projectPath: '/repos/project' },
    ];
    const store = mockStore(projectNoWorktrees);
    const result = await findProjectByCwd(store);
    expect(result?.project.id).toBe('p1');
    expect(result?.worktreeId).toBeUndefined();
    vi.restoreAllMocks();
  });

  it('longest path wins: worktree path beats project path when more specific', async () => {
    vi.spyOn(process, 'cwd').mockReturnValue('/repos/project-api/nested/src');
    const twoWorktrees = [
      {
        id: 'p1',
        name: 'project',
        projectPath: '/repos/project',
        worktrees: [
          { id: 'wt_001', name: 'api', worktreePath: '/repos/project-api' },
          { id: 'wt_002', name: 'nested', worktreePath: '/repos/project-api/nested' },
        ],
      },
    ];
    const store = mockStore(twoWorktrees);
    const result = await findProjectByCwd(store);
    expect(result?.worktreeId).toBe('wt_002');
    vi.restoreAllMocks();
  });

  it('project with empty worktrees array behaves as before', async () => {
    vi.spyOn(process, 'cwd').mockReturnValue('/repos/project/src');
    const projectEmptyWorktrees = [
      { id: 'p1', name: 'project', projectPath: '/repos/project', worktrees: [] },
    ];
    const store = mockStore(projectEmptyWorktrees);
    const result = await findProjectByCwd(store);
    expect(result?.project.id).toBe('p1');
    expect(result?.worktreeId).toBeUndefined();
    vi.restoreAllMocks();
  });
});

describe('resolveProjectWorktree', () => {
  const projects = [
    { id: 'project_001', name: 'context-forge', projectPath: '/repos/cf' },
    {
      id: 'project_002',
      name: 'orchestration',
      projectPath: '/repos/orch',
      worktrees: [
        { id: 'wt_001', name: 'feature', worktreePath: '/repos/orch-feature' },
      ],
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it('resolves explicit flag with source "flag", no worktreeId', async () => {
    const store = mockStore(projects);
    const result = await resolveProjectWorktree('orchestration', store);
    expect(result).toEqual({ id: 'project_002', source: 'flag' });
    expect(result.worktreeId).toBeUndefined();
  });

  it('resolves CWD project path match with source "cwd", no worktreeId', async () => {
    vi.spyOn(process, 'cwd').mockReturnValue('/repos/cf/src');
    const store = mockStore(projects);
    const result = await resolveProjectWorktree(undefined, store);
    expect(result).toEqual({ id: 'project_001', source: 'cwd' });
    expect(result.worktreeId).toBeUndefined();
  });

  it('resolves CWD worktree path match with source "worktree" and worktreeId', async () => {
    vi.spyOn(process, 'cwd').mockReturnValue('/repos/orch-feature/src');
    const store = mockStore(projects);
    const result = await resolveProjectWorktree(undefined, store);
    expect(result).toEqual({ id: 'project_002', source: 'worktree', worktreeId: 'wt_001' });
  });

  it('resolves via default_project config with source "default"', async () => {
    vi.spyOn(process, 'cwd').mockReturnValue('/tmp/unrelated');
    const stderrSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const mockGet = vi.fn().mockResolvedValue({ value: 'context-forge' });
    vi.mocked(ConfigManager).mockImplementation(
      () => ({ get: mockGet }) as unknown as InstanceType<typeof ConfigManager>,
    );
    const store = mockStore(projects);
    const result = await resolveProjectWorktree(undefined, store);
    expect(result).toEqual({ id: 'project_001', source: 'default' });
    expect(result.worktreeId).toBeUndefined();
    stderrSpy.mockRestore();
  });

  it('throws UserError when no resolution available', async () => {
    vi.spyOn(process, 'cwd').mockReturnValue('/tmp/unrelated');
    const mockGet = vi.fn().mockResolvedValue({ value: '' });
    vi.mocked(ConfigManager).mockImplementation(
      () => ({ get: mockGet }) as unknown as InstanceType<typeof ConfigManager>,
    );
    const store = mockStore(projects);
    await expect(resolveProjectWorktree(undefined, store)).rejects.toThrow(UserError);
    await expect(resolveProjectWorktree(undefined, store)).rejects.toThrow('cf init');
  });
});

describe('resolveProjectId', () => {
  const projects = [
    { id: 'project_001', name: 'context-forge', projectPath: '/repos/cf' },
    { id: 'project_002', name: 'orchestration', projectPath: '/repos/orch' },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it('resolves explicit flag by name with source "flag"', async () => {
    const store = mockStore(projects);
    const result = await resolveProjectId('orchestration', store);
    expect(result).toEqual({ id: 'project_002', source: 'flag' });
  });

  it('resolves explicit flag by ID with source "flag"', async () => {
    const store = mockStore(projects);
    const result = await resolveProjectId('project_001', store);
    expect(result).toEqual({ id: 'project_001', source: 'flag' });
  });

  it('throws UserError when explicit flag does not match', async () => {
    const store = mockStore(projects);
    await expect(resolveProjectId('nonexistent', store)).rejects.toThrow(UserError);
    await expect(resolveProjectId('nonexistent', store)).rejects.toThrow('not found');
  });

  it('resolves by CWD with source "cwd"', async () => {
    vi.spyOn(process, 'cwd').mockReturnValue('/repos/orch/src');
    const store = mockStore(projects);
    const result = await resolveProjectId(undefined, store);
    expect(result).toEqual({ id: 'project_002', source: 'cwd' });
  });

  it('resolves by default_project config with source "default"', async () => {
    vi.spyOn(process, 'cwd').mockReturnValue('/tmp/unrelated');
    const stderrSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const mockGet = vi.fn().mockResolvedValue({ value: 'context-forge' });
    vi.mocked(ConfigManager).mockImplementation(
      () => ({ get: mockGet }) as unknown as InstanceType<typeof ConfigManager>,
    );

    const store = mockStore(projects);
    const result = await resolveProjectId(undefined, store);
    expect(result).toEqual({ id: 'project_001', source: 'default' });
    expect(mockGet).toHaveBeenCalledWith('default_project');
    stderrSpy.mockRestore();
  });

  it('emits deprecation warning to stderr when resolved via default_project', async () => {
    vi.spyOn(process, 'cwd').mockReturnValue('/tmp/unrelated');
    const stderrSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const mockGet = vi.fn().mockResolvedValue({ value: 'context-forge' });
    vi.mocked(ConfigManager).mockImplementation(
      () => ({ get: mockGet }) as unknown as InstanceType<typeof ConfigManager>,
    );

    const store = mockStore(projects);
    await resolveProjectId(undefined, store);

    expect(stderrSpy).toHaveBeenCalledWith(
      expect.stringContaining('Warning'),
    );
    expect(stderrSpy).toHaveBeenCalledWith(
      expect.stringContaining('default_project'),
    );
    stderrSpy.mockRestore();
  });

  it('throws UserError when default_project is stale', async () => {
    vi.spyOn(process, 'cwd').mockReturnValue('/tmp/unrelated');
    const mockGet = vi.fn().mockResolvedValue({ value: 'deleted-project' });
    vi.mocked(ConfigManager).mockImplementation(
      () => ({ get: mockGet }) as unknown as InstanceType<typeof ConfigManager>,
    );

    const store = mockStore(projects);
    await expect(resolveProjectId(undefined, store)).rejects.toThrow(UserError);
    await expect(resolveProjectId(undefined, store)).rejects.toThrow('deleted-project');
  });

  it('throws UserError with guidance when no resolution available', async () => {
    vi.spyOn(process, 'cwd').mockReturnValue('/tmp/unrelated');
    const mockGet = vi.fn().mockResolvedValue({ value: '' });
    vi.mocked(ConfigManager).mockImplementation(
      () => ({ get: mockGet }) as unknown as InstanceType<typeof ConfigManager>,
    );

    const store = mockStore(projects);
    await expect(resolveProjectId(undefined, store)).rejects.toThrow(UserError);
    await expect(resolveProjectId(undefined, store)).rejects.toThrow('cf init');
  });

  it('does not expose worktreeId (backwards compatibility)', async () => {
    vi.spyOn(process, 'cwd').mockReturnValue('/repos/cf/src');
    const store = mockStore(projects);
    const result = await resolveProjectId(undefined, store);
    expect('worktreeId' in result).toBe(false);
  });
});
