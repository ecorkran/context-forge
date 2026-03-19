---
docType: slice-design
slice: default-worktree-aggregation-field-reset
project: context-forge
parent: user/architecture/180-slices.initiative-context-worktree.md
dependencies: [191]
interfaces: []
dateCreated: 20260319
dateUpdated: 20260319
status: complete
---

# Slice Design: Default Worktree Aggregation & Field Reset

## Overview

Two improvements that complete the worktree UX and address recurring usability gaps.

**Default worktree aggregation:** When listing from the default worktree, the system should scan all registered worktree paths and union the results. Currently the default worktree only sees files on its own filesystem — if a 300-range architecture doc was created on a non-default worktree's branch and hasn't been merged, it's invisible from the project root. The default worktree should serve as a project-wide overview.

**Field reset (`cf unset`):** A new command to clear project or worktree fields back to unset state. Currently the only way to "unset" a field is `cf set <field> ' '` (a space), which is a workaround that stores a space character rather than truly clearing the field. Use cases: returning a project to first-run state for demos/tutorials, clearing stale artifact references after restructuring.

## Value

Default worktree aggregation delivers the "dashboard" promise — seeing all initiatives across all worktrees from the project root, regardless of which branch each worktree is on. Without this, the default worktree shows a partial view that depends on git merge state, which defeats its purpose as the overview position.

Field reset eliminates the clunky space-character workaround and makes project state management explicit. It also unblocks tutorial/demo workflows where returning to a clean first-run state is needed.

## Technical Scope

### Included

**Default worktree aggregation:**
- All worktrees (including default) filter by their own index range by default — consistent behavior across all worktrees
- New `--all` flag on listing commands scans all registered worktree paths and unions results (the "dashboard" view)
- Applies to: `cf arch list --all`, `cf tasks list --all`, `cf plan list --all`, `cf future --all`
- MCP: `all: boolean` parameter on `project_structure` and introspection tools (defaults to `false`)
- Deduplication: when the same file exists in multiple worktrees (after merge), it appears once
- `cf slice list` does NOT support `--all` — slice plans are worktree-specific artifacts

**Field reset:**
- New `cf unset <field>` command — clears a field to undefined/empty
- Works on both project-level and worktree-scoped fields
- `cf unset` with no args: shows usage help (does not accidentally unset anything)
- Guards: cannot unset required fields (`name`, `projectPath`)
- Guards: cannot unset readonly fields (`id`, `createdAt`, `updatedAt`)
- Also accessible as `cf project unset <field>`
- MCP: `project_update` already accepts empty strings; no MCP changes needed for basic unset

### Excluded

- No `cf reset` command (reset all fields at once) — out of scope, can be added later
- No MCP-specific `unset` tool — `project_update` with empty values covers this

## Dependencies

### Prerequisites

- **Slice 191 (Worktree-Aware File Operations):** `resolveOperationPath`, `getWorktreeIndexRange`, `isInIndexRange` helpers — complete

### Interfaces Required

- `ProjectData.worktrees[]` with `worktreePath` fields
- `resolveProjectWorktree()` for CWD resolution
- `FileProjectStore.update()` for field clearing
- `WorktreeService.updateWorktree()` for worktree field clearing

## Architecture

### Feature 1: Default Worktree Aggregation via `--all`

#### The Problem

After slice 191, each command resolves a single `operationPath` and scans only that directory. For the default worktree, `getWorktreeIndexRange` returns `undefined` (no filtering), so it shows all files on its filesystem. But files that only exist on non-default worktree branches are invisible. The default worktree also lacks its own index-range filtering — it shows everything on disk rather than scoping to its own range.

#### Behavioral Change from Slice 191

Slice 191 established: default worktree shows everything, non-default filters by range. This slice changes that:

- **All worktrees (including default) filter by their own index range** — consistent behavior
- **`--all` flag opts into cross-worktree aggregation** — scans all worktree paths, unions results, no index filtering
- **Projects without worktrees are unaffected** — no range means no filtering (same as today)

This means `getWorktreeIndexRange()` must change to return the default worktree's range instead of `undefined`. The "show everything" mode moves to `--all`.

