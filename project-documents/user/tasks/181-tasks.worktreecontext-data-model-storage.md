---
slice: 181-slice.worktreecontext-data-model-storage
project: context-forge
lld: user/slices/181-slice.worktreecontext-data-model-storage.md
dependencies: []
projectState: "Phase 5 task breakdown for 181. No dependencies — this is the foundation slice for the 180-band initiative. All 160-band infrastructure complete. FileProjectStore and IProjectStore stable."
dateCreated: 20260310
dateUpdated: 20260310
status: not_started
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

- [ ] **1.1 Create `packages/core/src/types/worktree.ts`**
  - [ ] Define `WorktreeContext` interface with all fields per slice design: `id`, `name`, `indexRange: [number, number]`, `worktreePath?`, `archDoc?`, `slicePlan?`, `developmentPhase?`, `activeSlice?`, `activeTaskFile?`, `instruction?`, `workType?: 'start' | 'continue'`
  - [ ] Define `CreateWorktreeInput` type: `name`, `indexRange`, `worktreePath?`, `archDoc?`, `slicePlan?` (no `id`, no workflow fields)
  - [ ] Define `UpdateWorktreeInput` type: `Partial<Omit<WorktreeContext, 'id'>>`
  - [ ] Define `IndexRangeOverlap` interface: `existingWorktreeId`, `existingWorktreeName`, `existingRange`, `overlapStart`, `overlapEnd`
  - [ ] Add JSDoc comments on all interfaces and fields
  - [ ] Success: file compiles with `npm run typecheck` in `packages/core`

- [ ] **1.2 Extend `ProjectData` in `packages/core/src/types/project.ts`**
  - [ ] Import `WorktreeContext` from `./worktree.js`
  - [ ] Add `worktrees?: WorktreeContext[]` field to `ProjectData` interface with JSDoc comment
  - [ ] Add `'worktrees'` to the `Pick` union in `UpdateProjectData`
  - [ ] Success: `npm run typecheck` passes; existing code that reads `ProjectData` compiles unchanged

- [ ] **1.3 Update type exports**
  - [ ] Export all types from `worktree.ts` in `packages/core/src/types/index.ts`
  - [ ] Verify re-export chain: `types/index.ts` → `src/index.ts` (already exports `* from './types/index.js'`)
  - [ ] Success: `WorktreeContext`, `CreateWorktreeInput`, `UpdateWorktreeInput`, `IndexRangeOverlap` are importable from `@context-forge/core`

**Commit after Task 1.**

---

## Task 2: Implement WorktreeService — CRUD operations

- [ ] **2.1 Create `packages/core/src/services/WorktreeService.ts` with constructor and ID generation**
  - [ ] Import `IProjectStore` from storage interfaces
  - [ ] Import worktree types from types module
  - [ ] Add private `generateWorktreeId()` function: `wt_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`
  - [ ] Create `WorktreeService` class with constructor taking `IProjectStore`
  - [ ] Add private helper `getProjectOrThrow(projectId)` that calls `store.getById()` and throws if not found
  - [ ] Success: class compiles, constructor accepts `IProjectStore`

- [ ] **2.2 Implement `listWorktrees` and `getWorktree` methods**
  - [ ] `listWorktrees(projectId)`: return `project.worktrees ?? []`
  - [ ] `getWorktree(projectId, worktreeId)`: find by `id` in worktrees array, return `undefined` if not found
  - [ ] `getWorktreeByName(projectId, name)`: find by case-insensitive name match (`name.toLowerCase()`), return `undefined` if not found
  - [ ] Success: methods compile, return correct types

- [ ] **2.3 Implement `addWorktree` method (without migration)**
  - [ ] Signature: `addWorktree(projectId, input: CreateWorktreeInput): Promise<{ worktree: WorktreeContext, migrated: boolean, overlaps: IndexRangeOverlap[] }>`
  - [ ] Validate index range: both non-negative integers, start <= end. Throw descriptive error if invalid
  - [ ] Generate ID via `generateWorktreeId()`
  - [ ] Create `WorktreeContext` from input (workflow fields start `undefined`)
  - [ ] Push to `project.worktrees` array (initialize as `[]` if `undefined`)
  - [ ] Call `store.update(projectId, { worktrees: [...] })`
  - [ ] Return created worktree with `migrated: false`, `overlaps: []` (overlap detection added in Task 4)
  - [ ] Note: forward migration logic will be added in Task 3
  - [ ] Success: method compiles, creates worktree with `wt_` prefixed ID

- [ ] **2.4 Implement `updateWorktree` method**
  - [ ] Signature: `updateWorktree(projectId, worktreeId, updates: UpdateWorktreeInput): Promise<WorktreeContext>`
  - [ ] Find worktree by ID in array, throw if not found
  - [ ] If `indexRange` is in updates, validate it (same rules as `addWorktree`)
  - [ ] Merge updates into existing worktree (`{ ...existing, ...updates }`, preserving `id`)
  - [ ] Write back via `store.update()`
  - [ ] Return updated worktree
  - [ ] Success: method applies partial updates, preserves `id`, throws for unknown ID

