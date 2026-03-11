---
slice: mcp-worktree-tools
project: context-forge
lld: user/slices/186-slice.mcp-worktree-tools.md
dependencies: [181-worktree-context-data-model-storage, 182-worktree-discovery-cwd-resolution]
projectState: WorktreeService with full CRUD + migration in core; CLI worktree commands and field routing implemented (slices 181-184); MCP server has 26 tools across 6 modules; applyWorktreeOverlay in CLI utils
dateCreated: 20260311
dateUpdated: 20260311
status: complete
---

## Context Summary

- Working on slice 186: MCP Worktree Tools
- Core `WorktreeService` provides all CRUD operations (addWorktree, updateWorktree, removeWorktree, listWorktrees, getWorktree, getWorktreeByName) with forward/reverse migration
- CLI already has worktree-aware `cf set`/`cf get` with `WORKTREE_SCOPED_FIELDS` routing and `applyWorktreeOverlay`
- MCP server follows consistent patterns: `registerXxxTools(server)`, Zod schemas, `errorResult`/`jsonResult`/`textResult` helpers, `resolveProjectId()` for project resolution
- This slice adds 5 new CRUD tools in `worktreeTools.ts` and extends 4 existing tools with optional worktree parameters
- All new tools delegate to existing `WorktreeService` — no new business logic
- Next planned slice: 187 (Validation, Edge Cases & Polish)

## Tasks

### 1. Move `applyWorktreeOverlay` from CLI to core

- [x] Move `packages/cli/src/utils/worktree-overlay.ts` → `packages/core/src/utils/worktree-overlay.ts`
  - [x] Create `packages/core/src/utils/worktree-overlay.ts` with same function signature and implementation
  - [x] Export from `packages/core/src/index.ts` (browser-safe — pure object mapping, no fs/path)
  - [x] Update `packages/cli/src/utils/worktree-overlay.ts` to re-export from `@context-forge/core`
  - [x] Verify: `npm run build` passes, all existing CLI tests pass unchanged
  - [x] Commit: `refactor(core): move applyWorktreeOverlay from CLI to core`

### 2. Create `worktreeTools.ts` with shared helper and registration scaffold

- [x] Create `packages/mcp-server/src/tools/worktreeTools.ts`
  - [x] Import `FileProjectStore`, `WorktreeService` from `@context-forge/core/node`
  - [x] Import `applyWorktreeOverlay` from `@context-forge/core`
  - [x] Import `resolveProjectId` from `./resolveProjectId.js`
  - [x] Import shared `errorResult`, `jsonResult` from `./contextTools.js`
  - [x] Create `resolveWorktree(projectId: string, worktreeIdOrName: string, store: FileProjectStore)` helper:
    1. Load project via `store.getById(projectId)` — error if missing
    2. Try `WorktreeService.getWorktree(project, worktreeIdOrName)` (exact ID)
    3. If not found, try `WorktreeService.getWorktreeByName(project, worktreeIdOrName)` (case-insensitive)
    4. If still not found, return `errorResult("Worktree '...' not found...")`
    5. Return `{ project, worktree }` on success
  - [x] Export `registerWorktreeTools(server: McpServer): void` (empty body for now)
  - [x] Register in `packages/mcp-server/src/index.ts` after `registerWorkflowTools`
  - [x] Verify: `npm run build` passes
  - [x] Commit: `feat(mcp): add worktreeTools scaffold with resolveWorktree helper`

### 3. Implement `worktree_list` tool

- [x] In `registerWorktreeTools`, register `worktree_list`:
  - [x] Input schema: `{ projectId: z.string().optional() }`
  - [x] Annotations: `readOnlyHint: true, openWorldHint: false`
  - [x] Handler: resolve project → `WorktreeService.listWorktrees(project)` → `jsonResult({ worktrees, count })`
  - [x] Error case: project not found → `errorResult`

### 4. Implement `worktree_get` tool

- [x] In `registerWorktreeTools`, register `worktree_get`:
  - [x] Input schema: `{ projectId?, worktree: z.string() }`
  - [x] Annotations: `readOnlyHint: true, openWorldHint: false`
  - [x] Handler: resolve project → `resolveWorktree()` → `jsonResult(worktree)`

### 5. Implement `worktree_init` tool

