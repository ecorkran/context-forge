---
docType: slice-design
slice: workflow-navigator
project: context-forge
parent: user/architecture/160-slices.project-workflow-system.md
dependencies: [163-artifact-introspection-engine, 164-mcp-introspection-tools]
interfaces: [120-arch-automated-dev-pipeline]
dateCreated: 20260307
dateUpdated: 20260307
status: complete
---

# Slice Design: Workflow Navigator & Discovery

## Overview

Add a core `WorkflowNavigator` service that computes methodology position and next-action recommendations, expose it via two MCP tools (`workflow_status`, `workflow_next`), add three CLI discovery commands (`cf slice list`, `cf task list`, `cf arch list`), auto-set `fileTasks` when `fileSlice` changes, and enhance existing `cf status` / `cf next` commands to use the navigator.

## Value

The capstone of the 160-band initiative. Answers "where am I?" and "what should I do next?" for both humans resuming work after a break and agents that need to self-orient. Discovery commands eliminate the need to manually scan `project-documents/` directories. Auto-set tasks removes a repetitive manual step. Directly addresses the cognitive load and stall problems described in the architecture document.

## Technical Scope

### Included

- `WorkflowNavigator` service in `packages/core/src/introspection/` with `getStatus()` and `getNext()` methods
- `workflow_status` and `workflow_next` MCP tools in `packages/mcp-server/src/tools/workflowTools.ts`
- CLI commands: `cf slice list`, `cf task list`, `cf arch list`
- Auto-set `fileTasks` when `fileSlice` is set (one-way)
- Enhanced `cf status` with slice plan progress inline
- Enhanced `cf next` wired to `WorkflowNavigator.getNext()`
- Config key: `workflow.auto_advance` (whether completing a slice auto-advances — stored only, behavior deferred)
- Unit tests for all new components

### Excluded

