import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

function buildQuickstartSchema(version: string): object {
  return {
    server: '@context-forge/mcp',
    version,
    capabilities: {
      projectManagement: {
        description: 'Create, read, update projects with persistent state',
        tools: ['project_list', 'project_get', 'project_create', 'project_update', 'project_schema', 'project_structure'],
      },
      contextGeneration: {
        description: 'Build structured prompts from project state',
        tools: ['context_build', 'context_summarize', 'template_preview', 'prompt_list', 'prompt_get'],
      },
      workflowGuidance: {
        description: 'Phase-aware recommendations and consistency checks',
        tools: ['workflow_next', 'workflow_status', 'workflow_check', 'workflow_future'],
      },
      introspection: {
        description: 'Read project artifacts, slice plans, task state',
        tools: ['introspection_documents', 'introspection_frontmatter', 'introspection_slice_plan', 'introspection_tasks', 'introspection_future_work'],
      },
      guides: {
        description: 'Install and manage the AI project methodology guide',
        tools: ['guide_status', 'guide_install', 'guide_update'],
      },
      worktrees: {
        description: 'Parallel work in git worktrees with slice range isolation',
        tools: ['worktree_list', 'worktree_get', 'worktree_init', 'worktree_update', 'worktree_rm'],
      },
      configuration: {
        description: 'Two-tier config (user + project scope)',
        tools: ['config_get', 'config_set'],
      },
    },
    quickStart: [
      'Call project_list to find or verify the target project',
      'Call project_get with the project ID for full state',
      'Call workflow_next for the recommended action',
      'Call context_build to generate a session prompt',
    ],
    cliEquivalents: {
      project_list: 'cf list projects --json',
      project_get: 'cf get --json',
      workflow_next: 'cf next --json',
      workflow_status: 'cf status --json',
      context_build: 'cf build --json',
    },
  };
}

export function registerAgentQuickstartTool(server: McpServer, version: string): void {
  server.registerTool(
    'agent_quickstart',
    {
      title: 'Agent Quickstart',
      description:
        'Structured capability schema for machine consumers. Returns tool groupings, quickstart sequence, and CLI equivalents — designed for orchestrators and CI pipelines, not human-supervised sessions.',
      inputSchema: {},
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async () => ({
      content: [{ type: 'text' as const, text: JSON.stringify(buildQuickstartSchema(version), null, 2) }],
    }),
  );
}
