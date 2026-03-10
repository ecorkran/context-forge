---
docType: slice-design
slice: worktreecontext-data-model-storage
project: context-forge
parent: user/architecture/180-slices.initiative-context-worktree.md
dependencies: []
interfaces: [182-worktree-discovery-cwd-resolution, 183-worktree-cli-commands, 184-status-display-updates, 185-worktree-aware-context-assembly, 186-mcp-worktree-tools]
dateCreated: 20260310
dateUpdated: 20260311
status: complete
---

# Slice 181: WorktreeContext Data Model & Storage

## Overview

This slice defines the `WorktreeContext` type, extends `ProjectData` with an optional `worktrees` array, and implements a `WorktreeService` that provides worktree context CRUD operations and forward/reverse migration logic. It is the data foundation for the entire 180-band initiative — every subsequent slice depends on the types and operations defined here.

## Value

- Establishes the type contract that all worktree-aware slices build on
- Encapsulates migration logic (the riskiest part of the initiative) in an independently testable service
- Maintains full backwards compatibility — projects without worktree contexts behave identically to today
- Enables per-initiative workflow state without changing any existing code paths

## Technical Scope

### Included
- `WorktreeContext` interface definition
- `ProjectData` extension with optional `worktrees` field
- `UpdateProjectData` extension to include `worktrees`
- `WorktreeService` with CRUD operations and migration logic
- `migrateProjectFields()` update to handle the `worktrees` array on legacy data
- Index range overlap detection (warn, not block)
- ID generation for worktree contexts
- Unit tests for all of the above

### Excluded
- CWD resolution and worktree path matching (slice 182)
- CLI commands (slice 183)
- Display/status changes (slice 184)
- Context assembly changes (slice 185)
- MCP tools (slice 186)
- Git worktree discovery / `git worktree list` parsing (slice 182)

## Dependencies

### Prerequisites
- All 160-band infrastructure is complete (schema standardization, config system, etc.)
- `FileProjectStore` and `IProjectStore` interface exist and are stable

### Interfaces Required
- `IProjectStore` — `WorktreeService` depends on `getById()` and `update()` for all mutations
- `ProjectData` type — extended in this slice

## Architecture

### Component Structure

```
packages/core/src/types/
  project.ts          — Extended with WorktreeContext, worktrees field, updated UpdateProjectData
  worktree.ts         — NEW: WorktreeContext interface and related types

packages/core/src/services/
  WorktreeService.ts  — NEW: CRUD + migration logic

packages/core/src/storage/
  FileProjectStore.ts — migrateProjectFields() updated for worktrees array

packages/core/src/index.ts — Re-exports new types and service
```

**Why a separate `worktree.ts` type file:** The `WorktreeContext` type, its create/update partials, and helper types (overlap result, migration result) are substantial enough to warrant their own file. This keeps `project.ts` focused on project-level types and avoids a single file growing to cover two distinct domain concepts.

**Why `WorktreeService` not `FileProjectStore`:** The forward/reverse migration logic is business logic, not storage. `FileProjectStore` is a serialization layer — it reads/writes `ProjectData` JSON. The `WorktreeService` orchestrates multi-step operations (read project → check migration conditions → mutate worktrees array → write back) and owns the migration invariants. This keeps the store simple and makes migration logic independently testable with a mock store.

### Data Flow

```
Caller (CLI command / MCP tool handler)
  → WorktreeService.addWorktree(projectId, input)
    → store.getById(projectId)
    → check: is this the first worktree? → forward migration
    → validate: index range overlap? → warn
    → generate ID: wt_{timestamp}_{random}
    → mutate: push to project.worktrees[]
    → store.update(projectId, { worktrees: [...] })
    → return created WorktreeContext
```

All mutations follow this pattern: read → validate → mutate in-memory → write back. The `store.update()` call is the single point of persistence. No partial writes.

### State Management

Worktree contexts are persisted as part of the `ProjectData` JSON in `projects.json`. The `worktrees` array is:
- `undefined` — project has never had worktree contexts (legacy/default)
- `[]` — should not occur in practice (reverse migration removes the field)
- `WorktreeContext[]` — one or more active worktree contexts

The distinction between `undefined` and `[]` is handled by treating both as "no worktree contexts" in all read paths.

## Technical Decisions

### Type Definitions

