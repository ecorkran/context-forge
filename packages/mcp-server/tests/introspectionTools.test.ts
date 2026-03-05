import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { ProjectData } from '@context-forge/core';
import { registerIntrospectionTools } from '../src/tools/introspectionTools.js';

// --- Mocks ---

const mockGetById = vi.fn<(id: string) => Promise<ProjectData | undefined>>();
const mockConfigGet = vi.fn();
const mockParseSlicePlan = vi.fn();
const mockParseTaskFile = vi.fn();
const mockParseFrontmatter = vi.fn();
const mockDetectDocuments = vi.fn();
const mockParseFutureWork = vi.fn();
const mockBuildModel = vi.fn();

vi.mock('@context-forge/core/node', () => ({
  FileProjectStore: vi.fn().mockImplementation(() => ({
    getById: mockGetById,
  })),
  ConfigManager: vi.fn().mockImplementation(() => ({
    get: mockConfigGet,
  })),
  ArtifactIntrospector: vi.fn().mockImplementation(() => ({
    parseSlicePlan: mockParseSlicePlan,
    parseTaskFile: mockParseTaskFile,
    parseFrontmatter: mockParseFrontmatter,
    detectDocuments: mockDetectDocuments,
    parseFutureWork: mockParseFutureWork,
  })),
  buildModel: (...args: unknown[]) => mockBuildModel(...args),
}));

// --- Fixtures ---

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

// --- Test helpers ---

