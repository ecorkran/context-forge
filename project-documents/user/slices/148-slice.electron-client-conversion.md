---
docType: slice-design
slice: electron-client-conversion
project: context-forge
parent: user/architecture/140-slices.context-forge-restructure.md
dependencies: [core-orchestration-extraction, storage-migration]
interfaces: [core-test-suite]
status: not started
dateCreated: 20260221
dateUpdated: 20260221
---

# Slice Design: Electron Client Conversion

## Overview

Rewire the Electron app to consume `@context-forge/core` directly for all domain operations, replacing the renderer's custom storage stack and IPC wrappers with a simplified main-process delegation layer. After this slice, Electron is a thin UI client over core — all business logic, storage, and context generation run through the same code paths used by the MCP server.

## Value

**Developer-facing:** Eliminates the duplicated service layer in the renderer process. Today, the renderer has its own `StatementManagerIPC`, `SystemPromptParserIPC`, `ElectronStorageService`, and `PersistentProjectStore` — all of which reimplement caching, error recovery, and data transformation that core already handles. Consolidating to core reduces the maintenance surface and ensures feature parity between the MCP server and the desktop app.

**Architectural:** After this slice, new features added to core are automatically available to both the MCP server and the Electron app. The IPC layer becomes a thin pass-through rather than a parallel implementation. This also enables the future MCP-client mode (Electron connecting to a running MCP server) by reducing the coupling between the renderer and Electron-specific services.

**User-facing:** No visible behavior change — the app continues to function identically. State changes made via MCP tools are immediately visible when the Electron app reads from the same `FileProjectStore`.

## Technical Scope

### Included

1. **Main-process domain layer** — New IPC handlers that delegate to `FileProjectStore` and `createContextPipeline` from core, exposing high-level operations (`project:list`, `project:get`, `project:create`, `project:update`, `project:delete`, `context:generate`).

2. **Renderer simplification** — Replace `PersistentProjectStore`, `ElectronStorageService`, `StorageClient`, and `ProjectManager` with thin IPC call wrappers that invoke the new high-level handlers. These wrappers have no caching, no recovery logic, no data transformation — that all lives in core now.

3. **IPC wrapper elimination** — Remove `StatementManagerIPC` and `SystemPromptParserIPC` from the renderer. Statement and prompt operations become internal to the main-process context generation pipeline (they are not directly needed by the renderer UI).

4. **Renderer ServiceFactory update** — The factory no longer creates IPC wrapper instances. Context generation moves to the main process; the renderer requests generated context via IPC.

5. **App state persistence** — Migrate `AppState` (window bounds, last active project, panel sizes) into a core-compatible storage approach or keep as a thin Electron-specific concern using `FileStorageService` directly.

6. **Testing at each phase** — Unit tests for new IPC handlers, integration tests for renderer→main→core round trips, verification of behavioral parity.

### Excluded

- MCP client integration (Electron connecting to a running MCP server) — future slice
- UI component changes (no visual changes to React components)
- New features or capabilities — this is purely a rewiring slice
- Changes to `packages/core` or `packages/mcp-server`

## Dependencies

### Prerequisites

- **Core Orchestration Extraction** (Slice 144) — Complete. Core exposes `createContextPipeline`, `ContextIntegrator`, `ContextTemplateEngine`.
- **Storage Migration** (Slice 143) — Complete. Core exposes `FileProjectStore`, `FileStorageService`, `getStoragePath()`.
- **MCP Server slices** (145-147) — Complete. Validates that core's API surface is stable and sufficient for a non-Electron consumer.

### Interfaces Required

From `@context-forge/core/node`:
- `FileProjectStore` — `getAll()`, `getById()`, `create()`, `update()`, `delete()`
- `createContextPipeline(projectPath)` — Returns `{ engine, integrator }`
- `FileStorageService` — Low-level file I/O for app state
- `ProjectPathService` — Path validation
- `StatementManager`, `SystemPromptParser` — Used internally by pipeline, not exposed to renderer

