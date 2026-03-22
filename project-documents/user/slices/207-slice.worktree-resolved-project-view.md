---
docType: slice-design
slice: worktree-resolved-project-view
project: context-forge
parent: user/architecture/200-slices.developer-onboarding.md
dependencies: [206-slice.cli-mcp-shared-logic-consolidation]
interfaces: []
dateCreated: 20260322
dateUpdated: 20260322
status: not_started
---

# Slice Design: Worktree-Resolved Project View

## Overview

Push worktree overlay resolution into the core retrieval path so that every project-facing command and MCP tool returns a single coherent view — top-level fields already reflect the active worktree's overrides. Today, consumers must know about the overlay pattern: `project_get` returns raw `fileArch` (project-level) alongside `worktree.archDoc` (overlay-level), and callers manually prefer the worktree value. This leaks an implementation detail that every consumer must re-implement.

The fix introduces a `resolveProject()` function in `@context-forge/core` that accepts an optional `worktreeId` and returns `ProjectData` with overlay fields pre-applied. All retrieval points — MCP tools, CLI commands, and external consumers — call this function instead of `store.getById()` + manual overlay.

## Value

- **Consumer simplicity:** Callers receive a single coherent project view. No need to check both `project.fileArch` and `project.worktrees[n].archDoc` — the resolved view already has the right value in `fileArch`.
- **Consistency:** Every retrieval path uses the same resolution logic. No more risk of one tool applying overlay and another forgetting.
- **External consumer support:** Squadron and other external consumers that read project data via MCP get resolved views without needing to understand CF's internal worktree model.

## Technical Scope

### Included

1. **`resolveProject()` function in core** — Takes `(store, projectId, worktreeId?)`, returns `ProjectData` with overlay applied when worktreeId is provided.
2. **`project_get` MCP tool** — Accept optional `worktreeId` parameter; return resolved view.
3. **`workflow_status` and `workflow_next` MCP tools** — Replace inline `applyWorktreeOverlay()` calls with `resolveProject()`.
4. **`context_build` MCP tool** — Use resolved project instead of raw project + separate overlay.
5. **CLI commands** (`cf get`, `cf status`, `cf next`, `cf build`) — Replace manual overlay calls with `resolveProject()`.
6. **Response shape annotation** — When a worktree overlay was applied, include a `resolvedFrom` field in the response indicating which worktree was used, so consumers can distinguish "no worktree" from "worktree applied, values happen to match."

### Excluded

- Changes to `project_update` write-path routing — field routing to worktree vs. project storage remains unchanged (that logic is about *writes*, this slice is about *reads*).
- Changes to `WorktreeService` CRUD operations.
- Changes to `applyWorktreeOverlay()` itself — it remains as the low-level primitive; `resolveProject()` wraps it with lookup and error handling.
- Worktree auto-detection from CWD — that's the existing `resolveWorktreeFromCwd()` concern, orthogonal to this slice.

## Dependencies

### Prerequisites

- **206 — CLI/MCP Shared-Logic Consolidation**: The constants `WORKTREE_SCOPED_FIELDS` and `PROJECT_TO_WORKTREE_FIELD` must already be in `@context-forge/core`. This slice consumes them and builds on the single-source-of-truth pattern that 206 establishes.

### Interfaces Required

- `FileProjectStore.getById()` — raw project retrieval (exists)
- `WorktreeService.getWorktree()` / `getWorktreeByName()` — worktree lookup by ID or name (exists)
- `applyWorktreeOverlay()` — low-level overlay application (exists in core)

## Architecture

### Component Structure

New function in core: `packages/core/src/services/projectResolver.ts`

```
projectResolver.ts
├── resolveProject()         (store, projectId, worktreeId?) → ResolvedProject
└── ResolvedProject          (ProjectData + { resolvedWorktree?: { id, name } })
```

This is deliberately a function, not a class — it composes existing services (`FileProjectStore`, `WorktreeService`, `applyWorktreeOverlay`) and adds no state of its own.

### Data Flow

