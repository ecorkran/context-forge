---
slice: worktree-aware-guide-operations
project: context-forge
lld: user/slices/190-slice.worktree-aware-guide-operations.md
dependencies: [182, 186]
projectState: Guide operations (cf guides, guide_status/guide_update MCP tools) always use project.projectPath. Git submodule checkouts are per-worktree, so non-default worktrees get stale guide files while reporting the correct version.
dateCreated: 20260318
dateUpdated: 20260318
status: not_started
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

- [ ] **Add `SyncResult` interface to `packages/core/src/guides/types.ts`**
  - [ ] Add `SyncResult` with fields: `worktreePath: string`, `success: boolean`, `error?: string`
  - [ ] Export from `types.ts`
  - [ ] Success: type compiles, is importable from `@context-forge/core`

- [ ] **Add `sync()` method to `SubmoduleStrategy`**
  - [ ] In `packages/core/src/guides/strategies/SubmoduleStrategy.ts`, add method: `async sync(worktreePath: string): Promise<void>`
  - [ ] Implementation: run `git submodule update --init project-documents/ai-project-guide` in the given `worktreePath` via `gitExec`
    - Use `--init` flag to handle worktrees where the submodule was never initialized
    - Use `GUIDE_RELATIVE_PATH` constant for the submodule path argument
  - [ ] If `gitExec` throws, let it propagate (caller handles errors)
  - [ ] Success: method exists, uses `gitExec` with correct arguments, `--init` flag is present

### 2. Core: Tests for SubmoduleStrategy.sync()

- [ ] **Add unit tests for `sync()` in `packages/core/tests/guides/SubmoduleStrategy.test.ts`** (new file or extend existing if present)
  - [ ] Mock `gitExec` (the module is already used by SubmoduleStrategy)
  - [ ] Test: `sync()` calls `gitExec` with `['submodule', 'update', '--init', GUIDE_RELATIVE_PATH]` and the provided `worktreePath` as cwd
  - [ ] Test: `sync()` propagates errors from `gitExec`
  - [ ] Test: `sync()` does not use `--remote` flag
  - [ ] Success: all tests pass via `npx vitest run packages/core/tests/guides/SubmoduleStrategy.test.ts`

### 3. Core: Add `operationPath` to GuideManager and `syncWorktrees()` method

- [ ] **Extend `GuideManager` constructor to accept optional `operationPath`**
  - [ ] In `packages/core/src/guides/GuideManager.ts`, add third constructor parameter: `operationPath?: string`
  - [ ] Store as `private readonly operationPath?: string`
  - [ ] No changes to `install()` — it always uses `this.projectPath`

- [ ] **Update `GuideManager.update()` to pass `operationPath` to strategy**
  - [ ] When `this.operationPath` is set and the detected method is `'submodule'`:
    1. Run the existing `strategy.update(this.projectPath, targetDir)` for the remote fetch + primary update
    2. Then call `strategy.sync(this.operationPath)` to sync the worktree checkout
  - [ ] When `this.operationPath` is not set or equals `this.projectPath`: existing behavior unchanged
  - [ ] The `sync()` call is only needed for SubmoduleStrategy — add a type guard or check `info.method === 'submodule'` before calling
  - [ ] Note: `InstallStrategy` interface does not include `sync()`. Cast to `SubmoduleStrategy` or check with `instanceof` when calling `sync()`

- [ ] **Add `syncWorktrees()` method to `GuideManager`**
  - [ ] Signature: `async syncWorktrees(worktreePaths: string[]): Promise<SyncResult[]>`
  - [ ] Only operates when detected guide method is `'submodule'` — return empty array otherwise
  - [ ] Iterate each path, call `SubmoduleStrategy.sync()`, catch errors per-path
  - [ ] Build `SyncResult` for each path: `{ worktreePath, success: true/false, error? }`
  - [ ] One failure does not block others
  - [ ] Success: method compiles, handles errors per-path, skips non-submodule methods

### 4. Core: Tests for GuideManager operationPath and syncWorktrees

- [ ] **Add unit tests in `packages/core/tests/guides/GuideManager.test.ts`** (new file)
  - [ ] Mock `GuideDetector`, `SubmoduleStrategy`, `CloneStrategy`, `TarballStrategy`
  - [ ] Test: `update()` without `operationPath` calls `strategy.update()` only (no `sync()`)
  - [ ] Test: `update()` with `operationPath` (submodule method) calls `strategy.update()` then `strategy.sync(operationPath)`
  - [ ] Test: `update()` with `operationPath` (clone method) does NOT call `sync()` — only submodule triggers sync
  - [ ] Test: `syncWorktrees()` calls `sync()` for each path and collects results
  - [ ] Test: `syncWorktrees()` returns `{ success: false, error }` for failing paths without stopping
  - [ ] Test: `syncWorktrees()` returns empty array when method is not `'submodule'`
  - [ ] Success: all tests pass via `npx vitest run packages/core/tests/guides/GuideManager.test.ts`

