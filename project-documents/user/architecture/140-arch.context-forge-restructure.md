---
layer: project
phase: 1
phaseName: concept
guideRole: primary
audience: [human, ai]
description: Concept for Context Forge v2 - extracting core logic into an MCP server with monorepo architecture
dependsOn: [002-spec.context-builder.md]
dateCreated: 20260214
dateUpdated: 20260215
status: in_progress
---

# Context Forge v2: MCP Server Architecture

## Overview

Evolve Context Forge from a standalone Electron application into a monorepo containing an MCP server (the context assembly engine) and the Electron UI as one of several possible clients. The MCP server becomes the authoritative owner of project state and context generation logic, accessible to Claude Code, Cursor, and any MCP-compatible agent — not just the desktop UI.

## User-Provided Concept

Context Forge is a working Electron desktop application that assembles structured context prompts for AI coding sessions. It fills in project variables, injects curated prompt templates, resolves file paths, and produces ready-to-use context blocks. It has saved significant development time and is becoming more capable.

However, the Electron UX consumes disproportionate development cycles wrestling with IPC, process boundary issues, and UI complexity. More importantly, the core value — context assembly — is trapped behind a GUI that must be manually operated.

The desired workflow:
- From Claude Code: `/summarize [additional-state]` to update project state, `/newcontext [additional-instructions]` to generate and inject a fresh context, `/clear` to reset.
- From AI agents: the same operations as programmatic tool calls, so agents can self-manage their own context when working autonomously.
- From the Electron UI: continue to browse projects, edit configuration, preview context — but as a client of the same engine, not the engine itself.

Key decisions already made:
- **MCP server owns project state.** It is the single source of truth for project configuration, active slice/phase, and all template data.
- **Monorepo structure.** A pnpm workspace containing `packages/core`, `packages/mcp-server`, and `packages/electron` (and potentially future clients).
- **Hybrid launch model.** The MCP server can run independently (for headless agent use) or be spawned by the Electron app on startup if not already running. Electron connects as a peer client alongside Claude Code.

## Refined Concept

### Problem Statement

Context Forge's context assembly engine is valuable but access-constrained. Currently:

1. **Only accessible via GUI.** A developer must switch to the Electron window, configure fields, and click copy. This breaks flow, especially when working in Claude Code or terminal-based workflows.
2. **Agents cannot self-serve.** When an AI agent needs to refresh its context (approaching context limits, switching slices, starting new work), it cannot invoke Context Forge. A human must do it manually.
3. **Electron overhead is high.** The lichen pattern (main/renderer process boundary) generates disproportionate maintenance cost for what is fundamentally a data transformation service. IPC debugging, preload scripts, and cross-process type management consume cycles that should go toward the core product.
4. **State is locked in the app.** Project configuration, active slice tracking, and template data live in Electron's storage, inaccessible to external tools.

### Proposed Solution

Restructure Context Forge as a monorepo with three packages:

**`packages/core`** — The context assembly engine. Pure TypeScript, no Electron dependency. Contains:
- Project state management (CRUD operations on project configurations)
- Template processing (variable substitution, conditional sections, prompt injection)
- System prompt parsing (reading and caching `prompt.ai-project.system.md` sections)
- Statement management (loading and resolving template statements)
- File/path resolution (finding task files, slice designs, guide files relative to project root)
- Context generation orchestration (assembling all pieces into final output)

This is largely an extraction and consolidation of existing services from `src/main/services/` and `src/services/context/`.

**`packages/mcp-server`** — MCP protocol wrapper around core. Exposes tools:
- `context_build` — Generate a complete context prompt from current project state, with optional overrides (additional instructions, different instruction type, etc.)
- `context_summarize` — Generate or update the project summary / recent events field. Analogous to Claude Code's `/compact` but for project-level state.
- `project_get` / `project_update` — Read and modify project state (active slice, phase, task file, recent events, etc.)
- `project_list` — List configured projects
- `prompt_list` / `prompt_get` — List available prompt templates, retrieve a specific one with variables filled
- `template_preview` — Preview what a context would look like with given parameters without committing state changes

Transport: stdio (for Claude Code integration) and optionally Streamable HTTP (for network clients like Electron). Note: SSE transport is deprecated as of MCP protocol version 2025-03-26; Streamable HTTP consolidates to a single endpoint that can optionally use SSE for streaming.

**`packages/electron`** — The existing Electron UI, thinned to a display/configuration client. Connects to the MCP server for all data operations. Retains:
- Visual project configuration and browsing
- Template preview and editing
- Copy-to-clipboard with visual feedback
- Settings management
- The nice UI that already exists — just backed by the MCP server instead of local IPC services

### Architecture

