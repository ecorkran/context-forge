---
slice: 181-slice.worktreecontext-data-model-storage
project: context-forge
lld: user/slices/181-slice.worktreecontext-data-model-storage.md
dependencies: []
projectState: "Phase 5 task breakdown for 181. No dependencies — this is the foundation slice for the 180-band initiative. All 160-band infrastructure complete. FileProjectStore and IProjectStore stable."
dateCreated: 20260310
dateUpdated: 20260311
status: complete
docType: tasks
---

# Tasks: WorktreeContext Data Model & Storage

## Context

Working on slice 181 in project context-forge. This slice defines the `WorktreeContext` type, extends `ProjectData` with an optional `worktrees` array, and implements a `WorktreeService` for CRUD operations and forward/reverse migration logic. It is the data foundation for all subsequent 180-band slices (182-187).

**Delivers:** `WorktreeContext` type and related types, `ProjectData.worktrees` field, `WorktreeService` with CRUD + migration, index range overlap detection, `migrateProjectFields()` update.
**Dependencies:** None (builds on existing 160-band infrastructure, all complete).
**Next slice:** 182 — Worktree Discovery & CWD Resolution.

**Key files:**
- Types: `packages/core/src/types/worktree.ts` (new), `packages/core/src/types/project.ts` (modified)
- Service: `packages/core/src/services/WorktreeService.ts` (new)
- Storage: `packages/core/src/storage/FileProjectStore.ts` (minor update)
- Tests: `packages/core/tests/services/WorktreeService.test.ts` (new)
- Exports: `packages/core/src/types/index.ts`, `packages/core/src/services/index.ts`, `packages/core/src/index.ts`

**Test framework:** Vitest. Tests in `packages/core/tests/` mirroring source structure.

---

## Task 1: Define WorktreeContext types

- [x] **1.1 Create `packages/core/src/types/worktree.ts`**
  - [x] Define `WorktreeContext` interface with all fields per slice design: `id`, `name`, `indexRange: [number, number]`, `worktreePath?`, `archDoc?`, `slicePlan?`, `developmentPhase?`, `activeSlice?`, `activeTaskFile?`, `instruction?`, `workType?: 'start' | 'continue'`
  - [x] Define `CreateWorktreeInput` type: `name`, `indexRange`, `worktreePath?`, `archDoc?`, `slicePlan?` (no `id`, no workflow fields)
  - [x] Define `UpdateWorktreeInput` type: `Partial<Omit<WorktreeContext, 'id'>>`
  - [x] Define `IndexRangeOverlap` interface: `existingWorktreeId`, `existingWorktreeName`, `existingRange`, `overlapStart`, `overlapEnd`
  - [x] Add JSDoc comments on all interfaces and fields
  - [x] Success: file compiles with `npm run typecheck` in `packages/core`

- [x] **1.2 Extend `ProjectData` in `packages/core/src/types/project.ts`**
  - [x] Import `WorktreeContext` from `./worktree.js`
  - [x] Add `worktrees?: WorktreeContext[]` field to `ProjectData` interface with JSDoc comment
  - [x] Add `'worktrees'` to the `Pick` union in `UpdateProjectData`
  - [x] Success: `npm run typecheck` passes; existing code that reads `ProjectData` compiles unchanged

- [x] **1.3 Update type exports**
  - [x] Export all types from `worktree.ts` in `packages/core/src/types/index.ts`
  - [x] Verify re-export chain: `types/index.ts` → `src/index.ts` (already exports `* from './types/index.js'`)
  - [x] Success: `WorktreeContext`, `CreateWorktreeInput`, `UpdateWorktreeInput`, `IndexRangeOverlap` are importable from `@context-forge/core`

**Commit after Task 1.**

---

## Task 2: Implement WorktreeService — CRUD operations

- [x] **2.1 Create `packages/core/src/services/WorktreeService.ts` with constructor and ID generation**
  - [x] Import `IProjectStore` from storage interfaces
  - [x] Import worktree types from types module
  - [x] Add private `generateWorktreeId()` function: `wt_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`
  - [x] Create `WorktreeService` class with constructor taking `IProjectStore`
  - [x] Add private helper `getProjectOrThrow(projectId)` that calls `store.getById()` and throws if not found
  - [x] Success: class compiles, constructor accepts `IProjectStore`

