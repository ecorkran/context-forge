# @context-forge/context-forge

Meta-package that installs the full Context Forge toolchain in one step.

## Installation

```bash
npm install -g @context-forge/context-forge
```

This installs:

- **[@context-forge/cli](../cli/README.md)** — the `cf` command-line tool for project management, workflow navigation, and context generation
- **[@context-forge/mcp](../mcp-server/README.md)** — the MCP server for AI assistant integration (Claude Code, Cursor, etc.)

Both depend on [@context-forge/core](../core/README.md), which is installed automatically.

## What you get

After installing, you have:

- `cf` — the CLI (run `cf --help` to explore)
- `context-forge-mcp` — the MCP server binary

## Quick Start

```bash
# Set up a project
cd ~/repos/my-project
cf init

# Add the MCP server to Claude Code
claude mcp add --transport stdio context-forge -- npx @context-forge/mcp

# Check it works
cf status
```

See the [Context Forge README](../../README.md) for full documentation.

## License

MIT
