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
const mockConfigGet = vi.fn();
const mockSummarize = vi.fn();

vi.mock('@context-forge/core/node', () => ({
  FileProjectStore: vi.fn().mockImplementation(() => ({
    getAll: mockGetAll,
    getById: mockGetById,
    update: mockUpdate,
  })),
  ConfigManager: vi.fn().mockImplementation(() => ({
    get: mockConfigGet,
  })),
  ArtifactIntrospector: vi.fn().mockImplementation(() => ({
    summarize: mockSummarize,
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
  isMonorepo: false,
  isMonorepoEnabled: false,
  projectPath: '/home/user/projects/test-project',
  customData: {
    recentEvents: 'Started auth slice',
    additionalNotes: '',
    monorepoNote: '',
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
  isMonorepo: true,
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
      isMonorepo: MOCK_PROJECT.isMonorepo,
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