From `@context-forge/core`:
- `ProjectData`, `CreateProjectData`, `UpdateProjectData` — Types
- `EnhancedContextData`, `ContextData` — Types for context generation

## Architecture

### Component Structure

#### Current Architecture (Before)

```
Renderer Process                          Main Process
┌─────────────────────────┐              ┌──────────────────────┐
│ React UI Components     │              │ main.ts              │
│   ├─ ProjectManager     │   IPC        │   ├─ storage:read    │
│   ├─ PersistentProjStore│◄────────────►│   ├─ storage:write   │
│   ├─ ElectronStorageSvc │              │   └─ storage:backup  │
│   ├─ StorageClient      │              │                      │
│   ├─ useContextGeneration│  IPC        │ contextServices.ts   │
│   ├─ StatementMgrIPC    │◄────────────►│   ├─ statements:*    │
│   ├─ SystemPromptPrsrIPC│              │   └─ systemPrompts:* │
│   ├─ ContextIntegrator  │              │                      │
│   └─ ContextTemplateEng │              │ projectPathHandlers  │
│       (run in renderer) │              │   └─ project-path:*  │
└─────────────────────────┘              └──────────────────────┘
```

Problems: Renderer runs context generation locally using IPC proxies for file-dependent services. Multiple layers of caching, error recovery, and data transformation duplicated between renderer and core. Business logic scattered across both processes.

#### Target Architecture (After)

```
Renderer Process                          Main Process
┌─────────────────────────┐              ┌──────────────────────────┐
│ React UI Components     │              │ ipc/projectHandlers.ts   │
│   ├─ useProjects()      │   IPC        │   ├─ project:list        │
│   ├─ useContextGen()    │◄────────────►│   ├─ project:get         │
│   └─ (thin IPC callers) │              │   ├─ project:create      │
│                         │              │   ├─ project:update       │
│ No business logic       │              │   └─ project:delete       │
│ No caching              │              │                           │
│ No storage access       │              │ ipc/contextHandlers.ts    │
│ No context generation   │              │   └─ context:generate     │
│                         │              │                           │
│                         │              │ ipc/projectPathHandlers.ts│
│                         │              │   └─ project-path:*       │
│                         │              │                           │
│                         │              │ ipc/appStateHandlers.ts   │
│                         │              │   ├─ app-state:get        │
│                         │              │   └─ app-state:update     │
│                         │              │                           │
│                         │              │ ┌────────────────────┐    │
│                         │              │ │ @context-forge/core│    │
│                         │              │ │  FileProjectStore  │    │
│                         │              │ │  createCtxPipeline │    │
│                         │              │ │  FileStorageService│    │
│                         │              │ │  ProjectPathService│    │
│                         │              │ └────────────────────┘    │
└─────────────────────────┘              └──────────────────────────┘
```

### Data Flow

**Project CRUD (example: update project)**

```
Renderer                    Main Process                Core
  │                           │                          │
  │ project:update(id, data) ──►                         │
  │                           │ fileProjectStore.update() │
  │                           │─────────────────────────►│
  │                           │     (writes projects.json)│
  │                           │◄─────────────────────────│
  │   ◄── updated ProjectData │                          │
  │                           │                          │
```

**Context generation**

```
Renderer                    Main Process                Core
  │                           │                          │
  │ context:generate(projId,  │                          │
  │   overrides?)  ──────────►│                          │
  │                           │ store.getById(projId)    │
  │                           │─────────────────────────►│
  │                           │◄─ ProjectData ───────────│
  │                           │                          │
  │                           │ createContextPipeline()  │
  │                           │─────────────────────────►│
  │                           │◄─ { engine, integrator } │
  │                           │                          │
  │                           │ integrator               │
  │                           │  .generateContextFromProject()
  │                           │─────────────────────────►│
  │                           │◄─ contextString ─────────│
  │                           │                          │
  │   ◄── contextString       │                          │
```

