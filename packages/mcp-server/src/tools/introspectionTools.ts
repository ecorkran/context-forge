import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  FileProjectStore,
  ArtifactIntrospector,
  buildModel,
} from '@context-forge/core/node';
import { join } from 'node:path';
import { resolveProjectId } from './resolveProjectId.js';

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
}): Promise<string> {
  if (args.filePath) {
    return args.filePath;
  }

  if (!args.path) {
    throw new Error(
      'Either filePath (absolute) or projectId + path (relative) must be provided.',
    );
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

/**
 * Resolve a project's absolute path from projectId or explicit projectPath.
 */
async function resolveProjectPath(args: {
  projectId?: string;
  projectPath?: string;
}): Promise<string> {
  if (args.projectPath) {
    return args.projectPath;
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

  return project.projectPath;
}

// Common input schema fragments
const filePathSchema = {
  projectId: z
    .string()
    .optional()
    .describe('Project ID. Omit to use default_project config.'),
  path: z
    .string()
    .optional()
    .describe('Relative path from project root to the target file.'),
  filePath: z
    .string()
    .optional()
    .describe('Absolute path to the target file. Overrides projectId + path.'),
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
          .describe('Project ID. Omit to use default_project config.'),
        projectPath: z
          .string()
          .optional()
          .describe('Absolute path to project root. Overrides projectId.'),
        sliceIndex: z
          .number()
          .describe('Numeric slice index to check (e.g., 163).'),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async (args) => {
      try {
        const resolved = await resolveProjectPath({
          projectId: args.projectId,
          projectPath: args.projectPath,
        });
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
          .describe('Project ID. Omit to use default_project config.'),
        name: z.string().optional().describe('Override project name in output.'),
        description: z.string().optional().describe('Override project description in output.'),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async (args) => {
      try {
        const projectPath = await resolveProjectPath({ projectId: args.projectId });
        const result = await buildModel(projectPath, {
          name: args.name,
          description: args.description,
        });
        return jsonResult(result);
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        return errorResult(`Error: ${msg}`);
      }
    },
  );
}
