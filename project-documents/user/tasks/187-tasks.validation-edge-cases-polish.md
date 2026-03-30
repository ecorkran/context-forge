---
slice: validation-edge-cases-polish
project: context-forge
lld: user/slices/187-slice.validation-edge-cases-polish.md
dependencies: [183-worktree-cli-commands, 184-status-display-updates, 186-mcp-worktree-tools]
projectState: WorktreeService with full CRUD + migration + findOverlaps in core; CLI has init/list/rm commands; MCP has 5 worktree tools + worktree-aware workflow/context/project tools; ConsistencyChecker has 8 rules with fix support; GitWorktreeDiscovery in core/git
dateCreated: 20260311
dateUpdated: 20260311
status: complete
docType: tasks
---

## Context Summary

- Working on slice 187: Validation, Edge Cases & Polish
- Core `WorktreeService` has full CRUD (add/update/remove/list/get/getByName) + findOverlaps + forward/reverse migration
- CLI has `cf worktree init`, `cf worktree list`, `cf worktree rm` — NO `cf worktree update` yet
- MCP has `worktree_update` tool but does NOT check for overlaps on range change
- `ConsistencyChecker` has 8 rules, does NOT import WorktreeService or GitWorktreeDiscovery
- `cf status` has no fallback messaging when CWD is an unrecognized worktree
- This slice adds: `cf worktree update`, stale path validation, `cf check` rule, first-run messaging, MCP overlap detection
- Next planned slice: none (this is the final integration slice for the worktree initiative)

## Tasks

### 1. Add `WorktreePathStatus` type to core

- [x] Add `WorktreePathStatus` interface to `packages/core/src/types/worktree.ts`
  - [x] Fields: `worktreeId: string`, `worktreeName: string`, `worktreePath: string | undefined`, `status: 'valid' | 'missing' | 'not-a-worktree' | 'no-path'`
  - [x] Export from `packages/core/src/types/index.ts` (or wherever worktree types are re-exported)
  - [x] Verify: `npm run build` passes

### 2. Implement `WorktreeService.validateWorktreePaths()`

- [x] Add `validateWorktreePaths()` method to `packages/core/src/services/WorktreeService.ts`
  - [x] Signature: `async validateWorktreePaths(projectId: string, gitWorktrees: WorktreeInfo[], pathExists?: (p: string) => boolean): Promise<WorktreePathStatus[]>`
  - [x] Default `pathExists` to `fs.existsSync` (import from `node:fs`)
  - [x] Logic per worktree context:
    1. `worktreePath` undefined → `'no-path'`
    2. `pathExists(worktreePath)` false → `'missing'`
    3. `worktreePath` not in `gitWorktrees[].path` list → `'not-a-worktree'`
    4. Otherwise → `'valid'`
  - [x] Import `WorktreeInfo` from the git types (check where `GitWorktreeDiscovery` exports it)
  - [x] Verify: `npm run build` passes

### 3. Tests for `validateWorktreePaths()`

- [x] Add tests in `packages/core/tests/services/WorktreeService.test.ts`
  - [x] Test: worktree with no path → returns `'no-path'` status
  - [x] Test: worktree with path that doesn't exist on disk → returns `'missing'`
  - [x] Test: worktree with path that exists but not in git worktree list → returns `'not-a-worktree'`
  - [x] Test: worktree with valid path in git worktree list → returns `'valid'`
  - [x] Test: multiple worktrees with mixed statuses → correct status per worktree
  - [x] Test: project with no worktrees → returns empty array
  - [x] Use the `pathExists` callback parameter for testability (no real filesystem)
  - [x] Verify: all existing + new tests pass
  - [x] **Commit**: `feat(core): add validateWorktreePaths to WorktreeService`

### 4. Implement `cf worktree update` CLI command

- [x] Add `update` subcommand in `packages/cli/src/commands/worktree.ts`
  - [x] Command: `cf worktree update [nameOrId]`
  - [x] Options: `--name <name>`, `--range <start-end>`, `--path <path>`, `--project <name|id>`
  - [x] Resolve worktree target:
    1. If `nameOrId` provided → use `findWorktreeByNameOrId()`
    2. Else if CWD resolves a worktree → use `resolved.worktreeId`
    3. Else → error with guidance to specify name/ID
  - [x] Validate at least one update option provided (error if none)
  - [x] Parse `--range` via existing `parseRange()` helper
  - [x] When `--path` provided: validate against `git worktree list` (same pattern as `cf worktree init`); warn if git unavailable
  - [x] Collect updates object: `{ name?, indexRange?, worktreePath? }`
  - [x] Call `WorktreeService.updateWorktree(projectId, worktreeId, updates)`
  - [x] When range changed: call `WorktreeService.findOverlaps()` and display warnings
  - [x] Display success message: `Worktree context '{name}' updated.`
  - [x] Verify: `npm run build` passes

