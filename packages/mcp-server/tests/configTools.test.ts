import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { registerConfigTools } from '../src/tools/configTools.js';

// --- Mocks ---

const mockGet = vi.fn();
const mockSet = vi.fn();
const mockList = vi.fn();

vi.mock('@context-forge/core/node', () => ({
  ConfigManager: vi.fn().mockImplementation(() => ({
    get: mockGet,
    set: mockSet,
    list: mockList,
  })),
  getUserConfigPath: vi.fn().mockReturnValue('/home/user/.config/context-forge/config.toml'),
  getProjectConfigPath: vi
    .fn()
    .mockReturnValue('/home/user/projects/test/.context-forge.toml'),
}));

// --- Test helpers ---

async function createTestClient(): Promise<{ client: Client; cleanup: () => Promise<void> }> {
  const server = new McpServer({ name: 'test-server', version: '0.1.0' });
  registerConfigTools(server);

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

describe('config_get', () => {
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

  it('returns default value for unconfigured key', async () => {
    mockGet.mockResolvedValue({
      key: 'guide.source',
      value: '',
      source: 'default',
      description: 'URL or path to the AI project guide source',
    });

    const result = await client.callTool({
      name: 'config_get',
      arguments: { key: 'guide.source' },
    });

    expect(result.isError).toBeFalsy();
    const content = result.content as { type: string; text: string }[];
    const parsed = JSON.parse(content[0].text);
    expect(parsed.source).toBe('default');
    expect(parsed.value).toBe('');
  });

  it('returns user-configured value with source', async () => {
    mockGet.mockResolvedValue({
      key: 'guide.source',
      value: 'https://example.com',
      source: 'user',
      description: 'URL or path to the AI project guide source',
    });

    const result = await client.callTool({
      name: 'config_get',
      arguments: { key: 'guide.source' },
    });

    expect(result.isError).toBeFalsy();
    const content = result.content as { type: string; text: string }[];
    const parsed = JSON.parse(content[0].text);
    expect(parsed.source).toBe('user');
    expect(parsed.value).toBe('https://example.com');
  });

  it('returns isError for unknown key', async () => {
    mockGet.mockRejectedValue(new Error('Unknown config key: "bogus_key"'));

    const result = await client.callTool({
      name: 'config_get',
      arguments: { key: 'bogus_key' },
    });

    expect(result.isError).toBe(true);
    const content = result.content as { type: string; text: string }[];
    expect(content[0].text).toContain('Unknown config key');
  });
});

describe('config_set', () => {
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

  it('sets user-level value, subsequent config_get returns it', async () => {
    mockSet.mockResolvedValue(undefined);
    mockGet.mockResolvedValue({
      key: 'guide.source',
      value: 'https://new.com',
      source: 'user',
      description: 'URL or path to the AI project guide source',
    });

    const result = await client.callTool({
      name: 'config_set',
      arguments: { key: 'guide.source', value: 'https://new.com', scope: 'user' },
    });

    expect(result.isError).toBeFalsy();
    const content = result.content as { type: string; text: string }[];
    const parsed = JSON.parse(content[0].text);
    expect(parsed.success).toBe(true);
    expect(parsed.value).toBe('https://new.com');
    expect(mockSet).toHaveBeenCalledWith('guide.source', 'https://new.com', 'user');
  });

  it('sets project-level value with projectPath', async () => {
    mockSet.mockResolvedValue(undefined);
    mockGet.mockResolvedValue({
      key: 'guide.source',
      value: 'proj-val',
      source: 'project',
      description: 'URL or path to the AI project guide source',
    });

    const result = await client.callTool({
      name: 'config_set',
      arguments: {
        key: 'guide.source',
        value: 'proj-val',
        scope: 'project',
        projectPath: '/home/user/projects/test',
      },
    });

    expect(result.isError).toBeFalsy();
    const content = result.content as { type: string; text: string }[];
    const parsed = JSON.parse(content[0].text);
    expect(parsed.source).toBe('project');
  });

  it('returns isError for invalid type', async () => {
    mockSet.mockRejectedValue(
      new Error('Config key "guide.auto_update" expects type "boolean", got "string"')
    );

    const result = await client.callTool({
      name: 'config_set',
      arguments: { key: 'guide.auto_update', value: 'yes', scope: 'user' },
    });

    expect(result.isError).toBe(true);
    const content = result.content as { type: string; text: string }[];
    expect(content[0].text).toContain('expects type');
  });

  it('returns isError for invalid enum value', async () => {
    mockSet.mockRejectedValue(
      new Error('Config key "guide.git_strategy" must be one of ["submodule", "clone", "manual"]')
    );

    const result = await client.callTool({
      name: 'config_set',
      arguments: { key: 'guide.git_strategy', value: 'invalid', scope: 'user' },
    });

    expect(result.isError).toBe(true);
    const content = result.content as { type: string; text: string }[];
    expect(content[0].text).toContain('must be one of');
  });
});

describe('config_get without key (list all)', () => {
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

  it('returns all keys with values and sources when no key provided', async () => {
    mockList.mockResolvedValue([
      {
        key: 'guide.auto_update',
        value: false,
        source: 'default',
        description: 'Auto update guide',
        type: 'boolean',
        defaultValue: false,
      },
      {
        key: 'guide.source',
        value: 'https://example.com',
        source: 'user',
        description: 'Guide source',
        type: 'string',
        defaultValue: '',
      },
      {
        key: 'guide.git_strategy',
        value: 'submodule',
        source: 'default',
        description: 'Git strategy',
        type: 'string',
        defaultValue: 'submodule',
      },
    ]);

    const result = await client.callTool({
      name: 'config_get',
      arguments: {},
    });

    expect(result.isError).toBeFalsy();
    const content = result.content as { type: string; text: string }[];
    const parsed = JSON.parse(content[0].text);
    expect(parsed.entries).toHaveLength(3);
    expect(parsed.configPaths).toBeDefined();
    expect(parsed.configPaths.user).toContain('config.toml');
    const guideSource = parsed.entries.find((e: { key: string }) => e.key === 'guide.source');
    expect(guideSource.source).toBe('user');
    expect(guideSource.value).toBe('https://example.com');
  });
});
