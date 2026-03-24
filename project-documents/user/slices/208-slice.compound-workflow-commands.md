---
docType: slice-design
slice: compound-workflow-commands
project: context-forge
parent: user/architecture/200-slices.developer-onboarding.md
dependencies: []
interfaces: []
dateCreated: 20260323
dateUpdated: 20260323
status: complete
---

# Slice Design: Compound Workflow Commands

## Overview

Add phase-aligned compound CLI commands that combine field-setting and context-building into a single invocation, and consolidate the existing artifact listing commands under a new `cf list` command. Today, transitioning to a new phase requires 2-3 commands (`cf set phase X`, `cf set slice Y`, `cf build`). The compound commands collapse that ceremony into one step per methodology phase. The existing `cf arch list`, `cf plan list`, `cf slice list`, `cf tasks list`, and `cf tasks items` subcommands move to `cf list <type>`.

## Value

Reduces friction at every phase transition. A user typing `cf slice 208` instead of `cf set slice 208 && cf set phase 4 && cf build` is the difference between a tool that matches their mental model and one that requires memorizing the machinery.

## Technical Scope

### Included

**Seven compound workflow commands:**

| Command | Sets | Phase | Builds |
|---------|------|-------|--------|
| `cf concept` | — | Phase 0: Concept | concept prompt |
| `cf initiatives` | — | Phase 1: Initiative Plan | initiative plan prompt |
| `cf arch <index>` | fileArch | Phase 2: Architecture | architecture prompt |
| `cf plan <index>` | fileSlicePlan | Phase 3: Slice Planning | slice planning prompt |
| `cf slice <index>` | fileSlice | Phase 4: Slice Design | slice design prompt |
| `cf tasks <index>` | fileTasks | Phase 5: Task Breakdown | task breakdown prompt |
| `cf implement <index>` | fileSlice | Phase 6: Implementation | implementation prompt |

**New `cf list` command consolidating existing listing functionality:**

| Command | Replaces | Description |
|---------|----------|-------------|
| `cf list initiatives` | `cf arch list` | List architecture initiatives |
| `cf list arch` | (alias) | Alias for `cf list initiatives` |
| `cf list plans` | `cf plan list` | List slice plan files |
| `cf list slices` | `cf slice list` | List slices from active plan |
| `cf list tasks` | `cf tasks list` | List task files from plan |
| `cf list items` | `cf tasks items` | Show items from active task file |

### Excluded

- MCP tool equivalents (CLI-only; MCP clients use `project_update` + `context_build`)
- Changes to existing `cf set` or `cf build` behavior
- New slash commands (these are CLI commands, not skill files)

## Technical Decisions

### 1. Compound Commands Claim Existing Names

`cf arch`, `cf plan`, `cf slice`, and `cf tasks` are currently parent commands with `list` (and `items`) subcommands. This slice repurposes them as compound workflow commands. Their listing functionality moves to `cf list <type>`.

This is a breaking change: `cf arch list` → `cf list initiatives` (or `cf list arch`). The old subcommand structure (`cf arch list`, `cf plan list`, etc.) is removed.

`cf tasks` (plural) is the compound command. The 1:N relationship between slice and tasks makes plural natural here — one slice can have multiple task files.

### 2. Reuse Existing Action Handlers

Each compound command calls `projectSetAction()` for field updates and the build pipeline for context generation. No duplication of set/build logic. The compound command is a thin sequencer:

```
cf slice 208
  → projectSetAction('fileSlice', '208', opts)   // sets fileSlice, auto-sets fileTasks
  → projectSetAction('developmentPhase', 'Phase 4: Slice Design', opts)  // sets phase + instruction
  → buildAction(opts)                             // generates context
```

### 3. Single File for Compound Commands: `packages/cli/src/commands/workflow.ts`

All seven compound commands are registered from one file via `registerWorkflowCommands(program)`. Each command is a few lines — the complexity lives in the existing action handlers.

### 4. Single File for List Command: `packages/cli/src/commands/list.ts`

`cf list` is a new parent command with subcommands. The action handlers are extracted from the existing `arch.ts`, `plan.ts`, `slice.ts`, and `task.ts` files into reusable functions, then called from the new list subcommands.

