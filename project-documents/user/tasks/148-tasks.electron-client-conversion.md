---
slice: electron-client-conversion
project: context-forge
lld: user/slices/148-slice.electron-client-conversion.md
dependencies: [core-orchestration-extraction, storage-migration]
projectState: All prerequisite slices (140-147) complete. Core package exports FileProjectStore, createContextPipeline, FileStorageService, ProjectPathService. MCP server operational with 8 tools. Electron app still uses internal IPC wrappers and renderer-side service stack.
dateCreated: 20260221
dateUpdated: 20260221
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
- [ ] Create `packages/electron/src/main/ipc/projectHandlers.ts`
  - [ ] Export `registerProjectHandlers(store: FileProjectStore)` function
  - [ ] Register IPC handlers for: `project:list`, `project:get`, `project:create`, `project:update`, `project:delete`
  - [ ] `project:list` calls `store.getAll()`, sorts by `updatedAt` descending
  - [ ] `project:get` calls `store.getById(id)`, returns `ProjectData | null`
  - [ ] `project:create` calls `store.create(data)`, returns created `ProjectData`
  - [ ] `project:update` calls `store.update(id, updates)` then `store.getById(id)` to return updated data
  - [ ] `project:delete` calls `store.delete(id)`
  - [ ] All handlers wrap calls in try/catch — rethrow errors with descriptive messages for IPC error propagation
  - [ ] **Success:** File compiles, exports the registration function, all 5 handlers use `ipcMain.handle()`

### Task 2: Unit tests for `projectHandlers.ts`
- [ ] Create `packages/electron/tests/unit/main/ipc/projectHandlers.test.ts`
  - [ ] Mock `FileProjectStore` with vi.fn() for each method
  - [ ] Test `project:list` calls `getAll()` and returns sorted array
  - [ ] Test `project:get` returns project when found, null when not
  - [ ] Test `project:create` passes `CreateProjectData` to `create()` and returns result
  - [ ] Test `project:update` calls `update()` then `getById()` for read-back
  - [ ] Test `project:delete` calls `delete()` with correct id
  - [ ] Test error propagation: handler rethrows when store method throws
  - [ ] **Success:** All tests pass via `pnpm --filter @context-forge/electron test:run`