- [x] **2.2 Implement `listWorktrees` and `getWorktree` methods**
  - [x] `listWorktrees(projectId)`: return `project.worktrees ?? []`
  - [x] `getWorktree(projectId, worktreeId)`: find by `id` in worktrees array, return `undefined` if not found
  - [x] `getWorktreeByName(projectId, name)`: find by case-insensitive name match (`name.toLowerCase()`), return `undefined` if not found
  - [x] Success: methods compile, return correct types

- [x] **2.3 Implement `addWorktree` method (without migration)**
  - [x] Signature: `addWorktree(projectId, input: CreateWorktreeInput): Promise<{ worktree: WorktreeContext, migrated: boolean, overlaps: IndexRangeOverlap[] }>`
  - [x] Validate index range: both non-negative integers, start <= end. Throw descriptive error if invalid
  - [x] Generate ID via `generateWorktreeId()`
  - [x] Create `WorktreeContext` from input (workflow fields start `undefined`)
  - [x] Push to `project.worktrees` array (initialize as `[]` if `undefined`)
  - [x] Call `store.update(projectId, { worktrees: [...] })`
  - [x] Return created worktree with `migrated: false`, `overlaps: []` (overlap detection added in Task 4)
  - [x] Note: forward migration logic will be added in Task 3
  - [x] Success: method compiles, creates worktree with `wt_` prefixed ID

- [x] **2.4 Implement `updateWorktree` method**
  - [x] Signature: `updateWorktree(projectId, worktreeId, updates: UpdateWorktreeInput): Promise<WorktreeContext>`
  - [x] Find worktree by ID in array, throw if not found
  - [x] If `indexRange` is in updates, validate it (same rules as `addWorktree`)
  - [x] Merge updates into existing worktree (`{ ...existing, ...updates }`, preserving `id`)
  - [x] Write back via `store.update()`
  - [x] Return updated worktree
  - [x] Success: method applies partial updates, preserves `id`, throws for unknown ID

- [x] **2.5 Implement `removeWorktree` method (without migration)**
  - [x] Signature: `removeWorktree(projectId, worktreeId): Promise<{ removed: WorktreeContext, migrated: boolean }>`
  - [x] Find worktree by ID, throw if not found
  - [x] Filter worktree out of array
  - [x] Write back via `store.update()`
  - [x] Return removed worktree with `migrated: false`
  - [x] Note: reverse migration logic will be added in Task 3
  - [x] Success: method removes worktree, throws for unknown ID

- [x] **2.6 Export `WorktreeService` from services index**
  - [x] Add export in `packages/core/src/services/index.ts`
  - [x] Verify it's accessible from `@context-forge/core`
  - [x] Success: `WorktreeService` importable from package

**Commit after Task 2.**

---

## Task 3: Test CRUD operations

- [x] **3.1 Create test file with mock store**
  - [x] Create `packages/core/tests/services/WorktreeService.test.ts`
  - [x] Implement a `MockProjectStore` that implements `IProjectStore` using an in-memory array
  - [x] Add helper to create a test project with known fields (some workflow fields populated)
  - [x] Success: test file runs with `npx vitest run tests/services/WorktreeService.test.ts`

- [x] **3.2 Test `addWorktree` CRUD behavior**
  - [x] Test: creates worktree with `wt_` prefixed ID
  - [x] Test: stores `name`, `indexRange`, `worktreePath` correctly
  - [x] Test: leaves workflow fields `undefined` on creation
  - [x] Test: throws for invalid range (negative, start > end)
  - [x] Test: second `addWorktree` appends to existing array
  - [x] Success: all tests pass

