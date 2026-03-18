import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { FileProjectStore, createContextPipeline, SystemPromptParser, resolvePromptFilePath, WorktreeService } from '@context-forge/core/node';
import { resolveProjectId } from './resolveProjectId.js';
import type { ProjectData } from '@context-forge/core';
import { applyWorktreeOverlay } from '@context-forge/core';

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
  worktreeId?: string,
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
  let contextString = await integrator.generateContextFromProject(workingCopy, worktreeId);

  if (additionalInstructions) {
    contextString = `${contextString}\n\n${additionalInstructions}`;
  }

  return contextString;
}

/** Zod schema for optional project parameter overrides */
const contextOverridesSchema = {
  projectId: z.string().optional().describe('Project ID. Use project_list to find IDs. Omit to resolve from CWD.'),
  fileSlice: z.string().optional().describe('Override the current slice name'),
  fileTasks: z.string().optional().describe('Override the task file name'),
  instruction: z.string().optional().describe('Override the instruction type (e.g., implementation, design, review)'),
  instructionType: z.string().optional().describe('Override instruction type for profile-aware filtering (ephemeral — does not write to store). Takes precedence over instruction if both are provided.'),
  developmentPhase: z.string().optional().describe('Override the current development phase'),
  workType: z.enum(['start', 'continue']).optional().describe('Override whether starting or continuing work'),
  worktree: z.string().optional().describe('Worktree ID or name. When provided, overlays worktree fields onto the project before applying explicit overrides.'),
  additionalInstructions: z.string().optional().describe('Additional instructions to append to the generated context'),
};

/**
 * Resolve the prompt file path for prompt_list/prompt_get.
 * Requires a resolvable project with guides installed.
 */
async function resolvePromptFileForTools(projectId?: string): Promise<string> {
  const resolvedId = await resolveProjectId(projectId);
  const store = new FileProjectStore();
  const project = await store.getById(resolvedId);
  if (!project) {
    throw new Error(
      `Project not found: '${resolvedId}'. Use project_list to see available projects.`,
    );
  }
  if (!project.projectPath) {
    throw new Error(
      `Project '${project.name}' has no configured path. Set a project path with project_update before using prompt tools.`,
    );
  }
  return resolvePromptFilePath(project.projectPath);
}

// --- Tool registration ---

