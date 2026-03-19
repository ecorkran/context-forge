---
slice: worktree-aware-file-operations
project: context-forge
lld: user/slices/191-slice.worktree-aware-file-operations.md
dependencies: [182, 183]
projectState: Slice 190 complete. CLI commands (arch list, slice list, tasks list, plan list, set, check, future, status --worktrees, prompt list/get) and MCP introspection tools use project.projectPath for filesystem ops — invisible to worktree-specific documents. Index-range filtering not implemented. Build clean.
dateCreated: 20260318
dateUpdated: 20260319
status: complete
---

## Context Summary
- Working on slice 191: Worktree-Aware File Operations
- Two-part fix: (1) path resolution — use worktree filesystem path, (2) index-range scoping — filter results to worktree's index range for non-default worktrees
- Default worktree shows everything (no filter); non-default worktrees show only their index range
- `cf set` with out-of-range index warns but allows
- Core services (`buildModel`, `resolveFileByIndex`, etc.) already accept a path string — callers just pass the right one
- MCP `worktreeId` parameter accepts name or ID
- `cf status --worktrees` is a project-wide dashboard — path resolution only, no index filtering
- Refer to slice design for full architecture and per-command filtering strategy

---

## Section 1: Shared Helpers and Tests

- [x] **1.1 Add `resolveOperationPath`, `getWorktreeIndexRange`, `isInIndexRange` to worktree-overlay.ts**
  - File: `packages/cli/src/utils/worktree-overlay.ts`
  - Re-read the file before modifying
  - Add `resolveOperationPath(project, worktreeId?)` — returns `wt.worktreePath` if worktree found, else `project.projectPath`
  - Add `getWorktreeIndexRange(project, worktreeId?)` — returns `[start, end]` for non-default worktrees, `undefined` for default or no worktree
  - Add `isInIndexRange(index, range?)` — returns `true` if no range or index within range
  - See slice design "Shared Helpers" section for signatures
  - [x] All three functions exported
  - [x] TypeScript compiles (`npx tsc --noEmit` from `packages/cli`)

- [x] **1.2 Unit tests for shared helpers**
  - File: `packages/cli/tests/utils/worktree-overlay.test.ts` (extend existing or create)
  - Re-read the file before modifying
  - `resolveOperationPath`: test with worktreeId + path exists, worktreeId + no path, no worktreeId, no worktrees array
  - `getWorktreeIndexRange`: test non-default returns range, default returns undefined, no worktreeId returns undefined
  - `isInIndexRange`: test in range, out of range, no range returns true, boundary values
  - [x] All tests pass (`npx vitest run` from `packages/cli`)

**Commit:** `feat(cli): add worktree operation path and index range helpers`

---

## Section 2: `cf set` — Path Resolution + Out-of-Range Warning

- [x] **2.1 Update `projectSetAction` in project.ts to use worktree path**
  - File: `packages/cli/src/commands/project.ts`
  - Re-read the file before modifying — focus on `projectSetAction` and `deriveFromSlicePlan`
  - Import `resolveOperationPath` and `getWorktreeIndexRange` from worktree-overlay
  - In the worktree branch of `projectSetAction` (where `worktreeId` is set and field is worktree-scoped):
    - Resolve `operationPath` from the worktree
    - Pass `operationPath` instead of `existing.projectPath` to all `resolveFileByIndex()` calls
  - In the project-level branch: continue using `existing.projectPath`
  - Update `deriveFromSlicePlan()` similarly if it uses `project.projectPath`
  - [x] `resolveFileByIndex` calls use worktree path when in worktree context
  - [x] Project-level `cf set` unchanged

- [x] **2.2 Add out-of-range warning for `cf set`**
  - File: `packages/cli/src/commands/project.ts`
  - When `worktreeId` is set and field is index-based (fileArch, fileSlicePlan, fileSlice, fileTasks):
    - After resolving the file, extract the index from the resolved value
    - Call `getWorktreeIndexRange(project, worktreeId)` to get the range
    - If index is outside range: `console.warn(\`Warning: index ${index} is outside this worktree's range [${range[0]}-${range[1]}]\`)`
    - Allow the operation to proceed regardless
  - [x] Warning emitted for out-of-range index
  - [x] Operation still succeeds