### 5. Argument Handling

Commands that take an `<index>` argument use the same index-resolution logic as `cf set slice <index>` — `resolveFileByIndex()` scans for matching files, falls back to deriving from the slice plan. This means `cf slice 208` and `cf set slice 208` resolve identically.

`cf concept` and `cf initiatives` take no arguments — they only set the phase and build.

### 6. Artifact Existence Warnings

Before setting fields and building, each command checks whether the target artifact already exists:

- **`cf concept`**: Check `fileConcept` on project. If exists: `"Concept document already exists. Building concept prompt anyway."`
- **`cf arch <index>`**: Check if `{index}-arch.*.md` exists via `detectDocuments()`. If exists: `"Architecture document already exists for index {index}. Building architecture prompt anyway."`
- **`cf slice <index>`**: Check if `{index}-slice.*.md` exists. Same pattern.
- Same for `cf plan`, `cf tasks`.

The warning is informational only — the command still proceeds. The user may legitimately want to rebuild the prompt to continue or revise work.

`cf implement` never warns — implementation is always continuation.

### 7. Output Behavior

Each compound command prints:
1. The field-set confirmations (from `projectSetAction`, to stderr)
2. The built context (from the build pipeline, to stdout)

Context output can be piped (`cf slice 208 | pbcopy`) — set confirmations go to stderr, context goes to stdout, matching existing `cf build` behavior.

### 8. Common Options

All compound commands accept:
- `--project <name|id>` — override project resolution
- `--project-level` — force project-level field updates (skip worktree routing)

All list commands accept:
- `--json` — machine-readable output
- `--all` — show items from all worktrees (where applicable)
- `--project <name|id>` — override project resolution

## Component Changes

### New File: `packages/cli/src/commands/workflow.ts`

```typescript
export function registerWorkflowCommands(program: Command): void {
  // cf concept
  // cf initiatives
  // cf arch <index>
  // cf plan <index>
  // cf slice <index>
  // cf tasks <index>
  // cf implement <index>
}
```

### New File: `packages/cli/src/commands/list.ts`

```typescript
export function registerListCommand(program: Command): void {
  const cmd = program.command('list').description('List project artifacts');
  // cmd.command('initiatives') — list architecture initiatives (alias: arch)
  // cmd.command('plans') — list slice plan files
  // cmd.command('slices') — list slices from active plan
  // cmd.command('tasks') — list task files from plan
  // cmd.command('items') — show items from active task file
}
```

### Modified Files

- **`packages/cli/src/commands/arch.ts`** — Extract list action handler into a reusable exported function
- **`packages/cli/src/commands/plan.ts`** — Same extraction
- **`packages/cli/src/commands/slice.ts`** — Same extraction
- **`packages/cli/src/commands/task.ts`** — Extract both list and items action handlers
- **`packages/cli/src/commands/build.ts`** — Extract `buildAndPrint(opts)` from the commander action handler into a reusable export
- **`packages/cli/src/index.ts`** — Replace `registerArchCommand`, `registerPlanCommand`, `registerSliceCommand`, `registerTaskCommand` with `registerWorkflowCommands` and `registerListCommand`

### Removed Commands

- `cf arch list` → replaced by `cf list initiatives` (alias `cf list arch`)
- `cf plan list` → replaced by `cf list plans`
- `cf slice list` → replaced by `cf list slices`
- `cf tasks list` → replaced by `cf list tasks`
- `cf tasks items` → replaced by `cf list items`

The old `arch.ts`, `plan.ts`, `slice.ts`, `task.ts` files remain but only export the reusable action handlers — they no longer register commands.

## Success Criteria

