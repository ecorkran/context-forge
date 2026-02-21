import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { FileProjectStore, createContextPipeline } from '@context-forge/core/node';
import type { ProjectData } from '@context-forge/core';

// --- Shared helpers ---

export function errorResult(message: string): { content: { type: 'text'; text: string }[]; isError: true } {
  return { content: [{ type: 'text', text: message }], isError: true };
}

export function textResult(text: string): { content: { type: 'text'; text: string }[] } {
  return { content: [{ type: 'text', text }] };
}

export function jsonResult(data: unknown): { content: { type: 'text'; text: string }[] } {
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}

/**
 * Shared context generation helper used by context_build and template_preview.
 * Loads a project, applies optional overrides, generates context via core pipeline.
 */
export async function generateContext(
  projectId: string,
  overrides?: Partial<ProjectData>,
  additionalInstructions?: string,
): Promise<string> {
  const store = new FileProjectStore();
  const project = await store.getById(projectId);

  if (!project) {
    throw new Error(
      `Project not found: '${projectId}'. Use the project_list tool to see available projects and their IDs.`,
    );
  }

  if (!project.projectPath) {
    throw new Error(
      `Project '${project.name}' has no configured project path. Set a project path before generating context.`,
    );
  }

  // Create working copy with overrides applied
  const workingCopy: ProjectData = { ...project };
  if (overrides) {
    for (const [key, value] of Object.entries(overrides)) {
      if (value !== undefined) {
        (workingCopy as unknown as Record<string, unknown>)[key] = value;
      }
    }
  }

  const { integrator } = createContextPipeline(workingCopy.projectPath!);
  let contextString = await integrator.generateContextFromProject(workingCopy);

  if (additionalInstructions) {
    contextString = `${contextString}\n\n${additionalInstructions}`;
  }

  return contextString;
}

// --- Tool registration ---

export function registerContextTools(_server: McpServer): void {
  // Tools will be registered in Tasks 4, 5, 8, 9
}
