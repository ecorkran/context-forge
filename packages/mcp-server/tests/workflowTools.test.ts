import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { ProjectData } from '@context-forge/core';
import { registerWorkflowTools } from '../src/tools/workflowTools.js';

// --- Mocks ---

const mockGetById = vi.fn<(id: string) => Promise<ProjectData | undefined>>();
const mockConfigGet = vi.fn();
const mockCollect = vi.fn();
const mockGetStatus = vi.fn();
const mockGetNext = vi.fn();
const mockCheck = vi.fn();
const mockFix = vi.fn();
const mockCheckAll = vi.fn();
const mockFixAll = vi.fn();
const mockWtGetWorktree = vi.fn();
const mockWtGetWorktreeByName = vi.fn();

vi.mock('@context-forge/core/node', () => ({
  FileProjectStore: vi.fn().mockImplementation(() => ({
    getById: mockGetById,
  })),
  ConfigManager: vi.fn().mockImplementation(() => ({
    get: mockConfigGet,
  })),
  FutureWorkCollector: vi.fn().mockImplementation(() => ({
    collect: mockCollect,
  })),
  WorkflowNavigator: vi.fn().mockImplementation(() => ({
    getStatus: mockGetStatus,
    getNext: mockGetNext,
  })),
  ArtifactIntrospector: vi.fn(),
  ConsistencyChecker: vi.fn().mockImplementation(() => ({
    check: mockCheck,
    fix: mockFix,
    checkAll: mockCheckAll,
    fixAll: mockFixAll,
  })),
  WorktreeService: vi.fn().mockImplementation(() => ({
    getWorktree: mockWtGetWorktree,
    getWorktreeByName: mockWtGetWorktreeByName,
  })),
}));

vi.mock('@context-forge/core', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    applyWorktreeOverlay: vi.fn().mockImplementation((project: ProjectData, _worktreeId: string) => {
      // Return project with overlaid worktree fields
      const wt = (project.worktrees ?? []).find((w) => w.id === _worktreeId);
      if (!wt) return project;
      return {
        ...project,
        fileSlice: wt.activeSlice || project.fileSlice,
        fileTasks: wt.activeTaskFile || project.fileTasks,
        developmentPhase: wt.developmentPhase || project.developmentPhase,
        instruction: wt.instruction || project.instruction,
      };
    }),
  };
});

// --- Fixtures ---

const MOCK_WORKTREE = {
  id: 'wt_test_001',
  name: 'Feature Branch',
  indexRange: [100, 199] as [number, number],
  worktreePath: '/home/user/projects/test-project-feature',
  developmentPhase: 'design',
  activeSlice: '150-slice.wt-feature.md',
  activeTaskFile: '150-tasks.wt-feature.md',
  instruction: 'design',
};

const MOCK_PROJECT: ProjectData = {
  id: 'project_test_001',
  name: 'test-project',
  template: 'default',
  fileSlice: '100-slice.test-feature.md',
  fileTasks: '100-tasks.test-feature.md',
  instruction: 'implementation',
  projectPath: '/home/user/projects/test-project',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-03-01T00:00:00.000Z',
};

const MOCK_PROJECT_WITH_WORKTREES: ProjectData = {
  ...MOCK_PROJECT,
  worktrees: [MOCK_WORKTREE],
};

const MOCK_RESULT = {
  projectPath: '/home/user/projects/test-project',
  groups: [
    {
      initiativeIndex: '780',
      initiativeName: 'Future Test Future',
      sourceFile: 'project-documents/user/architecture/780-slices.future.test-future.md',
      items: [
        {
          index: '780',
          name: 'Completed Item',
          done: true,
          sourceFile: 'project-documents/user/architecture/780-slices.future.test-future.md',
          sourceInitiativeIndex: '780',
          sourceInitiativeName: 'Future Test Future',
        },
        {
          index: '781',
          name: 'Pending Item A',
          done: false,
          sourceFile: 'project-documents/user/architecture/780-slices.future.test-future.md',
          sourceInitiativeIndex: '780',
          sourceInitiativeName: 'Future Test Future',
        },
      ],
      totalItems: 2,
      pendingItems: 1,
      completedItems: 1,
    },
  ],
  totalItems: 2,
  pendingItems: 1,
  completedItems: 1,
  markdown: '## Future Work Summary\n\n### 780 — Future Test Future\n*Source: ...*\n- [x] (780) Completed Item\n- [ ] (781) Pending Item A\n\n**Total: 2 items (1 pending, 1 completed)**',
};

