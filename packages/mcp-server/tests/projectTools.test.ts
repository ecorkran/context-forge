import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { ProjectData } from '@context-forge/core';
import { registerProjectTools } from '../src/tools/projectTools.js';

// --- Mocks ---

const mockGetAll = vi.fn<() => Promise<ProjectData[]>>();
const mockGetById = vi.fn<(id: string) => Promise<ProjectData | undefined>>();
const mockUpdate = vi.fn<(id: string, updates: unknown) => Promise<void>>();
const mockCreate = vi.fn<(data: unknown) => Promise<ProjectData>>();
const mockConfigGet = vi.fn();
const mockSummarize = vi.fn();
const mockResolveFileByIndex = vi.fn();
const mockWtGetWorktree = vi.fn();
const mockWtGetWorktreeByName = vi.fn();
const mockWtUpdateWorktree = vi.fn();

vi.mock('@context-forge/core/node', () => ({
  FileProjectStore: vi.fn().mockImplementation(() => ({
    getAll: mockGetAll,
    getById: mockGetById,
    update: mockUpdate,
    create: mockCreate,
  })),
  ConfigManager: vi.fn().mockImplementation(() => ({
    get: mockConfigGet,
  })),
  ArtifactIntrospector: vi.fn().mockImplementation(() => ({
    summarize: mockSummarize,
  })),
  resolveFileByIndex: (...args: unknown[]) => mockResolveFileByIndex(...args),
  WorktreeService: vi.fn().mockImplementation(() => ({
    getWorktree: mockWtGetWorktree,
    getWorktreeByName: mockWtGetWorktreeByName,
    updateWorktree: mockWtUpdateWorktree,
  })),
}));

// --- Fixtures ---

const MOCK_PROJECT: ProjectData = {
  id: 'project_17390001',
  name: 'test-project',
  template: 'default',
  fileSlice: 'auth',
  fileTasks: 'auth-tasks',
  instruction: 'implementation',
  developmentPhase: 'Phase 6',
  workType: 'continue',
  dateProject: '2026-02-19',
  projectPath: '/home/user/projects/test-project',
  customData: {
    recentEvents: 'Started auth slice',
    additionalNotes: '',
    availableTools: 'context7',
  },
  createdAt: '2026-02-10T00:00:00.000Z',
  updatedAt: '2026-02-19T12:00:00.000Z',
};

const MOCK_PROJECT_2: ProjectData = {
  id: 'project_17390002',
  name: 'another-project',
  template: 'minimal',
  fileSlice: 'setup',
  fileTasks: 'setup-tasks',
  instruction: 'design',
  projectPath: '/home/user/projects/another',
  createdAt: '2026-02-15T00:00:00.000Z',
  updatedAt: '2026-02-18T08:00:00.000Z',
};

// --- Test helpers ---