- Automatic slice advancement execution (this slice *reports* the recommendation; execution is the consumer's job)
- Write-back/fix capabilities (that's slice 166, Consistency Checker)
- Cross-project status aggregation (`workflow_status_all` — future work)
- `workflow.auto_advance` behavior implementation (key registered, behavior deferred to future slice)

## Dependencies

### Prerequisites

- **Slice 163** (Artifact Introspection Engine) — `ArtifactIntrospector`, all parsers, `SlicePlanResult`, `TaskFileResult`, `DocumentDetectionResult`
- **Slice 164** (MCP Introspection Tools) — `ProjectModelBuilder` for `cf arch list` and initiative-level status
- **Slice 162** (Config System) — `ConfigManager` for `workflow.auto_advance` key, `resolveProjectId` for MCP tools

### Interfaces Required

- `ArtifactIntrospector` from `@context-forge/core/node` — slice plan parsing, task parsing, document detection
- `ProjectModelBuilder` from `@context-forge/core/node` — initiative grouping for `cf arch list` and project-wide status
- `FileProjectStore` from `@context-forge/core/node` — project data access
- `ConfigManager` from `@context-forge/core/node` — config key registration
- `resolveFileByIndex` from `@context-forge/core/node` — task file auto-resolution

## Architecture

### Component Structure

```
packages/core/src/introspection/
  WorkflowNavigator.ts          ← NEW: core service
  types.ts                      ← MODIFY: add WorkflowStatus, NextAction types

packages/mcp-server/src/tools/
  workflowTools.ts              ← MODIFY: add workflow_status, workflow_next

packages/cli/src/commands/
  slice.ts                      ← NEW: cf slice list
  task.ts                       ← NEW: cf task list
  arch.ts                       ← NEW: cf arch list
  status.ts                     ← MODIFY: enhanced with slice plan progress
  next.ts                       ← MODIFY: wire to WorkflowNavigator
  project.ts                    ← MODIFY: auto-set fileTasks on fileSlice change

packages/cli/src/index.ts       ← MODIFY: register new commands
```

### Data Flow

**`getStatus()`:**
```
ProjectData (stored fields)
  + ArtifactIntrospector.summarize(project)  → IntrospectionSummary
  + ArtifactIntrospector.parseSlicePlan()    → SlicePlanResult (if fileSlicePlan set)
  + ArtifactIntrospector.parseTaskFile()     → TaskFileResult (if fileTasks set)
  + detectDocuments(projectPath, sliceIndex) → DocumentDetectionResult
  = WorkflowStatus
```

**`getNext()`:**
```
WorkflowStatus (from getStatus)
  → State machine evaluation:
    1. Has tasks? Are they incomplete? → "Continue current tasks"
    2. Tasks complete? → "Advance to next phase or slice"
    3. Active slice needs design? → "Create slice design"
    4. Active slice needs tasks? → "Create task breakdown"
    5. All slices in plan complete? → "Plan complete — check architecture"
    6. No slice plan? → "Set up slice plan"
  = NextAction { recommendation, rationale, suggestedCommand? }
```

**`cf slice list`:**
```
resolveProjectId → ProjectData
  → resolve fileSlicePlan path
  → ArtifactIntrospector.parseSlicePlan(path)
  → for each entry: check if slice design file exists (documentDetector)
  → render table with active/next indicators
```

**`cf arch list`:**
```
resolveProjectId → ProjectData
  → ProjectModelBuilder.buildModel(projectPath)
  → iterate model.initiatives
  → render table with index range, arch doc, slice plan, completion
```

## Technical Decisions

### WorkflowNavigator as Stateless Service

`WorkflowNavigator` takes a `ProjectData` and computes status on demand. No constructor state, no caching. Each call reads current disk state via `ArtifactIntrospector`. This follows the architecture principle of "read-heavy, write-light" — the source of truth is always the artifacts on disk.

```typescript
class WorkflowNavigator {
  private introspector = new ArtifactIntrospector();

  async getStatus(project: ProjectData): Promise<WorkflowStatus>;
  async getNext(project: ProjectData): Promise<NextAction>;
}
```

### Slice Status Derivation

For the active slice, determine its phase by checking what artifacts exist:

| Condition | Derived Status |
|-----------|---------------|
| No slice design file exists | `needs-design` |
| Slice design exists, no task file | `needs-tasks` |
| Task file exists, tasks incomplete | `in-implementation` |
| Task file exists, all tasks complete | `complete` |
| No fileSlice set | `no-active-slice` |

This uses `ArtifactIntrospector.detectDocuments()` to check file existence and `parseTaskFile()` for completion state.

### Next Action State Machine

`getNext()` evaluates conditions in priority order:

1. **No projectPath** → "Set projectPath to enable workflow navigation"
2. **No fileSlice** → "Set active slice with `cf set slice <index>`"
3. **Active slice needs design** → "Create slice design (Phase 4)"
4. **Active slice needs tasks** → "Create task breakdown (Phase 5)"
5. **Active slice has incomplete tasks** → "Continue implementation — N tasks remaining"
6. **Active slice tasks complete** → Check slice plan for next unstarted slice:
   - Next slice found → "Advance to slice NNN: {name}. Run `cf set slice NNN`"
   - No next slice, plan exists → "Slice plan complete. Review architecture for next initiative"
7. **No slice plan** → "Create or assign a slice plan with `cf set plan <index>`"

Each recommendation includes a `suggestedCommand` string (e.g., `cf set slice 166`) that a human or agent can execute directly.

### Auto-Set Tasks on Slice Change

When `projectSetAction()` processes a `fileSlice` change:

1. Extract the numeric index from the resolved value (regex: `/^(\d+)-/`)
2. Call `resolveFileByIndex(projectPath, 'fileTasks', index)` to find matching task file(s)
3. If exactly one match, auto-set `fileTasks` alongside `fileSlice` in the same `store.update()` call
4. Print confirmation: `Updated tasks = {resolved} (auto-set from slice)`
5. If no match or multiple matches, silently skip (no error — task file may not exist yet)

This is one-way: setting `fileTasks` does NOT auto-set `fileSlice`.

Hook location: `packages/cli/src/commands/project.ts` in `projectSetAction()`, after index-based resolution (line ~159), before the `store.update()` call (line ~170).

The same auto-set logic should apply in the MCP `project_update` tool when `fileSlice` is updated. Add to `packages/mcp-server/src/tools/projectTools.ts`.

### CLI Discovery Command Design

All three discovery commands follow the same pattern:
- Resolve project via `resolveProjectId`
- Parse relevant artifact(s)
- Render a borderless table using `renderTable()`
- Support `--json` for machine-readable output
- Support `--project <id>` for explicit project selection

#### `cf slice list`

Parses the active `fileSlicePlan` (resolved against `projectPath`). Output format:

```
Slice Plan: 160-slices.project-workflow-system

  #    Slice                            Status        File
  ───  ───────────────────────────────  ────────────  ──────────────────────
  161  project-schema-standardization   ✓ complete    161-slice.project-sc…
  162  config-system                    ✓ complete    162-slice.config-sys…
  163  artifact-introspection-engine    ✓ complete    163-slice.artifact-i…
  164  mcp-introspection-tools          ✓ complete    164-slice.mcp-intros…
  165  workflow-navigator               ○ not started 165-slice.workflow-n…  ← active
  166  consistency-checker              ○ not started —
  167  future-work-collector            ✓ complete    167-slice.future-wor…
```

Status indicators: `✓` (green) for complete, `○` for not started, `◐` for in-progress.

The "active" indicator (`← active`) marks the slice matching `project.fileSlice`. If no slice matches the active one, the first unchecked slice gets `← next`.

File column: truncated slice design filename from `detectDocuments()`, or `—` if no design file exists.

Command: `cf slice list` (not `cf slice` alone — leaves room for future subcommands like `cf slice set`).

#### `cf task list`

Parses the active `fileTasks` (resolved against `projectPath`). Output format:

```
Tasks: 165-tasks.workflow-navigator  (7/12 complete)

  ✓  Define WorkflowStatus and NextAction types
  ✓  Implement WorkflowNavigator.getStatus()
  ✓  Implement WorkflowNavigator.getNext()
  ○  Add workflow_status MCP tool
  ○  Add workflow_next MCP tool
  ○  Implement cf slice list
  ...
```

Uses `parseTaskFile()` which returns `TaskItem[]` with `{ name, done }`. Top-level items only (matches existing parser behavior — it captures all checkbox items including sub-items, but indentation is not distinguished).

Progress summary in header: `(N/M complete)`.

#### `cf arch list`

Uses `ProjectModelBuilder.buildModel()` for project-wide view. Output format:

```
Initiatives

  Index   Initiative                  Arch Doc                    Slice Plan                        Progress
  ──────  ────────────────────────    ──────────────────────────  ──────────────────────────────    ────────
  140     context-forge-restructure   140-arch.context-forge-re…  140-slices.context-forge-rest…    5/5
  160     project-workflow-system     160-arch.project-workflow…  160-slices.project-workflow-s…    5/7  ← active
  780     guide-management            —                           780-slices.future.guide-manag…    0/2
```

The "active" indicator marks the initiative containing the active slice (by index band).

Progress: `completed/total` slices from the initiative's slice plan.

### Enhanced `cf status`

Add slice plan progress detail when `fileSlicePlan` is set. Current output already shows a basic summary via `introspection.slicePlan`. Enhance to show:

```
Project:  context-forge  (from CWD)
Phase:    Phase 6: Implementation
Slice:    165-slice.workflow-navigator
Tasks:    165-tasks.workflow-navigator
Progress: 7/12 tasks (in-progress)

Slice Plan: 160-slices.project-workflow-system
  5/7 slices complete
```

This is a minor enhancement — the current code already does most of this. The main change is ensuring the slice plan summary is always shown when available.

### Enhanced `cf next`

Replace the provisional `deriveRecommendation()` function with `WorkflowNavigator.getNext()`. The output format stays the same:

```
Next:      Continue implementation — 5 tasks remaining
Slice:     165-slice.workflow-navigator
Phase:     Phase 6: Implementation
Rationale: 5 of 12 tasks remaining in 165-tasks.workflow-navigator.
```

But the recommendations are now richer because the navigator considers slice plan state, not just task completion.

### Config Key Registration

Register `workflow.auto_advance` in `ConfigKeys` (`packages/core/src/config/ConfigKeys.ts`):

```typescript
'workflow.auto_advance': {
  description: 'Auto-advance to next slice when current is complete',
  type: 'boolean',
  default: 'false',
}
```

This key is stored and queryable but its behavior is not implemented in this slice. It's a placeholder for a future slice that implements automatic advancement.

## API Contracts

### MCP Tools

#### `workflow_status`

| Field | Type | Description |
|-------|------|-------------|
| **Input** | | |
| `projectId` | string? | Project ID. Omit to use default_project. |
| **Output** | `WorkflowStatus` | |
| `.project` | string | Project name |
| `.phase` | string \| null | Current development phase |
| `.activeSlice` | object \| null | `{ name, index, status, taskProgress? }` |
| `.activeSlice.status` | string | `needs-design` \| `needs-tasks` \| `in-implementation` \| `complete` \| `no-active-slice` |
| `.activeSlice.taskProgress` | object? | `{ completed, total, inferredStatus }` |
| `.slicePlan` | object \| null | `{ name, completed, total, entries[] }` |
| `.summary` | string | Human-readable one-line status |

#### `workflow_next`

| Field | Type | Description |
|-------|------|-------------|
| **Input** | | |
| `projectId` | string? | Project ID. Omit to use default_project. |
| **Output** | `NextAction` | |
| `.recommendation` | string | What to do next |
| `.rationale` | string | Why this is the recommended action |
| `.suggestedCommand` | string? | CLI command to execute (e.g., `cf set slice 166`) |
| `.slice` | string? | Relevant slice name |
| `.phase` | string? | Relevant phase |
| `.summary` | string | Human-readable one-line recommendation |

### Core Types

```typescript
interface SliceStatus {
  name: string;
  index: number | null;
  status: 'needs-design' | 'needs-tasks' | 'in-implementation' | 'complete' | 'no-active-slice';
  taskProgress?: {
    completed: number;
    total: number;
    inferredStatus: NormalizedStatus;
  };
}

interface WorkflowStatus {
  project: string;
  phase: string | null;
  activeSlice: SliceStatus | null;
  slicePlan: {
    name: string;
    completed: number;
    total: number;
    entries: SlicePlanEntry[];
  } | null;
  summary: string;
}

interface NextAction {
  recommendation: string;
  rationale: string;
  suggestedCommand?: string;
  slice?: string;
  phase?: string;
  summary: string;
}
```

## Integration Points

### Provides to Other Slices

- **ADP (120-arch, orchestration project)**: `workflow_status` and `workflow_next` MCP tools provide the structured data ADP needs to determine project state and dispatch agents
- **Slice 166 (Consistency Checker)**: Can consume `WorkflowNavigator.getStatus()` to compare computed status vs. declared status
- **CLI slash commands**: New `cf:slice`, `cf:task`, `cf:arch` slash commands can be added trivially (follows pattern from slice 174)

### Consumes from Other Slices

- **Slice 163**: `ArtifactIntrospector` — all parsing operations
- **Slice 164**: `ProjectModelBuilder` — initiative grouping for `cf arch list`
- **Slice 162**: `ConfigManager` for config key, `resolveProjectId` for MCP tools

## Success Criteria

### Functional Requirements

- `WorkflowNavigator.getStatus()` returns accurate methodology position for projects at various stages (no slices, partial completion, all complete)
- `WorkflowNavigator.getNext()` recommends correct next action across the full state machine (needs design → needs tasks → needs implementation → slice complete → next slice → plan complete)
- `workflow_status` MCP tool returns structured JSON matching `WorkflowStatus` type
- `workflow_next` MCP tool returns structured JSON matching `NextAction` type
- `cf slice list` shows all slices from active plan with status indicators and file references
- `cf task list` shows tasks from active task file with completion counts
- `cf arch list` shows all initiatives with index ranges, arch docs, slice plans, and completion
- `cf set slice 165` auto-resolves and sets `fileTasks` to matching `165-tasks.*` file
- Auto-set tasks works in both CLI (`cf set slice`) and MCP (`project_update`)
- `cf status` shows slice plan progress inline when plan is available
- `cf next` uses `WorkflowNavigator.getNext()` instead of provisional logic
- All commands handle edge cases: empty projects, no slice plan, no tasks, missing projectPath
- All commands work with `default_project` config (no project ID needed if default is set)

### Technical Requirements

- `WorkflowNavigator` has comprehensive unit tests covering all state machine paths
- CLI commands have unit tests matching existing patterns (mocked store/introspector)
- MCP tools have unit tests using InMemoryTransport + Client pattern
- Auto-set tasks has unit tests for both CLI and MCP paths
- All existing tests continue to pass
- Full build clean across all packages
- No new npm dependencies

## Implementation Notes

### Development Approach

Suggested order:

1. **Types**: Add `WorkflowStatus`, `NextAction`, `SliceStatus` to `packages/core/src/introspection/types.ts`
2. **WorkflowNavigator**: Implement `getStatus()` and `getNext()` with tests
3. **Auto-set tasks**: Hook into `projectSetAction()` and `project_update` MCP tool, with tests
4. **CLI discovery commands**: `cf slice list`, `cf task list`, `cf arch list`, with tests
5. **MCP tools**: `workflow_status`, `workflow_next` in `workflowTools.ts`, with tests
6. **Enhanced commands**: Update `cf status` and `cf next`, with test updates
7. **Config key**: Register `workflow.auto_advance` in ConfigKeys
8. **Build and verify**: Full build, all tests pass

### Testing Strategy

- **WorkflowNavigator**: Mock `ArtifactIntrospector` to test state machine logic in isolation. Test each state transition: no project path, no slice, needs design, needs tasks, in implementation, complete, plan complete.
- **CLI commands**: Mock `FileProjectStore` and `ArtifactIntrospector`/`ProjectModelBuilder`. Capture console output with `vi.spyOn(console, 'log')`. Test both human-readable and `--json` output.
- **MCP tools**: InMemoryTransport + Client pattern matching existing tests. Mock core services.
- **Auto-set tasks**: Test in `projectSetAction` with mocked store and `resolveFileByIndex`. Verify `fileTasks` is set alongside `fileSlice`. Verify no error when task file doesn't exist.

### File Summary

| File | Action | Description |
|------|--------|-------------|
| `packages/core/src/introspection/types.ts` | Modify | Add WorkflowStatus, NextAction, SliceStatus types |
| `packages/core/src/introspection/WorkflowNavigator.ts` | Create | Core service with getStatus() and getNext() |
| `packages/core/src/introspection/index.ts` | Modify | Export new types |
| `packages/core/src/node.ts` | Modify | Export WorkflowNavigator |
| `packages/core/src/config/ConfigKeys.ts` | Modify | Add workflow.auto_advance key |
| `packages/core/tests/introspection/WorkflowNavigator.test.ts` | Create | Unit tests |
| `packages/cli/src/commands/slice.ts` | Create | cf slice list |
| `packages/cli/src/commands/task.ts` | Create | cf task list |
| `packages/cli/src/commands/arch.ts` | Create | cf arch list |
| `packages/cli/src/commands/project.ts` | Modify | Auto-set fileTasks on fileSlice change |
| `packages/cli/src/commands/status.ts` | Modify | Enhanced slice plan display |
| `packages/cli/src/commands/next.ts` | Modify | Wire to WorkflowNavigator |
| `packages/cli/src/index.ts` | Modify | Register new commands |
| `packages/cli/tests/slice.test.ts` | Create | CLI tests |
| `packages/cli/tests/task.test.ts` | Create | CLI tests |
| `packages/cli/tests/arch.test.ts` | Create | CLI tests |
| `packages/cli/tests/next.test.ts` | Modify | Update for WorkflowNavigator |
| `packages/mcp-server/src/tools/workflowTools.ts` | Modify | Add workflow_status, workflow_next |
| `packages/mcp-server/src/tools/projectTools.ts` | Modify | Auto-set fileTasks in project_update |
| `packages/mcp-server/tests/workflowTools.test.ts` | Modify | Add tests for new tools |
| `packages/mcp-server/tests/projectTools.test.ts` | Modify | Test auto-set behavior |
