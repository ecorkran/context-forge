import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { FileProjectStore, GuideManager, ConfigManager } from '@context-forge/core/node';
import { resolveProjectId } from './resolveProjectId.js';
import { errorResult, jsonResult } from './contextTools.js';

/** Resolve projectId to projectPath, throwing actionable errors */
async function resolveProjectPath(projectId?: string): Promise<string> {
  const resolvedId = await resolveProjectId(projectId);
  const store = new FileProjectStore();
  const project = await store.getById(resolvedId);

  if (!project) {
    throw new Error(
      `Project not found: '${resolvedId}'. Use project_list to see available projects.`
    );
  }
  if (!project.projectPath) {
    throw new Error(
      `Project '${project.name}' has no configured project path. Set a project path first.`
    );
  }
  return project.projectPath;
}

export function registerGuideTools(server: McpServer): void {
  // --- guide_status ---
  server.registerTool(
    'guide_status',
    {
      title: 'Guide Status',
      description:
        'Check the installation status of the AI project guide for a project. ' +
        'Returns whether the guide is installed, what method was used (submodule/clone/manual), ' +
        'current version, latest available version, and whether an update is available.',
      inputSchema: {
        projectId: z
          .string()
          .optional()
          .describe('Project ID or name. Falls back to default_project config if omitted.'),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ projectId }) => {
      try {
        const projectPath = await resolveProjectPath(projectId);
        const cm = new ConfigManager(projectPath);
        const manager = new GuideManager(projectPath, cm);
        const info = await manager.status();
        return jsonResult(info);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        return errorResult(message);
      }
    },
  );

  // --- guide_install ---
  server.registerTool(
    'guide_install',
    {
      title: 'Install Guide',
      description:
        'Install the AI project guide into a project directory. ' +
        'Supports three strategies: "submodule" (default, requires git repo), ' +
        '"clone" (standalone git clone), or "manual" (tarball download, no git needed). ' +
        'Error if the guide is already installed — use guide_update instead.',
      inputSchema: {
        projectId: z
          .string()
          .optional()
          .describe('Project ID or name. Falls back to default_project config if omitted.'),
        strategy: z
          .enum(['submodule', 'clone', 'manual'])
          .optional()
          .describe('Installation strategy. Overrides guide.git_strategy config for this call.'),
        source: z
          .string()
          .optional()
          .describe('Source repository URL. Overrides guide.source config for this call.'),
      },
      annotations: { readOnlyHint: false, openWorldHint: true },
    },
    async ({ projectId, strategy, source }) => {
      try {
        const projectPath = await resolveProjectPath(projectId);
        const cm = new ConfigManager(projectPath);
        const manager = new GuideManager(projectPath, cm);
        const result = await manager.install(strategy, source);
        return jsonResult(result);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        return errorResult(message);
      }
    },
  );

  // --- guide_update ---
  server.registerTool(
    'guide_update',
    {
      title: 'Update Guide',
      description:
        'Update an existing AI project guide installation to the latest version. ' +
        'Uses the same strategy that was used for installation. ' +
        'Error if the guide is not installed — use guide_install first.',
      inputSchema: {
        projectId: z
          .string()
          .optional()
          .describe('Project ID or name. Falls back to default_project config if omitted.'),
      },
      annotations: { readOnlyHint: false, openWorldHint: true },
    },
    async ({ projectId }) => {
      try {
        const projectPath = await resolveProjectPath(projectId);
        const cm = new ConfigManager(projectPath);
        const manager = new GuideManager(projectPath, cm);
        const result = await manager.update();
        return jsonResult(result);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        return errorResult(message);
      }
    },
  );
}
