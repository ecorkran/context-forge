---
docType: slice-design
slice: mcp-worktree-tools
project: context-forge
parent: user/architecture/180-slices.initiative-context-worktree.md
dependencies: [181-worktree-context-data-model-storage, 182-worktree-discovery-cwd-resolution]
interfaces: [187-validation-edge-cases-polish]
dateCreated: 20260311
dateUpdated: 20260311
status: not_started
---

# Slice 186: MCP Worktree Tools

## Overview

Expose worktree context management via MCP tools and make existing MCP tools worktree-aware. This enables MCP clients (context-visualizer, IDE extensions, external agents) to manage and query per-worktree workflow state without CLI access.

The slice adds 5 new CRUD tools in a dedicated `worktreeTools.ts` module and extends 4 existing tools with optional `worktreeId` parameters. All new tools delegate to the existing `WorktreeService` in core — no new business logic, just MCP wrappers.

## Technical Decisions

### New module: `worktreeTools.ts`

A new file `packages/mcp-server/src/tools/worktreeTools.ts` exports `registerWorktreeTools(server: McpServer)`, following the same pattern as `projectTools.ts`, `workflowTools.ts`, etc. Registered in `index.ts` after `registerWorkflowTools`.

### Worktree resolution helper

A shared helper `resolveWorktree(projectId: string, worktreeIdOrName: string, store: FileProjectStore)` in `worktreeTools.ts` handles the common pattern of looking up a worktree by ID or name (case-insensitive). Uses `WorktreeService.getWorktree()` first (exact ID), then `WorktreeService.getWorktreeByName()` (fuzzy name). Returns the `WorktreeContext` or calls `errorResult()`.

### Overlay helper for MCP

The `applyWorktreeOverlay` function currently lives in `packages/cli/src/utils/worktree-overlay.ts`. MCP tools need the same logic. Rather than duplicating, move the overlay function to `packages/core/src/utils/worktree-overlay.ts` and export from both `@context-forge/core` and `@context-forge/core/node`. Update the CLI import to source from core. This is a pure refactor — the function signature and behavior are unchanged.

If moving to core feels like scope creep, an alternative is to duplicate the 15-line function in the MCP server package. PM decision — recommend the move since it's small and prevents a third copy appearing later.

## New MCP Tools

### `worktree_list`

List all worktree contexts for a project.

| Field | Type | Description |
|-------|------|-------------|
| `projectId` | `string?` | Project ID. Omit for default_project. |

**Response:** `{ worktrees: WorktreeContext[], count: number }`

Annotations: `readOnlyHint: true`

### `worktree_get`

Get a specific worktree by ID or name.

| Field | Type | Description |
|-------|------|-------------|
| `projectId` | `string?` | Project ID. Omit for default_project. |
| `worktree` | `string` | Worktree ID or name (case-insensitive). |

**Response:** Full `WorktreeContext` object.

Annotations: `readOnlyHint: true`

### `worktree_init`

Create a new worktree context. Delegates to `WorktreeService.addWorktree()`.

| Field | Type | Description |
|-------|------|-------------|
| `projectId` | `string?` | Project ID. Omit for default_project. |
| `name` | `string` | Human-readable worktree name. |
| `indexRange` | `string` | Range as "start-end" (e.g., "100-199"). Parsed to `[number, number]`. |
| `worktreePath` | `string?` | Absolute filesystem path to the git worktree. |
| `archDoc` | `string?` | Architecture document stem. |
| `slicePlan` | `string?` | Slice plan stem. |
| `developmentPhase` | `string?` | Initial phase. |

**Response:** `{ worktree: WorktreeContext, migrated: boolean, overlaps: IndexRangeOverlap[] }`

- `migrated: true` when this was the first worktree and forward migration occurred.
- `overlaps` lists any index range conflicts (informational, not blocking).

Annotations: `destructiveHint: false, idempotentHint: false`

### `worktree_update`

Update fields on an existing worktree context. Delegates to `WorktreeService.updateWorktree()`.

