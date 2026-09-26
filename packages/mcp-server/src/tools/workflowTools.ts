import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  FileProjectStore,
  FutureWorkCollector,
  WorkflowNavigator,
  ArtifactIntrospector,
  ConsistencyChecker,
  ConfigManager,
  getStoragePath,
  createVersionedBackup,
} from '@context-forge/core/node';
import {
  resolveProject,
  mergeCheckResults,
  mergeFixResults,
  buildAttributedViews,
  runAttributed,
} from '@context-forge/core';
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
          .describe('Project ID. Omit to resolve from CWD.'),
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

  // --- workflow_status ---
  server.registerTool(
    'workflow_status',
    {
      title: 'Workflow Status',
      description:
        'Get the current workflow status for a project. Returns project phase, active slice status ' +
        '(needs-design, needs-tasks, in-implementation, complete), task progress, and slice plan overview. ' +
        'Response shape: { project, phase, activeSlice: { name, index, status, taskProgress? }, slicePlan?, summary }.',
      inputSchema: {
        projectId: z
          .string()
          .optional()
          .describe('Project ID. Omit to resolve from CWD.'),
        worktreeId: z
          .string()
          .optional()
          .describe('Worktree ID or name. When provided, overlays worktree fields onto the project before computing status.'),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async (args) => {
      try {
        const resolvedId = await resolveProjectId(args.projectId);
        const store = new FileProjectStore();
        const project = await resolveProject(store, resolvedId, args.worktreeId);

        if (!project) {
          return errorResult(
            `Project not found: '${resolvedId}'. Use the project_list tool to see available projects.`,
          );
        }

        const config = new ConfigManager(project.projectPath);
        const nav = new WorkflowNavigator(config);
        const status = await nav.getStatus(project);
        const result = project.resolvedWorktree
          ? { ...status, worktree: project.resolvedWorktree }
          : status;
        return jsonResult(result);
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        return errorResult(`Error: ${msg}`);
      }
    },
  );

  // --- workflow_next ---
  server.registerTool(
    'workflow_next',
    {
      title: 'Workflow Next Action',
      description:
        'Get the recommended next action for a project based on its current state. ' +
        'Returns a prioritized recommendation with rationale and optional suggested CLI command. ' +
        'Response shape: { recommendation, rationale, suggestedCommand?, slice?, phase?, summary }.',
      inputSchema: {
        projectId: z
          .string()
          .optional()
          .describe('Project ID. Omit to resolve from CWD.'),
        worktreeId: z
          .string()
          .optional()
          .describe('Worktree ID or name. When provided, overlays worktree fields onto the project before computing next action.'),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async (args) => {
      try {
        const resolvedId = await resolveProjectId(args.projectId);
        const store = new FileProjectStore();
        const project = await resolveProject(store, resolvedId, args.worktreeId);

        if (!project) {
          return errorResult(
            `Project not found: '${resolvedId}'. Use the project_list tool to see available projects.`,
          );
        }

        const config = new ConfigManager(project.projectPath);
        const nav = new WorkflowNavigator(config);
        const next = await nav.getNext(project);
        const result = project.resolvedWorktree
          ? { ...next, worktree: project.resolvedWorktree }
          : next;
        return jsonResult(result);
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        return errorResult(`Error: ${msg}`);
      }
    },
  );

  // --- workflow_check ---
  server.registerTool(
    'workflow_check',
    {
      title: 'Consistency Check',
      description:
        'Run consistency checks on a project to detect mismatches between related artifacts. ' +
        'Detects: task completion vs. slice plan checkbox, frontmatter status vs. computed state, ' +
        'missing artifact cross-references, plan checkbox vs. frontmatter status, ' +
        'duplicate slice indices, missing plan status field, plan status vs. entries, architecture status vs. plans. ' +
        'Defaults to all-slices mode; provide sliceIndex to narrow to one slice. ' +
        'With fix=true, applies non-destructive corrections to fixable findings. ' +
        'Response shape: { projectPath, findings[], totalFindings, errors, warnings, infos, summary, ' +
        'fixed?, fixLog?, fixErrors? }.',
      inputSchema: {
        projectId: z
          .string()
          .optional()
          .describe('Project ID. Omit to resolve from CWD.'),
        sliceIndex: z
          .number()
          .optional()
          .describe('Check only a specific slice by index. Omit for all-slices mode.'),
        fix: z
          .boolean()
          .optional()
          .describe('Apply non-destructive corrections to fixable findings. Default: false (or workflow.auto_fix config).'),
      },
      annotations: { readOnlyHint: false, openWorldHint: false },
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

        const introspector = new ArtifactIntrospector();
        const config = new ConfigManager(project.projectPath);
        const checker = new ConsistencyChecker(introspector, config);

        // Determine fix mode: explicit arg > config key > false
        let fixMode = args.fix ?? false;
        if (!fixMode) {
          try {
            const autoFixResult = await config.get('workflow.auto_fix');
            if (autoFixResult.value === true) {
              fixMode = true;
            }
          } catch {
            // Config read failed — default to check-only
          }
        }

        // Build project views: one per worktree overlay so all workflow fields are visible.
        // Findings are merged and deduplicated — aggregate rules (filesystem scan) run per
        // view but produce the same results, so deduplication collapses them correctly.
        // Each view stays paired with its worktree so findings can be attributed
        // before the merge; the dedup key has no worktree component (#87).
        // Shared with cf check so the count-not-presence rule cannot drift
        // between the two consumers of the same merge.
        const projectViews = buildAttributedViews(project);
        // Top-level projectPath means the invoking checkout. workflow_check
        // takes no worktree argument and `project` here is the raw stored
        // record, so the project root is that checkout. Passing it explicitly
        // stops the merge inheriting the first registered worktree's overlaid
        // path from results[0].
        const invokingPath = project.projectPath;

        let result;
        if (args.sliceIndex !== undefined) {
          // Single-slice mode
          const sliceViews = projectViews.map((pv) => ({
            ...pv,
            view: { ...pv.view, fileSlice: `${args.sliceIndex}-slice` },
          }));
          if (fixMode) {
            const fixResults = await runAttributed(sliceViews, (v) => checker.fix(v));
            result = mergeFixResults(fixResults, invokingPath);
          } else {
            const checkResults = await runAttributed(sliceViews, (v) => checker.check(v));
            result = mergeCheckResults(checkResults, invokingPath);
          }
        } else {
          // All-slices mode (no confirmation prompt in MCP)
          if (fixMode) {
            const fixResults = await runAttributed(projectViews, (v) => checker.fixAll(v));
            result = mergeFixResults(fixResults, invokingPath);
          } else {
            const checkResults = await runAttributed(projectViews, (v) => checker.checkAll(v));
            result = mergeCheckResults(checkResults, invokingPath);
          }
        }

        return jsonResult(result);
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        return errorResult(`Error: ${msg}`);
      }
    },
  );

  // --- storage_backup ---
  server.registerTool(
    'storage_backup',
    {
      title: 'Create Versioned Backup',
      description:
        'Create a versioned timestamped backup of the projects.json data file. ' +
        'Keeps the last 10 backups, automatically pruning older ones. ' +
        'Response shape: { storagePath, backedUp: string[] }.',
      inputSchema: {},
      annotations: { readOnlyHint: false, openWorldHint: false },
    },
    async () => {
      try {
        const storagePath = getStoragePath();
        const files = ['projects.json'];

        for (const file of files) {
          await createVersionedBackup(storagePath, file);
        }

        return jsonResult({ storagePath, backedUp: files });
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        return errorResult(`Error: ${msg}`);
      }
    },
  );
}