## Technical Decisions

### IPC Channel Design

Replace the current granular, low-level IPC channels with high-level domain operations. The current channels (`storage:read`, `storage:write`, `statements:load`, `systemPrompts:parse`) expose implementation details of the storage and service layer to the renderer. The new channels expose domain operations.

**New IPC channels:**

| Channel | Args | Returns | Notes |
|---|---|---|---|
| `project:list` | — | `ProjectData[]` | Sorted by updatedAt desc |
| `project:get` | `id: string` | `ProjectData \| null` | |
| `project:create` | `data: CreateProjectData` | `ProjectData` | |
| `project:update` | `id: string, updates: UpdateProjectData` | `ProjectData` | Returns read-back |
| `project:delete` | `id: string` | `void` | |
| `context:generate` | `projectId: string, overrides?: ContextOverrides` | `string` | Full context string |
| `project-path:validate` | `projectPath: string` | `PathValidationResult` | Kept from current |
| `project-path:list-directory` | `projectPath, subdir, isMonorepo?` | `DirectoryListResult` | Kept from current |
| `project-path:pick-folder` | — | `string \| null` | Electron dialog |
| `app-state:get` | — | `AppState` | Window bounds, etc. |
| `app-state:update` | `updates: Partial<AppState>` | `void` | |

**Removed IPC channels:** `storage:read`, `storage:write`, `storage:backup`, `storage:list-backups`, `statements:load`, `statements:save`, `statements:get`, `statements:update`, `systemPrompts:parse`, `systemPrompts:getContextInit`, `systemPrompts:getToolUse`, `systemPrompts:getForInstruction`.

### ContextOverrides Type

```typescript
interface ContextOverrides {
  slice?: string;
  taskFile?: string;
  instruction?: string;
  developmentPhase?: string;
  workType?: 'start' | 'continue';
  additionalInstructions?: string;
}
```

This mirrors the override pattern used in the MCP server's `context_build` tool, ensuring consistency.

### Main-Process Singleton Management

The main process holds long-lived singleton instances:

- **`FileProjectStore`** — One instance, created at app startup. Shared across all project IPC handlers.
- **Context pipelines** — Created on demand per `context:generate` call (they are lightweight; the expensive work is file parsing which is cached internally by `SystemPromptParser`).
- **`FileStorageService`** — One instance for app state persistence.

These are initialized in `main.ts` during app startup and passed to handler registration functions.

### App State Strategy

`AppState` (window bounds, last active project, panel sizes) is Electron-specific and does not belong in `FileProjectStore`. Two options:

**Chosen approach:** Use `FileStorageService` from core to read/write `app-state.json` in the same storage directory (`~/.config/context-forge/`). This keeps all persistent data in one location and reuses core's atomic write and backup logic. The main process owns this file; the renderer reads/writes via IPC.

This is a minimal wrapper — no `AppStateStore` class needed. The IPC handlers directly call `FileStorageService.read('app-state.json')` and `FileStorageService.write('app-state.json', data)`.

### Renderer-Side API

The renderer gets a thin typed API module that replaces the current multi-layer stack:

```typescript
// services/api.ts — all renderer-side domain calls
export const projectApi = {
  list: (): Promise<ProjectData[]> => ipcRenderer.invoke('project:list'),
  get: (id: string): Promise<ProjectData | null> => ipcRenderer.invoke('project:get', id),
  create: (data: CreateProjectData): Promise<ProjectData> => ipcRenderer.invoke('project:create', data),
  update: (id: string, updates: UpdateProjectData): Promise<ProjectData> => ipcRenderer.invoke('project:update', id, updates),
  delete: (id: string): Promise<void> => ipcRenderer.invoke('project:delete', id),
};

export const contextApi = {
  generate: (projectId: string, overrides?: ContextOverrides): Promise<string> =>
    ipcRenderer.invoke('context:generate', projectId, overrides),
};

export const appStateApi = {
  get: (): Promise<AppState> => ipcRenderer.invoke('app-state:get'),
  update: (updates: Partial<AppState>): Promise<void> => ipcRenderer.invoke('app-state:update', updates),
};
```

