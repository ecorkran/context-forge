# Context Forge

Context Forge generates structured context prompts for AI-assisted coding sessions. Instead of manually assembling project state, templates, and task context every time you start a session with Claude Code, Cursor, or similar tools, Context Forge builds it from your project configuration in seconds.

> **This project is in active development.** The architecture is mid-restructure (Electron app to monorepo with MCP server). Things work, but expect rough edges. Tested on macOS and Linux only.

## The Problem

Every AI coding session benefits from structured context: what you're working on, what conventions to follow, what the current task is, where things are in your codebase. Building that context by hand is tedious and error-prone. Copy-pasting from multiple files, remembering to include the right template sections, keeping project state current — it adds up to several minutes per session, every session.

## What Context Forge Does

Context Forge takes a template-driven approach to context generation:

- **Templates and statements** define the structure of your context prompt — sections for project state, work context, instructions, conventions, monorepo configuration, etc.
- **Project configuration** captures what you're currently working on — active slice, task file, instruction mode, custom data fields.
- **The context engine** assembles these into a formatted prompt you can paste into your AI coding tool.

You configure your project once, update it as your work progresses, and generate a fresh context prompt whenever you start a new session.

### Dependency: ai-project-guide

Context Forge is currently tightly coupled to the [ai-project-guide](https://github.com/ecorkran/ai-project-guide) template system (also a work-in-progress). The prompts, statement templates, and project structure conventions that Context Forge uses come from ai-project-guide. You'll need to set it up for Context Forge to be useful:

```bash
pnpm setup-guides
```

This bootstraps the ai-project-guide templates into your project. See the [ai-project-guide repo](https://github.com/ecorkran/ai-project-guide) for details on the methodology.

## Quick Start

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
  mcp-server/     context-forge-mcp — MCP server (scaffolded, not yet functional)
```

**`@context-forge/core`** contains the context generation pipeline: template processing, statement management, prompt parsing, section building, and project path resolution. It has no Electron dependency and can be used by any Node.js consumer.

**`@context-forge/electron`** is the desktop app — React UI with Tailwind CSS and Radix UI components. Multi-project support, split-pane editor/preview, light/dark themes. This is the part that works today.

**`context-forge-mcp`** will expose the context engine via [Model Context Protocol](https://modelcontextprotocol.io/), letting Claude Code and Cursor access Context Forge directly without the desktop app. This is the primary goal of the current restructure.

## Current State

**What works:**
- Electron desktop app — multi-project management, template-driven context generation, copy-to-clipboard workflow
- Core context engine extracted to `@context-forge/core` — types, services, and orchestrators
- Full context assembly pipeline runs without Electron

**In progress:**
- Storage migration — moving from Electron-specific storage to a shared filesystem layer so both the desktop app and MCP server can access the same project data
- MCP server implementation — project tools and context generation tools

**Planned:**
- MCP server context tools — `context_build`, `template_preview`, etc.
- Electron client simplification — thin wrapper over core instead of duplicated logic
- Application packaging and distribution

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
