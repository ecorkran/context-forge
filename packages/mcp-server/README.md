# @context-forge/mcp

An MCP server that generates structured context prompts for AI coding sessions. Configure your project once, then generate fresh, consistent context whenever you start a new session with Claude Code, Cursor, or any MCP-compatible tool.

## What is this?

Every productive AI coding session starts with context: what project you're working on, what slice or task is active, what conventions to follow, what happened in the last session. Context Forge assembles that context automatically from your project configuration and prompt templates.

This MCP server exposes Context Forge's context engine as a set of tools that your AI assistant can call directly. Instead of manually copying and pasting context blocks, the assistant generates them on demand — staying current as your work progresses.

## Why?

Building context by hand is tedious. Every session, you're pulling together the same pieces: project state, current task, coding conventions, template sections. It takes several minutes, it's error-prone, and it breaks your flow.

Context Forge eliminates that overhead. You configure your project once — templates, statements, project structure — and then generate a complete, structured context prompt with a single tool call. When you switch slices, change tasks, or reach a milestone, your assistant updates the project state and the next context generation reflects it automatically.

## Quick Start

### Install

```bash
# Run directly (no install needed)
npx @context-forge/mcp

# Or install globally
npm install -g @context-forge/mcp
```

### Configure for Claude Code

Add the server using the Claude Code CLI:

```bash
claude mcp add --transport stdio context-forge -- npx @context-forge/mcp
```

Or add it manually to your project's `.mcp.json`:

```json
{
  "mcpServers": {
    "context-forge": {
      "type": "stdio",
      "command": "npx",
      "args": ["@context-forge/mcp"]
    }
  }
}
```

### Configure for Cursor

Add the following to your Cursor MCP settings (`.cursor/mcp.json` in your project root):

```json
{
  "mcpServers": {
    "context-forge": {
      "command": "npx",
      "args": ["@context-forge/mcp"]
    }
  }
}
```

## Available Tools

### Agent Orientation

| Tool | Description |
|------|-------------|
| `agent_guide` | How to use Context Forge tools — call this first |
| `agent_onboard` | Step-by-step onboarding recipe for new projects |
| `agent_quickstart` | Structured capability schema for machine consumers (orchestrators, CI) |

### Project Management

| Tool | Description |
|------|-------------|
| `project_list` | List all configured projects with summary fields |
| `project_get` | Get full project details by ID (or default project) |
| `project_create` | Create a new project (name + path required) |
| `project_update` | Update project configuration. Setting `developmentPhase` auto-sets `instruction`. |
| `project_schema` | Full project data schema with field definitions, aliases, groups, and enum values |
| `project_structure` | Build full project model (foundation, initiatives, slices, tasks, future work) |

### Context Generation

| Tool | Description |
|------|-------------|
| `context_build` | Generate a complete context prompt from project configuration |
| `context_summarize` | Update project session state (recent events, notes) |
| `template_preview` | Preview context output without side effects |
| `prompt_list` | List available prompt templates for a project |
| `prompt_get` | Get the full content of a specific prompt template |

### Workflow

| Tool | Description |
|------|-------------|
| `workflow_next` | Recommended next action based on project state |
| `workflow_status` | Current phase, slice, and task progress |
| `workflow_check` | Run consistency checks on project artifacts |
| `workflow_future` | Aggregate future work items across all slice plans |

### Artifact Introspection

| Tool | Description |
|------|-------------|
| `introspection_documents` | Detect which methodology files exist for a given slice index |
| `introspection_frontmatter` | Extract YAML frontmatter from any methodology document |
| `introspection_slice_plan` | Parse a slice plan with entries, status, and completion counts |
| `introspection_tasks` | Parse a task file with done state, total count, and inferred status |
| `introspection_future_work` | Parse the Future Work section from a slice plan |

### Guides

| Tool | Description |
|------|-------------|
| `guide_status` | Check if the AI project guide is installed |
| `guide_install` | Install the methodology guide |
| `guide_update` | Update to latest guide version |

### Worktrees

| Tool | Description |
|------|-------------|
| `worktree_list` | List all registered worktree contexts |
| `worktree_get` | Get details for a specific worktree |
| `worktree_init` | Create a new worktree context with index range |
| `worktree_update` | Update worktree fields |
| `worktree_rm` | Remove a worktree context |

### Configuration

| Tool | Description |
|------|-------------|
| `config_get` | Get a config key value (omit key to list all) |
| `config_set` | Set a config value at user or project scope |

### Meta

| Tool | Description |
|------|-------------|
| `server_version` | Server name and version |
| `storage_backup` | Create a versioned backup of project data |

**Tip:** Set `default_project` once and omit `projectId` from all other tool calls:

```
config_set key="default_project" value="project_1739..." scope="user"
```

For full parameter details, see the [Tool Reference](../../docs/TOOLS.md).

## Prerequisites

- **Node.js 18+**
- **ai-project-guide templates** set up in your project

Context Forge uses prompt templates and project structure conventions from [ai-project-guide](https://github.com/ecorkran/ai-project-guide). Install via the CLI:

```bash
npm install -g @context-forge/cli
cf init              # register project
cf guides install    # install methodology templates
```

See the [ai-project-guide repository](https://github.com/ecorkran/ai-project-guide) for details on the methodology and template system.

## Related

- [Context Forge](../../README.md) — monorepo root with full project documentation
- [Agent Integration Guide](../../docs/AGENT-INTEGRATION.md) — how to integrate from AI agents, orchestrators, and CI pipelines
- [@context-forge/core](../core/README.md) — the context generation engine that powers this server
- [ai-project-guide](https://github.com/ecorkran/ai-project-guide) — the template system and project methodology

## License

MIT
