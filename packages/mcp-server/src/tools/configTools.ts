import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { ConfigManager, getUserConfigPath, getProjectConfigPath } from '@context-forge/core/node';
import { errorResult, jsonResult } from './contextTools.js';

export function registerConfigTools(server: McpServer, serverVersion?: string): void {
  // --- config_get ---
  server.registerTool(
    'config_get',
    {
      title: 'Get Config Value',
      description:
        'Get configuration. With a key, returns that key\'s value, source, and description. ' +
        'Without a key, returns all keys with current values, sources, and defaults. ' +
        'Resolution order: project config → user config → built-in default.',
      inputSchema: {
        key: z.string().optional().describe('Config key to retrieve (e.g. "default_project", "guide.source"). Omit to list all keys.'),
        projectPath: z
          .string()
          .optional()
          .describe('Absolute path to project root, to include project-level config in resolution'),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ key, projectPath }) => {
      try {
        const cm = new ConfigManager(projectPath);
        const serverInfo = serverVersion
          ? { serverVersion, hint: 'Call agent_guide for tool orientation, agent_onboard for new project setup.' }
          : undefined;
        if (key) {
          const result = await cm.get(key);
          return jsonResult({ ...result, ...(serverInfo && { serverInfo }) });
        }
        const entries = await cm.list();
        return jsonResult({
          entries,
          configPaths: {
            user: getUserConfigPath(),
            project: projectPath ? getProjectConfigPath(projectPath) : null,
          },
          ...(serverInfo && { serverInfo }),
        });
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        return errorResult(message);
      }
    },
  );

  // --- config_set ---
  server.registerTool(
    'config_set',
    {
      title: 'Set Config Value',
      description:
        'Set a configuration key to a new value at user or project scope. ' +
        'Use scope="user" for machine-wide defaults, scope="project" to override for a specific project.',
      inputSchema: {
        key: z.string().describe('Config key to set (e.g. "default_project", "guide.auto_update")'),
        value: z
          .union([z.string(), z.boolean(), z.number()])
          .describe('Value to set. Must match the key\'s expected type.'),
        scope: z
          .enum(['user', 'project'])
          .describe('Scope: "user" writes to user-level config, "project" writes to project-level config'),
        projectPath: z
          .string()
          .optional()
          .describe('Absolute path to project root. Required when scope is "project".'),
      },
      annotations: { destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ key, value, scope, projectPath }) => {
      try {
        const cm = new ConfigManager(projectPath);
        await cm.set(key, value, scope);
        const result = await cm.get(key);
        return jsonResult({ success: true, ...result });
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        return errorResult(message);
      }
    },
  );

}
