---
slice: electron-client-conversion
project: context-forge
lld: user/slices/148-slice.electron-client-conversion.md
dependencies: [core-orchestration-extraction, storage-migration]
projectState: All prerequisite slices (140-147) complete. Core package exports FileProjectStore, createContextPipeline, FileStorageService, ProjectPathService. MCP server operational with 8 tools. Electron app still uses internal IPC wrappers and renderer-side service stack.
dateCreated: 20260221
dateUpdated: 20260221
docType: tasks
status: not_started
---

## Context Summary
- Working on electron-client-conversion slice
- Electron app currently has a multi-layer renderer service stack (StorageClient → ElectronStorageService → PersistentProjectStore → ProjectManager) and IPC wrappers (StatementManagerIPC, SystemPromptParserIPC) that duplicate logic already in @context-forge/core
- Goal: rewire Electron as a thin UI client — main process delegates to core, renderer makes simple IPC calls
- Only 2 renderer consumer files need updating: `ContextBuilderApp.tsx` and `useContextGeneration.ts`
- Existing test files for deleted modules must be removed/replaced
- 4-phase approach: (1) main-process handlers, (2) preload + renderer API, (3) consumer migration, (4) cleanup
- Next planned slice: Core Test Suite (slice 150) or MCP Server Integration Testing (slice 151)

---

## Phase 1: Main-Process Domain Handlers

### Task 1: Create `projectHandlers.ts` — project CRUD IPC handlers
- [x] Create `packages/electron/src/main/ipc/projectHandlers.ts`
  - [x] Export `registerProjectHandlers(store: FileProjectStore)` function
  - [x] Register IPC handlers for: `project:list`, `project:get`, `project:create`, `project:update`, `project:delete`
  - [x] `project:list` calls `store.getAll()`, sorts by `updatedAt` descending
  - [x] `project:get` calls `store.getById(id)`, returns `ProjectData | null`
  - [x] `project:create` calls `store.create(data)`, returns created `ProjectData`
  - [x] `project:update` calls `store.update(id, updates)` then `store.getById(id)` to return updated data
  - [x] `project:delete` calls `store.delete(id)`
  - [x] All handlers wrap calls in try/catch — rethrow errors with descriptive messages for IPC error propagation
  - [x] **Success:** File compiles, exports the registration function, all 5 handlers use `ipcMain.handle()`

### Task 2: Unit tests for `projectHandlers.ts`
- [x] Create `packages/electron/tests/unit/main/ipc/projectHandlers.test.ts`
  - [x] Mock `FileProjectStore` with vi.fn() for each method
  - [x] Test `project:list` calls `getAll()` and returns sorted array
  - [x] Test `project:get` returns project when found, null when not
  - [x] Test `project:create` passes `CreateProjectData` to `create()` and returns result
  - [x] Test `project:update` calls `update()` then `getById()` for read-back
  - [x] Test `project:delete` calls `delete()` with correct id
  - [x] Test error propagation: handler rethrows when store method throws
  - [x] **Success:** All tests pass via `pnpm --filter @context-forge/electron test:run`

