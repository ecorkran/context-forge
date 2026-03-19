---
docType: slice-design
slice: default-worktree-aggregation-field-reset
project: context-forge
parent: user/architecture/180-slices.initiative-context-worktree.md
dependencies: [191]
interfaces: []
dateCreated: 20260319
dateUpdated: 20260319
status: not_started
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
- When in the default worktree (or no worktree), listing commands aggregate results across all registered worktree paths
- Applies to: `cf arch list`, `cf slice list`, `cf tasks list`, `cf plan list`, `cf future`
- MCP `project_structure` with no `worktreeId` (or `worktreeId="default"`) returns the aggregated view
- Deduplication: when the same file exists in multiple worktrees (after merge), it appears once

**Field reset:**
- New `cf unset <field>` command — clears a field to undefined/empty
- Works on both project-level and worktree-scoped fields
- `cf unset` with no args: shows usage help (does not accidentally unset anything)
- Guards: cannot unset required fields (`name`, `projectPath`)
- Guards: cannot unset readonly fields (`id`, `createdAt`, `updatedAt`)
- Also accessible as `cf project unset <field>`
- MCP: `project_update` already accepts empty strings; no MCP changes needed for basic unset

### Excluded

- No config option for default worktree behavior (aggregation is always on for default)
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

### Feature 1: Default Worktree Aggregation

#### The Problem

After slice 191, each command resolves a single `operationPath` and scans only that directory. For the default worktree (or no worktree), `resolveOperationPath` returns `project.projectPath`. Since `getWorktreeIndexRange` returns `undefined` for the default worktree (no filtering), the default worktree shows all files found on its filesystem — but files that only exist on non-default worktree branches are invisible.

#### The Solution

Add a new helper that returns all worktree paths when the default worktree is active:

```typescript
// packages/cli/src/utils/worktree-overlay.ts

/**
 * Get all paths to scan for aggregate results.
 * For the default worktree (or no worktree): returns all worktree paths + projectPath.
 * For a non-default worktree: returns only that worktree's path.
 * Used by listing commands to provide the "overview" from the default worktree.
 */
export function resolveAllOperationPaths(
  project: ProjectData,
  worktreeId?: string,
): string[] {
  // Non-default worktree: single path, already handled by resolveOperationPath
  if (worktreeId && project.worktrees) {
    const wt = project.worktrees.find((w) => w.id === worktreeId);
    if (wt && wt.name !== 'default') {
      return wt.worktreePath ? [wt.worktreePath] : [project.projectPath].filter(Boolean) as string[];
    }
  }

  // Default worktree or no worktree: aggregate all paths
  const paths = new Set<string>();
  if (project.projectPath) paths.add(project.projectPath);
  for (const wt of project.worktrees ?? []) {
    if (wt.worktreePath) paths.add(wt.worktreePath);
  }
  return [...paths];
}
```

#### Aggregation Strategy

Each listing command calls `buildModel()` (or scans a directory) on each path and merges results:

```typescript
const paths = resolveAllOperationPaths(project, worktreeId);
const indexRange = getWorktreeIndexRange(rawProject, worktreeId);

if (paths.length === 1) {
  // Single path — existing behavior
  const model = await buildModel(paths[0]);
  // ... filter and display
} else {
  // Multiple paths — aggregate
  const models = await Promise.all(paths.map((p) => buildModel(p).catch(() => null)));
  const merged = mergeProjectModels(models.filter(Boolean));
  // ... filter and display
}
```

#### Merging ProjectModel Results

A new utility function merges multiple `ProjectModel` objects:

```typescript
// packages/core/src/introspection/ProjectModelBuilder.ts

export function mergeProjectModels(models: ProjectModel[]): ProjectModel {
  if (models.length === 0) throw new Error('No models to merge');
  if (models.length === 1) return models[0];

  const merged: ProjectModel = {
    name: models[0].name,
    description: models[0].description,
    foundation: [],
    projectArchitecture: [],
    initiatives: {},
    futureSlices: [],
    quality: [],
    investigation: [],
    maintenance: [],
    devlog: models.some((m) => m.devlog),
  };

  for (const model of models) {
    // Merge foundation docs (deduplicate by name)
    for (const doc of model.foundation) {
      if (!merged.foundation.some((d) => d.name === doc.name)) {
        merged.foundation.push(doc);
      }
    }
    // Merge initiatives (deduplicate by index key)
    for (const [key, init] of Object.entries(model.initiatives)) {
      if (!merged.initiatives[key]) {
        merged.initiatives[key] = init;
      }
      // If initiative exists in both, prefer the one with more data (arch doc, slices, etc.)
    }
    // Similar dedup for other arrays...
  }

  return merged;
}
```

