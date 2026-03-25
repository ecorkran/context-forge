---
docType: slice-design
slice: ai-agent-consumption-interface
project: context-forge
parent: user/architecture/200-slices.developer-onboarding.md
dependencies: [208]
interfaces: []
dateCreated: 20260324
dateUpdated: 20260324
status: not_started
---

# Slice Design: AI-Agent Consumption Interface

## Overview

Context Forge is increasingly consumed by AI agents (e.g., Squadron) that call the CLI or MCP server programmatically. Today, agents discover commands through hardcoded strings, parse human-readable error messages, and have no way to detect breaking changes. When we renamed `cf slice list` to `cf list slices` in slice 208, it broke Squadron — not because the rename was wrong, but because there's no machine-readable contract for agents to discover commands at runtime.

This slice makes Context Forge a first-class tool for AI agents by adding: a machine-readable command catalog, structured JSON errors, a version introspection endpoint, an MCP tool for pure-machine consumers, and an idempotency audit.

## Motivation

The multi-agent ecosystem is growing rapidly. Context Forge's MCP server already provides good discoverability (MCP has built-in tool schemas), but the CLI is a blind spot. Agents that shell out to `cf` have no reliable way to:

1. Discover what commands exist and what arguments they take
2. Distinguish between "command failed" and "command doesn't exist"
3. Detect that their cached knowledge of the CLI is stale

Additionally, the MCP `agent_guide` and `agent_onboard` tools are designed for human-supervised agents. A pure-machine consumer (an orchestrator, a CI pipeline, another MCP client) needs a schema, not a walkthrough.

## Design

### 1. Machine-Readable Command Catalog: `cf help --json`

Add a `--json` flag to the top-level `cf help` that outputs a structured command catalog.

**Output schema:**

```json
{
  "version": "0.6.22",
  "commands": [
    {
      "name": "build",
      "description": "Generate and output a context prompt to stdout",
      "args": [],
      "options": [
        { "flag": "--project <id>", "description": "Project ID or name" },
        { "flag": "--phase <phase>", "description": "Override development phase" },
        { "flag": "--slice <slice>", "description": "Override slice name" }
      ],
      "subcommands": []
    },
    {
      "name": "list",
      "description": "List project artifacts",
      "args": [],
      "options": [],
      "subcommands": [
        {
          "name": "projects",
          "description": "List all projects",
          "args": [],
          "options": [
            { "flag": "--json", "description": "Output as JSON" }
          ]
        }
      ]
    },
    {
      "name": "slice",
      "description": "Set active slice and build prompt",
      "args": [{ "name": "index", "required": true, "description": "Numeric slice index" }],
      "options": [
        { "flag": "--project <name|id>", "description": "Project name or ID" }
      ],
      "subcommands": []
    }
  ]
}
```

**Implementation approach:** Commander.js exposes the command tree via `program.commands`. Walk the tree recursively, extracting name, description, arguments (with required flag), options, and subcommands. Output via `printJson`. No manual catalog maintenance — it's always in sync with the actual registered commands.

**Key detail:** The catalog is generated from Commander's runtime state, not a static file. If a command is added or renamed, the catalog reflects it immediately. This is the core contract agents should rely on.

### 2. Version Introspection: `cf version --json`

Extend the existing `cf --version` (or add `cf version`) to support `--json` output with metadata beyond the version string.

**Output schema:**

```json
{
  "name": "@context-forge/cli",
  "version": "0.6.22",
  "guideVersion": "0.14.1",
  "breaking": []
}
```

- `version`: current CLI version
- `guideVersion`: installed ai-project-guide version (from `guide_status` logic), or `null` if not installed
- `breaking`: array of breaking change descriptors since the last minor version bump. Populated from a static array in the codebase that we maintain when making breaking changes. Example: `[{ "since": "0.6.22", "change": "cf slice list → cf list slices" }]`

The `breaking` array is the cache-invalidation signal. An agent that cached "cf slice list" can call `cf version --json`, see that there's a breaking change, and re-fetch the command catalog via `cf help --json`.