#### Updated Helper

```typescript
// packages/cli/src/utils/worktree-overlay.ts

// CHANGE: getWorktreeIndexRange now returns range for ALL worktrees (including default)
// Returns undefined only when no worktreeId or no worktrees (projects without worktrees)
export function getWorktreeIndexRange(
  project: ProjectData,
  worktreeId?: string,
): [number, number] | undefined {
  if (!worktreeId || !project.worktrees) return undefined;
  const wt = project.worktrees.find((w) => w.id === worktreeId);
  if (!wt) return undefined;
  return wt.indexRange;  // Returns range for default too
}

// NEW: Get all paths for --all aggregation
export function resolveAllOperationPaths(
  project: ProjectData,
): string[] {
  const paths = new Set<string>();
  if (project.projectPath) paths.add(project.projectPath);
  for (const wt of project.worktrees ?? []) {
    if (wt.worktreePath) paths.add(wt.worktreePath);
  }
  return [...paths];
}
```

#### Aggregation Strategy (--all mode)

When `--all` is passed, the command scans all worktree paths and merges results with no index filtering:

```typescript
if (opts.all && project.worktrees?.length) {
  const paths = resolveAllOperationPaths(project);
  const models = await Promise.all(paths.map((p) => buildModel(p).catch(() => null)));
  const merged = mergeProjectModels(models.filter(Boolean));
  // Display merged — no index filtering
} else {
  // Single path with index-range filtering (existing behavior)
  const model = await buildModel(operationPath);
  // Filter by indexRange
}
```

#### Merging ProjectModel Results

A new utility function merges multiple `ProjectModel` objects:

```typescript
// packages/core/src/introspection/ProjectModelBuilder.ts

export function mergeProjectModels(models: ProjectModel[]): ProjectModel {
  if (models.length === 0) throw new Error('No models to merge');
  if (models.length === 1) return models[0];

  const merged: ProjectModel = { /* ... init from models[0] ... */ };

  for (const model of models) {
    // Merge initiatives (deduplicate by index key, prefer the one with more data)
    for (const [key, init] of Object.entries(model.initiatives)) {
      if (!merged.initiatives[key]) {
        merged.initiatives[key] = init;
      }
    }
    // Similar dedup for foundation, quality, maintenance, etc.
  }

  return merged;
}
```

#### Commands That Get `--all`

| Command | Default behavior (after 192) | With `--all` |
|---------|------------------------------|-------------|
| `cf arch list` | Scoped to worktree's index range (all worktrees including default) | Aggregates across all worktree paths |
| `cf tasks list` | Scoped to worktree's index range | Aggregates across all paths |
| `cf plan list` | Scoped to worktree's index range | Aggregates across all paths |
| `cf future` | Scoped to worktree's index range | Aggregates across all paths |
| `cf slice list` | Scoped to worktree's slice plan | No `--all` — slice plans are worktree-specific |

**Unchanged commands:**
- `cf check` — already iterates all worktree views via `applyWorktreeOverlay`
- `cf status --worktrees` — already iterates all worktrees for the dashboard
- `cf prompt list/get` — not index-based

#### MCP Impact

`project_structure` and introspection tools gain an optional `all: boolean` parameter (defaults to `false`). When `true`, scans all worktree paths and merges. When `false`, uses the existing single-path + index-range behavior.

The `resolveOperationContext` helper in `resolveOperationPath.ts` gains a `resolveAllOperationPaths()` variant for the aggregation codepath.

### Feature 2: Field Reset (`cf unset`)

#### Command Design

```
cf unset <field>                     # Unset on project or active worktree
cf unset <field> --project-level     # Force unset at project level
cf unset <field> --project <name>    # Specify project explicitly
cf project unset <field>             # Same as cf unset
```

**Safety guards:**
- `cf unset` with no args → shows usage help, does not unset
- `cf unset name` → error: "Cannot unset required field 'name'"
- `cf unset projectPath` → error: "Cannot unset required field 'projectPath'"
- `cf unset id` → error: "Cannot unset read-only field 'id'"
- `cf unset nonexistent` → error: "Unknown field: 'nonexistent'"