// --- Helpers ---

async function createTestClient(): Promise<{ client: Client; cleanup: () => Promise<void> }> {
  const server = new McpServer({ name: 'test-server', version: '0.1.0' });
  registerWorkflowTools(server);

  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);

  const client = new Client({ name: 'test-client', version: '1.0.0' });
  await client.connect(clientTransport);

  return {
    client,
    cleanup: async () => {
      await client.close();
      await server.close();
    },
  };
}

function parseResult(result: { content: unknown[] }): unknown {
  const content = result.content as { type: string; text: string }[];
  return JSON.parse(content[0].text);
}

function getErrorText(result: { content: unknown[] }): string {
  const content = result.content as { type: string; text: string }[];
  return content[0].text;
}

// --- Tests ---

describe('workflow_future', () => {
  let client: Client;
  let cleanup: () => Promise<void>;

  beforeEach(async () => {
    vi.clearAllMocks();
    const ctx = await createTestClient();
    client = ctx.client;
    cleanup = ctx.cleanup;
  });

  afterEach(async () => {
    await cleanup();
  });

  it('returns FutureWorkCollectorResult for valid projectId', async () => {
    mockGetById.mockResolvedValue(MOCK_PROJECT);
    mockCollect.mockResolvedValue(MOCK_RESULT);

    const result = await client.callTool({
      name: 'workflow_future',
      arguments: { projectId: MOCK_PROJECT.id },
    });

    expect(result.isError).toBeFalsy();
    const parsed = parseResult(result) as typeof MOCK_RESULT;
    expect(parsed.groups).toBeDefined();
    expect(parsed.markdown).toBeDefined();
    expect(mockCollect).toHaveBeenCalledWith(MOCK_PROJECT.projectPath, 'all');
  });

  it('includeMarkdown: false omits markdown field', async () => {
    mockGetById.mockResolvedValue(MOCK_PROJECT);
    mockCollect.mockResolvedValue(MOCK_RESULT);

    const result = await client.callTool({
      name: 'workflow_future',
      arguments: { projectId: MOCK_PROJECT.id, includeMarkdown: false },
    });

    expect(result.isError).toBeFalsy();
    const parsed = parseResult(result) as Record<string, unknown>;
    expect(parsed.markdown).toBeUndefined();
    expect(parsed.groups).toBeDefined();
  });

  it('status: pending is passed through to collect()', async () => {
    mockGetById.mockResolvedValue(MOCK_PROJECT);
    mockCollect.mockResolvedValue({ ...MOCK_RESULT, completedItems: 0 });

    await client.callTool({
      name: 'workflow_future',
      arguments: { projectId: MOCK_PROJECT.id, status: 'pending' },
    });

    expect(mockCollect).toHaveBeenCalledWith(MOCK_PROJECT.projectPath, 'pending');
  });

  it('invalid projectId returns isError response', async () => {
    mockGetById.mockResolvedValue(undefined);

    const result = await client.callTool({
      name: 'workflow_future',
      arguments: { projectId: 'nonexistent_id' },
    });

    expect(result.isError).toBe(true);
    expect(getErrorText(result)).toContain('not found');
  });

  it('project with no projectPath returns error', async () => {
    mockGetById.mockResolvedValue({ ...MOCK_PROJECT, projectPath: undefined });

    const result = await client.callTool({
      name: 'workflow_future',
      arguments: { projectId: MOCK_PROJECT.id },
    });

    expect(result.isError).toBe(true);
    expect(getErrorText(result)).toContain('projectPath');
  });

  it('returns error when projectId omitted', async () => {
    const result = await client.callTool({
      name: 'workflow_future',
      arguments: {},
    });

    expect(result.isError).toBe(true);
    expect(getErrorText(result)).toContain('No project ID provided');
  });
});

