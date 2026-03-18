---
slice: worktree-aware-guide-operations
project: context-forge
lld: user/slices/190-slice.worktree-aware-guide-operations.md
dependencies: [182, 186]
projectState: Guide operations (cf guides, guide_status/guide_update MCP tools) always use project.projectPath. Git submodule checkouts are per-worktree, so non-default worktrees get stale guide files while reporting the correct version.
dateCreated: 20260318
dateUpdated: 20260318
status: complete
---

## Context Summary

- Working on slice 190: Worktree-Aware Guide Operations
- Bug: `cf guides update` and MCP `guide_update` only sync the submodule in the main worktree; non-default worktrees retain stale guide files
- Version detection reports correct version in all worktrees (shared git object store), masking the stale checkout
- Fix: CLI resolves CWD to the correct worktree and operates there; MCP auto-syncs all registered worktrees after update
- Scope limited to submodule strategy — clone/manual strategies don't have per-worktree checkout issues
- All prerequisite slices (182 CWD Resolution, 186 MCP Worktree Tools) are complete
- Key files: `packages/core/src/guides/GuideManager.ts`, `GuideDetector.ts`, `strategies/SubmoduleStrategy.ts`, `packages/cli/src/commands/guides.ts`, `packages/mcp-server/src/tools/guideTools.ts`

## Tasks

### 1. Core: Add `SyncResult` type and `sync()` to SubmoduleStrategy

- [x] **Add `SyncResult` interface to `packages/core/src/guides/types.ts`**
  - [x] Add `SyncResult` with fields: `worktreePath: string`, `success: boolean`, `error?: string`
  - [x] Export from `types.ts`
  - [x] Success: type compiles, is importable from `@context-forge/core`

- [x] **Add `sync()` method to `SubmoduleStrategy`**
  - [x] In `packages/core/src/guides/strategies/SubmoduleStrategy.ts`, add method: `async sync(worktreePath: string): Promise<void>`
  - [x] Implementation: run `git submodule update --init project-documents/ai-project-guide` in the given `worktreePath` via `gitExec`
    - Use `--init` flag to handle worktrees where the submodule was never initialized
    - Use `GUIDE_RELATIVE_PATH` constant for the submodule path argument
  - [x] If `gitExec` throws, let it propagate (caller handles errors)
  - [x] Success: method exists, uses `gitExec` with correct arguments, `--init` flag is present

### 2. Core: Tests for SubmoduleStrategy.sync()

- [x] **Add unit tests for `sync()` in `packages/core/tests/guides/SubmoduleStrategy.test.ts`** (new file or extend existing if present)
  - [x] Mock `gitExec` (the module is already used by SubmoduleStrategy)
  - [x] Test: `sync()` calls `gitExec` with `['submodule', 'update', '--init', GUIDE_RELATIVE_PATH]` and the provided `worktreePath` as cwd
  - [x] Test: `sync()` propagates errors from `gitExec`
  - [x] Test: `sync()` does not use `--remote` flag
  - [x] Success: all tests pass via `npx vitest run packages/core/tests/guides/SubmoduleStrategy.test.ts`

### 3. Core: Add `operationPath` to GuideManager and `syncWorktrees()` method

- [x] **Extend `GuideManager` constructor to accept optional `operationPath`**
  - [x] In `packages/core/src/guides/GuideManager.ts`, add third constructor parameter: `operationPath?: string`
  - [x] Store as `private readonly operationPath?: string`
  - [x] No changes to `install()` — it always uses `this.projectPath`

- [x] **Update `GuideManager.update()` to pass `operationPath` to strategy**
  - [x] When `this.operationPath` is set and the detected method is `'submodule'`:
    1. Run the existing `strategy.update(this.projectPath, targetDir)` for the remote fetch + primary update
    2. Then call `strategy.sync(this.operationPath)` to sync the worktree checkout
  - [x] When `this.operationPath` is not set or equals `this.projectPath`: existing behavior unchanged
  - [x] The `sync()` call is only needed for SubmoduleStrategy — add a type guard or check `info.method === 'submodule'` before calling
  - [x] Note: `InstallStrategy` interface does not include `sync()`. Cast to `SubmoduleStrategy` or check with `instanceof` when calling `sync()`

- [x] **Add `syncWorktrees()` method to `GuideManager`**
  - [x] Signature: `async syncWorktrees(worktreePaths: string[]): Promise<SyncResult[]>`
  - [x] Only operates when detected guide method is `'submodule'` — return empty array otherwise
  - [x] Iterate each path, call `SubmoduleStrategy.sync()`, catch errors per-path
  - [x] Build `SyncResult` for each path: `{ worktreePath, success: true/false, error? }`
  - [x] One failure does not block others
  - [x] Success: method compiles, handles errors per-path, skips non-submodule methods

### 4. Core: Tests for GuideManager operationPath and syncWorktrees

