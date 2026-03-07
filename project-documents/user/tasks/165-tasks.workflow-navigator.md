---
slice: workflow-navigator
project: context-forge
lld: user/slices/165-slice.workflow-navigator.md
dependencies: [163-artifact-introspection-engine, 164-mcp-introspection-tools]
projectState: "Slices 161-164, 167, 172-175 complete. 805 tests passing. Core introspection engine and ProjectModelBuilder available. CLI has status, next, project commands. MCP has workflow_future tool."
dateCreated: 20260307
dateUpdated: 20260307
status: in_progress
---

## Context Summary
- Working on slice 165: Workflow Navigator & Discovery
- Adds `WorkflowNavigator` core service with `getStatus()` and `getNext()` methods
- Adds `workflow_status` and `workflow_next` MCP tools
- Adds CLI discovery commands: `cf slice list`, `cf task list`, `cf arch list`
- Auto-sets `fileTasks` when `fileSlice` changes (CLI and MCP)
- Enhances `cf status` and `cf next` to use WorkflowNavigator
- Registers `workflow.auto_advance` config key (behavior deferred)
- Dependencies: ArtifactIntrospector (163), ProjectModelBuilder (164) — both complete
- Next planned slice: 166 (Consistency Checker)

---

## Tasks

### Task 1: Add Core Types

- [x] Add `SliceStatus`, `WorkflowStatus`, and `NextAction` types to `packages/core/src/introspection/types.ts`
  - [x] `SliceStatus`: `{ name, index: number | null, status: 'needs-design' | 'needs-tasks' | 'in-implementation' | 'complete' | 'no-active-slice', taskProgress?: { completed, total, inferredStatus } }`
  - [x] `WorkflowStatus`: `{ project, phase, activeSlice: SliceStatus | null, slicePlan: { name, completed, total, entries: SlicePlanEntry[] } | null, summary }`
  - [x] `NextAction`: `{ recommendation, rationale, suggestedCommand?, slice?, phase?, summary }`
  - [x] Export new types from `packages/core/src/introspection/index.ts`
  - [x] Build succeeds: `pnpm -r build`

**Commit checkpoint**

### Task 2: Implement WorkflowNavigator.getStatus()

- [x] Create `packages/core/src/introspection/WorkflowNavigator.ts`
  - [x] Stateless class with `private introspector = new ArtifactIntrospector()`
  - [x] `async getStatus(project: ProjectData): Promise<WorkflowStatus>`
  - [x] Derive `activeSlice.status` by checking file existence via `detectDocuments()`:
    1. No `fileSlice` → status `no-active-slice`
    2. No slice design file → `needs-design`
    3. Slice design exists, no task file → `needs-tasks`
    4. Task file exists, tasks incomplete → `in-implementation`
    5. Task file exists, all complete → `complete`
  - [x] Extract numeric index from `fileSlice` (regex `/^(\d+)-/`)
  - [x] Parse `fileSlicePlan` if set → populate `slicePlan` field with entries
  - [x] Parse `fileTasks` if set → populate `activeSlice.taskProgress`
  - [x] Generate human-readable `summary` string (e.g., "Phase 6 — slice 165 in-implementation (7/12 tasks)")
  - [x] Handle edge cases: no projectPath, no fileSlice, no fileSlicePlan, missing files
  - [x] Export from `packages/core/src/node.ts`

### Task 3: Test WorkflowNavigator.getStatus()

- [x] Create `packages/core/tests/introspection/WorkflowNavigator.test.ts`
  - [x] Mock `ArtifactIntrospector` (all parser methods)
  - [x] Test: no projectPath → returns basic status with null activeSlice
  - [x] Test: no fileSlice → `activeSlice.status` is `no-active-slice`
  - [x] Test: slice set but no design file → `needs-design`
  - [x] Test: design exists, no task file → `needs-tasks`
  - [x] Test: tasks incomplete → `in-implementation` with taskProgress
  - [x] Test: all tasks complete → `complete`
  - [x] Test: fileSlicePlan set → slicePlan populated with entries
  - [x] Test: summary string is non-empty and contains relevant info
  - [x] All tests pass: `pnpm --filter @context-forge/core test`

