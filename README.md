# Context Forge

Context Forge generates structured context prompts for AI-assisted coding sessions. Instead of manually assembling project state, templates, and task context every time you start a session with Claude Code, Cursor, or similar tools, Context Forge builds it from your project configuration in seconds.

> **This project is in active development.** The monorepo restructure is complete — the MCP server, core engine, and Electron app all work. Expect rough edges. Tested on macOS and Linux only.

## The Problem

Every AI coding session benefits from structured context: what you're working on, what conventions to follow, what the current task is, where things are in your codebase. Building that context by hand is tedious and error-prone. Copy-pasting from multiple files, remembering to include the right template sections, keeping project state current — it adds up to several minutes per session, every session.

## What Context Forge Does

Context Forge takes a template-driven approach to context generation:

- **Templates and statements** define the structure of your context prompt — sections for project state, work context, instructions, conventions, monorepo configuration, etc.
- **Project configuration** captures what you're currently working on — active slice, task file, instruction mode, custom data fields.
- **The context engine** assembles these into a formatted prompt you can paste into your AI coding tool.

You configure your project once, update it as your work progresses, and generate a fresh context prompt whenever you start a new session.

### For CLI and Agent Users

If you use Claude Code, Cursor, or another MCP-compatible tool, you can access Context Forge directly from your AI assistant — no desktop app needed. See the [MCP server package](packages/mcp-server/README.md) for installation and configuration.

### Recommended: ai-project-guide

Context Forge works out of the box with a bundled prompt system — install the MCP server and you can start generating context immediately.

For the full experience, install [ai-project-guide](https://github.com/ecorkran/ai-project-guide) into your project. The guide provides the structured development methodology that Context Forge's prompts are designed around: phase-based workflows, slice planning guides, task breakdown templates, code review rules, and IDE configuration. The generated prompts reference these guides directly, so having them available roughly doubles the value you get from the tool.

```bash
# Quick install (copies guide files into your project)
curl -fsSL https://raw.githubusercontent.com/ecorkran/ai-project-guide/main/scripts/bootstrap.sh | bash
```

See the [ai-project-guide repo](https://github.com/ecorkran/ai-project-guide) for details on the methodology.

## Quick Start

### MCP Server (for Claude Code, Cursor, etc.)

```bash
# Add to Claude Code
claude mcp add --transport stdio context-forge -- npx @context-forge/mcp

# Or run directly
npx @context-forge/mcp
```

See the [MCP server README](packages/mcp-server/README.md) for full configuration details.

### Desktop App (Electron)

```bash
git clone https://github.com/ecorkran/context-forge.git
cd context-forge
pnpm install
pnpm setup-guides   # bootstrap ai-project-guide templates
pnpm dev             # launches the Electron app with hot reload
```

Requirements: Node.js 18+, pnpm 10+.

## Architecture

Context Forge is a pnpm monorepo with three packages:

```
packages/
  core/           @context-forge/core — context engine, types, services
  electron/       @context-forge/electron — desktop app (Electron + React)
  mcp-server/     @context-forge/mcp — MCP server for Claude Code, Cursor, etc.
```

**[`@context-forge/core`](packages/core/README.md)** contains the context generation pipeline: template processing, statement management, prompt parsing, section building, and project path resolution. It has no Electron dependency and can be used by any Node.js consumer.

**`@context-forge/electron`** is the desktop app — React UI with Tailwind CSS and Radix UI components. Multi-project support, split-pane editor/preview, light/dark themes.

**[`@context-forge/mcp`](packages/mcp-server/README.md)** exposes the context engine via [Model Context Protocol](https://modelcontextprotocol.io/), letting Claude Code and Cursor access Context Forge directly without the desktop app. 8 tools for project management, context generation, template inspection, and session state tracking.

## Current State

**What works:**
- MCP server — 8 tools for project management, context generation, template access, and state tracking (56 tests)
- Electron desktop app — multi-project management, template-driven context generation, copy-to-clipboard workflow (106 tests)
- Core context engine — template processing, statement management, prompt parsing, section building (224 tests)
- Shared filesystem storage — both the MCP server and desktop app access the same project data

**Published on npm:**
- [`@context-forge/mcp`](https://www.npmjs.com/package/@context-forge/mcp) — MCP server, installable via `npx @context-forge/mcp`
- [`@context-forge/core`](https://www.npmjs.com/package/@context-forge/core) — core engine

**Planned:**
- CI/CD pipeline for automated testing and publishing
- Application packaging and distribution for the desktop app

## Tech Stack

- TypeScript (strict mode, no `any`)
- Electron 37 + React 19 + Vite (via electron-vite)
- Tailwind CSS 4 + Radix UI
- pnpm workspaces
- Vitest for testing

## Contributing

Issues and pull requests are welcome at [github.com/ecorkran/context-forge](https://github.com/ecorkran/context-forge). This is a personal project in active development — the codebase is changing frequently, and some areas are mid-refactor.

If you're interested in the ai-project-guide methodology that Context Forge supports, that's at [github.com/ecorkran/ai-project-guide](https://github.com/ecorkran/ai-project-guide).

## License

MIT