describe('workflow_status', () => {
  let client: Client;
  let cleanup: () => Promise<void>;

  beforeEach(async () => {
    vi.clearAllMocks();
    const ctx = await createTestClient();
    client = ctx.client;
    cleanup = ctx.cleanup;
  });

  afterEach(async () => {
    await cleanup();
  });

  it('returns WorkflowStatus for valid project', async () => {
    const mockStatus = {
      project: 'test-project',
      phase: 'Phase 6: Implementation',
      activeSlice: { name: 'test-feature', index: 100, status: 'in-implementation', taskProgress: { completed: 1, total: 2, inferredStatus: 'in-progress' } },
      slicePlan: null,
      summary: 'test-project — slice 100 in-implementation (1/2 tasks)',
    };
    mockGetById.mockResolvedValue(MOCK_PROJECT);
    mockGetStatus.mockResolvedValue(mockStatus);

    const result = await client.callTool({
      name: 'workflow_status',
      arguments: { projectId: MOCK_PROJECT.id },
    });

    expect(result.isError).toBeFalsy();
    const parsed = parseResult(result) as typeof mockStatus;
    expect(parsed.project).toBe('test-project');
    expect(parsed.activeSlice?.status).toBe('in-implementation');
    expect(parsed.summary).toContain('slice 100');
  });

  it('returns error for missing project', async () => {
    mockGetById.mockResolvedValue(undefined);

    const result = await client.callTool({
      name: 'workflow_status',
      arguments: { projectId: 'nonexistent' },
    });

    expect(result.isError).toBe(true);
    expect(getErrorText(result)).toContain('not found');
  });
});

describe('workflow_next', () => {
  let client: Client;
  let cleanup: () => Promise<void>;

  beforeEach(async () => {
    vi.clearAllMocks();
    const ctx = await createTestClient();
    client = ctx.client;
    cleanup = ctx.cleanup;
  });

  afterEach(async () => {
    await cleanup();
  });

  it('returns NextAction for valid project', async () => {
    const mockNext = {
      recommendation: 'Continue implementation — 2 tasks remaining',
      rationale: 'Slice 100 is in progress with 2 tasks left.',
      phase: 'Phase 6: Implementation',
      slice: '100-slice.test-feature.md',
      summary: 'Continue slice 100 — 2 tasks remaining',
    };
    mockGetById.mockResolvedValue(MOCK_PROJECT);
    mockGetNext.mockResolvedValue(mockNext);

    const result = await client.callTool({
      name: 'workflow_next',
      arguments: { projectId: MOCK_PROJECT.id },
    });

    expect(result.isError).toBeFalsy();
    const parsed = parseResult(result) as typeof mockNext;
    expect(parsed.recommendation).toContain('Continue implementation');
    expect(parsed.summary).toContain('slice 100');
  });

  it('returns error for missing project', async () => {
    mockGetById.mockResolvedValue(undefined);

    const result = await client.callTool({
      name: 'workflow_next',
      arguments: { projectId: 'nonexistent' },
    });

    expect(result.isError).toBe(true);
    expect(getErrorText(result)).toContain('not found');
  });
});

