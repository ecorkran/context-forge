---
layer: project
docType: tasks
feature: auto-index-resolution
project: context-forge
lld: user/features/750-feature.auto-index-resolution.md
architecture: user/architecture/050-arch.prompt-system-decoupling.md
dependencies: [128-slice.project-path-awareness]
status: not started
projectState: >
  Electron+React+TypeScript app (Vite build). Slice 128 complete — projectPath
  field on ProjectData, ProjectPathService with validate/healthCheck/listDirectory,
  IPC handlers at project-path:*, preload bridge at window.electronAPI.projectPath,
  health indicator in main UI. Shared types (PathValidationResult, DirectoryListResult)
  at src/main/services/project/types.ts. ProjectConfigForm has auto-derive logic
  for task filenames from slice names via generateTaskFileName(). 19 existing tests
  for ProjectPathService using vitest with fs mocks.
dateCreated: 20260212
dateUpdated: 20260213
---

## Context Summary

- Working on feature 750: Auto-Resolve File Indices for Artifact Creation (Issue #25)
- Context Forge is an Electron + React + TypeScript app using Vite, Radix, and Tailwind 4
- **Slice 128 delivered** all filesystem infrastructure: `projectPath` on ProjectData, `ProjectPathService.listDirectory()`, IPC channels, preload bindings, health indicator
- `ProjectPathService` at `src/main/services/project/ProjectPathService.ts` is stateless — each method receives path and flags as arguments
- Existing IPC pattern: handlers in `src/main/ipc/`, registered from `main.ts`, preload at `src/preload/preload.ts`, types declared in `StorageClient.ts`
- `ProjectConfigForm.tsx` has `generateTaskFileName(slice)` that extracts `nnn-` prefix and replaces the type segment with `tasks`
- `file-naming-conventions.md` defines semantic index ranges (slices: 100-749, features: 750-799, architecture: 050-089, etc.)
- This feature adds: index extraction from filenames, next-available-index calculation, auto-resolve UI button on Slice field

---

## Task 1: Add Index Resolution Types to Shared Types File

**Owner**: Junior AI
**Dependencies**: None
**Effort**: 1
**Objective**: Extend the existing shared types file with types for index resolution.

**Steps**:
- [ ] Open `src/main/services/project/types.ts` (already exists from Slice 128 — contains `PathValidationResult` and `DirectoryListResult`)
- [ ] Add `ArtifactType` union type:
  ```typescript
  type ArtifactType = 'slice' | 'feature' | 'architecture';
  ```
  Note: limit to the three artifact types users actually create via the form. Code reviews, analysis, and maintenance are not user-created in the UI.
- [ ] Add `IndexRange` interface:
  ```typescript
  interface IndexRange { min: number; max: number; directory: string; prefix: string; }
  ```
- [ ] Add `IndexSuggestion` interface:
  ```typescript
  interface IndexSuggestion { index: number; filename: string; artifactType: ArtifactType; existingCount: number; }
  ```
- [ ] Export all new types alongside existing ones

**Success Criteria**:
- [ ] File compiles without errors
- [ ] Existing `PathValidationResult` and `DirectoryListResult` exports unchanged
- [ ] New types importable from both main process and renderer

---

## Task 2: Implement IndexResolverService

**Owner**: Junior AI
**Dependencies**: Task 1
**Effort**: 3
**Objective**: Create a main-process service that determines the next available index for a given artifact type by scanning existing files via `ProjectPathService.listDirectory()`.

**Steps**:
- [ ] Create file `src/main/services/project/IndexResolverService.ts`
- [ ] Import `ArtifactType`, `IndexRange`, `IndexSuggestion` from `./types`
- [ ] Import `ProjectPathService` from `./ProjectPathService`
- [ ] Define `RANGE_MAP` constant mapping each `ArtifactType` to its `IndexRange`:
  - `slice`: `{ min: 100, max: 749, directory: 'slices', prefix: 'slice' }`
  - `feature`: `{ min: 750, max: 799, directory: 'features', prefix: 'feature' }`
  - `architecture`: `{ min: 50, max: 89, directory: 'architecture', prefix: 'arch' }`
- [ ] Implement `extractIndices(files: string[]): number[]`:
  - Use regex `^(\d{3})-` to extract leading 3-digit indices from filenames
  - Return sorted array of parsed numbers
- [ ] Implement `getNextIndex(projectPath, artifactType, name, isMonorepo?): Promise<IndexSuggestion>`:
  - Look up range from `RANGE_MAP`; throw if `artifactType` is invalid
  - Call `projectPathService.listDirectory(projectPath, range.directory, isMonorepo)` to get existing files
  - If `listDirectory` returns an error, throw with descriptive message
  - Extract indices, filter to those within range bounds
  - Find smallest unused index starting from `range.min`
  - If range exhausted, throw descriptive error
  - Build filename: `{index}-{prefix}.{name}.md` (e.g., `129-slice.my-feature.md`)
  - Return `IndexSuggestion` with index, filename, artifactType, and count of existing files
- [ ] Accept `ProjectPathService` instance via constructor (dependency injection for testability)
- [ ] Keep the service stateless — no cached state between calls

**Success Criteria**:
- [ ] Empty directory returns range minimum (e.g., 100 for slices)
- [ ] Existing indices are skipped (e.g., [100, 101, 103] returns 102)
- [ ] Range boundaries are respected (feature index never exceeds 799)
- [ ] Range exhaustion produces a clear error
- [ ] Uses `ProjectPathService.listDirectory()` — no direct `fs` calls

---

## Task 3: Write Unit Tests for IndexResolverService

**Owner**: Junior AI
**Dependencies**: Task 2
**Effort**: 2
**Objective**: Create unit tests for the index resolution logic.

**Steps**:
- [ ] Create file `src/main/services/project/__tests__/IndexResolverService.test.ts`
- [ ] Use vitest; mock `ProjectPathService` (not `fs` — the service uses `listDirectory`, not raw fs)
- [ ] Test `extractIndices`:
  - [ ] Empty array returns `[]`
  - [ ] Filenames with numeric prefix extracted correctly
  - [ ] Non-numeric filenames (e.g., `README.md`) ignored
  - [ ] Results sorted numerically
- [ ] Test `getNextIndex` — happy path:
  - [ ] Empty directory: returns range min (100 for slice, 750 for feature, 50 for arch)
  - [ ] Sequential files: returns next in sequence
  - [ ] Gap in sequence: fills gap (100, 102 → returns 101)
  - [ ] Correct filename format per artifact type
- [ ] Test `getNextIndex` — error cases:
  - [ ] Invalid artifact type throws
  - [ ] Range exhaustion throws descriptive error
  - [ ] `listDirectory` error propagated clearly
- [ ] Test monorepo flag is passed through to `listDirectory`

**Success Criteria**:
- [ ] All tests pass with `pnpm test`
- [ ] Mock pattern is clean — mocks `ProjectPathService`, not filesystem
- [ ] Covers happy path, edge cases, and error conditions

---

## Task 4: Register IPC Handler for Index Resolution

**Owner**: Junior AI
**Dependencies**: Task 2
**Effort**: 2
**Objective**: Expose `IndexResolverService` to the renderer via IPC, following existing patterns.

**Steps**:
- [ ] Create file `src/main/ipc/indexResolverHandlers.ts`
- [ ] Import `ProjectPathService` and `IndexResolverService`
- [ ] Import types from `../services/project/types`
- [ ] Create service instances at module level (same pattern as `projectPathHandlers.ts`)
- [ ] Implement `setupIndexResolverHandlers()` registering one handler:
  - `index-resolver:get-next-index` — receives `{ projectPath: string, artifactType: string, name: string, isMonorepo?: boolean }`, returns `IndexSuggestion`
  - Validate `artifactType` against known values before calling service
  - Return structured error `{ error: string }` on failure
- [ ] Implement `removeIndexResolverHandlers()` for cleanup
- [ ] Open `src/main/main.ts`
- [ ] Import and call `setupIndexResolverHandlers()` alongside existing handler registrations

**Success Criteria**:
- [ ] IPC handler registered at app startup
- [ ] Invalid artifact types return structured error
- [ ] Follows conventions from `projectPathHandlers.ts`

---

## Task 5: Update Preload Bridge and Type Declarations

**Owner**: Junior AI
**Dependencies**: Task 4
**Effort**: 1
**Objective**: Expose the index resolver IPC to the renderer via `window.electronAPI.indexResolver`.

**Steps**:
- [ ] Open `src/preload/preload.ts`
- [ ] Add `indexResolver` namespace:
  ```typescript
  indexResolver: {
    getNextIndex: (projectPath: string, artifactType: string, name: string, isMonorepo?: boolean) =>
      ipcRenderer.invoke('index-resolver:get-next-index', { projectPath, artifactType, name, isMonorepo }),
  }
  ```
- [ ] Open `src/services/storage/StorageClient.ts`
- [ ] Add to the `Window.electronAPI` type declaration:
  ```typescript
  indexResolver: {
    getNextIndex: (projectPath: string, artifactType: string, name: string, isMonorepo?: boolean) =>
      Promise<import('../../main/services/project/types').IndexSuggestion>;
  };
  ```

**Success Criteria**:
- [ ] `window.electronAPI.indexResolver.getNextIndex(...)` callable from renderer with type safety
- [ ] Build passes with no type errors

---

## Task 6: Add Auto-Resolve Button to ProjectConfigForm

**Owner**: Junior AI
**Dependencies**: Task 5
**Effort**: 3
**Objective**: Add UI to the Slice field that auto-resolves the next available index.

**Steps**:
- [ ] Open `src/components/forms/ProjectConfigForm.tsx`
- [ ] Determine where `projectPath` and `isMonorepo` are accessible:
  - `projectPath` is on `formData` (via `CreateProjectData`) — may need to be passed as a prop if not currently available in the form. Check `initialData` prop.
  - `isMonorepo` is on `formData`
- [ ] Add component state: `isResolving: boolean`, `resolveError: string | null`
- [ ] Add a small icon button (e.g., hash `#` icon or wand icon from `lucide-react`) next to the Slice input field
  - Only visible/enabled when `projectPath` is set and non-empty
  - Tooltip: "Auto-resolve next index"
- [ ] Implement click handler:
  - Set `isResolving = true`
  - Prompt user for artifact type if ambiguous, or default to `'slice'` since the button is on the Slice field
  - Call `window.electronAPI.indexResolver.getNextIndex(projectPath, 'slice', currentSliceName, isMonorepo)`
  - On success: populate the slice field with `suggestion.filename`, trigger `handleSliceChange` so task filename auto-derives
  - On error: set `resolveError` with user-friendly message
  - Set `isResolving = false`
- [ ] Show brief inline feedback:
  - Success: field populated (self-evident)
  - Error: small red text below the field, auto-dismiss after a few seconds
  - Resolving: button shows spinner or pulse state
- [ ] Ensure manual typing still works — auto-resolve is additive, not mandatory
- [ ] Style consistent with existing form (Tailwind 4, existing button/input patterns)

**Success Criteria**:
- [ ] Auto-resolve button appears next to Slice field when projectPath is set
- [ ] Button hidden/disabled when no projectPath
- [ ] Clicking populates slice field with correctly indexed filename
- [ ] Task filename auto-derives via existing `generateTaskFileName()`
- [ ] Errors display gracefully, don't block manual entry
- [ ] Manual override of the populated value still works

---

## Task 7: Build Verification and Integration Check

**Owner**: Junior AI
**Dependencies**: Tasks 1-6
**Effort**: 1
**Objective**: Verify the full feature builds and integrates correctly.

**Steps**:
- [ ] Run `pnpm build` — fix any TypeScript or build errors
- [ ] Run `pnpm test` — all tests pass (existing + new IndexResolverService tests)
- [ ] Verify no regressions:
  - [ ] ProjectConfigForm loads, manual slice/task entry works
  - [ ] Existing `generateTaskFileName()` auto-derive unaffected
  - [ ] Settings dialog and health indicator still work
  - [ ] Context generation unchanged
- [ ] Verify new functionality:
  - [ ] Auto-resolve button appears when projectPath is set
  - [ ] Auto-resolve button hidden when projectPath is not set
  - [ ] Clicking auto-resolve populates slice field with correct index
  - [ ] Task file auto-derives from resolved slice name

**Success Criteria**:
- [ ] Build succeeds with no errors (warnings acceptable)
- [ ] All tests pass
- [ ] No regressions in existing features
- [ ] Auto-resolve works end-to-end