**Implementation:** Register a `version` subcommand (or hook into Commander's `.version()` mechanism). The breaking changes array is a simple constant in the CLI source — we update it when making breaking changes and clear it on minor version bumps.

### 3. Structured JSON Errors

When `--json` is passed (or detectable from the calling context), errors should be structured JSON on stderr instead of plain text.

**Error schema:**

```json
{
  "error": true,
  "code": "INVALID_ARGUMENT",
  "message": "'cf slice' requires a numeric index, got 'banana'.",
  "suggestion": "Use: cf slice <index>  (e.g. cf slice 200)"
}
```

**Error codes** (defined as an enum/constant):

| Code | Meaning |
|------|---------|
| `PROJECT_NOT_FOUND` | No project matches ID/name/CWD |
| `FIELD_NOT_FOUND` | Unknown field name in set/unset |
| `INVALID_ARGUMENT` | Argument fails validation (e.g., non-numeric index) |
| `INVALID_VALUE` | Value fails field validation |
| `MISSING_CONFIG` | Required configuration not set (projectPath, slicePlan, etc.) |
| `ARTIFACT_NOT_FOUND` | Index doesn't resolve to a file or plan entry |
| `READ_ONLY` | Attempted to set a read-only field |
| `ALREADY_EXISTS` | Duplicate (e.g., project at same path) |

**Implementation approach:**

- Add an `errorCode` property to `UserError`: `new UserError('message', 'INVALID_ARGUMENT')`
- Modify `handleError` to detect JSON mode (via a global flag or env var set when `--json` is parsed) and output structured JSON to stderr when active
- Non-JSON mode unchanged — plain text errors as today
- The `suggestion` field is optional and populated from the second part of existing two-line error messages (which already contain suggestions)

**JSON mode detection:** The simplest approach is a module-level flag (`let jsonMode = false; export function setJsonMode() { jsonMode = true; }`) set during option parsing. This avoids threading a flag through every action handler. An alternative is checking `process.env.CF_JSON=1` for agents that want JSON errors without passing `--json` to every command.

### 4. MCP `agent_quickstart` Tool

A new MCP tool designed for pure-machine consumers (orchestrators, CI pipelines, other agents) that returns a structured capability schema rather than prose instructions.

**Distinct from existing tools:**
- `agent_guide` — prose for human-supervised agents ("call this first, avoid these mistakes")
- `agent_onboard` — step-by-step onboarding recipe for new projects
- `agent_quickstart` — structured schema for machine consumption

**Output schema:**

```json
{
  "server": "@context-forge/mcp",
  "version": "0.6.22",
  "capabilities": {
    "projectManagement": {
      "description": "Create, read, update projects with persistent state",
      "tools": ["project_list", "project_get", "project_create", "project_update"]
    },
    "contextGeneration": {
      "description": "Build structured prompts from project state",
      "tools": ["context_build", "context_summarize", "prompt_list", "prompt_get"]
    },
    "workflowGuidance": {
      "description": "Phase-aware recommendations and consistency checks",
      "tools": ["workflow_next", "workflow_status", "workflow_check"]
    },
    "introspection": {
      "description": "Read project artifacts, slice plans, task state",
      "tools": ["introspection_documents", "introspection_slice_plan", "introspection_tasks"]
    },
    "configuration": {
      "description": "Two-tier config (user + project scope)",
      "tools": ["config_get", "config_set"]
    }
  },
  "quickStart": [
    "Call project_list to find or verify the target project",
    "Call project_get with the project ID for full state",
    "Call workflow_next for the recommended action",
    "Call context_build to generate a session prompt"
  ],
  "cliEquivalents": {
    "project_list": "cf list projects --json",
    "project_get": "cf get --json",
    "workflow_next": "cf next --json",
    "context_build": "cf build"
  }
}
```

**Implementation:** Static structured data returned from the tool handler, similar to `agent_guide` but JSON-structured instead of prose. The `capabilities` object groups tools by intent, letting agents discover just the subset they need. The `cliEquivalents` map bridges MCP and CLI for agents that use both.

### 5. Idempotency Audit

Review all state-mutating commands to ensure repeated calls with the same arguments don't produce warnings, errors, or unexpected side effects.

**Known issues to address:**

| Command | Current behavior | Fix |
|---------|-----------------|-----|
| `cf set slice 208` (already set to 208) | Prints "Updated" — acceptable but could be smarter | Detect no-change, print "slice already set to 208" to stderr, exit 0 |
| `cf set phase P6` (already P6) | Prints "Updated" | Same — detect no-change |

**Approach:** In `projectSetAction`, after resolving the value but before writing, compare with the current value. If unchanged, print a "no change" message to stderr and return without writing. This is a minor UX improvement but matters for agents that retry operations.

### 6. Agent Integration Documentation

Add `docs/AGENT-INTEGRATION.md` documenting the MCP-first integration pattern for agent authors. Link to it from the root README and the MCP package README.

**Note:** `AGENTS.md` is a reserved filename — it's automatically read by Codex, Copilot, Cursor, and other AI tools as "instructions for coding agents working in this repo" (similar to CLAUDE.md). Our document targets *consumers* of Context Forge, not agents working *within* this repo, so it must use a different name.

**Contents:**
- Recommended integration path: MCP server > CLI `--json` > CLI text parsing (in order of preference)
- How to discover commands: `cf help --json`
- How to detect breaking changes: `cf version --json` → check `breaking` array
- Error handling: `--json` mode structured errors, error codes
- Idempotency guarantees
- CLI vs MCP: when to use which (MCP for data operations, CLI for context building and piping)

This is a short document (< 100 lines) targeting AI agent developers, not end users.

### 7. Package README Updates

Update each published package's README to reflect current state. These are the npm landing pages and the first thing a developer (human or AI) sees.

**CLI (`packages/cli/README.md`):**
- Update Quick Start to show `cf init` as single-command setup
- Replace old command names (`cf arch list`, `cf slice list`, etc.) with current names (`cf list initiatives`, `cf list slices`)
- Add compound commands section (`cf concept`, `cf slice 208`, etc.)
- Add v0.6 changelog entry covering compound commands, `cf list`, guides uninstall
- Remove Electron references from Architecture section

**MCP (`packages/mcp-server/README.md`):**
- Add missing tool categories (Workflow: `workflow_status`, `workflow_next`, `workflow_check`; Worktrees: `worktree_*`; Guides: `guide_*`; Meta: `agent_guide`, `agent_onboard`, `server_version`)
- Update Prerequisites to recommend `cf guides install` instead of curl bootstrap
- Remove stale `config_list` reference
- Add link to `docs/AGENT-INTEGRATION.md`

**Core (`packages/core/README.md`):**
- De-emphasize Electron in overview (change "MCP server and Electron desktop app" framing to "MCP server, CLI, and other Node.js consumers")
- Verify export path examples are current

## Data Flow

```
Agent (Squadron, CI, orchestrator)
  │
  ├─ MCP path (preferred)
  │   ├─ agent_quickstart → structured capabilities + quickstart sequence
  │   ├─ tool calls with built-in schema validation
  │   └─ structured JSON responses (already the case)
  │
  └─ CLI path (shell access)
      ├─ cf help --json → command catalog (discovery)
      ├─ cf version --json → version + breaking changes (staleness check)
      ├─ cf <command> --json → structured output
      └─ stderr → structured JSON errors (when --json active)
```

## Cross-Slice Dependencies

- **208 (Compound Workflow Commands)** — Must be stable before exposing the command catalog. The catalog reflects whatever commands are registered, so 208's commands will be included automatically.
- **No downstream blockers** — This slice is additive. No existing behavior changes.

## Success Criteria

1. `cf help --json` returns a complete, accurate command catalog generated from Commander's runtime state
2. `cf version --json` returns version, guide version, and breaking changes array
3. All `UserError` instances carry an error code; `handleError` outputs structured JSON when JSON mode is active
4. `agent_quickstart` MCP tool returns structured capability schema with tool groupings and CLI equivalents
5. `cf set slice 208` when already set to 208 prints "no change" and exits 0 (idempotency)
6. `docs/AGENT-INTEGRATION.md` documents the integration pattern for agent authors (not `AGENTS.md` — that filename is reserved for AI coding tool instructions)
7. CLI, MCP, and core package READMEs updated to reflect current commands and capabilities
8. All existing behavior unchanged when `--json` is not passed

## Verification Walkthrough

*Draft — to be refined during Phase 6 implementation.*

```bash
# 1. Command catalog
cf help --json | jq '.commands | length'
# Result: should show total command count (20+)

cf help --json | jq '.commands[] | select(.name == "slice")'
# Result: shows slice command with args and options

# 2. Version introspection
cf version --json | jq '.'
# Result: { name, version, guideVersion, breaking }

# 3. Structured errors
cf --json set slice banana 2>&1 >/dev/null | jq '.'
# Result: { error: true, code: "INVALID_ARGUMENT", message: "...", suggestion: "..." }

cf --json set slice 999 2>&1 >/dev/null | jq '.'
# Result: { error: true, code: "ARTIFACT_NOT_FOUND", ... }

# 4. MCP agent_quickstart
# Via MCP client:
# Call agent_quickstart → verify structured JSON with capabilities, quickStart, cliEquivalents

# 5. Idempotency
cf set slice 208
# First call: "Updated slice = 208-slice.compound-workflow-commands"
cf set slice 208
# Second call: "slice already set to 208-slice.compound-workflow-commands"
# (no write, exit 0)

# 6. Agent docs
cat docs/AGENT-INTEGRATION.md
# Result: integration guide with MCP-first pattern, discovery, error handling

# 7. Package READMEs
# Verify CLI README shows current commands
grep "cf list" packages/cli/README.md
# Result: references to cf list slices, cf list tasks, etc. (not old cf slice list)

# Verify MCP README shows all tool categories
grep "workflow_status\|agent_guide\|worktree_list" packages/mcp-server/README.md
# Result: all present
```

## Risks

- **Breaking change tracking is manual.** The `breaking` array in the CLI source must be maintained by developers. If someone forgets to add an entry, agents won't know about the change. Mitigated by: adding a note in CLAUDE.md commit guidelines, and keeping the array small (cleared on minor bumps).

## Effort

3/5 — Multiple small features across CLI and MCP, plus documentation and README updates. Each feature is individually simple but there are several touchpoints.