This replaces: `StorageClient`, `ElectronStorageService`, `PersistentProjectStore`, `ProjectManager`, `StatementManagerIPC`, `SystemPromptParserIPC`, `ServiceFactory` (renderer version).

The preload script exposes these through `contextBridge` as before, but with the simplified channel set.

### Hook Refactoring

**`useContextGeneration`** — Currently creates `ContextTemplateEngine` and `ContextIntegrator` in the renderer and uses IPC wrappers for file-dependent services. After this slice, it becomes:

```typescript
// Simplified: single IPC call, no local orchestration
function useContextGeneration(projectId: string | null) {
  const [contextString, setContextString] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const regenerate = async (overrides?: ContextOverrides) => {
    if (!projectId) return;
    setIsLoading(true);
    setError(null);
    try {
      const result = await contextApi.generate(projectId, overrides);
      setContextString(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
    }
  };

  return { contextString, isLoading, error, regenerate };
}
```

**Project management hooks** — `ProjectManager` class is replaced by direct calls to `projectApi`. The React components or a custom `useProjects` hook call the API functions directly.

## Implementation Details

### Migration Plan

#### Phase 1: Main-Process Domain Handlers

**Source:** `@context-forge/core/node` (`FileProjectStore`, `createContextPipeline`, `FileStorageService`, `ProjectPathService`)
**Destination:** New IPC handler modules in `packages/electron/src/main/ipc/`

Create new handler files:
- `projectHandlers.ts` — Registers `project:*` IPC handlers, delegates to `FileProjectStore`
- `contextHandlers.ts` — Registers `context:generate`, delegates to `createContextPipeline`
- `appStateHandlers.ts` — Registers `app-state:*`, delegates to `FileStorageService`

Update `main.ts` to:
- Initialize `FileProjectStore` at startup (replacing the custom storage initialization)
- Initialize `FileStorageService` for app state
- Register new handlers alongside existing ones (coexistence during migration)

**Testing:** Unit tests for each handler module using mocked core services. Verify correct delegation and error propagation.

#### Phase 2: Preload and Renderer API

**Source:** Current `preload.ts` exposing granular channels
**Destination:** Updated `preload.ts` exposing domain-level channels + new `services/api.ts`

Update preload script to expose new channels via `contextBridge`. Create `services/api.ts` with typed wrapper functions.

**Testing:** Integration tests that invoke renderer API → IPC → main process → core, verifying end-to-end data flow for project CRUD and context generation.

#### Phase 3: Renderer Consumer Migration

**Source:** Components and hooks using `ProjectManager`, `PersistentProjectStore`, `useContextGeneration` (current complex version)
**Destination:** Same components using `projectApi`, `contextApi`, simplified `useContextGeneration`

This is the bulk of the work — updating every consumer in the renderer to use the new API. Approach:

1. Update `useContextGeneration` hook to use `contextApi.generate()`
2. Replace `ProjectManager` usage in `ContextBuilderApp.tsx` with `projectApi.*` calls
3. Replace `PersistentProjectStore` usage with `projectApi.*` and `appStateApi.*`
4. Update any component that directly imports removed services

**Testing:** After each component migration, verify the app builds and the affected workflow functions correctly. Focus on: project switching, project CRUD, context generation, app state persistence (window bounds restored on restart).

#### Phase 4: Cleanup

Remove obsolete files:
- `src/services/storage/StorageClient.ts`
- `src/services/storage/ElectronStorageService.ts`
- `src/services/storage/PersistentProjectStore.ts`
- `src/services/storage/StorageService.ts` (legacy)
- `src/services/project/ProjectManager.ts`
- `src/services/context/StatementManagerIPC.ts`
- `src/services/context/SystemPromptParserIPC.ts`
- `src/services/context/ServiceFactory.ts`
- `src/services/context/index.ts` (replace with re-exports from core if needed)

