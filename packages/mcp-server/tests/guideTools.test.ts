import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { registerGuideTools } from '../src/tools/guideTools.js';

// --- Mocks ---

const mockStatus = vi.fn();
const mockInstall = vi.fn();
const mockUpdate = vi.fn();
const mockSyncWorktrees = vi.fn();
const mockCheckSyncStatus = vi.fn();
const mockGetById = vi.fn();

vi.mock('@context-forge/core/node', () => ({
  FileProjectStore: vi.fn().mockImplementation(() => ({
    getById: mockGetById,
  })),
  GuideManager: vi.fn().mockImplementation(() => ({
    status: mockStatus,
    install: mockInstall,
    update: mockUpdate,
    syncWorktrees: mockSyncWorktrees,
  })),
  GuideDetector: vi.fn().mockImplementation(() => ({
    checkSyncStatus: mockCheckSyncStatus,
  })),
  ConfigManager: vi.fn().mockImplementation(() => ({
    get: vi.fn().mockResolvedValue({ value: '', source: 'default' }),
  })),
}));

// Mock resolveProjectId to return the provided ID directly
vi.mock('../src/tools/resolveProjectId.js', () => ({
  resolveProjectId: vi.fn().mockImplementation(async (id?: string) => {
    if (!id) throw new Error('No project ID');
    return id;
  }),
}));

// --- Test helpers ---

const sampleProject = {
  id: 'test-project',
  name: 'Test Project',
  projectPath: '/test/project',
};

const sampleProjectWithWorktrees = {
  ...sampleProject,
  worktrees: [
    { id: 'wt_1', name: 'default', worktreePath: '/test/project', indexRange: [100, 299] },
    { id: 'wt_2', name: 'world-server', worktreePath: '/test/project-ws', indexRange: [300, 499] },
  ],
};

const sampleGuideInfo = {
  installed: true,
  method: 'submodule',
  version: 'v0.13.2',
  path: '/test/project/project-documents/ai-project-guide',
  source: 'https://github.com/ecorkran/ai-project-guide.git',
  latestVersion: 'v0.13.2',
  updateAvailable: false,
  usingBundledPrompt: false,
};

async function createTestClient(): Promise<{ client: Client; cleanup: () => Promise<void> }> {
  const server = new McpServer({ name: 'test-server', version: '0.1.0' });
  registerGuideTools(server);

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

describe('guide_status', () => {
  let client: Client;
  let cleanup: () => Promise<void>;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockGetById.mockResolvedValue(sampleProject);
    const ctx = await createTestClient();
    client = ctx.client;
    cleanup = ctx.cleanup;
  });

  afterEach(async () => {
    await cleanup();
  });

  it('resolves project and returns GuideInfo JSON', async () => {
    mockStatus.mockResolvedValue(sampleGuideInfo);

    const result = await client.callTool({
      name: 'guide_status',
      arguments: { projectId: 'test-project' },
    });

    expect(result.isError).toBeFalsy();
    const content = result.content as { type: string; text: string }[];
    const parsed = JSON.parse(content[0].text);
    expect(parsed.installed).toBe(true);
    expect(parsed.method).toBe('submodule');
    expect(parsed.version).toBe('v0.13.2');
  });

  it('returns error when project not found', async () => {
    mockGetById.mockResolvedValue(null);

    const result = await client.callTool({
      name: 'guide_status',
      arguments: { projectId: 'nonexistent' },
    });

    expect(result.isError).toBe(true);
    const content = result.content as { type: string; text: string }[];
    expect(content[0].text).toContain('not found');
  });
});

describe('guide_install', () => {
  let client: Client;
  let cleanup: () => Promise<void>;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockGetById.mockResolvedValue(sampleProject);
    const ctx = await createTestClient();
    client = ctx.client;
    cleanup = ctx.cleanup;
  });

  afterEach(async () => {
    await cleanup();
  });

  it('passes strategy/source overrides and returns InstallResult', async () => {
    mockInstall.mockResolvedValue({
      success: true,
      version: 'v0.13.2',
      method: 'clone',
      path: '/test/project/project-documents/ai-project-guide',
    });

    const result = await client.callTool({
      name: 'guide_install',
      arguments: {
        projectId: 'test-project',
        strategy: 'clone',
        source: 'https://custom.example.com/guide.git',
      },
    });

    expect(result.isError).toBeFalsy();
    const content = result.content as { type: string; text: string }[];
    const parsed = JSON.parse(content[0].text);
    expect(parsed.success).toBe(true);
    expect(parsed.method).toBe('clone');
  });

  it('returns error result when already installed', async () => {
    mockInstall.mockRejectedValue(new Error('Guide is already installed.'));

    const result = await client.callTool({
      name: 'guide_install',
      arguments: { projectId: 'test-project' },
    });

    expect(result.isError).toBe(true);
    const content = result.content as { type: string; text: string }[];
    expect(content[0].text).toContain('already installed');
  });
});

