import { describe, it, expect } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { renderOnboardRecipe } from '@context-forge/core';
import { registerAgentOnboardTool } from '../src/tools/agentOnboardTool.js';

async function callOnboard(args: { projectName?: string }): Promise<string> {
  const server = new McpServer({ name: 'test', version: '0.0.0' });
  registerAgentOnboardTool(server);

  const client = new Client({ name: 'test-client', version: '0.0.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

  const result = await client.callTool({ name: 'agent_onboard', arguments: args });
  return (result.content as { type: string; text: string }[])[0].text;
}

describe('agent_onboard tool', () => {
  it('returns the rendered mcp-tool recipe without a project name', async () => {
    expect(await callOnboard({})).toBe(renderOnboardRecipe('mcp-tool'));
  });

  it('appends the project-name line when projectName is given', async () => {
    const text = await callOnboard({ projectName: 'demo' });
    expect(text).toBe(`${renderOnboardRecipe('mcp-tool')}\n**Project name provided:** demo\n`);
  });
});