- [x] **2.3 Tests for `cf set` worktree path and warning**
  - File: `packages/cli/tests/commands/project.test.ts`
  - Re-read before modifying
  - Add test: `cf set arch <index>` from worktree resolves file from worktree path
  - Add test: `cf set arch <out-of-range-index>` emits warning but succeeds
  - [x] All CLI tests pass (`npx vitest run` from `packages/cli`)

**Commit:** `feat(cli): worktree-aware cf set with out-of-range warning`

---

## Section 3: `cf arch list` — Path + Index Filtering

- [x] **3.1 Update arch.ts to use worktree path and filter by index range**
  - File: `packages/cli/src/commands/arch.ts`
  - Re-read before modifying
  - Import `resolveOperationPath`, `getWorktreeIndexRange`, `isInIndexRange`
  - Already uses `resolveProjectWorktree()` — get `worktreeId`
  - Resolve `operationPath` and pass to `buildModel()` instead of `project.projectPath`
  - Get `indexRange` via `getWorktreeIndexRange()`
  - After `buildModel()` returns, filter the model's initiatives: keep only those whose index is in range
  - [x] `buildModel` receives worktree path
  - [x] Non-default worktree shows only in-range arch docs
  - [x] Default worktree shows all

- [x] **3.2 Tests for `cf arch list` filtering**
  - File: `packages/cli/tests/commands/arch.test.ts`
  - Re-read before modifying
  - Add test: arch list from non-default worktree shows only in-range entries
  - Add test: arch list from default worktree shows all entries
  - Add test: arch list with no worktrees (regression)
  - [x] All CLI tests pass

**Commit:** `feat(cli): worktree-aware cf arch list with index filtering`

---

## Section 4: `cf slice list` — Path + Index Filtering

- [x] **4.1 Update slice.ts to use worktree path and filter by index range**
  - File: `packages/cli/src/commands/slice.ts`
  - Re-read before modifying
  - Import helpers; already uses `resolveProjectWorktree()`
  - Use `operationPath` for slice plan path join and `detectDocuments()` calls
  - Filter slice plan entries by index range before display
  - [x] Plan path resolves from worktree
  - [x] Non-default worktree shows only in-range slices

- [x] **4.2 Tests for `cf slice list` filtering**
  - File: `packages/cli/tests/commands/slice.test.ts`
  - Re-read before modifying
  - Add test: slice list from non-default worktree filters by range
  - [x] All CLI tests pass

**Commit:** `feat(cli): worktree-aware cf slice list with index filtering`

---

## Section 5: `cf tasks list` / `cf tasks items` — Path + Index Filtering

- [x] **5.1 Update task.ts to use worktree path and filter by index range**
  - File: `packages/cli/src/commands/task.ts`
  - Re-read before modifying
  - Import helpers; already uses `resolveProjectWorktree()`
  - `listTaskFiles()` and `listTaskItems()` use `project.projectPath!` — replace with `operationPath` parameter
  - In `listTaskFiles()`: after scanning the tasks directory, filter files by extracting the numeric prefix and checking against range
  - In `listTaskItems()`: same path fix for resolving task file paths
  - [x] Tasks directory scanned from worktree path
  - [x] Non-default worktree shows only in-range task files

- [x] **5.2 Tests for `cf tasks` filtering**
  - File: `packages/cli/tests/commands/task.test.ts`
  - Re-read before modifying
  - Add test: tasks list from non-default worktree filters by range
  - [x] All CLI tests pass

**Commit:** `feat(cli): worktree-aware cf tasks with index filtering`

---

## Section 6: `cf plan list` — Path + Index Filtering

- [x] **6.1 Update plan.ts to use worktree path and filter by index range**
  - File: `packages/cli/src/commands/plan.ts`
  - Re-read before modifying
  - Import helpers; already uses `resolveProjectWorktree()`
  - Use `operationPath` for architecture directory scan
  - Filter discovered slice plan files by index prefix against range
  - [x] Architecture directory scanned from worktree path
  - [x] Non-default worktree shows only in-range plans

