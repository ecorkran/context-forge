import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { FileProjectStore, FutureWorkCollector } from '@context-forge/core/node';
import { resolveProjectId } from './resolveProjectId.js';

function errorResult(message: string): { content: { type: 'text'; text: string }[]; isError: true } {
  return { content: [{ type: 'text', text: message }], isError: true };
}

function jsonResult(data: unknown): { content: { type: 'text'; text: string }[] } {
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}

export function registerWorkflowTools(server: McpServer): void {
  // --- workflow_future ---
  server.registerTool(
    'workflow_future',
    {
      title: 'Future Work Collector',
      description:
        'Aggregate future work items across all slice plans in a project. ' +
        'Returns a FutureWorkCollectorResult with groups (by initiative), totals, and a markdown summary. ' +
        'Two source patterns are supported: (1) inline ## Future Work sections in regular slice plans, ' +
        '(2) standalone *-slices.future.* files whose entire main body is future work. ' +
        'Response shape: { projectPath, groups[], totalItems, pendingItems, completedItems, markdown }. ' +
        'Each group: { initiativeIndex, initiativeName, sourceFile, items[], totalItems, pendingItems, completedItems }. ' +
        'Each item: { index, name, done, sourceFile, sourceInitiativeIndex, sourceInitiativeName }.',
      inputSchema: {
        projectId: z
          .string()
          .optional()
          .describe('Project ID. Omit to use default_project config.'),
        status: z
          .enum(['all', 'pending', 'completed'])
          .optional()
          .default('all')
          .describe('Filter items by completion state. Default: "all".'),
        includeMarkdown: z
          .boolean()
          .optional()
          .default(true)
          .describe('Include markdown summary field in response. Default: true.'),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async (args) => {
      try {
        const resolvedId = await resolveProjectId(args.projectId);
        const store = new FileProjectStore();
        const project = await store.getById(resolvedId);

        if (!project) {
          return errorResult(
            `Project not found: '${resolvedId}'. Use the project_list tool to see available projects.`,
          );
        }

        if (!project.projectPath) {
          return errorResult(
            `Project '${resolvedId}' has no projectPath configured. Set it with project_update.`,
          );
        }

        const collector = new FutureWorkCollector();
        const result = await collector.collect(project.projectPath, args.status ?? 'all');

        if (!args.includeMarkdown) {
          const { markdown: _md, ...rest } = result;
          return jsonResult(rest);
        }

        return jsonResult(result);
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        return errorResult(`Error: ${msg}`);
      }
    },
  );
}