**Commit checkpoint**

### Task 4: Implement WorkflowNavigator.getNext()

- [x] Add `async getNext(project: ProjectData): Promise<NextAction>` to `WorkflowNavigator`
  - [x] Calls `getStatus()` internally
  - [x] State machine priority order:
    1. No projectPath → recommend "Set projectPath"; `suggestedCommand: 'cf set projectPath /path/to/project'`
    2. No fileSlice → recommend "Set active slice"; `suggestedCommand: 'cf set slice <index>'`
    3. Active slice `needs-design` → recommend "Create slice design (Phase 4)"
    4. Active slice `needs-tasks` → recommend "Create task breakdown (Phase 5)"
    5. Active slice `in-implementation` → recommend "Continue implementation — N tasks remaining"
    6. Active slice `complete` → check slice plan for next unstarted slice:
       - Next found → recommend "Advance to slice NNN: {name}"; `suggestedCommand: 'cf set slice NNN'`
       - No next, plan exists → recommend "Slice plan complete. Review architecture for next initiative"
    7. No slice plan → recommend "Create or assign a slice plan"
  - [x] Each path sets `recommendation`, `rationale`, `suggestedCommand` (where applicable), `slice`, `phase`, and `summary`

### Task 5: Test WorkflowNavigator.getNext()

- [x] Add tests to `WorkflowNavigator.test.ts`
  - [x] Test: no projectPath → recommends setting projectPath
  - [x] Test: no fileSlice → recommends setting slice
  - [x] Test: needs-design → recommends creating slice design
  - [x] Test: needs-tasks → recommends creating task breakdown
  - [x] Test: in-implementation → recommends continuing, includes remaining count
  - [x] Test: complete, next slice available → recommends advancing with suggestedCommand
  - [x] Test: complete, no next slice → recommends reviewing architecture
  - [x] Test: no slice plan → recommends creating one
  - [x] All tests pass: `pnpm --filter @context-forge/core test`

**Commit checkpoint**

### Task 6: Auto-Set fileTasks on fileSlice Change (CLI)

- [x] Modify `projectSetAction()` in `packages/cli/src/commands/project.ts`
  - [x] After the existing `store.update()` call for `fileSlice` (or any field resolving to `fileSlice`):
    1. Extract numeric index from resolved value (regex `/^(\d+)-/`)
    2. If index found and `existing.projectPath` exists, call `resolveFileByIndex(existing.projectPath, 'fileTasks', index)`
    3. If result is non-null, include `fileTasks: resolved` in the same or follow-up `store.update()` call
    4. Print: `Updated tasks = {resolved} (auto-set from slice)`
  - [x] If `resolveFileByIndex` throws or returns null, silently skip (no error)
  - [x] Does NOT trigger when `fileTasks` is set directly (one-way only)

### Task 7: Test Auto-Set fileTasks (CLI)

- [x] Add tests to `packages/cli/tests/project.test.ts` (or create if needed)
  - [x] Test: setting fileSlice with matching task file → fileTasks auto-set, confirmation printed
  - [x] Test: setting fileSlice with no matching task file → fileTasks unchanged, no error
  - [x] Test: setting fileTasks directly → fileSlice NOT auto-set
  - [x] All tests pass: `pnpm --filter @context-forge/cli test`

**Commit checkpoint**

### Task 8: Auto-Set fileTasks on fileSlice Change (MCP)

- [x] Modify `project_update` handler in `packages/mcp-server/src/tools/projectTools.ts`
  - [x] When update includes `fileSlice`, apply same auto-set logic:
    1. Extract index from the fileSlice value
    2. Call `resolveFileByIndex` for `fileTasks`
    3. If match found, include `fileTasks` in the update
  - [x] Silently skip on error or no match
  - [x] Return response should note auto-set if it occurred

### Task 9: Test Auto-Set fileTasks (MCP)

- [x] Add tests to `packages/mcp-server/tests/projectTools.test.ts`
  - [x] Test: updating fileSlice with matching task file → fileTasks auto-set in response
  - [x] Test: updating fileSlice with no match → fileTasks unchanged
  - [x] All tests pass: `pnpm --filter @context-forge/mcp test`