**Alias support:** `cf unset arch` works (resolves to `fileArch`), same as `cf set arch <value>`.

#### Implementation

New `projectUnsetAction` function in `project.ts`:

```typescript
export async function projectUnsetAction(
  field: string,
  opts: { project?: string; projectLevel?: boolean },
): Promise<void> {
  const resolvedField = resolveFieldName(field);
  if (!resolvedField) {
    throw new UserError(`Unknown field: '${field}'. Run 'cf project --schema' to see available fields.`);
  }

  const fieldDef = PROJECT_FIELDS.find((f) => f.field === resolvedField);
  if (fieldDef?.required) {
    throw new UserError(`Cannot unset required field '${resolvedField}'.`);
  }
  if (fieldDef?.readonly) {
    throw new UserError(`Cannot unset read-only field '${resolvedField}'.`);
  }

  const store = new FileProjectStore();
  const resolved = await resolveProjectWorktree({ project: opts.project }, store);
  const existing = await store.getById(resolved.id);
  // ...

  if (worktreeId && isWorktreeField(resolvedField) && !opts.projectLevel) {
    // Unset on worktree context
    const wtField = PROJECT_TO_WORKTREE_FIELD[resolvedField] ?? resolvedField;
    await svc.updateWorktree(id, worktreeId, { [wtField]: undefined });
    console.log(success(`Unset ${displayName} on worktree context "${worktreeName}"`));
  } else {
    // Unset on project
    await store.update(id, { [resolvedField]: undefined });
    console.log(success(`Unset ${displayName} on project ${existing.name}`));
  }
}
```

#### Clearing Behavior

When `store.update()` receives `{ fileSlice: undefined }`, the shallow merge `{ ...existing, ...updates }` includes the key with `undefined`. `JSON.stringify` omits `undefined` values, so the field is effectively removed from storage. This is the desired behavior — the field becomes truly unset, not empty-string.

For `WorktreeService.updateWorktree()`, the same pattern applies — `{ ...worktree, ...updates }` with `undefined` values, and `JSON.stringify` strips them.

**Auto-unset cascades:** When unsetting `fileArch`, should `fileSlicePlan` be auto-unset too? **Decision: No.** Unsetting is explicit. The user unsets one field at a time. Auto-cascading would be surprising — the user may want to keep the plan even if the arch reference changes.

### File Changes

**New:**
- None (all changes in existing files)

**Modified (CLI):**
- `packages/cli/src/utils/worktree-overlay.ts` — add `resolveAllOperationPaths()` helper
- `packages/cli/src/commands/arch.ts` — use aggregation for default worktree
- `packages/cli/src/commands/task.ts` — use aggregation for `listTaskFiles`
- `packages/cli/src/commands/plan.ts` — use aggregation for plan listing
- `packages/cli/src/commands/future.ts` — use aggregation for future work
- `packages/cli/src/commands/project.ts` — add `projectUnsetAction()`, export it
- `packages/cli/src/index.ts` — register `cf unset` top-level command

**Modified (Core):**
- `packages/core/src/introspection/ProjectModelBuilder.ts` — add `mergeProjectModels()` function, export it

**Modified (MCP):**
- `packages/mcp-server/src/tools/introspectionTools.ts` — `project_structure` and introspection tools gain `all: boolean` parameter
- `packages/mcp-server/src/tools/resolveOperationPath.ts` — add `resolveAllOperationPaths()` variant

## Success Criteria

### Functional Requirements

**Default worktree scoping (behavioral change from 191):**
- Default worktree now filters by its own index range (same as non-default worktrees)
- `cf arch list` from default worktree shows only initiatives within the default worktree's range
- Projects without worktrees: unchanged (no range = no filtering)

**`--all` aggregation:**
- `cf arch list --all` shows initiatives from all worktree paths (e.g., both 100-range and 300-range docs)
- `cf plan list --all` shows slice plans from all worktree paths
- `cf tasks list --all` shows task files from all worktree paths
- `cf future --all` shows future work from all worktree paths
- Duplicate entries (same file in multiple worktrees after merge) appear only once
- MCP `project_structure` with `all: true` returns aggregated view
- MCP `project_structure` with `all: false` (default) returns scoped view

