import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { FileProjectStore } from '@context-forge/core/node';
import type { ProjectData } from '@context-forge/core';

/** Summary fields returned by project_list */
interface ProjectSummary {
  id: string;
  name: string;
  slice: string;
  template: string;
  instruction: string;
  isMonorepo: boolean;
  projectPath: string | undefined;
  updatedAt: string;
}

function toSummary(project: ProjectData): ProjectSummary {
  return {
    id: project.id,
    name: project.name,
    slice: project.slice,
    template: project.template,
    instruction: project.instruction,
    isMonorepo: project.isMonorepo,
    projectPath: project.projectPath,
    updatedAt: project.updatedAt,
  };
}

function errorResult(message: string): { content: { type: 'text'; text: string }[]; isError: true } {
  return { content: [{ type: 'text', text: message }], isError: true };
}

function jsonResult(data: unknown): { content: { type: 'text'; text: string }[] } {
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}

export function registerProjectTools(server: McpServer): void {
  // --- project_list ---
  server.registerTool(
    'project_list',
    {
      title: 'List Projects',
      description:
        'List all configured Context Forge projects. Returns project IDs, names, current slices, and other summary fields. Use this to discover available projects before calling project_get or project_update.',
      inputSchema: {},
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async () => {
      try {
        const store = new FileProjectStore();
        const allProjects = await store.getAll();
        const projects = allProjects.map(toSummary);
        return jsonResult({ projects, count: projects.length });
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        return errorResult(`Error: ${message}`);
      }
    },
  );

  // --- project_get ---
  server.registerTool(
    'project_get',
    {
      title: 'Get Project',
      description:
        'Get full details for a specific Context Forge project by ID. Returns all project fields including configuration, custom data, and timestamps. Use project_list first to find project IDs.',
      inputSchema: {
        id: z.string().describe('Project ID (e.g., project_1739...). Use project_list to find IDs.'),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ id }) => {
      try {
        const store = new FileProjectStore();
        const project = await store.getById(id);
        if (!project) {
          return errorResult(
            `Project not found: '${id}'. Use the project_list tool to see available projects and their IDs.`,
          );
        }
        return jsonResult(project);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        return errorResult(`Error: ${message}`);
      }
    },
  );
}