Remove old IPC handlers from `main.ts` and `contextServices.ts`:
- `storage:*` channels
- `statements:*` channels
- `systemPrompts:*` channels

Update preload to remove old channel bindings.

**Testing:** Full build verification. Run existing test suite — tests that reference removed modules must be updated or removed. Verify no dead imports remain.

### Files Changed Summary

| Action | File | Description |
|--------|------|-------------|
| **Create** | `src/main/ipc/projectHandlers.ts` | Project CRUD IPC handlers |
| **Create** | `src/main/ipc/contextHandlers.ts` | Context generation IPC handler |
| **Create** | `src/main/ipc/appStateHandlers.ts` | App state IPC handlers |
| **Create** | `src/services/api.ts` | Thin renderer-side API module |
| **Create** | `src/services/types.ts` | `ContextOverrides`, `AppState` (if not already typed) |
| **Modify** | `src/main/main.ts` | Initialize core singletons, register new handlers |
| **Modify** | `src/preload/preload.ts` | Expose new channels, remove old ones |
| **Modify** | `src/hooks/useContextGeneration.ts` | Simplify to single IPC call |
| **Modify** | `src/components/ContextBuilderApp.tsx` | Use `projectApi` instead of `ProjectManager` |
| **Modify** | Various components | Update imports from removed services |
| **Delete** | `src/services/storage/StorageClient.ts` | Replaced by `projectApi` |
| **Delete** | `src/services/storage/ElectronStorageService.ts` | Replaced by core `FileProjectStore` |
| **Delete** | `src/services/storage/PersistentProjectStore.ts` | Replaced by `projectApi` |
| **Delete** | `src/services/storage/StorageService.ts` | Legacy, unused |
| **Delete** | `src/services/project/ProjectManager.ts` | Replaced by `projectApi` |
| **Delete** | `src/services/context/StatementManagerIPC.ts` | No longer needed |
| **Delete** | `src/services/context/SystemPromptParserIPC.ts` | No longer needed |
| **Delete** | `src/services/context/ServiceFactory.ts` | No longer needed |
| **Delete** | `src/main/ipc/contextServices.ts` | Replaced by new handler modules |

### Behavioral Parity Verification

The following behaviors must be preserved:

