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

const mockMergeProjectModels = vi.fn();

vi.mock('@context-forge/core/node', () => ({
  FileProjectStore: vi.fn().mockImplementation(() => ({
    getById: mockGetById,
    getAll: vi.fn().mockResolvedValue([]),
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
  mergeProjectModels: (...args: unknown[]) => mockMergeProjectModels(...args),
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
      entries: [{ index: 100, name: 'test', status: 'complete', isChecked: true, lineIndex: 0 }],
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

  it('filters initiatives by worktree index range', async () => {
    const projectWithWt: ProjectData = {
      ...MOCK_PROJECT,
      worktrees: [
        { id: 'wt_default', name: 'default', indexRange: [100, 799] as [number, number], worktreePath: '/repos/main' },
        { id: 'wt_api', name: 'api-layer', indexRange: [300, 499] as [number, number], worktreePath: '/repos/api' },
      ],
    };
    mockGetById.mockResolvedValue(projectWithWt);
    mockBuildModel.mockResolvedValue({
      name: 'Test',
      initiatives: {
        '100': { name: 'Core', slices: [] },
        '300': { name: 'API', slices: [] },
        '500': { name: 'UI', slices: [] },
      },
    });

    const result = await client.callTool({
      name: 'project_structure',
      arguments: { projectId: projectWithWt.id, worktreeId: 'api-layer' },
    });

    expect(result.isError).toBeFalsy();
    const parsed = parseResult(result) as { initiatives: Record<string, unknown> };
    expect(Object.keys(parsed.initiatives)).toEqual(['300']);
  });

  it('shows all initiatives when no worktreeId provided', async () => {
    mockGetById.mockResolvedValue(MOCK_PROJECT);
    mockBuildModel.mockResolvedValue({
      name: 'Test',
      initiatives: {
        '100': { name: 'Core', slices: [] },
        '300': { name: 'API', slices: [] },
      },
    });

    const result = await client.callTool({
      name: 'project_structure',
      arguments: { projectId: MOCK_PROJECT.id },
    });

    expect(result.isError).toBeFalsy();
    const parsed = parseResult(result) as { initiatives: Record<string, unknown> };
    expect(Object.keys(parsed.initiatives)).toEqual(['100', '300']);
  });

  it('resolves worktreeId by name (case-insensitive)', async () => {
    const projectWithWt: ProjectData = {
      ...MOCK_PROJECT,
      worktrees: [
        { id: 'wt_api', name: 'API-Layer', indexRange: [300, 499] as [number, number], worktreePath: '/repos/api' },
      ],
    };
    mockGetById.mockResolvedValue(projectWithWt);
    mockBuildModel.mockResolvedValue({
      name: 'Test',
      initiatives: { '300': { name: 'API', slices: [] } },
    });

    const result = await client.callTool({
      name: 'project_structure',
      arguments: { projectId: projectWithWt.id, worktreeId: 'api-layer' },
    });

    expect(result.isError).toBeFalsy();
    expect(mockBuildModel).toHaveBeenCalledWith('/repos/api', expect.anything());
  });

  it('all: true returns merged model from all worktree paths', async () => {
    const projectWithWt: ProjectData = {
      ...MOCK_PROJECT,
      worktrees: [
        { id: 'wt_default', name: 'default', indexRange: [100, 799] as [number, number], worktreePath: '/repos/main' },
        { id: 'wt_api', name: 'api', indexRange: [300, 499] as [number, number], worktreePath: '/repos/api' },
      ],
    };
    mockGetById.mockResolvedValue(projectWithWt);

    const model1 = { name: 'Test', initiatives: { '100': { name: 'Core' } } };
    const model2 = { name: 'Test', initiatives: { '300': { name: 'API' } } };
    const mergedModel = { name: 'Test', initiatives: { '100': { name: 'Core' }, '300': { name: 'API' } } };

    mockBuildModel.mockResolvedValueOnce(model1).mockResolvedValueOnce(model2).mockResolvedValueOnce(model1);
    mockMergeProjectModels.mockReturnValue(mergedModel);

    const result = await client.callTool({
      name: 'project_structure',
      arguments: { projectId: projectWithWt.id, all: true },
    });

    expect(result.isError).toBeFalsy();
    expect(mockMergeProjectModels).toHaveBeenCalled();
    const parsed = parseResult(result) as { initiatives: Record<string, unknown> };
    expect(Object.keys(parsed.initiatives)).toEqual(['100', '300']);
  });

  it('all: false uses single path with index filtering', async () => {
    mockGetById.mockResolvedValue(MOCK_PROJECT);
    mockBuildModel.mockResolvedValue({
      name: 'Test',
      initiatives: { '100': { name: 'Core' } },
    });

    const result = await client.callTool({
      name: 'project_structure',
      arguments: { projectId: MOCK_PROJECT.id, all: false },
    });

    expect(result.isError).toBeFalsy();
    expect(mockMergeProjectModels).not.toHaveBeenCalled();
  });

  it('filters default worktree by its own index range', async () => {
    const projectWithWt: ProjectData = {
      ...MOCK_PROJECT,
      worktrees: [
        { id: 'wt_default', name: 'default', indexRange: [100, 299] as [number, number], worktreePath: '/repos/main' },
      ],
    };
    mockGetById.mockResolvedValue(projectWithWt);
    mockBuildModel.mockResolvedValue({
      name: 'Test',
      initiatives: {
        '100': { name: 'Core', slices: [] },
        '300': { name: 'API', slices: [] },
      },
    });

    const result = await client.callTool({
      name: 'project_structure',
      arguments: { projectId: projectWithWt.id, worktreeId: 'default' },
    });

    expect(result.isError).toBeFalsy();
    const parsed = parseResult(result) as { initiatives: Record<string, unknown> };
    // Default worktree now filters by its own range (100-299)
    expect(Object.keys(parsed.initiatives)).toEqual(['100']);
  });
});
