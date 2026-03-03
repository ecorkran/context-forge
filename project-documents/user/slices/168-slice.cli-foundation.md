---
docType: slice-design
slice: cli-foundation
project: context-forge
parent: user/architecture/160-slices.project-workflow-system.md
dependencies: [schema-standardization, config-system, artifact-introspection-engine, workflow-navigator, future-work-collector]
interfaces: [consistency-checker, integration-testing-and-documentation]
status: not_started
dateCreated: 20260301
dateUpdated: 20260302
---

# Slice Design: CLI Foundation

## Overview

Add a `packages/cli` package to the Context Forge monorepo that provides direct terminal access to context assembly, project management, workflow navigation, and configuration. The CLI wraps the same core functions consumed by the MCP server, giving developers a fast, pipeable, LLM-free interface to Context Forge capabilities.

After this slice, a developer can type `cf status` to see where a project stands, `cf build --phase task-breakdown` to generate a ready-to-use context prompt, and `cf config set default_project orchestration` to persist preferences — all without leaving the terminal or requiring an MCP client.

## Value

**Usability unlock.** Context Forge has sophisticated capabilities (workflow navigation, introspection, config, context assembly) but they're currently accessible only through MCP tool calls, which require an LLM intermediary. The CLI removes that barrier — every capability becomes a direct terminal command with instant feedback.

**Testability.** Manual testing of Context Forge's workflow tools currently requires an MCP client session. The CLI makes it trivial to verify behavior: `cf status`, `cf next`, `cf build` with various flags, all directly observable in the terminal.

**Pipeability.** `cf build` writes the assembled context prompt to stdout. This enables scripting workflows: `cf build --phase task-breakdown | pbcopy`, or integration with orchestration agents that call `cf build` as a subprocess and inject the output into their context.

**Discoverability.** `cf --help` and `cf <command> --help` make the tool self-documenting, following the same patterns that make the orchestration CLI immediately usable.

**Convergence foundation.** The orchestration project's Automated Development Pipeline (120-arch) needs to call Context Forge programmatically. While it could do this via MCP, a CLI subprocess call (`cf build --phase implementation --project orchestration`) is simpler, more debuggable, and doesn't require an MCP session. The CLI becomes the natural integration surface.

## Technical Scope

### Included

**Core commands:**
- `cf status` — Project workflow status (methodology phase, slice completion, active slice state)
- `cf next` — Recommended next action with rationale
- `cf build` — Generate and output a context prompt (stdout, pipeable)
- `cf config` — Persistent configuration management (get/set/list)
- `cf project` — Project management (list/get/update)
- `cf future` — Consolidated future work view across slice plans
- `cf check` — Consistency checker (artifact state mismatches)
- `cf prompt` — Prompt template access with variable substitution (list, get with resolved variables)

**Infrastructure:**
- `packages/cli/` package in the monorepo with its own `package.json`, `tsconfig.json`
- Entry point: `cf` command via `package.json` `"bin"` field
- Colorized, formatted terminal output (tables for structured data, styled text for status)
- `--help` at every level with clear descriptions
- `--json` flag on read commands for machine-readable output
- `--project` global option with fallback to `default_project` config
- Error handling with user-friendly messages (not stack traces)

### Excluded

