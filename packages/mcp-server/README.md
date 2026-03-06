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

### Project Management

| Tool | Description |
|------|-------------|
| `project_list` | List all configured projects with summary fields |
| `project_get` | Get full project details by ID (or default project) |
| `project_update` | Update project configuration (slice, instruction, phase, etc.). Setting `developmentPhase` auto-sets `instruction` unless explicitly provided. |
| `project_schema` | Returns the full project data schema including field definitions, aliases, groups, and enum values |

### Context Generation

| Tool | Description |
|------|-------------|
| `context_build` | Generate a complete context prompt from project configuration |
| `template_preview` | Preview context output without side effects |
| `prompt_list` | List available prompt templates for a project |
| `prompt_get` | Get the full content of a specific prompt template |
| `context_summarize` | Update project session state (recent events, notes) |

### Configuration

| Tool | Description |
|------|-------------|
| `config_get` | Get the current value of a config key (with source: project/user/default) |
| `config_set` | Set a config key at user or project scope |
| `config_list` | List all config keys with current values, sources, and defaults |

### Artifact Introspection

Tools that parse methodology documents and extract structured information. All return JSON; all accept `projectId` (or `filePath` for file-targeted tools) and fall back to `default_project`.

| Tool | Description |
|------|-------------|
| `project_structure` | Build full project model (foundation, initiatives, slices, tasks, future work) — equivalent to parse.py `build_model()` |
| `introspection_slice_plan` | Parse a slice plan and return entries with index, name, status, and completion counts |
| `introspection_tasks` | Parse a task file and return items with done state, total count, and inferred status |
| `introspection_frontmatter` | Extract YAML frontmatter key-value pairs from any methodology document |
| `introspection_documents` | Detect which methodology files exist for a given slice index (design, tasks, arch, plan) |
| `introspection_future_work` | Parse the `## Future Work` section from a slice plan document |

### Workflow

Tools that operate across all slice plans in a project to support planning and review.

| Tool | Description |
|------|-------------|
| `workflow_future` | Aggregate all future work items across a project, grouped by source initiative, with markdown summary. Accepts optional `status` filter (`all`/`pending`/`completed`) and `includeMarkdown` flag. |

**Tip:** Set `default_project` once and omit `projectId` from all other tool calls:

```
config_set key="default_project" value="project_1739..." scope="user"
```

For full parameter details, see the [Tool Reference](../../docs/TOOLS.md).

## Prerequisites

- **Node.js 18+**
- **ai-project-guide templates** set up in your project

Context Forge uses prompt templates and project structure conventions from [ai-project-guide](https://github.com/ecorkran/ai-project-guide). To bootstrap the templates in your project:

```bash
curl -fsSL https://raw.githubusercontent.com/ecorkran/ai-project-guide/main/scripts/bootstrap.sh | bash
```

See the [ai-project-guide repository](https://github.com/ecorkran/ai-project-guide) for details on the methodology and template system.

## Related

- [Context Forge](../../README.md) — monorepo root with desktop app and full project documentation
- [@context-forge/core](../core/README.md) — the context generation engine that powers this server
- [ai-project-guide](https://github.com/ecorkran/ai-project-guide) — the template system and project methodology

## License

MIT