- [x] **Add unit tests in `packages/core/tests/guides/GuideManager.test.ts`** (new file)
  - [x] Mock `GuideDetector`, `SubmoduleStrategy`, `CloneStrategy`, `TarballStrategy`
  - [x] Test: `update()` without `operationPath` calls `strategy.update()` only (no `sync()`)
  - [x] Test: `update()` with `operationPath` (submodule method) calls `strategy.update()` then `strategy.sync(operationPath)`
  - [x] Test: `update()` with `operationPath` (clone method) does NOT call `sync()` — only submodule triggers sync
  - [x] Test: `syncWorktrees()` calls `sync()` for each path and collects results
  - [x] Test: `syncWorktrees()` returns `{ success: false, error }` for failing paths without stopping
  - [x] Test: `syncWorktrees()` returns empty array when method is not `'submodule'`
  - [x] Success: all tests pass via `npx vitest run packages/core/tests/guides/GuideManager.test.ts`

### 5. Core: Add `operationPath` support to GuideDetector

- [x] **Extend `GuideDetector.detect()` to accept optional `operationPath`**
  - [x] In `packages/core/src/guides/GuideDetector.ts`, add second parameter to `detect()`: `operationPath?: string`
  - [x] When `operationPath` is set: use it for `guidePath` construction (checking if guide directory exists, detecting method, detecting version)
  - [x] The `source` parameter and `fetchLatestVersion()` still use the canonical path logic (unchanged)
  - [x] When `operationPath` is not set: existing behavior (use `projectPath` for everything)

- [x] **Add submodule sync status detection**
  - [x] New method: `async checkSyncStatus(worktreePath: string): Promise<'in_sync' | 'out_of_sync' | 'not_initialized' | 'error'>`
  - [x] Run `git submodule status project-documents/ai-project-guide` in `worktreePath`
  - [x] Parse output: space prefix = in sync, `+` prefix = out of sync, `-` prefix = not initialized
  - [x] Return `'error'` if git command fails
  - [x] Success: method returns correct status for each prefix case

- [x] **Update `GuideManager.status()` to pass `operationPath` to detector**
  - [x] When `this.operationPath` is set, call `this.detector.detect(this.projectPath, source, this.operationPath)`
  - [x] This ensures `cf guides info` from a worktree checks the guide files in that worktree's directory

### 6. Core: Tests for GuideDetector operationPath and sync status

- [x] **Add unit tests in `packages/core/tests/guides/GuideDetector.test.ts`** (new file or extend existing)
  - [x] Mock `fs.existsSync`, `fs.readFileSync`, and `gitExec`
  - [x] Test: `detect()` without `operationPath` uses `projectPath` for guidePath (existing behavior)
  - [x] Test: `detect()` with `operationPath` uses `operationPath` for guidePath
  - [x] Test: `checkSyncStatus()` returns `'in_sync'` when output starts with space
  - [x] Test: `checkSyncStatus()` returns `'out_of_sync'` when output starts with `+`
  - [x] Test: `checkSyncStatus()` returns `'not_initialized'` when output starts with `-`
  - [x] Test: `checkSyncStatus()` returns `'error'` when git command fails
  - [x] Success: all tests pass via `npx vitest run packages/core/tests/guides/GuideDetector.test.ts`

### 7. Core: Export new types and verify build

- [x] **Ensure new types are exported from `@context-forge/core`**
  - [x] `SyncResult` exported from `packages/core/src/guides/types.ts`
  - [x] Verify exports reach the package entry point (check `packages/core/src/index.ts` or barrel files)
  - [x] Run `npm run build` from project root — no errors
  - [x] Success: `SyncResult` is importable from `@context-forge/core`, build passes

### 8. CLI: Replace `getProjectPath()` with worktree-aware `getGuideContext()`

- [x] **Add `getGuideContext()` function in `packages/cli/src/commands/guides.ts`**
  - [x] Import `resolveProjectWorktree` from `../utils/project.js` (replacing `resolveProjectId`)
  - [x] Import `FileProjectStore` (already imported)
  - [x] Define `GuideContext` interface: `{ projectPath: string, operationPath: string, project: ProjectData, worktreeId?: string }`
  - [x] Implementation:
    1. Call `resolveProjectWorktree({ project: projectOpt }, store)`
    2. Fetch project by id via `store.getById()`
    3. Validate `projectPath` exists (same error as current `getProjectPath()`)
    4. If `worktreeId` returned: find worktree in `project.worktrees[]`, use `worktreePath` as `operationPath`
    5. If no worktree match or no `worktreePath`: `operationPath = projectPath`
    6. Return `{ projectPath, operationPath, project, worktreeId }`

- [x] **Update `showStatus()` to use `getGuideContext()`**
  - [x] Replace `getProjectPath(opts.project)` with `getGuideContext(opts.project)`
  - [x] Create `GuideManager` with `operationPath`: `new GuideManager(ctx.projectPath, cm, ctx.operationPath)`
  - [x] Existing display logic unchanged

