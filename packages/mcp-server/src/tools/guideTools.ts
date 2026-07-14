import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  FileProjectStore,
  GuideManager,
  ConfigManager,
  BranchGuardBlockedError,
  BranchGuardWarnError,
} from '@context-forge/core/node';
import type { ProjectData } from '@context-forge/core';
import { GuideDetector } from '@context-forge/core/node';
import { resolveProjectId } from './resolveProjectId.js';
import { errorResult, jsonResult } from './contextTools.js';

interface ResolvedProject {
  projectPath: string;
  project: ProjectData;
}

/** Resolve projectId to projectPath and project data, throwing actionable errors */
async function resolveProjectWithData(projectId?: string): Promise<ResolvedProject> {
  const resolvedId = await resolveProjectId(projectId);
  const store = new FileProjectStore();
  const project = await store.getById(resolvedId);

  if (!project) {
    throw new Error(
      `Project not found: '${resolvedId}'. Use project_list to see available projects.`
    );
  }
  if (!project.projectPath) {
    throw new Error(
      `Project '${project.name}' has no configured project path. Set a project path first.`
    );
  }
  return { projectPath: project.projectPath, project };
}

export function registerGuideTools(server: McpServer): void {
  // --- guide_status ---
  server.registerTool(
    'guide_status',
    {
      title: 'Guide Status',
      description:
        'Check the installation status of the AI project guide for a project. ' +
        'Returns whether the guide is installed, what method was used (submodule/clone/manual), ' +
        'current version, latest available version, and whether an update is available.',
      inputSchema: {
        projectId: z
          .string()
          .optional()
          .describe('Project ID or name. Omit to resolve from CWD.'),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ projectId }) => {
      try {
        const { projectPath, project } = await resolveProjectWithData(projectId);
        const cm = new ConfigManager(projectPath);
        const manager = new GuideManager(projectPath, cm);
        const info = await manager.status();

        // Report per-worktree sync status when worktrees exist and method is submodule
        let worktreeSync: { name: string; path: string; status: string }[] | undefined;
        if (info.method === 'submodule' && project.worktrees?.length) {
          const detector = new GuideDetector();
          worktreeSync = [];
          for (const wt of project.worktrees) {
            if (wt.worktreePath) {
              const syncStatus = await detector.checkSyncStatus(wt.worktreePath);
              worktreeSync.push({ name: wt.name, path: wt.worktreePath, status: syncStatus });
            }
          }
        }

        return jsonResult(worktreeSync ? { ...info, worktreeSync } : info);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        return errorResult(message);
      }
    },
  );

  // --- guide_install ---
  server.registerTool(
    'guide_install',
    {
      title: 'Install Guide',
      description:
        'Install the AI project guide into a project directory. ' +
        'Supports three strategies: "submodule" (default, requires git repo), ' +
        '"clone" (standalone git clone), or "manual" (tarball download, no git needed). ' +
        'Error if the guide is already installed — use guide_update instead.',
      inputSchema: {
        projectId: z
          .string()
          .optional()
          .describe('Project ID or name. Omit to resolve from CWD.'),
        strategy: z
          .enum(['submodule', 'clone', 'manual'])
          .optional()
          .describe('Installation strategy. Overrides guide.git_strategy config for this call.'),
        source: z
          .string()
          .optional()
          .describe('Source repository URL. Overrides guide.source config for this call.'),
      },
      annotations: { readOnlyHint: false, openWorldHint: true },
    },
    async ({ projectId, strategy, source }) => {
      try {
        const { projectPath } = await resolveProjectWithData(projectId);
        const cm = new ConfigManager(projectPath);
        const manager = new GuideManager(projectPath, cm);
        const result = await manager.install(strategy, source);
        return jsonResult(result);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        return errorResult(message);
      }
    },
  );

  // --- guide_update ---
  server.registerTool(
    'guide_update',
    {
      title: 'Update Guide',
      description:
        'Update an existing AI project guide installation to the latest version. ' +
        'Uses the same strategy that was used for installation. ' +
        'Error if the guide is not installed — use guide_install first. ' +
        'Updates may require branch confirmation: if the current branch is not the configured ' +
        'trunk/integration branch, this tool returns an error asking you to retry with ' +
        'confirm: true. That response is not a transient failure — it is the expected first ' +
        'step of a two-call confirmation flow (there is no interactive prompt in this context).',
      inputSchema: {
        projectId: z
          .string()
          .optional()
          .describe('Project ID or name. Omit to resolve from CWD.'),
        confirm: z
          .boolean()
          .optional()
          .describe(
            'Set to true to proceed with an update from a branch that is not the configured ' +
              'trunk/integration branch. Omit on the first call; if the response asks for ' +
              'confirmation, retry the same call with confirm: true.'
          ),
      },
      annotations: { readOnlyHint: false, openWorldHint: true },
    },
    async ({ projectId, confirm }) => {
      try {
        const { projectPath, project } = await resolveProjectWithData(projectId);
        const cm = new ConfigManager(projectPath);
        const manager = new GuideManager(projectPath, cm);

        let result;
        try {
          result = await manager.update();
        } catch (error) {
          if (error instanceof BranchGuardWarnError) {
            if (confirm !== true) {
              return errorResult(`${error.message} Retry this call with confirm: true to proceed.`);
            }
            result = await manager.update({ confirmed: true });
          } else if (error instanceof BranchGuardBlockedError) {
            return errorResult(error.message);
          } else {
            throw error;
          }
        }

        // Auto-sync all worktrees with registered paths
        let syncResults: { worktreePath: string; success: boolean; error?: string }[] | undefined;
        if (project.worktrees?.length) {
          const worktreePaths = project.worktrees
            .map((wt) => wt.worktreePath)
            .filter((p): p is string => !!p);
          if (worktreePaths.length > 0) {
            syncResults = await manager.syncWorktrees(worktreePaths);
          }
        }

        return jsonResult(syncResults ? { ...result, syncResults } : result);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        return errorResult(message);
      }
    },
  );
}
