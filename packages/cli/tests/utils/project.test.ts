import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  resolveProjectId,
  resolveProjectWorktree,
  findByNameOrId,
  findProjectByCwd,
  findWorktreeByNameOrId,
} from '../../src/utils/project.js';
import { UserError } from '../../src/utils/errors.js';

// Mock FileProjectStore and GitWorktreeDiscovery
const mockListGitWorktrees = vi.fn().mockRejectedValue(new Error('not a git repo'));
vi.mock('@context-forge/core/node', () => ({
  FileProjectStore: vi.fn(),
  GitWorktreeDiscovery: vi.fn().mockImplementation(() => ({
    listWorktrees: mockListGitWorktrees,
  })),
}));

import { FileProjectStore, GitWorktreeDiscovery } from '@context-forge/core/node';

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
    // restoreAllMocks wipes factory implementations — re-establish defaults
    mockListGitWorktrees.mockRejectedValue(new Error('not a git repo'));
    vi.mocked(GitWorktreeDiscovery).mockImplementation(() => ({
      listWorktrees: mockListGitWorktrees,
    }) as unknown as InstanceType<typeof GitWorktreeDiscovery>);
  });

  it('resolves explicit flag with source "flag", no worktreeId', async () => {
    const store = mockStore(projects);
    const result = await resolveProjectWorktree({ project: 'orchestration' }, store);
    expect(result).toEqual({ id: 'project_002', source: 'flag' });
    expect(result.worktreeId).toBeUndefined();
  });

  it('resolves CWD project path match with source "cwd", no worktreeId', async () => {
    vi.spyOn(process, 'cwd').mockReturnValue('/repos/cf/src');
    const store = mockStore(projects);
    const result = await resolveProjectWorktree({}, store);
    expect(result).toEqual({ id: 'project_001', source: 'cwd' });
    expect(result.worktreeId).toBeUndefined();
  });

  it('resolves CWD worktree path match with source "worktree" and worktreeId', async () => {
    vi.spyOn(process, 'cwd').mockReturnValue('/repos/orch-feature/src');
    const store = mockStore(projects);
    const result = await resolveProjectWorktree({}, store);
    expect(result).toEqual({ id: 'project_002', source: 'worktree', worktreeId: 'wt_001' });
  });

  it('resolves via git worktree discovery when CWD is unregistered worktree of known project', async () => {
    vi.spyOn(process, 'cwd').mockReturnValue('/repos/cf-feature');
    mockListGitWorktrees.mockResolvedValueOnce([
      { path: '/repos/cf', branch: 'refs/heads/main', head: 'abc', bare: false },
      { path: '/repos/cf-feature', branch: 'refs/heads/feature', head: 'def', bare: false },
    ]);
    const store = mockStore(projects);
    const result = await resolveProjectWorktree({}, store);
    expect(result).toEqual({ id: 'project_001', source: 'cwd' });
  });

  it('falls through when git worktree main path does not match any project', async () => {
    vi.spyOn(process, 'cwd').mockReturnValue('/repos/unknown-wt');
    mockListGitWorktrees.mockResolvedValueOnce([
      { path: '/repos/unknown', branch: 'refs/heads/main', head: 'abc', bare: false },
      { path: '/repos/unknown-wt', branch: 'refs/heads/feature', head: 'def', bare: false },
    ]);
    const store = mockStore(projects);
    await expect(resolveProjectWorktree({}, store)).rejects.toThrow(UserError);
  });

  it('throws UserError when no resolution available', async () => {
    vi.spyOn(process, 'cwd').mockReturnValue('/tmp/unrelated');
    const store = mockStore(projects);
    await expect(resolveProjectWorktree({}, store)).rejects.toThrow(UserError);
    await expect(resolveProjectWorktree({}, store)).rejects.toThrow('No project specified');
  });

  it('explicit --project with CWD inside a registered worktree of that project resolves worktreeId', async () => {
    vi.spyOn(process, 'cwd').mockReturnValue('/repos/orch-feature/src');
    const store = mockStore(projects);
    const result = await resolveProjectWorktree({ project: 'orchestration' }, store);
    expect(result).toEqual({ id: 'project_002', source: 'flag', worktreeId: 'wt_001' });
  });

  it('explicit --project with CWD outside all of that project\'s checkouts resolves no worktreeId', async () => {
    vi.spyOn(process, 'cwd').mockReturnValue('/tmp/unrelated');
    const store = mockStore(projects);
    const result = await resolveProjectWorktree({ project: 'orchestration' }, store);
    expect(result).toEqual({ id: 'project_002', source: 'flag' });
    expect(result.worktreeId).toBeUndefined();
  });

  it('explicit --project with CWD inside a different project\'s checkout resolves the named project\'s root', async () => {
    vi.spyOn(process, 'cwd').mockReturnValue('/repos/cf/src');
    const store = mockStore(projects);
    const result = await resolveProjectWorktree({ project: 'orchestration' }, store);
    expect(result).toEqual({ id: 'project_002', source: 'flag' });
    expect(result.worktreeId).toBeUndefined();
  });

  it('explicit --project on a migrated single-worktree project with CWD at the project root resolves the default worktree', async () => {
    const migratedProjects = [
      {
        id: 'project_003',
        name: 'migrated',
        projectPath: '/repos/migrated',
        worktrees: [
          { id: 'default', name: 'default', worktreePath: '/repos/migrated' },
        ],
      },
    ];
    vi.spyOn(process, 'cwd').mockReturnValue('/repos/migrated');
    const store = mockStore(migratedProjects);
    const result = await resolveProjectWorktree({ project: 'migrated' }, store);
    expect(result).toEqual({ id: 'project_003', source: 'flag', worktreeId: 'default' });
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

  it('throws UserError with guidance when no resolution available', async () => {
    vi.spyOn(process, 'cwd').mockReturnValue('/tmp/unrelated');
    const store = mockStore(projects);
    await expect(resolveProjectId(undefined, store)).rejects.toThrow(UserError);
    await expect(resolveProjectId(undefined, store)).rejects.toThrow('No project specified');
  });

  it('does not expose worktreeId (backwards compatibility)', async () => {
    vi.spyOn(process, 'cwd').mockReturnValue('/repos/cf/src');
    const store = mockStore(projects);
    const result = await resolveProjectId(undefined, store);
    expect('worktreeId' in result).toBe(false);
  });
});

