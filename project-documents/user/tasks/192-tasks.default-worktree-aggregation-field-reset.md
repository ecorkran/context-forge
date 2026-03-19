---
slice: default-worktree-aggregation-field-reset
project: context-forge
lld: user/slices/192-slice.default-worktree-aggregation-field-reset.md
dependencies: [191]
projectState: Slice 191 complete. All worktrees (including default) use operationPath + index-range filtering, but default worktree returns undefined for range (shows everything on disk). No --all aggregation. No cf unset command. Build clean, 1135 tests passing.
dateCreated: 20260319
dateUpdated: 20260319
status: not_started
---

## Context Summary
- Working on slice 192: Default Worktree Aggregation & Field Reset
- Two independent features in one slice
- Feature 1: Change `getWorktreeIndexRange()` to return range for default worktree too (behavioral change from 191). Add `--all` flag + `resolveAllOperationPaths()` + `mergeProjectModels()` for cross-worktree aggregation
- Feature 2: `cf unset <field>` command — clears fields to undefined, guards against required/readonly fields, works on project and worktree-scoped fields
- Projects without worktrees are unaffected by either feature
- Refer to slice design for full architecture and per-command details

---

## Section 1: Update `getWorktreeIndexRange` + New Helpers

- [ ] **1.1 Update `getWorktreeIndexRange` to return range for default worktree**
  - File: `packages/cli/src/utils/worktree-overlay.ts`
  - Re-read the file before modifying
  - Current: returns `undefined` when `wt.name === 'default'`
  - Change: remove the `wt.name === 'default'` check — return `wt.indexRange` for all worktrees
  - Returns `undefined` only when no `worktreeId` or no worktrees (projects without worktrees)
  - [ ] Default worktree returns its index range (not `undefined`)
  - [ ] Non-default worktree behavior unchanged
  - [ ] Projects without worktrees: returns `undefined` (no filtering)

- [ ] **1.2 Add `resolveAllOperationPaths` helper**
  - File: `packages/cli/src/utils/worktree-overlay.ts`
  - Add `resolveAllOperationPaths(project: ProjectData): string[]`
  - Collects `project.projectPath` + all `wt.worktreePath` values into a deduplicated set
  - Returns array of unique paths (filters out undefined)
  - [ ] Function exported
  - [ ] TypeScript compiles (`npx tsc --noEmit` from `packages/cli`)

- [ ] **1.3 Add `mergeProjectModels` to ProjectModelBuilder**
  - File: `packages/core/src/introspection/ProjectModelBuilder.ts`
  - Re-read the file before modifying
  - Add `mergeProjectModels(models: ProjectModel[]): ProjectModel`
  - Throws if empty array
  - Returns single model if array length is 1
  - Merges multiple models: dedup initiatives by index key (first wins), dedup foundation/quality/investigation/maintenance arrays by name, union futureSlices, `devlog = models.some(m => m.devlog)`
  - Export from `packages/core/src/node.ts` (or wherever `buildModel` is exported)
  - [ ] Function exported and compiles
  - [ ] Handles empty array (throws)
  - [ ] Handles single model (returns as-is)

- [ ] **1.4 Unit tests for updated helpers**
  - Files: `packages/cli/tests/utils/worktree-overlay.test.ts`, `packages/core/tests/introspection/ProjectModelBuilder.test.ts` (extend or create)
  - Re-read before modifying
  - `getWorktreeIndexRange`: update existing test — default worktree now returns range, not `undefined`
  - `resolveAllOperationPaths`: test with project with worktrees, without worktrees, worktree without path
  - `mergeProjectModels`: test single model, two non-overlapping, two with overlapping initiative keys (dedup), empty array throws
  - [ ] All tests pass (`npx vitest run` from both packages)

**Commit:** `feat(core,cli): update index range for default worktree, add aggregation helpers`

---

## Section 2: `cf arch list --all`

- [ ] **2.1 Add `--all` flag to `cf arch list`**
  - File: `packages/cli/src/commands/arch.ts`
  - Re-read before modifying
  - Add `.option('--all', 'Show initiatives from all worktrees')` to the list command
  - Import `resolveAllOperationPaths` and `mergeProjectModels`
  - When `opts.all` and project has worktrees:
    - Call `resolveAllOperationPaths(rawProject)` to get all paths
    - Call `buildModel()` on each path (use `Promise.all` with `.catch(() => null)`)
    - Call `mergeProjectModels()` on the non-null results
    - Display merged model — no index-range filtering
  - When not `--all`: existing behavior (single path + index-range filtering)
  - [ ] `--all` flag accepted
  - [ ] Aggregated view shows initiatives from all worktree paths
  - [ ] Default behavior (no `--all`) still filters by worktree range