**`WorktreeContext` interface** (`packages/core/src/types/worktree.ts`):

```ts
export interface WorktreeContext {
  /** Auto-generated: wt_{timestamp}_{random} */
  id: string;
  /** Human-readable label, e.g. "API Foundation" */
  name: string;
  /** Index band this worktree owns, e.g. [100, 199] */
  indexRange: [number, number];
  /** Absolute filesystem path to the git worktree directory */
  worktreePath?: string;
  /** Initiative architecture document (relative to project root) */
  archDoc?: string;
  /** Initiative slice plan (relative to project root) */
  slicePlan?: string;

  // Workflow position (same semantics as ProjectData equivalents)
  developmentPhase?: string;
  activeSlice?: string;
  activeTaskFile?: string;
  instruction?: string;
  workType?: 'start' | 'continue';
}
```

**`CreateWorktreeInput`** — what callers provide:

```ts
export type CreateWorktreeInput = {
  name: string;
  indexRange: [number, number];
  worktreePath?: string;
  archDoc?: string;
  slicePlan?: string;
};
```

`id` is auto-generated. Workflow fields start `undefined` — set later via `cf set` or `worktree_update`.

**`UpdateWorktreeInput`** — partial updates to an existing worktree context:

```ts
export type UpdateWorktreeInput = Partial<Omit<WorktreeContext, 'id'>>;
```

All fields except `id` are mutable. Name, range, path, artifact references, and workflow fields can all be updated.

**`IndexRangeOverlap`** — returned by overlap detection:

```ts
export interface IndexRangeOverlap {
  existingWorktreeId: string;
  existingWorktreeName: string;
  existingRange: [number, number];
  overlapStart: number;
  overlapEnd: number;
}
```

### ProjectData Extension

```ts
// In project.ts
export interface ProjectData {
  // ... existing fields unchanged ...
  /** Per-initiative worktree contexts. Undefined = no worktree contexts (default). */
  worktrees?: WorktreeContext[];
}
```

`UpdateProjectData` gains the `worktrees` field:

```ts
export type UpdateProjectData = Partial<
  Pick<
    ProjectData,
    | 'name'
    | 'template'
    // ... existing fields ...
    | 'fileConcept'
    | 'customData'
    | 'worktrees'  // NEW
  >
>;
```

### ID Generation