async function createTestClient(): Promise<{ client: Client; cleanup: () => Promise<void> }> {
  const server = new McpServer({ name: 'test-server', version: '0.1.0' });
  registerProjectTools(server);

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

// --- Tests ---

describe('project_list', () => {
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

  it('returns formatted summary with correct fields and count', async () => {
    mockGetAll.mockResolvedValue([MOCK_PROJECT, MOCK_PROJECT_2]);

    const result = await client.callTool({ name: 'project_list', arguments: {} });

    expect(result.isError).toBeFalsy();
    const content = result.content as { type: string; text: string }[];
    const parsed = JSON.parse(content[0].text);

    expect(parsed.count).toBe(2);
    expect(parsed.projects).toHaveLength(2);

    // Verify summary fields (not full ProjectData)
    const first = parsed.projects[0];
    expect(first).toEqual({
      id: MOCK_PROJECT.id,
      name: MOCK_PROJECT.name,
      fileSlice: MOCK_PROJECT.fileSlice,
      template: MOCK_PROJECT.template,
      instruction: MOCK_PROJECT.instruction,
      projectPath: MOCK_PROJECT.projectPath,
      updatedAt: MOCK_PROJECT.updatedAt,
    });

    // Summary should NOT include full fields like customData, createdAt
    expect(first.customData).toBeUndefined();
    expect(first.createdAt).toBeUndefined();
    expect(first.fileTasks).toBeUndefined();
  });

  it('returns empty list with count 0 for empty store (not an error)', async () => {
    mockGetAll.mockResolvedValue([]);

    const result = await client.callTool({ name: 'project_list', arguments: {} });

    expect(result.isError).toBeFalsy();
    const content = result.content as { type: string; text: string }[];
    const parsed = JSON.parse(content[0].text);

    expect(parsed.projects).toEqual([]);
    expect(parsed.count).toBe(0);
  });
});

describe('project_get', () => {
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

  it('returns full ProjectData for valid ID', async () => {
    mockGetById.mockResolvedValue(MOCK_PROJECT);
    mockSummarize.mockResolvedValue({
      artifacts: { hasSlicePlan: false, hasHLD: false, hasArch: false, hasSpec: false, hasCurrentSliceDesign: false, hasCurrentTaskFile: false },
    });

    const result = await client.callTool({
      name: 'project_get',
      arguments: { id: MOCK_PROJECT.id },
    });

    expect(result.isError).toBeFalsy();
    const content = result.content as { type: string; text: string }[];
    const parsed = JSON.parse(content[0].text);

    // Full project data including fields not in summary
    expect(parsed.id).toBe(MOCK_PROJECT.id);
    expect(parsed.customData).toEqual(MOCK_PROJECT.customData);
    expect(parsed.createdAt).toBe(MOCK_PROJECT.createdAt);
    expect(parsed.fileTasks).toBe(MOCK_PROJECT.fileTasks);
    expect(mockGetById).toHaveBeenCalledWith(MOCK_PROJECT.id);
  });

  it('returns isError with helpful message for non-existent ID', async () => {
    mockGetById.mockResolvedValue(undefined);

    const result = await client.callTool({
      name: 'project_get',
      arguments: { id: 'project_nonexistent' },
    });

    expect(result.isError).toBe(true);
    const content = result.content as { type: string; text: string }[];
    expect(content[0].text).toContain('Project not found');
    expect(content[0].text).toContain('project_nonexistent');
    expect(content[0].text).toContain('project_list');
  });
});

describe('project_update', () => {
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

  it('applies update and returns full read-back project', async () => {
    const updatedProject = { ...MOCK_PROJECT, fileSlice: 'new-slice', updatedAt: '2026-02-19T13:00:00.000Z' };

    // First getById call: existence check; second: read-back after update
    mockGetById.mockResolvedValueOnce(MOCK_PROJECT).mockResolvedValueOnce(updatedProject);
    mockUpdate.mockResolvedValue(undefined);

    const result = await client.callTool({
      name: 'project_update',
      arguments: { id: MOCK_PROJECT.id, fileSlice: 'new-slice' },
    });

    expect(result.isError).toBeFalsy();
    const content = result.content as { type: string; text: string }[];
    const parsed = JSON.parse(content[0].text);

    expect(parsed.fileSlice).toBe('new-slice');
    expect(parsed.id).toBe(MOCK_PROJECT.id);
    expect(mockUpdate).toHaveBeenCalledWith(MOCK_PROJECT.id, { fileSlice: 'new-slice' });
  });

  it('returns isError for non-existent ID', async () => {
    mockGetById.mockResolvedValue(undefined);

    const result = await client.callTool({
      name: 'project_update',
      arguments: { id: 'project_nonexistent', fileSlice: 'new-slice' },
    });

    expect(result.isError).toBe(true);
    const content = result.content as { type: string; text: string }[];
    expect(content[0].text).toContain('Project not found');
    expect(content[0].text).toContain('project_nonexistent');
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('auto-sets instruction when developmentPhase is updated without explicit instruction', async () => {
    const updatedProject = { ...MOCK_PROJECT, developmentPhase: 'Phase 4: Slice Design', instruction: 'Phase 4: Slice Design' };
    mockGetById.mockResolvedValueOnce(MOCK_PROJECT).mockResolvedValueOnce(updatedProject);
    mockUpdate.mockResolvedValue(undefined);

    const result = await client.callTool({
      name: 'project_update',
      arguments: { id: MOCK_PROJECT.id, developmentPhase: 'Phase 4: Slice Design' },
    });

    expect(result.isError).toBeFalsy();
    expect(mockUpdate).toHaveBeenCalledWith(MOCK_PROJECT.id, {
      developmentPhase: 'Phase 4: Slice Design',
      instruction: 'Phase 4: Slice Design',
    });
  });

  it('respects explicit instruction when both developmentPhase and instruction provided', async () => {
    const updatedProject = { ...MOCK_PROJECT, developmentPhase: 'Phase 4: Slice Design', instruction: 'custom-instruction' };
    mockGetById.mockResolvedValueOnce(MOCK_PROJECT).mockResolvedValueOnce(updatedProject);
    mockUpdate.mockResolvedValue(undefined);

    const result = await client.callTool({
      name: 'project_update',
      arguments: { id: MOCK_PROJECT.id, developmentPhase: 'Phase 4: Slice Design', instruction: 'custom-instruction' },
    });

    expect(result.isError).toBeFalsy();
    expect(mockUpdate).toHaveBeenCalledWith(MOCK_PROJECT.id, {
      developmentPhase: 'Phase 4: Slice Design',
      instruction: 'custom-instruction',
    });
  });

  it('auto-sets fileTasks when updating fileSlice with matching task file', async () => {
    const updatedProject = { ...MOCK_PROJECT, fileSlice: '200-slice.new.md', fileTasks: '200-tasks.new.md' };
    mockGetById.mockResolvedValueOnce(MOCK_PROJECT).mockResolvedValueOnce(updatedProject);
    mockUpdate.mockResolvedValue(undefined);
    mockResolveFileByIndex.mockReturnValue('200-tasks.new.md');

    const result = await client.callTool({
      name: 'project_update',
      arguments: { id: MOCK_PROJECT.id, fileSlice: '200-slice.new.md' },
    });

    expect(result.isError).toBeFalsy();
    // Update should include both fileSlice and auto-set fileTasks
    expect(mockUpdate).toHaveBeenCalledWith(MOCK_PROJECT.id, {
      fileSlice: '200-slice.new.md',
      fileTasks: '200-tasks.new.md',
    });
    const content = result.content as { type: string; text: string }[];
    const parsed = JSON.parse(content[0].text);
    expect(parsed._autoSet).toEqual({ fileTasks: '200-tasks.new.md' });
  });

  it('derives fileTasks from slice name when task file does not exist on disk', async () => {
    const updatedProject = { ...MOCK_PROJECT, fileSlice: '999-slice.no-tasks.md', fileTasks: '999-tasks.no-tasks.md' };
    mockGetById.mockResolvedValueOnce(MOCK_PROJECT).mockResolvedValueOnce(updatedProject);
    mockUpdate.mockResolvedValue(undefined);
    mockResolveFileByIndex.mockImplementation(() => {
      throw new Error('No file matching index');
    });

    const result = await client.callTool({
      name: 'project_update',
      arguments: { id: MOCK_PROJECT.id, fileSlice: '999-slice.no-tasks.md' },
    });

    expect(result.isError).toBeFalsy();
    // Update should include both fileSlice and derived fileTasks
    expect(mockUpdate).toHaveBeenCalledWith(MOCK_PROJECT.id, {
      fileSlice: '999-slice.no-tasks.md',
      fileTasks: '999-tasks.no-tasks.md',
    });
    const content = result.content as { type: string; text: string }[];
    const parsed = JSON.parse(content[0].text);
    expect(parsed._autoSet).toEqual({ fileTasks: '999-tasks.no-tasks.md' });
  });

  it('returns isError when no update fields provided (only id)', async () => {
    const result = await client.callTool({
      name: 'project_update',
      arguments: { id: MOCK_PROJECT.id },
    });

    expect(result.isError).toBe(true);
    const content = result.content as { type: string; text: string }[];
    expect(content[0].text).toContain('No update fields provided');
    expect(mockGetById).not.toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});

describe('project_get introspection enrichment', () => {
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

  it('returns introspection field when project has projectPath and introspection succeeds', async () => {
    const mockIntrospection = {
      slicePlan: { totalSlices: 7, completedSlices: 3, summary: '3 of 7 slices complete' },
      currentTasks: { totalTasks: 10, completedTasks: 5, inferredStatus: 'in-progress', summary: '5 of 10 tasks done' },
      artifacts: {
        hasSlicePlan: true, hasHLD: false, hasArch: true,
        hasSpec: false, hasCurrentSliceDesign: true, hasCurrentTaskFile: true,
      },
    };
    mockGetById.mockResolvedValue(MOCK_PROJECT);
    mockSummarize.mockResolvedValue(mockIntrospection);

    const result = await client.callTool({
      name: 'project_get',
      arguments: { id: MOCK_PROJECT.id },
    });

    expect(result.isError).toBeFalsy();
    const content = result.content as { type: string; text: string }[];
    const parsed = JSON.parse(content[0].text);

    expect(parsed.introspection).toBeDefined();
    expect(parsed.introspection.slicePlan.totalSlices).toBe(7);
    expect(parsed.introspection.currentTasks.summary).toBe('5 of 10 tasks done');
    expect(parsed.id).toBe(MOCK_PROJECT.id);
  });

  it('returns project without introspection when project has no projectPath', async () => {
    const projectNoPath = { ...MOCK_PROJECT, projectPath: undefined };
    mockGetById.mockResolvedValue(projectNoPath);

    const result = await client.callTool({
      name: 'project_get',
      arguments: { id: MOCK_PROJECT.id },
    });

    expect(result.isError).toBeFalsy();
    const content = result.content as { type: string; text: string }[];
    const parsed = JSON.parse(content[0].text);

    expect(parsed.introspection).toBeUndefined();
    expect(mockSummarize).not.toHaveBeenCalled();
  });

  it('returns project without introspection when introspector throws (graceful degradation)', async () => {
    mockGetById.mockResolvedValue(MOCK_PROJECT);
    mockSummarize.mockRejectedValue(new Error('Introspection failed'));

    const result = await client.callTool({
      name: 'project_get',
      arguments: { id: MOCK_PROJECT.id },
    });

    expect(result.isError).toBeFalsy();
    const content = result.content as { type: string; text: string }[];
    const parsed = JSON.parse(content[0].text);

    expect(parsed.introspection).toBeUndefined();
    expect(parsed.id).toBe(MOCK_PROJECT.id);
  });
});

describe('default_project fallback', () => {
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

  it('project_get uses default_project when id omitted', async () => {
    mockConfigGet.mockResolvedValue({
      key: 'default_project',
      value: MOCK_PROJECT.id,
      source: 'user',
    });
    mockGetById.mockResolvedValue(MOCK_PROJECT);
    mockSummarize.mockResolvedValue({
      artifacts: { hasSlicePlan: false, hasHLD: false, hasArch: false, hasSpec: false, hasCurrentSliceDesign: false, hasCurrentTaskFile: false },
    });

    const result = await client.callTool({ name: 'project_get', arguments: {} });

    expect(result.isError).toBeFalsy();
    expect(mockGetById).toHaveBeenCalledWith(MOCK_PROJECT.id);
  });

  it('project_get returns error when id omitted and no default_project configured', async () => {
    mockConfigGet.mockResolvedValue({
      key: 'default_project',
      value: '',
      source: 'default',
    });

    const result = await client.callTool({ name: 'project_get', arguments: {} });

    expect(result.isError).toBe(true);
    const content = result.content as { type: string; text: string }[];
    expect(content[0].text).toContain('No project ID provided');
  });
});

describe('project_schema', () => {
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

  it('returns JSON with fields, aliases, groups keys', async () => {
    const result = await client.callTool({ name: 'project_schema', arguments: {} });

    expect(result.isError).toBeFalsy();
    const content = result.content as { type: string; text: string }[];
    const parsed = JSON.parse(content[0].text);

    expect(parsed).toHaveProperty('fields');
    expect(parsed).toHaveProperty('aliases');
    expect(parsed).toHaveProperty('groups');
  });

  it('fields array contains expected field definitions', async () => {
    const result = await client.callTool({ name: 'project_schema', arguments: {} });

    const content = result.content as { type: string; text: string }[];
    const parsed = JSON.parse(content[0].text);

    const fieldNames = parsed.fields.map((f: { field: string }) => f.field);
    expect(fieldNames).toContain('name');
    expect(fieldNames).toContain('developmentPhase');
    expect(fieldNames).toContain('fileArch');
    expect(fieldNames).toContain('createdAt');
  });

  it('aliases object maps correctly', async () => {
    const result = await client.callTool({ name: 'project_schema', arguments: {} });

    const content = result.content as { type: string; text: string }[];
    const parsed = JSON.parse(content[0].text);

    expect(parsed.aliases.phase).toBe('developmentPhase');
    expect(parsed.aliases.arch).toBe('fileArch');
    expect(parsed.aliases.path).toBe('projectPath');
  });
});

// --- Worktree-aware project_update tests ---

const MOCK_WORKTREE = {
  id: 'wt_test_001',
  name: 'Feature Branch',
  indexRange: [100, 199] as [number, number],
  developmentPhase: 'implementation',
  activeSlice: '100-slice.feature',
  activeTaskFile: '100-tasks.feature',
  instruction: 'implementation',
};

const MOCK_PROJECT_WITH_WT: ProjectData = {
  ...MOCK_PROJECT,
  worktrees: [MOCK_WORKTREE],
};

describe('project_update with worktreeId', () => {
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

  it('routes workflow field to worktree and auto-sets instruction', async () => {
    mockGetById.mockResolvedValue(MOCK_PROJECT_WITH_WT);
    mockWtGetWorktree.mockResolvedValue(MOCK_WORKTREE);
    mockWtUpdateWorktree.mockResolvedValue({});

    const result = await client.callTool({
      name: 'project_update',
      arguments: {
        id: MOCK_PROJECT.id,
        worktreeId: MOCK_WORKTREE.id,
        developmentPhase: 'review',
      },
    });

    expect(result.isError).toBeFalsy();
    // developmentPhase is worktree-scoped → routed to updateWorktree with auto-set instruction
    expect(mockWtUpdateWorktree).toHaveBeenCalledWith(
      MOCK_PROJECT.id,
      MOCK_WORKTREE.id,
      expect.objectContaining({
        developmentPhase: 'review',
        instruction: 'review',
      }),
    );
    // No project-level update should happen (only worktree fields)
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('routes project field to project store', async () => {
    mockGetById.mockResolvedValue(MOCK_PROJECT_WITH_WT);
    mockWtGetWorktree.mockResolvedValue(MOCK_WORKTREE);

    const result = await client.callTool({
      name: 'project_update',
      arguments: {
        id: MOCK_PROJECT.id,
        worktreeId: MOCK_WORKTREE.id,
        name: 'New Name',
      },
    });

    expect(result.isError).toBeFalsy();
    // name is project-level → routed to store.update
    expect(mockUpdate).toHaveBeenCalledWith(MOCK_PROJECT.id, { name: 'New Name' });
    // No worktree update
    expect(mockWtUpdateWorktree).not.toHaveBeenCalled();
  });

  it('splits mixed fields between worktree and project', async () => {
    mockGetById.mockResolvedValue(MOCK_PROJECT_WITH_WT);
    mockWtGetWorktree.mockResolvedValue(MOCK_WORKTREE);
    mockWtUpdateWorktree.mockResolvedValue({});

    const result = await client.callTool({
      name: 'project_update',
      arguments: {
        id: MOCK_PROJECT.id,
        worktreeId: MOCK_WORKTREE.id,
        name: 'Updated Name',
        developmentPhase: 'design',
      },
    });

    expect(result.isError).toBeFalsy();
    expect(mockUpdate).toHaveBeenCalledWith(MOCK_PROJECT.id, { name: 'Updated Name' });
    expect(mockWtUpdateWorktree).toHaveBeenCalledWith(
      MOCK_PROJECT.id,
      MOCK_WORKTREE.id,
      expect.objectContaining({ developmentPhase: 'design', instruction: 'design' }),
    );
  });

  it('maps fileSlice to activeSlice and auto-sets activeTaskFile', async () => {
    mockGetById.mockResolvedValue(MOCK_PROJECT_WITH_WT);
    mockWtGetWorktree.mockResolvedValue(MOCK_WORKTREE);
    mockWtUpdateWorktree.mockResolvedValue({});
    mockResolveFileByIndex.mockReturnValue('150-tasks.new-feature');

    const result = await client.callTool({
      name: 'project_update',
      arguments: {
        id: MOCK_PROJECT.id,
        worktreeId: MOCK_WORKTREE.id,
        fileSlice: '150-slice.new-feature',
      },
    });

    expect(result.isError).toBeFalsy();
    expect(mockWtUpdateWorktree).toHaveBeenCalledWith(
      MOCK_PROJECT.id,
      MOCK_WORKTREE.id,
      expect.objectContaining({
        activeSlice: '150-slice.new-feature',
        activeTaskFile: '150-tasks.new-feature',
      }),
    );
  });

  it('existing behavior unchanged without worktreeId', async () => {
    mockGetById.mockResolvedValue(MOCK_PROJECT);

    const result = await client.callTool({
      name: 'project_update',
      arguments: {
        id: MOCK_PROJECT.id,
        developmentPhase: 'review',
      },
    });

    expect(result.isError).toBeFalsy();
    expect(mockUpdate).toHaveBeenCalledWith(
      MOCK_PROJECT.id,
      expect.objectContaining({ developmentPhase: 'review', instruction: 'review' }),
    );
    expect(mockWtUpdateWorktree).not.toHaveBeenCalled();
  });

  it('returns error when worktreeId not found', async () => {
    mockGetById.mockResolvedValue(MOCK_PROJECT_WITH_WT);
    mockWtGetWorktree.mockResolvedValue(undefined);
    mockWtGetWorktreeByName.mockResolvedValue(undefined);

    const result = await client.callTool({
      name: 'project_update',
      arguments: {
        id: MOCK_PROJECT.id,
        worktreeId: 'nonexistent',
        developmentPhase: 'review',
      },
    });

    expect(result.isError).toBe(true);
    const content = result.content as { type: string; text: string }[];
    expect(content[0].text).toContain('not found');
  });

  it('includes _worktreeUpdated indicator in response', async () => {
    mockGetById.mockResolvedValue(MOCK_PROJECT_WITH_WT);
    mockWtGetWorktree.mockResolvedValue(MOCK_WORKTREE);
    mockWtUpdateWorktree.mockResolvedValue({});

    const result = await client.callTool({
      name: 'project_update',
      arguments: {
        id: MOCK_PROJECT.id,
        worktreeId: MOCK_WORKTREE.id,
        instruction: 'review',
      },
    });

    expect(result.isError).toBeFalsy();
    const content = result.content as { type: string; text: string }[];
    const parsed = JSON.parse(content[0].text);
    expect(parsed._worktreeUpdated).toBe(MOCK_WORKTREE.id);
  });
});

// ─── project_create ───────────────────────────────────────────────────────────

describe('project_create', () => {
  let client: Client;
  let cleanup: () => Promise<void>;

  const CREATED_PROJECT: ProjectData = {
    id: 'project_99990001',
    name: 'Test Project',
    template: 'default',
    fileSlice: '',
    fileTasks: '',
    instruction: 'implementation',
    developmentPhase: 'Phase 2: Specification',
    dateProject: '20260315',
    projectPath: '/tmp/test-project',
    createdAt: '2026-03-15T00:00:00.000Z',
    updatedAt: '2026-03-15T00:00:00.000Z',
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

  // 2.3 — successful creation with all parameters
  it('creates project with all parameters and returns full project data', async () => {
    mockGetAll.mockResolvedValue([]);
    mockCreate.mockResolvedValue(CREATED_PROJECT);
    mockSummarize.mockRejectedValue(new Error('no path'));

    const result = await client.callTool({
      name: 'project_create',
      arguments: { name: 'Test Project', projectPath: '/tmp/test-project', developmentPhase: 'Phase 2: Specification' },
    });

    expect(result.isError).toBeFalsy();
    expect(mockCreate).toHaveBeenCalledOnce();
    const createArg = mockCreate.mock.calls[0][0] as Record<string, unknown>;
    expect(createArg.name).toBe('Test Project');
    expect(createArg.projectPath).toBe('/tmp/test-project');
    expect(createArg.developmentPhase).toBe('Phase 2: Specification');
    expect(createArg.template).toBe('default');
    expect(createArg.instruction).toBe('Phase 2: Specification');
    expect(createArg.fileSlice).toBe('');
    expect(createArg.dateProject).toMatch(/^\d{8}$/);
    const content = result.content as { type: string; text: string }[];
    const parsed = JSON.parse(content[0].text);
    expect(parsed.id).toBe(CREATED_PROJECT.id);
    expect(parsed.name).toBe('Test Project');
  });

  // 2.4 — creation with name only (defaults applied)
  it('creates project with name only and applies defaults', async () => {
    const minimalProject: ProjectData = {
      ...CREATED_PROJECT,
      id: 'project_99990002',
      name: 'Minimal Project',
      projectPath: undefined,
      developmentPhase: 'Phase 1: Concept',
    };
    mockGetAll.mockResolvedValue([]);
    mockCreate.mockResolvedValue(minimalProject);

    const result = await client.callTool({
      name: 'project_create',
      arguments: { name: 'Minimal Project' },
    });

    expect(result.isError).toBeFalsy();
    const createArg = mockCreate.mock.calls[0][0] as Record<string, unknown>;
    expect(createArg.developmentPhase).toBe('Phase 1: Concept');
    expect(createArg.projectPath).toBeUndefined();
    // No introspection attempted when projectPath absent
    expect(mockSummarize).not.toHaveBeenCalled();
    const content = result.content as { type: string; text: string }[];
    const parsed = JSON.parse(content[0].text);
    expect(parsed.name).toBe('Minimal Project');
  });

  // 2.5 — duplicate path detection
  it('returns error when a project already exists at the given path', async () => {
    mockGetAll.mockResolvedValue([
      { ...MOCK_PROJECT, id: 'project_existing', name: 'Original Project', projectPath: '/existing/path' },
    ]);

    const result = await client.callTool({
      name: 'project_create',
      arguments: { name: 'Dup Project', projectPath: '/existing/path' },
    });

    expect(result.isError).toBe(true);
    const content = result.content as { type: string; text: string }[];
    expect(content[0].text).toContain('Original Project');
    expect(content[0].text).toContain('project_existing');
    expect(mockCreate).not.toHaveBeenCalled();
  });

  // 2.6 — missing name validation
  it('returns error when name is empty', async () => {
    const result = await client.callTool({
      name: 'project_create',
      arguments: { name: '' },
    });

    expect(result.isError).toBe(true);
    const content = result.content as { type: string; text: string }[];
    expect(content[0].text).toContain('required');
    expect(mockCreate).not.toHaveBeenCalled();
  });

  // 2.7 — introspection enrichment
  it('enriches response with introspection when projectPath is set', async () => {
    mockGetAll.mockResolvedValue([]);
    mockCreate.mockResolvedValue(CREATED_PROJECT);
    mockSummarize.mockResolvedValue({ slicePlan: { totalSlices: 0 } });

    const result = await client.callTool({
      name: 'project_create',
      arguments: { name: 'Intro Project', projectPath: '/tmp/intro' },
    });

    expect(result.isError).toBeFalsy();
    const content = result.content as { type: string; text: string }[];
    const parsed = JSON.parse(content[0].text);
    expect(parsed.introspection).toBeDefined();
    expect(parsed.introspection.slicePlan.totalSlices).toBe(0);
  });

  // 2.8 — introspection failure graceful degradation
  it('succeeds and returns project data even when introspection throws', async () => {
    mockGetAll.mockResolvedValue([]);
    mockCreate.mockResolvedValue(CREATED_PROJECT);
    mockSummarize.mockRejectedValue(new Error('introspection failed'));

    const result = await client.callTool({
      name: 'project_create',
      arguments: { name: 'Intro Project', projectPath: '/tmp/intro' },
    });

    expect(result.isError).toBeFalsy();
    const content = result.content as { type: string; text: string }[];
    const parsed = JSON.parse(content[0].text);
    expect(parsed.id).toBe(CREATED_PROJECT.id);
    expect(parsed.introspection).toBeUndefined();
  });
});
