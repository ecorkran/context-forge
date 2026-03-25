import { describe, it, expect } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { registerAgentQuickstartTool } from '../src/tools/agentQuickstartTool.js';

async function setup(version: string) {
  const server = new McpServer({ name: 'test', version: '0.0.0' });
  registerAgentQuickstartTool(server, version);

  const client = new Client({ name: 'test-client', version: '0.0.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

  return { client };
}

function parseResult(result: { content: unknown }): Record<string, unknown> {
  const text = (result.content as { type: string; text: string }[])[0].text;
  return JSON.parse(text);
}

describe('agent_quickstart tool', () => {
  it('returns valid JSON with expected top-level keys', async () => {
    const { client } = await setup('1.0.0');
    const result = await client.callTool({ name: 'agent_quickstart', arguments: {} });
    const parsed = parseResult(result);

    expect(parsed).toHaveProperty('server');
    expect(parsed).toHaveProperty('version');
    expect(parsed).toHaveProperty('capabilities');
    expect(parsed).toHaveProperty('quickStart');
    expect(parsed).toHaveProperty('cliEquivalents');
  });

  it('version matches provided value', async () => {
    const { client } = await setup('2.3.4');
    const result = await client.callTool({ name: 'agent_quickstart', arguments: {} });
    const parsed = parseResult(result);

    expect(parsed.version).toBe('2.3.4');
    expect(parsed.server).toBe('@context-forge/mcp');
  });

  it('capabilities contain expected groups', async () => {
    const { client } = await setup('1.0.0');
    const result = await client.callTool({ name: 'agent_quickstart', arguments: {} });
    const parsed = parseResult(result);
    const caps = parsed.capabilities as Record<string, unknown>;

    expect(caps).toHaveProperty('projectManagement');
    expect(caps).toHaveProperty('contextGeneration');
    expect(caps).toHaveProperty('workflowGuidance');
    expect(caps).toHaveProperty('introspection');
    expect(caps).toHaveProperty('configuration');
    expect(caps).toHaveProperty('guides');
    expect(caps).toHaveProperty('worktrees');
  });

  it('each capability group has description and tools array', async () => {
    const { client } = await setup('1.0.0');
    const result = await client.callTool({ name: 'agent_quickstart', arguments: {} });
    const parsed = parseResult(result);
    const caps = parsed.capabilities as Record<string, { description: string; tools: string[] }>;

    for (const [, group] of Object.entries(caps)) {
      expect(typeof group.description).toBe('string');
      expect(Array.isArray(group.tools)).toBe(true);
      expect(group.tools.length).toBeGreaterThan(0);
    }
  });

  it('quickStart is a non-empty array of strings', async () => {
    const { client } = await setup('1.0.0');
    const result = await client.callTool({ name: 'agent_quickstart', arguments: {} });
    const parsed = parseResult(result);
    const qs = parsed.quickStart as string[];

    expect(Array.isArray(qs)).toBe(true);
    expect(qs.length).toBeGreaterThan(0);
    for (const step of qs) {
      expect(typeof step).toBe('string');
    }
  });

  it('cliEquivalents maps known tool names', async () => {
    const { client } = await setup('1.0.0');
    const result = await client.callTool({ name: 'agent_quickstart', arguments: {} });
    const parsed = parseResult(result);
    const equiv = parsed.cliEquivalents as Record<string, string>;

    expect(equiv).toHaveProperty('project_list');
    expect(equiv).toHaveProperty('context_build');
    expect(typeof equiv.project_list).toBe('string');
  });
});
