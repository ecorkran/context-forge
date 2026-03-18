import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

const AGENT_GUIDE = `# Context Forge — Agent Guide

Context Forge manages AI-assisted development projects through structured phases:
Concept → Architecture → Slice Planning → Slice Design → Task Breakdown → Implementation

Call this tool first to understand what's available and how to use it.

## Quick Start

1. **project_list** — See all registered projects. Find the one matching the user's current directory.
2. **project_get** — Get full details for a project (phase, active slice, task file, etc.).
3. **workflow_next** — Get the recommended next action with rationale and suggested command.
4. **context_build** — Generate a structured context prompt for the current project state.

## Tool Categories

### Project (start here)
- **project_list** — List all projects (use to find project by path)
- **project_get** — Full project details with introspection
- **project_create** — Create a new project (name + path required)
- **project_update** — Update project fields
- **project_schema** — Show all available project fields and valid values
- **project_structure** — Show project directory structure

### Workflow (what to do next)
- **workflow_next** — Recommended next action based on project state
- **workflow_status** — Current phase, slice, and task progress
- **workflow_check** — Run consistency checks on project artifacts
- **workflow_future** — Consolidated future work across slice plans

### Context (build prompts)
- **context_build** — Assemble a full context prompt for an AI session
- **context_summarize** — Summarize project context
- **template_preview** — Preview a prompt template with variables
- **prompt_list** — List available prompt templates
- **prompt_get** — Get a specific prompt template

### Introspection (read project artifacts)
- **introspection_documents** — Detect documents for a slice index
- **introspection_frontmatter** — Parse YAML frontmatter from a document
- **introspection_slice_plan** — Parse a slice plan file
- **introspection_tasks** — Parse task files with completion state
- **introspection_future_work** — Future work items across plans

### Guides
- **guide_status** — Check if the AI project guide is installed
- **guide_install** — Install the methodology guide
- **guide_update** — Update to latest guide version

### Worktrees (parallel work in git worktrees)
- **worktree_list**, **worktree_get**, **worktree_init**, **worktree_update**, **worktree_rm**

### Configuration
- **config_get** — Get a single config key, or omit key to list all settings (rarely needed)
- **config_set** — Set a config value at user or project scope

### Meta
- **server_version** — Server name and version
- **storage_backup** — Create a versioned backup of project data

## Common Mistakes

- Do NOT start with config_get — configuration is rarely relevant to the user's task.
- Do NOT call project_update without the user asking to change something.
- Do NOT guess project IDs — call project_list first to find the right one.
- If the user says "what's next" or "what should I do", call workflow_next.
- If the user wants to start a session, call context_build for a full context prompt.
`;

export function registerAgentGuideTool(server: McpServer): void {
  server.registerTool(
    'agent_guide',
    {
      title: 'Agent Guide',
      description:
        'How to use Context Forge tools. Call this first to understand available tools, common workflows, and what to avoid.',
      inputSchema: {},
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async () => ({
      content: [{ type: 'text' as const, text: AGENT_GUIDE }],
    }),
  );
}