| Field | Type | Description |
|-------|------|-------------|
| `projectId` | `string?` | Project ID. Omit for default_project. |
| `worktree` | `string` | Worktree ID or name to update. |
| `name` | `string?` | New name. |
| `indexRange` | `string?` | New range as "start-end". |
| `worktreePath` | `string?` | New filesystem path. |
| `archDoc` | `string?` | Architecture document stem. |
| `slicePlan` | `string?` | Slice plan stem. |
| `developmentPhase` | `string?` | Phase. |
| `activeSlice` | `string?` | Active slice stem. |
| `activeTaskFile` | `string?` | Active task file stem. |
| `instruction` | `string?` | Instruction type. |
| `workType` | `string?` | "start" or "continue". |

**Response:** Updated `WorktreeContext` object.

Annotations: `destructiveHint: false, idempotentHint: true`

### `worktree_rm`

Remove a worktree context. Delegates to `WorktreeService.removeWorktree()`.

| Field | Type | Description |
|-------|------|-------------|
| `projectId` | `string?` | Project ID. Omit for default_project. |
| `worktree` | `string` | Worktree ID or name to remove. |

**Response:** `{ removed: WorktreeContext, migrated: boolean }`

- `migrated: true` when this was the last worktree and reverse migration occurred.

Annotations: `destructiveHint: true, idempotentHint: false`

## Extended Existing Tools

### `workflow_status` — add optional `worktreeId`

**Current:** `{ projectId? }` → calls `nav.getStatus(project)`

**New:** `{ projectId?, worktreeId? }` → when `worktreeId` provided, apply worktree overlay before passing to navigator. Response includes `worktree` field with the resolved `WorktreeContext`.

Without `worktreeId`: existing behavior unchanged (project-level status).

### `workflow_next` — add optional `worktreeId`

Same pattern as `workflow_status`. Apply overlay, pass overlaid project to `nav.getNext()`.

### `context_build` — add optional `worktree`

**Current:** `{ projectId?, fileSlice?, instruction?, ... }` → builds context from project fields.

**New:** Add `worktree` parameter (string, name or ID). When provided:
1. Resolve project
2. Resolve worktree within project
3. Apply worktree overlay to project copy
4. Apply any explicit parameter overrides on top (explicit params win)
5. Pass to `generateContext()`

This matches the CLI `cf build` behavior where CWD overlay is applied first, then `--slice`/`--phase` overrides win.

### `project_update` — add optional `worktreeId` for field routing

**Current:** All field updates go to `ProjectData` directly.

**New:** When `worktreeId` is provided, workflow-scoped fields (`developmentPhase`, `instruction`, `workType`, `fileSlice`→`activeSlice`, `fileTasks`→`activeTaskFile`, `fileArch`→`archDoc`, `fileSlicePlan`→`slicePlan`) are routed to the worktree context via `WorktreeService.updateWorktree()`. Project-level fields (`name`, `template`, `dateProject`, `projectPath`, `customData`, etc.) always go to the project.

This mirrors the CLI `cf set` field routing in `project.ts` (`WORKTREE_SCOPED_FIELDS` set).

Auto-set logic (phase→instruction, slice→tasks) applies to the worktree context when `worktreeId` is active.

## Data Flow

```
MCP Client
  │
  ├─ worktree_init ──→ resolveProjectId → WorktreeService.addWorktree()
  ├─ worktree_list ──→ resolveProjectId → WorktreeService.listWorktrees()
  ├─ worktree_get  ──→ resolveProjectId → resolveWorktree() → return
  ├─ worktree_update → resolveProjectId → resolveWorktree() → WorktreeService.updateWorktree()
  ├─ worktree_rm   ──→ resolveProjectId → resolveWorktree() → WorktreeService.removeWorktree()
  │
  ├─ workflow_status ─→ resolveProjectId → [overlay if worktreeId] → nav.getStatus()
  ├─ workflow_next  ──→ resolveProjectId → [overlay if worktreeId] → nav.getNext()
  ├─ context_build  ──→ resolveProjectId → [overlay if worktree]  → generateContext()
  └─ project_update ──→ resolveProjectId → [route fields if worktreeId] → store.update() / svc.updateWorktree()
```

## Cross-Slice Dependencies

- **Depends on:** 181 (WorktreeService, WorktreeContext type), 182 (worktree resolution patterns)
- **Consumed by:** 187 (validation/polish may extend these tools with stale-path warnings)
- **CLI parity:** `applyWorktreeOverlay` shared between CLI and MCP after core extraction