- [x] In `registerWorktreeTools`, register `worktree_init`:
  - [x] Input schema per slice design: `{ projectId?, name, indexRange, worktreePath?, archDoc?, slicePlan?, developmentPhase? }`
  - [x] Parse `indexRange` string "start-end" → `[number, number]`; validate format, return `errorResult` if malformed
  - [x] Annotations: `destructiveHint: false, idempotentHint: false`
  - [x] Handler: resolve project → `WorktreeService.addWorktree(project, fields)` → `jsonResult({ worktree, migrated, overlaps })`

### 6. Implement `worktree_update` tool

- [x] In `registerWorktreeTools`, register `worktree_update`:
  - [x] Input schema per slice design: `{ projectId?, worktree, name?, indexRange?, worktreePath?, archDoc?, slicePlan?, developmentPhase?, activeSlice?, activeTaskFile?, instruction?, workType? }`
  - [x] Parse `indexRange` if provided (same validation as init)
  - [x] Annotations: `destructiveHint: false, idempotentHint: true`
  - [x] Handler: resolve project → `resolveWorktree()` → collect non-undefined fields → `WorktreeService.updateWorktree(project, worktreeId, updates)` → `jsonResult(updated)`

### 7. Implement `worktree_rm` tool

- [x] In `registerWorktreeTools`, register `worktree_rm`:
  - [x] Input schema: `{ projectId?, worktree: z.string() }`
  - [x] Annotations: `destructiveHint: true, idempotentHint: false`
  - [x] Handler: resolve project → `resolveWorktree()` → `WorktreeService.removeWorktree(project, worktreeId)` → `jsonResult({ removed, migrated })`
  - [x] Commit: `feat(mcp): add worktree CRUD tools (list, get, init, update, rm)`

### 8. Tests for worktree CRUD tools

- [x] Create `packages/mcp-server/tests/worktreeTools.test.ts`
  - [x] Follow existing test pattern: mock `@context-forge/core/node` (FileProjectStore, WorktreeService), use InMemoryTransport + Client
  - [x] Mock `resolveProjectId` to return test project ID
  - [x] `MOCK_PROJECT` fixture with `worktrees` array containing test worktree contexts
  - [x] Test `worktree_list`: returns worktrees array and count; returns empty array for project with no worktrees
  - [x] Test `worktree_get`: resolves by ID; resolves by name (case-insensitive); error for missing worktree
  - [x] Test `worktree_init`: calls addWorktree with parsed indexRange; returns migrated/overlaps; error for malformed indexRange
  - [x] Test `worktree_update`: calls updateWorktree with collected fields; parses indexRange if provided
  - [x] Test `worktree_rm`: calls removeWorktree; returns removed and migrated
  - [x] Test error cases: missing project → error; missing worktree → error
  - [x] Verify: all new tests pass, existing MCP tests unchanged
  - [x] Commit: `test(mcp): add unit tests for worktree CRUD tools`

### 9. Extend `workflow_status` with optional `worktreeId`

- [x] In `packages/mcp-server/src/tools/workflowTools.ts`:
  - [x] Add `worktreeId: z.string().optional()` to `workflow_status` input schema
  - [x] Import `WorktreeService` from `@context-forge/core/node` and `applyWorktreeOverlay` from `@context-forge/core`
  - [x] When `worktreeId` provided:
    1. Resolve worktree via `WorktreeService.getWorktree` / `getWorktreeByName`
    2. Apply `applyWorktreeOverlay(project, worktree.id)` to get overlaid project copy
    3. Pass overlaid project to `nav.getStatus()`
    4. Include `worktree` field in response
  - [x] Without `worktreeId`: existing behavior unchanged

### 10. Extend `workflow_next` with optional `worktreeId`

- [x] In `packages/mcp-server/src/tools/workflowTools.ts`:
  - [x] Add `worktreeId: z.string().optional()` to `workflow_next` input schema
  - [x] Same overlay pattern as `workflow_status`
  - [x] Pass overlaid project to `nav.getNext()`
  - [x] Include `worktree` field in response when `worktreeId` provided

### 11. Tests for worktree-aware workflow tools