async function createTestClient(): Promise<{ client: Client; cleanup: () => Promise<void> }> {
  const server = new McpServer({ name: 'test-server', version: '0.1.0' });
  registerIntrospectionTools(server);

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

describe('introspection_slice_plan', () => {
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

  it('returns SlicePlanResult for valid filePath', async () => {
    const mockResult = {
      filePath: '/tmp/plan.md',
      entries: [{ index: 100, name: 'test', status: 'complete', isChecked: true }],
      totalSlices: 1,
      completedSlices: 1,
    };
    mockParseSlicePlan.mockResolvedValue(mockResult);

    const result = await client.callTool({
      name: 'introspection_slice_plan',
      arguments: { filePath: '/tmp/plan.md' },
    });

    expect(result.isError).toBeFalsy();
    const parsed = parseResult(result);
    expect(parsed).toEqual(mockResult);
  });

  it('resolves projectId + path correctly', async () => {
    mockGetById.mockResolvedValue(MOCK_PROJECT);
    mockParseSlicePlan.mockResolvedValue({
      filePath: '/home/user/projects/test-project/plan.md',
      entries: [],
      totalSlices: 0,
      completedSlices: 0,
    });

    const result = await client.callTool({
      name: 'introspection_slice_plan',
      arguments: { projectId: MOCK_PROJECT.id, path: 'plan.md' },
    });

    expect(result.isError).toBeFalsy();
    expect(mockParseSlicePlan).toHaveBeenCalledWith(
      '/home/user/projects/test-project/plan.md',
    );
  });

  it('returns error when no path provided', async () => {
    const result = await client.callTool({
      name: 'introspection_slice_plan',
      arguments: {},
    });

    expect(result.isError).toBe(true);
    expect(getErrorText(result)).toContain('filePath');
  });
});

describe('introspection_tasks', () => {
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

  it('returns TaskFileResult for valid filePath', async () => {
    const mockResult = {
      filePath: '/tmp/tasks.md',
      items: [{ name: 'Task 1', done: true }],
      totalTasks: 1,
      completedTasks: 1,
      inferredStatus: 'complete',
    };
    mockParseTaskFile.mockResolvedValue(mockResult);

    const result = await client.callTool({
      name: 'introspection_tasks',
      arguments: { filePath: '/tmp/tasks.md' },
    });

    expect(result.isError).toBeFalsy();
    expect(parseResult(result)).toEqual(mockResult);
  });

  it('resolves projectId + path correctly', async () => {
    mockGetById.mockResolvedValue(MOCK_PROJECT);
    mockParseTaskFile.mockResolvedValue({
      filePath: '/home/user/projects/test-project/tasks.md',
      items: [],
      totalTasks: 0,
      completedTasks: 0,
      inferredStatus: 'not-started',
    });

    const result = await client.callTool({
      name: 'introspection_tasks',
      arguments: { projectId: MOCK_PROJECT.id, path: 'tasks.md' },
    });

    expect(result.isError).toBeFalsy();
    expect(mockParseTaskFile).toHaveBeenCalledWith(
      '/home/user/projects/test-project/tasks.md',
    );
  });
});

describe('introspection_frontmatter', () => {
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

  it('returns FrontmatterResult for valid filePath', async () => {
    const mockResult = {
      filePath: '/tmp/doc.md',
      found: true,
      data: { status: 'complete', project: 'test' },
    };
    mockParseFrontmatter.mockResolvedValue(mockResult);

    const result = await client.callTool({
      name: 'introspection_frontmatter',
      arguments: { filePath: '/tmp/doc.md' },
    });

    expect(result.isError).toBeFalsy();
    expect(parseResult(result)).toEqual(mockResult);
  });
});

describe('introspection_documents', () => {
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

  it('returns DocumentDetectionResult for valid projectId + sliceIndex', async () => {
    mockGetById.mockResolvedValue(MOCK_PROJECT);
    const mockResult = {
      sliceDesign: 'project-documents/user/slices/100-slice.test-feature.md',
      taskFile: ['project-documents/user/tasks/100-tasks.test-feature.md'],
      architecture: null,
      slicePlan: null,
    };
    mockDetectDocuments.mockResolvedValue(mockResult);

    const result = await client.callTool({
      name: 'introspection_documents',
      arguments: { projectId: MOCK_PROJECT.id, sliceIndex: 100 },
    });

    expect(result.isError).toBeFalsy();
    expect(parseResult(result)).toEqual(mockResult);
    expect(mockDetectDocuments).toHaveBeenCalledWith(MOCK_PROJECT.projectPath, 100);
  });

  it('accepts projectPath instead of projectId', async () => {
    const mockResult = {
      sliceDesign: null,
      taskFile: null,
      architecture: null,
      slicePlan: null,
    };
    mockDetectDocuments.mockResolvedValue(mockResult);

    const result = await client.callTool({
      name: 'introspection_documents',
      arguments: { projectPath: '/some/path', sliceIndex: 200 },
    });

    expect(result.isError).toBeFalsy();
    expect(mockDetectDocuments).toHaveBeenCalledWith('/some/path', 200);
  });
});

describe('introspection_future_work', () => {
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

  it('returns FutureWorkResult for valid filePath', async () => {
    const mockResult = {
      filePath: '/tmp/plan.md',
      items: [{ index: '165', name: 'Workflow Navigator', done: false }],
    };
    mockParseFutureWork.mockResolvedValue(mockResult);

    const result = await client.callTool({
      name: 'introspection_future_work',
      arguments: { filePath: '/tmp/plan.md' },
    });

    expect(result.isError).toBeFalsy();
    expect(parseResult(result)).toEqual(mockResult);
  });

  it('passes nextIndex parameter through', async () => {
    mockParseFutureWork.mockResolvedValue({ filePath: '/tmp/plan.md', items: [] });

    await client.callTool({
      name: 'introspection_future_work',
      arguments: { filePath: '/tmp/plan.md', nextIndex: 200 },
    });

    expect(mockParseFutureWork).toHaveBeenCalledWith('/tmp/plan.md', 200);
  });
});

describe('project_structure', () => {
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

  it('returns ProjectModel for valid projectId', async () => {
    mockGetById.mockResolvedValue(MOCK_PROJECT);
    const mockModel = {
      name: 'Test Project',
      description: '',
      foundation: [],
      projectArchitecture: [],
      initiatives: {},
      futureSlices: [],
      quality: [],
      investigation: [],
      maintenance: [],
      devlog: false,
    };
    mockBuildModel.mockResolvedValue(mockModel);

    const result = await client.callTool({
      name: 'project_structure',
      arguments: { projectId: MOCK_PROJECT.id },
    });

    expect(result.isError).toBeFalsy();
    const parsed = parseResult(result);
    expect(parsed).toEqual(mockModel);
    expect(mockBuildModel).toHaveBeenCalledWith(MOCK_PROJECT.projectPath, {
      name: undefined,
      description: undefined,
    });
  });

  it('returns error for non-existent projectId', async () => {
    mockGetById.mockResolvedValue(undefined);

    const result = await client.callTool({
      name: 'project_structure',
      arguments: { projectId: 'nonexistent' },
    });

    expect(result.isError).toBe(true);
    expect(getErrorText(result)).toContain('Project not found');
  });

  it('passes name/description overrides to buildModel', async () => {
    mockGetById.mockResolvedValue(MOCK_PROJECT);
    mockBuildModel.mockResolvedValue({ name: 'Custom', description: 'Desc' });

    await client.callTool({
      name: 'project_structure',
      arguments: { projectId: MOCK_PROJECT.id, name: 'Custom', description: 'Desc' },
    });

    expect(mockBuildModel).toHaveBeenCalledWith(MOCK_PROJECT.projectPath, {
      name: 'Custom',
      description: 'Desc',
    });
  });
});
