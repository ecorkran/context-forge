# @context-forge/cli

Terminal interface for Context Forge — context assembly, project management, workflow navigation, and configuration.

## How It Works

`cf` works like `git` — install it globally and it automatically detects your project based on your current working directory. No configuration files to manage per-project; just `cd` into any registered project and run commands.

## Installation

```bash
# Install globally (recommended: meta-package installs both CLI and MCP server)
npm install -g @context-forge/context-forge

# Or install the CLI alone
npm install -g @context-forge/cli

# Initialize a project (from the project root)
cd ~/repos/my-project
cf init

# Install the ai-project-guide templates (recommended)
cf guides install

# Install Claude Code slash commands (recommended)
cf install-commands
```

`cf init` registers the current directory as a Context Forge project. `cf guides install` bootstraps the [ai-project-guide](https://github.com/ecorkran/ai-project-guide) prompt templates that Context Forge's context engine is designed around. `cf install-commands` adds `/cf:*` slash commands to Claude Code.

## Quick Start

```bash
# All commands are discoverable
cf --help
cf project --help

# Check project status
cf status

# Set project fields
cf set phase 6
cf set slice 175

# Browse project artifacts
cf list initiatives    # Architecture initiatives
cf list slices         # Slices in the active plan
cf list tasks          # Task files with progress
cf list items          # Individual tasks from the active task file

# What should I do next?
cf next

# Detailed information
cf project get

# View available prompt templates
cf prompt list

# Get a specific prompt with project variables substituted
cf prompt get P5
```

## Claude Code Slash Commands

When installed via `cf install-commands`, these slash commands are available directly in Claude Code sessions:

| Command | Description |
|---------|-------------|
| `/cf:build` | Build a context prompt (accepts `--phase`, `--slice` flags) |
| `/cf:status` | Show project workflow status |
| `/cf:get` | Show all project fields |
| `/cf:set` | Set a project field (e.g., `/cf:set phase 6`) |
| `/cf:prompt` | Get or list prompt templates (e.g., `/cf:prompt P5` or `/cf:prompt list`) |
| `/cf:project` | Manage projects (e.g., `/cf:project list`, `/cf:project --schema`) |
| `/cf:next` | Show recommended next action |
| `/cf:check` | Run consistency checks on project artifacts |
| `/cf:onboard` | AI-guided project setup |

Each command runs `cf` under the hood — same CWD-based project resolution, same output.

## Commands Reference

### Listing Commands

| Command | Description |
|---------|-------------|
| `cf list projects` | List all registered projects |
| `cf list initiatives` | Architecture initiatives with slice counts |
| `cf list arch` | Alias for `cf list initiatives` |
| `cf list plans` | Slice plan files with completion progress |
| `cf list slices` | Slices from the active plan with status |
| `cf list tasks` | Task files from the plan with progress |
| `cf list items` | Individual tasks from the active task file |

### Project & Workflow

| Command | Usage | Description |
|---------|-------|-------------|
| `cf init` | `cf init` | Register the current directory as a project |
| `cf status` | `cf status [--json]` | Show workflow status |
| `cf next` | `cf next [--json]` | Show recommended next action |
| `cf build` | `cf build [--phase] [--slice] [--json]` | Generate context prompt |
| `cf set` | `cf set <field> <value>` | Set a project field |
| `cf get` | `cf get [--json]` | Show all project fields |
| `cf check` | `cf check [--fix] [--slice <n>] [--json]` | Run consistency checks |
| `cf future` | `cf future [--status <filter>] [--json]` | Consolidated future work |
| `cf project` | `cf project list\|get\|set\|rm` | Manage projects |
| `cf prompt` | `cf prompt list\|get <phase>` | Access prompt templates |
| `cf version` | `cf version [--json]` | Show version (JSON includes breaking changes) |
| `cf help` | `cf help [--json]` | Show help (JSON outputs command catalog) |

### Administration

| Command | Description |
|---------|-------------|
| `cf worktree init\|list\|get\|update\|rm` | Manage git worktree contexts |
| `cf config get\|set` | Manage configuration |
| `cf guides install\|status\|update\|uninstall` | Manage ai-project-guide templates |
| `cf backup` | Create versioned backup of project data |
| `cf install-commands` | Install Claude Code slash commands |
| `cf setup-ide claude` | Configure IDE integration |

## Common Options

- `--project <name|id>` — Override the active project by name or ID
- `--json` — Output as JSON (not applicable to `build` and `prompt get`)

## Project Resolution

`cf` resolves which project to operate on using a priority chain:

1. **`--project` flag** — highest priority. Accepts project name or ID.
2. **CWD detection** — if the current directory is inside a registered project's path, or inside a registered worktree path, that project (and worktree) is resolved automatically.
3. **Git worktree detection** — if CWD is an unregistered git worktree of a known project, the project is resolved automatically (useful before running `cf worktree init`).
4. **`default_project` config** — if set via `cf config set default_project <name>`, used as a fallback.

This means you can manage multiple projects just by `cd`-ing between them — no switching commands needed.

## Phase Shorthands

`cf prompt get` and `cf build --phase` accept phase shorthands:

| Shorthand | Phase |
|-----------|-------|
| P1 | Concept |
| P2 | Architecture |
| P3 | Slice Planning |
| P4 | Slice Design |
| P5 | Task Breakdown |
| P6 | Implementation |
| P7 | Integration |

Shorthands are derived at runtime from the project's prompt asset file.

## Phase / Instruction Auto-Set

Setting the development phase automatically updates `instruction` to match:

```bash
cf set phase 6
# Updated phase = Phase 6: Implementation on project my-project
# Updated instruction = Phase 6: Implementation (auto-set from phase)
```

Setting `instruction` directly does not change `developmentPhase`.

## Smart Index Resolution

Setting artifact fields by numeric index resolves to the matching file on disk:

```bash
cf set slice 175
# Updated slice = 175-slice.context-output-consolidation on project my-project
# Updated tasks = 175-tasks.context-output-consolidation (auto-set from slice)
```

When no file exists yet, the CLI derives the stem from the slice plan entry:

```bash
cf set slice 166
# (no 166-slice.*.md on disk — derives from plan entry "Consistency Checker")
# Updated slice = 166-slice.consistency-checker on project my-project
# Updated tasks = 166-tasks.consistency-checker (auto-set from slice)
```

Setting `fileSlice` always auto-sets `fileTasks` to match.

## Architecture

The CLI wraps `@context-forge/core` directly (no MCP layer). All core services are imported from `@context-forge/core/node`.

## Development (monorepo)

```bash
pnpm --filter @context-forge/cli build     # Compile TypeScript
pnpm --filter @context-forge/cli dev       # Watch mode
pnpm --filter @context-forge/cli test      # Run tests
pnpm --filter @context-forge/cli typecheck # Type check
```

## Changelog

### v0.6.0

- **Compound workflow commands** — `cf concept`, `cf initiatives`, `cf arch <n>`, `cf plan <n>`, `cf slice <n>`, `cf tasks <n>`, `cf implement <n>` set artifact + phase + build context in one step
- **`cf list` consolidation** — all artifact listing under `cf list <type>` (`cf list slices`, `cf list tasks`, etc.)
- **Slash commands** — 16 Claude Code slash commands for compound commands, status, and workflow
- **`cf help --json`** — machine-readable command catalog for agent consumption
- **`cf version --json`** — version introspection with breaking changes tracking
- **Structured JSON errors** — error codes on all `UserError` instances, JSON error output via `--json` or `CF_JSON=1`
- **Idempotent set** — `cf set` detects no-change and skips write
- **`cf guides uninstall`** — clean removal of guide submodule or clone

### v0.5.0

- **Worktree support** — `cf worktree init|list|get|update|rm` for parallel multi-initiative development; `cf status --worktree` and `--worktrees` for cross-directory access
- **Worktree-aware project resolution** — auto-detects project from git worktree path even before `cf worktree init`
- **Worktree-scoped field routing** — `cf set phase/slice/tasks/arch/plan` updates the active `WorktreeContext` when resolved from a worktree
- **`cf check` across all worktrees** — consistency checks see worktree-scoped fields (phase, slice, arch, etc.) correctly
- **`cf check --slice <n>`** — narrow checks to a specific slice; `--yes` skips confirmation in fix mode
- **`cf tasks` command** — renamed from `cf task` for consistency (`cf tasks list`, `cf tasks items`)
- **`cf backup`** — versioned project data backup with auto-pruning (keeps last 10)
- **`cf setup-ide claude`** — configures Claude Code integration with CLAUDE.md backup safety

### v0.4.0

- **Discovery commands** — `cf arch list`, `cf plan list`, `cf slice list`, `cf tasks list`, `cf tasks items` for browsing project artifacts at every level
- **Smart index resolution** — `cf set slice 166` derives the filename from the slice plan when no file exists on disk
- **Auto-set fileTasks** — setting `fileSlice` always auto-sets `fileTasks`, even when the task file doesn't exist yet
- **Enhanced `cf status`** — now shows Date, Arch, and Plan fields
- **Workflow navigation** — `cf status` and `cf next` powered by `WorkflowNavigator` with slice status derivation and priority-ordered next-action recommendations

### v0.3.0

- **Template variable completion** — artifact fields (`fileArch`, `fileSlicePlan`, `fileHLD`, `fileSpec`) and aliases (`arch`, `plan`, `hld`, `spec`) available in prompt templates, with index extraction (`archIndex`, `planIndex`)
- **Consolidated project context** — `cf build` output uses clean key-value `### Project Context` block instead of bracket-wrapped format; `template` field removed; schema field names used throughout
- **Unified opening statement** — always "Working on {name}..." regardless of workType
- **Phase auto-sets instruction** — `cf set phase N` also updates `instruction` to match
- **Top-level shortcuts** — `cf set` and `cf get` work as shortcuts for `cf project set/get`

### v0.2.0

- **CWD-based project detection** — `cf` auto-detects the project from your current directory
- **Name-based resolution** — use `--project orchestration` with project names instead of IDs
- **Resolution indicators** — `cf status` shows how the project was resolved (`from CWD`, `--project flag`)
- **Compact `cf project list`** — Name/Path/Slice columns with `*` active indicator and `~` path shortening
- **Tighter output formatting** — consistent label alignment, suppressed empty fields, standardized error messages

### v0.1.0

- Initial release with 8 commands: `status`, `next`, `build`, `config`, `project`, `future`, `check`, `prompt`
- Integration with `@context-forge/core` for context assembly
- Phase shorthands for prompt templates
- JSON output mode on all applicable commands
