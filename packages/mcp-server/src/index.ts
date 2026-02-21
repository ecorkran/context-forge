#!/usr/bin/env node
// MCP SDK: @modelcontextprotocol/sdk v1.26.0 (v1 monolithic package)
// Zod: v4.1.5 — imported as `z` from 'zod'

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { registerProjectTools } from './tools/projectTools.js';
import { registerContextTools } from './tools/contextTools.js';

const SERVER_NAME = 'context-forge-mcp';
const SERVER_VERSION = '0.1.0';

function log(message: string): void {
  console.error(`[${SERVER_NAME}] ${message}`);
}

async function main(): Promise<void> {
  const server = new McpServer({
    name: SERVER_NAME,
    version: SERVER_VERSION,
  });

  registerProjectTools(server);
  registerContextTools(server);

  const transport = new StdioServerTransport();
  await server.connect(transport);

  log('Server started');
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[${SERVER_NAME}] Fatal error: ${message}`);
  process.exit(1);
});
