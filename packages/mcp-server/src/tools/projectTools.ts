import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { FileProjectStore, ArtifactIntrospector } from '@context-forge/core/node';
import type { ProjectData, UpdateProjectData } from '@context-forge/core';
import { getSchema } from '@context-forge/core';
import { resolveProjectId } from './resolveProjectId.js';

/** Summary fields returned by project_list */
interface ProjectSummary {
  id: string;
  name: string;
  fileSlice: string;
  template: string;
  instruction: string;
  projectPath: string | undefined;
  updatedAt: string;
}

function toSummary(project: ProjectData): ProjectSummary {
  return {
    id: project.id,
    name: project.name,
    fileSlice: project.fileSlice,
    template: project.template,
    instruction: project.instruction,
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
        'Get full details for a specific Context Forge project by ID. Returns all project fields including configuration, custom data, and timestamps. When the project has a projectPath, the response includes an `introspection` field with: slicePlan (totalSlices, completedSlices, summary), currentTasks (totalTasks, completedTasks, inferredStatus, summary), and artifacts (presence flags for slicePlan, HLD, arch, spec, currentSliceDesign, currentTaskFile). Use project_list first to find project IDs.',
      inputSchema: {
        id: z.string().optional().describe('Project ID (e.g., project_1739...). Omit to use default_project config.'),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ id }) => {
      try {
        const resolvedId = await resolveProjectId(id);
        const store = new FileProjectStore();
        const project = await store.getById(resolvedId);
        if (!project) {
          return errorResult(
            `Project not found: '${resolvedId}'. Use the project_list tool to see available projects and their IDs.`,
          );
        }

        // Enrich with introspection when projectPath is available
        if (project.projectPath) {
          try {
            const introspector = new ArtifactIntrospector();
            const introspection = await introspector.summarize(project);
            return jsonResult({ ...project, introspection });
          } catch (e: unknown) {
            // Graceful degradation — return project without introspection
            const msg = e instanceof Error ? e.message : String(e);
            console.error(`Introspection failed for project ${resolvedId}: ${msg}`);
          }
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
        'Update configuration fields on an existing Context Forge project. Provide the project ID and any fields to change (e.g., fileSlice, instruction, developmentPhase). Returns the full updated project. Does not delete or replace — only modifies specified fields.',
      inputSchema: {
        id: z.string().optional().describe('Project ID to update. Omit to use default_project config.'),
        name: z.string().optional().describe('Project display name'),
        template: z.string().optional().describe('Template name'),
        fileSlice: z.string().optional().describe('Current slice name'),
        fileTasks: z.string().optional().describe('Task file name'),
        instruction: z.string().optional().describe('Instruction type (e.g., implementation, design, review)'),
        developmentPhase: z.string().optional().describe('Current development phase'),
        workType: z.enum(['start', 'continue']).optional().describe('Whether starting or continuing work'),
        dateProject: z.string().optional().describe('Project date string'),
        projectPath: z.string().optional().describe('Absolute path to project root'),
        fileHLD: z.string().optional().describe('Path to HLD document (relative to project root)'),
        fileArch: z.string().optional().describe('Path to architecture document (relative to project root)'),
        fileSlicePlan: z.string().optional().describe('Path to slice plan (relative to project root)'),
        fileSpec: z.string().optional().describe('Path to project spec (relative to project root)'),
        customData: z
          .object({
            recentEvents: z.string().optional(),
            additionalNotes: z.string().optional(),
            availableTools: z.string().optional(),
          })
          .optional()
          .describe('Custom data fields for context generation'),
      },
      annotations: { destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ id, ...fields }) => {
      try {
        const resolvedId = await resolveProjectId(id);

        // Collect defined update fields (exclude undefined values)
        const updates: UpdateProjectData = {};
        for (const [key, value] of Object.entries(fields)) {
          if (value !== undefined) {
            (updates as Record<string, unknown>)[key] = value;
          }
        }

        if (Object.keys(updates).length === 0) {
          return errorResult(
            'No update fields provided. Specify at least one field to update (e.g., fileSlice, instruction, name).',
          );
        }

        const store = new FileProjectStore();

        // Check project exists
        const existing = await store.getById(resolvedId);
        if (!existing) {
          return errorResult(
            `Project not found: '${resolvedId}'. Use the project_list tool to see available projects and their IDs.`,
          );
        }

        // Auto-set instruction when developmentPhase changes (unless instruction is explicitly provided)
        if ('developmentPhase' in updates && !('instruction' in updates)) {
          (updates as Record<string, unknown>).instruction = updates.developmentPhase;
        }

        await store.update(resolvedId, updates);

        // Read back updated project
        const updated = await store.getById(resolvedId);
        return jsonResult(updated);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        return errorResult(`Error: ${message}`);
      }
    },
  );

  // --- project_schema ---
  server.registerTool(
    'project_schema',
    {
      title: 'Project Schema',
      description:
        'Returns the full project data schema including field definitions, aliases, groups, and enum values. Use this to discover available fields for project_update, understand field types, and find short aliases for field names.',
      inputSchema: {},
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async () => {
      return jsonResult(getSchema());
    },
  );
}
