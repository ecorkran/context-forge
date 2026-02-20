import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { FileProjectStore } from '@context-forge/core/node';
import type { ProjectData, UpdateProjectData } from '@context-forge/core';

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

  // --- project_update ---
  server.registerTool(
    'project_update',
    {
      title: 'Update Project',
      description:
        'Update configuration fields on an existing Context Forge project. Provide the project ID and any fields to change (e.g., slice, instruction, developmentPhase). Returns the full updated project. Does not delete or replace — only modifies specified fields.',
      inputSchema: {
        id: z.string().describe('Project ID to update'),
        name: z.string().optional().describe('Project display name'),
        template: z.string().optional().describe('Template name'),
        slice: z.string().optional().describe('Current slice name'),
        taskFile: z.string().optional().describe('Task file name'),
        instruction: z.string().optional().describe('Instruction type (e.g., implementation, design, review)'),
        developmentPhase: z.string().optional().describe('Current development phase'),
        workType: z.enum(['start', 'continue']).optional().describe('Whether starting or continuing work'),
        projectDate: z.string().optional().describe('Project date string'),
        isMonorepo: z.boolean().optional().describe('Whether project uses monorepo mode'),
        isMonorepoEnabled: z.boolean().optional().describe('Whether monorepo UI is enabled'),
        projectPath: z.string().optional().describe('Absolute path to project root'),
        customData: z
          .object({
            recentEvents: z.string().optional(),
            additionalNotes: z.string().optional(),
            monorepoNote: z.string().optional(),
            availableTools: z.string().optional(),
          })
          .optional()
          .describe('Custom data fields for context generation'),
      },
      annotations: { destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ id, ...fields }) => {
      try {
        // Collect defined update fields (exclude undefined values)
        const updates: UpdateProjectData = {};
        for (const [key, value] of Object.entries(fields)) {
          if (value !== undefined) {
            (updates as Record<string, unknown>)[key] = value;
          }
        }

        if (Object.keys(updates).length === 0) {
          return errorResult(
            'No update fields provided. Specify at least one field to update (e.g., slice, instruction, name).',
          );
        }

        const store = new FileProjectStore();

        // Check project exists
        const existing = await store.getById(id);
        if (!existing) {
          return errorResult(
            `Project not found: '${id}'. Use the project_list tool to see available projects and their IDs.`,
          );
        }

        await store.update(id, updates);

        // Read back updated project
        const updated = await store.getById(id);
        return jsonResult(updated);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        return errorResult(`Error: ${message}`);
      }
    },
  );
}
