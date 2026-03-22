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
import type { ConsistencyCheckResult, ConsistencyFinding } from '@context-forge/core';
import { applyWorktreeOverlay, resolveProject } from '@context-forge/core';
import { resolveProjectId } from './resolveProjectId.js';

function errorResult(message: string): { content: { type: 'text'; text: string }[]; isError: true } {
  return { content: [{ type: 'text', text: message }], isError: true };
}

function jsonResult(data: unknown): { content: { type: 'text'; text: string }[] } {
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}

/**
 * Merge findings from multiple checkAll runs, deduplicating by rule+location+description.
 * TODO: Extract to @context-forge/core shared utility (200-slices future work item 7)
 */
function mergeCheckResults(results: ConsistencyCheckResult[]): ConsistencyCheckResult {
  if (results.length === 1) return results[0];
  const seen = new Set<string>();
  const allFindings: ConsistencyFinding[] = [];
  for (const result of results) {
    for (const finding of result.findings) {
      const key = `${finding.rule}|${finding.location}|${finding.description}`;
      if (!seen.has(key)) {
        seen.add(key);
        allFindings.push(finding);
      }
    }
  }
  const projectPath = results[0].projectPath;
  const errors = allFindings.filter((f) => f.severity === 'error').length;
  const warnings = allFindings.filter((f) => f.severity === 'warning').length;
  const infos = allFindings.filter((f) => f.severity === 'info').length;
  const total = allFindings.length;
  const parts: string[] = [];
  if (errors > 0) parts.push(`${errors} error${errors !== 1 ? 's' : ''}`);
  if (warnings > 0) parts.push(`${warnings} warning${warnings !== 1 ? 's' : ''}`);
  if (infos > 0) parts.push(`${infos} info${infos !== 1 ? 's' : ''}`);
  const summary = total === 0 ? 'No inconsistencies found' : `${total} finding${total !== 1 ? 's' : ''}: ${parts.join(', ')}`;
  return { projectPath, findings: allFindings, totalFindings: total, errors, warnings, infos, summary };
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

        const nav = new WorkflowNavigator();
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

        const nav = new WorkflowNavigator();
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
        const checker = new ConsistencyChecker(introspector);

        // Determine fix mode: explicit arg > config key > false
        let fixMode = args.fix ?? false;
        if (!fixMode) {
          try {
            const cm = new ConfigManager(project.projectPath);
            const autoFixResult = await cm.get('workflow.auto_fix');
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
        // TODO: Extract merge logic to @context-forge/core shared utility (200-slices future work item 7)
        const worktrees = project.worktrees ?? [];
        const projectViews = worktrees.length > 0
          ? worktrees.map((wt) => applyWorktreeOverlay(project, wt.id))
          : [project];

        let result;
        if (args.sliceIndex !== undefined) {
          // Single-slice mode
          const sliceViews = projectViews.map((v) => ({ ...v, fileSlice: `${args.sliceIndex}-slice` }));
          const checkResults = await Promise.all(sliceViews.map((v) =>
            fixMode ? checker.fix(v) : checker.check(v),
          ));
          result = mergeCheckResults(checkResults);
        } else {
          // All-slices mode (no confirmation prompt in MCP)
          const checkResults = await Promise.all(projectViews.map((v) =>
            fixMode ? checker.fixAll(v) : checker.checkAll(v),
          ));
          result = mergeCheckResults(checkResults);
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
