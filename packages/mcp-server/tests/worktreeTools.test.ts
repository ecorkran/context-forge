import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { ProjectData, WorktreeContext } from '@context-forge/core';
import { registerWorktreeTools } from '../src/tools/worktreeTools.js';

// --- Mocks ---

const mockGetById = vi.fn<(id: string) => Promise<ProjectData | undefined>>();
const mockUpdate = vi.fn();
const mockListWorktrees = vi.fn();
const mockGetWorktree = vi.fn();
const mockGetWorktreeByName = vi.fn();
const mockAddWorktree = vi.fn();
const mockUpdateWorktree = vi.fn();
const mockRemoveWorktree = vi.fn();
const mockValidateWorktreePaths = vi.fn().mockResolvedValue([]);
const mockFindOverlaps = vi.fn().mockResolvedValue([]);
const mockListGitWorktrees = vi.fn().mockResolvedValue([]);

vi.mock('@context-forge/core/node', () => ({
  FileProjectStore: vi.fn().mockImplementation(() => ({
    getById: mockGetById,
    update: mockUpdate,
  })),
  WorktreeService: vi.fn().mockImplementation(() => ({
    listWorktrees: mockListWorktrees,
    getWorktree: mockGetWorktree,
    getWorktreeByName: mockGetWorktreeByName,
    addWorktree: mockAddWorktree,
    updateWorktree: mockUpdateWorktree,
    removeWorktree: mockRemoveWorktree,
    validateWorktreePaths: mockValidateWorktreePaths,
    findOverlaps: mockFindOverlaps,
  })),
  GitWorktreeDiscovery: vi.fn().mockImplementation(() => ({
    listWorktrees: mockListGitWorktrees,
  })),
}));

// --- Fixtures ---

const MOCK_WORKTREE: WorktreeContext = {
  id: 'wt_test_001',
  name: 'Feature Branch',
  indexRange: [100, 199] as [number, number],
  worktreePath: '/home/user/projects/test-project-feature',
  developmentPhase: 'implementation',
  activeSlice: '100-slice.feature.md',
  activeTaskFile: '100-tasks.feature.md',
  instruction: 'implementation',
};

const MOCK_WORKTREE_2: WorktreeContext = {
  id: 'wt_test_002',
  name: 'Bugfix Branch',
  indexRange: [200, 299] as [number, number],
  worktreePath: '/home/user/projects/test-project-bugfix',
};

const MOCK_PROJECT: ProjectData = {
  id: 'project_test_001',
  name: 'test-project',
  template: 'default',
  fileSlice: '',
  fileTasks: '',
  instruction: '',
  projectPath: '/home/user/projects/test-project',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-03-01T00:00:00.000Z',
  worktrees: [MOCK_WORKTREE, MOCK_WORKTREE_2],
};

// --- Helpers ---

