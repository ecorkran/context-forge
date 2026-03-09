# Context Forge

Context Forge manages the full lifecycle of AI-assisted development projects — from concept through architecture, slice planning, task breakdown, implementation, and integration. It maintains traceable, hierarchical project state so that every AI session starts with full awareness of where things stand and what's next.

This is one project. Two weeks of work. The structure was created and tracked by Context Forge:

> [screenshot/image: the file explorer showing 175 slices and tasks]

Every slice has a design document. Every design has a task breakdown. Every task has completion state. Every session — whether it's you or an AI agent — picks up exactly where the last one left off, because the project state is real files with real structure, not a chat history that vanished.

## What It Looks Like

### Visualizer
![Context Visualizer](assets/context-visualizer.png)

Visualizer is available separately at:  
https://github.com/ecorkran/context-visualizer

### CLI
Everything is discoverable under the `cf` command.  Start with `cf --help`.  Easily manage multiple projects.  cf knows which one based on your current directory.  `cf init` to start a new one.  Ideally it will feel similar to git.

![cf project list output](assets/cf-project-list.png)

Obtain brief status with `cf status`, detailed with `cf project get`. Use the MCP or slash-commands if you prefer.
![cf status output](assets/cf-status.png)

Your AI assistant sees this too — through MCP tools, through slash commands, through the CLI. It knows the project structure, the methodology phase, the active slice, and (*very* soon) exactly which task to work on next. No "let me catch you up." No re-reading CLAUDE.md. No guessing.

## Get Started

```bash
# Install globally
npm install -g @context-forge/mcp @context-forge/cli

# Install the methodology guides into your project
cf guides install

# Install Claude rules and create CLAUDE.md.  It will warn before any overwrite, and 
# create CLAUDE.md.bak as well.  Only Claude is currently supported.
cf setup-ide claude

# Add the MCP server to Claude Code
claude mcp add --transport stdio context-forge -- npx @context-forge/mcp

# Install Claude Code slash commands
cf install-commands
```

That's it. `cf status` works. Your AI assistant can call Context Forge tools. `/cf:build` assembles context from a slash command.

Requirements: Node.js 18+, pnpm 10+.

## How It Works

Context Forge is built around a structured development methodology called [ai-project-guide](https://github.com/ecorkran/ai-project-guide). Projects progress through phases:

**Concept → Architecture → Slice Planning → Slice Design → Task Breakdown → Implementation → Integration**

Each phase produces documents. Documents reference each other. Slices decompose into tasks. Tasks track completion. The whole thing is a hierarchy you can navigate, introspect, and hand off between humans and agents without losing state.

Context Forge is the engine that:
- **Knows where you are** — parses your project artifacts, reads completion states, understands methodology phase
- **Knows what's next** — workflow navigation recommends the next action with rationale
- **Generates session context** — assembles everything an AI agent needs into a structured prompt, automatically
- **Tracks everything** — persistent project state, two-tier configuration, artifact introspection across all your projects

It manages multiple projects simultaneously. Each one has its own slice plan, its own task state, its own methodology position.

## Access Points

Context Forge is available through four interfaces — use whichever fits your workflow:

**MCP Server** (`@context-forge/mcp`) — [nn] tools for project management, context generation, artifact introspection, workflow navigation, guide management, and configuration. Works with Claude Code, Cursor, or any MCP-compatible client. This is what your AI assistant talks to.

**CLI** (`@context-forge/cli`) — Terminal commands: `cf status`, `cf next`, `cf build`, `cf set`, `cf project`, `cf arch list`, `cf plan list`, `cf slice list`, `cf task list`, `cf config`, `cf future`, `cf check`, `cf prompt`, `cf guides`. Pipeable output — `cf build | pbcopy` gives you a ready-to-paste context prompt. `--json` on every read command for scripting.

**Claude Code Slash Commands** — `/cf:status`, `/cf:build`, `/cf:next`, `/cf:prompt`. Installed via `cf install-commands`. Your AI assistant can suggest these contextually.

**Electron Desktop App** — Visual interface for project management, template editing, and context preview. Multi-project support, split-pane editor, light/dark themes.

## Architecture

pnpm monorepo, four packages:

```
packages/
  core/       @context-forge/core    — context engine, project state, introspection, workflow
  mcp-server/ @context-forge/mcp     — MCP protocol server ([nn] tools)
  cli/        @context-forge/cli     — terminal interface (cf command)
  electron/   @context-forge/electron — desktop app
```

All interfaces consume `@context-forge/core` directly. The MCP server and CLI produce identical results for the same operations — they're different access patterns to the same engine.

792 tests across all packages. TypeScript, strict mode, no `any`.

## Also

**[context-visualizer](https://github.com/ecorkran/context-visualizer)** — React app that visualizes project structure through the MCP server. See your slice plans, task completion, and project hierarchy rendered visually.

**[ai-project-guide](https://github.com/ecorkran/ai-project-guide)** — The methodology framework. Phases, guides, prompt templates, review rules, IDE configuration. This is what Context Forge's structure is built on. Install it with `cf guides install`.

## Published Packages

- [`@context-forge/mcp`](https://www.npmjs.com/package/@context-forge/mcp)
- [`@context-forge/cli`](https://www.npmjs.com/package/@context-forge/cli)
- [`@context-forge/core`](https://www.npmjs.com/package/@context-forge/core)

## License

MIT