1. **Project list** — Returns all projects sorted by most recently updated
2. **Project create** — Generates unique ID, sets timestamps, persists immediately
3. **Project update** — Partial update, sets `updatedAt`, persists immediately
4. **Project delete** — Removes project, persists immediately
5. **Context generation** — Produces identical output to current renderer-side generation for the same project and overrides
6. **App state** — Window bounds, last active project, panel sizes survive app restart
7. **Backup behavior** — Automatic backup on write (handled by core's `FileProjectStore`)
8. **Error recovery** — Corrupted `projects.json` falls back to backup (handled by core)
9. **Flush on quit** — The `app:flush-save` mechanism must be evaluated; if `FileProjectStore` writes synchronously (atomic write), it may no longer be needed

## Testing Strategy

Testing is integrated into each phase rather than deferred.

### Phase 1 Tests: Main-Process Handlers

- **Unit tests** for `projectHandlers.ts`: Mock `FileProjectStore`, verify each handler calls the correct store method with correct args and returns expected data. Test error cases (project not found, invalid data).
- **Unit tests** for `contextHandlers.ts`: Mock `createContextPipeline` and `FileProjectStore`, verify pipeline creation and context generation delegation. Test with and without overrides.
- **Unit tests** for `appStateHandlers.ts`: Mock `FileStorageService`, verify read/write delegation.

### Phase 2 Tests: Integration

- **Round-trip tests**: Using Electron's test utilities or a lightweight IPC mock, test the full path: renderer API call → preload → IPC → handler → core mock → response. Verify serialization/deserialization of `ProjectData` across the IPC boundary.

### Phase 3 Tests: Behavioral Parity

- **Snapshot comparison**: Generate context for a known project using the old renderer pipeline and the new main-process pipeline. Output must be identical.
- **Component tests**: Verify `useContextGeneration` hook produces correct state transitions (loading → success, loading → error).
- **App state persistence**: Write app state, restart app (or reload), verify state restored.

### Phase 4 Tests: Final Verification

- **Full build passes** (`pnpm build`)
- **All existing tests pass** (updated for new module structure)
- **No dead imports** (TypeScript compilation catches this)
- **Manual smoke test**: Create project → configure → generate context → copy → switch project → delete project → restart app (state preserved)

## Integration Points

### Provides to Other Slices

- **Core Test Suite (Slice 150)** — This slice validates that core's API is sufficient for a real client. Any gaps discovered here inform the core test suite's coverage priorities.
- **Future MCP Client Mode** — The simplified IPC architecture makes it straightforward to swap the main-process core calls with MCP client calls (the renderer API stays identical, only the handler implementation changes).

### Consumes from Other Slices

- **Core package** — All domain operations delegate to `@context-forge/core` and `@context-forge/core/node`. No changes to core are expected; if gaps are found, they will be raised as issues.

## Success Criteria

### Functional Requirements

- [ ] All project CRUD operations work identically from the UI perspective
- [ ] Context generation produces identical output for the same inputs
- [ ] App state (window bounds, last active project, panel sizes) persists across restarts
- [ ] Project path validation and directory listing work correctly
- [ ] File picker dialog continues to work
- [ ] State changes made via MCP tools are visible when the Electron app reloads projects

### Technical Requirements

- [ ] `StatementManagerIPC`, `SystemPromptParserIPC`, `ServiceFactory` (renderer), `ElectronStorageService`, `PersistentProjectStore`, `StorageClient`, `ProjectManager` are deleted
- [ ] No renderer code imports from `@context-forge/core/node` (Node.js APIs stay in main process)
- [ ] All IPC channels are domain-level operations, not storage/service primitives
- [ ] Unit tests exist for all new IPC handler modules
- [ ] Integration test covers at least one full round trip (renderer → main → core → response)
- [ ] `pnpm build` succeeds across the workspace
- [ ] Context parity test: output from new pipeline matches output from old pipeline for a reference project

## Risk Assessment

### IPC Serialization

Electron's IPC serializes data using the structured clone algorithm. `ProjectData` objects are plain data (strings, numbers, booleans, arrays of strings) and serialize cleanly. However, if any field contains `Date` objects, functions, or class instances, they will not survive serialization. Core's `FileProjectStore` returns plain objects, so this should not be an issue — but it must be verified during Phase 2 testing.

**Mitigation:** Phase 2 integration tests explicitly verify that data round-trips through IPC without loss.

### Flush-on-Quit Behavior

The current app emits `app:flush-save` to ensure pending writes complete before the app closes. With `FileProjectStore` performing atomic synchronous-style writes (write to temp file, rename), this mechanism may be unnecessary. However, if any write is in-flight during quit, data could be lost.

**Mitigation:** Evaluate during Phase 1. If `FileProjectStore.update()` is fully awaited in the IPC handler, the response confirms the write completed. The renderer should not have any pending async writes since it no longer writes directly.

## Implementation Notes

### Development Approach

Phases 1-4 should be implemented sequentially. Each phase leaves the app in a working state:

- **After Phase 1:** Old and new handlers coexist. App still works via old channels.
- **After Phase 2:** New API module exists but is not yet consumed. Old path still works.
- **After Phase 3:** App uses new channels exclusively. Old channels are unused but still registered.
- **After Phase 4:** Old channels and dead code removed. Clean state.

Commit checkpoints at end of each phase.

### Effort Estimate

Relative effort: 3/5 (as specified in slice plan). The majority of work is in Phase 3 (consumer migration) — updating every component that touches project data or context generation. The core integration (Phases 1-2) is straightforward since the MCP server has already validated core's API surface.
