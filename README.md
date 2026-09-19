# Context Forge

<!-- Claude: please find code analysis details in user/analysis/940-analysis.initial-codebase.md -->

Context Forge massively speeds the development of large projects with AI agents while maintaining high quality.  

It multiplies your cognitive abilities and doesn't try to replace them. Not another "Hey AI, build me an app" framework, and it may be overkill for building simple gadgets. Development is managed through a structured process, starting with broad initiatives and breaking functionality into vertical slices and individual tasks.  It maintains traceable, hierarchical project state so that every AI session starts with full awareness of where things stand and what's next.

It's designed to be easy for AIs as well.  Every command can output structured JSON.  Easily readable by AI, and usable in pipelines.  The MCP server provides an agent_quickstart to simplify use by AIs.


## What It Looks Like

### CLI
Everything is discoverable under the `cf` command.  Start with `cf --help`.  Easily manage multiple projects.  cf knows which one based on your current directory.  `cf init` to start a new one.  Ideally it will feel similar to git.

![cf project list output](assets/cf-project-list.png)

Obtain brief status with `cf status`, detailed with `cf project get`. Use the MCP or slash-commands if you prefer.
![cf status output](assets/cf-status.png)

Your AI assistant sees this too — through MCP tools, through slash commands, through the CLI. It knows the project structure, the methodology phase, the active slice, and (*very* soon) exactly which task to work on next. No "let me catch you up." No re-reading CLAUDE.md. No guessing.

### Visualizer
![Context Visualizer](assets/context-visualizer.png)

Context Forge builds big projects fast.  Visualizer is a separate tool to help humans maintain an overview.  Available at:  
https://github.com/ecorkran/context-visualizer


## Get Started