- [x] In `packages/mcp-server/tests/workflowTools.test.ts`:
  - [x] Add `WorktreeService` to the `@context-forge/core/node` mock
  - [x] Add `applyWorktreeOverlay` mock (import from `@context-forge/core` mock)
  - [x] Add `MOCK_PROJECT_WITH_WORKTREES` fixture (project with `worktrees` array)
  - [x] Test `workflow_status` with `worktreeId`: verifies overlay is applied, worktree field in response
  - [x] Test `workflow_status` without `worktreeId`: existing behavior unchanged
  - [x] Test `workflow_next` with `worktreeId`: same pattern
  - [x] Test error: `worktreeId` not found → error result
  - [x] Verify: all workflow tests pass (existing + new)
  - [x] Commit: `feat(mcp): add worktreeId to workflow_status and workflow_next`

### 12. Extend `context_build` with optional `worktree` parameter

- [x] In `packages/mcp-server/src/tools/contextTools.ts`:
  - [x] Add `worktree: z.string().optional()` to `contextOverridesSchema`
  - [x] Import `WorktreeService` from `@context-forge/core/node` and `applyWorktreeOverlay` from `@context-forge/core`
  - [x] In `context_build` handler, when `worktree` param provided:
    1. Resolve project
    2. Resolve worktree by ID or name (reuse pattern from worktreeTools or inline)
    3. Apply `applyWorktreeOverlay(project, worktree.id)` first
    4. Then apply explicit parameter overrides on top (explicit wins)
    5. Pass to `generateContext()`
  - [x] Without `worktree`: existing behavior unchanged

### 13. Tests for worktree-aware `context_build`

- [x] In `packages/mcp-server/tests/contextTools.test.ts`:
  - [x] Add `WorktreeService` to mock, add `applyWorktreeOverlay` mock
  - [x] Test `context_build` with `worktree`: overlay applied before explicit overrides
  - [x] Test `context_build` with `worktree` + explicit `fileSlice`: explicit wins over overlay
  - [x] Test `context_build` without `worktree`: existing behavior unchanged
  - [x] Verify: all context tool tests pass
  - [x] Commit: `feat(mcp): add worktree param to context_build`

### 14. Extend `project_update` with optional `worktreeId` for field routing

- [x] In `packages/mcp-server/src/tools/projectTools.ts`:
  - [x] Add `worktreeId: z.string().optional()` to `project_update` input schema
  - [x] Import `WorktreeService` from `@context-forge/core/node`
  - [x] Add `WORKTREE_SCOPED_FIELDS` set and `FIELD_MAP` (project field → worktree field) mirroring CLI `project.ts`
  - [x] When `worktreeId` provided:
    1. Resolve worktree (error if not found)
    2. Split incoming fields: worktree-scoped fields → `worktreeUpdates`, project-level fields → `projectUpdates`
    3. Map field names: `fileSlice`→`activeSlice`, `fileArch`→`archDoc`, `fileSlicePlan`→`slicePlan`, `fileTasks`→`activeTaskFile` (others keep same name)
    4. Apply auto-set logic to worktree context: phase→instruction, slice→tasks
    5. Call `WorktreeService.updateWorktree()` for worktree fields
    6. Call `store.update()` for project-level fields (if any)
    7. Return combined result with `_worktreeUpdated` indicator
  - [x] Without `worktreeId`: existing behavior unchanged

### 15. Tests for worktree-aware `project_update`

- [x] In `packages/mcp-server/tests/projectTools.test.ts`:
  - [x] Add `WorktreeService` to mock
  - [x] Test `project_update` with `worktreeId` + workflow field (`developmentPhase`): routes to worktree, auto-sets instruction
  - [x] Test `project_update` with `worktreeId` + project field (`name`): routes to project store
  - [x] Test `project_update` with `worktreeId` + mixed fields: split routing
  - [x] Test `project_update` with `worktreeId` + `fileSlice`: maps to `activeSlice`, auto-sets `activeTaskFile`
  - [x] Test `project_update` without `worktreeId`: existing behavior unchanged
  - [x] Test error: `worktreeId` not found → error result
  - [x] Verify: all project tool tests pass
  - [x] Commit: `feat(mcp): add worktreeId field routing to project_update`

### 16. Final build verification and regression check

- [x] Run `npm run build` — clean build across all packages
- [x] Run `npm test` — all tests pass (new + existing)
- [x] Verify total new tool count: 5 worktree tools registered
- [x] Verify extended tools accept worktree params: `workflow_status`, `workflow_next`, `context_build`, `project_update`
- [x] Commit: `feat(mcp): complete slice 186 MCP worktree tools`