describe('guide_update', () => {
  let client: Client;
  let cleanup: () => Promise<void>;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockGetById.mockResolvedValue(sampleProject);
    const ctx = await createTestClient();
    client = ctx.client;
    cleanup = ctx.cleanup;
  });

  afterEach(async () => {
    await cleanup();
  });

  it('returns UpdateResult with versions', async () => {
    mockUpdate.mockResolvedValue({
      success: true,
      previousVersion: 'v0.12.0',
      newVersion: 'v0.13.2',
      method: 'submodule',
    });

    const result = await client.callTool({
      name: 'guide_update',
      arguments: { projectId: 'test-project' },
    });

    expect(result.isError).toBeFalsy();
    const content = result.content as { type: string; text: string }[];
    const parsed = JSON.parse(content[0].text);
    expect(parsed.previousVersion).toBe('v0.12.0');
    expect(parsed.newVersion).toBe('v0.13.2');
  });

  it('returns error result when not installed', async () => {
    mockUpdate.mockRejectedValue(new Error('Guide is not installed.'));

    const result = await client.callTool({
      name: 'guide_update',
      arguments: { projectId: 'test-project' },
    });

    expect(result.isError).toBe(true);
    const content = result.content as { type: string; text: string }[];
    expect(content[0].text).toContain('not installed');
  });
});

describe('guide_update worktree sync', () => {
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

  it('calls syncWorktrees when project has worktrees with paths', async () => {
    mockGetById.mockResolvedValue(sampleProjectWithWorktrees);
    mockUpdate.mockResolvedValue({
      success: true, previousVersion: 'v0.12.0', newVersion: 'v0.13.2', method: 'submodule',
    });
    mockSyncWorktrees.mockResolvedValue([
      { worktreePath: '/test/project', success: true },
      { worktreePath: '/test/project-ws', success: true },
    ]);

    const result = await client.callTool({
      name: 'guide_update',
      arguments: { projectId: 'test-project' },
    });

    expect(result.isError).toBeFalsy();
    const content = result.content as { type: string; text: string }[];
    const parsed = JSON.parse(content[0].text);
    expect(parsed.syncResults).toHaveLength(2);
    expect(parsed.syncResults[0].success).toBe(true);
  });

  it('does NOT call syncWorktrees when project has no worktrees', async () => {
    mockGetById.mockResolvedValue(sampleProject);
    mockUpdate.mockResolvedValue({
      success: true, previousVersion: 'v0.12.0', newVersion: 'v0.13.2', method: 'submodule',
    });

    const result = await client.callTool({
      name: 'guide_update',
      arguments: { projectId: 'test-project' },
    });

    expect(result.isError).toBeFalsy();
    expect(mockSyncWorktrees).not.toHaveBeenCalled();
    const content = result.content as { type: string; text: string }[];
    const parsed = JSON.parse(content[0].text);
    expect(parsed.syncResults).toBeUndefined();
  });
});

describe('guide_status worktree sync', () => {
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

  it('includes worktreeSync when project has worktrees and method is submodule', async () => {
    mockGetById.mockResolvedValue(sampleProjectWithWorktrees);
    mockStatus.mockResolvedValue({ ...sampleGuideInfo, method: 'submodule' });
    mockCheckSyncStatus.mockResolvedValueOnce('in_sync').mockResolvedValueOnce('out_of_sync');

    const result = await client.callTool({
      name: 'guide_status',
      arguments: { projectId: 'test-project' },
    });

    expect(result.isError).toBeFalsy();
    const content = result.content as { type: string; text: string }[];
    const parsed = JSON.parse(content[0].text);
    expect(parsed.worktreeSync).toHaveLength(2);
    expect(parsed.worktreeSync[0].status).toBe('in_sync');
    expect(parsed.worktreeSync[1].status).toBe('out_of_sync');
  });

  it('does NOT include worktreeSync for non-submodule methods', async () => {
    mockGetById.mockResolvedValue(sampleProjectWithWorktrees);
    mockStatus.mockResolvedValue({ ...sampleGuideInfo, method: 'clone' });

    const result = await client.callTool({
      name: 'guide_status',
      arguments: { projectId: 'test-project' },
    });

    expect(result.isError).toBeFalsy();
    const content = result.content as { type: string; text: string }[];
    const parsed = JSON.parse(content[0].text);
    expect(parsed.worktreeSync).toBeUndefined();
  });
});

describe('error handling', () => {
  let client: Client;
  let cleanup: () => Promise<void>;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockGetById.mockResolvedValue(sampleProject);
    const ctx = await createTestClient();
    client = ctx.client;
    cleanup = ctx.cleanup;
  });

  afterEach(async () => {
    await cleanup();
  });

  it('exceptions produce error results, not crashes', async () => {
    mockStatus.mockRejectedValue(new Error('Unexpected filesystem error'));

    const result = await client.callTool({
      name: 'guide_status',
      arguments: { projectId: 'test-project' },
    });

    expect(result.isError).toBe(true);
    const content = result.content as { type: string; text: string }[];
    expect(content[0].text).toContain('Unexpected filesystem error');
  });
});