```ts
function generateWorktreeId(): string {
  return `wt_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
}
```

Matches the existing `generateProjectId()` pattern in `FileProjectStore.ts`. The `wt_` prefix distinguishes worktree IDs from project IDs in logs and debugging.

### WorktreeService

**Location:** `packages/core/src/services/WorktreeService.ts`

**Constructor:** Takes an `IProjectStore` instance (dependency injection, testable with mocks).

```ts
export class WorktreeService {
  constructor(private readonly store: IProjectStore) {}
}
```

**Public methods:**

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `addWorktree` | `projectId: string, input: CreateWorktreeInput` | `Promise<{ worktree: WorktreeContext, migrated: boolean, overlaps: IndexRangeOverlap[] }>` | Creates a worktree context. Triggers forward migration if first. Returns overlap warnings. |
| `getWorktree` | `projectId: string, worktreeId: string` | `Promise<WorktreeContext \| undefined>` | Lookup by ID. |
| `getWorktreeByName` | `projectId: string, name: string` | `Promise<WorktreeContext \| undefined>` | Lookup by human-readable name (case-insensitive). |
| `listWorktrees` | `projectId: string` | `Promise<WorktreeContext[]>` | All worktree contexts for a project. Returns `[]` if none. |
| `updateWorktree` | `projectId: string, worktreeId: string, updates: UpdateWorktreeInput` | `Promise<WorktreeContext>` | Partial update. Validates index range if changed. |
| `removeWorktree` | `projectId: string, worktreeId: string` | `Promise<{ removed: WorktreeContext, migrated: boolean }>` | Removes worktree context. Triggers reverse migration if last. |
| `findOverlaps` | `projectId: string, range: [number, number], excludeId?: string` | `Promise<IndexRangeOverlap[]>` | Checks for index range overlaps with existing worktree contexts. Used by `addWorktree` and `updateWorktree`. |

### Migration Logic

#### Forward Migration (Project → Worktree Context)

**Trigger:** `addWorktree()` is called on a project with `worktrees === undefined` or `worktrees.length === 0`.

**Condition:** The project has at least one workflow field set (non-empty `developmentPhase`, `fileSlice`, `fileTasks`, `instruction`, `workType`, `fileArch`, or `fileSlicePlan`).

**Behavior:**
1. Create a "default" worktree context holding the project's current workflow values:
   - `id`: auto-generated
   - `name`: `"Default"` (can be renamed later via `cf worktree update`)
   - `indexRange`: `[0, 99]` — the reserved range for project-level/default work
   - `worktreePath`: the project's `projectPath` (the main checkout)
   - Workflow fields mapped: `developmentPhase` → `developmentPhase`, `fileSlice` → `activeSlice`, `fileTasks` → `activeTaskFile`, `instruction` → `instruction`, `workType` → `workType`, `fileArch` → `archDoc`, `fileSlicePlan` → `slicePlan`
2. Clear the workflow fields on `ProjectData`: set `developmentPhase`, `fileSlice`, `fileTasks`, `instruction`, `workType`, `fileArch`, `fileSlicePlan` to `''` (empty string, not `undefined`, to match existing field semantics).
3. Add the user's explicitly requested worktree context as a second entry.
4. Write both changes in a single `store.update()` call — atomic.

**If no workflow fields are set:** Skip step 1. The user's worktree context is the only entry. No "default" context is created from empty fields.

#### Reverse Migration (Worktree Context → Project)

**Trigger:** `removeWorktree()` is called and the removal would leave `worktrees` empty (length 0 after removal).

**Behavior:**
1. Take the worktree context being removed and map its workflow fields back to `ProjectData`: `activeSlice` → `fileSlice`, `activeTaskFile` → `fileTasks`, `archDoc` → `fileArch`, `slicePlan` → `fileSlicePlan`, plus `developmentPhase`, `instruction`, `workType` directly.
2. Remove the `worktrees` field from the project (set to `undefined` so it's omitted from JSON).
3. Write in a single `store.update()` call.

**Edge case:** If the last worktree context has no workflow fields set (all empty/undefined), the reverse migration still fires but the project's workflow fields remain empty. This is correct — the user cleared them intentionally.

#### Migration Atomicity

Both migrations modify multiple fields on `ProjectData` and must be atomic. Since `FileProjectStore.update()` does read-modify-write on the full `projects.json` array and writes in a single `fs.writeFile()` call, atomicity at the application level is guaranteed. There is no multi-file or multi-step persistence.

### Index Range Overlap Detection

Two ranges `[a1, a2]` and `[b1, b2]` overlap when `a1 <= b2 && b1 <= a2`.

```ts
function rangesOverlap(a: [number, number], b: [number, number]): boolean {
  return a[0] <= b[1] && b[0] <= a[1];
}
```

`findOverlaps()` checks the new/updated range against all existing worktree contexts (excluding the one being updated, via `excludeId`). Returns an array of `IndexRangeOverlap` objects — empty array means no overlaps.

Callers (CLI commands, MCP tools) decide how to present the warning. The service does not block on overlap.

### Index Range Validation

`addWorktree` and `updateWorktree` validate the range:
- Both values must be non-negative integers
- `start <= end`
- Range must span at least 1 (i.e., `start !== end` is allowed — a single-index range)

Invalid ranges throw with a descriptive error message. This is input validation, not a warning.

### migrateProjectFields() Update

The existing `migrateProjectFields()` function in `FileProjectStore.ts` handles legacy field names. It needs a one-line addition to preserve the `worktrees` array if present in stored data:

```ts
worktrees: project.worktrees as WorktreeContext[] | undefined,
```

This ensures that projects with worktree contexts survive the field migration path (which runs on every `getAll()` call).

## Integration Points

### Provides to Other Slices

- **`WorktreeContext` type** — consumed by every subsequent slice (182-187) for type-safe access to worktree context fields
- **`CreateWorktreeInput` / `UpdateWorktreeInput`** — consumed by CLI commands (183) and MCP tools (186)
- **`WorktreeService`** — consumed by CLI commands (183), MCP tools (186), and indirectly by status/display (184) and context assembly (185)
- **`IndexRangeOverlap`** — consumed by CLI (183) for warning display
- **`ProjectData.worktrees`** — consumed by CWD resolution (182) for path matching

### Consumes from Other Slices

- None — this is the foundation slice with no dependencies on other 180-band work

## Success Criteria

### Functional Requirements
1. `WorktreeContext` type defined with all fields from the slice plan specification
2. `ProjectData` extended with optional `worktrees: WorktreeContext[]`
3. `UpdateProjectData` includes `worktrees` for store-level updates
4. `WorktreeService.addWorktree()` creates a worktree context with auto-generated ID
5. `WorktreeService.getWorktree()` and `getWorktreeByName()` find existing worktree contexts
6. `WorktreeService.listWorktrees()` returns all worktree contexts (empty array if none)
7. `WorktreeService.updateWorktree()` applies partial updates
8. `WorktreeService.removeWorktree()` deletes by ID
9. Forward migration creates a "default" worktree context from existing workflow fields on first `addWorktree`
10. Forward migration skips "default" creation when project has no workflow fields set
11. Forward migration clears workflow fields from `ProjectData` after moving them
12. Reverse migration moves last worktree context's workflow fields back to `ProjectData`
13. Reverse migration removes the `worktrees` field entirely (not empty array)
14. Both migrations are atomic (single `store.update()` call)
15. Index range overlap detection returns correct overlaps without blocking
16. Index range validation rejects invalid ranges (negative, start > end)

### Technical Requirements
17. All existing tests pass unchanged — no worktree contexts means no behavior change
18. Unit tests cover: CRUD operations, forward migration (with and without existing workflow fields), reverse migration, overlap detection, range validation, `getWorktreeByName` case insensitivity
19. `migrateProjectFields()` preserves `worktrees` array from stored data
20. New types and service are re-exported from `packages/core/src/index.ts`

### Verification Walkthrough

This is a data layer slice — verification is programmatic rather than user-facing. The walkthrough describes what unit tests prove and what a developer can confirm by inspecting stored data.

**Verification command:** `cd packages/core && npx vitest run tests/services/WorktreeService.test.ts --reporter=verbose`

**Full test suite:** `cd packages/core && npm test` (578 tests, 0 regressions)

**1. CRUD — create and retrieve a worktree context:**

Verified by 19 unit tests covering all CRUD methods:
```
WorktreeService > addWorktree > creates worktree with wt_ prefixed ID ✓
WorktreeService > addWorktree > stores name, indexRange, and worktreePath correctly ✓
WorktreeService > addWorktree > leaves workflow fields undefined on creation ✓
WorktreeService > addWorktree > throws for negative range values ✓
WorktreeService > addWorktree > throws for start > end ✓
WorktreeService > addWorktree > throws for non-integer range values ✓
WorktreeService > addWorktree > second addWorktree appends to existing array ✓
WorktreeService > getWorktree > returns worktree by ID ✓
WorktreeService > getWorktree > returns undefined for unknown ID ✓
WorktreeService > getWorktreeByName > matches case-insensitively ✓
WorktreeService > getWorktreeByName > returns undefined for unknown name ✓
WorktreeService > listWorktrees > returns all worktrees ✓
WorktreeService > listWorktrees > returns empty array for project with no worktrees ✓
WorktreeService > updateWorktree > applies partial updates ✓
WorktreeService > updateWorktree > preserves id even if updates object has id-like changes ✓
WorktreeService > updateWorktree > revalidates index range on range change ✓
WorktreeService > updateWorktree > throws for unknown worktree ID ✓
WorktreeService > removeWorktree > removes worktree by ID ✓
WorktreeService > removeWorktree > throws for unknown worktree ID ✓
```

**2. Forward migration — first worktree context creation preserves existing state:**

Verified by 5 unit tests:
```
WorktreeService > forward migration > creates Default worktree with mapped fields on first addWorktree ✓
WorktreeService > forward migration > clears project workflow fields after forward migration ✓
WorktreeService > forward migration > does NOT create Default when project has no workflow fields ✓
WorktreeService > forward migration > creates Default with only populated fields mapped for partially-set project ✓
WorktreeService > forward migration > second addWorktree does not trigger migration ✓
```

Confirmed: first `addWorktree` on a project with workflow fields creates 2 worktrees (Default + user's), clears project fields, and sets `migrated: true`. On a project with empty fields, only 1 worktree is created, no Default.

**3. Reverse migration — last removal restores project fields:**

Verified by 3 unit tests:
```
WorktreeService > reverse migration > restores worktree fields to project when last worktree removed ✓
WorktreeService > reverse migration > does NOT trigger reverse migration when other worktrees remain ✓
WorktreeService > reverse migration > reverse migration with empty workflow fields leaves project fields empty ✓
```

Confirmed: removing last worktree sets `worktrees: undefined`, restores `activeSlice` → `fileSlice` etc., returns `migrated: true`. Removing non-last worktree does not trigger migration.

**4. Backwards compatibility — existing projects unchanged:**

Verified by full test suite: 578 tests pass (0 regressions). Projects without `worktrees` field behave identically — `listWorktrees()` returns `[]`, no migration triggered until explicit `addWorktree()`.

**5. Index range overlap — warning, not error:**

Verified by 7 unit tests:
```
WorktreeService > findOverlaps > no overlap for adjacent ranges ✓
WorktreeService > findOverlaps > overlap for touching ranges ✓
WorktreeService > findOverlaps > overlap for fully contained range ✓
WorktreeService > findOverlaps > overlap for partial overlap ✓
WorktreeService > findOverlaps > excludeId correctly excludes the worktree being updated ✓
WorktreeService > findOverlaps > addWorktree returns overlaps array in result ✓
WorktreeService > findOverlaps > addWorktree still succeeds when overlaps exist ✓
```

Confirmed: overlapping worktrees are created successfully with overlap info in the return value. Adjacent ranges (e.g. `[100,199]` and `[200,299]`) produce no overlap.

**6. Migration atomicity:**

```
WorktreeService > migration atomicity > calls store.update exactly once for addWorktree with migration ✓
WorktreeService > migration atomicity > calls store.update exactly once for removeWorktree with migration ✓
```

## Implementation Notes

### Development Approach

Suggested implementation order within this slice:

1. **Types first.** Create `worktree.ts` with all type definitions. Update `project.ts` with `worktrees` field and `UpdateProjectData`. Update `index.ts` exports.
2. **WorktreeService CRUD.** Implement `addWorktree`, `getWorktree`, `getWorktreeByName`, `listWorktrees`, `updateWorktree`, `removeWorktree` without migration logic. Test with a mock store.
3. **Migration logic.** Add forward and reverse migration to `addWorktree` and `removeWorktree`. Test edge cases: empty fields, partially-set fields, no fields set.
4. **Overlap detection.** Implement `findOverlaps` and integrate into `addWorktree`/`updateWorktree`. Test boundary cases.
5. **migrateProjectFields update.** Add `worktrees` passthrough. Verify existing tests still pass.
6. **Integration verification.** Run full test suite, confirm no regressions.

### Testing Strategy

- **Mock store** for unit tests — `WorktreeService` tests use a mock `IProjectStore` that holds an in-memory array. This isolates the service logic from filesystem concerns.
- **Edge cases to cover:**
  - Forward migration with all workflow fields set
  - Forward migration with no workflow fields set (empty strings)
  - Forward migration with partially-set fields (some empty, some populated)
  - Reverse migration with populated workflow fields
  - Reverse migration with empty workflow fields
  - Adding a worktree context to a project that already has worktree contexts (no migration)
  - Removing a worktree context from a project with multiple remaining (no migration)
  - Overlap detection with adjacent ranges (`[100, 199]` and `[200, 299]` — no overlap)
  - Overlap detection with touching ranges (`[100, 199]` and `[199, 299]` — overlap at 199)
  - Range validation: negative numbers, start > end, same start and end

## Risk Assessment

### Technical Risks
- **Migration correctness.** The forward/reverse migration is the highest-risk area. Incorrect field mapping or partial migration could leave a project in an inconsistent state (workflow fields on neither project nor worktree context, or duplicated on both).

### Mitigation
- Migration is tested with comprehensive unit tests covering all field combinations
- Both migrations happen in a single `store.update()` call — no partial persistence
- Migration only triggers on explicit user action (`addWorktree` / `removeWorktree`), never automatically
- The `addWorktree` return value includes `migrated: boolean` so callers can inform the user

## Effort

3/5 — The type definitions are straightforward. The CRUD operations follow established patterns. The migration logic requires careful implementation and thorough testing but is conceptually simple (copy fields, clear source).