**Commit checkpoint**

### Task 10: Implement `cf slice list`

- [x] Create `packages/cli/src/commands/slice.ts`
  - [x] `registerSliceCommand(program: Command)` — registers `cf slice` with `list` subcommand
  - [x] `cf slice list` options: `--json`, `--project <id>`
  - [x] Resolve project via `resolveProjectId`
  - [x] Resolve `fileSlicePlan` path against `projectPath` (error if neither set)
  - [x] Parse slice plan via `new ArtifactIntrospector().parseSlicePlan(resolvedPath)`
  - [x] For each entry, check if slice design file exists via `detectDocuments(projectPath, entry.index)` — populate File column
  - [x] Determine active slice: match `project.fileSlice` index against entries
  - [x] If no active match, mark first unchecked entry as `next`
  - [x] Render header: `Slice Plan: {fileSlicePlan filename}`
  - [x] Render borderless table using `renderTable()`:
    - Columns: `#`, `Slice`, `Status`, `File`
    - Status: green `✓ complete` for checked, `○ not started` for unchecked
    - File: truncated design filename or `—`
    - Active/next indicator appended to row
  - [x] `--json` outputs `{ slicePlan, entries[] }` with all fields
  - [x] Error with helpful message if no fileSlicePlan is set

### Task 11: Test `cf slice list`

- [x] Create `packages/cli/tests/slice.test.ts`
  - [x] Mock `FileProjectStore`, `ArtifactIntrospector`, `resolveProjectId`
  - [x] Test: renders table with correct columns, status indicators, and file references
  - [x] Test: active slice marked with `← active`
  - [x] Test: next candidate marked with `← next` when no active match
  - [x] Test: `--json` outputs structured data
  - [x] Test: error when no fileSlicePlan set
  - [x] All tests pass: `pnpm --filter @context-forge/cli test`

**Commit checkpoint**

### Task 12: Implement `cf task list`

- [x] Create `packages/cli/src/commands/task.ts`
  - [x] `registerTaskCommand(program: Command)` — registers `cf task` with `list` subcommand
  - [x] `cf task list` options: `--json`, `--project <id>`
  - [x] Resolve project, resolve `fileTasks` path against `projectPath`
  - [x] Parse via `new ArtifactIntrospector().parseTaskFile(resolvedPath)`
  - [x] Render header: `Tasks: {fileTasks filename}  (N/M complete)`
  - [x] Render each item: `✓` (green) or `○` prefix, then task name
  - [x] `--json` outputs `TaskFileResult` directly
  - [x] Error with helpful message if no fileTasks is set

### Task 13: Test `cf task list`

- [x] Create `packages/cli/tests/task.test.ts`
  - [x] Mock `FileProjectStore`, `ArtifactIntrospector`, `resolveProjectId`
  - [x] Test: renders task list with completion indicators and progress header
  - [x] Test: `--json` outputs `TaskFileResult`
  - [x] Test: error when no fileTasks set
  - [x] All tests pass: `pnpm --filter @context-forge/cli test`

**Commit checkpoint**

### Task 14: Implement `cf arch list`

- [x] Create `packages/cli/src/commands/arch.ts`
  - [x] `registerArchCommand(program: Command)` — registers `cf arch` with `list` subcommand
  - [x] `cf arch list` options: `--json`, `--project <id>`
  - [x] Resolve project, require `projectPath`
  - [x] Build model via `buildModel(projectPath)`
  - [x] Iterate `model.initiatives` (keyed by base index string)
  - [x] For each initiative: extract index range (base index, or min-max of slices), arch doc name, slice plan name, completion (completed/total slices)
  - [x] Determine active initiative: match `project.fileSlice` index against initiative slice index ranges
  - [x] Render borderless table using `renderTable()`:
    - Columns: `Index`, `Initiative`, `Arch Doc`, `Slice Plan`, `Progress`
    - Active indicator: `← active` on matching initiative
  - [x] `--json` outputs structured initiative data
  - [x] Handle empty model gracefully (no initiatives found message)

### Task 15: Test `cf arch list`