- [ ] **2.2 Tests for `cf arch list --all`**
  - File: `packages/cli/tests/commands/arch.test.ts`
  - Re-read before modifying
  - Update existing "default worktree shows all" test — now default shows only its range
  - Add test: `--all` shows initiatives from all worktree paths (mock `buildModel` to return different initiatives per path)
  - Add test: `--all` without worktrees works (single path, no aggregation)
  - [ ] All CLI tests pass

**Commit:** `feat(cli): cf arch list --all for cross-worktree aggregation`

---

## Section 3: `cf plan list --all`, `cf tasks list --all`, `cf future --all`

- [ ] **3.1 Add `--all` flag to `cf plan list`**
  - File: `packages/cli/src/commands/plan.ts`
  - Re-read before modifying
  - Add `--all` option
  - When `--all`: scan architecture directory in each worktree path, deduplicate plan files by filename, parse and display
  - When not `--all`: existing behavior
  - [ ] `--all` aggregates plans from all worktree paths
  - [ ] Deduplication by filename works

- [ ] **3.2 Add `--all` flag to `cf tasks list`**
  - File: `packages/cli/src/commands/task.ts`
  - Re-read before modifying
  - Add `--all` option to the `list` subcommand
  - When `--all`: scan tasks directory in each worktree path, deduplicate task files by filename
  - When not `--all`: existing behavior
  - [ ] `--all` aggregates task files from all worktree paths

- [ ] **3.3 Add `--all` flag to `cf future`**
  - File: `packages/cli/src/commands/future.ts`
  - Re-read before modifying
  - Add `--all` option
  - When `--all`: call `collector.collect()` on each worktree path, merge results (deduplicate groups by initiative name)
  - When not `--all`: existing behavior
  - [ ] `--all` aggregates future work from all worktree paths

- [ ] **3.4 Tests for plan, tasks, future `--all`**
  - Files: relevant test files in `packages/cli/tests/commands/`
  - Add at least one test per command verifying `--all` aggregation
  - [ ] All CLI tests pass

**Commit:** `feat(cli): --all flag for plan, tasks, and future commands`

---

## Section 4: MCP `all` Parameter

- [ ] **4.1 Add `resolveAllOperationPaths` to MCP helper**
  - File: `packages/mcp-server/src/tools/resolveOperationPath.ts`
  - Re-read before modifying
  - Add function that resolves all worktree paths for a project (similar to CLI version but async, uses store)
  - Also update `resolveOperationContext` to return `indexRange` for default worktree (matching the CLI change)
  - [ ] Function exported and compiles

- [ ] **4.2 Add `all` parameter to `project_structure`**
  - File: `packages/mcp-server/src/tools/introspectionTools.ts`
  - Re-read before modifying
  - Add optional `all: z.boolean().optional().describe('Scan all worktree paths and aggregate results.')` parameter to `project_structure`
  - When `all: true`: resolve all paths, call `buildModel` on each, merge with `mergeProjectModels`
  - When `all: false` (default): existing behavior
  - [ ] `all` parameter accepted
  - [ ] Aggregated model returned when `all: true`

- [ ] **4.3 Add `all` parameter to relevant introspection tools**
  - File: `packages/mcp-server/src/tools/introspectionTools.ts`
  - Add `all` parameter to `introspection_slice_plan`, `introspection_future_work` (where aggregation makes sense)
  - `introspection_documents` and `introspection_tasks` don't need `all` — they operate on specific files
  - [ ] Parameters added where applicable

- [ ] **4.4 Tests for MCP `all` parameter**
  - File: `packages/mcp-server/tests/introspectionTools.test.ts`
  - Re-read before modifying
  - Add test: `project_structure` with `all: true` returns merged model
  - Add test: `project_structure` with `all: false` returns scoped model
  - [ ] All MCP tests pass

**Commit:** `feat(mcp): all parameter for cross-worktree aggregation`

---

## Section 5: `cf unset` Command

- [ ] **5.1 Add `projectUnsetAction` to project.ts**
  - File: `packages/cli/src/commands/project.ts`
  - Re-read before modifying
  - Add `projectUnsetAction(field: string, opts: { project?: string; projectLevel?: boolean }): Promise<void>`
  - Resolve field name via `resolveFieldName(field)` (supports aliases)
  - Guard: error if `fieldDef.required` — "Cannot unset required field"
  - Guard: error if `fieldDef.readonly` — "Cannot unset read-only field"
  - Guard: error if field not found — "Unknown field"
  - Resolve project via `resolveProjectWorktree()`
  - Route worktree-scoped fields to `WorktreeService.updateWorktree()` with `{ [wtField]: undefined }`
  - Route project-level fields to `store.update()` with `{ [resolvedField]: undefined }`
  - Print success message: `Unset {displayName} on {target}`
  - Export the function
  - [ ] Function exported and compiles
  - [ ] Guards for required, readonly, unknown fields

