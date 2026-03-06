# @context-forge/cli

Terminal interface for Context Forge — context assembly, project management, workflow navigation, and configuration.

## Installation

From the monorepo root:

```bash
pnpm install
pnpm --filter @context-forge/cli build
```

The `cf` binary is available via the workspace. For global install (future):

```bash
npm install -g @context-forge/cli
```

## Quick Start

```bash
# Set your default project (by name or ID)
cf config set default_project orchestration

# Check project status (auto-detects from CWD)
cd ~/repos/orchestration && cf status

# Generate a context prompt and copy to clipboard
cf build | pbcopy

# Generate with phase override
cf build --phase task-breakdown

# View available prompt templates
cf prompt list

# Get a specific prompt with project variables substituted
cf prompt get P5
```

## Commands

| Command | Usage | Description |
|---------|-------|-------------|
| `cf status` | `cf status [--project <id>] [--json]` | Show workflow status for the active project |
| `cf next` | `cf next [--project <id>] [--json]` | Show recommended next action |
| `cf build` | `cf build [--project <id>] [--phase] [--slice] [--instruction] [--tasks] [--additional]` | Generate context prompt to stdout |
| `cf config` | `cf config list\|get\|set` | Manage configuration |
| `cf project` | `cf project list\|get\|set` | Manage projects |
| `cf future` | `cf future [--project <id>] [--status <filter>] [--json]` | Show consolidated future work |
| `cf check` | `cf check [--fix] [--json]` | Run consistency checks (stub — depends on slice 166) |
| `cf prompt` | `cf prompt list\|get <phase>` | Access prompt templates with variable substitution |
| `cf set` | `cf set <field> <value>` | Shortcut for `cf project set` |
| `cf get` | `cf get [--json]` | Shortcut for `cf project get` |

## Common Options

- `--project <name|id>` — Override the default project by name or ID (available on most commands)
- `--json` — Output as JSON (not applicable to `build` and `prompt get`)

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

## Project Resolution

`cf` resolves which project to operate on using a three-level chain:

1. **`--project` flag** — highest priority. Accepts project name or ID.
2. **CWD detection** — if the current directory is inside a registered project's path, that project is used automatically.
3. **`default_project` config** — fallback when no flag or CWD match.

`cf status` displays which method was used: `(--project flag)`, `(from CWD)`, or `(default)`.

**Planned config key:** `default_additional_instruction` — not yet implemented. Will allow setting a default additional instruction appended to `cf build` output.

## Architecture

The CLI wraps `@context-forge/core` directly (no MCP layer), following the same pattern as the Electron package. All core services are imported from `@context-forge/core/node`.

## Development

```bash
pnpm --filter @context-forge/cli build     # Compile TypeScript
pnpm --filter @context-forge/cli dev       # Watch mode
pnpm --filter @context-forge/cli test      # Run tests
pnpm --filter @context-forge/cli typecheck # Type check
```

## Phase / Instruction Auto-Set

Setting the development phase automatically updates `instruction` to match:

```bash
cf set phase 6
# Updated phase = Phase 6: Implementation on project my-project
# Updated instruction = Phase 6: Implementation (auto-set from phase)
```

Setting `instruction` directly does not change `developmentPhase`.

## Changelog

### v0.3.0

- **Template variable completion** — artifact fields (`fileArch`, `fileSlicePlan`, `fileHLD`, `fileSpec`) and aliases (`arch`, `plan`, `hld`, `spec`) available in prompt templates, with index extraction (`archIndex`, `planIndex`)
- **Consolidated project context** — `cf build` output uses clean key-value `### Project Context` block instead of bracket-wrapped format; `template` field removed; schema field names used throughout
- **Unified opening statement** — always "Working on {name}..." regardless of workType
- **Phase auto-sets instruction** — `cf set phase N` also updates `instruction` to match
- **Top-level shortcuts** — `cf set` and `cf get` work as shortcuts for `cf project set/get`

### v0.2.0

- **CWD-based project detection** — `cf` auto-detects the project from your current directory
- **Name-based resolution** — use `--project orchestration` or `cf config set default_project orchestration` with project names instead of IDs
- **Resolution indicators** — `cf status` shows how the project was resolved (`from CWD`, `default`, `--project flag`)
- **Compact `cf project list`** — Name/Path/Slice/Default columns with `●` default indicator and `~` path shortening
- **Tighter output formatting** — consistent label alignment, suppressed empty fields, standardized error messages

### v0.1.0

- Initial release with 8 commands: `status`, `next`, `build`, `config`, `project`, `future`, `check`, `prompt`
- Integration with `@context-forge/core` for context assembly
- Phase shorthands for prompt templates
- JSON output mode on all applicable commands
