import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  FileProjectStore,
  ArtifactIntrospector,
  buildModel,
} from '@context-forge/core/node';
import { join } from 'node:path';
import { resolveProjectId } from './resolveProjectId.js';
import { resolveOperationContext } from './resolveOperationPath.js';

function errorResult(message: string): { content: { type: 'text'; text: string }[]; isError: true } {
  return { content: [{ type: 'text', text: message }], isError: true };
}

function jsonResult(data: unknown): { content: { type: 'text'; text: string }[] } {
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}

/**
 * Resolve an absolute file path from either:
 * - filePath (absolute, takes precedence)
 * - projectId + path (resolved via project store)
 */
async function resolveIntrospectionPath(args: {
  filePath?: string;
  projectId?: string;
  path?: string;
  worktreeId?: string;
}): Promise<string> {
  if (args.filePath) {
    return args.filePath;
  }

  if (!args.path) {
    throw new Error(
      'Either filePath (absolute) or projectId + path (relative) must be provided.',
    );
  }

  // Use worktree-aware resolution when worktreeId is provided
  if (args.worktreeId) {
    const { operationPath } = await resolveOperationContext({
      projectId: args.projectId,
      worktreeId: args.worktreeId,
    });
    return join(operationPath, args.path);
  }

  const resolvedId = await resolveProjectId(args.projectId);
  const store = new FileProjectStore();
  const project = await store.getById(resolvedId);

  if (!project) {
    throw new Error(
      `Project not found: '${resolvedId}'. Use the project_list tool to see available projects.`,
    );
  }

  if (!project.projectPath) {
    throw new Error(
      `Project '${resolvedId}' has no projectPath configured. Set it with project_update.`,
    );
  }

  return join(project.projectPath, args.path);
}

// Common input schema fragments
const filePathSchema = {
  projectId: z
    .string()
    .optional()
    .describe('Project ID. Omit to resolve from CWD.'),
  path: z
    .string()
    .optional()
    .describe('Relative path from project root to the target file.'),
  filePath: z
    .string()
    .optional()
    .describe('Absolute path to the target file. Overrides projectId + path.'),
  worktreeId: z
    .string()
    .optional()
    .describe('Worktree name or ID. Omit to use project root.'),
};