- **Command Grammar parsing** (140 Future Work #2) — The CLI uses standard subcommand/flag patterns, not a custom grammar DSL. The grammar initiative can build on top of this CLI later.
- **Interactive/REPL mode** — Commands are one-shot. No persistent session.
- **MCP client mode** — The CLI imports `@context-forge/core` directly, not through MCP. This is the same pattern as the Electron package.
- **Workflow advance/execute** — The CLI reports status and builds context; it does not execute phase transitions or dispatch agents. That's the ADP's job.
- **npm publishing** — Deferred to a separate packaging step. The CLI is installed from the monorepo during development.

## Dependencies

### Prerequisites

| Dependency | Status | What This Slice Consumes |
|---|---|---|
| 161: Schema Standardization | Complete | Standardized `ProjectData` fields, artifact reference fields |
| 162: Config System | Complete | `ConfigManager`, config resolution, `default_project` |
| 163: Artifact Introspection | Complete | Slice plan parsing, task file parsing, document detection |
| 164: MCP Introspection Tools | Complete | (Indirect — validates the introspection API surface) |
| 165: Workflow Navigator | Complete | `WorkflowNavigator.getStatus()`, `.getNext()` |
| 167: Future Work Collector | Complete | `FutureWorkCollector.collect()` |
| `@context-forge/core` | Complete | `ContextGenerator`, `ServiceFactory`, `FileProjectStore`, `ConfigManager` |

### External Packages (new)

- **`commander`** — CLI framework for Node.js. Subcommand support, option parsing, auto-generated help. Chosen over alternatives:
  - `yargs`: More features but heavier, API is less intuitive for subcommand trees
  - `citty`: Lighter but less mature ecosystem
  - `commander`: Battle-tested, excellent TypeScript support, clean subcommand pattern, good help formatting
- **`chalk`** — Terminal colors and styling. Already commonly used in Node.js CLIs.
- **`cli-table3`** or **`tty-table`** — Table formatting for structured output (project list, config list, status display). Evaluate at implementation time; the orchestration project uses Rich (Python) tables to good effect and we want similar quality.

No new dependencies on `@modelcontextprotocol/sdk` — the CLI bypasses MCP entirely.

## Architecture

### Package Structure

```
packages/cli/
├── src/
│   ├── index.ts              # Entry point, program definition
│   ├── commands/
│   │   ├── status.ts         # cf status
│   │   ├── next.ts           # cf next
│   │   ├── build.ts          # cf build
│   │   ├── config.ts         # cf config get/set/list
│   │   ├── project.ts        # cf project list/get/update
│   │   ├── future.ts         # cf future
│   │   ├── check.ts          # cf check
│   │   └── prompt.ts         # cf prompt
│   ├── output/
│   │   ├── formatter.ts      # Output formatting (terminal vs JSON)
│   │   ├── tables.ts         # Table rendering helpers
│   │   └── styles.ts         # Color/style definitions
│   └── utils/
│       ├── project.ts        # Resolve project ID (flag → config → error)
│       └── errors.ts         # Error formatting, user-friendly messages
├── package.json
├── tsconfig.json
└── README.md
```

Test structure:
```
packages/cli/
└── tests/
    ├── commands/
    │   ├── status.test.ts
    │   ├── build.test.ts
    │   ├── config.test.ts
    │   └── ...
    └── utils/
        └── project.test.ts
```

### Component Interactions

```
User (terminal)
  → commander CLI (cli/src/index.ts)
    → command handler (cli/src/commands/build.ts, etc.)
      → @context-forge/core services directly
        → FileProjectStore, ConfigManager, WorkflowNavigator, etc.
      ← structured data
    → output formatter (terminal table / JSON / raw text)
  ← stdout
```

The CLI is a thin presentation layer. Each command handler:
1. Resolves the project (explicit `--project` flag, or `default_project` from config, or error)
2. Instantiates the relevant core service
3. Calls the core function
4. Formats and outputs the result

### Project Resolution

Every command that operates on a project follows the same resolution chain:

```typescript
function resolveProjectId(explicit?: string): string {
  // 1. Explicit --project flag (highest priority)
  if (explicit) return explicit;
  
  // 2. default_project config value
  const configManager = new ConfigManager();
  const defaultProject = configManager.get('default_project');
  if (defaultProject) return defaultProject;
  
  // 3. No project resolvable
  throw new UserError(
    'No project specified. Use --project <id> or set a default:\n' +
    '  cf config set default_project <project-id>\n' +
    '  cf project list    # to see available projects'
  );
}
```

This mirrors the MCP server's `default_project` behavior but with a better error message that tells you exactly how to fix it.

## Command Specifications

### Global Options

```
cf [--project <id>] [--json] <command>
```

- `--project` (optional): Override project for this invocation. Bypasses config resolution.
- `--json` (optional): Output JSON instead of formatted terminal output. Available on all read commands.

### `cf status`

Display workflow status for the current project.

```
cf status [--project <id>] [--json]
```

**Terminal output example:**
```
Project: orchestration
Phase:   implementation
Slice:   115-conversation-persistence (in progress)
Tasks:   7/14 complete

Slice Plan: 100-slices.orchestration-v2
  Completed: 10/18 slices
  Active:    115-conversation-persistence
  Next:      116-codex-agent-integration
```

**Behavior:** Calls `WorkflowNavigator.getStatus()` for the resolved project. Formats the structured result as a human-readable summary.

### `cf next`

Show the recommended next action.

```
cf next [--project <id>] [--json]
```

**Terminal output example:**
```
Recommended: Continue implementation of slice 115

  Slice:  115-conversation-persistence
  Phase:  implementation
  Tasks:  7 of 14 remaining
  Next task: Implement ConversationStore protocol

  Rationale: Active slice has incomplete tasks.
```

**Behavior:** Calls `WorkflowNavigator.getNext()`. Formats recommendation with rationale.

### `cf build`

Generate a context prompt and write it to stdout.

```
cf build [--project <id>] [--phase <phase>] [--slice <name>]
         [--instruction <type>] [--tasks <file>] [--additional <text>]
```

- `--phase`: Override development phase (e.g., `task-breakdown`, `implementation`, `design`)
- `--slice`: Override active slice name
- `--instruction`: Override instruction type
- `--tasks`: Override task file
- `--additional`: Additional instructions appended to the context

**Behavior:** Calls `ContextGenerator.generate()` with overrides applied to a working copy of project data (same logic as the MCP `context_build` tool). Outputs the raw context string to stdout with no formatting wrapper — this is the pipeable payload.

**Design decision:** `cf build` always writes raw context to stdout, even without `--json`. The context *is* the output. Terminal formatting (colors, tables) would corrupt it for piping. Status messages (e.g., "Building context for orchestration...") go to stderr if needed, keeping stdout clean.

```bash
# Pipe to clipboard
cf build --phase task-breakdown | pbcopy

# Pipe to file
cf build --phase implementation > context.md

# Use in a script
CONTEXT=$(cf build --phase design --slice 115)
```

### `cf config`

Manage persistent configuration.

```
cf config list                          # Show all config with values and sources
cf config get <key>                     # Get a specific config value
cf config set <key> <value>             # Set a config value (user level)
cf config set <key> <value> --project   # Set at project level
```

**Terminal output for `cf config list`:**
```
  Key                    Value              Source
  ─────────────────────  ─────────────────  ─────────────
  default_project        orchestration      user config
  guide.auto_update      true               default
  guide.git_strategy     gitignore          project config
```

**Behavior:** Wraps `ConfigManager` methods. `list` shows all known keys with resolved values and their resolution source (default / user config / project config).

### `cf project`

Project management.

```
cf project list                                    # List all projects
cf project get [--project <id>]                    # Show project details
cf project set <field> <value> [--project <id>]    # Update a project field
```

**`cf project list` terminal output:**
```
  ID              Name                 Path                                    Slices
  ──────────────  ───────────────────  ──────────────────────────────────────  ──────
  context-forge   Context Forge        ~/source/repos/manta/context-forge      7/12
  orchestration   Orchestration v2     ~/source/repos/manta/orchestration      10/18
  visualizer      Context Visualizer   ~/source/repos/manta/context-visualizer 2/5
```

**`cf project set` examples:**
```bash
cf project set fileSlice 115-slice.conversation-persistence.md
cf project set fileArch 100-arch.orchestration-v2.md
cf project set fileTasks 115-tasks.conversation-persistence.md
```

Note: While `cf project set` handles individual field updates, the long-term goal is for `cf status` and `cf next` (via the workflow navigator) to derive active files from the slice plan automatically, reducing the need for manual `set` calls. For now, explicit `set` is the reliable path.

### `cf future`

Show consolidated future work.

```
cf future [--project <id>] [--json]
```

**Behavior:** Calls `FutureWorkCollector.collect()`. Groups by source architecture component. Shows description, effort estimate, and dependencies for each item.

### `cf check`

Run consistency checker.

```
cf check [--project <id>] [--fix] [--json]
```

- `--fix`: Apply non-destructive corrections (update checkboxes, set frontmatter status)

**Behavior:** Calls consistency checker. Displays findings with severity (info/warning/error), location, and suggested fix. With `--fix`, applies corrections and reports what changed.

Note: Depends on slice 166 (Consistency Checker) which is not yet complete. This command can be stubbed initially and wired when 166 lands, or 166 can be completed first. The CLI infrastructure doesn't depend on 166 — just this one command does.

### `cf prompt`

Prompt template access. Two distinct operations: list available templates, or get a resolved template ready to paste.

```
cf prompt list [--project <id>] [--json]
cf prompt get <phase> [--project <id>] [--raw]
```

- `list`: Shows all available prompt templates with descriptions. Wraps `SystemPromptParser` or equivalent template discovery.
- `get <phase>`: Retrieves a prompt template with project variables substituted from the current project state. Output is raw text to stdout (pipeable, no colors or wrapping) — the same stdout-clean convention as `cf build`.
- `--raw`: Output the unsubstituted template. Useful for inspecting what variables a template uses before the project is configured.

**Phase resolution:** The `<phase>` argument is matched case-insensitively. Hyphens and spaces are interchangeable, so `task-breakdown`, `Task Breakdown`, and `TASK-BREAKDOWN` all resolve to the same template. Phase shorthands (`P1`, `P4`, `P5`, etc.) are also accepted.

**Phase shorthand mapping** is derived at runtime by parsing `packages/core/assets/prompt.ai-project.system.md` — no table is hardcoded in the CLI. Any heading matching `(Phase n)` or `(Phase n.m)` (where n and m are integers) yields a shorthand. Adding or renaming a phase in the prompt file automatically updates the available shorthands without a code change.

The table below reflects what the current prompt file produces and is **illustrative only**:

| Shorthand | Template Name |
|---|---|
| `P1` | Concept |
| `P2` | Architecture |
| `P3` | Slice Planning |
| `P4` | Slice Design |
| `P5` | Task Breakdown |
| `P6` | Implementation |
| `P7` | Integration |

Note: Task Breakdown Supplement and Task Expansion are variants of P5 (`Supplement: Phase 5` / `Variant: Phase 5`) — they do not match the `(Phase n)` pattern and have no shorthands. Use the full instruction name to select them.

**Variable substitution:** `cf prompt get` resolves project variables from the current project's data. Variables left unresolved (no value in project data) are preserved as-is in the output — not silently blanked — so the user can see which variables need to be set.

| Variable | Source |
|---|---|
| `{project}` | project name |
| `{slice}` | `fileSlice` |
| `{task-file}` | `fileTasks` |
| `{fileArch}` | `fileArch` |
| `{fileHLD}` | `fileHLD` |
| `{fileSpec}` | `fileSpec` |
| `{development-phase}` | `developmentPhase` |

**Usage examples:**
```bash
cf prompt get P5                    # Task Breakdown prompt, variables resolved
cf prompt get task-breakdown        # same (name match, case-insensitive)
cf prompt get P5 --raw              # unsubstituted template
cf prompt get P5 | pbcopy           # copy to clipboard for next session
```

## Technical Decisions

### Prompt Metadata Derived at Runtime, Not Hardcoded

Phase shorthands, template names, and variable lists must be derived from the prompt asset file at runtime — not baked into the CLI as static lookup tables. The prompt library (`packages/core/assets/prompt.ai-project.system.md`) is actively maintained and the `ai-project-guide` may evolve. A hardcoded table would create a maintenance coupling that breaks silently when phases are added, renamed, or deprecated.

The implementation should parse the prompt file on demand (or cache it at startup) using the same pattern-matching rules (`(Phase n)` / `(Phase n.m)`) described in the command spec. If the prompt library is later split across multiple files, this parsing logic is the one place to update.

This same principle applies to any other metadata derived from guide or config assets: prefer reading from source over duplicating into constants.

### Why commander (not Typer)

Context Forge is a TypeScript monorepo. The CLI must import `@context-forge/core` directly, which is TypeScript/Node.js. A Python CLI (Typer) would require either:
- Calling core via MCP (adds MCP session overhead, defeats the "no intermediary" goal)
- Rebuilding core logic in Python (duplication)

Commander.js gives us the same UX patterns as Typer (subcommands, auto-help, typed options) while staying in the same runtime as core.

### Entry Point

```json
// packages/cli/package.json
{
  "name": "context-forge-cli",
  "bin": {
    "cf": "./dist/index.js"
  }
}
```

After `pnpm install` in the monorepo, `cf` is available in the workspace. For global install: `npm install -g context-forge-cli` (post-publishing).

### Build Configuration

The CLI package compiles to CommonJS targeting Node.js (same as mcp-server). No bundling needed — it's a CLI tool, not a library. `tsconfig.json` extends the workspace root config.

### Output Modes

Two output modes, controlled by `--json`:

- **Terminal (default):** Colorized, table-formatted, human-readable. Uses chalk for colors, cli-table3 for tables.
- **JSON:** Raw JSON to stdout. For machine consumption and scripting. No colors, no tables.

`cf build` is special: it always outputs raw text (the context prompt), regardless of `--json`. The `--json` flag is not applicable to `build`.

### Error Handling

User-facing errors (project not found, config key invalid, file not found) display a clean message with guidance:

```
Error: Project 'foo' not found.

Available projects:
  context-forge, orchestration, visualizer

Use 'cf project list' to see all projects.
```

Unexpected errors display a brief message and suggest `--verbose` for the full trace (future enhancement; initial version can show the trace).

## Integration Points

### Provides to Other Slices

- **168 Integration Testing (slice 168):** CLI commands are a natural surface for integration testing — invoke `cf status`, verify output.
- **ADP (120-arch, orchestration):** The pipeline executor can call `cf build` as a subprocess to assemble context for each phase. Simpler than maintaining an MCP session.
- **Consistency Checker (slice 166):** The `cf check` command will wire to 166 when complete.

### Consumes from Other Slices

- All 160-band slices (161-165, 167) via `@context-forge/core` imports
- Slice 166 (Consistency Checker) — optional, `cf check` can be stubbed until 166 is complete

## Success Criteria

### Functional Requirements

- `cf --help` displays clean, categorized help output with command descriptions
- `cf <command> --help` displays command-specific help with all options
- `cf status` shows project workflow state matching MCP `workflow_status` output
- `cf next` shows recommended action matching MCP `workflow_next` output
- `cf build` outputs a context prompt to stdout that is identical to MCP `context_build` output
- `cf build --phase task-breakdown` correctly overrides the phase and selects the appropriate prompt template
- `cf config set/get/list` correctly manages persistent configuration
- `cf project list/get/set` correctly manages project state
- `--project` flag overrides `default_project` config on any command
- `--json` produces valid JSON on all read commands
- Error messages are user-friendly with actionable guidance
- `cf prompt list` shows all templates with names and descriptions
- `cf prompt get <phase>` outputs the template with project variables resolved to stdout (raw, pipeable)
- Phase shorthands (`P1`–`P7`) resolve correctly to their templates
- Phase names are matched case-insensitively with hyphens as space equivalents
- `--raw` outputs the unsubstituted template text
- Unresolvable variables are preserved as-is (e.g., `{framework}` stays `{framework}` if not set)

### Technical Requirements

- Package builds and `cf` binary works after `pnpm install`
- Unit tests for each command's core logic (project resolution, option parsing, output formatting)
- Unit tests for `cf prompt get`: variable substitution with fully-populated project data, partial project data (some vars missing — verify pass-through), and `--raw` mode
- Tests use fixture projects (can share fixtures with MCP server tests)
- No dependency on `@modelcontextprotocol/sdk` — CLI is MCP-independent

## Implementation Notes

### Development Approach

Suggested order within this slice:

1. **Package scaffolding** — `package.json`, `tsconfig.json`, build config, `bin` entry, verify `cf --help` works
2. **Project resolution and config commands** — `cf config list/get/set`, `cf project list` — these are needed to set up `default_project` before other commands are useful
3. **Status and next** — `cf status`, `cf next` — validates workflow navigation through CLI
4. **Build** — `cf build` with all override flags — the highest-value command
5. **Remaining commands** — `cf future`, `cf check`, `cf prompt`
6. **Output polish** — Table formatting, color consistency, help text quality

### Testing Strategy

- **Unit tests**: Each command handler tested with mock core services. Verify correct arguments passed to core, correct output formatting.
- **Integration tests**: A small set of tests that use real fixture projects (shared with MCP server test fixtures) to verify end-to-end behavior. `cf build` on a fixture project should produce the same output as the MCP `context_build` tool on the same project.
- **Manual verification**: Side-by-side comparison of CLI output vs. MCP tool output for the same operations. This catches formatting and data discrepancies.

## Additional Notes

**Design decision recorded (20260302):** The original `cf prompts` command (list-only) was expanded into `cf prompt` with two operations: `list` and `get`. The key insight driving this change is that `cf build` and `cf prompt get` serve different workflows:

- **`cf build`** — full context assembly for starting or switching sessions. Heavy payload.
- **`cf prompt get <phase>`** — phase transition within an active session. Outputs just the instruction prompt with project variables substituted. The LLM receiving this prompt sees filenames (e.g., `user/slices/168-slice.cli-foundation.md`) and pulls the files it needs. No file content inlined.

This distinction makes `cf prompt get P5` the natural tool for moving from design to task breakdown mid-session, without rebuilding the full context.

**Prompt template source:** `packages/core/assets/prompt.ai-project.system.md` (v0.13.0). Phase shorthands P1–P7 are auto-derived from headings matching `(Phase n)`. Task Breakdown Supplement and Task Expansion use `Supplement:` / `Variant:` prefix notation and have no shorthands.

**Variable substitution:** The prompt file template variables may need minor updates (e.g., ensuring `{task-file}` and `{fileArch}` match the canonical variable names used in the prompt templates). This should be verified during implementation.