- [x] **3.3 Test `getWorktree`, `getWorktreeByName`, `listWorktrees`**
  - [x] Test: `getWorktree` returns worktree by ID
  - [x] Test: `getWorktree` returns `undefined` for unknown ID
  - [x] Test: `getWorktreeByName` matches case-insensitively
  - [x] Test: `getWorktreeByName` returns `undefined` for unknown name
  - [x] Test: `listWorktrees` returns all worktrees
  - [x] Test: `listWorktrees` returns `[]` for project with no worktrees
  - [x] Success: all tests pass

- [x] **3.4 Test `updateWorktree` and `removeWorktree`**
  - [x] Test: `updateWorktree` applies partial updates to name, range, path, workflow fields
  - [x] Test: `updateWorktree` preserves `id` even if `id` is in updates (it's excluded by type but verify behavior)
  - [x] Test: `updateWorktree` revalidates index range on range change
  - [x] Test: `updateWorktree` throws for unknown worktree ID
  - [x] Test: `removeWorktree` removes worktree by ID
  - [x] Test: `removeWorktree` throws for unknown worktree ID
  - [x] Success: all tests pass

**Commit after Task 3.**

---

## Task 4: Implement forward and reverse migration

- [x] **4.1 Implement forward migration in `addWorktree`**
  - [x] At the start of `addWorktree`, check: is this the first worktree? (`project.worktrees === undefined || project.worktrees.length === 0`)
  - [x] If first worktree AND project has at least one non-empty workflow field (`developmentPhase`, `fileSlice`, `fileTasks`, `instruction`, `workType`, `fileArch`, `fileSlicePlan`):
    1. Create a "Default" worktree context: `name: "Default"`, `indexRange: [0, 99]`, `worktreePath: project.projectPath`, workflow fields mapped from project (see slice design for field mapping: `fileSlice` → `activeSlice`, `fileTasks` → `activeTaskFile`, `fileArch` → `archDoc`, `fileSlicePlan` → `slicePlan`, others map directly)
    2. Clear workflow fields on project: set all seven to `''`
    3. Add both the "Default" context and the user's new context to `worktrees`
    4. Write in a single `store.update()` call
    5. Set `migrated: true` in return value
  - [x] If first worktree but NO workflow fields set: skip "Default" creation, just add user's worktree, `migrated: false`
  - [x] If not first worktree: append as before, `migrated: false`
  - [x] Success: forward migration creates "Default" context with correct field mapping

- [x] **4.2 Implement reverse migration in `removeWorktree`**
  - [x] After filtering out the removed worktree, check: would `worktrees` be empty?
  - [x] If empty: map removed worktree's fields back to project (`activeSlice` → `fileSlice`, `activeTaskFile` → `fileTasks`, `archDoc` → `fileArch`, `slicePlan` → `fileSlicePlan`, others map directly). Set `worktrees` to `undefined`. Write in single `store.update()`. Set `migrated: true`
  - [x] If not empty: write updated array, `migrated: false`
  - [x] Edge case: if last worktree has no workflow fields (all `undefined`), reverse migration still fires — project fields remain empty. This is correct
  - [x] Success: reverse migration restores fields to project, removes `worktrees` field

**Commit after Task 4.**

---

## Task 5: Test migration logic

- [x] **5.1 Test forward migration**
  - [x] Test: first `addWorktree` on project with all workflow fields set creates "Default" context with mapped fields
  - [x] Test: "Default" context gets `indexRange: [0, 99]` and `worktreePath` from `project.projectPath`
  - [x] Test: project's workflow fields are cleared to `''` after forward migration
  - [x] Test: result has `migrated: true`
  - [x] Test: `project.worktrees` has exactly 2 entries (Default + user's)
  - [x] Test: first `addWorktree` on project with NO workflow fields set (all empty strings) does NOT create "Default" context
  - [x] Test: first `addWorktree` on project with partially-set fields (some empty, some populated) creates "Default" with only populated fields mapped
  - [x] Success: all forward migration tests pass

- [x] **5.2 Test reverse migration**
  - [x] Test: removing last worktree moves its fields back to project (`activeSlice` → `fileSlice`, etc.)
  - [x] Test: `project.worktrees` becomes `undefined` after reverse migration (not `[]`)
  - [x] Test: result has `migrated: true`
  - [x] Test: removing a worktree when others remain does NOT trigger reverse migration (`migrated: false`)
  - [x] Test: reverse migration with empty workflow fields — project fields remain empty, no error
  - [x] Success: all reverse migration tests pass

- [x] **5.3 Test migration atomicity**
  - [x] Test: verify `store.update()` is called exactly once per `addWorktree` with migration (not multiple calls)
  - [x] Test: verify `store.update()` is called exactly once per `removeWorktree` with migration
  - [x] Use a spy/mock on `store.update` to count calls
  - [x] Success: single update call per operation confirmed

**Commit after Task 5.**

---

## Task 6: Implement index range overlap detection

- [x] **6.1 Add `findOverlaps` method to `WorktreeService`**
  - [x] Signature: `findOverlaps(projectId, range: [number, number], excludeId?: string): Promise<IndexRangeOverlap[]>`
  - [x] Get existing worktrees, filter out `excludeId` if provided
  - [x] For each remaining worktree, check overlap: `a[0] <= b[1] && b[0] <= a[1]`
  - [x] For overlapping ranges, compute `overlapStart: Math.max(a[0], b[0])`, `overlapEnd: Math.min(a[1], b[1])`
  - [x] Return array of `IndexRangeOverlap` objects (empty if no overlaps)
  - [x] Success: method returns correct overlaps

- [x] **6.2 Integrate overlap detection into `addWorktree` and `updateWorktree`**
  - [x] In `addWorktree`: call `findOverlaps` with the new range, include results in return value's `overlaps` field
  - [x] In `updateWorktree`: if `indexRange` is being updated, call `findOverlaps` with `excludeId` set to the worktree being updated. Log or note overlaps but do not block
  - [x] Overlap does NOT prevent creation/update — callers decide how to handle
  - [x] Success: `addWorktree` returns overlaps when ranges conflict

- [x] **6.3 Test overlap detection**
  - [x] Test: no overlap for adjacent ranges (`[100, 199]` and `[200, 299]`)
  - [x] Test: overlap for touching ranges (`[100, 199]` and `[199, 299]` — overlap at 199)
  - [x] Test: overlap for fully contained range (`[100, 199]` and `[120, 150]`)
  - [x] Test: overlap for partial overlap (`[100, 199]` and `[150, 249]`)
  - [x] Test: `excludeId` correctly excludes the worktree being updated
  - [x] Test: `addWorktree` returns `overlaps` array in result
  - [x] Test: `addWorktree` still succeeds when overlaps exist (not blocked)
  - [x] Success: all overlap tests pass

**Commit after Task 6.**

---

## Task 7: Update `migrateProjectFields` and verify backwards compatibility

- [x] **7.1 Update `migrateProjectFields()` in `FileProjectStore.ts`**
  - [x] Import `WorktreeContext` type
  - [x] Add `worktrees: project.worktrees as WorktreeContext[] | undefined` to the migrated object
  - [x] Success: stored projects with `worktrees` field survive `getAll()` migration path

- [x] **7.2 Verify existing tests pass**
  - [x] Run full test suite: `npm test` in `packages/core`
  - [x] All existing tests pass unchanged — no worktree contexts means no behavior change
  - [x] Success: zero test regressions

**Commit after Task 7.**

---

## Task 8: Final verification and build

- [x] **8.1 Run full build and typecheck**
  - [x] `npm run build` in `packages/core` — no errors
  - [x] `npm run typecheck` in `packages/core` — no errors
  - [x] `npm test` in `packages/core` — all tests pass (existing + new)
  - [x] Success: clean build, clean types, all tests green

- [x] **8.2 Verify exports are accessible**
  - [x] Confirm `WorktreeContext`, `CreateWorktreeInput`, `UpdateWorktreeInput`, `IndexRangeOverlap` exported from `@context-forge/core`
  - [x] Confirm `WorktreeService` exported from `@context-forge/core`
  - [x] Success: all new types and service importable from package entry point

**Commit after Task 8 if any changes were needed. Otherwise, this is a verification-only step.**
