import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { ProjectData } from '@context-forge/core';
import { registerContextTools } from '../src/tools/contextTools.js';

// --- Mocks ---

const mockGetById = vi.fn<(id: string) => Promise<ProjectData | undefined>>();

const mockGenerateContextFromProject = vi.fn<(project: ProjectData) => Promise<string>>();

const mockGetAllPrompts = vi.fn();

const mockConfigGet = vi.fn();
const mockWtGetWorktree = vi.fn();
const mockWtGetWorktreeByName = vi.fn();

vi.mock('@context-forge/core/node', () => ({
  FileProjectStore: vi.fn().mockImplementation(() => ({
    getById: mockGetById,
  })),
  createContextPipeline: vi.fn().mockImplementation(() => ({
    integrator: {
      generateContextFromProject: mockGenerateContextFromProject,
    },
  })),
  SystemPromptParser: vi.fn().mockImplementation(() => ({
    getAllPrompts: mockGetAllPrompts,
  })),
  ConfigManager: vi.fn().mockImplementation(() => ({
    get: mockConfigGet,
  })),
  resolvePromptFilePath: vi.fn().mockImplementation((projectPath: string) => {
    if (!projectPath) throw new Error("No prompt file found. Run 'cf guide install'.");
    return `${projectPath}/project-documents/ai-project-guide/project-guides/prompt.ai-project.system.md`;
  }),
  WorktreeService: vi.fn().mockImplementation(() => ({
    getWorktree: mockWtGetWorktree,
    getWorktreeByName: mockWtGetWorktreeByName,
  })),
}));

vi.mock('@context-forge/core', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    applyWorktreeOverlay: vi.fn().mockImplementation((project: ProjectData, worktreeId: string) => {
      const wt = (project.worktrees ?? []).find((w) => w.id === worktreeId);
      if (!wt) return project;
      return {
        ...project,
        fileSlice: wt.activeSlice || project.fileSlice,
        fileTasks: wt.activeTaskFile || project.fileTasks,
        developmentPhase: wt.developmentPhase || project.developmentPhase,
        instruction: wt.instruction || project.instruction,
      };
    }),
  };
});

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

const MOCK_PROJECT_NO_PATH: ProjectData = {
  ...MOCK_PROJECT,
  id: 'project_nopath',
  projectPath: undefined,
};

const GENERATED_CONTEXT = '# Project: test-project\nTemplate: default\nSlice: auth\n\nGenerated context content here.';