export function registerContextTools(server: McpServer): void {
  // --- context_build ---
  server.registerTool(
    'context_build',
    {
      title: 'Build Context',
      description:
        'Build a complete context prompt for a Context Forge project. This is the primary tool for generating structured context blocks. Optionally override project parameters (fileSlice, instruction, etc.) without modifying the stored project. Returns the assembled context ready for use.',
      inputSchema: contextOverridesSchema,
      annotations: { readOnlyHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ projectId, additionalInstructions, instructionType, worktree: worktreeIdOrName, ...overrideFields }) => {
      try {
        const resolvedId = await resolveProjectId(projectId);

        // When worktree is specified, apply overlay before explicit overrides
        let worktreeOverrides: Partial<ProjectData> | undefined;
        let resolvedWorktreeId: string | undefined;
        if (worktreeIdOrName) {
          const store = new FileProjectStore();
          const project = await store.getById(resolvedId);
          if (!project) {
            return errorResult(
              `Project not found: '${resolvedId}'. Use the project_list tool to see available projects.`,
            );
          }
          const service = new WorktreeService(store);
          let wt = await service.getWorktree(resolvedId, worktreeIdOrName);
          if (!wt) {
            wt = await service.getWorktreeByName(resolvedId, worktreeIdOrName);
          }
          if (!wt) {
            return errorResult(
              `Worktree '${worktreeIdOrName}' not found. Use worktree_list to see available worktrees.`,
            );
          }
          resolvedWorktreeId = wt.id;
          // Build overlay as overrides — generateContext will apply them
          const overlaid = applyWorktreeOverlay(project, wt.id);
          worktreeOverrides = {
            fileSlice: overlaid.fileSlice,
            fileTasks: overlaid.fileTasks,
            instruction: overlaid.instruction,
            developmentPhase: overlaid.developmentPhase,
            workType: overlaid.workType,
            fileArch: overlaid.fileArch,
            fileSlicePlan: overlaid.fileSlicePlan,
          };
        }

        // Collect defined explicit overrides (these win over worktree overlay)
        const explicitOverrides: Partial<ProjectData> = {};
        for (const [key, value] of Object.entries(overrideFields)) {
          if (value !== undefined) {
            (explicitOverrides as unknown as Record<string, unknown>)[key] = value;
          }
        }
        if (instructionType !== undefined) {
          explicitOverrides.instruction = instructionType;
        }

        // Merge: worktree overlay first, then explicit overrides win
        const mergedOverrides: Partial<ProjectData> = {
          ...worktreeOverrides,
          ...explicitOverrides,
        };

        const contextString = await generateContext(
          resolvedId,
          Object.keys(mergedOverrides).length > 0 ? mergedOverrides : undefined,
          additionalInstructions,
          resolvedWorktreeId,
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
    async ({ projectId, additionalInstructions, worktree: wtIdOrName, instructionType, ...overrideFields }) => {
      try {
        const resolvedId = await resolveProjectId(projectId);

        // Worktree overlay (same logic as context_build)
        let worktreeOverrides: Partial<ProjectData> | undefined;
        let resolvedWtId: string | undefined;
        if (wtIdOrName) {
          const store = new FileProjectStore();
          const project = await store.getById(resolvedId);
          if (project) {
            const service = new WorktreeService(store);
            let wt = await service.getWorktree(resolvedId, wtIdOrName);
            if (!wt) wt = await service.getWorktreeByName(resolvedId, wtIdOrName);
            if (wt) {
              resolvedWtId = wt.id;
              const overlaid = applyWorktreeOverlay(project, wt.id);
              worktreeOverrides = {
                fileSlice: overlaid.fileSlice,
                fileTasks: overlaid.fileTasks,
                instruction: overlaid.instruction,
                developmentPhase: overlaid.developmentPhase,
                workType: overlaid.workType,
                fileArch: overlaid.fileArch,
                fileSlicePlan: overlaid.fileSlicePlan,
              };
            }
          }
        }

        const explicitOverrides: Partial<ProjectData> = {};
        for (const [key, value] of Object.entries(overrideFields)) {
          if (value !== undefined) {
            (explicitOverrides as unknown as Record<string, unknown>)[key] = value;
          }
        }
        if (instructionType !== undefined) {
          explicitOverrides.instruction = instructionType;
        }

        const mergedOverrides: Partial<ProjectData> = { ...worktreeOverrides, ...explicitOverrides };

        const contextString = await generateContext(
          resolvedId,
          Object.keys(mergedOverrides).length > 0 ? mergedOverrides : undefined,
          additionalInstructions,
          resolvedWtId,
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
        'List available prompt templates from the project-local ai-project-guide. Requires guides to be installed (cf guide install). Returns template names and metadata. Use prompt_get to retrieve the full content of a specific template.',
      inputSchema: {
        projectId: z.string().optional().describe('Project ID. Use project_list to find IDs. Omit to resolve from CWD.'),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ projectId }) => {
      try {
        const promptFilePath = await resolvePromptFileForTools(projectId);
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
        'Get the full content of a specific prompt template from the project-local ai-project-guide. Requires guides to be installed (cf guide install). Returns the raw template text.',
      inputSchema: {
        projectId: z.string().optional().describe('Project ID. Use project_list to find IDs. Omit to resolve from CWD.'),
        templateName: z.string().describe('Template name or key to match. Use prompt_list to see available templates.'),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ projectId, templateName }) => {
      try {
        const promptFilePath = await resolvePromptFileForTools(projectId);
        const parser = new SystemPromptParser(promptFilePath);
        const prompts = await parser.getAllPrompts();

        // Match by name (case-insensitive) or key (exact)
        const templateNameLower = templateName.toLowerCase();
        const match = prompts.find(
          (p) => p.name.toLowerCase() === templateNameLower || p.key === templateName,
        );

        if (!match) {
          return errorResult(
            `Template not found: '${templateName}'. Use the prompt_list tool to see available templates.`,
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