export function registerIntrospectionTools(server: McpServer): void {
  // --- introspection_slice_plan ---
  server.registerTool(
    'introspection_slice_plan',
    {
      title: 'Parse Slice Plan',
      description:
        'Parse a slice plan document and return structured data: entries with index, name, status, ' +
        'isChecked, plus totalSlices and completedSlices counts.',
      inputSchema: filePathSchema,
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async (args) => {
      try {
        const resolved = await resolveIntrospectionPath(args);
        const introspector = new ArtifactIntrospector();
        const result = await introspector.parseSlicePlan(resolved);
        // Filter by worktree index range if applicable
        if (args.worktreeId) {
          const { indexRange } = await resolveOperationContext({
            projectId: args.projectId,
            worktreeId: args.worktreeId,
          });
          if (indexRange) {
            result.entries = result.entries.filter(
              (e: { index: number }) => e.index >= indexRange[0] && e.index <= indexRange[1],
            );
            result.totalSlices = result.entries.length;
            result.completedSlices = result.entries.filter(
              (e: { isChecked: boolean }) => e.isChecked,
            ).length;
          }
        }
        return jsonResult(result);
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        return errorResult(`Error: ${msg}`);
      }
    },
  );

  // --- introspection_tasks ---
  server.registerTool(
    'introspection_tasks',
    {
      title: 'Parse Task File',
      description:
        'Parse a task file and return structured data: items with name and done status, ' +
        'plus totalTasks, completedTasks, and inferredStatus.',
      inputSchema: filePathSchema,
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async (args) => {
      try {
        const resolved = await resolveIntrospectionPath(args);
        const introspector = new ArtifactIntrospector();
        const result = await introspector.parseTaskFile(resolved);
        return jsonResult(result);
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        return errorResult(`Error: ${msg}`);
      }
    },
  );

  // --- introspection_frontmatter ---
  server.registerTool(
    'introspection_frontmatter',
    {
      title: 'Parse Frontmatter',
      description:
        'Extract YAML frontmatter from a markdown file. Returns found (boolean) and data ' +
        '(key-value pairs).',
      inputSchema: filePathSchema,
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async (args) => {
      try {
        const resolved = await resolveIntrospectionPath(args);
        const introspector = new ArtifactIntrospector();
        const result = await introspector.parseFrontmatter(resolved);
        return jsonResult(result);
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        return errorResult(`Error: ${msg}`);
      }
    },
  );

  // --- introspection_documents ---
  server.registerTool(
    'introspection_documents',
    {
      title: 'Detect Documents',
      description:
        'Detect methodology documents for a given slice index. Returns paths to sliceDesign, ' +
        'taskFile(s), architecture, and slicePlan if they exist.',
      inputSchema: {
        projectId: z
          .string()
          .optional()
          .describe('Project ID. Omit to resolve from CWD.'),
        projectPath: z
          .string()
          .optional()
          .describe('Absolute path to project root. Overrides projectId.'),
        worktreeId: z
          .string()
          .optional()
          .describe('Worktree name or ID. Omit to use project root.'),
        sliceIndex: z
          .number()
          .describe('Numeric slice index to check (e.g., 163).'),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async (args) => {
      try {
        let resolved: string;
        if (args.projectPath) {
          resolved = args.projectPath;
        } else {
          const ctx = await resolveOperationContext({
            projectId: args.projectId,
            worktreeId: args.worktreeId,
          });
          resolved = ctx.operationPath;
        }
        const introspector = new ArtifactIntrospector();
        const result = await introspector.detectDocuments(resolved, args.sliceIndex);
        return jsonResult(result);
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        return errorResult(`Error: ${msg}`);
      }
    },
  );

  // --- introspection_future_work ---
  server.registerTool(
    'introspection_future_work',
    {
      title: 'Parse Future Work',
      description:
        'Parse the Future Work section from a slice plan document. Returns items with index, ' +
        'name, and done status.',
      inputSchema: {
        ...filePathSchema,
        nextIndex: z
          .number()
          .optional()
          .describe('Starting index for auto-numbering unnumbered items.'),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async (args) => {
      try {
        const resolved = await resolveIntrospectionPath(args);
        const introspector = new ArtifactIntrospector();
        const result = await introspector.parseFutureWork(resolved, args.nextIndex);
        // Filter by worktree index range if applicable
        if (args.worktreeId) {
          const { indexRange } = await resolveOperationContext({
            projectId: args.projectId,
            worktreeId: args.worktreeId,
          });
          if (indexRange && result.items) {
            result.items = result.items.filter(
              (item: { index?: string }) => {
                if (!item.index) return true;
                const idx = parseInt(item.index, 10);
                return isNaN(idx) || (idx >= indexRange[0] && idx <= indexRange[1]);
              },
            );
          }
        }
        return jsonResult(result);
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        return errorResult(`Error: ${msg}`);
      }
    },
  );

  // --- project_structure ---
  server.registerTool(
    'project_structure',
    {
      title: 'Project Structure',
      description:
        'Build the full project model for a Context Forge project. Returns structured data ' +
        'including foundation docs, project architecture, initiatives with slices and tasks, ' +
        'future slices, quality/investigation/maintenance docs, and devlog status. ' +
        'Equivalent to parse.py build_model() output.',
      inputSchema: {
        projectId: z
          .string()
          .optional()
          .describe('Project ID. Omit to resolve from CWD.'),
        worktreeId: z
          .string()
          .optional()
          .describe('Worktree name or ID. Omit to use project root.'),
        name: z.string().optional().describe('Override project name in output.'),
        description: z.string().optional().describe('Override project description in output.'),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async (args) => {
      try {
        const { operationPath, indexRange } = await resolveOperationContext({
          projectId: args.projectId,
          worktreeId: args.worktreeId,
        });
        const result = await buildModel(operationPath, {
          name: args.name,
          description: args.description,
        });
        // Filter initiatives by index range when in a non-default worktree
        if (indexRange) {
          for (const key of Object.keys(result.initiatives)) {
            const idx = parseInt(key, 10);
            if (idx < indexRange[0] || idx > indexRange[1]) {
              delete result.initiatives[key];
            }
          }
        }
        return jsonResult(result);
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        return errorResult(`Error: ${msg}`);
      }
    },
  );
}
