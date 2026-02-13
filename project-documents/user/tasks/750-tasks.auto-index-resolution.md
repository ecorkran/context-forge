---
layer: project
docType: tasks
slice: auto-index-resolution
project: context-forge
feature: user/features/750-feature.auto-index-resolution.md
architecture: user/architecture/050-arch.prompt-system-decoupling.md
dependencies: []
projectState: Electron+React app with IPC-based file operations. Auto-generation logic exists for task filenames from slice names. No index resolution logic exists yet.
dateCreated: 20260212
dateUpdated: 20260212
---

## Context Summary

- Working on standalone feature 750: Auto-Resolve File Indices for Artifact Creation
- Context Forge is an Electron + React + TypeScript app using Vite
- File operations happen in main process via IPC; renderer uses `window.electronAPI`
- `file-naming-conventions.md` defines semantic index ranges (e.g., slices: 100-749, standalone features: 750-799)
- `ProjectConfigForm.tsx` already auto-derives task filenames from slice names but requires manual index entry
- Existing pattern: `StatementManager.ts` and `PromptFileManager.ts` show file scanning via `fs` in main process
- Monorepo mode uses `project-artifacts/` instead of `project-documents/user/`
- Architecture parent: 050-arch.prompt-system-decoupling (Issue #25)
- This feature delivers: automatic next-index calculation when creating slices, tasks, or features

---

## Task 1: Define IndexResolver Types and Interface

**Owner**: Junior AI
**Dependencies**: None
**Effort**: 1
**Objective**: Create TypeScript types and interface for the index resolution system.

**Steps**:
- [ ] Create file `src/main/services/project/types.ts`
- [ ] Define `ArtifactType` union type covering artifact categories:
  - `'slice'` (range 100-749, directory: `slices/`)
  - `'feature'` (range 750-799, directory: `features/`)
  - `'architecture'` (range 050-089, directory: `architecture/`)
  - `'maintenance'` (range 950-999, directory: `tasks/`)
  - `'review'` (range 900-939, directory: `reviews/`)
  - `'analysis'` (range 940-949, directory: `analysis/`)
- [ ] Define `IndexRange` interface with `min: number`, `max: number`, `directory: string`, `filePrefix: string`
- [ ] Define `IndexSuggestion` interface: `{ index: number, filename: string, range: IndexRange, artifactType: ArtifactType }`
- [ ] Define `IIndexResolver` interface with method signatures:
  - `getNextIndex(artifactType: ArtifactType, name: string): Promise<IndexSuggestion>`
  - `getExistingIndices(artifactType: ArtifactType): Promise<number[]>`
- [ ] Export all types

**Success Criteria**:
- [ ] Types file compiles without errors
- [ ] All semantic ranges from `file-naming-conventions.md` are represented
- [ ] Interface is sufficient to support both main-process use and IPC serialization

---

## Task 2: Implement IndexResolver Service

**Owner**: Junior AI
**Dependencies**: Task 1
**Effort**: 3
**Objective**: Create the main-process service that scans directories and resolves next available indices.

**Steps**:
- [ ] Create file `src/main/services/project/IndexResolver.ts`
- [ ] Implement `RANGE_MAP` constant mapping each `ArtifactType` to its `IndexRange` (derived from `file-naming-conventions.md` ranges)
- [ ] Implement `scanDirectory(dirPath: string): Promise<number[]>` method:
  - Use `fs.promises.readdir` to list files
  - Extract leading 3-digit indices from filenames using regex `^(\d{3})-`
  - Return sorted array of found indices
- [ ] Implement `getExistingIndices(artifactType: ArtifactType): Promise<number[]>`:
  - Determine directory path from `RANGE_MAP` using the artifact type
  - Build full path using project root + `project-documents/user/{directory}`
  - Call `scanDirectory` and filter to only indices within the artifact's range
- [ ] Implement `getNextIndex(artifactType: ArtifactType, name: string): Promise<IndexSuggestion>`:
  - Call `getExistingIndices` to get used indices
  - Find the next sequential index within the range (start from `range.min`, increment by 1)
  - If range is exhausted, throw a descriptive error
  - Build filename using pattern from `file-naming-conventions.md` (e.g., `{index}-slice.{name}.md`)
  - Return `IndexSuggestion` object
- [ ] Handle monorepo mode: accept an optional `basePath` parameter that defaults to `project-documents/user` but can be overridden to `project-artifacts`
- [ ] Accept project root path as constructor parameter (do not rely on `process.cwd()`)

**Success Criteria**:
- [ ] Service correctly scans directories and identifies used indices
- [ ] Next index is sequential (smallest unused within range)
- [ ] Filename is generated following correct naming conventions per artifact type
- [ ] Range exhaustion produces a clear error message
- [ ] No hardcoded absolute paths; project root injected via constructor

---

## Task 3: Add IPC Handler for Index Resolution

**Owner**: Junior AI
**Dependencies**: Task 2
**Effort**: 2
**Objective**: Expose IndexResolver to the renderer process via Electron IPC.

**Steps**:
- [ ] In `src/main/ipc/` (or `src/main/main.ts` if IPC is registered there), add new IPC handlers:
  - `index-resolver:get-next-index`: accepts `{ artifactType: string, name: string, isMonorepo?: boolean }`, returns `IndexSuggestion`
  - `index-resolver:get-existing-indices`: accepts `{ artifactType: string, isMonorepo?: boolean }`, returns `number[]`
- [ ] Instantiate `IndexResolver` with the app's project root path
- [ ] Validate `artifactType` input against known `ArtifactType` values before calling the service
- [ ] Return structured response; catch and return errors as `{ error: string }`
- [ ] Follow the existing IPC pattern used by other handlers in the codebase (e.g., `contextServices.ts`)

**Success Criteria**:
- [ ] IPC handlers registered and callable from preload
- [ ] Invalid artifact types return a clear error
- [ ] Follows existing IPC conventions in the codebase

---

## Task 4: Update Preload Bridge

**Owner**: Junior AI
**Dependencies**: Task 3
**Effort**: 1
**Objective**: Expose index resolution IPC calls to the renderer via `window.electronAPI`.

**Steps**:
- [ ] Open `src/preload/preload.ts`
- [ ] Add `indexResolver` namespace to the exposed API:
  - `getNextIndex(artifactType: string, name: string, isMonorepo?: boolean): Promise<IndexSuggestion>`
  - `getExistingIndices(artifactType: string, isMonorepo?: boolean): Promise<number[]>`
- [ ] Each method calls `ipcRenderer.invoke` with the corresponding channel from Task 3
- [ ] Update the preload TypeScript declarations if a `d.ts` file exists for `window.electronAPI`

**Success Criteria**:
- [ ] `window.electronAPI.indexResolver.getNextIndex(...)` is callable from renderer
- [ ] `window.electronAPI.indexResolver.getExistingIndices(...)` is callable from renderer
- [ ] TypeScript types are correctly exposed

---

## Task 5: Integrate Auto-Index into ProjectConfigForm UI

**Owner**: Junior AI
**Dependencies**: Task 4
**Effort**: 3
**Objective**: Add UI controls to ProjectConfigForm that allow users to auto-resolve the next index when creating artifacts.

**Steps**:
- [ ] Open `src/components/forms/ProjectConfigForm.tsx`
- [ ] Add an "auto-resolve" button (or icon button) next to the Slice field:
  - On click, call `window.electronAPI.indexResolver.getNextIndex('slice', nameValue)`
  - Populate the slice field with the suggested filename
  - Show the resolved index and range info (e.g., tooltip or small label: "Index 128 of 100-749")
- [ ] Add equivalent auto-resolve for Feature field (standalone features, range 750-799)
- [ ] When slice field is auto-resolved, auto-derive the task filename using existing `generateTaskFileName()` logic
- [ ] Handle error states:
  - Show user-facing message if range is full
  - Show message if directory scan fails
- [ ] Ensure the auto-resolve button is visually consistent with existing form styling (Radix UI + Tailwind)
- [ ] User can still manually type/override the resolved value

**Success Criteria**:
- [ ] Auto-resolve button appears next to Slice and Feature fields
- [ ] Clicking it populates the field with a correctly indexed filename
- [ ] Task filename auto-derives when slice is resolved
- [ ] Errors display gracefully
- [ ] Manual override remains possible

---

## Task 6: Write Unit Tests for IndexResolver

**Owner**: Junior AI
**Dependencies**: Task 2
**Effort**: 2
**Objective**: Create comprehensive unit tests for the IndexResolver service.

**Steps**:
- [ ] Create file `src/main/services/project/__tests__/IndexResolver.test.ts`
- [ ] Use vitest; mock `fs.promises.readdir`
- [ ] Test cases for `scanDirectory`:
  - Empty directory returns `[]`
  - Directory with files returns sorted indices
  - Files without numeric prefix are ignored
  - Non-existent directory handled gracefully
- [ ] Test cases for `getExistingIndices`:
  - Filters indices to correct range for each artifact type
  - Returns only indices within range bounds
- [ ] Test cases for `getNextIndex`:
  - Empty directory: returns range minimum (e.g., 100 for slices)
  - Existing files: returns next sequential index
  - Gaps in sequence: fills the gap (e.g., 100, 102 → returns 101)
  - Range exhaustion: throws appropriate error
  - Correct filename format per artifact type
- [ ] Test monorepo path variation

**Success Criteria**:
- [ ] All tests pass with `vitest`
- [ ] Coverage of happy path, edge cases, and error conditions
- [ ] Mocks are clean and don't depend on filesystem state

---

## Task 7: Build Verification and Integration Check

**Owner**: Junior AI
**Dependencies**: Tasks 1-6
**Effort**: 1
**Objective**: Verify the full feature builds and integrates correctly.

**Steps**:
- [ ] Run `pnpm build` — fix any TypeScript or build errors
- [ ] Run `pnpm test` (or vitest) — all tests pass
- [ ] Verify no regressions in existing functionality:
  - ProjectConfigForm still loads and works
  - Existing auto-derive task filename logic unaffected
  - Context generation unchanged
- [ ] Manual smoke test (if possible): launch app, use auto-resolve on slice field

**Success Criteria**:
- [ ] Build succeeds with no errors (warnings acceptable)
- [ ] All tests pass
- [ ] No regressions in existing features