**Current (scattered resolution):**
```
store.getById(id)
    ↓
┌── project_get: returns raw (no overlay)
├── workflow_status: manually calls applyWorktreeOverlay()
├── workflow_next: manually calls applyWorktreeOverlay()
├── context_build: threads worktreeId, applies overrides inline
├── cf get: manually calls applyWorktreeOverlay()
├── cf status: manually calls applyWorktreeOverlay()
└── cf build: threads worktreeId through pipeline
```

**After (centralized resolution):**
```
resolveProject(store, id, worktreeId?)
    ↓ (applies overlay if worktreeId provided)
    ↓ (returns ResolvedProject with resolvedWorktree metadata)
┌── project_get: returns resolved view
├── workflow_status: receives resolved view
├── workflow_next: receives resolved view
├── context_build: receives resolved view
├── cf get: receives resolved view
├── cf status: receives resolved view
└── cf build: receives resolved view
```

## Technical Decisions

### `resolveProject()` Function Design

```typescript
// packages/core/src/services/projectResolver.ts

export interface ResolvedProject extends ProjectData {
  /** Present when a worktree overlay was applied */
  resolvedWorktree?: { id: string; name: string };
}

/**
 * Load a project and optionally apply a worktree overlay.
 * When worktreeId is provided, looks up the worktree by ID or name,
 * applies the overlay, and annotates the result with resolution metadata.
 * Returns null if project not found; throws if worktreeId is provided but
 * the worktree doesn't exist.
 */
export async function resolveProject(
  store: FileProjectStore,
  projectId: string,
  worktreeId?: string,
): Promise<ResolvedProject | null> {
  const project = await store.getById(projectId);
  if (!project) return null;
  if (!worktreeId) return project;

  const service = new WorktreeService(store);
  let wt = await service.getWorktree(projectId, worktreeId);
  if (!wt) {
    wt = await service.getWorktreeByName(projectId, worktreeId);
  }
  if (!wt) {
    throw new Error(
      `Worktree '${worktreeId}' not found on project '${projectId}'. ` +
      `Use worktree_list to see available worktrees.`
    );
  }

  const resolved = applyWorktreeOverlay(project, wt.id);
  return {
    ...resolved,
    resolvedWorktree: { id: wt.id, name: wt.name },
  };
}
```

**Design rationale:**

- **Throws on missing worktree** (not silent fallback): If a caller explicitly asks for worktree resolution and the worktree doesn't exist, that's an error. Silent fallback to the base project would hide bugs. This follows the project principle of failing explicitly.
- **Returns `null` for missing project**: Consistent with `store.getById()` semantics. Callers already handle this case.
- **`resolvedWorktree` metadata**: Lets callers distinguish "no worktree requested" from "worktree applied." Useful for display (CLI can show "resolved via worktree: API-Foundation") and for debugging.
- **ID-then-name lookup**: Matches the existing pattern in `workflowTools.ts`. Callers can pass either format.

### `project_get` Extension

Add `worktreeId` as an optional parameter (matching the pattern already established by `workflow_status` and `workflow_next`):

```typescript
inputSchema: {
  id: z.string().optional().describe('Project ID. Omit to resolve from CWD.'),
  worktreeId: z.string().optional().describe(
    'Worktree ID or name. When provided, returns the resolved project view '
    + 'with worktree-scoped fields (fileSlice, fileArch, developmentPhase, etc.) '
    + 'reflecting the worktree\'s values instead of the project-level values.'
  ),
},
```

When `worktreeId` is provided, the tool calls `resolveProject(store, id, worktreeId)` and returns the resolved view. The `resolvedWorktree` field in the response tells the caller which worktree was applied.

When `worktreeId` is omitted, behavior is unchanged — returns raw project data (no overlay).

### CLI Command Updates

CLI commands that currently call `applyWorktreeOverlay()` directly will switch to `resolveProject()`. The CLI typically resolves the worktree from the active context (CWD-based detection or explicit `--worktree` flag), so the change is mechanical:

```typescript
// Before (e.g., in cf get):
const project = await store.getById(projectId);
if (worktreeId) {
  project = applyWorktreeOverlay(project, worktreeId);
}

// After:
const project = await resolveProject(store, projectId, worktreeId);
```

