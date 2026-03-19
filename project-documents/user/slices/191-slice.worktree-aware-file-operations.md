---
docType: slice-design
slice: worktree-aware-file-operations
project: context-forge
parent: user/architecture/180-slices.initiative-context-worktree.md
dependencies: [182, 183]
interfaces: []
dateCreated: 20260318
dateUpdated: 20260318
status: not_started
---

# Slice Design: Worktree-Aware File Operations

## Overview

CLI commands that scan or list project document files use `project.projectPath` for all filesystem operations. When run from a non-default worktree, they only see files in the main worktree — missing documents that exist only in the worktree's directory (e.g., a new architecture doc created in `migratory-world-server` is invisible to `cf arch list`). The same problem affects MCP introspection tools and the context-visualizer's `project_structure` call.

This slice fixes two related problems:

1. **Path resolution:** File-scanning operations must use the worktree's filesystem path instead of the main project path.
2. **Index-range scoping:** When in a non-default worktree, listing commands should show only documents within that worktree's index range — not the entire project's documents. Since all worktrees share the same branch content after merges, path alone doesn't provide isolation; index-range filtering is required.

**Scoping rules:**
- **Default worktree:** show everything (no filter) — it's the overview position
- **Non-default worktree:** show only documents within that worktree's `indexRange` (e.g., 300-499)
- `cf set` from a non-default worktree with an index outside the worktree's range: **warn** but allow

## Value

Users in non-default worktrees get incorrect or missing results from `cf arch list`, `cf set arch <index>`, `cf slice list`, `cf tasks list`, `cf plan list`, `cf check`, `cf future`, and `cf status --worktrees`. This makes worktrees unusable for any workflow that involves listing or setting artifact references. The visualizer also cannot display worktree-specific document structures because `project_structure` always scans the main project path.

Fixing this completes the worktree story — after this slice, all CLI and MCP operations are worktree-aware.

## Technical Scope

### Included

**CLI commands (10):**
- `cf arch list` — `buildModel()` call uses `projectPath`
- `cf slice list` — slice plan path join and `detectDocuments()` use `projectPath`
- `cf tasks list` / `cf tasks items` — tasks directory scan and path joins use `projectPath`
- `cf plan list` — architecture directory scan uses `projectPath`
- `cf set <field>` — `resolveFileByIndex()` calls use `projectPath`
- `cf check` — `ConsistencyChecker` reads `project.projectPath` internally
- `cf status --worktrees` — slice plan parsing uses `projectPath`
- `cf future` — `FutureWorkCollector.collect()` uses `projectPath`
- `cf prompt list/get` — prompt file path join uses `projectPath`

**MCP tools:**
- `project_structure` — `buildModel()` call uses `projectPath`
- `introspection_documents` — `detectDocuments()` uses resolved path
- `introspection_tasks` — `parseTaskFile()` uses resolved path
- `introspection_future_work` — `parseFutureWork()` uses resolved path
- `introspection_slice_plan` — `parseSlicePlan()` uses resolved path

**Core service (1 change):**
- `ConsistencyChecker` — reads `project.projectPath` directly; needs to accept an explicit path override

### Excluded

- No changes to core function signatures for `buildModel`, `resolveFileByIndex`, `FutureWorkCollector.collect`, or `ArtifactIntrospector` methods — these already accept a plain `projectPath: string` parameter. Callers just need to pass the right path.
- No changes to `cf build` or `cf next` — already worktree-aware
- No changes to `cf guides` — already worktree-aware (slice 190)
- No changes to worktree data model or storage

## Dependencies

### Prerequisites

- **Slice 182 (CWD Resolution):** `resolveProjectWorktree()` returns `worktreeId` when CWD matches a worktree — complete
- **Slice 183 (Worktree CLI Commands):** worktree-aware `cf set` routing (workflow fields → worktree, project fields → project) — complete

### Interfaces Required

- `resolveProjectWorktree()` from `packages/cli/src/utils/project.ts`
- `ProjectData.worktrees[]` with `worktreePath` fields
- `applyWorktreeOverlay()` from `packages/cli/src/utils/worktree-overlay.ts`

## Architecture

### Two-Part Fix: Path Resolution + Index-Range Scoping