- [x] **6.2 Tests for `cf plan list` filtering**
  - File: `packages/cli/tests/commands/plan.test.ts`
  - Re-read before modifying
  - Add test: plan list from non-default worktree filters by range
  - [x] All CLI tests pass

**Commit:** `feat(cli): worktree-aware cf plan list with index filtering`

---

## Section 7: `cf check` — Worktree Path Override + Range Scoping

- [x] **7.1 Update check.ts to override projectPath on worktree views**
  - File: `packages/cli/src/commands/check.ts`
  - Re-read before modifying
  - Currently uses `resolveProjectId()` — migrate to `resolveProjectWorktree()` to get `worktreeId`
  - In the worktree view construction (`projectViews`): set `view.projectPath = wt.worktreePath` for each worktree with a path
  - When run from a non-default worktree (not `--all` mode): the checker should only iterate slice plan entries within the worktree's index range
  - Pre-filter: after `checkAll()` returns, filter findings to only include those with locations within the range, OR pass a filtered slice plan view
  - [x] Each worktree view has correct projectPath for filesystem scanning
  - [x] Non-default worktree check scoped to index range

- [x] **7.2 Tests for `cf check` worktree awareness**
  - File: `packages/cli/tests/commands/check.test.ts`
  - Re-read before modifying
  - Add test: check from worktree scopes to worktree's index range
  - [x] All CLI tests pass

**Commit:** `feat(cli): worktree-aware cf check with index scoping`

---

## Section 8: `cf status --worktrees`, `cf future`, `cf prompt`

- [x] **8.1 Update status.ts — worktree path for plan parsing**
  - File: `packages/cli/src/commands/status.ts`
  - Re-read before modifying
  - In the `--worktrees` dashboard code: when resolving each worktree's slice plan path, use that worktree's `worktreePath` instead of `rawProject.projectPath`
  - No index-range filtering — this is a project-wide view
  - [x] Each worktree's progress reads from its own path
  - [x] Dashboard shows all worktrees regardless of CWD

- [x] **8.2 Update future.ts — worktree path + index filtering**
  - File: `packages/cli/src/commands/future.ts`
  - Re-read before modifying
  - Currently uses `resolveProjectId()` — migrate to `resolveProjectWorktree()`
  - Import helpers; resolve `operationPath` and `indexRange`
  - Pass `operationPath` to `collector.collect()` instead of `project.projectPath`
  - Filter collected results by index range
  - [x] Future work scanned from worktree path
  - [x] Non-default worktree shows only in-range items

- [x] **8.3 Update prompt.ts — worktree path resolution**
  - File: `packages/cli/src/commands/prompt.ts`
  - Re-read before modifying
  - Currently uses `resolveProjectId()` — migrate to `resolveProjectWorktree()`
  - Import `resolveOperationPath`; use `operationPath` for prompt file path and phase shorthands
  - No index-range filtering (prompts are not index-based)
  - [x] Prompt file read from worktree path
  - [x] Existing prompt behavior unchanged

- [x] **8.4 Tests for status, future, prompt worktree changes**
  - Files: relevant test files in `packages/cli/tests/commands/`
  - Re-read before modifying
  - Add test for `cf future` from non-default worktree: filtered by range
  - Add test for `cf prompt list` from worktree: reads from worktree path
  - [x] All CLI tests pass

**Commit:** `feat(cli): worktree-aware status, future, and prompt commands`

---

## Section 9: MCP Introspection Tools

- [x] **9.1 Add `resolveOperationContext` helper for MCP**
  - File: `packages/mcp-server/src/tools/resolveOperationPath.ts` (new file)
  - Add `ResolvedOperation` interface and `resolveOperationContext()` function
  - See slice design "MCP Changes" section for implementation
  - Accepts `worktreeId` as name or ID (match against `w.id || w.name`)
  - Returns `{ operationPath, indexRange? }` — `indexRange` undefined for default worktree
  - [x] Function exported and compiles
  - [x] Resolves by name or ID