#### Commands That Need Aggregation

| Command | Current | After |
|---------|---------|-------|
| `cf arch list` | Calls `buildModel(operationPath)` | Calls `buildModel` on each path, merges |
| `cf slice list` | Reads one plan file | No change — slice plan is worktree-specific, not aggregated |
| `cf tasks list` | Scans one tasks directory | Scans all paths' task directories, deduplicates |
| `cf plan list` | Scans one architecture directory | Scans all paths' architecture directories, deduplicates |
| `cf future` | Calls `collector.collect(operationPath)` | Calls collect on each path, merges |

**Note:** `cf slice list` does NOT aggregate — the slice plan is a worktree-specific artifact. From the default worktree, it shows the default worktree's configured slice plan (which may show all slices if the plan is comprehensive). This is correct behavior.

**Note:** `cf check` does NOT change — it already iterates all worktree views via `applyWorktreeOverlay`. The check command's existing multi-view pattern handles this correctly.

**Note:** `cf status --worktrees` does NOT change — it already iterates all worktrees for the dashboard.

#### MCP Impact

`project_structure` in `introspectionTools.ts`: when no `worktreeId` is provided (or `worktreeId="default"`), call `buildModel` on all worktree paths and merge. The `resolveOperationContext` helper in `resolveOperationPath.ts` needs a similar multi-path variant.

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
- `packages/mcp-server/src/tools/introspectionTools.ts` — `project_structure` aggregates when no worktreeId
- `packages/mcp-server/src/tools/resolveOperationPath.ts` — add `resolveAllOperationPaths()` variant

## Success Criteria

### Functional Requirements

**Default worktree aggregation:**
- `cf arch list` from default worktree shows initiatives from all worktree paths (e.g., both 100-range and 300-range docs)
- `cf plan list` from default worktree shows slice plans from all worktree paths
- `cf tasks list` from default worktree shows task files from all worktree paths
- `cf future` from default worktree shows future work from all worktree paths
- Duplicate entries (same file in multiple worktrees after merge) appear only once
- Non-default worktree behavior unchanged (still scoped to own index range)
- Projects without worktrees: identical to current behavior
- MCP `project_structure` without `worktreeId` returns aggregated view

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

- `resolveAllOperationPaths()` tested with: default worktree, non-default worktree, no worktrees, worktree without path
- `mergeProjectModels()` tested with: single model, two models with non-overlapping initiatives, two models with overlapping initiatives (dedup)
- `projectUnsetAction()` tested with: valid field, required field (error), readonly field (error), unknown field (error), worktree-scoped field, project-level field
- All existing tests pass unchanged

### Verification Walkthrough

**Setup:** Project `migratory` with worktrees:
- `default` (range 100-799) at `~/repos/migratory` — has `100-arch.behavior-engine` on its branch
- `world-server` (range 300-499) at `~/repos/migratory-world-server` — has both 100 and 300 range files

**1. Default worktree aggregation:**
```bash
cd ~/repos/migratory
cf arch list
# Expected: shows BOTH 100-arch.behavior-engine AND 300-arch.worldserver-foundation
# (300 is pulled from the world-server worktree path even though it's not on the default branch)
```

**2. Non-default worktree unchanged:**
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

**6. No regression:**
```bash
cd ~/repos/context-forge    # no worktrees
cf arch list
# Expected: identical to current behavior
```

## Implementation Notes

### Development Approach

Suggested order:

1. **`mergeProjectModels()`** — core utility, testable in isolation
2. **`resolveAllOperationPaths()`** — CLI helper, testable in isolation
3. **`cf arch list` aggregation** — highest visibility, proves the pattern
4. **`cf plan list`, `cf tasks list`, `cf future` aggregation** — same pattern
5. **MCP `project_structure` aggregation** — extends the MCP helper
6. **`cf unset` command** — independent of aggregation work
7. **Tests** — unit tests for each component

### Effort

3/5 — Two independent features. Aggregation requires merging model results which has edge cases around deduplication. Field reset is straightforward. Most complexity is in `mergeProjectModels` and ensuring all listing commands handle multi-path correctly.
