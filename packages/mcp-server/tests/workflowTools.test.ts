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
}));

// --- Fixtures ---

const MOCK_PROJECT: ProjectData = {
  id: 'project_test_001',
  name: 'test-project',
  template: 'default',
  fileSlice: '100-slice.test-feature.md',
  fileTasks: '100-tasks.test-feature.md',
  instruction: 'implementation',
  isMonorepo: false,
  projectPath: '/home/user/projects/test-project',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-03-01T00:00:00.000Z',
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

  it('default_project fallback works when projectId omitted', async () => {
    mockConfigGet.mockResolvedValue({ value: MOCK_PROJECT.id, source: 'user' });
    mockGetById.mockResolvedValue(MOCK_PROJECT);
    mockCollect.mockResolvedValue(MOCK_RESULT);

    const result = await client.callTool({
      name: 'workflow_future',
      arguments: {},
    });

    expect(result.isError).toBeFalsy();
    expect(mockGetById).toHaveBeenCalled();
  });
});