- [x] **Update `cf guides update` action to use `getGuideContext()`**
  - [x] Replace `getProjectPath(opts.project)` with `getGuideContext(opts.project)`
  - [x] Create `GuideManager` with `operationPath`: `new GuideManager(ctx.projectPath, cm, ctx.operationPath)`
  - [x] Existing update logic and output unchanged

- [x] **`cf guides install` continues using `projectPath` only**
  - [x] Update to use `getGuideContext()` but pass only `ctx.projectPath` to `GuideManager` (no `operationPath`)
  - [x] This ensures install always happens at the project root
  - [x] Success: install behavior unchanged

- [x] **Remove old `getProjectPath()` function** (replaced by `getGuideContext()`)

### 9. CLI: Tests for worktree-aware guide commands

- [x] **Update tests in `packages/cli/tests/commands/guides.test.ts`**
  - [x] Update mocks: mock `resolveProjectWorktree` instead of (or in addition to) `resolveProjectId`
  - [x] Add sample project with worktrees for test data:
    ```
    { ...sampleProject, worktrees: [{ id: 'wt_1', name: 'default', worktreePath: '/tmp/test', indexRange: [100, 299] },
      { id: 'wt_2', name: 'world-server', worktreePath: '/tmp/test-ws', indexRange: [300, 499] }] }
    ```
  - [x] Test: `cf guides info` when resolved to a worktree passes `operationPath` to `GuideManager`
  - [x] Test: `cf guides update` when resolved to a worktree passes `operationPath` to `GuideManager`
  - [x] Test: `cf guides install` does NOT pass `operationPath` to `GuideManager`
  - [x] Test: when no worktree resolved, `operationPath` equals `projectPath` (backwards compatibility)
  - [x] Success: all tests pass via `npx vitest run packages/cli/tests/commands/guides.test.ts`

### 10. MCP: Enhance `guide_update` to auto-sync worktrees

- [x] **Update `guide_update` handler in `packages/mcp-server/src/tools/guideTools.ts`**
  - [x] After the existing `manager.update()` call, look up the project from the store
  - [x] If `project.worktrees` exists and has entries with `worktreePath`:
    1. Collect all `worktreePath` values (filter out undefined)
    2. Call `manager.syncWorktrees(worktreePaths)`
    3. Include `syncResults` in the JSON response alongside the existing `UpdateResult`
  - [x] If no worktrees or no paths: existing response unchanged
  - [x] The `resolveProjectPath` helper already fetches the project — refactor to also return the project object to avoid a double fetch (or do a second `store.getById()` — acceptable given low frequency of guide updates)
  - [x] Success: response includes `syncResults` array when worktrees exist

### 11. MCP: Enhance `guide_status` to report worktree sync state

- [x] **Update `guide_status` handler in `packages/mcp-server/src/tools/guideTools.ts`**
  - [x] After the existing `manager.status()` call, look up the project
  - [x] If `project.worktrees` exists, has entries with `worktreePath`, and the guide method is `'submodule'`:
    1. For each worktree with a path, call `detector.checkSyncStatus(worktreePath)`
    2. Build `worktreeSync` array: `{ name, path, status }` per worktree
    3. Include in response alongside existing `GuideInfo`
  - [x] If no worktrees, no paths, or non-submodule method: existing response unchanged
  - [x] Success: response includes `worktreeSync` array for submodule projects with worktrees

### 12. MCP: Tests for worktree-aware guide tools

- [x] **Update tests in `packages/mcp-server/tests/guideTools.test.ts`**
  - [x] Update `GuideManager` mock to include `syncWorktrees` method
  - [x] Add sample project with worktrees to test data
  - [x] Test: `guide_update` calls `syncWorktrees` when project has worktrees with paths
  - [x] Test: `guide_update` does NOT call `syncWorktrees` when project has no worktrees
  - [x] Test: `guide_update` response includes `syncResults` when worktrees synced
  - [x] Test: `guide_status` includes `worktreeSync` when project has worktrees and method is submodule
  - [x] Test: `guide_status` does NOT include `worktreeSync` for non-submodule methods
  - [x] Success: all tests pass via `npx vitest run packages/mcp-server/tests/guideTools.test.ts`

### 13. Full build and validation

- [x] **Run full build from project root**
  - [x] `npm run build` — no errors
  - [x] Success: clean build across all packages

- [x] **Run full test suite**
  - [x] `npm test` — all tests pass, including new tests from this slice
  - [x] No regressions in existing guide tests
  - [x] Success: zero test failures

- [x] **Commit and update task tracking**
  - [x] Commit all changes with semantic message: `feat: make guide operations worktree-aware`
  - [x] Check off slice 190 in the slice plan
  - [x] Update DEVLOG with summary
