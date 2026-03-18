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
import { registerWorktreeTools } from './tools/worktreeTools.js';
import { registerVersionTool } from './tools/versionTool.js';
import { registerGuideTools } from './tools/guideTools.js';
import { registerAgentGuideTool } from './tools/agentGuideTool.js';
import { registerAgentOnboardTool } from './tools/agentOnboardTool.js';

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

  // Registration order matters — some MCP clients truncate tool lists.
  // High-priority tools first to maximize usability on limited clients.
  registerAgentGuideTool(server);       // orientation for agents
  registerAgentOnboardTool(server);     // onboarding recipe for new projects
  registerProjectTools(server, SERVER_VERSION); // core: list, get, create, update
  registerWorkflowTools(server);        // what to do next
  registerContextTools(server);         // build prompts
  registerGuideTools(server);           // install/check guides
  registerIntrospectionTools(server);   // read project artifacts
  registerWorktreeTools(server);        // parallel work
  registerConfigTools(server, SERVER_VERSION); // rarely needed
  registerStateTools(server);           // backup
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