describe('findWorktreeByNameOrId', () => {
  const worktrees = [
    { id: 'wt_001', name: 'Feature A', indexRange: [100, 199] },
    { id: 'wt_002', name: 'feature-b', indexRange: [200, 299] },
  ];
  const project = { id: 'project_001', name: 'test', projectPath: '/repos/test', worktrees };

  function storeWithProject(p: typeof project | null) {
    return {
      getAll: vi.fn(),
      getById: vi.fn().mockResolvedValue(p),
    } as unknown as FileProjectStore;
  }

  it('returns worktree by exact ID match', async () => {
    const store = storeWithProject(project);
    const result = await findWorktreeByNameOrId('project_001', 'wt_001', store);
    expect(result?.id).toBe('wt_001');
  });

  it('returns worktree by case-insensitive name match', async () => {
    const store = storeWithProject(project);
    const result = await findWorktreeByNameOrId('project_001', 'feature a', store);
    expect(result?.id).toBe('wt_001');
  });

  it('returns worktree by case-insensitive name (mixed case)', async () => {
    const store = storeWithProject(project);
    const result = await findWorktreeByNameOrId('project_001', 'FEATURE-B', store);
    expect(result?.id).toBe('wt_002');
  });

  it('ID takes priority over name when both could match different entries', async () => {
    const ambiguous = [
      { id: 'feature-b', name: 'something-else', indexRange: [100, 199] },
      { id: 'wt_999', name: 'feature-b', indexRange: [200, 299] },
    ];
    const store = storeWithProject({ ...project, worktrees: ambiguous });
    const result = await findWorktreeByNameOrId('project_001', 'feature-b', store);
    expect(result?.id).toBe('feature-b');
  });

  it('returns undefined when not found', async () => {
    const store = storeWithProject(project);
    const result = await findWorktreeByNameOrId('project_001', 'nonexistent', store);
    expect(result).toBeUndefined();
  });

  it('returns undefined when project not found', async () => {
    const store = storeWithProject(null);
    const result = await findWorktreeByNameOrId('project_999', 'wt_001', store);
    expect(result).toBeUndefined();
  });
});