### 5. Tests for `cf worktree update`

- [x] Add tests in `packages/cli/tests/commands/worktree.test.ts`
  - [x] Test: rename by name → calls updateWorktree with `{ name: 'New Name' }`
  - [x] Test: change range → calls updateWorktree with parsed `[start, end]`, displays overlap warning if overlaps found
  - [x] Test: change path → validates against git worktree list, calls updateWorktree with `{ worktreePath }`
  - [x] Test: CWD resolution when nameOrId omitted
  - [x] Test: error when no options provided
  - [x] Test: error when worktree not found
  - [x] Verify: all CLI worktree tests pass
  - [x] **Commit**: `feat(cli): add cf worktree update command`

### 6. Add stale path flagging to `cf worktree list`

- [x] In `packages/cli/src/commands/worktree.ts`, modify the `list` action:
  - [x] After loading worktrees, call `GitWorktreeDiscovery.listWorktrees(project.projectPath)` to get git worktrees
  - [x] Call `WorktreeService.validateWorktreePaths(projectId, gitWorktrees)` to get statuses
  - [x] Merge status into display: append `(removed)` in warning color for `'missing'`, `(not a git worktree)` for `'not-a-worktree'`
  - [x] Skip validation if `projectPath` is undefined (no git discovery possible)
  - [x] Handle `GitWorktreeDiscovery` failure gracefully (proceed without status indicators)
  - [x] JSON output: include `pathStatus` field per worktree in `--json` mode
  - [x] Verify: `npm run build` passes, existing list tests still pass

### 7. Add `pathStatus` to `worktree_list` MCP tool

- [x] In `packages/mcp-server/src/tools/worktreeTools.ts`, modify `worktree_list` handler:
  - [x] After listing worktrees, resolve project to get `projectPath`
  - [x] If `projectPath` exists: call `GitWorktreeDiscovery.listWorktrees(projectPath)`, then `WorktreeService.validateWorktreePaths()`
  - [x] Add `pathStatuses` array to the response alongside `worktrees` and `count`
  - [x] If validation fails or no `projectPath`: omit `pathStatuses` from response (graceful degradation)
  - [x] Import `GitWorktreeDiscovery` from `@context-forge/core/node`

### 8. Tests for stale path flagging (CLI + MCP)

- [x] CLI tests in `packages/cli/tests/commands/worktree.test.ts`:
  - [x] Test: list with stale path shows `(removed)` suffix
  - [x] Test: list with valid paths shows no suffix
  - [x] Test: list works when git discovery fails (no suffix, no crash)
- [x] MCP tests in `packages/mcp-server/tests/worktreeTools.test.ts`:
  - [x] Test: `worktree_list` response includes `pathStatuses` when project has `projectPath`
  - [x] Test: `worktree_list` response omits `pathStatuses` when no `projectPath`
- [x] Verify: all tests pass
- [x] **Commit**: `feat: add stale worktree path detection to list commands`

### 9. Add `stale-worktree-path` rule to `ConsistencyChecker`