describe('workflow_check', () => {
  let client: Client;
  let cleanup: () => Promise<void>;

  beforeEach(async () => {
    vi.clearAllMocks();
    const ctx = await createTestClient();
    client = ctx.client;
    cleanup = ctx.cleanup;
  });

  afterEach(async () => {
    await cleanup();
  });

  const MOCK_CHECK_RESULT = {
    projectPath: '/home/user/projects/test-project',
    findings: [
      {
        rule: 'task-vs-plan',
        severity: 'warning',
        location: '/fake/plan.md',
        description: 'Tasks complete but slice unchecked',
        suggestedFix: 'Check the slice plan entry',
        fixable: true,
      },
    ],
    totalFindings: 1,
    errors: 0,
    warnings: 1,
    infos: 0,
    summary: '1 finding: 1 warning',
  };

  const MOCK_FIX_RESULT = {
    ...MOCK_CHECK_RESULT,
    fixed: 1,
    fixLog: [
      { rule: 'task-vs-plan', action: 'update-checkbox', filePath: '/fake/plan.md', before: '[ ]', after: '[x]' },
    ],
    fixErrors: [],
  };

  it('defaults to all-slices mode (calls checkAll)', async () => {
    mockGetById.mockResolvedValue(MOCK_PROJECT);
    mockConfigGet.mockResolvedValue({ value: false, source: 'default' });
    mockCheckAll.mockResolvedValue(MOCK_CHECK_RESULT);

    const result = await client.callTool({
      name: 'workflow_check',
      arguments: { projectId: MOCK_PROJECT.id },
    });

    expect(result.isError).toBeFalsy();
    const parsed = parseResult(result) as typeof MOCK_CHECK_RESULT;
    expect(parsed.totalFindings).toBe(1);
    expect(parsed.findings).toHaveLength(1);
    expect(parsed.summary).toContain('1 warning');
    expect(mockCheckAll).toHaveBeenCalled();
    expect(mockCheck).not.toHaveBeenCalled();
  });

  it('narrows to single slice with sliceIndex', async () => {
    mockGetById.mockResolvedValue(MOCK_PROJECT);
    mockConfigGet.mockResolvedValue({ value: false, source: 'default' });
    mockCheck.mockResolvedValue(MOCK_CHECK_RESULT);

    const result = await client.callTool({
      name: 'workflow_check',
      arguments: { projectId: MOCK_PROJECT.id, sliceIndex: 175 },
    });

    expect(result.isError).toBeFalsy();
    expect(mockCheck).toHaveBeenCalled();
    expect(mockCheckAll).not.toHaveBeenCalled();
  });

  it('returns fix result when fix=true (all-slices)', async () => {
    mockGetById.mockResolvedValue(MOCK_PROJECT);
    mockFixAll.mockResolvedValue(MOCK_FIX_RESULT);

    const result = await client.callTool({
      name: 'workflow_check',
      arguments: { projectId: MOCK_PROJECT.id, fix: true },
    });

    expect(result.isError).toBeFalsy();
    const parsed = parseResult(result) as typeof MOCK_FIX_RESULT;
    expect(parsed.fixed).toBe(1);
    expect(parsed.fixLog).toHaveLength(1);
    expect(parsed.fixLog[0].before).toBe('[ ]');
    expect(parsed.fixLog[0].after).toBe('[x]');
    expect(mockFixAll).toHaveBeenCalled();
  });

  it('uses auto_fix config when fix not specified', async () => {
    mockGetById.mockResolvedValue(MOCK_PROJECT);
    mockConfigGet.mockResolvedValue({ value: true, source: 'user' });
    mockFixAll.mockResolvedValue(MOCK_FIX_RESULT);

    const result = await client.callTool({
      name: 'workflow_check',
      arguments: { projectId: MOCK_PROJECT.id },
    });

    expect(result.isError).toBeFalsy();
    const parsed = parseResult(result) as typeof MOCK_FIX_RESULT;
    expect(parsed.fixed).toBe(1);
  });

  it('returns error for missing project', async () => {
    mockGetById.mockResolvedValue(undefined);

    const result = await client.callTool({
      name: 'workflow_check',
      arguments: { projectId: 'nonexistent' },
    });

    expect(result.isError).toBe(true);
    expect(getErrorText(result)).toContain('not found');
  });
});