### Task 3: Create `contextHandlers.ts` — context generation IPC handler
- [x] Create `packages/electron/src/main/ipc/contextHandlers.ts`
  - [x] Define `ContextOverrides` interface (or import from a shared types location — see slice design for shape)
  - [x] Export `registerContextHandlers(store: FileProjectStore)` function
  - [x] Register `context:generate` handler: takes `(projectId: string, overrides?: ContextOverrides)`
  - [x] Handler flow: `store.getById(projectId)` → validate project exists → apply overrides to project copy → `createContextPipeline(project.projectPath)` → `integrator.generateContextFromProject(modifiedProject)` → return context string
  - [x] Override application: merge override fields into a shallow copy of ProjectData before passing to pipeline (same pattern as MCP server's `context_build`)
  - [x] Error case: project not found → throw descriptive error
  - [x] Error case: project has no `projectPath` → throw descriptive error
  - [x] **Success:** File compiles, exports registration function, handler delegates to `createContextPipeline`

### Task 4: Unit tests for `contextHandlers.ts`
- [x] Create `packages/electron/tests/unit/main/ipc/contextHandlers.test.ts`
  - [x] Mock `FileProjectStore` and `createContextPipeline` (from `@context-forge/core/node`)
  - [x] Test successful generation: returns context string from integrator
  - [x] Test with overrides: verify override fields are applied to project before passing to pipeline
  - [x] Test project not found: throws error with descriptive message
  - [x] Test project missing projectPath: throws error
  - [x] **Success:** All tests pass

### Task 5: Create `appStateHandlers.ts` — app state IPC handlers
- [x] Create `packages/electron/src/main/ipc/appStateHandlers.ts`
  - [x] Export `registerAppStateHandlers(storageService: FileStorageService)` function
  - [x] Register `app-state:get` handler: reads `app-state.json` via `storageService.read()`, parses JSON, returns `AppState` object (return default empty state if file doesn't exist)
  - [x] Register `app-state:update` handler: reads current state, merges `Partial<AppState>` updates, writes back via `storageService.write()`
  - [x] Define `AppState` interface (reuse from existing `src/services/storage/types/AppState.ts` — move type to a shared location or define inline)
  - [x] **Success:** File compiles, both handlers registered

### Task 6: Unit tests for `appStateHandlers.ts`
- [x] Create `packages/electron/tests/unit/main/ipc/appStateHandlers.test.ts`
  - [x] Mock `FileStorageService` read/write methods
  - [x] Test `app-state:get` returns parsed state from file
  - [x] Test `app-state:get` returns default state when file doesn't exist
  - [x] Test `app-state:update` merges partial updates with existing state
  - [x] **Success:** All tests pass

### Task 7: Wire handlers into `main.ts` and verify build
- [x] Modify `packages/electron/src/main/main.ts`
  - [x] Import `FileProjectStore`, `FileStorageService`, `getStoragePath` from `@context-forge/core/node`
  - [x] Initialize `FileProjectStore` instance at app startup (using `getStoragePath()`)
  - [x] Initialize `FileStorageService` instance for app state
  - [x] Import and call `registerProjectHandlers(store)`, `registerContextHandlers(store)`, `registerAppStateHandlers(storageService)`
  - [x] Keep existing old handlers registered (coexistence — both old and new channels work)
  - [x] **Success:** `pnpm build` succeeds across workspace. App launches and old functionality still works. New handlers are registered (verifiable via logs or a simple test).

### Task 8: Commit Phase 1
- [x] Git add and commit all Phase 1 files (new handlers, tests, main.ts changes)
  - [x] **Success:** Clean commit with all Phase 1 work, build passes

---

## Phase 2: Preload and Renderer API

### Task 9: Update preload script with new IPC channels
- [x] Modify `packages/electron/src/preload/preload.ts`
  - [x] Add new channel bindings via `contextBridge.exposeInMainWorld`:
    - [x] `project: { list, get, create, update, delete }` — each calls `ipcRenderer.invoke('project:...')`
    - [x] `context: { generate }` — calls `ipcRenderer.invoke('context:generate', ...)`
    - [x] `appState: { get, update }` — calls `ipcRenderer.invoke('app-state:...')`
  - [x] Keep existing bindings intact for now (old and new coexist)
  - [x] **Success:** Preload exposes both old and new API surfaces. Build passes.

### Task 10: Create renderer-side API module (`services/api.ts`)
- [x] Create `packages/electron/src/services/api.ts`
  - [x] Define typed API objects: `projectApi`, `contextApi`, `appStateApi`
  - [x] Each method calls through `window.electronAPI.project.*`, `window.electronAPI.context.*`, `window.electronAPI.appState.*`
  - [x] Import types from `@context-forge/core` (`ProjectData`, `CreateProjectData`, `UpdateProjectData`)
  - [x] Define `ContextOverrides` type (import or re-export from contextHandlers if shared, or define locally)
  - [x] Update global type declarations for `window.electronAPI` to include new API surface (likely in `StorageClient.ts` or a dedicated `.d.ts` — check current location)
  - [x] **Success:** `api.ts` compiles with full type safety. No runtime usage yet.

### Task 11: Commit Phase 2
- [x] Git add and commit Phase 2 files (preload changes, api.ts)
  - [x] **Success:** Clean commit, build passes

---

## Phase 3: Consumer Migration

### Task 12: Migrate `useContextGeneration` hook
- [x] Modify `packages/electron/src/hooks/useContextGeneration.ts`
  - [x] Replace import of `createSystemPromptParser`, `createStatementManager` from `ServiceFactory` with import of `contextApi` from `services/api`
  - [x] Remove imports of `ContextTemplateEngine`, `ContextIntegrator`, `SectionBuilder` from core (no longer used in renderer)
  - [x] Simplify hook: single `contextApi.generate(projectId, overrides)` call replaces local pipeline orchestration
  - [x] Maintain same return interface: `{ contextString, isLoading, error, regenerate }`
  - [x] Hook signature changes from accepting project data to accepting `projectId: string | null`
  - [x] **Success:** Hook compiles, same return type, uses IPC instead of local orchestration

### Task 13: Test `useContextGeneration` hook
- [x] Create or update test at `packages/electron/tests/unit/hooks/useContextGeneration.test.ts`
  - [x] Mock `window.electronAPI.context.generate` via vi.fn()
  - [x] Test loading state transitions: idle → loading → success
  - [x] Test error state: mock rejects → error string populated
  - [x] Test regenerate with overrides: verify overrides passed through
  - [x] Test null projectId: regenerate is no-op
  - [x] **Success:** All tests pass

### Task 14: Migrate `ContextBuilderApp.tsx` — replace ProjectManager and PersistentProjectStore
- [x] Modify `packages/electron/src/components/ContextBuilderApp.tsx`
  - [x] Replace `PersistentProjectStore` import with `projectApi` and `appStateApi` from `services/api`
  - [x] Replace `ProjectManager` import with direct `projectApi` calls
  - [x] Update project loading: `projectApi.list()` instead of `projectManager.loadAllProjects()`
  - [x] Update project creation: `projectApi.create(data)` instead of `projectManager.createNewProject(data)`
  - [x] Update project switching: `projectApi.get(id)` + `appStateApi.update({ lastActiveProjectId: id })` instead of `projectManager.switchToProject(id)`
  - [x] Update project deletion: `projectApi.delete(id)` instead of `projectManager.deleteProject(id)`
  - [x] Update project updates/auto-save: `projectApi.update(id, changes)` instead of `persistentStore.saveProject(project)`
  - [x] Update app state: `appStateApi.get()` / `appStateApi.update()` instead of `persistentStore.getAppState()` / `persistentStore.updateAppState()`
  - [x] Update `useContextGeneration` call to pass `projectId` instead of full project data
  - [x] Evaluate `app:flush-save` handler: if all writes are `await`ed IPC calls, flush may be unnecessary. Remove or simplify.
  - [x] **Success:** Component compiles, all project workflows function via new API

### Task 15: Verify build and run behavioral parity check
- [x] Run `pnpm build` — must succeed
- [x] Run all existing tests — note any failures from updated interfaces
  - [x] Fix test failures caused by interface changes in ContextBuilderApp or useContextGeneration
  - [x] **Success:** Build succeeds, all non-deleted-module tests pass

### Task 16: Commit Phase 3
- [x] Git add and commit Phase 3 files
  - [x] **Success:** Clean commit, build passes

---

## Phase 4: Cleanup

### Task 17: Delete obsolete renderer service files
- [x] Delete the following files from `packages/electron/src/`:
  - [x] `services/storage/StorageClient.ts`
  - [x] `services/storage/ElectronStorageService.ts`
  - [x] `services/storage/PersistentProjectStore.ts`
  - [x] `services/storage/StorageService.ts`
  - [x] `services/project/ProjectManager.ts`
  - [x] `services/context/StatementManagerIPC.ts`
  - [x] `services/context/SystemPromptParserIPC.ts`
  - [x] `services/context/ServiceFactory.ts`
- [x] Update or replace `services/context/index.ts` — if any re-exports from core are still needed by other renderer files, keep only those. Otherwise delete.
- [x] Verify no remaining imports reference deleted files (TypeScript build will catch this)
- [x] **Success:** Files deleted, `pnpm build` succeeds

### Task 18: Delete obsolete test files
- [x] Delete test files for removed modules from `packages/electron/tests/`:
  - [x] `unit/services/storage/StorageClient.test.ts`
  - [x] `unit/services/storage/ElectronStorageService.test.ts`
  - [x] `unit/services/storage/integration.test.ts` (if it tests old storage stack)
  - [x] `unit/services/project/ProjectManager.test.ts`
  - [x] `unit/services/context/IPCIntegration.test.ts` (if it tests old IPC wrappers)
- [x] Review remaining test files: `ContextGenerator.test.ts`, `ContextIntegrator.test.ts`, `TemplateProcessor.test.ts` — these test core services and may still be valid if they import from `@context-forge/core`. Keep if passing, update imports if needed.
- [x] **Success:** No test references to deleted modules, `pnpm test:run` passes for remaining tests

### Task 19: Remove old IPC handlers and preload bindings
- [x] Remove old IPC handlers from `main.ts` or `contextServices.ts`:
  - [x] `storage:read`, `storage:write`, `storage:backup`, `storage:list-backups` handlers
  - [x] `statements:load`, `statements:save`, `statements:get`, `statements:update` handlers
  - [x] `systemPrompts:parse`, `systemPrompts:getContextInit`, `systemPrompts:getToolUse`, `systemPrompts:getForInstruction` handlers
- [x] Delete `src/main/ipc/contextServices.ts` if all its handlers are removed
- [x] Remove old channel bindings from `preload.ts` (the `storage`, `statements`, `systemPrompts` sections)
- [x] Clean up global type declarations: remove old `window.electronAPI` shape for deleted channels
- [x] **Success:** Only new domain-level IPC channels remain. Build passes.

### Task 20: Final verification and commit
- [x] Run `pnpm build` across full workspace
- [x] Run `pnpm --filter @context-forge/electron test:run` — all remaining tests pass
- [x] Verify success criteria from slice design:
  - [x] No renderer code imports from `@context-forge/core/node`
  - [x] All IPC channels are domain-level operations
  - [x] `StatementManagerIPC`, `SystemPromptParserIPC`, `ServiceFactory`, `ElectronStorageService`, `PersistentProjectStore`, `StorageClient`, `ProjectManager` are deleted
  - [x] Unit tests exist for all new IPC handler modules
- [x] Git add and commit cleanup
  - [x] **Success:** Clean commit, build passes, all tests pass, slice complete
