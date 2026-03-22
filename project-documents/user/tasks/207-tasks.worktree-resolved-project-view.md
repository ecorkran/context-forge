---
slice: worktree-resolved-project-view
project: context-forge
lld: user/slices/207-slice.worktree-resolved-project-view.md
dependencies: [206]
projectState: Slice 206 (CLI/MCP Shared-Logic Consolidation) design complete, not yet implemented. All worktree CRUD, overlay, and range operations working. applyWorktreeOverlay() exists in core. 16 call sites across CLI (11) and MCP (5) currently apply overlay inline. Build clean.
dateCreated: 20260322
dateUpdated: 20260322
status: not_started
---

## Context Summary
- Working on slice 207: Worktree-Resolved Project View
- Introduces `resolveProject()` in `@context-forge/core` to centralize scattered inline `applyWorktreeOverlay()` calls
- `ResolvedProject` type extends `ProjectData` with `resolvedWorktree?: { id, name }` metadata
- All single-worktree retrieval points (MCP tools + CLI commands) switch to `resolveProject()`
- Multi-view iteration sites (check.ts, workflow_check) are excluded — they iterate all worktrees, a different pattern
- `project_get` gains optional `worktreeId` parameter (new capability)
- Refer to slice design for full architecture, data flow, and design rationale
- Depends on slice 206 for shared constants in core (must be implemented first)

---

## Section 1: Core — resolveProject() Function

- [ ] **1.1 Create `ResolvedProject` type and `resolveProject()` function**
  - File: `packages/core/src/services/projectResolver.ts` (new file)
  - Implement as specified in slice design — see "resolveProject() Function Design" section
  - `ResolvedProject` extends `ProjectData` with `resolvedWorktree?: { id: string; name: string }`
  - `resolveProject(store, projectId, worktreeId?)` — returns `ResolvedProject | null`
  - When `worktreeId` is provided: look up by ID first, then by name (matching existing pattern in workflowTools.ts)
  - Throws on missing worktree (no silent fallback)
  - Returns `null` for missing project (consistent with `store.getById()`)
  - Uses `applyWorktreeOverlay()` internally — import from `../utils/worktree-overlay.js`
  - Uses `WorktreeService` for worktree lookup — import from `./WorktreeService.js`
  - [ ] Function implemented with correct signature
  - [ ] Throws `Error` when worktreeId provided but worktree not found
  - [ ] Returns `null` when project not found
  - [ ] Returns unmodified project when worktreeId omitted
  - [ ] `resolvedWorktree` field present only when overlay applied

- [ ] **1.2 Export `resolveProject` and `ResolvedProject` from core**
  - File: `packages/core/src/index.ts`
  - Add export line: `export { resolveProject, type ResolvedProject } from './services/projectResolver.js';`
  - [ ] `resolveProject` importable from `@context-forge/core`
  - [ ] `ResolvedProject` type importable from `@context-forge/core`
  - [ ] TypeScript compiles (`npx tsc --noEmit` from `packages/core`)

- [ ] **1.3 Unit tests for `resolveProject()`**
  - File: `packages/core/src/services/__tests__/projectResolver.test.ts` (new file)
  - Follow existing test patterns in `packages/core/src/services/__tests__/`
  - Test cases:
    1. Returns `null` when project not found
    2. Returns raw project (no `resolvedWorktree`) when `worktreeId` omitted
    3. Returns overlay-applied project when valid worktree ID provided — verify `fileSlice`, `fileArch`, `developmentPhase`, `instruction`, `workType`, `fileSlicePlan`, `fileTasks` all reflect worktree values
    4. Returns overlay-applied project when valid worktree name provided (name lookup)
    5. Throws when worktreeId provided but worktree not found
    6. `resolvedWorktree` contains correct `{ id, name }` from the matched worktree
  - [ ] All 6 test cases pass
  - [ ] `npm test` from `packages/core` passes (no regressions)

