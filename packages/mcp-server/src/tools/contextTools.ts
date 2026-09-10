import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { FileProjectStore, createContextPipeline, SystemPromptParser, resolvePromptFilePath, ConfigManager, GuideManager } from '@context-forge/core/node';
import { resolveProjectId } from './resolveProjectId.js';
import type { ProjectData } from '@context-forge/core';
import { resolveProject } from '@context-forge/core';

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
 * Attach guide notices to a tool result.
 *
 * An MCP client has no stderr to read, so side-channel messages travel as a
 * structured `notices` array (D4). The primary payload is untouched: callers
 * that ignore the field see exactly what they saw before. Absent when there is
 * nothing to report, so a quiet call stays byte-identical.
 */
export function withNotices<T extends object>(result: T, notices: string[]): T {
  return notices.length > 0 ? { ...result, notices } : result;
}

/**
 * Ready the guide checkout for a project before its content is read, and
 * return any notice the caller should surface.
 *
 * Mirrors the CLI's ensureGuideReady, minus the printing: MCP tools carry the
 * message in the result instead.
 */
export async function ensureGuideForProject(
  projectPath: string,
  operationPath?: string,
): Promise<string[]> {
  const cm = new ConfigManager(projectPath);
  const manager = new GuideManager(projectPath, cm, operationPath);
  const result = await manager.ensureCheckout();
  return result.action === 'none' || !result.message ? [] : [result.message];
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
): Promise<{ contextString: string; notices: string[] }> {
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

  // The guide must be readable before the pipeline reads it: a fresh clone
  // leaves the submodule uninitialized (#80).
  const notices = await ensureGuideForProject(workingCopy.projectPath!);

  const { integrator } = createContextPipeline(workingCopy.projectPath!);
  let contextString = await integrator.generateContextFromProject(workingCopy, worktreeId);

  if (additionalInstructions) {
    contextString = `${contextString}\n\n${additionalInstructions}`;
  }

  return { contextString, notices };
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
async function resolvePromptFileForTools(
  projectId?: string,
): Promise<{ promptFilePath: string; notices: string[] }> {
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
  const notices = await ensureGuideForProject(project.projectPath);
  return { promptFilePath: resolvePromptFilePath(project.projectPath), notices };
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

        // Resolve worktree overlay fields as overrides for generateContext
        let worktreeOverrides: Partial<ProjectData> | undefined;
        let resolvedWorktreeId: string | undefined;
        if (worktreeIdOrName) {
          const store = new FileProjectStore();
          const resolved = await resolveProject(store, resolvedId, worktreeIdOrName);
          if (!resolved) {
            return errorResult(
              `Project not found: '${resolvedId}'. Use the project_list tool to see available projects.`,
            );
          }
          resolvedWorktreeId = resolved.resolvedWorktree?.id;
          worktreeOverrides = {
            projectPath: resolved.projectPath,
            fileSlice: resolved.fileSlice,
            fileTasks: resolved.fileTasks,
            instruction: resolved.instruction,
            developmentPhase: resolved.developmentPhase,
            workType: resolved.workType,
            fileArch: resolved.fileArch,
            fileSlicePlan: resolved.fileSlicePlan,
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

        const { contextString, notices } = await generateContext(
          resolvedId,
          Object.keys(mergedOverrides).length > 0 ? mergedOverrides : undefined,
          additionalInstructions,
          resolvedWorktreeId,
        );
        return withNotices(textResult(contextString), notices);
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
          const resolved = await resolveProject(store, resolvedId, wtIdOrName);
          if (resolved?.resolvedWorktree) {
            resolvedWtId = resolved.resolvedWorktree.id;
            worktreeOverrides = {
              projectPath: resolved.projectPath,
              fileSlice: resolved.fileSlice,
              fileTasks: resolved.fileTasks,
              instruction: resolved.instruction,
              developmentPhase: resolved.developmentPhase,
              workType: resolved.workType,
              fileArch: resolved.fileArch,
              fileSlicePlan: resolved.fileSlicePlan,
            };
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

        const { contextString, notices } = await generateContext(
          resolvedId,
          Object.keys(mergedOverrides).length > 0 ? mergedOverrides : undefined,
          additionalInstructions,
          resolvedWtId,
        );
        return withNotices(textResult(contextString), notices);
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
        const { promptFilePath, notices } = await resolvePromptFileForTools(projectId);
        const parser = new SystemPromptParser(promptFilePath);
        const prompts = await parser.getAllPrompts();

        const templates = prompts.map((p) => ({
          name: p.name,
          key: p.key,
          parameterCount: p.parameters.length,
        }));

        return withNotices(
          jsonResult({ templates, count: templates.length, promptFile: promptFilePath }),
          notices,
        );
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
        const { promptFilePath, notices } = await resolvePromptFileForTools(projectId);
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
        return withNotices(textResult(header + match.content), notices);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        return errorResult(message);
      }
    },
  );
}