describe('workflow_status with worktreeId', () => {
  let client: Client;
  let cleanup: () => Promise<void>;

  beforeEach(async () => {
    vi.clearAllMocks();
    const ctx = await createTestClient();
    client = ctx.client;
    cleanup = ctx.cleanup;
  });

  afterEach(async () => {
    await cleanup();
  });

  it('applies overlay and includes worktree field when worktreeId provided', async () => {
    mockGetById.mockResolvedValue(MOCK_PROJECT_WITH_WORKTREES);
    mockWtGetWorktree.mockResolvedValue(MOCK_WORKTREE);
    mockGetStatus.mockResolvedValue({ phase: 'design', summary: 'In design' });

    const result = await client.callTool({
      name: 'workflow_status',
      arguments: { projectId: MOCK_PROJECT.id, worktreeId: MOCK_WORKTREE.id },
    });

    expect(result.isError).toBeFalsy();
    const parsed = parseResult(result) as Record<string, unknown>;
    expect(parsed.worktree).toEqual({ id: MOCK_WORKTREE.id, name: MOCK_WORKTREE.name });
    expect(parsed.phase).toBe('design');
  });

  it('existing behavior unchanged without worktreeId', async () => {
    mockGetById.mockResolvedValue(MOCK_PROJECT);
    mockGetStatus.mockResolvedValue({ phase: 'implementation', summary: 'In progress' });

    const result = await client.callTool({
      name: 'workflow_status',
      arguments: { projectId: MOCK_PROJECT.id },
    });

    expect(result.isError).toBeFalsy();
    const parsed = parseResult(result) as Record<string, unknown>;
    expect(parsed.worktree).toBeUndefined();
    expect(parsed.phase).toBe('implementation');
  });

  it('returns error when worktreeId not found', async () => {
    mockGetById.mockResolvedValue(MOCK_PROJECT_WITH_WORKTREES);
    mockWtGetWorktree.mockResolvedValue(undefined);
    mockWtGetWorktreeByName.mockResolvedValue(undefined);

    const result = await client.callTool({
      name: 'workflow_status',
      arguments: { projectId: MOCK_PROJECT.id, worktreeId: 'nonexistent' },
    });

    expect(result.isError).toBe(true);
    expect(getErrorText(result)).toContain('not found');
  });
});

describe('workflow_next with worktreeId', () => {
  let client: Client;
  let cleanup: () => Promise<void>;

  beforeEach(async () => {
    vi.clearAllMocks();
    const ctx = await createTestClient();
    client = ctx.client;
    cleanup = ctx.cleanup;
  });

  afterEach(async () => {
    await cleanup();
  });

  it('applies overlay and includes worktree field when worktreeId provided', async () => {
    mockGetById.mockResolvedValue(MOCK_PROJECT_WITH_WORKTREES);
    mockWtGetWorktree.mockResolvedValue(MOCK_WORKTREE);
    mockGetNext.mockResolvedValue({ recommendation: 'Design slice', rationale: 'In design phase' });

    const result = await client.callTool({
      name: 'workflow_next',
      arguments: { projectId: MOCK_PROJECT.id, worktreeId: MOCK_WORKTREE.id },
    });

    expect(result.isError).toBeFalsy();
    const parsed = parseResult(result) as Record<string, unknown>;
    expect(parsed.worktree).toEqual({ id: MOCK_WORKTREE.id, name: MOCK_WORKTREE.name });
    expect(parsed.recommendation).toBe('Design slice');
  });

  it('returns error when worktreeId not found', async () => {
    mockGetById.mockResolvedValue(MOCK_PROJECT_WITH_WORKTREES);
    mockWtGetWorktree.mockResolvedValue(undefined);
    mockWtGetWorktreeByName.mockResolvedValue(undefined);

    const result = await client.callTool({
      name: 'workflow_next',
      arguments: { projectId: MOCK_PROJECT.id, worktreeId: 'bad_id' },
    });

    expect(result.isError).toBe(true);
    expect(getErrorText(result)).toContain('not found');
  });
});

