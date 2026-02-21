import * as path from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { FileProjectStore, createContextPipeline, SystemPromptParser } from '@context-forge/core/node';
import { PROMPT_FILE_RELATIVE_PATH } from '@context-forge/core';
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

/** Zod schema for optional project parameter overrides */
const contextOverridesSchema = {
  projectId: z.string().describe('Project ID. Use project_list to find IDs.'),
  slice: z.string().optional().describe('Override the current slice name'),
  taskFile: z.string().optional().describe('Override the task file name'),
  instruction: z.string().optional().describe('Override the instruction type (e.g., implementation, design, review)'),
  developmentPhase: z.string().optional().describe('Override the current development phase'),
  workType: z.enum(['start', 'continue']).optional().describe('Override whether starting or continuing work'),
  additionalInstructions: z.string().optional().describe('Additional instructions to append to the generated context'),
};

// --- Tool registration ---

export function registerContextTools(server: McpServer): void {
  // --- context_build ---
  server.registerTool(
    'context_build',
    {
      title: 'Build Context',
      description:
        'Build a complete context prompt for a Context Forge project. This is the primary tool for generating structured context blocks. Optionally override project parameters (slice, instruction, etc.) without modifying the stored project. Returns the assembled context ready for use.',
      inputSchema: contextOverridesSchema,
      annotations: { readOnlyHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ projectId, additionalInstructions, ...overrideFields }) => {
      try {
        // Collect defined overrides
        const overrides: Partial<ProjectData> = {};
        for (const [key, value] of Object.entries(overrideFields)) {
          if (value !== undefined) {
            (overrides as unknown as Record<string, unknown>)[key] = value;
          }
        }

        const contextString = await generateContext(
          projectId,
          Object.keys(overrides).length > 0 ? overrides : undefined,
          additionalInstructions,
        );
        return textResult(contextString);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        return errorResult(message);
      }
    },
  );

  // --- template_preview ---
  server.registerTool(
    'template_preview',
    {
      title: 'Preview Context',
      description:
        'Preview a context prompt with specified parameters without modifying the stored project or triggering any side effects. Use this to explore what context would be generated with different configurations before committing to a context_build.',
      inputSchema: contextOverridesSchema,
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    },
    async ({ projectId, additionalInstructions, ...overrideFields }) => {
      try {
        const overrides: Partial<ProjectData> = {};
        for (const [key, value] of Object.entries(overrideFields)) {
          if (value !== undefined) {
            (overrides as unknown as Record<string, unknown>)[key] = value;
          }
        }

        const contextString = await generateContext(
          projectId,
          Object.keys(overrides).length > 0 ? overrides : undefined,
          additionalInstructions,
        );
        return textResult(contextString);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        return errorResult(message);
      }
    },
  );

  // --- prompt_list ---
  server.registerTool(
    'prompt_list',
    {
      title: 'List Prompts',
      description:
        'List available prompt templates for a Context Forge project. Returns template names and metadata. Use prompt_get to retrieve the full content of a specific template.',
      inputSchema: {
        projectId: z.string().describe('Project ID. Use project_list to find IDs.'),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ projectId }) => {
      try {
        const store = new FileProjectStore();
        const project = await store.getById(projectId);

        if (!project) {
          return errorResult(
            `Project not found: '${projectId}'. Use the project_list tool to see available projects and their IDs.`,
          );
        }

        if (!project.projectPath) {
          return errorResult(
            `Project '${project.name}' has no configured project path. Set a project path before listing prompts.`,
          );
        }

        const promptFilePath = path.join(project.projectPath, PROMPT_FILE_RELATIVE_PATH);
        const parser = new SystemPromptParser(promptFilePath);
        const prompts = await parser.getAllPrompts();

        const templates = prompts.map((p) => ({
          name: p.name,
          key: p.key,
          parameterCount: p.parameters.length,
        }));

        return jsonResult({ templates, count: templates.length, promptFile: promptFilePath });
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        return errorResult(message);
      }
    },
  );

  // --- prompt_get ---
  server.registerTool(
    'prompt_get',
    {
      title: 'Get Prompt',
      description:
        'Get the full content of a specific prompt template. Returns the raw template text. Useful for inspecting what a template contains before building context with it.',
      inputSchema: {
        projectId: z.string().describe('Project ID. Use project_list to find IDs.'),
        templateName: z.string().describe('Template name or key to match. Use prompt_list to see available templates.'),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ projectId, templateName }) => {
      try {
        const store = new FileProjectStore();
        const project = await store.getById(projectId);

        if (!project) {
          return errorResult(
            `Project not found: '${projectId}'. Use the project_list tool to see available projects and their IDs.`,
          );
        }

        if (!project.projectPath) {
          return errorResult(
            `Project '${project.name}' has no configured project path. Set a project path before retrieving prompts.`,
          );
        }

        const promptFilePath = path.join(project.projectPath, PROMPT_FILE_RELATIVE_PATH);
        const parser = new SystemPromptParser(promptFilePath);
        const prompts = await parser.getAllPrompts();

        // Match by name (case-insensitive) or key (exact)
        const templateNameLower = templateName.toLowerCase();
        const match = prompts.find(
          (p) => p.name.toLowerCase() === templateNameLower || p.key === templateName,
        );

        if (!match) {
          return errorResult(
            `Template not found: '${templateName}'. Use the prompt_list tool to see available templates for this project.`,
          );
        }

        // Return metadata header followed by template content
        const header = `# ${match.name}\nKey: ${match.key}\nParameters: ${match.parameters.join(', ') || 'none'}\n\n---\n\n`;
        return textResult(header + match.content);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        return errorResult(message);
      }
    },
  );
}