- [x] Create `packages/cli/tests/arch.test.ts`
  - [x] Mock `FileProjectStore`, `ProjectModelBuilder`, `resolveProjectId`
  - [x] Test: renders table with initiative data and progress counts
  - [x] Test: active initiative marked
  - [x] Test: `--json` outputs structured data
  - [x] Test: handles empty model (no initiatives)
  - [x] All tests pass: `pnpm --filter @context-forge/cli test`

**Commit checkpoint**

### Task 16: Register CLI Commands

- [ ] Modify `packages/cli/src/index.ts`
  - [ ] Import and call `registerSliceCommand(program)`
  - [ ] Import and call `registerTaskCommand(program)`
  - [ ] Import and call `registerArchCommand(program)`
  - [ ] Verify `cf slice list --help`, `cf task list --help`, `cf arch list --help` work
  - [ ] Build succeeds: `pnpm --filter @context-forge/cli build`

### Task 17: Add `workflow_status` MCP Tool

- [ ] Add to `packages/mcp-server/src/tools/workflowTools.ts`
  - [ ] Input: `projectId` (optional, string)
  - [ ] Resolve project via `resolveProjectId`, get from store
  - [ ] Call `new WorkflowNavigator().getStatus(project)`
  - [ ] Return `jsonResult(status)`
  - [ ] Handle missing project, missing projectPath with `errorResult()`
  - [ ] Add `readOnlyHint: true` annotation

### Task 18: Add `workflow_next` MCP Tool

- [ ] Add to `packages/mcp-server/src/tools/workflowTools.ts`
  - [ ] Input: `projectId` (optional, string)
  - [ ] Resolve project, call `new WorkflowNavigator().getNext(project)`
  - [ ] Return `jsonResult(nextAction)`
  - [ ] Handle errors with `errorResult()`
  - [ ] Add `readOnlyHint: true` annotation

### Task 19: Test MCP Workflow Tools

- [ ] Add tests to `packages/mcp-server/tests/workflowTools.test.ts`
  - [ ] Mock `WorkflowNavigator`, `FileProjectStore`
  - [ ] Test `workflow_status`: returns WorkflowStatus for valid project
  - [ ] Test `workflow_status`: error for missing project
  - [ ] Test `workflow_next`: returns NextAction for valid project
  - [ ] Test `workflow_next`: error for missing project
  - [ ] Update lifecycle test for new tool count (current count + 2)
  - [ ] All tests pass: `pnpm --filter context-forge-mcp test`

**Commit checkpoint**

### Task 20: Enhance `cf status` and `cf next`

- [ ] Modify `packages/cli/src/commands/status.ts`
  - [ ] Replace direct `ArtifactIntrospector` usage with `WorkflowNavigator.getStatus()`
  - [ ] Use `WorkflowStatus` fields for display (activeSlice.status, taskProgress, slicePlan)
  - [ ] Preserve existing output format but use richer data
  - [ ] Update `--json` output to include full `WorkflowStatus`
- [ ] Modify `packages/cli/src/commands/next.ts`
  - [ ] Remove provisional `deriveRecommendation()` function
  - [ ] Replace with `new WorkflowNavigator().getNext(project)`
  - [ ] Map `NextAction` fields to existing output format
  - [ ] Show `suggestedCommand` in output when available
- [ ] Update existing tests in `packages/cli/tests/status.test.ts` and `packages/cli/tests/next.test.ts` for new imports/behavior
- [ ] All tests pass: `pnpm --filter @context-forge/cli test`

**Commit checkpoint**

### Task 21: Register Config Key and Final Verification

- [ ] Add `workflow.auto_advance` to `CONFIG_KEYS` in `packages/core/src/config/ConfigKeys.ts`:
  - Type: `boolean`, default: `false`
  - Description: "Auto-advance to next slice when current is complete"
- [ ] Full build: `pnpm -r build` succeeds
- [ ] Full test suite: `pnpm -r test` — all tests pass
- [ ] Verify CLI commands work: `cf slice list`, `cf task list`, `cf arch list`, `cf status`, `cf next`
- [ ] Verify `cf set slice <index>` auto-sets fileTasks

**Commit checkpoint**
