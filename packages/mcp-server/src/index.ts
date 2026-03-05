#!/usr/bin/env node
// MCP SDK: @modelcontextprotocol/sdk v1.26.0 (v1 monolithic package)
// Zod: v4.1.5 — imported as `z` from 'zod'

import { createRequire } from 'node:module';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { registerProjectTools } from './tools/projectTools.js';
import { registerContextTools } from './tools/contextTools.js';
import { registerStateTools } from './tools/stateTools.js';
import { registerConfigTools } from './tools/configTools.js';
import { registerIntrospectionTools } from './tools/introspectionTools.js';
import { registerWorkflowTools } from './tools/workflowTools.js';
import { registerVersionTool } from './tools/versionTool.js';
import { registerGuideTools } from './tools/guideTools.js';

const require = createRequire(import.meta.url);
const { version: SERVER_VERSION } = require('../package.json') as { version: string };
const SERVER_NAME = 'context-forge-mcp';

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
  registerStateTools(server);
  registerConfigTools(server);
  registerIntrospectionTools(server);
  registerWorkflowTools(server);
  registerGuideTools(server);
  registerVersionTool(server, SERVER_NAME, SERVER_VERSION);

  const transport = new StdioServerTransport();
  await server.connect(transport);

  log('Server started');
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[${SERVER_NAME}] Fatal error: ${message}`);
  process.exit(1);
});