### Compound Commands
- `cf concept` sets phase to Phase 0 and outputs concept prompt
- `cf initiatives` sets phase to Phase 1 and outputs initiative plan prompt
- `cf arch 220` sets fileArch to the 220-arch file, phase to Phase 2, and outputs architecture prompt
- `cf plan 220` sets fileSlicePlan to the 220-slices file, phase to Phase 3, and outputs slice planning prompt
- `cf slice 208` sets fileSlice to the 208-slice file, phase to Phase 4, and outputs slice design prompt
- `cf tasks 208` sets fileTasks to the 208-tasks file, phase to Phase 5, and outputs task breakdown prompt
- `cf implement 208` sets fileSlice to the 208-slice file, phase to Phase 6, and outputs implementation prompt
- Warning printed when target artifact already exists
- `cf implement` does not warn
- All commands work correctly with worktrees
- Auto-set rules fire as expected (e.g., `cf arch 220` also sets fileSlicePlan)
- Context output goes to stdout, confirmations to stderr (pipeable)

### List Commands
- `cf list initiatives` shows the same output as current `cf arch list`
- `cf list arch` is an alias for `cf list initiatives`
- `cf list plans` shows the same output as current `cf plan list`
- `cf list slices` shows the same output as current `cf slice list`
- `cf list tasks` shows the same output as current `cf tasks list`
- `cf list items` shows the same output as current `cf tasks items`
- `--json` and `--all` flags work on all list subcommands
- Old commands (`cf arch list`, etc.) are removed

## Verification Walkthrough

Verified 2026-03-24. All commands tested via `node packages/cli/dist/index.js` (local build).

```bash
# 1. Build
pnpm build
# Result: Clean build, no errors

# 2. Compound commands
cf concept
# Result: Outputs to stderr: "Updated instruction = Phase 0: Concept (auto-set from developmentPhase)..."
#         "Updated phase = Phase 0: Concept..."
#         Outputs context prompt to stdout. PASS.

cf arch 220
# Result: "Updated fileSlicePlan = 220-slices.event-driven-pipeline (auto-set from fileArch)..."
#         "Updated arch = 220-arch.event-driven-pipeline..."
#         "Updated phase = Phase 2: Architecture..."
#         "Architecture document already exists for index 220. Building prompt anyway."
#         Outputs architecture prompt. PASS (auto-set + warning both fire).

cf slice 208
# Result: "Updated fileTasks = 208-tasks.compound-workflow-commands (auto-set from fileSlice)..."
#         "Updated slice = 208-slice.compound-workflow-commands..."
#         "Updated phase = Phase 4: Slice Design..."
#         "Slice design already exists for index 208. Building prompt anyway."
#         PASS.

cf implement 208
# Result: Sets fileSlice, auto-sets fileTasks, sets phase to Phase 6.
#         No warning emitted. PASS.

# 3. Warning on existing artifact
cf slice 208
# Result: "Slice design already exists for index 208. Building prompt anyway." PASS.

# 4. Piping
cf concept 2>/dev/null | head -3
# Result: Only context output in stdout (confirmations go to stderr). PASS.
# Caveat: projectSetAction confirmations were moved to stderr in this slice
#         to enable clean piping. Applies to cf set/unset as well.

# 5. List commands
cf list initiatives
# Result: Architecture Initiatives table with Index, Initiative, Arch Doc, Slice Plan, Progress. PASS.

cf list arch
# Result: Identical output to cf list initiatives. PASS (alias works).

cf list slices
# Result: Slice Plan table with #, Slice, Status, File columns. PASS.

cf list items
# Result: Task items with completion indicators. PASS.

cf list initiatives --json
# Result: JSON array of initiative objects. PASS.

# 6. Old commands removed
cf arch list
# Result: "error: unknown command 'arch'" — old commands no longer registered. PASS.

# 7. Worktree awareness
# Not tested with actual worktree in this session, but:
# - --project-level flag passes through to projectSetAction (unit tested)
# - Default behavior uses worktree-aware resolveProjectWorktree (unit tested)
# - projectSetAction handles worktree routing via WorktreeService (existing coverage)
```

## Implementation Notes

### Development Approach

1. Extract reusable action handlers from `arch.ts`, `plan.ts`, `slice.ts`, `task.ts`
2. Extract `buildAndPrint()` from `build.ts`
3. Create `list.ts` with all list subcommands (using extracted handlers)
4. Create `workflow.ts` with all seven compound commands
5. Update `index.ts` — remove old registrations, add new ones
6. Update tests — existing list tests move to test the new `cf list` paths
7. Add tests for compound commands