- [x] In `packages/core/src/introspection/ConsistencyChecker.ts`:
  - [x] Import `GitWorktreeDiscovery` from `../../git/index.js` (or appropriate relative path)
  - [x] Import `WorktreeService` from `../../services/WorktreeService.js`
  - [x] Import `WorktreePathStatus` type
  - [x] Add private method `ruleStaleWorktreePath(project: ProjectData, projectPath: string): Promise<ConsistencyFinding[]>`
    1. Skip if `project.worktrees` is undefined or empty → return `[]`
    2. Call `new GitWorktreeDiscovery().listWorktrees(projectPath)` — wrap in try/catch (return `[]` on failure)
    3. Build mock `IProjectStore` or call `validateWorktreePaths` logic inline (since checker doesn't have a store instance — evaluate which approach is cleaner)
    4. Filter for statuses `'missing'` or `'not-a-worktree'`
    5. Generate findings: severity `'warning'`, rule `'stale-worktree-path'`, `fixable: false`
    6. Description: `Worktree '{name}' path '{path}' no longer exists on disk` (for missing) or `Worktree '{name}' path '{path}' is not a registered git worktree` (for not-a-worktree)
    7. Suggested fix: `Run 'cf worktree update "{name}" --path <new-path>' or 'cf worktree rm "{name}"'`
  - [x] Call from `checkAll()` — add to aggregate findings after existing rules
  - [x] Note: since `ConsistencyChecker` doesn't hold a store, implement validation logic inline (iterate `project.worktrees`, check paths) rather than importing `WorktreeService` — keeps the checker's existing dependency pattern clean

### 10. Tests for `stale-worktree-path` rule

- [x] In `packages/core/tests/introspection/ConsistencyChecker.test.ts`:
  - [x] Test: project with stale worktree path → warning finding with rule `'stale-worktree-path'`
  - [x] Test: project with valid worktree paths → no stale-worktree-path findings
  - [x] Test: project with no worktrees → no stale-worktree-path findings
  - [x] Test: project with worktree that has no path (`worktreePath: undefined`) → not flagged
  - [x] Test: git discovery failure → graceful degradation, no findings
  - [x] Mock `GitWorktreeDiscovery.listWorktrees` and filesystem checks
  - [x] Verify: all consistency checker tests pass
  - [x] **Commit**: `feat(core): add stale-worktree-path rule to ConsistencyChecker`

### 11. Add first-run messaging to `cf status`

- [x] In `packages/cli/src/commands/status.ts`:
  - [x] In the error/fallback path when `resolveProjectWorktree()` fails to find a project:
    1. Try `GitWorktreeDiscovery.listWorktrees(process.cwd())` — if this fails, fall through to existing error
    2. Extract the main worktree path (the first entry, which is the main worktree)
    3. Check if that main path matches any registered project via `store.list()` + path comparison
    4. If match found: display suggestion message
    5. If no match: show standard "no project found" error
  - [x] Suggestion message format:
    ```
    This directory appears to be a git worktree of project '{name}'.
    Create a worktree context: cf worktree init --name '<suggested>' --range <start>-<end>
    ```
  - [x] Name suggestion: derive from current git branch (strip `feature/`, `bugfix/`, etc. prefixes)
  - [x] Range suggestion: next available 100-block based on existing worktree ranges (find max range end, round up to next 100)
  - [x] Import `GitWorktreeDiscovery` from `@context-forge/core/node`

### 12. Tests for first-run messaging

- [x] In `packages/cli/tests/commands/status.test.ts` (or appropriate test file):
  - [x] Test: CWD is a git worktree of a known project with no worktree context → shows suggestion message
  - [x] Test: CWD is a git worktree of an unknown project → shows standard error
  - [x] Test: CWD is not a git worktree → shows standard error
  - [x] Test: suggestion includes derived name from branch and next available range
  - [x] Mock `GitWorktreeDiscovery`, `FileProjectStore`, `resolveProjectWorktree`
  - [x] Verify: all status tests pass
  - [x] **Commit**: `feat(cli): add first-run worktree suggestion in cf status`

### 13. Add overlap detection to `worktree_update` MCP tool

- [x] In `packages/mcp-server/src/tools/worktreeTools.ts`, modify `worktree_update` handler:
  - [x] After calling `WorktreeService.updateWorktree()`, check if `indexRange` was in the updates
  - [x] If range changed: call `WorktreeService.findOverlaps(projectId, newRange, worktreeId)` (exclude self)
  - [x] Include `overlaps` array in the response (empty array if no overlaps or no range change)
  - [x] Response shape: `{ worktree: updated, overlaps: IndexRangeOverlap[] }`

### 14. Tests for MCP overlap detection

- [x] In `packages/mcp-server/tests/worktreeTools.test.ts`:
  - [x] Test: `worktree_update` with `indexRange` change → response includes `overlaps` array
  - [x] Test: `worktree_update` with overlapping range → `overlaps` contains overlap details
  - [x] Test: `worktree_update` without `indexRange` → response has no `overlaps` field (or empty)
  - [x] Test: `worktree_update` with non-overlapping range → `overlaps` is empty array
  - [x] Verify: all MCP worktree tests pass
  - [x] **Commit**: `feat(mcp): add overlap detection to worktree_update`

### 15. Edge case verification tests

- [x] Add targeted tests for known edge cases:
  - [x] Nested worktree resolution (longest path wins): verify in `packages/cli/tests/` or `packages/core/tests/` — confirm existing behavior with a test if not already covered
  - [x] Worktree context without worktree path: verify `validateWorktreePaths` returns `'no-path'`, display shows `—`, `cf check` does not flag — likely already covered by tasks 3 and 10
  - [x] Empty worktrees array cleanup: verify `removeWorktree` on last worktree sets `worktrees: undefined` — likely already covered in existing WorktreeService tests, confirm
  - [x] For any edge case NOT already covered by prior tasks: add a test
  - [x] Verify: all tests pass across all packages
  - [x] **Commit**: `test: add edge case verification for worktree features`

### 16. Final build verification and regression check

- [x] Run `npm run build` — clean build across all packages
- [x] Run `npm test` — all tests pass (new + existing)
- [x] Verify `cf worktree update` works end-to-end (manual or scripted check)
- [x] Verify `cf worktree list` shows stale path indicators
- [x] Verify `cf check` reports stale worktree paths
- [x] Verify `worktree_list` MCP includes `pathStatuses`
- [x] Verify `worktree_update` MCP includes `overlaps` on range change
- [x] **Commit**: `feat: complete slice 187 validation, edge cases & polish`