async function createTestClient(): Promise<{ client: Client; cleanup: () => Promise<void> }> {
  const server = new McpServer({ name: 'test-server', version: '0.1.0' });
  registerWorktreeTools(server);

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

describe('worktree_list', () => {
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

  it('returns worktrees array and count', async () => {
    mockListWorktrees.mockResolvedValue([MOCK_WORKTREE, MOCK_WORKTREE_2]);

    const result = await client.callTool({
      name: 'worktree_list',
      arguments: { projectId: MOCK_PROJECT.id },
    });

    expect(result.isError).toBeFalsy();
    const parsed = parseResult(result) as { worktrees: WorktreeContext[]; count: number };
    expect(parsed.worktrees).toHaveLength(2);
    expect(parsed.count).toBe(2);
    expect(parsed.worktrees[0].name).toBe('Feature Branch');
  });

  it('returns empty array for project with no worktrees', async () => {
    mockListWorktrees.mockResolvedValue([]);

    const result = await client.callTool({
      name: 'worktree_list',
      arguments: { projectId: MOCK_PROJECT.id },
    });

    expect(result.isError).toBeFalsy();
    const parsed = parseResult(result) as { worktrees: WorktreeContext[]; count: number };
    expect(parsed.worktrees).toHaveLength(0);
    expect(parsed.count).toBe(0);
  });

  it('returns error when project not found', async () => {
    mockListWorktrees.mockRejectedValue(new Error('Project not found: bad_id'));

    const result = await client.callTool({
      name: 'worktree_list',
      arguments: { projectId: 'bad_id' },
    });

    expect(result.isError).toBe(true);
    expect(getErrorText(result)).toContain('Project not found');
  });

  it('includes pathStatuses when project has projectPath', async () => {
    mockListWorktrees.mockResolvedValue([MOCK_WORKTREE]);
    mockGetById.mockResolvedValue(MOCK_PROJECT);
    mockListGitWorktrees.mockResolvedValue([{ path: '/home/user/projects/test-project', head: 'abc', bare: false }]);
    mockValidateWorktreePaths.mockResolvedValue([{
      worktreeId: 'wt_test_001',
      worktreeName: 'Feature Branch',
      worktreePath: '/home/user/projects/test-project-feature',
      status: 'missing',
    }]);

    const result = await client.callTool({
      name: 'worktree_list',
      arguments: { projectId: MOCK_PROJECT.id },
    });

    expect(result.isError).toBeFalsy();
    const parsed = parseResult(result) as { pathStatuses: unknown[] };
    expect(parsed.pathStatuses).toBeDefined();
    expect(parsed.pathStatuses).toHaveLength(1);
  });

  it('omits pathStatuses when project has no projectPath', async () => {
    mockListWorktrees.mockResolvedValue([MOCK_WORKTREE]);
    mockGetById.mockResolvedValue({ ...MOCK_PROJECT, projectPath: undefined });

    const result = await client.callTool({
      name: 'worktree_list',
      arguments: { projectId: MOCK_PROJECT.id },
    });

    expect(result.isError).toBeFalsy();
    const parsed = parseResult(result) as { pathStatuses?: unknown };
    expect(parsed.pathStatuses).toBeUndefined();
  });
});

describe('worktree_get', () => {
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

  it('resolves worktree by ID', async () => {
    mockGetById.mockResolvedValue(MOCK_PROJECT);
    mockGetWorktree.mockResolvedValue(MOCK_WORKTREE);

    const result = await client.callTool({
      name: 'worktree_get',
      arguments: { projectId: MOCK_PROJECT.id, worktree: MOCK_WORKTREE.id },
    });

    expect(result.isError).toBeFalsy();
    const parsed = parseResult(result) as WorktreeContext;
    expect(parsed.id).toBe('wt_test_001');
    expect(parsed.name).toBe('Feature Branch');
  });

  it('resolves worktree by name (case-insensitive)', async () => {
    mockGetById.mockResolvedValue(MOCK_PROJECT);
    mockGetWorktree.mockResolvedValue(undefined);
    mockGetWorktreeByName.mockResolvedValue(MOCK_WORKTREE);

    const result = await client.callTool({
      name: 'worktree_get',
      arguments: { projectId: MOCK_PROJECT.id, worktree: 'feature branch' },
    });

    expect(result.isError).toBeFalsy();
    const parsed = parseResult(result) as WorktreeContext;
    expect(parsed.name).toBe('Feature Branch');
  });

  it('returns error for missing worktree', async () => {
    mockGetById.mockResolvedValue(MOCK_PROJECT);
    mockGetWorktree.mockResolvedValue(undefined);
    mockGetWorktreeByName.mockResolvedValue(undefined);

    const result = await client.callTool({
      name: 'worktree_get',
      arguments: { projectId: MOCK_PROJECT.id, worktree: 'nonexistent' },
    });

    expect(result.isError).toBe(true);
    expect(getErrorText(result)).toContain('not found');
  });
});

describe('worktree_init', () => {
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

  it('calls addWorktree with parsed indexRange', async () => {
    const addResult = { worktree: MOCK_WORKTREE, migrated: false, overlaps: [] };
    mockAddWorktree.mockResolvedValue(addResult);

    const result = await client.callTool({
      name: 'worktree_init',
      arguments: {
        projectId: MOCK_PROJECT.id,
        name: 'Feature Branch',
        indexRange: '100-199',
      },
    });

    expect(result.isError).toBeFalsy();
    expect(mockAddWorktree).toHaveBeenCalledWith(MOCK_PROJECT.id, {
      name: 'Feature Branch',
      indexRange: [100, 199],
      worktreePath: undefined,
      archDoc: undefined,
      slicePlan: undefined,
    });
  });

  it('returns migrated and overlaps fields', async () => {
    const addResult = {
      worktree: MOCK_WORKTREE,
      migrated: true,
      overlaps: [{ existingWorktreeId: 'wt_other', existingWorktreeName: 'Other', existingRange: [150, 250], overlapStart: 150, overlapEnd: 199 }],
    };
    mockAddWorktree.mockResolvedValue(addResult);

    const result = await client.callTool({
      name: 'worktree_init',
      arguments: { projectId: MOCK_PROJECT.id, name: 'Test', indexRange: '100-199' },
    });

    expect(result.isError).toBeFalsy();
    const parsed = parseResult(result) as typeof addResult;
    expect(parsed.migrated).toBe(true);
    expect(parsed.overlaps).toHaveLength(1);
  });

  it('returns error for malformed indexRange', async () => {
    const result = await client.callTool({
      name: 'worktree_init',
      arguments: { projectId: MOCK_PROJECT.id, name: 'Bad', indexRange: 'abc' },
    });

    expect(result.isError).toBe(true);
    expect(getErrorText(result)).toContain('Invalid indexRange');
  });

  it('sets developmentPhase via updateWorktree when provided', async () => {
    const addResult = { worktree: { ...MOCK_WORKTREE }, migrated: false, overlaps: [] };
    mockAddWorktree.mockResolvedValue(addResult);
    mockUpdateWorktree.mockResolvedValue({ ...MOCK_WORKTREE, developmentPhase: 'design' });

    const result = await client.callTool({
      name: 'worktree_init',
      arguments: {
        projectId: MOCK_PROJECT.id,
        name: 'Feature Branch',
        indexRange: '100-199',
        developmentPhase: 'design',
      },
    });

    expect(result.isError).toBeFalsy();
    expect(mockUpdateWorktree).toHaveBeenCalledWith(
      MOCK_PROJECT.id,
      MOCK_WORKTREE.id,
      { developmentPhase: 'design' },
    );
  });
});

describe('worktree_update', () => {
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

  it('calls updateWorktree with collected fields', async () => {
    mockGetById.mockResolvedValue(MOCK_PROJECT);
    mockGetWorktree.mockResolvedValue(MOCK_WORKTREE);
    const updated = { ...MOCK_WORKTREE, developmentPhase: 'review' };
    mockUpdateWorktree.mockResolvedValue(updated);

    const result = await client.callTool({
      name: 'worktree_update',
      arguments: {
        projectId: MOCK_PROJECT.id,
        worktree: MOCK_WORKTREE.id,
        developmentPhase: 'review',
      },
    });

    expect(result.isError).toBeFalsy();
    const parsed = parseResult(result) as WorktreeContext;
    expect(parsed.developmentPhase).toBe('review');
    expect(mockUpdateWorktree).toHaveBeenCalledWith(
      MOCK_PROJECT.id,
      MOCK_WORKTREE.id,
      { developmentPhase: 'review' },
    );
  });

  it('parses indexRange if provided', async () => {
    mockGetById.mockResolvedValue(MOCK_PROJECT);
    mockGetWorktree.mockResolvedValue(MOCK_WORKTREE);
    mockUpdateWorktree.mockResolvedValue({ ...MOCK_WORKTREE, indexRange: [150, 249] });

    const result = await client.callTool({
      name: 'worktree_update',
      arguments: {
        projectId: MOCK_PROJECT.id,
        worktree: MOCK_WORKTREE.id,
        indexRange: '150-249',
      },
    });

    expect(result.isError).toBeFalsy();
    expect(mockUpdateWorktree).toHaveBeenCalledWith(
      MOCK_PROJECT.id,
      MOCK_WORKTREE.id,
      { indexRange: [150, 249] },
    );
  });

  it('returns error for invalid indexRange format', async () => {
    mockGetById.mockResolvedValue(MOCK_PROJECT);
    mockGetWorktree.mockResolvedValue(MOCK_WORKTREE);

    const result = await client.callTool({
      name: 'worktree_update',
      arguments: {
        projectId: MOCK_PROJECT.id,
        worktree: MOCK_WORKTREE.id,
        indexRange: 'bad',
      },
    });

    expect(result.isError).toBe(true);
    expect(getErrorText(result)).toContain('Invalid indexRange');
  });
});

describe('worktree_rm', () => {
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

  it('calls removeWorktree and returns result', async () => {
    mockGetById.mockResolvedValue(MOCK_PROJECT);
    mockGetWorktree.mockResolvedValue(MOCK_WORKTREE);
    mockRemoveWorktree.mockResolvedValue({ removed: MOCK_WORKTREE, migrated: false });

    const result = await client.callTool({
      name: 'worktree_rm',
      arguments: { projectId: MOCK_PROJECT.id, worktree: MOCK_WORKTREE.id },
    });

    expect(result.isError).toBeFalsy();
    const parsed = parseResult(result) as { removed: WorktreeContext; migrated: boolean };
    expect(parsed.removed.id).toBe('wt_test_001');
    expect(parsed.migrated).toBe(false);
  });

  it('returns migrated: true when last worktree removed', async () => {
    mockGetById.mockResolvedValue(MOCK_PROJECT);
    mockGetWorktree.mockResolvedValue(MOCK_WORKTREE);
    mockRemoveWorktree.mockResolvedValue({ removed: MOCK_WORKTREE, migrated: true });

    const result = await client.callTool({
      name: 'worktree_rm',
      arguments: { projectId: MOCK_PROJECT.id, worktree: MOCK_WORKTREE.id },
    });

    expect(result.isError).toBeFalsy();
    const parsed = parseResult(result) as { removed: WorktreeContext; migrated: boolean };
    expect(parsed.migrated).toBe(true);
  });

  it('returns error for missing worktree', async () => {
    mockGetById.mockResolvedValue(MOCK_PROJECT);
    mockGetWorktree.mockResolvedValue(undefined);
    mockGetWorktreeByName.mockResolvedValue(undefined);

    const result = await client.callTool({
      name: 'worktree_rm',
      arguments: { projectId: MOCK_PROJECT.id, worktree: 'nonexistent' },
    });

    expect(result.isError).toBe(true);
    expect(getErrorText(result)).toContain('not found');
  });
});

describe('worktree error cases', () => {
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

  it('worktree_get returns error when project not found', async () => {
    mockGetById.mockResolvedValue(undefined);

    const result = await client.callTool({
      name: 'worktree_get',
      arguments: { projectId: 'bad_id', worktree: 'wt_test_001' },
    });

    expect(result.isError).toBe(true);
    expect(getErrorText(result)).toContain('Project not found');
  });

  it('worktree_update returns error when project not found', async () => {
    mockGetById.mockResolvedValue(undefined);

    const result = await client.callTool({
      name: 'worktree_update',
      arguments: { projectId: 'bad_id', worktree: 'wt_test_001', name: 'New Name' },
    });

    expect(result.isError).toBe(true);
    expect(getErrorText(result)).toContain('Project not found');
  });
});