### ContextIntegrator Threading

Currently, `context_build` threads `worktreeId` through the pipeline separately from the project data. After this slice, the project passed to the integrator is already resolved. The `worktreeId` parameter is still needed for identity metadata (worktree name in prompt headers), but the integrator no longer needs to apply overlay itself.

The `ContextIntegrator.generateContextFromProject()` method signature doesn't change — it still accepts `worktreeId?` for metadata extraction — but the project it receives has overlay pre-applied.

## Implementation Details

### Migration Plan

#### Step 1: Create `resolveProject()` in Core

**Destination:** `packages/core/src/services/projectResolver.ts`

- Implement `ResolvedProject` interface and `resolveProject()` function
- Export from `packages/core/src/index.ts`
- Add unit tests covering: no worktree, valid worktree ID, valid worktree name, missing worktree (throws), missing project (returns null)

#### Step 2: Update MCP `project_get`

**File:** `packages/mcp-server/src/tools/projectTools.ts`

- Add `worktreeId` to input schema
- Replace `store.getById()` with `resolveProject()`
- Introspection should run against the resolved project (so that artifact checks reflect the worktree's active slice, not the project-level one)

#### Step 3: Update MCP Workflow Tools

**File:** `packages/mcp-server/src/tools/workflowTools.ts`

- `workflow_status`: Replace inline worktree lookup + `applyWorktreeOverlay()` with `resolveProject()`
- `workflow_next`: Same pattern
- Remove the now-unnecessary `applyWorktreeOverlay` import from this file

#### Step 4: Update MCP Context Tools

**File:** `packages/mcp-server/src/tools/contextTools.ts`

- `context_build` / `context_summarize`: Use `resolveProject()` for project retrieval
- Continue passing `worktreeId` to `ContextIntegrator` for metadata, but the project is already resolved

#### Step 5: Update CLI Commands

**Files:**
- `packages/cli/src/commands/project.ts` — `cf get`, `cf set` display
- `packages/cli/src/commands/build.ts` — `cf build`
- `packages/cli/src/commands/status.ts` — `cf status`
- `packages/cli/src/commands/workflow.ts` — `cf next`

Replace manual overlay calls with `resolveProject()`. The CLI's worktree detection (CWD-based or `--worktree` flag) remains — it just feeds the detected worktreeId into `resolveProject()`.

#### Step 6: Integration Tests

- Verify that `project_get` with `worktreeId` returns overlay-applied top-level fields
- Verify that `workflow_status` with `worktreeId` produces identical results to before
- Verify that `cf get` from within a worktree directory shows resolved fields
- Verify that `context_build` with `worktreeId` assembles context using worktree's active slice

### Core Package Export Updates

Add to `packages/core/src/index.ts`:

```typescript
export { resolveProject, type ResolvedProject } from './services/projectResolver.js';
```

## Integration Points

### Provides to Other Slices

- `resolveProject()` is the canonical way for any consumer to get a project view. Future tools and commands should use it instead of raw `store.getById()` when they need to respect worktree context.
- The `ResolvedProject` type with `resolvedWorktree` metadata is available for any consumer that needs to know whether resolution was applied.

### Consumes from Other Slices

- **206** — `WORKTREE_SCOPED_FIELDS`, `PROJECT_TO_WORKTREE_FIELD` from core (used by the overlay primitive this function wraps)
- `applyWorktreeOverlay()` — existing core utility
- `WorktreeService` — existing core service
- `FileProjectStore` — existing core storage

## Success Criteria

### Functional Requirements

- `project_get` with `worktreeId` returns project with overlay-applied top-level fields (e.g., `fileSlice` reflects the worktree's `activeSlice`, not the project-level value)
- `project_get` without `worktreeId` returns unchanged raw project data (backwards compatible)
- `workflow_status` and `workflow_next` produce identical results to current behavior (same overlay, same output — just applied via `resolveProject()` instead of inline code)
- `context_build` with worktree produces identical context output as before
- CLI commands (`cf get`, `cf status`, `cf next`, `cf build`) display resolved values when operating in a worktree context
- Missing worktreeId produces a clear error, not silent fallback to base project
- Response includes `resolvedWorktree: { id, name }` when overlay was applied, absent when not

### Technical Requirements

- `resolveProject()` has unit tests covering: no worktree, valid ID, valid name, missing worktree, missing project
- No remaining direct calls to `applyWorktreeOverlay()` in MCP tool handlers or CLI commands (all go through `resolveProject()`)
- `applyWorktreeOverlay()` remains exported from core as the low-level primitive (not deleted — available for edge cases)
- All existing tests pass without modification (beyond import path changes)

### Verification Walkthrough

**1. Confirm `project_get` returns resolved view:**
```bash
# Set up: have a project with a worktree that has different fileSlice than the project
# MCP call:
# project_get { id: "my-project", worktreeId: "api-foundation" }
# Expected: top-level fileSlice, fileArch, developmentPhase reflect worktree values
# Expected: resolvedWorktree: { id: "...", name: "api-foundation" } present in response
```

**2. Confirm `project_get` without worktree is unchanged:**
```bash
# MCP call:
# project_get { id: "my-project" }
# Expected: same raw project data as before, no resolvedWorktree field
```

**3. Confirm CLI resolution:**
```bash
# From within a worktree directory:
cd /path/to/worktree
cf get
# Expected: displayed values reflect worktree overlay
# Expected: output indicates which worktree is active
```

**4. Confirm workflow tools produce same results:**
```bash
# MCP call:
# workflow_status { worktreeId: "api-foundation" }
# Expected: identical output to current behavior
# (same slice status, same task progress — just resolved via new path)
```

**5. Confirm context build uses resolved project:**
```bash
cf build --worktree api-foundation
# Expected: context output references the worktree's active slice, arch doc, etc.
# Compare with previous output to confirm parity
```

**6. Confirm no remaining inline overlay calls:**
```bash
grep -rn "applyWorktreeOverlay" packages/mcp-server packages/cli --include="*.ts"
# Expected: no matches in tool handlers or command files
# (only in core where it's defined, and possibly in tests)
```

**7. Run test suite:**
```bash
npm test
# All existing tests pass; new resolveProject() unit tests pass
```

## Risk Assessment

### Technical Risks

- **Behavioral parity in context_build:** The context pipeline currently threads `worktreeId` separately and applies overrides at multiple points. Switching to a pre-resolved project must not break the template engine's assumptions about which fields are "base" vs "override." Mitigation: the template engine reads `fileSlice`, `fileArch`, etc. from the project object — it doesn't inspect the worktree array. Pre-resolving those fields to the worktree's values is transparent to the engine.

- **Introspection against resolved vs. raw project:** When `project_get` runs `ArtifactIntrospector.summarize(project)`, it uses `project.fileSlice` to check artifact presence. After this slice, the resolved `fileSlice` is the worktree's value — which is correct (we want introspection to reflect the worktree's active slice). But this is a behavioral change worth verifying: a worktree-scoped `project_get` will now show introspection for the worktree's slice, not the project-level slice.

### Mitigation Strategies

- Run context build diff tests: generate context with the current code and with the new code, diff the outputs
- Verify introspection output with and without worktreeId to confirm the change is intentional and correct
- Each migration step (Steps 2-5) should be independently testable — run the full suite after each

## Implementation Notes

### Development Approach

Suggested implementation order:

1. **Create `resolveProject()` + tests** — Additive, doesn't touch any consumer. Verify it works in isolation.
2. **Update MCP workflow tools** (`workflow_status`, `workflow_next`) — These already apply overlay; switching to `resolveProject()` is mechanical. Easiest MCP migration, good confidence builder.
3. **Update MCP `project_get`** — Add `worktreeId` parameter, switch to `resolveProject()`. New capability, not just refactor.
4. **Update MCP context tools** — More complex due to pipeline threading. Test context output parity carefully.
5. **Update CLI commands** — Mechanical replacement of overlay calls. Test each command individually.
6. **Remove dead code** — Clean up any now-unused inline overlay logic in consumer files.

Each step leaves the build passing and tests green.
