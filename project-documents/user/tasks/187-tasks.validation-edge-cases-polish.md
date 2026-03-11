---
slice: validation-edge-cases-polish
project: context-forge
lld: user/slices/187-slice.validation-edge-cases-polish.md
dependencies: [183-worktree-cli-commands, 184-status-display-updates, 186-mcp-worktree-tools]
projectState: WorktreeService with full CRUD + migration + findOverlaps in core; CLI has init/list/rm commands; MCP has 5 worktree tools + worktree-aware workflow/context/project tools; ConsistencyChecker has 8 rules with fix support; GitWorktreeDiscovery in core/git
dateCreated: 20260311
dateUpdated: 20260311
status: not_started
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

- [ ] Add `WorktreePathStatus` interface to `packages/core/src/types/worktree.ts`
  - [ ] Fields: `worktreeId: string`, `worktreeName: string`, `worktreePath: string | undefined`, `status: 'valid' | 'missing' | 'not-a-worktree' | 'no-path'`
  - [ ] Export from `packages/core/src/types/index.ts` (or wherever worktree types are re-exported)
  - [ ] Verify: `npm run build` passes

### 2. Implement `WorktreeService.validateWorktreePaths()`

- [ ] Add `validateWorktreePaths()` method to `packages/core/src/services/WorktreeService.ts`
  - [ ] Signature: `async validateWorktreePaths(projectId: string, gitWorktrees: WorktreeInfo[], pathExists?: (p: string) => boolean): Promise<WorktreePathStatus[]>`
  - [ ] Default `pathExists` to `fs.existsSync` (import from `node:fs`)
  - [ ] Logic per worktree context:
    1. `worktreePath` undefined → `'no-path'`
    2. `pathExists(worktreePath)` false → `'missing'`
    3. `worktreePath` not in `gitWorktrees[].path` list → `'not-a-worktree'`
    4. Otherwise → `'valid'`
  - [ ] Import `WorktreeInfo` from the git types (check where `GitWorktreeDiscovery` exports it)
  - [ ] Verify: `npm run build` passes

### 3. Tests for `validateWorktreePaths()`

- [ ] Add tests in `packages/core/tests/services/WorktreeService.test.ts`
  - [ ] Test: worktree with no path → returns `'no-path'` status
  - [ ] Test: worktree with path that doesn't exist on disk → returns `'missing'`
  - [ ] Test: worktree with path that exists but not in git worktree list → returns `'not-a-worktree'`
  - [ ] Test: worktree with valid path in git worktree list → returns `'valid'`
  - [ ] Test: multiple worktrees with mixed statuses → correct status per worktree
  - [ ] Test: project with no worktrees → returns empty array
  - [ ] Use the `pathExists` callback parameter for testability (no real filesystem)
  - [ ] Verify: all existing + new tests pass
  - [ ] **Commit**: `feat(core): add validateWorktreePaths to WorktreeService`

### 4. Implement `cf worktree update` CLI command

- [ ] Add `update` subcommand in `packages/cli/src/commands/worktree.ts`
  - [ ] Command: `cf worktree update [nameOrId]`
  - [ ] Options: `--name <name>`, `--range <start-end>`, `--path <path>`, `--project <name|id>`
  - [ ] Resolve worktree target:
    1. If `nameOrId` provided → use `findWorktreeByNameOrId()`
    2. Else if CWD resolves a worktree → use `resolved.worktreeId`
    3. Else → error with guidance to specify name/ID
  - [ ] Validate at least one update option provided (error if none)
  - [ ] Parse `--range` via existing `parseRange()` helper
  - [ ] When `--path` provided: validate against `git worktree list` (same pattern as `cf worktree init`); warn if git unavailable
  - [ ] Collect updates object: `{ name?, indexRange?, worktreePath? }`
  - [ ] Call `WorktreeService.updateWorktree(projectId, worktreeId, updates)`
  - [ ] When range changed: call `WorktreeService.findOverlaps()` and display warnings
  - [ ] Display success message: `Worktree context '{name}' updated.`
  - [ ] Verify: `npm run build` passes

### 5. Tests for `cf worktree update`

- [ ] Add tests in `packages/cli/tests/commands/worktree.test.ts`
  - [ ] Test: rename by name → calls updateWorktree with `{ name: 'New Name' }`
  - [ ] Test: change range → calls updateWorktree with parsed `[start, end]`, displays overlap warning if overlaps found
  - [ ] Test: change path → validates against git worktree list, calls updateWorktree with `{ worktreePath }`
  - [ ] Test: CWD resolution when nameOrId omitted
  - [ ] Test: error when no options provided
  - [ ] Test: error when worktree not found
  - [ ] Verify: all CLI worktree tests pass
  - [ ] **Commit**: `feat(cli): add cf worktree update command`