- [ ] **1.4 Commit: core resolveProject function and tests**
  - Commit from project root
  - Include: `packages/core/src/services/projectResolver.ts`, `packages/core/src/index.ts`, test file
  - Prefix: `feat(core): add resolveProject for centralized worktree overlay resolution`
  - [ ] Build passes after commit

---

## Section 2: MCP Workflow Tools Migration

- [ ] **2.1 Update `workflow_status` to use `resolveProject()`**
  - File: `packages/mcp-server/src/tools/workflowTools.ts`
  - Re-read the file before modifying
  - In the `workflow_status` handler (around line 157-170):
    - Replace the inline worktree lookup + `applyWorktreeOverlay()` block with a call to `resolveProject(store, resolvedId, args.worktreeId)`
    - Handle the `null` return (project not found) — existing error handling pattern
    - Handle the throw (worktree not found) — catch and return `errorResult()` with the error message
    - Extract `worktreeField` from `resolved.resolvedWorktree` instead of manual lookup
  - [ ] `workflow_status` without `worktreeId` behaves identically to before
  - [ ] `workflow_status` with valid `worktreeId` returns same overlay-applied results as before
  - [ ] `workflow_status` with invalid `worktreeId` returns clear error message

- [ ] **2.2 Update `workflow_next` to use `resolveProject()`**
  - File: `packages/mcp-server/src/tools/workflowTools.ts`
  - Same pattern as 2.1 — the `workflow_next` handler (around line 218-231) has identical inline overlay logic
  - Replace with `resolveProject()` call, same error handling pattern
  - [ ] `workflow_next` without `worktreeId` behaves identically
  - [ ] `workflow_next` with valid `worktreeId` returns same results
  - [ ] `workflow_next` with invalid `worktreeId` returns clear error

- [ ] **2.3 Clean up imports in workflowTools.ts**
  - Remove `applyWorktreeOverlay` from imports (if no longer used in this file)
  - Remove `WorktreeService` import (if no longer used — note: `workflow_check` may still use it for multi-view iteration)
  - Add `resolveProject` import from `@context-forge/core`
  - [ ] No unused imports remain
  - [ ] TypeScript compiles

- [ ] **2.4 Tests for workflow tools migration**
  - Run existing MCP tests: `npm test` from `packages/mcp-server`
  - If existing tests don't cover worktree resolution in workflow tools, add test cases verifying:
    - `workflow_status` with worktreeId returns overlay-applied state
    - `workflow_next` with worktreeId returns overlay-applied recommendations
  - [ ] All existing MCP tests pass
  - [ ] Worktree resolution verified for both tools

- [ ] **2.5 Commit: workflow tools migration**
  - Commit from project root
  - Prefix: `refactor(mcp): use resolveProject in workflow tools`
  - [ ] Build passes after commit

---

## Section 3: MCP project_get — Add worktreeId Parameter