## Success Criteria

1. `worktree_init` creates a worktree context; triggers forward migration on first creation
2. `worktree_list` returns all worktrees for a project (empty array for no worktrees)
3. `worktree_get` resolves by exact ID or case-insensitive name
4. `worktree_update` modifies worktree fields; returns updated object
5. `worktree_rm` removes worktree; triggers reverse migration on last removal
6. `workflow_status` with `worktreeId` returns worktree-scoped status
7. `workflow_next` with `worktreeId` returns worktree-scoped next action
8. `context_build` with `worktree` builds context from worktree's artifacts
9. `project_update` with `worktreeId` routes workflow fields to worktree context
10. All tools handle: missing project, missing worktree, projects without worktrees (graceful errors)
11. All existing MCP tests pass unchanged (no worktree params = no behavior change)
12. New tools have unit tests covering happy path and error cases

## Verification Walkthrough

### 1. Worktree CRUD via MCP

```
# Create a worktree
→ worktree_init { name: "API Foundation", indexRange: "100-199" }
← { worktree: { id: "wt_...", name: "API Foundation", indexRange: [100, 199] }, migrated: true, overlaps: [] }

# List worktrees
→ worktree_list {}
← { worktrees: [{ id: "wt_default_...", ... }, { id: "wt_...", name: "API Foundation", ... }], count: 2 }

# Get by name
→ worktree_get { worktree: "api foundation" }
← { id: "wt_...", name: "API Foundation", indexRange: [100, 199], ... }

# Update
→ worktree_update { worktree: "API Foundation", developmentPhase: "Phase 6: Implementation", activeSlice: "103-slice.auth" }
← { id: "wt_...", developmentPhase: "Phase 6: Implementation", activeSlice: "103-slice.auth", ... }

# Remove
→ worktree_rm { worktree: "API Foundation" }
← { removed: { ... }, migrated: false }
```

### 2. Worktree-scoped workflow status

```
→ workflow_status { worktreeId: "wt_001" }
← { project: "my-project", phase: "Phase 6: Implementation", activeSlice: { ... }, worktree: { id: "wt_001", ... } }
```

### 3. Context build with worktree overlay

```
→ context_build { worktree: "API Foundation" }
← (assembled context using API Foundation's archDoc, slicePlan, activeSlice, activeTaskFile)
```

### 4. Field routing via project_update

```
# With worktreeId — routes to worktree
→ project_update { worktreeId: "wt_001", fileSlice: "103-slice.auth" }
← (worktree's activeSlice updated, project's fileSlice unchanged)

# Without worktreeId — routes to project (existing behavior)
→ project_update { fileSlice: "050-slice.core" }
← (project's fileSlice updated)
```

### 5. Error cases

```
→ worktree_get { worktree: "nonexistent" }
← Error: Worktree 'nonexistent' not found. Use worktree_list to see available worktrees.

→ workflow_status { worktreeId: "wt_missing" }
← Error: Worktree 'wt_missing' not found for project '...'.
```

## Implementation Notes

### File changes
- **New:** `packages/mcp-server/src/tools/worktreeTools.ts` — 5 CRUD tools
- **Move:** `packages/cli/src/utils/worktree-overlay.ts` → `packages/core/src/utils/worktree-overlay.ts` (or duplicate in MCP)
- **Modify:** `packages/mcp-server/src/index.ts` — register new tools
- **Modify:** `packages/mcp-server/src/tools/workflowTools.ts` — add `worktreeId` to status/next
- **Modify:** `packages/mcp-server/src/tools/contextTools.ts` — add `worktree` to context_build
- **Modify:** `packages/mcp-server/src/tools/projectTools.ts` — add `worktreeId` to project_update

### Testing strategy
- Unit tests for each new tool (mock `WorktreeService` and `FileProjectStore`)
- Unit tests for extended tools with and without `worktreeId`
- Verify existing tests pass unchanged (backwards compatibility)

### Effort
3/5 — Primarily wrapping existing `WorktreeService` operations in MCP handlers. The field routing in `project_update` is the most complex piece but has a direct CLI reference implementation.
