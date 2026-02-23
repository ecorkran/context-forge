# context-forge/mcp

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
npx context-forge/mcp

# Or install globally
npm install -g context-forge/mcp
```

### Configure for Claude Code

Add the server using the Claude Code CLI:

```bash
claude mcp add --transport stdio context-forge -- npx context-forge/mcp
```

Or add it manually to your project's `.mcp.json`:

```json
{
  "mcpServers": {
    "context-forge": {
      "type": "stdio",
      "command": "npx",
      "args": ["context-forge/mcp"]
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
      "args": ["context-forge/mcp"]
    }
  }
}
```

## Available Tools

| Tool | Description |
|------|-------------|
| `project_list` | List all configured projects with summary fields |
| `project_get` | Get full project details by ID |
| `project_update` | Update project configuration (slice, instruction, phase, etc.) |
| `context_build` | Generate a complete context prompt from project configuration |
| `template_preview` | Preview context output without side effects |
| `prompt_list` | List available prompt templates for a project |
| `prompt_get` | Get the full content of a specific prompt template |
| `context_summarize` | Update project session state (recent events, notes) |

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