**Part 1: operationPath** — the same pattern used in `guides.ts` (slice 190), applied to all remaining file-scanning commands. Ensures filesystem operations hit the correct worktree directory.

**Part 2: index-range filtering** — when a non-default worktree is resolved, filter listing results to only include documents whose numeric index falls within the worktree's `indexRange`. This is necessary because all worktrees eventually share the same files after branch merges — path alone doesn't provide isolation.

### Shared Helpers

Add to `packages/cli/src/utils/worktree-overlay.ts`:

```typescript
/**
 * Resolve the filesystem path for file operations.
 * Returns worktreePath when a worktree is resolved and has a path,
 * otherwise returns projectPath.
 */
export function resolveOperationPath(
  project: ProjectData,
  worktreeId?: string,
): string {
  if (worktreeId && project.worktrees) {
    const wt = project.worktrees.find((w) => w.id === worktreeId);
    if (wt?.worktreePath) return wt.worktreePath;
  }
  return project.projectPath;
}

/**
 * Get the index range for filtering, if applicable.
 * Returns undefined for the default worktree or when no worktree is resolved
 * (meaning: show everything, no filter).
 * Returns [start, end] for non-default worktrees.
 */
export function getWorktreeIndexRange(
  project: ProjectData,
  worktreeId?: string,
): [number, number] | undefined {
  if (!worktreeId || !project.worktrees) return undefined;
  const wt = project.worktrees.find((w) => w.id === worktreeId);
  if (!wt || wt.name === 'default') return undefined;
  return wt.indexRange;
}

/**
 * Check if a numeric index falls within an optional range.
 * Returns true if no range is specified (no filtering).
 */
export function isInIndexRange(
  index: number,
  range?: [number, number],
): boolean {
  if (!range) return true;
  return index >= range[0] && index <= range[1];
}
```

### Index-Range Filtering by Command

**`cf arch list`** — `buildModel()` returns a `ProjectModel` with initiatives keyed by index. Filter the model's entries to only include those within the worktree's range.

**`cf slice list`** — already scoped by the worktree's slice plan (which is index-specific). The slice plan itself lists entries with indices — filter entries by range. `detectDocuments()` calls are per-entry, so they're naturally scoped.

**`cf tasks list`** — scans the tasks directory for files matching `nnn-tasks.*`. Filter by extracting the numeric prefix and checking against the range.

**`cf plan list`** — scans architecture directory for `nnn-slices.*` files. Filter by index prefix.

**`cf set <field>`** — `resolveFileByIndex()` finds files by index. When the resolved index is outside the worktree's range, emit a warning: `Warning: index {n} is outside this worktree's range [{start}-{end}]`. Allow the operation to proceed.

**`cf future`** — `FutureWorkCollector` scans all documents. Filter results by index range.

**`cf check`** — `ConsistencyChecker.checkAll()` iterates all slice plan entries. When scoped to a worktree, only check entries within the range.

**`cf status --worktrees`** — this is a project-wide dashboard, not per-worktree filtered. No index filtering needed. Each worktree's slice plan progress is resolved from that worktree's `worktreePath`.

**`cf prompt list/get`** — prompt files are not index-based. No filtering needed; just path resolution.

### Command Changes

Each affected command already calls `resolveProjectWorktree()` (or `resolveProjectId()`) to get the project. The change in each is:

1. Ensure the command uses `resolveProjectWorktree()` (not `resolveProjectId()`) to get `worktreeId`
2. Call `resolveOperationPath(project, worktreeId)` to get the filesystem path
3. Call `getWorktreeIndexRange(project, worktreeId)` to get the optional filter range
4. Pass `operationPath` instead of `project.projectPath` to file-scanning calls
5. Apply `isInIndexRange()` to filter results when a range is active

### ConsistencyChecker Change

Unlike other core services, `ConsistencyChecker` reads `project.projectPath` from the `ProjectData` object internally rather than accepting a path parameter. Two options:

**Option A: Override projectPath on the view object.** Before passing to the checker, set `projectPath` on the overlaid view to the worktree path. The checker's internal logic works unchanged.

**Option B: Add an explicit path parameter.** Add an optional `operationPath` to `check()` and `checkAll()`.

**Decision: Option A.** The checker already receives overlaid project views via `applyWorktreeOverlay()`. Adding `projectPath` override to the overlay is simpler — one line per view instead of threading a parameter through dozens of private methods. The `projectPath` on the view becomes "where to find this view's files" rather than "the project's canonical path."

Implementation in `check.ts`:
```typescript
const projectViews = worktrees.length > 0
  ? worktrees.map((wt) => {
      const view = applyWorktreeOverlay(project, wt.id);
      if (wt.worktreePath) view.projectPath = wt.worktreePath;
      return view;
    })
  : [project];