- [ ] **2.5 Implement `removeWorktree` method (without migration)**
  - [ ] Signature: `removeWorktree(projectId, worktreeId): Promise<{ removed: WorktreeContext, migrated: boolean }>`
  - [ ] Find worktree by ID, throw if not found
  - [ ] Filter worktree out of array
  - [ ] Write back via `store.update()`
  - [ ] Return removed worktree with `migrated: false`
  - [ ] Note: reverse migration logic will be added in Task 3
  - [ ] Success: method removes worktree, throws for unknown ID

- [ ] **2.6 Export `WorktreeService` from services index**
  - [ ] Add export in `packages/core/src/services/index.ts`
  - [ ] Verify it's accessible from `@context-forge/core`
  - [ ] Success: `WorktreeService` importable from package

**Commit after Task 2.**

---

## Task 3: Test CRUD operations

- [ ] **3.1 Create test file with mock store**
  - [ ] Create `packages/core/tests/services/WorktreeService.test.ts`
  - [ ] Implement a `MockProjectStore` that implements `IProjectStore` using an in-memory array
  - [ ] Add helper to create a test project with known fields (some workflow fields populated)
  - [ ] Success: test file runs with `npx vitest run tests/services/WorktreeService.test.ts`

- [ ] **3.2 Test `addWorktree` CRUD behavior**
  - [ ] Test: creates worktree with `wt_` prefixed ID
  - [ ] Test: stores `name`, `indexRange`, `worktreePath` correctly
  - [ ] Test: leaves workflow fields `undefined` on creation
  - [ ] Test: throws for invalid range (negative, start > end)
  - [ ] Test: second `addWorktree` appends to existing array
  - [ ] Success: all tests pass

- [ ] **3.3 Test `getWorktree`, `getWorktreeByName`, `listWorktrees`**
  - [ ] Test: `getWorktree` returns worktree by ID
  - [ ] Test: `getWorktree` returns `undefined` for unknown ID
  - [ ] Test: `getWorktreeByName` matches case-insensitively
  - [ ] Test: `getWorktreeByName` returns `undefined` for unknown name
  - [ ] Test: `listWorktrees` returns all worktrees
  - [ ] Test: `listWorktrees` returns `[]` for project with no worktrees
  - [ ] Success: all tests pass