### Task 3: Create `contextHandlers.ts` — context generation IPC handler
- [ ] Create `packages/electron/src/main/ipc/contextHandlers.ts`
  - [ ] Define `ContextOverrides` interface (or import from a shared types location — see slice design for shape)
  - [ ] Export `registerContextHandlers(store: FileProjectStore)` function
  - [ ] Register `context:generate` handler: takes `(projectId: string, overrides?: ContextOverrides)`
  - [ ] Handler flow: `store.getById(projectId)` → validate project exists → apply overrides to project copy → `createContextPipeline(project.projectPath)` → `integrator.generateContextFromProject(modifiedProject)` → return context string
  - [ ] Override application: merge override fields into a shallow copy of ProjectData before passing to pipeline (same pattern as MCP server's `context_build`)
  - [ ] Error case: project not found → throw descriptive error
  - [ ] Error case: project has no `projectPath` → throw descriptive error
  - [ ] **Success:** File compiles, exports registration function, handler delegates to `createContextPipeline`

### Task 4: Unit tests for `contextHandlers.ts`
- [ ] Create `packages/electron/tests/unit/main/ipc/contextHandlers.test.ts`
  - [ ] Mock `FileProjectStore` and `createContextPipeline` (from `@context-forge/core/node`)
  - [ ] Test successful generation: returns context string from integrator
  - [ ] Test with overrides: verify override fields are applied to project before passing to pipeline
  - [ ] Test project not found: throws error with descriptive message
  - [ ] Test project missing projectPath: throws error
  - [ ] **Success:** All tests pass

### Task 5: Create `appStateHandlers.ts` — app state IPC handlers
- [ ] Create `packages/electron/src/main/ipc/appStateHandlers.ts`
  - [ ] Export `registerAppStateHandlers(storageService: FileStorageService)` function
  - [ ] Register `app-state:get` handler: reads `app-state.json` via `storageService.read()`, parses JSON, returns `AppState` object (return default empty state if file doesn't exist)
  - [ ] Register `app-state:update` handler: reads current state, merges `Partial<AppState>` updates, writes back via `storageService.write()`
  - [ ] Define `AppState` interface (reuse from existing `src/services/storage/types/AppState.ts` — move type to a shared location or define inline)
  - [ ] **Success:** File compiles, both handlers registered

### Task 6: Unit tests for `appStateHandlers.ts`
- [ ] Create `packages/electron/tests/unit/main/ipc/appStateHandlers.test.ts`
  - [ ] Mock `FileStorageService` read/write methods
  - [ ] Test `app-state:get` returns parsed state from file
  - [ ] Test `app-state:get` returns default state when file doesn't exist
  - [ ] Test `app-state:update` merges partial updates with existing state
  - [ ] **Success:** All tests pass

### Task 7: Wire handlers into `main.ts` and verify build
- [ ] Modify `packages/electron/src/main/main.ts`
  - [ ] Import `FileProjectStore`, `FileStorageService`, `getStoragePath` from `@context-forge/core/node`
  - [ ] Initialize `FileProjectStore` instance at app startup (using `getStoragePath()`)
  - [ ] Initialize `FileStorageService` instance for app state
  - [ ] Import and call `registerProjectHandlers(store)`, `registerContextHandlers(store)`, `registerAppStateHandlers(storageService)`
  - [ ] Keep existing old handlers registered (coexistence — both old and new channels work)
  - [ ] **Success:** `pnpm build` succeeds across workspace. App launches and old functionality still works. New handlers are registered (verifiable via logs or a simple test).

### Task 8: Commit Phase 1
- [ ] Git add and commit all Phase 1 files (new handlers, tests, main.ts changes)
  - [ ] **Success:** Clean commit with all Phase 1 work, build passes

---

## Phase 2: Preload and Renderer API

### Task 9: Update preload script with new IPC channels
- [ ] Modify `packages/electron/src/preload/preload.ts`
  - [ ] Add new channel bindings via `contextBridge.exposeInMainWorld`:
    - `project: { list, get, create, update, delete }` — each calls `ipcRenderer.invoke('project:...')`
    - `context: { generate }` — calls `ipcRenderer.invoke('context:generate', ...)`
    - `appState: { get, update }` — calls `ipcRenderer.invoke('app-state:...')`
  - [ ] Keep existing bindings intact for now (old and new coexist)
  - [ ] **Success:** Preload exposes both old and new API surfaces. Build passes.

### Task 10: Create renderer-side API module (`services/api.ts`)
- [ ] Create `packages/electron/src/services/api.ts`
  - [ ] Define typed API objects: `projectApi`, `contextApi`, `appStateApi`
  - [ ] Each method calls through `window.electronAPI.project.*`, `window.electronAPI.context.*`, `window.electronAPI.appState.*`
  - [ ] Import types from `@context-forge/core` (`ProjectData`, `CreateProjectData`, `UpdateProjectData`)
  - [ ] Define `ContextOverrides` type (import or re-export from contextHandlers if shared, or define locally)
  - [ ] Update global type declarations for `window.electronAPI` to include new API surface (likely in `StorageClient.ts` or a dedicated `.d.ts` — check current location)
  - [ ] **Success:** `api.ts` compiles with full type safety. No runtime usage yet.

### Task 11: Commit Phase 2
- [ ] Git add and commit Phase 2 files (preload changes, api.ts)
  - [ ] **Success:** Clean commit, build passes

---

## Phase 3: Consumer Migration

### Task 12: Migrate `useContextGeneration` hook
- [ ] Modify `packages/electron/src/hooks/useContextGeneration.ts`
  - [ ] Replace import of `createSystemPromptParser`, `createStatementManager` from `ServiceFactory` with import of `contextApi` from `services/api`
  - [ ] Remove imports of `ContextTemplateEngine`, `ContextIntegrator`, `SectionBuilder` from core (no longer used in renderer)
  - [ ] Simplify hook: single `contextApi.generate(projectId, overrides)` call replaces local pipeline orchestration
  - [ ] Maintain same return interface: `{ contextString, isLoading, error, regenerate }`
  - [ ] Hook signature changes from accepting project data to accepting `projectId: string | null`
  - [ ] **Success:** Hook compiles, same return type, uses IPC instead of local orchestration

### Task 13: Test `useContextGeneration` hook
- [ ] Create or update test at `packages/electron/tests/unit/hooks/useContextGeneration.test.ts`
  - [ ] Mock `window.electronAPI.context.generate` via vi.fn()
  - [ ] Test loading state transitions: idle → loading → success
  - [ ] Test error state: mock rejects → error string populated
  - [ ] Test regenerate with overrides: verify overrides passed through
  - [ ] Test null projectId: regenerate is no-op
  - [ ] **Success:** All tests pass

### Task 14: Migrate `ContextBuilderApp.tsx` — replace ProjectManager and PersistentProjectStore
- [ ] Modify `packages/electron/src/components/ContextBuilderApp.tsx`
  - [ ] Replace `PersistentProjectStore` import with `projectApi` and `appStateApi` from `services/api`
  - [ ] Replace `ProjectManager` import with direct `projectApi` calls
  - [ ] Update project loading: `projectApi.list()` instead of `projectManager.loadAllProjects()`
  - [ ] Update project creation: `projectApi.create(data)` instead of `projectManager.createNewProject(data)`
  - [ ] Update project switching: `projectApi.get(id)` + `appStateApi.update({ lastActiveProjectId: id })` instead of `projectManager.switchToProject(id)`
  - [ ] Update project deletion: `projectApi.delete(id)` instead of `projectManager.deleteProject(id)`
  - [ ] Update project updates/auto-save: `projectApi.update(id, changes)` instead of `persistentStore.saveProject(project)`
  - [ ] Update app state: `appStateApi.get()` / `appStateApi.update()` instead of `persistentStore.getAppState()` / `persistentStore.updateAppState()`
  - [ ] Update `useContextGeneration` call to pass `projectId` instead of full project data
  - [ ] Evaluate `app:flush-save` handler: if all writes are `await`ed IPC calls, flush may be unnecessary. Remove or simplify.
  - [ ] **Success:** Component compiles, all project workflows function via new API

### Task 15: Verify build and run behavioral parity check
- [ ] Run `pnpm build` — must succeed
- [ ] Run all existing tests — note any failures from updated interfaces
  - [ ] Fix test failures caused by interface changes in ContextBuilderApp or useContextGeneration
  - [ ] **Success:** Build succeeds, all non-deleted-module tests pass

### Task 16: Commit Phase 3
- [ ] Git add and commit Phase 3 files
  - [ ] **Success:** Clean commit, build passes

---

## Phase 4: Cleanup

### Task 17: Delete obsolete renderer service files
- [ ] Delete the following files from `packages/electron/src/`:
  - [ ] `services/storage/StorageClient.ts`
  - [ ] `services/storage/ElectronStorageService.ts`
  - [ ] `services/storage/PersistentProjectStore.ts`
  - [ ] `services/storage/StorageService.ts`
  - [ ] `services/project/ProjectManager.ts`
  - [ ] `services/context/StatementManagerIPC.ts`
  - [ ] `services/context/SystemPromptParserIPC.ts`
  - [ ] `services/context/ServiceFactory.ts`
- [ ] Update or replace `services/context/index.ts` — if any re-exports from core are still needed by other renderer files, keep only those. Otherwise delete.
- [ ] Verify no remaining imports reference deleted files (TypeScript build will catch this)
- [ ] **Success:** Files deleted, `pnpm build` succeeds

### Task 18: Delete obsolete test files
- [ ] Delete test files for removed modules from `packages/electron/tests/`:
  - [ ] `unit/services/storage/StorageClient.test.ts`
  - [ ] `unit/services/storage/ElectronStorageService.test.ts`
  - [ ] `unit/services/storage/integration.test.ts` (if it tests old storage stack)
  - [ ] `unit/services/project/ProjectManager.test.ts`
  - [ ] `unit/services/context/IPCIntegration.test.ts` (if it tests old IPC wrappers)
- [ ] Review remaining test files: `ContextGenerator.test.ts`, `ContextIntegrator.test.ts`, `TemplateProcessor.test.ts` — these test core services and may still be valid if they import from `@context-forge/core`. Keep if passing, update imports if needed.
- [ ] **Success:** No test references to deleted modules, `pnpm test:run` passes for remaining tests

### Task 19: Remove old IPC handlers and preload bindings
- [ ] Remove old IPC handlers from `main.ts` or `contextServices.ts`:
  - [ ] `storage:read`, `storage:write`, `storage:backup`, `storage:list-backups` handlers
  - [ ] `statements:load`, `statements:save`, `statements:get`, `statements:update` handlers
  - [ ] `systemPrompts:parse`, `systemPrompts:getContextInit`, `systemPrompts:getToolUse`, `systemPrompts:getForInstruction` handlers
- [ ] Delete `src/main/ipc/contextServices.ts` if all its handlers are removed
- [ ] Remove old channel bindings from `preload.ts` (the `storage`, `statements`, `systemPrompts` sections)
- [ ] Clean up global type declarations: remove old `window.electronAPI` shape for deleted channels
- [ ] **Success:** Only new domain-level IPC channels remain. Build passes.

### Task 20: Final verification and commit
- [ ] Run `pnpm build` across full workspace
- [ ] Run `pnpm --filter @context-forge/electron test:run` — all remaining tests pass
- [ ] Verify success criteria from slice design:
  - [ ] No renderer code imports from `@context-forge/core/node`
  - [ ] All IPC channels are domain-level operations
  - [ ] `StatementManagerIPC`, `SystemPromptParserIPC`, `ServiceFactory`, `ElectronStorageService`, `PersistentProjectStore`, `StorageClient`, `ProjectManager` are deleted
  - [ ] Unit tests exist for all new IPC handler modules
- [ ] Git add and commit cleanup
  - [ ] **Success:** Clean commit, build passes, all tests pass, slice complete