```

This means each worktree's consistency check scans files from that worktree's directory. Aggregate rules (like discovering all slice plans) scan each worktree's `project-documents/` independently, and findings are deduplicated by the existing `mergeCheckResults()`.

When run from a non-default worktree (single-worktree mode, not `--all`), `checkAll()` should only iterate slice plan entries within the worktree's index range. This requires passing the range to the checker or pre-filtering the slice plan entries before calling `checkAll()`.

### Decision: Prompt Files

**`cf prompt list` and `cf prompt get`** resolve the prompt file at `{projectPath}/project-documents/ai-project-guide/project-guides/prompt.ai-project.system.md`.

Prompt files live in the ai-project-guide submodule. In git worktrees, the submodule has per-worktree checkout state (the exact issue slice 190 fixed for `cf guides`). Slice 190 ensures guide files are synced across worktrees, so the content should be identical.

**Decision:** Make `cf prompt list/get` worktree-aware. Even though guide content should be identical after slice 190, the filesystem path must resolve correctly — if the user hasn't run `cf guides update` recently, the prompt file in a worktree may exist at a different path. Using `operationPath` ensures the command reads from the directory the user is actually working in.

### Decision: Future Work Scope

**`cf future`** collects future work items from slice plans and documents across the project.

**Decision:** Make `cf future` worktree-aware. When run from a worktree, it should scan that worktree's `project-documents/` directory. A worktree may have different slice plans (different initiative), and future work items are scoped to the documents present in the worktree.

### Decision: Status --worktrees Scope

**`cf status --worktrees`** displays a project-wide dashboard of all worktrees with their current slice plan progress. It is not per-worktree filtered — it always shows all worktrees regardless of where it's run from.

**Decision:** The dashboard's slice plan parsing for each worktree should resolve the plan file path from that worktree's `worktreePath` (so progress is read from the correct filesystem location). No index-range filtering applies here — this is an overview command.

### MCP Changes

MCP introspection tools resolve a `projectPath` via `resolveProjectPath()` and pass it to core functions. The fix:

1. Add optional `worktreeId` input parameter to `project_structure`, `introspection_documents`, `introspection_tasks`, `introspection_future_work`, `introspection_slice_plan`
2. When `worktreeId` is provided, look up the worktree's `worktreePath` and use it instead of `projectPath`
3. Apply index-range filtering to results when the worktree is non-default
4. The core functions already accept a path string — just pass the right one

**MCP worktreeId accepts name or ID.** Agents frequently pass the worktree name rather than the internal `wt_*` ID. The resolver matches against both `w.id` and `w.name`.

A shared helper in the MCP layer:

```typescript
// packages/mcp-server/src/tools/resolveOperationPath.ts

interface ResolvedOperation {
  operationPath: string;
  indexRange?: [number, number];  // undefined = no filter (default worktree or no worktree)
}

