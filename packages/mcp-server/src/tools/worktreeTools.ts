import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { FileProjectStore, WorktreeService, GitWorktreeDiscovery } from '@context-forge/core/node';
import type { ProjectData, WorktreeContext } from '@context-forge/core';
import { resolveProjectId } from './resolveProjectId.js';
import { errorResult, jsonResult } from './contextTools.js';

/**
 * Resolve a worktree by ID or name (case-insensitive).
 * Returns the project and worktree, or an error result.
 */
async function resolveWorktree(
  projectId: string,
  worktreeIdOrName: string,
  store: FileProjectStore,
): Promise<
  | { project: ProjectData; worktree: WorktreeContext }
  | ReturnType<typeof errorResult>
> {
  const project = await store.getById(projectId);
  if (!project) {
    return errorResult(
      `Project not found: '${projectId}'. Use the project_list tool to see available projects.`,
    );
  }

  const service = new WorktreeService(store);

  // Try exact ID first
  let worktree = await service.getWorktree(projectId, worktreeIdOrName);
  if (!worktree) {
    // Fall back to case-insensitive name match
    worktree = await service.getWorktreeByName(projectId, worktreeIdOrName);
  }

  if (!worktree) {
    return errorResult(
      `Worktree '${worktreeIdOrName}' not found in project '${projectId}'. ` +
        'Use the worktree_list tool to see available worktrees.',
    );
  }

  return { project, worktree };
}

/** Check if a result is an error (has isError field). */
function isErrorResult(result: unknown): result is ReturnType<typeof errorResult> {
  return typeof result === 'object' && result !== null && 'isError' in result;
}

/** Parse an index range string "start-end" into a [number, number] tuple. */
function parseIndexRange(value: string): [number, number] | null {
  const match = /^(\d+)-(\d+)$/.exec(value);
  if (!match) return null;
  return [parseInt(match[1], 10), parseInt(match[2], 10)];
}