- [ ] **5.2 Register `cf unset` top-level command**
  - File: `packages/cli/src/index.ts`
  - Re-read before modifying
  - Add `cf unset [field]` command alongside existing `cf set` and `cf get`
  - Options: `--project <name|id>`, `--project-level`
  - When no field provided: show usage help, do not unset
  - Call `projectUnsetAction(field, opts)`
  - [ ] `cf unset <field>` works from CLI
  - [ ] `cf unset` (no args) shows usage help

- [ ] **5.3 Register `cf project unset` subcommand**
  - File: `packages/cli/src/commands/project.ts`
  - Re-read before modifying — find `registerProjectCommand`
  - Add `unset [field]` subcommand to the `project` command group
  - Same options and behavior as top-level `cf unset`
  - [ ] `cf project unset <field>` works

- [ ] **5.4 Tests for `cf unset`**
  - File: `packages/cli/tests/commands/project.test.ts`
  - Re-read before modifying
  - Add test: unset valid field calls `store.update` with `undefined`
  - Add test: unset required field (`name`) throws error
  - Add test: unset readonly field (`id`) throws error
  - Add test: unset unknown field throws error
  - Add test: unset alias (`arch`) resolves to `fileArch`
  - Add test: unset worktree-scoped field from worktree calls `updateWorktree` with `undefined`
  - [ ] All CLI tests pass

**Commit:** `feat(cli): cf unset command for explicit field clearing`

---

## Section 6: Build, Test, and Verify

- [ ] **6.1 Full build verification**
  - Run `npm run build` from project root
  - [ ] Build completes with no errors

- [ ] **6.2 Full test suite**
  - Run `npx vitest run` from `packages/core`, `packages/cli`, `packages/mcp-server`
  - [ ] All core tests pass
  - [ ] All CLI tests pass
  - [ ] All MCP tests pass

**Commit:** (no separate commit — verification only)

---

## Section 7: Documentation and Wrap-Up

- [ ] **7.1 Update slice plan**
  - Check off slice 192 in `user/architecture/180-slices.initiative-context-worktree.md`
  - [ ] Slice 192 entry marked `[x]`

- [ ] **7.2 Update slice design status**
  - Set `status: complete` in `user/slices/192-slice.default-worktree-aggregation-field-reset.md` frontmatter
  - [ ] Status is `complete`

- [ ] **7.3 Update task file status**
  - Set `status: complete` in this file's frontmatter
  - [ ] Status is `complete`

- [ ] **7.4 Write DEVLOG entry**
  - Append entry to `DEVLOG.md` with slice 192 completion summary and commit hashes
  - [ ] DEVLOG entry written

**Commit:** `docs: complete slice 192 default worktree aggregation and field reset`

---

## Section 8: Verification Walkthrough

Follow the verification walkthrough from the slice design. Update with actual results.

- [ ] **8.1 Default worktree scoped to its own range**
  - From `~/repos/migratory`, run `cf arch list`
  - Verify only 100-range shown (default worktree's range)
  - [ ] Scoped correctly

- [ ] **8.2 `--all` aggregation**
  - From `~/repos/migratory`, run `cf arch list --all`
  - Verify both 100-range and 300-range shown
  - [ ] Aggregation works

- [ ] **8.3 Non-default worktree unchanged**
  - From `~/repos/migratory-world-server`, run `cf arch list`
  - Verify only 300-range shown
  - [ ] Same as slice 191

- [ ] **8.4 `cf unset` basic usage**
  - `cf set arch 300` then `cf unset arch` then `cf get`
  - Verify arch shows `—` (unset)
  - [ ] Field cleared

- [ ] **8.5 `cf unset` required field guard**
  - `cf unset name` → error
  - [ ] Guard works

- [ ] **8.6 No regression for projects without worktrees**
  - From `~/repos/context-forge`, run `cf arch list`
  - Verify identical to current behavior
  - [ ] No regression

- [ ] **8.7 Update slice design verification walkthrough**
  - Update the Verification Walkthrough section of the slice design with actual results
  - [ ] Walkthrough updated

**Commit:** `docs: update 192 slice design verification walkthrough with actual results`