### 6. Add stale path flagging to `cf worktree list`

- [ ] In `packages/cli/src/commands/worktree.ts`, modify the `list` action:
  - [ ] After loading worktrees, call `GitWorktreeDiscovery.listWorktrees(project.projectPath)` to get git worktrees
  - [ ] Call `WorktreeService.validateWorktreePaths(projectId, gitWorktrees)` to get statuses
  - [ ] Merge status into display: append `(removed)` in warning color for `'missing'`, `(not a git worktree)` for `'not-a-worktree'`
  - [ ] Skip validation if `projectPath` is undefined (no git discovery possible)
  - [ ] Handle `GitWorktreeDiscovery` failure gracefully (proceed without status indicators)
  - [ ] JSON output: include `pathStatus` field per worktree in `--json` mode
  - [ ] Verify: `npm run build` passes, existing list tests still pass

### 7. Add `pathStatus` to `worktree_list` MCP tool

- [ ] In `packages/mcp-server/src/tools/worktreeTools.ts`, modify `worktree_list` handler:
  - [ ] After listing worktrees, resolve project to get `projectPath`
  - [ ] If `projectPath` exists: call `GitWorktreeDiscovery.listWorktrees(projectPath)`, then `WorktreeService.validateWorktreePaths()`
  - [ ] Add `pathStatuses` array to the response alongside `worktrees` and `count`
  - [ ] If validation fails or no `projectPath`: omit `pathStatuses` from response (graceful degradation)
  - [ ] Import `GitWorktreeDiscovery` from `@context-forge/core/node`

### 8. Tests for stale path flagging (CLI + MCP)

- [ ] CLI tests in `packages/cli/tests/commands/worktree.test.ts`:
  - [ ] Test: list with stale path shows `(removed)` suffix
  - [ ] Test: list with valid paths shows no suffix
  - [ ] Test: list works when git discovery fails (no suffix, no crash)
- [ ] MCP tests in `packages/mcp-server/tests/worktreeTools.test.ts`:
  - [ ] Test: `worktree_list` response includes `pathStatuses` when project has `projectPath`
  - [ ] Test: `worktree_list` response omits `pathStatuses` when no `projectPath`
- [ ] Verify: all tests pass
- [ ] **Commit**: `feat: add stale worktree path detection to list commands`

### 9. Add `stale-worktree-path` rule to `ConsistencyChecker`

