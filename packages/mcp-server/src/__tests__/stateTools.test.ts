import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { ProjectData } from '@context-forge/core';
import { registerStateTools } from '../tools/stateTools.js';

// --- Mocks ---

const mockGetById = vi.fn<(id: string) => Promise<ProjectData | undefined>>();
const mockUpdate = vi.fn<(id: string, updates: unknown) => Promise<void>>();

vi.mock('@context-forge/core/node', () => ({
  FileProjectStore: vi.fn().mockImplementation(() => ({
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
    additionalNotes: 'Some existing notes',
    monorepoNote: 'Monorepo structure info',
    availableTools: 'context7',
  },
  createdAt: '2026-02-10T00:00:00.000Z',
  updatedAt: '2026-02-19T12:00:00.000Z',
};

// --- Test helpers ---

async function createTestClient(): Promise<{ client: Client; cleanup: () => Promise<void> }> {
  const server = new McpServer({ name: 'test-server', version: '0.1.0' });
  registerStateTools(server);

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

describe('context_summarize', () => {
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

  it('returns updated project as JSON after updating recentEvents', async () => {
    const updatedProject = {
      ...MOCK_PROJECT,
      customData: { ...MOCK_PROJECT.customData, recentEvents: 'Completed auth implementation' },
      updatedAt: '2026-02-20T10:00:00.000Z',
    };

    // First getById: existence check; second: read-back after update
    mockGetById.mockResolvedValueOnce(MOCK_PROJECT).mockResolvedValueOnce(updatedProject);
    mockUpdate.mockResolvedValue(undefined);

    const result = await client.callTool({
      name: 'context_summarize',
      arguments: { projectId: MOCK_PROJECT.id, summary: 'Completed auth implementation' },
    });

    expect(result.isError).toBeFalsy();
    const content = result.content as { type: string; text: string }[];
    const parsed = JSON.parse(content[0].text);

    expect(parsed.id).toBe(MOCK_PROJECT.id);
    expect(parsed.customData.recentEvents).toBe('Completed auth implementation');
  });

  it('preserves other customData fields (monorepoNote, availableTools) during update', async () => {
    mockGetById.mockResolvedValueOnce(MOCK_PROJECT).mockResolvedValueOnce(MOCK_PROJECT);
    mockUpdate.mockResolvedValue(undefined);

    await client.callTool({
      name: 'context_summarize',
      arguments: { projectId: MOCK_PROJECT.id, summary: 'New summary' },
    });

    // Verify the update call preserved existing customData fields
    expect(mockUpdate).toHaveBeenCalledWith(MOCK_PROJECT.id, {
      customData: {
        recentEvents: 'New summary',
        additionalNotes: 'Some existing notes',
        monorepoNote: 'Monorepo structure info',
        availableTools: 'context7',
      },
    });
  });

  it('updates additionalNotes when provided', async () => {
    mockGetById.mockResolvedValueOnce(MOCK_PROJECT).mockResolvedValueOnce(MOCK_PROJECT);
    mockUpdate.mockResolvedValue(undefined);

    await client.callTool({
      name: 'context_summarize',
      arguments: {
        projectId: MOCK_PROJECT.id,
        summary: 'New summary',
        additionalNotes: 'Updated notes',
      },
    });

    expect(mockUpdate).toHaveBeenCalledWith(MOCK_PROJECT.id, {
      customData: {
        recentEvents: 'New summary',
        additionalNotes: 'Updated notes',
        monorepoNote: 'Monorepo structure info',
        availableTools: 'context7',
      },
    });
  });

  it('does not modify additionalNotes when not provided', async () => {
    mockGetById.mockResolvedValueOnce(MOCK_PROJECT).mockResolvedValueOnce(MOCK_PROJECT);
    mockUpdate.mockResolvedValue(undefined);

    await client.callTool({
      name: 'context_summarize',
      arguments: { projectId: MOCK_PROJECT.id, summary: 'New summary' },
    });

    // additionalNotes should remain unchanged from existing customData
    const updateCall = mockUpdate.mock.calls[0][1] as { customData: Record<string, string> };
    expect(updateCall.customData.additionalNotes).toBe('Some existing notes');
  });

  it('returns isError for non-existent project ID', async () => {
    mockGetById.mockResolvedValue(undefined);

    const result = await client.callTool({
      name: 'context_summarize',
      arguments: { projectId: 'project_nonexistent', summary: 'Some summary' },
    });

    expect(result.isError).toBe(true);
    const content = result.content as { type: string; text: string }[];
    expect(content[0].text).toContain('Project not found');
    expect(content[0].text).toContain('project_nonexistent');
    expect(content[0].text).toContain('project_list');
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('returns isError for empty/whitespace-only summary', async () => {
    const result = await client.callTool({
      name: 'context_summarize',
      arguments: { projectId: MOCK_PROJECT.id, summary: '   ' },
    });

    expect(result.isError).toBe(true);
    const content = result.content as { type: string; text: string }[];
    expect(content[0].text).toContain('Summary text is required');
    expect(mockGetById).not.toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('returns isError on store update failure', async () => {
    mockGetById.mockResolvedValue(MOCK_PROJECT);
    mockUpdate.mockRejectedValue(new Error('Disk write failed'));

    const result = await client.callTool({
      name: 'context_summarize',
      arguments: { projectId: MOCK_PROJECT.id, summary: 'New summary' },
    });

    expect(result.isError).toBe(true);
    const content = result.content as { type: string; text: string }[];
    expect(content[0].text).toContain('Disk write failed');
  });
});