export async function resolveOperationContext(
  args: { projectId?: string; worktreeId?: string },
): Promise<ResolvedOperation> {
  const projectPath = await resolveProjectPath({ projectId: args.projectId });
  if (!args.worktreeId) return { operationPath: projectPath };

  const store = new FileProjectStore();
  const project = await store.getById(args.projectId!);
  if (!project?.worktrees) return { operationPath: projectPath };

  const wt = project.worktrees.find(
    (w) => w.id === args.worktreeId || w.name === args.worktreeId,
  );
  if (!wt) return { operationPath: projectPath };

  const operationPath = wt.worktreePath ?? projectPath;
  const indexRange = wt.name === 'default' ? undefined : wt.indexRange;
  return { operationPath, indexRange };
}
```

### File Changes

**New:**
- None (helper added to existing files)

**Modified (CLI):**
- `packages/cli/src/utils/worktree-overlay.ts` — add `resolveOperationPath()` helper
- `packages/cli/src/commands/arch.ts` — use `resolveOperationPath` for `buildModel()` call
- `packages/cli/src/commands/slice.ts` — use `resolveOperationPath` for plan path and `detectDocuments()`
- `packages/cli/src/commands/task.ts` — use `resolveOperationPath` in `listTaskFiles()` and `listTaskItems()`
- `packages/cli/src/commands/plan.ts` — use `resolveOperationPath` for architecture directory scan
- `packages/cli/src/commands/project.ts` — use `resolveOperationPath` in `resolveFileByIndex()` calls within `projectSetAction`
- `packages/cli/src/commands/check.ts` — override `projectPath` on worktree views before passing to checker
- `packages/cli/src/commands/status.ts` — use worktree path for slice plan parsing in `--worktrees` dashboard
- `packages/cli/src/commands/future.ts` — add worktree resolution, pass `operationPath` to collector
- `packages/cli/src/commands/prompt.ts` — use `resolveOperationPath` for prompt file path

**Modified (MCP):**
- `packages/mcp-server/src/tools/introspectionTools.ts` — add `worktreeId` parameter to `project_structure`, `introspection_documents`, `introspection_tasks`, `introspection_future_work`, `introspection_slice_plan`; resolve worktree path before calling core functions

**Modified (CLI — minor):**
- Commands that currently use `resolveProjectId()` must switch to `resolveProjectWorktree()` to get `worktreeId`. Check each command — some may already use `resolveProjectWorktree()`.

**Not modified (core):**
- `ProjectModelBuilder.buildModel()` — already accepts `projectPath: string`, works with any path
- `resolveFileByIndex()` — already accepts `projectPath: string`
- `FutureWorkCollector.collect()` — already accepts `projectPath: string`
- `ArtifactIntrospector.detectDocuments()` — already accepts `projectPath: string`
- `ConsistencyChecker` — no code changes; fix is in the caller (override `projectPath` on the view)

## Success Criteria

### Functional Requirements

**Path resolution:**
- All file-scanning commands use the worktree's filesystem path when run from a non-default worktree
- `cf prompt list/get` reads the prompt file from the worktree path
- `cf status --worktrees` resolves each worktree's slice plan from its own path (project-wide dashboard, no index filtering)

**Index-range scoping (non-default worktrees only):**
- `cf arch list` shows only architecture docs within the worktree's index range
- `cf slice list` shows only slices within the worktree's index range
- `cf tasks list` shows only task files within the worktree's index range
- `cf plan list` shows only slice plans within the worktree's index range
- `cf check` validates only documents within the worktree's index range
- `cf future` shows only future work items within the worktree's index range
- `cf set <field> <index>` warns when index is outside the worktree's range but allows the operation

**Default worktree / no worktree:**
- All commands from the default worktree show everything (no filter)
- All commands from the main project path work identically to today (no regression)
- Projects without worktrees behave identically to today

**MCP:**
- `worktreeId` parameter accepts worktree name or ID (agents frequently pass names)
- `project_structure` with `worktreeId` returns only documents within the worktree's index range
- MCP introspection tools with `worktreeId` operate on the worktree's documents, filtered by range

### Technical Requirements

- `resolveOperationPath()` helper tested with: worktreeId present + path exists, worktreeId present + no path, no worktreeId, no worktrees array
- `getWorktreeIndexRange()` tested with: non-default worktree, default worktree (returns undefined), no worktree
- `isInIndexRange()` tested with: in range, out of range, no range (returns true)
- Each affected command has at least one test verifying index-range filtering
- All existing tests pass unchanged

### Verification Walkthrough

**Setup:** Project `migratory` with worktrees:
- `default` (range 100-799) at `~/repos/migratory` — has `100-arch.behavior-engine`, `100-slices.behavior-engine`, `300-arch.worldserver-foundation`, `300-slices.worldserver-foundation`
- `world-server` (range 300-499) at `~/repos/migratory-world-server` — same files (branches merge)

**1. cf arch list from non-default worktree (index-range scoping):**
```bash
cd ~/repos/migratory-world-server
cf arch list
# Expected: shows ONLY 300-arch.worldserver-foundation (within 300-499 range)
# Before fix: showed 100-arch.behavior-engine (from main worktree path, no filtering)
```

**2. cf arch list from default worktree (show everything):**
```bash
cd ~/repos/migratory
cf arch list
# Expected: shows ALL arch docs — 100-arch.behavior-engine, 300-arch.worldserver-foundation, etc.
```

**3. cf set arch from worktree:**
```bash
cd ~/repos/migratory-world-server
cf set arch 300
# Expected: sets fileArch to 300-arch.worldserver-foundation