- [ ] In `packages/core/src/introspection/ConsistencyChecker.ts`:
  - [ ] Import `GitWorktreeDiscovery` from `../../git/index.js` (or appropriate relative path)
  - [ ] Import `WorktreeService` from `../../services/WorktreeService.js`
  - [ ] Import `WorktreePathStatus` type
  - [ ] Add private method `ruleStaleWorktreePath(project: ProjectData, projectPath: string): Promise<ConsistencyFinding[]>`
    1. Skip if `project.worktrees` is undefined or empty → return `[]`
    2. Call `new GitWorktreeDiscovery().listWorktrees(projectPath)` — wrap in try/catch (return `[]` on failure)
    3. Build mock `IProjectStore` or call `validateWorktreePaths` logic inline (since checker doesn't have a store instance — evaluate which approach is cleaner)
    4. Filter for statuses `'missing'` or `'not-a-worktree'`
    5. Generate findings: severity `'warning'`, rule `'stale-worktree-path'`, `fixable: false`
    6. Description: `Worktree '{name}' path '{path}' no longer exists on disk` (for missing) or `Worktree '{name}' path '{path}' is not a registered git worktree` (for not-a-worktree)
    7. Suggested fix: `Run 'cf worktree update "{name}" --path <new-path>' or 'cf worktree rm "{name}"'`
  - [ ] Call from `checkAll()` — add to aggregate findings after existing rules
  - [ ] Note: since `ConsistencyChecker` doesn't hold a store, implement validation logic inline (iterate `project.worktrees`, check paths) rather than importing `WorktreeService` — keeps the checker's existing dependency pattern clean

### 10. Tests for `stale-worktree-path` rule

- [ ] In `packages/core/tests/introspection/ConsistencyChecker.test.ts`:
  - [ ] Test: project with stale worktree path → warning finding with rule `'stale-worktree-path'`
  - [ ] Test: project with valid worktree paths → no stale-worktree-path findings
  - [ ] Test: project with no worktrees → no stale-worktree-path findings
  - [ ] Test: project with worktree that has no path (`worktreePath: undefined`) → not flagged
  - [ ] Test: git discovery failure → graceful degradation, no findings
  - [ ] Mock `GitWorktreeDiscovery.listWorktrees` and filesystem checks
  - [ ] Verify: all consistency checker tests pass
  - [ ] **Commit**: `feat(core): add stale-worktree-path rule to ConsistencyChecker`

### 11. Add first-run messaging to `cf status`

- [ ] In `packages/cli/src/commands/status.ts`:
  - [ ] In the error/fallback path when `resolveProjectWorktree()` fails to find a project:
    1. Try `GitWorktreeDiscovery.listWorktrees(process.cwd())` — if this fails, fall through to existing error
    2. Extract the main worktree path (the first entry, which is the main worktree)
    3. Check if that main path matches any registered project via `store.list()` + path comparison
    4. If match found: display suggestion message
    5. If no match: show standard "no project found" error
  - [ ] Suggestion message format:
    ```
    This directory appears to be a git worktree of project '{name}'.
    Create a worktree context: cf worktree init --name '<suggested>' --range <start>-<end>
    ```
  - [ ] Name suggestion: derive from current git branch (strip `feature/`, `bugfix/`, etc. prefixes)
  - [ ] Range suggestion: next available 100-block based on existing worktree ranges (find max range end, round up to next 100)
  - [ ] Import `GitWorktreeDiscovery` from `@context-forge/core/node`

### 12. Tests for first-run messaging

- [ ] In `packages/cli/tests/commands/status.test.ts` (or appropriate test file):
  - [ ] Test: CWD is a git worktree of a known project with no worktree context → shows suggestion message
  - [ ] Test: CWD is a git worktree of an unknown project → shows standard error
  - [ ] Test: CWD is not a git worktree → shows standard error
  - [ ] Test: suggestion includes derived name from branch and next available range
  - [ ] Mock `GitWorktreeDiscovery`, `FileProjectStore`, `resolveProjectWorktree`
  - [ ] Verify: all status tests pass
  - [ ] **Commit**: `feat(cli): add first-run worktree suggestion in cf status`

### 13. Add overlap detection to `worktree_update` MCP tool

- [ ] In `packages/mcp-server/src/tools/worktreeTools.ts`, modify `worktree_update` handler:
  - [ ] After calling `WorktreeService.updateWorktree()`, check if `indexRange` was in the updates
  - [ ] If range changed: call `WorktreeService.findOverlaps(projectId, newRange, worktreeId)` (exclude self)
  - [ ] Include `overlaps` array in the response (empty array if no overlaps or no range change)
  - [ ] Response shape: `{ worktree: updated, overlaps: IndexRangeOverlap[] }`

### 14. Tests for MCP overlap detection

- [ ] In `packages/mcp-server/tests/worktreeTools.test.ts`:
  - [ ] Test: `worktree_update` with `indexRange` change → response includes `overlaps` array
  - [ ] Test: `worktree_update` with overlapping range → `overlaps` contains overlap details
  - [ ] Test: `worktree_update` without `indexRange` → response has no `overlaps` field (or empty)
  - [ ] Test: `worktree_update` with non-overlapping range → `overlaps` is empty array
  - [ ] Verify: all MCP worktree tests pass
  - [ ] **Commit**: `feat(mcp): add overlap detection to worktree_update`

### 15. Edge case verification tests

- [ ] Add targeted tests for known edge cases:
  - [ ] Nested worktree resolution (longest path wins): verify in `packages/cli/tests/` or `packages/core/tests/` — confirm existing behavior with a test if not already covered
  - [ ] Worktree context without worktree path: verify `validateWorktreePaths` returns `'no-path'`, display shows `—`, `cf check` does not flag — likely already covered by tasks 3 and 10
  - [ ] Empty worktrees array cleanup: verify `removeWorktree` on last worktree sets `worktrees: undefined` — likely already covered in existing WorktreeService tests, confirm
  - [ ] For any edge case NOT already covered by prior tasks: add a test
  - [ ] Verify: all tests pass across all packages
  - [ ] **Commit**: `test: add edge case verification for worktree features`

### 16. Final build verification and regression check

- [ ] Run `npm run build` — clean build across all packages
- [ ] Run `npm test` — all tests pass (new + existing)
- [ ] Verify `cf worktree update` works end-to-end (manual or scripted check)
- [ ] Verify `cf worktree list` shows stale path indicators
- [ ] Verify `cf check` reports stale worktree paths
- [ ] Verify `worktree_list` MCP includes `pathStatuses`
- [ ] Verify `worktree_update` MCP includes `overlaps` on range change
- [ ] **Commit**: `feat: complete slice 187 validation, edge cases & polish`
