---
docType: tasks
slice: mcp-server-state-tools
project: context-forge
lldRef: user/slices/147-slice.mcp-server-state-tools.md
dependencies: [mcp-server-context-tools, mcp-server-project-tools]
projectState: Slice 146 complete — MCP server operational with 7 tools (project_list, project_get, project_update, context_build, template_preview, prompt_list, prompt_get). Shared helpers (errorResult, jsonResult) exported from contextTools.ts. FileProjectStore.update() available for state mutation.
dateCreated: 20260220
dateUpdated: 20260220
status: not started
---

# Tasks: Slice 147 — MCP Server — State Update Tools

## Context

Implement the `context_summarize` MCP tool in `packages/mcp-server` — a purpose-built tool for updating a project's session state (`customData.recentEvents` and optionally `additionalNotes`). This completes the MCP server's 8-tool surface per the architecture spec.

Key references:
- Slice design: `user/slices/147-slice.mcp-server-state-tools.md`
- Slice 146 tasks (pattern reference): `user/tasks/146-tasks.mcp-server-context-tools.md`
- Existing tools: `packages/mcp-server/src/tools/projectTools.ts`, `packages/mcp-server/src/tools/contextTools.ts`
- Server entry point: `packages/mcp-server/src/index.ts`
- Tests: `packages/mcp-server/src/__tests__/` (existing patterns: InMemoryTransport + Client)

API summary (for implementing agent):
- `FileProjectStore` from `@context-forge/core/node` — `getById(id)` → `ProjectData | undefined`, `update(id, data)` → `void`
- `errorResult(message)` and `jsonResult(data)` — shared helpers exported from `contextTools.ts`
- `customData` merge pattern: spread existing `customData`, overlay `recentEvents` (always) and `additionalNotes` (if provided)

---

## Phase 1: Create `stateTools.ts` with `context_summarize`

### Task 1: Create `stateTools.ts` Scaffold

- [ ] Create `packages/mcp-server/src/tools/stateTools.ts`
- [ ] Export a `registerStateTools(server: McpServer)` function (same pattern as `registerProjectTools` and `registerContextTools`)
- [ ] Add imports:
  - `McpServer` from `@modelcontextprotocol/sdk/server/mcp.js`
  - `z` from `zod`
  - `FileProjectStore` from `@context-forge/core/node`
  - `errorResult`, `jsonResult` from `./contextTools.js`
- [ ] File compiles (`pnpm --filter context-forge-mcp build`)
- **Success**: `stateTools.ts` exists with `registerStateTools` export. Build succeeds.

### Task 2: Implement `context_summarize` Tool

- [ ] Register `context_summarize` tool in `registerStateTools()`:
  - Name: `'context_summarize'`
  - Title: `'Summarize Context'`
  - Description: `'Update a project\'s session state summary. Persists the provided summary text as the project\'s recent events, which will be included in subsequent context_build output. Use this after significant work milestones, context switches, or to record session progress for continuity. Analogous to Claude Code\'s /compact but for project-level state.'`
  - Input schema (zod):
    - `projectId`: `z.string()` — required, described as `'Project ID to update. Use project_list to find IDs.'`
    - `summary`: `z.string()` — required, described as `'Summary of recent events, session progress, or current project state. This replaces the current recentEvents field and will appear in subsequent context_build output.'`
    - `additionalNotes`: `z.string().optional()` — described as `'Optional additional notes to persist alongside the summary. Replaces the current additionalNotes field if provided.'`
  - Annotations: `{ destructiveHint: false, idempotentHint: true, openWorldHint: false }`
