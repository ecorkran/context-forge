import { describe, it, expect } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createRequire } from 'node:module';
import { registerVersionTool } from '../src/tools/versionTool.js';

const require = createRequire(import.meta.url);
const { version: PACKAGE_VERSION } = require('../package.json') as { version: string };

async function setup(name: string, version: string) {
  const server = new McpServer({ name: 'test', version: '0.0.0' });
  registerVersionTool(server, name, version);

  const client = new Client({ name: 'test-client', version: '0.0.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

  return { client };
}

describe('server_version tool', () => {
  it('returns JSON with name and version', async () => {
    const { client } = await setup('context-forge-mcp', '1.2.3');
    const result = await client.callTool({ name: 'server_version', arguments: {} });

    const text = (result.content as { type: string; text: string }[])[0].text;
    const parsed = JSON.parse(text);

    expect(parsed.name).toBe('context-forge-mcp');
    expect(parsed.version).toBe('1.2.3');
  });

  it('returned version matches package.json', async () => {
    const { client } = await setup('context-forge-mcp', PACKAGE_VERSION);
    const result = await client.callTool({ name: 'server_version', arguments: {} });

    const text = (result.content as { type: string; text: string }[])[0].text;
    const parsed = JSON.parse(text);

    expect(parsed.version).toBe(PACKAGE_VERSION);
  });
});