Most people should install [Squadron](https://github.com/ecorkran/squadron) and let it
set up Context Forge for them. Squadron drives multi-agent pipelines through `cf`, so it
installs and configures both. If you only want the methodology and context engine, the
standalone path below is fully supported.

### Recommended: install via Squadron

```bash
uv tool install squadron-ai     # or: pipx install squadron-ai
sq setup                        # installs cf, /sq:* and /cf:* commands, checks providers
```

`sq setup` is interactive and idempotent, so it is safe to re-run. Then, inside each
project you want to work on:

```bash
cf init                         # creates the project, installs guides, configures your IDE
```

### Context Forge on its own

```bash
# 1. Install globally (one package gets you everything)
npm install -g @context-forge/context-forge

# 2. Add the MCP server (strongly recommended)
claude mcp add --transport stdio context-forge -- npx @context-forge/mcp
# Codex CLI instead? Add to ~/.codex/config.toml — see the MCP config details below.

# 3. Set up your project — pick one:
cf init                   # CLI: creates project, installs guides, configures IDE, installs slash commands
cf init --ide copilot     # Same, but configured for VS Code Copilot instead of Claude Code
cf init --ide codex       # Same, but configured for OpenAI Codex (also: cursor, agents, openai)
# — or —
/cf:onboard               # Slash command: AI-guided setup — walks you through everything conversationally
```

That's it. `cf status` works. Your AI assistant can call Context Forge tools. `/cf:build` assembles context. `/cf:onboard` can take a new user from zero to their first concept discussion.

<details>
<summary>MCP server config (Cursor, Windsurf, OpenAI Codex, etc.)</summary>

```json
{
  "context-forge": {
    "command": "npx",
    "args": ["@context-forge/mcp"],
    "env": {}
  }
}
```

For OpenAI Codex CLI, add to `~/.codex/config.toml`:

```toml
[mcp_servers.context-forge]
command = "npx"
args = ["@context-forge/mcp"]
```

</details>

<details>
<summary>Manual setup (if you prefer step-by-step control)</summary>

```bash
cf guides install          # Install methodology guides into your project
cf setup-ide claude        # Install Claude rules and create CLAUDE.md
cf setup-ide copilot       # Install rules/skills for VS Code Copilot
cf setup-ide cursor        # Install scoped rules for Cursor, always-on rules in AGENTS.md
cf setup-ide codex         # Write AGENTS.md + skills for OpenAI Codex (aliases: openai, agents)
cf install-commands              # Install /cf:* slash commands for Claude Code (machine-level)
cf install-commands --ide codex  # Install $cf-* agent skills for Codex (machine-level)
cf install-commands --local      # Project-local install (either target)
```

Each target writes a different file layout:

```
cf setup-ide claude              # CLAUDE.md, .claude/{rules,agents,skills}/
cf setup-ide copilot             # AGENTS.md, .github/copilot-instructions.md,
                                  # .github/{instructions,prompts}/
cf setup-ide cursor              # AGENTS.md (always-on), .cursor/rules/*.mdc (scoped)
cf setup-ide codex|openai|agents # AGENTS.md, .agents/skills/<name>/SKILL.md
```

</details>

Requirements: Node.js 20.18+.

## How It Works
Context Forge is built around a structured development methodology called [ai-project-guide](https://github.com/ecorkran/ai-project-guide). 

Projects progress through phases:
**Concept → Initiative Plan → Architecture → Slice Planning → Slice Design → Task Breakdown → Implementation → Integration**

Each phase produces documents. Documents reference each other. Slices decompose into tasks. Tasks track completion. The whole thing is a hierarchy you can navigate, introspect, and hand off between humans and agents without losing state.

Context Forge is the engine that:
- **Knows where you are** — parses your project artifacts, reads completion states, understands methodology phase
- **Knows what's next** — workflow navigation recommends the next action with rationale
- **Generates session context** — assembles everything an AI agent needs into a structured prompt, automatically
- **Tracks everything** — persistent project state, two-tier configuration, artifact introspection across all your projects

It manages multiple projects simultaneously. Each one has its own slice plan, its own task state, its own methodology position.

For larger projects with parallel initiatives — running architecture and a feature slice at the same time, for example — worktrees let you run multiple AI sessions in separate git worktrees, each with its own phase/slice/task context, without conflicts.

### Choosing a guide install strategy

`cf guides install` and `cf init` accept `--strategy` to control how the guide
lands in your project. The guide itself is identical either way; the strategies
differ in how it is tracked.

| Strategy | Trade-off |
| --- | --- |
| `submodule` (default) | version-pinned and updatable, but teammates must run git submodule update |
| `clone` | a full working copy you can commit to, larger checkout |
| `tarball` | plain files with no git wiring, simplest for teams |

**Why submodule is the default.** It records the exact guide commit your project
was built against, so the pin is reviewable in a diff and reproducible on any
checkout. It updates in place through git rather than through the GitHub API,
which keeps the network surface small, and it leaves a working path for
contributing improvements back upstream.

The historical cost of that default was that a teammate cloning your repo
without `--recurse-submodules` got an empty guide directory. Context Forge now
initializes the checkout automatically the first time a command reads guide
content, reporting what it did on stderr. `cf guides info` shows the checkout
state and never modifies it, so you can always inspect before acting. A checkout
sitting at a commit other than the one your project pins is reported and left
alone, since that is usually deliberate.

Pick `tarball` when teammates should not have to think about git submodules at
all. The guide lands as plain files in your repo — the archive's own git files
(`.gitmodules`, `.gitignore`) are dropped at extract time — so once one person
runs the install, everyone else gets the guide from your repo like any other
file. That one person needs to reach github.com (to resolve the latest tag) and
api.github.com (to download the archive); the standard `HTTPS_PROXY` /
`NO_PROXY` variables are honored for both. The source must be a github.com
repository, and a `guide.source` config value is honored on both install and
update. `cf guides update` replaces the directory, so a guide bump shows up as
an ordinary reviewable diff.

Pick `clone` when you intend to edit the guide in place. The strategy name
`manual` is a deprecated alias for `tarball`; it still works and prints a
deprecation notice.

> This directory is managed by cf and overwritten on `cf guides update`. Put
> project-specific customizations under `project-documents/user/`.

## Review Gating

Optionally require a review artifact (with a clearing verdict) before Context Forge recommends advancing past a lifecycle boundary — deterministic, AI-free routing with **zero behavior change unless you turn it on**:

```bash
cf config set workflow.review_enabled true
```

Off by default. To exempt a single slice from its review requirement:

```bash
cf check --set-review-none <index>    # writes review: none to that slice's design doc
```

See the [Review Gating reference](docs/REVIEW-GATING.md) for the full config-key surface, decision matrix, and other escape hatches (grandfathering old work, exempting docs-only slices).

## Design Philosophy
 
Context Forge resists the urge to be clever on your behalf.
 
We added compound commands — `cf implement` instead of `cf set phase 6 && cf build`. Then we cut them all. They bloated the command surface, cluttered the slash commands, and obscured what was actually happening. The low-level commands were better. They composed. They were transparent. So we went back.
 
This is a pattern, not an accident. The tool stays close to the metal:
 
- **No magic.** You can do everything through MCP if you want, but `cf set phase 6` is a hundred times faster and you should just type it. The MCP tools exist so agents can operate autonomously, not so humans can burn tokens setting a property.
- **No opinions about your stack.** Context Forge doesn't care if you're writing Python, TypeScript, C++, or all three. It manages project state and generates context. Your agents do the rest.
- **No hand-holding.** There's an onboarding flow if you want it (`/cf:onboard`). There's `cf next` if you want guidance. But the tool doesn't gate your progress or force you through ceremonies. You're the architect. Act like it.

### Naming Things
Started as a simple Electron utility called Context Builder, and long since outgrew both the name and the Electron app. It stays Context Forge because the npm org carries four packages and seventy-odd releases, and renaming that costs every existing user more than a better name is worth. Naming things is hard. One of the only two hard things, together with cache invalidation and off-by-one errors.


## Access Points
Three interfaces — use whichever fits your workflow:

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
| Meta | `agent_onboard`, `agent_quickstart`, `server_version` |

### CLI (`@context-forge/cli`)

`cf` works like `git` — install it globally and it detects your project from the current directory. `--json` on every read command for scripting.

| Command | Description |
|---------|-------------|
| `cf init` | Initialize project: git, guides, IDE config, slash commands |
| `cf status` | Workflow status (phase, slice, task progress) |
| `cf next` | Recommended next action with rationale |
| `cf build` | Assemble context prompt for AI session (`--embed` inlines artifact files for non-SDK models) |
| `cf set <field> <value>` | Set a project field |
| `cf unset <field>` | Clear an optional project field (distinct from setting it empty) |
| `cf get` | Show all project fields |
| `cf check` | Run consistency checks (`--fix`, `--slice`, `--set-review-none <index>` to exempt a slice from review) |
| `cf validate` | Validate project artifacts against their machine-readable schemas |
| **Listing** | **Browse project artifacts** |
| `cf list projects` | All registered projects |
| `cf list initiatives` | Architecture initiatives with slice counts (alias: `cf list arch`) |
| `cf list plans` | Slice plan files with progress |
| `cf list slices` | Slices from the active plan with status |
| `cf list tasks` | Task files with completion counts |
| `cf list items` | Individual tasks from the active task file |
| **Management** | |
| `cf project list\|get\|set\|unset\|rm` | Manage projects |
| `cf worktree init\|list\|get\|update\|rm` | Manage git worktree contexts |
| `cf config get\|set\|unset` | Two-tier configuration (`migrate-personal` moves personal keys out of the shared file) |
| `cf future` | Consolidated future work across all plans |
| `cf prompt list\|get <phase>` | Prompt templates with variable substitution |
| `cf guides install\|info\|update\|uninstall` | ai-project-guide template management |
| `cf setup-ide claude` | Configure Claude Code integration |
| `cf setup-ide copilot` | Configure VS Code Copilot integration |
| `cf setup-ide cursor` | Configure Cursor integration (scoped rules + AGENTS.md) |
| `cf setup-ide codex` | Configure OpenAI Codex integration (aliases: `openai`, `agents`) |
| `cf install-commands` / `cf uninstall-commands` | Install or remove `/cf:*` commands (Claude Code) or `$cf-*` skills (`--ide codex`); machine-level by default, `--local` for project-local |
| `cf backup` | Versioned project data backup (keeps last 10) |
| `cf update` | Update the CLI to the latest published version |

#### Key configuration

`cf config` reads and writes two scopes — **shared** keys (safe to commit; team-wide policy) and **personal** keys (per-developer, git-ignored). Run `cf config get` with no key to list everything. The keys you're most likely to set:

| Key | Scope | Purpose |
|-----|-------|---------|
| `git.integration_branch` | personal | Long-lived branch that work branches fork from and merge into instead of `main` (e.g. `dev/erik`). Changes git topology, not just names. |
| `workflow.review_enabled` | shared | Turn on review gating (off by default). |
| `workflow.review_threshold` | shared | Verdict floor that clears a gate (`pass` \| `concerns`). |
| `workflow.review_gate_effective_date` | shared | Grandfather work designed before `YYYYMMDD` past the gate. |
| `workflow.auto_advance` | shared | Auto-advance to the next slice when the current one completes. |
| `guide.auto_update` | shared | Auto-update the AI project guide. |

Full key reference and precedence rules: [Review Gating](docs/REVIEW-GATING.md) and `cf config --help`.

### Slash Commands & Agent Skills

Installed via `cf install-commands` (Claude Code, as `/cf:*` slash commands) or `cf install-commands --ide codex` (OpenAI Codex, as `$cf-*` agent skills — e.g. `$cf-build`, `$cf-status`). Same nine entry points either way:

| Command | Description |
|---------|-------------|
| `/cf:onboard` | AI-guided project setup and first-phase walkthrough |
| `/cf:build` | Build context prompt (accepts `--phase`, `--slice`) |
| `/cf:status` | Show workflow status |
| `/cf:get` | Show all project fields |
| `/cf:set` | Set a project field |
| `/cf:next` | Recommended next action |
| `/cf:check` | Run consistency checks on project artifacts |
| `/cf:prompt` | Get or list prompt templates |
| `/cf:project` | Manage projects |

## Architecture

pnpm monorepo, four packages:

```
packages/
  context-forge/ @context-forge/context-forge — meta-package (installs cli + mcp)
  core/          @context-forge/core          — context engine, project state, introspection, workflow
  mcp-server/    @context-forge/mcp           — MCP protocol server (34 tools)
  cli/           @context-forge/cli           — terminal interface (cf command)
```

All interfaces consume `@context-forge/core` directly. The MCP server and CLI produce identical results for the same operations — they're different access patterns to the same engine.

Comprehensive test coverage across all packages. TypeScript, strict mode, no `any`.

## Related

**[Squadron](https://github.com/ecorkran/squadron)** — Multi-agent pipeline orchestration built on Context Forge. Runs reviews, analyses, and multi-step work across providers, driving `cf` for project state and context. `sq setup` installs both, which is the recommended way in.

**[context-visualizer](https://github.com/ecorkran/context-visualizer)** — React app that visualizes project structure through the MCP server. See your slice plans, task completion, and project hierarchy rendered visually.

**[ai-project-guide](https://github.com/ecorkran/ai-project-guide)** — The methodology framework. Phases, guides, prompt templates, review rules, IDE configuration. This is what Context Forge's structure is built on. Install it with `cf guides install`.

**[Agent Integration Guide](docs/AGENT-INTEGRATION.md)** — How to integrate with Context Forge from an AI agent, orchestrator, or CI pipeline. Covers MCP tools, CLI `--json` mode, structured errors, and command discovery.

**[Review Gating](docs/REVIEW-GATING.md)** — Config-key reference, decision matrix, workflow states, and escape hatches for the optional review-gate feature.

## Published Packages

- [`@context-forge/context-forge`](https://www.npmjs.com/package/@context-forge/context-forge) — meta-package (installs cli + mcp)
- [`@context-forge/mcp`](https://www.npmjs.com/package/@context-forge/mcp)
- [`@context-forge/cli`](https://www.npmjs.com/package/@context-forge/cli)
- [`@context-forge/core`](https://www.npmjs.com/package/@context-forge/core)

## License

MIT
