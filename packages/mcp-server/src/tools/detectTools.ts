import * as path from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  DetectionError,
  REPORT_VERSION,
  detectProject,
  serializeDetectionReport,
  serializeErrorEnvelope,
  toDetectionReport,
} from '@context-forge/core/node';

type ToolResult = { content: { type: 'text'; text: string }[]; isError?: true };

function failure(error: unknown): ToolResult {
  // D5: `internal` is applied here, at the process boundary; the message carries the original error.
  const envelope =
    error instanceof DetectionError
      ? serializeErrorEnvelope(REPORT_VERSION, error.code, error.message)
      : serializeErrorEnvelope(REPORT_VERSION, 'internal', error instanceof Error ? error.message : String(error));
  return { content: [{ type: 'text', text: envelope }], isError: true };
}

export function registerDetectTools(server: McpServer): void {
  server.registerTool(
    'project_detect',
    {
      title: 'Detect Project State',
      description:
        'Report what is in a directory and which adoption outcome applies (opted-out, adoption-incomplete, already-planned, brownfield, greenfield). Judges the given directory as is and works on unregistered projects. Read-only. Failures return a JSON error envelope with a stable code.',
      inputSchema: {
        path: z.string().describe('Absolute path to the project directory. Relative paths are refused.'),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ path: projectPath }) => {
      try {
        // Never resolve a relative path: the server's working directory is not the user's project (D5).
        if (!path.isAbsolute(projectPath)) {
          throw new DetectionError('path-not-found', `path must be absolute, got "${projectPath}"`);
        }
        const detection = await detectProject(projectPath);
        return { content: [{ type: 'text' as const, text: serializeDetectionReport(toDetectionReport(detection)) }] };
      } catch (error: unknown) {
        return failure(error);
      }
    },
  );
}
