# Context Forge

Context Forge manages the full lifecycle of AI-assisted development projects — from concept through architecture, slice planning, task breakdown, implementation, and integration. It maintains traceable, hierarchical project state so that every AI session starts with full awareness of where things stand and what's next.

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
# 1. Install globally
npm install -g @context-forge/mcp @context-forge/cli

# 2. Add the MCP server (strongly recommended)
claude mcp add --transport stdio context-forge -- npx @context-forge/mcp

# 3. Set up your project — pick one:
cf init                   # CLI: creates project, installs guides, configures IDE, installs slash commands
# — or —
/cf:onboard               # Slash command: AI-guided setup — walks you through everything conversationally
```

That's it. `cf status` works. Your AI assistant can call Context Forge tools. `/cf:build` assembles context. `/cf:onboard` can take a new user from zero to their first concept discussion.

<details>
<summary>MCP server JSON config (for Cursor, Perplexity, Windsurf, etc.)</summary>

```json
{
  "context-forge": {
    "command": "npx",
    "args": ["@context-forge/mcp"],
    "env": {}
  }
}
```

</details>

<details>
<summary>Manual setup (if you prefer step-by-step control)</summary>

```bash
cf guides install          # Install methodology guides into your project
cf setup-ide claude        # Install Claude rules and create CLAUDE.md
cf install-commands        # Install Claude Code slash commands
```

</details>

Requirements: Node.js 18+.

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

For larger projects with parallel initiatives — running architecture and a feature slice at the same time, for example — worktrees let you run multiple AI sessions in separate git worktrees, each with its own phase/slice/task context, without conflicts.

## Access Points

Context Forge is available through four interfaces — use whichever fits your workflow:

### MCP Server (`@context-forge/mcp`)

34 tools for project management, context generation, artifact introspection, workflow navigation, worktree management, guide management, and configuration. Works with Claude Code, Cursor, or any MCP-compatible client. This is what your AI assistant talks to.

| Category | Tools |
|----------|-------|
| Project | `project_list`, `project_get`, `project_create`, `project_update`, `project_schema`, `project_structure` |
| Context | `context_build`, `context_summarize`, `template_preview`, `prompt_list`, `prompt_get` |
| Workflow | `workflow_status`, `workflow_next`, `workflow_check`, `workflow_future` |
| Worktrees | `worktree_list`, `worktree_get`, `worktree_init`, `worktree_update`, `worktree_rm` |
| Introspection | `introspection_documents`, `introspection_frontmatter`, `introspection_slice_plan`, `introspection_tasks`, `introspection_future_work` |
| Configuration | `config_get`, `config_set` |
| Guides | `guide_install`, `guide_status`, `guide_update` |
| Storage | `storage_backup` |
| Meta | `agent_guide`, `agent_onboard`, `server_version` |

### CLI (`@context-forge/cli`)

`cf` works like `git` — install it globally and it detects your project from the current directory. Pipeable output: `cf build | pbcopy` gives you a ready-to-paste context prompt. `--json` on every read command for scripting.

| Command | Description |
|---------|-------------|
| `cf init` | Initialize project: git, guides, IDE config, slash commands |
| `cf status` | Workflow status (phase, slice, task progress) |
| `cf next` | Recommended next action with rationale |
| `cf build` | Assemble context prompt for AI session |
| `cf set <field> <value>` | Set a project field |
| `cf get` | Show all project fields |
| `cf check` | Run consistency checks (`--fix`, `--slice`) |
| `cf project list\|get\|set\|rm` | Manage projects |
| `cf worktree init\|list\|get\|update\|rm` | Manage git worktree contexts |
| `cf arch list` | Architecture initiatives with slice counts |
| `cf plan list` | Slice plan files with progress |
| `cf slice list` | Slices from the active plan with status |
| `cf tasks list` | Task files with completion counts |
| `cf tasks items` | Individual tasks from the active task file |
| `cf config get\|set` | Two-tier configuration |
| `cf future` | Consolidated future work across all plans |
| `cf prompt list\|get <phase>` | Prompt templates with variable substitution |
| `cf guides install\|status\|update` | ai-project-guide template management |
| `cf setup-ide claude` | Configure Claude Code integration |
| `cf backup` | Versioned project data backup (keeps last 10) |

### Claude Code Slash Commands

Installed via `cf install-commands`. Available directly in Claude Code sessions:

| Command | Description |
|---------|-------------|
| `/cf:onboard` | AI-guided project setup and first-phase walkthrough |
| `/cf:build` | Build context prompt (accepts `--phase`, `--slice`) |
| `/cf:status` | Show workflow status |
| `/cf:get` | Show all project fields |
| `/cf:set` | Set a project field |
| `/cf:next` | Recommended next action |
| `/cf:prompt` | Get or list prompt templates |
| `/cf:project` | Manage projects |

### Electron Desktop App

Visual interface for project management, template editing, and context preview. Multi-project support, split-pane editor, light/dark themes.

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

1139 tests across all packages. TypeScript, strict mode, no `any`.

## Also

**[context-visualizer](https://github.com/ecorkran/context-visualizer)** — React app that visualizes project structure through the MCP server. See your slice plans, task completion, and project hierarchy rendered visually.

**[ai-project-guide](https://github.com/ecorkran/ai-project-guide)** — The methodology framework. Phases, guides, prompt templates, review rules, IDE configuration. This is what Context Forge's structure is built on. Install it with `cf guides install`.

## Published Packages

- [`@context-forge/mcp`](https://www.npmjs.com/package/@context-forge/mcp)
- [`@context-forge/cli`](https://www.npmjs.com/package/@context-forge/cli)
- [`@context-forge/core`](https://www.npmjs.com/package/@context-forge/core)

## License

MIT