### 5. Core: Add `operationPath` support to GuideDetector

- [ ] **Extend `GuideDetector.detect()` to accept optional `operationPath`**
  - [ ] In `packages/core/src/guides/GuideDetector.ts`, add second parameter to `detect()`: `operationPath?: string`
  - [ ] When `operationPath` is set: use it for `guidePath` construction (checking if guide directory exists, detecting method, detecting version)
  - [ ] The `source` parameter and `fetchLatestVersion()` still use the canonical path logic (unchanged)
  - [ ] When `operationPath` is not set: existing behavior (use `projectPath` for everything)

- [ ] **Add submodule sync status detection**
  - [ ] New method: `async checkSyncStatus(worktreePath: string): Promise<'in_sync' | 'out_of_sync' | 'not_initialized' | 'error'>`
  - [ ] Run `git submodule status project-documents/ai-project-guide` in `worktreePath`
  - [ ] Parse output: space prefix = in sync, `+` prefix = out of sync, `-` prefix = not initialized
  - [ ] Return `'error'` if git command fails
  - [ ] Success: method returns correct status for each prefix case

- [ ] **Update `GuideManager.status()` to pass `operationPath` to detector**
  - [ ] When `this.operationPath` is set, call `this.detector.detect(this.projectPath, source, this.operationPath)`
  - [ ] This ensures `cf guides info` from a worktree checks the guide files in that worktree's directory

### 6. Core: Tests for GuideDetector operationPath and sync status

- [ ] **Add unit tests in `packages/core/tests/guides/GuideDetector.test.ts`** (new file or extend existing)
  - [ ] Mock `fs.existsSync`, `fs.readFileSync`, and `gitExec`
  - [ ] Test: `detect()` without `operationPath` uses `projectPath` for guidePath (existing behavior)
  - [ ] Test: `detect()` with `operationPath` uses `operationPath` for guidePath
  - [ ] Test: `checkSyncStatus()` returns `'in_sync'` when output starts with space
  - [ ] Test: `checkSyncStatus()` returns `'out_of_sync'` when output starts with `+`
  - [ ] Test: `checkSyncStatus()` returns `'not_initialized'` when output starts with `-`
  - [ ] Test: `checkSyncStatus()` returns `'error'` when git command fails
  - [ ] Success: all tests pass via `npx vitest run packages/core/tests/guides/GuideDetector.test.ts`

### 7. Core: Export new types and verify build

- [ ] **Ensure new types are exported from `@context-forge/core`**
  - [ ] `SyncResult` exported from `packages/core/src/guides/types.ts`
  - [ ] Verify exports reach the package entry point (check `packages/core/src/index.ts` or barrel files)
  - [ ] Run `npm run build` from project root — no errors
  - [ ] Success: `SyncResult` is importable from `@context-forge/core`, build passes

### 8. CLI: Replace `getProjectPath()` with worktree-aware `getGuideContext()`

- [ ] **Add `getGuideContext()` function in `packages/cli/src/commands/guides.ts`**
  - [ ] Import `resolveProjectWorktree` from `../utils/project.js` (replacing `resolveProjectId`)
  - [ ] Import `FileProjectStore` (already imported)
  - [ ] Define `GuideContext` interface: `{ projectPath: string, operationPath: string, project: ProjectData, worktreeId?: string }`
  - [ ] Implementation:
    1. Call `resolveProjectWorktree({ project: projectOpt }, store)`
    2. Fetch project by id via `store.getById()`
    3. Validate `projectPath` exists (same error as current `getProjectPath()`)
    4. If `worktreeId` returned: find worktree in `project.worktrees[]`, use `worktreePath` as `operationPath`
    5. If no worktree match or no `worktreePath`: `operationPath = projectPath`
    6. Return `{ projectPath, operationPath, project, worktreeId }`

- [ ] **Update `showStatus()` to use `getGuideContext()`**
  - [ ] Replace `getProjectPath(opts.project)` with `getGuideContext(opts.project)`
  - [ ] Create `GuideManager` with `operationPath`: `new GuideManager(ctx.projectPath, cm, ctx.operationPath)`
  - [ ] Existing display logic unchanged

- [ ] **Update `cf guides update` action to use `getGuideContext()`**
  - [ ] Replace `getProjectPath(opts.project)` with `getGuideContext(opts.project)`
  - [ ] Create `GuideManager` with `operationPath`: `new GuideManager(ctx.projectPath, cm, ctx.operationPath)`
  - [ ] Existing update logic and output unchanged

