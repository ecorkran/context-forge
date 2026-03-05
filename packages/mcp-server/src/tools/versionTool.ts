import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

export function registerVersionTool(server: McpServer, name: string, version: string): void {
  server.registerTool(
    'server_version',
    {
      title: 'Server Version',
      description: 'Returns the Context Forge MCP server name and version.',
      inputSchema: {},
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async () => ({
      content: [{ type: 'text' as const, text: JSON.stringify({ name, version }) }],
    }),
  );
}
