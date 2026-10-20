import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { renderOnboardRecipe } from '@context-forge/core';

export function registerAgentOnboardTool(server: McpServer): void {
  server.registerTool(
    'agent_onboard',
    {
      title: 'Onboard New Project',
      description:
        'Step-by-step instructions for setting up a new Context Forge project and guiding the user into their first phase of work. ' +
        'Returns an onboarding recipe the agent should follow. Optionally accepts a project name.',
      inputSchema: {
        projectName: z
          .string()
          .optional()
          .describe('Optional project name. If omitted, the agent should use the directory name or ask the user.'),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    ({ projectName }) => {
      let text = renderOnboardRecipe('mcp-tool');
      if (projectName) {
        text += `\n**Project name provided:** ${projectName}\n`;
      }
      return {
        content: [{ type: 'text' as const, text }],
      };
    },
  );
}