- [ ] **`cf guides install` continues using `projectPath` only**
  - [ ] Update to use `getGuideContext()` but pass only `ctx.projectPath` to `GuideManager` (no `operationPath`)
  - [ ] This ensures install always happens at the project root
  - [ ] Success: install behavior unchanged

- [ ] **Remove old `getProjectPath()` function** (replaced by `getGuideContext()`)

### 9. CLI: Tests for worktree-aware guide commands

- [ ] **Update tests in `packages/cli/tests/commands/guides.test.ts`**
  - [ ] Update mocks: mock `resolveProjectWorktree` instead of (or in addition to) `resolveProjectId`
  - [ ] Add sample project with worktrees for test data:
    ```
    { ...sampleProject, worktrees: [{ id: 'wt_1', name: 'default', worktreePath: '/tmp/test', indexRange: [100, 299] },
      { id: 'wt_2', name: 'world-server', worktreePath: '/tmp/test-ws', indexRange: [300, 499] }] }
    ```
  - [ ] Test: `cf guides info` when resolved to a worktree passes `operationPath` to `GuideManager`
  - [ ] Test: `cf guides update` when resolved to a worktree passes `operationPath` to `GuideManager`
  - [ ] Test: `cf guides install` does NOT pass `operationPath` to `GuideManager`
  - [ ] Test: when no worktree resolved, `operationPath` equals `projectPath` (backwards compatibility)
  - [ ] Success: all tests pass via `npx vitest run packages/cli/tests/commands/guides.test.ts`

### 10. MCP: Enhance `guide_update` to auto-sync worktrees

- [ ] **Update `guide_update` handler in `packages/mcp-server/src/tools/guideTools.ts`**
  - [ ] After the existing `manager.update()` call, look up the project from the store
  - [ ] If `project.worktrees` exists and has entries with `worktreePath`:
    1. Collect all `worktreePath` values (filter out undefined)
    2. Call `manager.syncWorktrees(worktreePaths)`
    3. Include `syncResults` in the JSON response alongside the existing `UpdateResult`
  - [ ] If no worktrees or no paths: existing response unchanged
  - [ ] The `resolveProjectPath` helper already fetches the project — refactor to also return the project object to avoid a double fetch (or do a second `store.getById()` — acceptable given low frequency of guide updates)
  - [ ] Success: response includes `syncResults` array when worktrees exist

### 11. MCP: Enhance `guide_status` to report worktree sync state

- [ ] **Update `guide_status` handler in `packages/mcp-server/src/tools/guideTools.ts`**
  - [ ] After the existing `manager.status()` call, look up the project
  - [ ] If `project.worktrees` exists, has entries with `worktreePath`, and the guide method is `'submodule'`:
    1. For each worktree with a path, call `detector.checkSyncStatus(worktreePath)`
    2. Build `worktreeSync` array: `{ name, path, status }` per worktree
    3. Include in response alongside existing `GuideInfo`
  - [ ] If no worktrees, no paths, or non-submodule method: existing response unchanged
  - [ ] Success: response includes `worktreeSync` array for submodule projects with worktrees

### 12. MCP: Tests for worktree-aware guide tools

- [ ] **Update tests in `packages/mcp-server/tests/guideTools.test.ts`**
  - [ ] Update `GuideManager` mock to include `syncWorktrees` method
  - [ ] Add sample project with worktrees to test data
  - [ ] Test: `guide_update` calls `syncWorktrees` when project has worktrees with paths
  - [ ] Test: `guide_update` does NOT call `syncWorktrees` when project has no worktrees
  - [ ] Test: `guide_update` response includes `syncResults` when worktrees synced
  - [ ] Test: `guide_status` includes `worktreeSync` when project has worktrees and method is submodule
  - [ ] Test: `guide_status` does NOT include `worktreeSync` for non-submodule methods
  - [ ] Success: all tests pass via `npx vitest run packages/mcp-server/tests/guideTools.test.ts`

### 13. Full build and validation

- [ ] **Run full build from project root**
  - [ ] `npm run build` — no errors
  - [ ] Success: clean build across all packages

- [ ] **Run full test suite**
  - [ ] `npm test` — all tests pass, including new tests from this slice
  - [ ] No regressions in existing guide tests
  - [ ] Success: zero test failures

- [ ] **Commit and update task tracking**
  - [ ] Commit all changes with semantic message: `feat: make guide operations worktree-aware`
  - [ ] Check off slice 190 in the slice plan
  - [ ] Update DEVLOG with summary