- [ ] **3.1 Add `worktreeId` parameter to `project_get` input schema**
  - File: `packages/mcp-server/src/tools/projectTools.ts`
  - Re-read the file before modifying
  - Add to inputSchema: `worktreeId: z.string().optional().describe('Worktree ID or name. When provided, returns the resolved project view with worktree-scoped fields reflecting the worktree values.')`,
  - Update handler to destructure `worktreeId` from args
  - Replace `store.getById(resolvedId)` with `resolveProject(store, resolvedId, worktreeId)`
  - Handle `resolveProject` throw (worktree not found) — catch and return `errorResult()`
  - Introspection should run against the resolved project (so artifact checks reflect the worktree's active slice)
  - Include `resolvedWorktree` in the response when present
  - [ ] `project_get` without `worktreeId` returns identical response to before
  - [ ] `project_get` with valid `worktreeId` returns overlay-applied top-level fields
  - [ ] `project_get` with valid `worktreeId` includes `resolvedWorktree: { id, name }` in response
  - [ ] `project_get` with invalid `worktreeId` returns clear error
  - [ ] Introspection reflects worktree's active slice when `worktreeId` provided

- [ ] **3.2 Tests for project_get worktree resolution**
  - Add test cases in existing MCP project tools test file
  - Test: `project_get` with `worktreeId` returns resolved fields
  - Test: `project_get` with invalid `worktreeId` returns error
  - Test: `project_get` without `worktreeId` returns raw project (backwards compatible)
  - [ ] All new tests pass
  - [ ] All existing MCP tests pass

- [ ] **3.3 Commit: project_get worktree resolution**
  - Commit from project root
  - Prefix: `feat(mcp): add worktreeId parameter to project_get`
  - [ ] Build passes after commit

---

## Section 4: MCP Context Tools Migration

- [ ] **4.1 Update `context_build` to use `resolveProject()`**
  - File: `packages/mcp-server/src/tools/contextTools.ts`
  - Re-read the file before modifying
  - In the `context_build` handler (around line 141):
    - Replace inline worktree lookup + `applyWorktreeOverlay()` + manual field extraction with `resolveProject()`
    - The resolved project already has overlay-applied top-level fields
    - Still pass `worktreeId` to `generateContext()` for metadata/identity purposes
    - The `worktreeOverrides` object construction can be simplified — the resolved project's top-level fields are already correct
  - Review how `generateContext()` uses `worktreeOverrides` — determine if overrides are still needed or if the pre-resolved project makes them redundant
  - [ ] `context_build` without worktree produces identical output
  - [ ] `context_build` with worktree produces identical output (diff test)
  - [ ] No inline worktree lookup/overlay logic remains in the handler

- [ ] **4.2 Update `context_summarize` to use `resolveProject()`**
  - File: `packages/mcp-server/src/tools/contextTools.ts`
  - Same pattern as 4.1 — the `context_summarize` handler (around line 210) has similar overlay logic
  - Replace with `resolveProject()`, maintain worktreeId threading for metadata
  - [ ] `context_summarize` without worktree produces identical output
  - [ ] `context_summarize` with worktree produces identical output

- [ ] **4.3 Clean up imports in contextTools.ts**
  - Remove `applyWorktreeOverlay` from imports if no longer used
  - Remove `WorktreeService` import if no longer used
  - Add `resolveProject` import from `@context-forge/core`
  - [ ] No unused imports
  - [ ] TypeScript compiles

- [ ] **4.4 Tests for context tools migration**
  - Run existing MCP tests: `npm test` from `packages/mcp-server`
  - Verify context output parity: generate context with worktree before and after changes, compare outputs
  - [ ] All existing MCP tests pass
  - [ ] Context output identical for worktree and non-worktree cases

- [ ] **4.5 Commit: context tools migration**
  - Commit from project root
  - Prefix: `refactor(mcp): use resolveProject in context tools`
  - [ ] Build passes after commit

---

## Section 5: CLI Commands Migration

- [ ] **5.1 Update `cf next` (next.ts) to use `resolveProject()`**
  - File: `packages/cli/src/commands/next.ts`
  - Re-read the file before modifying
  - Replace `applyWorktreeOverlay(rawProject, worktreeId)` call (line 25) with `resolveProject(store, id, worktreeId)`
  - Adjust error handling: `resolveProject` throws on missing worktree, returns null on missing project
  - [ ] `cf next` without worktree behaves identically
  - [ ] `cf next` with worktree shows resolved overlay values

- [ ] **5.2 Update `cf build` (build.ts) to use `resolveProject()`**
  - File: `packages/cli/src/commands/build.ts`
  - Replace `applyWorktreeOverlay(rawProject, worktreeId)` call (line 51) with `resolveProject()`
  - [ ] `cf build` without worktree produces identical output
  - [ ] `cf build` with worktree produces identical output

- [ ] **5.3 Update `cf status` (status.ts) to use `resolveProject()`**
  - File: `packages/cli/src/commands/status.ts`
  - Two call sites:
    1. Line 47: multi-view iteration (`worktrees.map(...)`) — this iterates ALL worktrees for the status summary. Use `resolveProject(store, projectId, wt.id)` for each worktree in the map.
    2. Line 108: single worktree resolution — replace with `resolveProject()`
  - For the multi-view site: `resolveProject` is async, ensure the `Promise.all` pattern handles this correctly
  - [ ] `cf status` without worktree shows same summary as before
  - [ ] `cf status` with worktree shows resolved values

- [ ] **5.4 Update `cf arch list` (arch.ts) to use `resolveProject()`**
  - File: `packages/cli/src/commands/arch.ts`
  - Replace `applyWorktreeOverlay(rawProject, worktreeId)` call (line 32) with `resolveProject()`
  - [ ] `cf arch list` with worktree behaves identically

- [ ] **5.5 Update `cf plan list` (plan.ts) to use `resolveProject()`**
  - File: `packages/cli/src/commands/plan.ts`
  - Replace `applyWorktreeOverlay(rawProject, worktreeId)` call (line 36) with `resolveProject()`
  - [ ] `cf plan list` with worktree behaves identically

- [ ] **5.6 Update `cf slice list` (slice.ts) to use `resolveProject()`**
  - File: `packages/cli/src/commands/slice.ts`
  - Replace `applyWorktreeOverlay(rawProject, worktreeId)` call (line 32) with `resolveProject()`
  - [ ] `cf slice list` with worktree behaves identically

- [ ] **5.7 Update `cf tasks` (task.ts) to use `resolveProject()`**
  - File: `packages/cli/src/commands/task.ts`
  - Two call sites (lines 38 and 74) — replace both with `resolveProject()`
  - [ ] `cf tasks list` with worktree behaves identically
  - [ ] `cf tasks items` with worktree behaves identically

- [ ] **5.8 Update `cf project set` display (project.ts) to use `resolveProject()`**
  - File: `packages/cli/src/commands/project.ts`
  - Call site at line 211: used for index resolution display context
  - This is in the `cf set` flow — overlay is used to resolve file indices in the worktree context
  - Replace with `resolveProject()` — the resolved project provides the correct field values for index resolution
  - [ ] `cf set` with worktree resolves file indices correctly

- [ ] **5.9 Tests for CLI commands migration**
  - Run existing CLI tests: `npm test` from `packages/cli`
  - [ ] All existing CLI tests pass
  - [ ] No regressions in worktree-related CLI behavior

- [ ] **5.10 Commit: CLI commands migration**
  - Commit from project root
  - Include all modified CLI command files
  - Prefix: `refactor(cli): use resolveProject in all commands`
  - [ ] Build passes after commit

---

## Section 6: Cleanup and Final Validation

- [ ] **6.1 Remove unused `applyWorktreeOverlay` imports from consumer files**
  - Check each modified file in CLI and MCP for stale imports
  - `applyWorktreeOverlay` should only remain imported in:
    - `packages/core/` (where it's defined and re-exported)
    - `check.ts` and `workflowTools.ts` `workflow_check` handler (multi-view iteration, excluded from this slice)
    - Test files
  - Remove the CLI re-export in `packages/cli/src/utils/worktree-overlay.ts` if it only re-exported `applyWorktreeOverlay` and that import is no longer used by CLI commands
  - [ ] No unused `applyWorktreeOverlay` imports in modified files
  - [ ] TypeScript compiles cleanly

- [ ] **6.2 Verify no inline overlay calls remain in migrated code**
  - Run: `grep -rn "applyWorktreeOverlay" packages/mcp-server/src/tools/ packages/cli/src/commands/ --include="*.ts"`
  - Expected: matches only in `check.ts` and `workflowTools.ts` `workflow_check` (multi-view iteration sites)
  - [ ] No unexpected matches

- [ ] **6.3 Full test suite pass**
  - Run `npm test` from project root
  - All packages (core, cli, mcp-server, electron) must pass
  - [ ] All tests pass

- [ ] **6.4 Final commit: cleanup**
  - Commit from project root
  - Prefix: `refactor: clean up unused overlay imports after resolveProject migration`
  - [ ] Build passes after commit