- [ ] **3.4 Test `updateWorktree` and `removeWorktree`**
  - [ ] Test: `updateWorktree` applies partial updates to name, range, path, workflow fields
  - [ ] Test: `updateWorktree` preserves `id` even if `id` is in updates (it's excluded by type but verify behavior)
  - [ ] Test: `updateWorktree` revalidates index range on range change
  - [ ] Test: `updateWorktree` throws for unknown worktree ID
  - [ ] Test: `removeWorktree` removes worktree by ID
  - [ ] Test: `removeWorktree` throws for unknown worktree ID
  - [ ] Success: all tests pass

**Commit after Task 3.**

---

## Task 4: Implement forward and reverse migration

- [ ] **4.1 Implement forward migration in `addWorktree`**
  - [ ] At the start of `addWorktree`, check: is this the first worktree? (`project.worktrees === undefined || project.worktrees.length === 0`)
  - [ ] If first worktree AND project has at least one non-empty workflow field (`developmentPhase`, `fileSlice`, `fileTasks`, `instruction`, `workType`, `fileArch`, `fileSlicePlan`):
    1. Create a "Default" worktree context: `name: "Default"`, `indexRange: [0, 99]`, `worktreePath: project.projectPath`, workflow fields mapped from project (see slice design for field mapping: `fileSlice` → `activeSlice`, `fileTasks` → `activeTaskFile`, `fileArch` → `archDoc`, `fileSlicePlan` → `slicePlan`, others map directly)
    2. Clear workflow fields on project: set all seven to `''`
    3. Add both the "Default" context and the user's new context to `worktrees`
    4. Write in a single `store.update()` call
    5. Set `migrated: true` in return value
  - [ ] If first worktree but NO workflow fields set: skip "Default" creation, just add user's worktree, `migrated: false`
  - [ ] If not first worktree: append as before, `migrated: false`
  - [ ] Success: forward migration creates "Default" context with correct field mapping

- [ ] **4.2 Implement reverse migration in `removeWorktree`**
  - [ ] After filtering out the removed worktree, check: would `worktrees` be empty?
  - [ ] If empty: map removed worktree's fields back to project (`activeSlice` → `fileSlice`, `activeTaskFile` → `fileTasks`, `archDoc` → `fileArch`, `slicePlan` → `fileSlicePlan`, others map directly). Set `worktrees` to `undefined`. Write in single `store.update()`. Set `migrated: true`
  - [ ] If not empty: write updated array, `migrated: false`
  - [ ] Edge case: if last worktree has no workflow fields (all `undefined`), reverse migration still fires — project fields remain empty. This is correct
  - [ ] Success: reverse migration restores fields to project, removes `worktrees` field

**Commit after Task 4.**

---

## Task 5: Test migration logic

- [ ] **5.1 Test forward migration**
  - [ ] Test: first `addWorktree` on project with all workflow fields set creates "Default" context with mapped fields
  - [ ] Test: "Default" context gets `indexRange: [0, 99]` and `worktreePath` from `project.projectPath`
  - [ ] Test: project's workflow fields are cleared to `''` after forward migration
  - [ ] Test: result has `migrated: true`
  - [ ] Test: `project.worktrees` has exactly 2 entries (Default + user's)
  - [ ] Test: first `addWorktree` on project with NO workflow fields set (all empty strings) does NOT create "Default" context
  - [ ] Test: first `addWorktree` on project with partially-set fields (some empty, some populated) creates "Default" with only populated fields mapped
  - [ ] Success: all forward migration tests pass

- [ ] **5.2 Test reverse migration**
  - [ ] Test: removing last worktree moves its fields back to project (`activeSlice` → `fileSlice`, etc.)
  - [ ] Test: `project.worktrees` becomes `undefined` after reverse migration (not `[]`)
  - [ ] Test: result has `migrated: true`
  - [ ] Test: removing a worktree when others remain does NOT trigger reverse migration (`migrated: false`)
  - [ ] Test: reverse migration with empty workflow fields — project fields remain empty, no error
  - [ ] Success: all reverse migration tests pass

- [ ] **5.3 Test migration atomicity**
  - [ ] Test: verify `store.update()` is called exactly once per `addWorktree` with migration (not multiple calls)
  - [ ] Test: verify `store.update()` is called exactly once per `removeWorktree` with migration
  - [ ] Use a spy/mock on `store.update` to count calls
  - [ ] Success: single update call per operation confirmed

**Commit after Task 5.**

---

## Task 6: Implement index range overlap detection

- [ ] **6.1 Add `findOverlaps` method to `WorktreeService`**
  - [ ] Signature: `findOverlaps(projectId, range: [number, number], excludeId?: string): Promise<IndexRangeOverlap[]>`
  - [ ] Get existing worktrees, filter out `excludeId` if provided
  - [ ] For each remaining worktree, check overlap: `a[0] <= b[1] && b[0] <= a[1]`
  - [ ] For overlapping ranges, compute `overlapStart: Math.max(a[0], b[0])`, `overlapEnd: Math.min(a[1], b[1])`
  - [ ] Return array of `IndexRangeOverlap` objects (empty if no overlaps)
  - [ ] Success: method returns correct overlaps

- [ ] **6.2 Integrate overlap detection into `addWorktree` and `updateWorktree`**
  - [ ] In `addWorktree`: call `findOverlaps` with the new range, include results in return value's `overlaps` field
  - [ ] In `updateWorktree`: if `indexRange` is being updated, call `findOverlaps` with `excludeId` set to the worktree being updated. Log or note overlaps but do not block
  - [ ] Overlap does NOT prevent creation/update — callers decide how to handle
  - [ ] Success: `addWorktree` returns overlaps when ranges conflict

- [ ] **6.3 Test overlap detection**
  - [ ] Test: no overlap for adjacent ranges (`[100, 199]` and `[200, 299]`)
  - [ ] Test: overlap for touching ranges (`[100, 199]` and `[199, 299]` — overlap at 199)
  - [ ] Test: overlap for fully contained range (`[100, 199]` and `[120, 150]`)
  - [ ] Test: overlap for partial overlap (`[100, 199]` and `[150, 249]`)
  - [ ] Test: `excludeId` correctly excludes the worktree being updated
  - [ ] Test: `addWorktree` returns `overlaps` array in result
  - [ ] Test: `addWorktree` still succeeds when overlaps exist (not blocked)
  - [ ] Success: all overlap tests pass

**Commit after Task 6.**

---

## Task 7: Update `migrateProjectFields` and verify backwards compatibility

- [ ] **7.1 Update `migrateProjectFields()` in `FileProjectStore.ts`**
  - [ ] Import `WorktreeContext` type
  - [ ] Add `worktrees: project.worktrees as WorktreeContext[] | undefined` to the migrated object
  - [ ] Success: stored projects with `worktrees` field survive `getAll()` migration path

- [ ] **7.2 Verify existing tests pass**
  - [ ] Run full test suite: `npm test` in `packages/core`
  - [ ] All existing tests pass unchanged — no worktree contexts means no behavior change
  - [ ] Success: zero test regressions

**Commit after Task 7.**

---

## Task 8: Final verification and build

- [ ] **8.1 Run full build and typecheck**
  - [ ] `npm run build` in `packages/core` — no errors
  - [ ] `npm run typecheck` in `packages/core` — no errors
  - [ ] `npm test` in `packages/core` — all tests pass (existing + new)
  - [ ] Success: clean build, clean types, all tests green

- [ ] **8.2 Verify exports are accessible**
  - [ ] Confirm `WorktreeContext`, `CreateWorktreeInput`, `UpdateWorktreeInput`, `IndexRangeOverlap` exported from `@context-forge/core`
  - [ ] Confirm `WorktreeService` exported from `@context-forge/core`
  - [ ] Success: all new types and service importable from package entry point

**Commit after Task 8 if any changes were needed. Otherwise, this is a verification-only step.**