- [x] **9.2 Add `worktreeId` parameter to MCP introspection tools**
  - File: `packages/mcp-server/src/tools/introspectionTools.ts`
  - Re-read before modifying
  - Add optional `worktreeId` input parameter (`.describe('Worktree name or ID. Omit to use project root.')`) to:
    - `project_structure`
    - `introspection_documents`
    - `introspection_tasks`
    - `introspection_future_work`
    - `introspection_slice_plan`
  - In each handler: call `resolveOperationContext()` to get `operationPath` and `indexRange`
  - Pass `operationPath` to core functions instead of `projectPath`
  - Apply index-range filtering to results where applicable:
    - `project_structure`: filter `buildModel()` result initiatives by range
    - `introspection_documents`: filter by slice index if range active
    - `introspection_future_work`: filter results by index range
    - `introspection_slice_plan`: filter entries by index range
    - `introspection_tasks`: no index filtering (task files are already specific)
  - [x] All 5 tools accept `worktreeId`
  - [x] Results filtered by index range for non-default worktrees

- [x] **9.3 Tests for MCP introspection worktree support**
  - File: `packages/mcp-server/tests/introspectionTools.test.ts`
  - Re-read before modifying
  - Add test: `project_structure` with worktreeId (by name) returns filtered results
  - Add test: `project_structure` without worktreeId returns all results
  - Add test: `resolveOperationContext` resolves by name and by ID
  - [x] All MCP tests pass (`npx vitest run` from `packages/mcp-server`)

**Commit:** `feat(mcp): worktree-aware introspection tools with index filtering`

---

## Section 10: Build, Test, and Verify

- [x] **10.1 Full build verification**
  - Run `npm run build` from project root
  - [x] Build completes with no errors

- [x] **10.2 Full test suite**
  - Run `npx vitest run` from `packages/core`, `packages/cli`, `packages/mcp-server`
  - [x] All core tests pass (658)
  - [x] All CLI tests pass (309)
  - [x] All MCP tests pass (168)

**Commit:** (no separate commit — verification only)

---

## Section 11: Documentation and Wrap-Up

- [x] **11.1 Update slice plan**
  - Check off slice 191 in `user/architecture/180-slices.initiative-context-worktree.md`
  - [x] Slice 191 entry marked `[x]`

- [x] **11.2 Update slice design status**
  - Set `status: complete` in `user/slices/191-slice.worktree-aware-file-operations.md` frontmatter
  - [x] Status is `complete`

- [x] **11.3 Update task file status**
  - Set `status: complete` in this file's frontmatter
  - [x] Status is `complete`

- [x] **11.4 Write DEVLOG entry**
  - Append entry to `DEVLOG.md` with slice 191 completion summary and commit hashes
  - [x] DEVLOG entry written

**Commit:** `docs: complete slice 191 worktree-aware file operations`

---

## Section 12: Verification Walkthrough

Follow the verification walkthrough from the slice design. Update with actual results.

- [ ] **12.1 `cf arch list` from non-default worktree**
  - From `~/repos/migratory-world-server`, run `cf arch list`
  - Verify only 300-range docs shown
  - [ ] Scoped to worktree's index range

- [ ] **12.2 `cf arch list` from default worktree**
  - From `~/repos/migratory`, run `cf arch list`
  - Verify all arch docs shown
  - [ ] No filtering for default worktree

- [ ] **12.3 `cf set arch` from worktree — in range and out of range**
  - From `~/repos/migratory-world-server`:
    - `cf set arch 300` — succeeds
    - `cf set arch 100` — warns but succeeds
  - [ ] In-range works, out-of-range warns

- [ ] **12.4 No regression for projects without worktrees**
  - From `~/repos/context-forge`, run `cf arch list`
  - Verify identical to current behavior
  - [ ] No regression

- [ ] **12.5 Update slice design verification walkthrough**
  - Update the Verification Walkthrough section of the slice design with actual results
  - [ ] Walkthrough updated with actual commands and output

**Commit:** `docs: update 191 slice design verification walkthrough with actual results`
