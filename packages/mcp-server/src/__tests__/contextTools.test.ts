import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { ProjectData } from '@context-forge/core';
import { registerContextTools } from '../tools/contextTools.js';

// --- Mocks ---

const mockGetById = vi.fn<(id: string) => Promise<ProjectData | undefined>>();

const mockGenerateContextFromProject = vi.fn<(project: ProjectData) => Promise<string>>();

vi.mock('@context-forge/core/node', () => ({
  FileProjectStore: vi.fn().mockImplementation(() => ({
    getById: mockGetById,
  })),
  createContextPipeline: vi.fn().mockImplementation(() => ({
    integrator: {
      generateContextFromProject: mockGenerateContextFromProject,
    },
  })),
  SystemPromptParser: vi.fn(),
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

const MOCK_PROJECT_NO_PATH: ProjectData = {
  ...MOCK_PROJECT,
  id: 'project_nopath',
  projectPath: undefined,
};

const GENERATED_CONTEXT = '# Project: test-project\nTemplate: default\nSlice: auth\n\nGenerated context content here.';

// --- Test helpers ---

async function createTestClient(): Promise<{ client: Client; cleanup: () => Promise<void> }> {
  const server = new McpServer({ name: 'test-server', version: '0.1.0' });
  registerContextTools(server);

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

describe('context_build', () => {
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

  it('returns assembled context string for valid project (plain text)', async () => {
    mockGetById.mockResolvedValue(MOCK_PROJECT);
    mockGenerateContextFromProject.mockResolvedValue(GENERATED_CONTEXT);

    const result = await client.callTool({
      name: 'context_build',
      arguments: { projectId: MOCK_PROJECT.id },
    });

    expect(result.isError).toBeFalsy();
    const content = result.content as { type: string; text: string }[];
    // Plain text — not JSON-wrapped
    expect(content[0].text).toBe(GENERATED_CONTEXT);
    expect(() => JSON.parse(content[0].text)).toThrow();
  });

  it('applies override parameters to the working copy', async () => {
    mockGetById.mockResolvedValue(MOCK_PROJECT);
    mockGenerateContextFromProject.mockResolvedValue(GENERATED_CONTEXT);

    await client.callTool({
      name: 'context_build',
      arguments: {
        projectId: MOCK_PROJECT.id,
        slice: 'new-slice',
        instruction: 'design',
      },
    });

    // Verify the working copy passed to generateContextFromProject has overrides
    const calledWith = mockGenerateContextFromProject.mock.calls[0][0];
    expect(calledWith.slice).toBe('new-slice');
    expect(calledWith.instruction).toBe('design');
    // Unmodified fields should remain
    expect(calledWith.name).toBe(MOCK_PROJECT.name);
    expect(calledWith.template).toBe(MOCK_PROJECT.template);
  });

  it('appends additionalInstructions when provided', async () => {
    mockGetById.mockResolvedValue(MOCK_PROJECT);
    mockGenerateContextFromProject.mockResolvedValue(GENERATED_CONTEXT);

    const result = await client.callTool({
      name: 'context_build',
      arguments: {
        projectId: MOCK_PROJECT.id,
        additionalInstructions: 'Focus on security review.',
      },
    });

    expect(result.isError).toBeFalsy();
    const content = result.content as { type: string; text: string }[];
    expect(content[0].text).toContain(GENERATED_CONTEXT);
    expect(content[0].text).toContain('Focus on security review.');
    // Should be separated by double newline
    expect(content[0].text).toBe(`${GENERATED_CONTEXT}\n\nFocus on security review.`);
  });

  it('returns isError for non-existent project ID', async () => {
    mockGetById.mockResolvedValue(undefined);

    const result = await client.callTool({
      name: 'context_build',
      arguments: { projectId: 'project_nonexistent' },
    });

    expect(result.isError).toBe(true);
    const content = result.content as { type: string; text: string }[];
    expect(content[0].text).toContain('Project not found');
    expect(content[0].text).toContain('project_nonexistent');
    expect(content[0].text).toContain('project_list');
  });

  it('returns isError when project has no projectPath', async () => {
    mockGetById.mockResolvedValue(MOCK_PROJECT_NO_PATH);

    const result = await client.callTool({
      name: 'context_build',
      arguments: { projectId: MOCK_PROJECT_NO_PATH.id },
    });

    expect(result.isError).toBe(true);
    const content = result.content as { type: string; text: string }[];
    expect(content[0].text).toContain('no configured project path');
  });

  it('returns isError on core generation failure', async () => {
    mockGetById.mockResolvedValue(MOCK_PROJECT);
    mockGenerateContextFromProject.mockRejectedValue(new Error('Template parse error'));

    const result = await client.callTool({
      name: 'context_build',
      arguments: { projectId: MOCK_PROJECT.id },
    });

    expect(result.isError).toBe(true);
    const content = result.content as { type: string; text: string }[];
    expect(content[0].text).toContain('Template parse error');
  });
});

describe('template_preview', () => {
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

  it('returns same output as context_build for identical parameters', async () => {
    mockGetById.mockResolvedValue(MOCK_PROJECT);
    mockGenerateContextFromProject.mockResolvedValue(GENERATED_CONTEXT);

    const result = await client.callTool({
      name: 'template_preview',
      arguments: { projectId: MOCK_PROJECT.id },
    });

    expect(result.isError).toBeFalsy();
    const content = result.content as { type: string; text: string }[];
    expect(content[0].text).toBe(GENERATED_CONTEXT);
  });

  it('returns isError for non-existent project', async () => {
    mockGetById.mockResolvedValue(undefined);

    const result = await client.callTool({
      name: 'template_preview',
      arguments: { projectId: 'project_nonexistent' },
    });

    expect(result.isError).toBe(true);
    const content = result.content as { type: string; text: string }[];
    expect(content[0].text).toContain('Project not found');
  });
});
