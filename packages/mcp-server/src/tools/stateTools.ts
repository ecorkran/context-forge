import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { FileProjectStore } from '@context-forge/core/node';
import { errorResult, jsonResult } from './contextTools.js';

export function registerStateTools(server: McpServer): void {
  // --- context_summarize ---
  server.registerTool(
    'context_summarize',
    {
      title: 'Summarize Context',
      description:
        "Update a project's session state summary. Persists the provided summary text as the project's recent events, " +
        'which will be included in subsequent context_build output. Use this after significant work milestones, context ' +
        "switches, or to record session progress for continuity. Analogous to Claude Code's /compact but for project-level state.",
      inputSchema: {
        projectId: z.string().describe('Project ID to update. Use project_list to find IDs.'),
        summary: z
          .string()
          .describe(
            'Summary of recent events, session progress, or current project state. ' +
              'This replaces the current recentEvents field and will appear in subsequent context_build output.',
          ),
        additionalNotes: z
          .string()
          .optional()
          .describe(
            'Optional additional notes to persist alongside the summary. ' +
              'Replaces the current additionalNotes field if provided.',
          ),
      },
      annotations: { destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ projectId, summary, additionalNotes }) => {
      try {
        // Validate non-empty summary
        if (!summary.trim()) {
          return errorResult(
            'Summary text is required. Provide a non-empty summary of recent events or session state.',
          );
        }

        const store = new FileProjectStore();

        // Check project exists
        const existing = await store.getById(projectId);
        if (!existing) {
          return errorResult(
            `Project not found: '${projectId}'. Use the project_list tool to see available projects and their IDs.`,
          );
        }

        // Merge customData: preserve existing fields, overlay summary + optional additionalNotes
        const mergedCustomData = {
          ...existing.customData,
          recentEvents: summary,
          ...(additionalNotes !== undefined && { additionalNotes }),
        };

        await store.update(projectId, { customData: mergedCustomData });

        // Read back updated project
        const updated = await store.getById(projectId);
        return jsonResult(updated);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        return errorResult(`Error: ${message}`);
      }
    },
  );
}