**Field reset:**
- `cf unset <field>` clears the field from the project
- `cf unset <alias>` works (e.g., `cf unset arch` clears `fileArch`)
- `cf unset <field>` from a worktree clears the worktree-scoped field
- `cf unset <field> --project-level` clears the project-level field even from a worktree
- `cf unset name` → error: required field
- `cf unset id` → error: read-only field
- `cf unset` (no args) → usage help, no side effects
- After unset, `cf get` shows the field as `—` (unset placeholder)
- `cf project unset <field>` also works (subcommand form)

### Technical Requirements

- `getWorktreeIndexRange()` updated: returns range for default worktree too (not `undefined`)
- `resolveAllOperationPaths()` tested with: project with worktrees, project without worktrees, worktree without path
- `mergeProjectModels()` tested with: single model, two models with non-overlapping initiatives, two models with overlapping initiatives (dedup)
- `projectUnsetAction()` tested with: valid field, required field (error), readonly field (error), unknown field (error), worktree-scoped field, project-level field
- All existing tests pass unchanged

### Verification Walkthrough

**Setup:** Project `migratory` with worktrees:
- `default` (range 100-799) at `~/repos/migratory` — has `100-arch.behavior-engine` on its branch
- `world-server` (range 300-499) at `~/repos/migratory-world-server` — has both 100 and 300 range files

**1. Default worktree scoped to its own range:**
```bash
cd ~/repos/migratory
cf arch list
# Expected: shows only initiatives within default worktree's range (100-299)
# e.g., 100-arch.behavior-engine — NOT 300-range docs
```

**2. `--all` aggregation from any worktree:**
```bash
cd ~/repos/migratory
cf arch list --all
# Expected: shows BOTH 100-arch.behavior-engine AND 300-arch.worldserver-foundation
# (300 is pulled from the world-server worktree path)
```

**3. Non-default worktree unchanged:**
```bash
cd ~/repos/migratory-world-server
cf arch list
# Expected: shows ONLY 300-arch.worldserver-foundation (same as slice 191)
```

**3. cf unset — basic usage:**
```bash
cf set arch 300
cf get | grep -i arch
# Shows: 300-arch.worldserver-foundation

cf unset arch
cf get | grep -i arch
# Shows: — (unset)
```

**4. cf unset — required field guard:**
```bash
cf unset name
# Expected: error "Cannot unset required field 'name'"
```

**5. cf unset — worktree-scoped:**
```bash
cd ~/repos/migratory-world-server
cf set phase 6
cf unset phase
cf get | grep -i phase
# Shows: — (unset on worktree context)
```

**7. No regression for projects without worktrees:**
```bash
cd ~/repos/context-forge    # no worktrees
cf arch list
# Expected: identical to current behavior (no range = no filtering)
```

**8. MCP project_structure with `all: true`:**
```
Call project_structure with projectId="migratory", all=true
# Expected: initiatives include both 100-band and 300-band
```

**9. MCP project_structure with worktreeId (scoped):**
```
Call project_structure with projectId="migratory", worktreeId="default"
# Expected: only 100-band (default worktree's range)
Call project_structure with projectId="migratory", worktreeId="world-server"
# Expected: only 300-band
```

## Implementation Notes

### Development Approach

Suggested order:

1. **Update `getWorktreeIndexRange()`** — return range for default worktree too (behavioral change)
2. **`resolveAllOperationPaths()` + `mergeProjectModels()`** — new helpers, testable in isolation
3. **`cf arch list --all`** — highest visibility, proves the pattern; also update default to filter by range
4. **`cf plan list --all`, `cf tasks list --all`, `cf future --all`** — same pattern
5. **MCP `project_structure` `all` parameter** — extends the MCP helper
6. **`cf unset` command** — independent of aggregation work
7. **Tests** — unit tests for each component

### Effort

3/5 — Two independent features. Aggregation requires merging model results which has edge cases around deduplication. Field reset is straightforward. Most complexity is in `mergeProjectModels` and ensuring all listing commands handle multi-path correctly.