cf set arch 100
# Expected: warns "index 100 is outside this worktree's range [300-499]" but proceeds
```

**4. cf slice list from worktree:**
```bash
cd ~/repos/migratory-world-server
cf slice list
# Expected: shows only slices within 300-499 range
```

**5. cf tasks list from worktree:**
```bash
cd ~/repos/migratory-world-server
cf tasks list
# Expected: lists only task files with index in 300-499 range
```

**6. cf plan list from worktree:**
```bash
cd ~/repos/migratory-world-server
cf plan list
# Expected: shows only slice plans with index in 300-499 range (e.g., 300-slices.worldserver-foundation)
```

**7. cf check from worktree:**
```bash
cd ~/repos/migratory-world-server
cf check
# Expected: validates only documents within 300-499 range
```

**8. cf status --worktrees (project-wide dashboard):**
```bash
cd ~/repos/migratory-world-server
cf status --worktrees
# Expected: shows ALL worktrees with correct progress (reads each worktree's plan from its own path)
# This is a project-wide view, not filtered by current worktree
```

**9. MCP project_structure with worktreeId (name, not ID):**
```
Call project_structure with projectId="migratory", worktreeId="world-server"
# Expected: document tree shows only 300-range documents
# Accepts worktree name ("world-server") not just internal wt_* ID
```

**10. No regression from default worktree:**
```bash
cd ~/repos/migratory
cf arch list
# Expected: shows all arch docs (no filtering for default worktree)
```

**11. No regression for projects without worktrees:**
```bash
cd ~/repos/context-forge
cf arch list
# Expected: identical to current behavior
```

## Implementation Notes

### Development Approach

Suggested order:

1. **`resolveOperationPath()` helper** — add to `worktree-overlay.ts`, write unit tests
2. **`cf set` (project.ts)** — highest user impact (the original bug report), uses `resolveFileByIndex`
3. **`cf arch list` (arch.ts)** — simple, one `buildModel` call
4. **`cf slice list` (slice.ts)** — two path usages
5. **`cf tasks list/items` (task.ts)** — multiple path usages in helper functions
6. **`cf plan list` (plan.ts)** — single directory scan
7. **`cf check` (check.ts)** — projectPath override on views
8. **`cf status --worktrees` (status.ts)** — per-worktree plan path
9. **`cf future` (future.ts)** — add worktree resolution
10. **`cf prompt list/get` (prompt.ts)** — prompt file path
11. **MCP introspection tools** — add `worktreeId` parameter, resolve path
12. **Tests** — unit tests for helper, integration tests for key commands

### Commands Needing resolveProjectWorktree Migration

Some commands currently use `resolveProjectId()` which drops worktree information. These must be migrated to `resolveProjectWorktree()`:

- `future.ts` — uses `resolveProjectId()`
- `prompt.ts` — uses `resolveProjectId()`
- `check.ts` — uses `resolveProjectId()` (but has `applyWorktreeOverlay` logic — may need review)

Commands already using `resolveProjectWorktree()`: `arch.ts`, `slice.ts`, `task.ts`, `plan.ts`, `status.ts`, `project.ts` (via `projectSetAction`).

### Effort

4/5 — Many files touched. The `operationPath` pattern is mechanical, but index-range filtering adds real complexity: each listing command needs filtering logic, `buildModel()` results need post-filtering, `cf set` needs an out-of-range warning path, `ConsistencyChecker` needs range-scoped iteration, and MCP tools need both path and range resolution. Testing the filtering across all commands is the bulk of the work.
