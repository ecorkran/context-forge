import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import * as path from 'node:path';
import { FileProjectStore, ArtifactIntrospector, resolveFileByIndex, WorktreeService } from '@context-forge/core/node';
import type { ProjectData, UpdateProjectData, UpdateWorktreeInput } from '@context-forge/core';
import { getSchema } from '@context-forge/core';
import { resolveProjectId } from './resolveProjectId.js';

/** Fields that are routed to the worktree context when worktreeId is provided. */
const WORKTREE_SCOPED_FIELDS = new Set([
  'developmentPhase',
  'instruction',
  'workType',
  'fileArch',
  'fileSlicePlan',
  'fileSlice',
  'fileTasks',
]);

/** Map ProjectData field names to their WorktreeContext counterparts. */
const PROJECT_TO_WORKTREE_FIELD: Record<string, string> = {
  fileSlice: 'activeSlice',
  fileTasks: 'activeTaskFile',
  fileArch: 'archDoc',
  fileSlicePlan: 'slicePlan',
  developmentPhase: 'developmentPhase',
  instruction: 'instruction',
  workType: 'workType',
};

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

  // --- project_create ---
  server.registerTool(
    'project_create',
    {
      title: 'Create Project',
      description:
        'Create a new Context Forge project entry with sensible defaults. Returns the same shape as project_get (full ProjectData plus introspection when projectPath is provided). Does NOT install guides, commands, or configure the IDE — those are separate operations.',
      inputSchema: {
        name: z.string().describe('Project display name (required)'),
        projectPath: z.string().optional().describe('Absolute path to the project root. When omitted, the project is created without a path (can be set later via project_update).'),
        developmentPhase: z.string().optional().describe('Initial development phase. Defaults to "Phase 1: Concept".'),
      },
      annotations: { destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async ({ name, projectPath, developmentPhase }) => {
      try {
        const trimmedName = name.trim();
        if (!trimmedName) {
          return errorResult('Project name is required.');
        }

        const normalizedPath = projectPath ? path.resolve(projectPath.trim()) : undefined;

        const store = new FileProjectStore();

        if (normalizedPath) {
          const existing = await store.getAll();
          const duplicate = existing.find((p) => p.projectPath === normalizedPath);
          if (duplicate) {
            return errorResult(
              `A project is already registered at this path: '${duplicate.name}' (ID: ${duplicate.id}). Use project_get to retrieve it.`,
            );
          }
        }

        const today = new Date();
        const dateProject = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`;

        const project = await store.create({
          name: trimmedName,
          projectPath: normalizedPath,
          template: 'default',
          fileSlice: '',
          developmentPhase: developmentPhase || 'Phase 1: Concept',
          instruction: developmentPhase || 'Phase 1: Concept',
          dateProject,
        });

        if (project.projectPath) {
          try {
            const introspector = new ArtifactIntrospector();
            const introspection = await introspector.summarize(project);
            return jsonResult({ ...project, introspection });
          } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e);
            console.error(`Introspection failed for new project ${project.id}: ${msg}`);
          }
        }

        return jsonResult(project);
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
        worktreeId: z.string().optional().describe('Worktree ID or name. When provided, workflow fields (fileSlice, instruction, etc.) are routed to the worktree context instead of the project.'),
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
        fileConcept: z.string().optional().describe('Path to concept document (relative to project root)'),
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
    async ({ id, worktreeId, ...fields }) => {
      try {
        const resolvedId = await resolveProjectId(id);

        // Collect defined update fields (exclude undefined values)
        const allUpdates: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(fields)) {
          if (value !== undefined) {
            allUpdates[key] = value;
          }
        }

        if (Object.keys(allUpdates).length === 0) {
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

        // --- Worktree-aware field routing ---
        if (worktreeId) {
          const service = new WorktreeService(store);
          let wt = await service.getWorktree(resolvedId, worktreeId);
          if (!wt) {
            wt = await service.getWorktreeByName(resolvedId, worktreeId);
          }
          if (!wt) {
            return errorResult(
              `Worktree '${worktreeId}' not found. Use worktree_list to see available worktrees.`,
            );
          }

          // Split fields into worktree-scoped and project-level
          const worktreeUpdates: UpdateWorktreeInput = {};
          const projectUpdates: UpdateProjectData = {};

          for (const [key, value] of Object.entries(allUpdates)) {
            if (WORKTREE_SCOPED_FIELDS.has(key)) {
              const wtKey = PROJECT_TO_WORKTREE_FIELD[key] ?? key;
              (worktreeUpdates as Record<string, unknown>)[wtKey] = value;
            } else {
              (projectUpdates as Record<string, unknown>)[key] = value;
            }
          }

          // Auto-set instruction when developmentPhase changes on worktree
          if ('developmentPhase' in worktreeUpdates && !('instruction' in worktreeUpdates)) {
            worktreeUpdates.instruction = worktreeUpdates.developmentPhase;
          }

          // Auto-set activeTaskFile when activeSlice changes on worktree
          if ('activeSlice' in worktreeUpdates && !('activeTaskFile' in worktreeUpdates) && existing.projectPath) {
            const sliceValue = worktreeUpdates.activeSlice as string;
            const sliceIndex = /^(\d+)-/.exec(sliceValue);
            if (sliceIndex) {
              try {
                const resolved = resolveFileByIndex(existing.projectPath, 'fileTasks', sliceIndex[1]);
                (worktreeUpdates as Record<string, unknown>).activeTaskFile = resolved;
              } catch {
                const derived = sliceValue.replace(/^(\d+)-slice\./, '$1-tasks.');
                if (derived !== sliceValue) {
                  (worktreeUpdates as Record<string, unknown>).activeTaskFile = derived;
                }
              }
            }
          }

          // Apply worktree updates
          if (Object.keys(worktreeUpdates).length > 0) {
            await service.updateWorktree(resolvedId, wt.id, worktreeUpdates);
          }

          // Apply project-level updates
          if (Object.keys(projectUpdates).length > 0) {
            await store.update(resolvedId, projectUpdates);
          }

          const updated = await store.getById(resolvedId);
          return jsonResult({ ...updated, _worktreeUpdated: wt.id });
        }

        // --- Standard (non-worktree) path ---
        const updates: UpdateProjectData = allUpdates as UpdateProjectData;

        // Auto-set instruction when developmentPhase changes (unless instruction is explicitly provided)
        if ('developmentPhase' in updates && !('instruction' in updates)) {
          (updates as Record<string, unknown>).instruction = updates.developmentPhase;
        }

        // Auto-set fileTasks when fileSlice changes (unless fileTasks is explicitly provided)
        let autoSetTasks: string | null = null;
        if ('fileSlice' in updates && !('fileTasks' in updates) && existing.projectPath) {
          const sliceIndex = /^(\d+)-/.exec(updates.fileSlice!);
          if (sliceIndex) {
            try {
              autoSetTasks = resolveFileByIndex(existing.projectPath, 'fileTasks', sliceIndex[1]);
            } catch {
              // File doesn't exist yet — derive stem from slice value
              const derived = updates.fileSlice!.replace(/^(\d+)-slice\./, '$1-tasks.');
              if (derived !== updates.fileSlice) {
                autoSetTasks = derived;
              }
            }
            if (autoSetTasks !== null) {
              (updates as Record<string, unknown>).fileTasks = autoSetTasks;
            }
          }
        }

        await store.update(resolvedId, updates);

        // Read back updated project
        const updated = await store.getById(resolvedId);
        const result: Record<string, unknown> = { ...updated };
        if (autoSetTasks) {
          result._autoSet = { fileTasks: autoSetTasks };
        }
        return jsonResult(result);
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