const MOCK_PROMPTS = [
  {
    name: 'Context Initialization',
    key: 'context-initialization',
    content: 'Initialize context for {projectName} with {template}.',
    parameters: ['projectName', 'template'],
  },
  {
    name: 'Implementation',
    key: 'implementation',
    content: 'Implement the feature described in {slice} using {instruction}.',
    parameters: ['slice', 'instruction'],
  },
  {
    name: 'Code Review',
    key: 'code-review',
    content: 'Review the code changes.',
    parameters: [],
  },
];

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
        fileSlice: 'new-slice',
        instruction: 'design',
      },
    });

    // Verify the working copy passed to generateContextFromProject has overrides
    const calledWith = mockGenerateContextFromProject.mock.calls[0][0];
    expect(calledWith.fileSlice).toBe('new-slice');
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

  it('passes instructionType as instruction override', async () => {
    mockGetById.mockResolvedValue(MOCK_PROJECT);
    mockGenerateContextFromProject.mockResolvedValue(GENERATED_CONTEXT);

    await client.callTool({
      name: 'context_build',
      arguments: {
        projectId: MOCK_PROJECT.id,
        instructionType: 'maintenance',
      },
    });

    const calledWith = mockGenerateContextFromProject.mock.calls[0][0];
    expect(calledWith.instruction).toBe('maintenance');
  });

  it('instructionType takes precedence over instruction when both provided', async () => {
    mockGetById.mockResolvedValue(MOCK_PROJECT);
    mockGenerateContextFromProject.mockResolvedValue(GENERATED_CONTEXT);

    await client.callTool({
      name: 'context_build',
      arguments: {
        projectId: MOCK_PROJECT.id,
        instruction: 'design',
        instructionType: 'maintenance',
      },
    });

    const calledWith = mockGenerateContextFromProject.mock.calls[0][0];
    expect(calledWith.instruction).toBe('maintenance');
  });

  it('omitting instructionType uses stored project instruction', async () => {
    mockGetById.mockResolvedValue(MOCK_PROJECT);
    mockGenerateContextFromProject.mockResolvedValue(GENERATED_CONTEXT);

    await client.callTool({
      name: 'context_build',
      arguments: { projectId: MOCK_PROJECT.id },
    });

    const calledWith = mockGenerateContextFromProject.mock.calls[0][0];
    expect(calledWith.instruction).toBe(MOCK_PROJECT.instruction);
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

describe('prompt_list', () => {
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

  it('returns template listing with names, keys, and count', async () => {
    mockGetById.mockResolvedValue(MOCK_PROJECT);
    mockGetAllPrompts.mockResolvedValue(MOCK_PROMPTS);

    const result = await client.callTool({
      name: 'prompt_list',
      arguments: { projectId: MOCK_PROJECT.id },
    });

    expect(result.isError).toBeFalsy();
    const content = result.content as { type: string; text: string }[];
    const parsed = JSON.parse(content[0].text);

    expect(parsed.count).toBe(3);
    expect(parsed.templates).toHaveLength(3);
    expect(parsed.templates[0]).toEqual({
      name: 'Context Initialization',
      key: 'context-initialization',
      parameterCount: 2,
    });
    expect(parsed.templates[2].parameterCount).toBe(0);
    expect(parsed.promptFile).toContain('prompt.ai-project.system.md');
  });

  it('returns error when project has no projectPath', async () => {
    mockGetById.mockResolvedValue(MOCK_PROJECT_NO_PATH);

    const result = await client.callTool({
      name: 'prompt_list',
      arguments: { projectId: MOCK_PROJECT_NO_PATH.id },
    });

    expect(result.isError).toBe(true);
    const content = result.content as { type: string; text: string }[];
    expect(content[0].text).toContain('no configured path');
  });

  it('handles parse errors gracefully', async () => {
    mockGetById.mockResolvedValue(MOCK_PROJECT);
    mockGetAllPrompts.mockRejectedValue(new Error('System prompt file not found'));

    const result = await client.callTool({
      name: 'prompt_list',
      arguments: { projectId: MOCK_PROJECT.id },
    });

    expect(result.isError).toBe(true);
    const content = result.content as { type: string; text: string }[];
    expect(content[0].text).toContain('System prompt file not found');
  });
});

describe('prompt_get', () => {
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

  it('returns template content for valid name match (case-insensitive)', async () => {
    mockGetById.mockResolvedValue(MOCK_PROJECT);
    mockGetAllPrompts.mockResolvedValue(MOCK_PROMPTS);

    const result = await client.callTool({
      name: 'prompt_get',
      arguments: { projectId: MOCK_PROJECT.id, templateName: 'context initialization' },
    });

    expect(result.isError).toBeFalsy();
    const content = result.content as { type: string; text: string }[];
    expect(content[0].text).toContain('Context Initialization');
    expect(content[0].text).toContain('Initialize context for {projectName}');
  });

  it('returns template content for valid key match', async () => {
    mockGetById.mockResolvedValue(MOCK_PROJECT);
    mockGetAllPrompts.mockResolvedValue(MOCK_PROMPTS);

    const result = await client.callTool({
      name: 'prompt_get',
      arguments: { projectId: MOCK_PROJECT.id, templateName: 'code-review' },
    });

    expect(result.isError).toBeFalsy();
    const content = result.content as { type: string; text: string }[];
    expect(content[0].text).toContain('Code Review');
    expect(content[0].text).toContain('Review the code changes.');
  });

  it('returns isError for non-existent template name', async () => {
    mockGetById.mockResolvedValue(MOCK_PROJECT);
    mockGetAllPrompts.mockResolvedValue(MOCK_PROMPTS);

    const result = await client.callTool({
      name: 'prompt_get',
      arguments: { projectId: MOCK_PROJECT.id, templateName: 'nonexistent-template' },
    });

    expect(result.isError).toBe(true);
    const content = result.content as { type: string; text: string }[];
    expect(content[0].text).toContain('Template not found');
    expect(content[0].text).toContain('nonexistent-template');
    expect(content[0].text).toContain('prompt_list');
  });

  it('returns error for non-existent project', async () => {
    mockGetById.mockResolvedValue(undefined);

    const result = await client.callTool({
      name: 'prompt_get',
      arguments: { projectId: 'project_nonexistent', templateName: 'context initialization' },
    });

    expect(result.isError).toBe(true);
    const content = result.content as { type: string; text: string }[];
    expect(content[0].text).toContain('Project not found');
  });
});

// --- Worktree-aware context_build tests ---

const MOCK_WORKTREE = {
  id: 'wt_ctx_001',
  name: 'Feature WT',
  indexRange: [100, 199] as [number, number],
  activeSlice: '150-slice.wt-feature',
  activeTaskFile: '150-tasks.wt-feature',
  developmentPhase: 'design',
  instruction: 'design',
};

const MOCK_PROJECT_WITH_WT: ProjectData = {
  ...MOCK_PROJECT,
  worktrees: [MOCK_WORKTREE],
};

describe('context_build with worktree', () => {
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

  it('applies worktree overlay when worktree param provided', async () => {
    mockGetById.mockResolvedValue(MOCK_PROJECT_WITH_WT);
    mockWtGetWorktree.mockResolvedValue(MOCK_WORKTREE);
    mockGenerateContextFromProject.mockResolvedValue('context with overlay');

    const result = await client.callTool({
      name: 'context_build',
      arguments: { projectId: MOCK_PROJECT.id, worktree: MOCK_WORKTREE.id },
    });

    expect(result.isError).toBeFalsy();
    // The generateContextFromProject should receive an overlaid project and the resolved worktreeId
    expect(mockGenerateContextFromProject).toHaveBeenCalledWith(
      expect.objectContaining({
        fileSlice: '150-slice.wt-feature',
        instruction: 'design',
      }),
      MOCK_WORKTREE.id,
    );
  });

  it('explicit overrides win over worktree overlay', async () => {
    mockGetById.mockResolvedValue(MOCK_PROJECT_WITH_WT);
    mockWtGetWorktree.mockResolvedValue(MOCK_WORKTREE);
    mockGenerateContextFromProject.mockResolvedValue('context with explicit');

    const result = await client.callTool({
      name: 'context_build',
      arguments: {
        projectId: MOCK_PROJECT.id,
        worktree: MOCK_WORKTREE.id,
        fileSlice: 'explicit-slice',
      },
    });

    expect(result.isError).toBeFalsy();
    // Explicit fileSlice should override worktree overlay; worktreeId is still passed
    expect(mockGenerateContextFromProject).toHaveBeenCalledWith(
      expect.objectContaining({
        fileSlice: 'explicit-slice',
      }),
      MOCK_WORKTREE.id,
    );
  });

  it('existing behavior unchanged without worktree', async () => {
    mockGetById.mockResolvedValue(MOCK_PROJECT);
    mockGenerateContextFromProject.mockResolvedValue('standard context');

    const result = await client.callTool({
      name: 'context_build',
      arguments: { projectId: MOCK_PROJECT.id },
    });

    expect(result.isError).toBeFalsy();
    expect(mockWtGetWorktree).not.toHaveBeenCalled();
  });

  it('returns error when worktree not found', async () => {
    mockGetById.mockResolvedValue(MOCK_PROJECT_WITH_WT);
    mockWtGetWorktree.mockResolvedValue(undefined);
    mockWtGetWorktreeByName.mockResolvedValue(undefined);

    const result = await client.callTool({
      name: 'context_build',
      arguments: { projectId: MOCK_PROJECT.id, worktree: 'nonexistent' },
    });

    expect(result.isError).toBe(true);
    const content = result.content as { type: string; text: string }[];
    expect(content[0].text).toContain('not found');
  });
});