describe('workflow_check with worktree parity', () => {
  let client: Client;
  let cleanup: () => Promise<void>;

  const MOCK_WORKTREE_B = {
    id: 'wt_test_002',
    name: 'Bugfix Branch',
    indexRange: [200, 299] as [number, number],
    worktreePath: '/home/user/projects/test-project-bugfix',
    developmentPhase: 'implementation',
    activeSlice: '250-slice.wt-bugfix.md',
    activeTaskFile: '250-tasks.wt-bugfix.md',
    instruction: 'implementation',
  };

  const MOCK_PROJECT_TWO_WORKTREES: ProjectData = {
    ...MOCK_PROJECT,
    worktrees: [MOCK_WORKTREE, MOCK_WORKTREE_B],
  };

  const MOCK_CHECK_RESULT_A = {
    projectPath: '/home/user/projects/test-project-feature',
    findings: [
      { rule: 'task-vs-plan', severity: 'warning', location: '/fake/plan.md', description: 'Finding from worktree A', suggestedFix: 'Fix it', fixable: true },
    ],
    totalFindings: 1, errors: 0, warnings: 1, infos: 0,
    summary: '1 finding: 1 warning',
  };

  const MOCK_CHECK_RESULT_B = {
    projectPath: '/home/user/projects/test-project-bugfix',
    findings: [
      { rule: 'missing-artifact', severity: 'info', location: 'slice plan entry 250', description: 'Finding from worktree B', suggestedFix: 'Create task file', fixable: false },
    ],
    totalFindings: 1, errors: 0, warnings: 0, infos: 1,
    summary: '1 finding: 1 info',
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    const ctx = await createTestClient();
    client = ctx.client;
    cleanup = ctx.cleanup;
  });

  afterEach(async () => {
    await cleanup();
  });

  it('applies worktree overlays and merges findings from all views', async () => {
    mockGetById.mockResolvedValue(MOCK_PROJECT_TWO_WORKTREES);
    mockConfigGet.mockResolvedValue({ value: false, source: 'default' });
    // Return different findings for each worktree view
    mockCheckAll
      .mockResolvedValueOnce(MOCK_CHECK_RESULT_A)
      .mockResolvedValueOnce(MOCK_CHECK_RESULT_B);

    const result = await client.callTool({
      name: 'workflow_check',
      arguments: { projectId: MOCK_PROJECT.id },
    });

    expect(result.isError).toBeFalsy();
    const parsed = parseResult(result) as { findings: unknown[]; totalFindings: number };
    // Should have findings from both views merged
    expect(parsed.totalFindings).toBe(2);
    expect(parsed.findings).toHaveLength(2);
    // checkAll should have been called twice (once per view)
    expect(mockCheckAll).toHaveBeenCalledTimes(2);
  });

  it('behavior unchanged for project without worktrees', async () => {
    mockGetById.mockResolvedValue(MOCK_PROJECT);
    mockConfigGet.mockResolvedValue({ value: false, source: 'default' });
    mockCheckAll.mockResolvedValue(MOCK_CHECK_RESULT_A);

    const result = await client.callTool({
      name: 'workflow_check',
      arguments: { projectId: MOCK_PROJECT.id },
    });

    expect(result.isError).toBeFalsy();
    const parsed = parseResult(result) as { totalFindings: number };
    expect(parsed.totalFindings).toBe(1);
    // checkAll called once (no worktrees)
    expect(mockCheckAll).toHaveBeenCalledTimes(1);
  });

  it('deduplicates identical findings across worktree views', async () => {
    mockGetById.mockResolvedValue(MOCK_PROJECT_TWO_WORKTREES);
    mockConfigGet.mockResolvedValue({ value: false, source: 'default' });
    // Both worktree views return the same finding
    mockCheckAll
      .mockResolvedValueOnce(MOCK_CHECK_RESULT_A)
      .mockResolvedValueOnce(MOCK_CHECK_RESULT_A);

    const result = await client.callTool({
      name: 'workflow_check',
      arguments: { projectId: MOCK_PROJECT.id },
    });

    expect(result.isError).toBeFalsy();
    const parsed = parseResult(result) as { findings: unknown[]; totalFindings: number };
    // Same finding from both views should be deduplicated to 1
    expect(parsed.totalFindings).toBe(1);
    expect(parsed.findings).toHaveLength(1);
  });
});