- [ ] Handler logic:
  1. Validate `summary` is non-empty after trimming — return `errorResult('Summary text is required. Provide a non-empty summary of recent events or session state.')` if blank
  2. Load project via `new FileProjectStore().getById(projectId)` — return `errorResult("Project not found: '{projectId}'. Use the project_list tool to see available projects and their IDs.")` if not found
  3. Construct merged `customData`:
     ```
     const mergedCustomData = {
       ...existing.customData,
       recentEvents: summary,
       ...(additionalNotes !== undefined && { additionalNotes }),
     };
     ```
  4. Call `store.update(projectId, { customData: mergedCustomData })`
  5. Read back updated project via `store.getById(projectId)`
  6. Return updated project as JSON via `jsonResult(updated)`
- [ ] Wrap handler in try/catch — surface store failures via `errorResult`
- [ ] File compiles (`pnpm --filter context-forge-mcp build`)
- **Success**: `context_summarize` tool registered with proper validation, merge semantics, and error handling. Build succeeds.

---

## Phase 2: Unit Tests

### Task 3: Unit Tests for `context_summarize`

- [ ] Create `packages/mcp-server/src/__tests__/stateTools.test.ts`
- [ ] Mock `@context-forge/core/node` to stub `FileProjectStore` (same pattern as `projectTools.test.ts`)
- [ ] Mock `getById` and `update` methods on the store
- [ ] Create mock `ProjectData` fixture with existing `customData` fields (`recentEvents`, `additionalNotes`, `monorepoNote`, `availableTools`)
- [ ] Set up test client using `InMemoryTransport` + `Client` pattern (import from `@modelcontextprotocol/sdk`)
- [ ] Test cases:
  - [ ] Returns updated project as JSON after updating `recentEvents`
  - [ ] Preserves other `customData` fields (`monorepoNote`, `availableTools`) during update
  - [ ] Updates `additionalNotes` when provided
  - [ ] Does not modify `additionalNotes` when not provided in the call
  - [ ] Returns `isError: true` for non-existent project ID (message references `project_list`)
  - [ ] Returns `isError: true` for empty/whitespace-only summary
  - [ ] Returns `isError: true` on store update failure (mock `update` throws)
- [ ] Run `pnpm --filter context-forge-mcp test` — all tests pass (new + existing)
- **Success**: All `context_summarize` tests pass. No regressions in existing tests.

---

## Phase 3: Integration and Final Verification

### Task 4: Wire State Tools into Server Entry Point

- [ ] Edit `packages/mcp-server/src/index.ts`:
  - Add import: `import { registerStateTools } from './tools/stateTools.js';`
  - Add call after `registerContextTools(server)`: `registerStateTools(server);`
- [ ] No other changes to `index.ts`
- **Success**: `index.ts` registers project, context, and state tools.

### Task 5: Update Server Lifecycle Test

- [ ] Edit `packages/mcp-server/src/__tests__/serverLifecycle.test.ts`:
  - Update test title: `'starts, completes MCP handshake, lists all 8 tools, and exits cleanly'`
  - Update the `tools/list` assertion to expect all 8 tools (sorted):
    `['context_build', 'context_summarize', 'project_get', 'project_list', 'project_update', 'prompt_get', 'prompt_list', 'template_preview']`
- **Success**: Lifecycle test expects 8 tools.

### Task 6: Full Workspace Build and Test

- [ ] Run `pnpm -r build` — full workspace builds cleanly
- [ ] Run `pnpm --filter context-forge-mcp test` — all MCP server tests pass (project tools, context tools, state tools, lifecycle)
- [ ] Verify no regressions: existing tests pass unchanged
- [ ] Verify `dist/index.js` exists and contains all tool registrations
- **Success**: Full workspace clean. No regressions. All 8 tools operational.

### Task 7: Final Commit and Documentation Updates

- [ ] Commit all changes: "feat(mcp-server): implement context_summarize tool with tests (slice 147)"
- [ ] Update DEVLOG.md with implementation summary and commit hashes
- [ ] Mark slice 147 (item 8) as `[x]` in `140-slices.context-forge-restructure.md`
- [ ] Update slice design status from `not started` to `complete`
- **Success**: All commits on branch. DEVLOG updated. Slice marked complete.