```
┌─────────────────────────────────────────────────┐
│              packages/core                       │
│                                                  │
│  ProjectStateManager    ContextAssembler         │
│  TemplateProcessor      SystemPromptParser       │
│  StatementManager       PathResolver             │
│  ProjectStore (fs-based)                         │
└──────────────────┬──────────────────────────────┘
                   │ imports
        ┌──────────┴──────────┐
        │                     │
┌───────┴───────┐   ┌────────┴────────┐
│ packages/     │   │ packages/       │
│ mcp-server    │   │ electron        │
│               │   │                 │
│ MCP tools     │   │ React UI        │
│ stdio/HTTP    │   │ (MCP client)    │
│ transport     │   │                 │
└───┬───────┬───┘   └─────────────────┘
    │       │
Claude   Cursor/
Code     Windsurf
```

### State Storage

Project state moves from Electron's storage (electron-store / app data) to a filesystem-based store managed by `packages/core`. Location: `~/.config/context-forge/` (following XDG conventions, cross-platform via `env-paths` or similar).

Contents:
- `projects.json` — Project configurations (the current ProjectData structures)
- `settings.json` — Application settings (UI preferences, defaults)
- `cache/` — Parsed prompt caches, resolved path caches

This makes state accessible to any process — MCP server, Electron, CLI tools, tests — without inter-process coordination.

### Connection Model (Hybrid Launch)

1. **MCP server runs independently**: Started by the user, by a system service, or by Claude Code's MCP configuration. Serves any connecting client.
2. **Electron spawns if needed**: On startup, the Electron app checks if an MCP server is already running. If yes, connects. If no, spawns one as a child process (or sidecar).
3. **Graceful degradation**: If the MCP server is unreachable, Electron falls back to direct `core` usage (the packages are local in the monorepo). This means the UI never fully breaks even if the server isn't running.

### Migration Path

This is an evolution, not a rewrite. The existing services are mostly process-agnostic already (particularly in `src/main/services/`). The migration is:

1. **Create monorepo structure** — pnpm workspaces, move existing code into `packages/electron`
2. **Extract core** — Pull services out of Electron into `packages/core`. Key services to extract:
   - `SystemPromptParser` (already almost pure — just uses `fs` and `path`)
   - `StatementManager` (similar)
   - `TemplateProcessor` (pure logic, no Electron dependency)
   - `ContextTemplateEngine` / `ContextIntegrator` (orchestration, currently in renderer services)
   - `ProjectPathService` (path resolution)
   - Storage layer (replace electron-store with filesystem JSON)
3. **Build MCP server** — Thin wrapper exposing core functionality as MCP tools
4. **Wire Electron as client** — Replace direct service calls with MCP client calls (or direct core imports as fallback)

### What This Enables

**Immediate value:**
- Claude Code users (you, primarily) can manage context without leaving the terminal
- Agents can self-manage context during long autonomous sessions
- Context assembly logic becomes testable without Electron
- Development velocity increases (no IPC debugging for core features)

**Future possibilities:**
- CLI tool (`context-forge build --project myapp --slice auth`) for scripting
- VS Code extension that displays/manages context
- Multi-agent orchestration where agents share a context service
- Other developers can use the MCP server without needing the Electron app

### MCP Client Targets

In priority order:
1. **Claude Code** — Primary workflow. MCP server configured in Claude Code's MCP settings. Slash-command-style usage via tool calls.
2. **Claude Desktop** — For chat-mode work sessions. Same MCP server, different client.
3. **Cursor / Windsurf** — If they support MCP, the server works automatically. No extra integration needed.
4. **Multi-agent systems** — The character-chat and orchestration work can use context assembly as a shared service.

### Scope Boundaries

**In scope for v2:**
- Monorepo restructuring
- Core package extraction
- MCP server with primary tools (context_build, project_get/update, prompt_list)
- Electron wired as MCP client (with direct-import fallback)
- State migration to filesystem-based store

**Out of scope for v2 (future work):**
- CLI tool
- VS Code extension
- Plugin system for custom template engines
- Multi-user / networked state synchronization
- Cloud-hosted MCP server

### User Personas

**Near-term users:**

1. **MCP-only developer** — The largest addressable group. Uses Claude Code, Cursor, or another MCP-compatible IDE. Wants context assembly without a GUI. Installs the MCP server package, adds it to their MCP config, and never thinks about Electron. This is the primary adoption path and the lowest-friction onboard.

2. **Desktop app user** — Wants a visual interface for browsing projects, editing templates, and previewing assembled context. Downloads the desktop app. May or may not know the MCP server exists separately. This is you today, and a smaller audience going forward.

3. **AI agent** — An autonomous or semi-autonomous agent that calls MCP tools to manage its own context during long sessions. Gets this capability for free once the MCP server exists. No separate "install" — the agent's host (Claude Code, orchestration system) connects to the already-running MCP server.

**Future users:**

4. **Team developer** — Accesses a shared (remote) MCP server. Benefits from consistent prompt templates and shared project configurations maintained by a team lead. Same MCP protocol, different transport (Streamable HTTP instead of stdio).

5. **Team AI agents** — Same as persona 3, but operating against a shared team server.

### Distribution Model

The monorepo is the **development architecture**, not the distribution architecture. Users never interact with the monorepo directly. What they see:

