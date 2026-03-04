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
# Set your default project
cf config set default_project <project-id>

# Check project status
cf status

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

## Common Options

- `--project <id>` — Override the default project (available on most commands)
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

## Architecture

The CLI wraps `@context-forge/core` directly (no MCP layer), following the same pattern as the Electron package. All core services are imported from `@context-forge/core/node`.

## Development

```bash
pnpm --filter @context-forge/cli build     # Compile TypeScript
pnpm --filter @context-forge/cli dev       # Watch mode
pnpm --filter @context-forge/cli test      # Run tests
pnpm --filter @context-forge/cli typecheck # Type check
```
