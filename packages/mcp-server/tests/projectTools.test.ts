import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { ProjectData } from '@context-forge/core';
import { registerProjectTools } from '../src/tools/projectTools.js';

// --- Mock FileProjectStore ---

const mockGetAll = vi.fn<() => Promise<ProjectData[]>>();
const mockGetById = vi.fn<(id: string) => Promise<ProjectData | undefined>>();
const mockUpdate = vi.fn<(id: string, updates: unknown) => Promise<void>>();

vi.mock('@context-forge/core/node', () => ({
  FileProjectStore: vi.fn().mockImplementation(() => ({
    getAll: mockGetAll,
    getById: mockGetById,
    update: mockUpdate,
  })),
}));

// --- Fixtures ---

const MOCK_PROJECT: ProjectData = {
  id: 'project_17390001',
  name: 'test-project',
  template: 'default',
  slice: 'auth',
  taskFile: 'auth-tasks',
  instruction: 'implementation',
  developmentPhase: 'Phase 7',
  workType: 'continue',
  projectDate: '2026-02-19',
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
  slice: 'setup',
  taskFile: 'setup-tasks',
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
      slice: MOCK_PROJECT.slice,
      template: MOCK_PROJECT.template,
      instruction: MOCK_PROJECT.instruction,
      isMonorepo: MOCK_PROJECT.isMonorepo,
      projectPath: MOCK_PROJECT.projectPath,
      updatedAt: MOCK_PROJECT.updatedAt,
    });

    // Summary should NOT include full fields like customData, createdAt
    expect(first.customData).toBeUndefined();
    expect(first.createdAt).toBeUndefined();
    expect(first.taskFile).toBeUndefined();
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
    expect(parsed.taskFile).toBe(MOCK_PROJECT.taskFile);
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
    const updatedProject = { ...MOCK_PROJECT, slice: 'new-slice', updatedAt: '2026-02-19T13:00:00.000Z' };

    // First getById call: existence check; second: read-back after update
    mockGetById.mockResolvedValueOnce(MOCK_PROJECT).mockResolvedValueOnce(updatedProject);
    mockUpdate.mockResolvedValue(undefined);

    const result = await client.callTool({
      name: 'project_update',
      arguments: { id: MOCK_PROJECT.id, slice: 'new-slice' },
    });

    expect(result.isError).toBeFalsy();
    const content = result.content as { type: string; text: string }[];
    const parsed = JSON.parse(content[0].text);

    expect(parsed.slice).toBe('new-slice');
    expect(parsed.id).toBe(MOCK_PROJECT.id);
    expect(mockUpdate).toHaveBeenCalledWith(MOCK_PROJECT.id, { slice: 'new-slice' });
  });

  it('returns isError for non-existent ID', async () => {
    mockGetById.mockResolvedValue(undefined);

    const result = await client.callTool({
      name: 'project_update',
      arguments: { id: 'project_nonexistent', slice: 'new-slice' },
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