| Deliverable | Registry / Channel | Install | User Perceives |
|---|---|---|---|
| `context-forge-mcp` | npm (public) | `npm i -g context-forge-mcp` or `npx` | An MCP server they add to their IDE config |
| Context Forge (desktop) | GitHub Releases / website | Download `.dmg` / `.exe` / `.AppImage` | A desktop app for visual context management |
| `@context-forge/core` | npm (public or private) | Dependency of the above two | Nothing — internal package, not user-facing |

**Key principle:** The npm package `context-forge-mcp` is the primary product for adoption. It's what gets shared in blog posts, mentioned in tool lists, and installed by the 20+ engineers target. The desktop app is a complementary offering for users who prefer a GUI — linked from the MCP package README, not the other way around.

**Naming:**
- `context-forge-mcp` — follows MCP server naming conventions, immediately signals purpose
- "Context Forge" — the desktop app name, no technical suffix needed (nobody calls it "Claude Desktop / Electron")
- `@context-forge/core` — scoped package for internal sharing between MCP server and desktop app

### Technical Considerations

**Repository structure**: The existing `context-forge` repo becomes the monorepo. No new repo needed — the repo name and the npm package names are independent. Project documents stay in one central location because they describe the product as a whole, not individual packages. Slices frequently touch multiple packages (e.g., "core extraction" affects both `packages/core` and `packages/electron`), so splitting docs per-package would create ambiguity.

```
context-forge/                        # Existing repo, evolved
├── project-documents/
│   ├── ai-project-guide/             # Git submodule (unchanged)
│   └── user/                         # One set of docs for the whole product
│       ├── architecture/             # HLD, arch components (including this v2 work)
│       ├── project-guides/           # Concept, spec, slice plan
│       ├── slices/                   # Slice designs (core extraction, MCP server, etc.)
│       ├── tasks/                    # Task breakdowns
│       ├── features/                 # Feature designs
│       └── ...
├── packages/
│   ├── core/                         # Context assembly engine (pure TS, no Electron)
│   │   ├── src/
│   │   ├── package.json              # Published as @context-forge/core
│   │   └── tsconfig.json
│   ├── mcp-server/                   # MCP protocol wrapper around core
│   │   ├── src/
│   │   ├── package.json              # Published as context-forge-mcp
│   │   └── tsconfig.json
│   └── electron/                     # Desktop UI client
│       ├── src/                      # Current src/ contents migrate here
│       ├── electron.vite.config.ts
│       ├── package.json
│       └── tsconfig.json
├── pnpm-workspace.yaml
├── package.json                      # Workspace root
├── DEVLOG.md
└── README.md
```

The first migration step moves the current `src/` into `packages/electron/src/`. Existing project documents stay exactly where they are — they gain new slices for the v2 work alongside the existing ones.

**pnpm workspaces**: No Turborepo or nx — keep it simple.

```yaml
# pnpm-workspace.yaml
packages:
  - 'packages/*'
```

Each package has its own `package.json`, `tsconfig.json`, and build configuration. `packages/core` builds to CommonJS + ESM. `packages/mcp-server` targets Node.js. `packages/electron` retains its electron-vite build.

**MCP SDK**: Use the official `@modelcontextprotocol/sdk` (v1) or `@modelcontextprotocol/server` (v2) for server implementation. The SDK handles transport (stdio, Streamable HTTP), protocol negotiation, and tool registration. Check SDK version at implementation time — v2 stable anticipated Q1 2026.

**Existing code reuse**: The services in `src/main/services/context/` and `src/services/context/` are the primary extraction targets. The main/renderer split actually created two parallel implementations (e.g., `SystemPromptParser` in main vs `SystemPromptParserIPC` in renderer). The core package unifies these — one implementation, multiple consumers.

**Testing**: Core package gets comprehensive unit tests (no Electron needed). MCP server gets integration tests (tool invocation → expected output). Electron retains component tests for the UI layer.

### Effort Assessment

- **Core extraction**: Moderate. Services exist, mostly need consolidation and dependency injection cleanup. The storage layer migration (electron-store → filesystem JSON) is the most significant change. Relative effort: 3/5.
- **MCP server**: Straightforward. Thin tool definitions wrapping core functions. The MCP SDK handles protocol complexity. Relative effort: 2/5.
- **Electron client conversion**: Moderate. Replacing direct service calls with MCP client or core imports. UI components stay unchanged. Relative effort: 3/5.
- **Monorepo setup**: Low. pnpm workspaces, TypeScript project references, build scripts. Relative effort: 1/5.

### Success Criteria

1. From Claude Code, a user can invoke `context_build` and receive a complete, correctly-assembled context prompt — identical in quality to what the Electron UI produces.
2. Project state changes made via MCP tools are reflected in the Electron UI (and vice versa).
3. The Electron app continues to function for users who prefer the visual interface.
4. Core logic has unit tests that run without any Electron dependency.
5. Development of new context features happens in `packages/core` with no IPC overhead.