export function registerWorktreeTools(server: McpServer): void {
  // --- worktree_list ---
  server.registerTool(
    'worktree_list',
    {
      title: 'List Worktrees',
      description:
        'List all worktree contexts for a project. Returns worktree IDs, names, index ranges, and workflow state. ' +
        'Use this to discover available worktrees before calling worktree_get or worktree_update.',
      inputSchema: {
        projectId: z.string().optional().describe('Project ID. Omit to use default_project config.'),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async (args) => {
      try {
        const resolvedId = await resolveProjectId(args.projectId);
        const store = new FileProjectStore();
        const service = new WorktreeService(store);
        const worktrees = await service.listWorktrees(resolvedId);

        // Validate worktree paths if project has a projectPath
        const project = await store.getById(resolvedId);
        let pathStatuses;
        if (project?.projectPath && worktrees.length > 0) {
          try {
            const gitWorktrees = await new GitWorktreeDiscovery().listWorktrees(project.projectPath);
            pathStatuses = await service.validateWorktreePaths(resolvedId, gitWorktrees);
          } catch {
            // Git discovery failure — omit pathStatuses
          }
        }

        return jsonResult({ worktrees, count: worktrees.length, ...(pathStatuses ? { pathStatuses } : {}) });
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        return errorResult(`Error: ${msg}`);
      }
    },
  );

  // --- worktree_get ---
  server.registerTool(
    'worktree_get',
    {
      title: 'Get Worktree',
      description:
        'Get full details for a specific worktree context by ID or name. ' +
        'Returns all worktree fields including index range, workflow state, and paths.',
      inputSchema: {
        projectId: z.string().optional().describe('Project ID. Omit to use default_project config.'),
        worktree: z.string().describe('Worktree ID or name to look up.'),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async (args) => {
      try {
        const resolvedId = await resolveProjectId(args.projectId);
        const store = new FileProjectStore();
        const result = await resolveWorktree(resolvedId, args.worktree, store);
        if (isErrorResult(result)) return result;
        return jsonResult(result.worktree);
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        return errorResult(`Error: ${msg}`);
      }
    },
  );

  // --- worktree_init ---
  server.registerTool(
    'worktree_init',
    {
      title: 'Initialize Worktree',
      description:
        'Create a new worktree context for a project. The first worktree triggers forward migration, ' +
        'moving existing workflow fields into a "Default" worktree. Returns the created worktree, ' +
        'whether migration occurred, and any index range overlaps.',
      inputSchema: {
        projectId: z.string().optional().describe('Project ID. Omit to use default_project config.'),
        name: z.string().describe('Display name for the worktree context.'),
        indexRange: z.string().describe('Slice index range as "start-end" (e.g., "100-199").'),
        worktreePath: z.string().optional().describe('Absolute path to the git worktree directory.'),
        archDoc: z.string().optional().describe('Architecture document reference.'),
        slicePlan: z.string().optional().describe('Slice plan document reference.'),
        developmentPhase: z.string().optional().describe('Initial development phase.'),
      },
      annotations: { destructiveHint: false, idempotentHint: false },
    },
    async (args) => {
      try {
        const range = parseIndexRange(args.indexRange);
        if (!range) {
          return errorResult(
            `Invalid indexRange format: '${args.indexRange}'. Expected "start-end" (e.g., "100-199").`,
          );
        }

        const resolvedId = await resolveProjectId(args.projectId);
        const store = new FileProjectStore();
        const service = new WorktreeService(store);

        const result = await service.addWorktree(resolvedId, {
          name: args.name,
          indexRange: range,
          worktreePath: args.worktreePath,
          archDoc: args.archDoc,
          slicePlan: args.slicePlan,
        });

        // Set developmentPhase via update if provided
        if (args.developmentPhase) {
          await service.updateWorktree(resolvedId, result.worktree.id, {
            developmentPhase: args.developmentPhase,
          });
          result.worktree.developmentPhase = args.developmentPhase;
        }

        return jsonResult(result);
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        return errorResult(`Error: ${msg}`);
      }
    },
  );

  // --- worktree_update ---
  server.registerTool(
    'worktree_update',
    {
      title: 'Update Worktree',
      description:
        'Update fields on an existing worktree context. Provide the worktree ID or name and any fields to change. ' +
        'Returns the full updated worktree context.',
      inputSchema: {
        projectId: z.string().optional().describe('Project ID. Omit to use default_project config.'),
        worktree: z.string().describe('Worktree ID or name to update.'),
        name: z.string().optional().describe('New display name.'),
        indexRange: z.string().optional().describe('New index range as "start-end".'),
        worktreePath: z.string().optional().describe('New worktree directory path.'),
        archDoc: z.string().optional().describe('Architecture document reference.'),
        slicePlan: z.string().optional().describe('Slice plan document reference.'),
        developmentPhase: z.string().optional().describe('Development phase.'),
        activeSlice: z.string().optional().describe('Active slice name.'),
        activeTaskFile: z.string().optional().describe('Active task file name.'),
        instruction: z.string().optional().describe('Instruction type.'),
        workType: z.enum(['start', 'continue']).optional().describe('Work type.'),
      },
      annotations: { destructiveHint: false, idempotentHint: true },
    },
    async (args) => {
      try {
        const resolvedId = await resolveProjectId(args.projectId);
        const store = new FileProjectStore();
        const resolved = await resolveWorktree(resolvedId, args.worktree, store);
        if (isErrorResult(resolved)) return resolved;

        // Parse indexRange if provided
        let indexRange: [number, number] | undefined;
        if (args.indexRange) {
          const parsed = parseIndexRange(args.indexRange);
          if (!parsed) {
            return errorResult(
              `Invalid indexRange format: '${args.indexRange}'. Expected "start-end" (e.g., "100-199").`,
            );
          }
          indexRange = parsed;
        }

        // Collect non-undefined update fields
        const updates: Record<string, unknown> = {};
        const fieldKeys = [
          'name', 'worktreePath', 'archDoc', 'slicePlan',
          'developmentPhase', 'activeSlice', 'activeTaskFile',
          'instruction', 'workType',
        ] as const;

        for (const key of fieldKeys) {
          if (args[key] !== undefined) {
            updates[key] = args[key];
          }
        }
        if (indexRange) {
          updates.indexRange = indexRange;
        }

        const service = new WorktreeService(store);
        const updated = await service.updateWorktree(resolvedId, resolved.worktree.id, updates);

        // Check for overlaps when range changed
        let overlaps;
        if (indexRange) {
          overlaps = await service.findOverlaps(resolvedId, indexRange, resolved.worktree.id);
        }

        return jsonResult({ worktree: updated, ...(overlaps ? { overlaps } : {}) });
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        return errorResult(`Error: ${msg}`);
      }
    },
  );

  // --- worktree_rm ---
  server.registerTool(
    'worktree_rm',
    {
      title: 'Remove Worktree',
      description:
        'Remove a worktree context from a project. If this is the last worktree, triggers reverse migration ' +
        'restoring workflow fields to the project. Returns the removed worktree and whether migration occurred.',
      inputSchema: {
        projectId: z.string().optional().describe('Project ID. Omit to use default_project config.'),
        worktree: z.string().describe('Worktree ID or name to remove.'),
      },
      annotations: { destructiveHint: true, idempotentHint: false },
    },
    async (args) => {
      try {
        const resolvedId = await resolveProjectId(args.projectId);
        const store = new FileProjectStore();
        const resolved = await resolveWorktree(resolvedId, args.worktree, store);
        if (isErrorResult(resolved)) return resolved;

        const service = new WorktreeService(store);
        const result = await service.removeWorktree(resolvedId, resolved.worktree.id);
        return jsonResult(result);
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        return errorResult(`Error: ${msg}`);
      }
    },
  );
}
