---
docType: slice-design
slice: storage-migration
project: context-forge
parent: user/architecture/140-slices.context-forge-restructure.md
dependencies: [core-types-extraction]
interfaces: [mcp-server-project-tools, electron-client-conversion, core-test-suite]
status: not started
dateCreated: 20260218
dateUpdated: 20260218
---

# Slice Design: Storage Migration

## Overview

Replace Electron-specific storage (`StorageService`, `ElectronStorageService`, `ElectronProjectStore`, `PersistentProjectStore`, `StorageClient`) with a filesystem-based storage layer in `packages/core`. The new layer uses `~/.config/context-forge/` (via `env-paths` for cross-platform support) and provides project CRUD, backup/recovery, and app-state management without any Electron dependency.

After this slice, the MCP server and any Node.js consumer can read and write project data — the same data the Electron UI uses — through `@context-forge/core/node`. Electron's renderer continues to use IPC for storage operations, but the main process handlers delegate to core's storage layer rather than implementing their own filesystem logic.

## Value

- **Unlocks MCP Server — Project Tools (slice 146)**: The MCP server needs to list, read, and update projects. This slice provides the `IProjectStore` interface and `FileProjectStore` implementation it will use.
- **Shared state**: Project data is accessible to any process — MCP server, Electron, CLI, tests — at the same filesystem location. Changes from one client are immediately visible to others (subject to read-on-demand, no in-memory caching across processes).
- **Simplifies Electron**: The main process storage IPC handlers (`storage:read`, `storage:write`, etc.) delegate to core instead of reimplementing filesystem logic. The renderer-side `ElectronStorageService`, `ElectronProjectStore`, `PersistentProjectStore`, and `StorageClient` can eventually be eliminated or thinned.
- **Testable without Electron**: Storage layer has unit tests that run against temp directories — no IPC, no Electron process needed.

## Technical Scope

### Included

- Define `IProjectStore` interface in `packages/core/src/storage/interfaces.ts`
- Implement `FileProjectStore` in `packages/core/src/storage/FileProjectStore.ts` — filesystem-backed project CRUD with atomic writes and backup
- Implement `FileStorageService` in `packages/core/src/storage/FileStorageService.ts` — low-level file read/write/backup with atomic operations
- Implement backup utilities in `packages/core/src/storage/backupService.ts` — versioned backups, pruning, write guard (extracted from Electron)
- Resolve storage path via `env-paths` for cross-platform `~/.config/context-forge/` (macOS: `~/Library/Preferences/context-forge/`, Windows: `%APPDATA%/context-forge/`, Linux: `~/.config/context-forge/`)
- One-time data migration from Electron's `app.getPath('userData')/context-forge/` to `env-paths` location (if they differ)
- Update Electron main process IPC handlers to delegate to `FileStorageService` / `FileProjectStore` from core
- Export storage types and implementations from `@context-forge/core/node`
- Pipeline integration test: verify the full context generation pipeline runs end-to-end from a `FileProjectStore` project without Electron

### Excluded

- **Renderer-side storage classes** (`ElectronStorageService`, `ElectronProjectStore`, `PersistentProjectStore`, `StorageClient`) — these stay in Electron for now. The renderer still uses IPC. They will be simplified/eliminated in the Electron Client Conversion slice (149).
- **App state migration** — `AppState` / `WindowBounds` / `panelSizes` are Electron-UI-specific concerns. They remain in Electron's storage scope. Core does not manage UI state.
- **Settings management** — Future work. Not needed for MCP server project tools.
- **MCP server implementation** — That's slice 146. This slice provides the storage layer it will consume.

## Dependencies

### Prerequisites

- **Core Types Extraction (slice 141)**: Complete. `ProjectData`, `CreateProjectData`, `UpdateProjectData` are in `@context-forge/core`.
- **Core Orchestration Extraction (slice 143)**: Complete. `createContextPipeline()` is available in `@context-forge/core/node`. Needed for the pipeline integration test.

### External Packages

- **`env-paths`**: Cross-platform XDG-compliant config/data/cache directories. Pure JS, zero dependencies, widely used (chalk, npm, etc.). Version `^3.0.0` (ESM).

## Architecture

### Component Structure

```
packages/core/src/
├── storage/
│   ├── index.ts                  # Barrel: exports interfaces + FileProjectStore + FileStorageService
│   ├── interfaces.ts             # IProjectStore, IStorageService, StorageResult types
│   ├── FileStorageService.ts     # Low-level: atomic read/write/backup for arbitrary JSON files
│   ├── FileProjectStore.ts       # High-level: project CRUD using FileStorageService
│   ├── backupService.ts          # Versioned backup creation, pruning, write guard
│   ├── storagePaths.ts           # getStoragePath() via env-paths
│   └── __tests__/
│       ├── FileStorageService.test.ts
│       ├── FileProjectStore.test.ts
│       └── backupService.test.ts
├── services/                     # Existing (unchanged)
├── types/                        # Existing (unchanged)
├── index.ts                      # Updated: re-exports storage interfaces (browser-safe types only)
└── node.ts                       # Updated: exports FileProjectStore, FileStorageService, getStoragePath
```

### Data Flow

```
MCP Server / CLI / Tests                      Electron App
        │                                          │
        │ import from                              │ IPC call
        │ @context-forge/core/node                 │ storage:read/write
        │                                          │
        ▼                                          ▼
   FileProjectStore ◄──────────────── main.ts IPC handlers
        │                              (delegate to core)
        │ uses
        ▼
   FileStorageService
        │
        │ atomic read/write
        ▼
   ~/.config/context-forge/projects.json
```

### Storage Location

```
~/.config/context-forge/              # env-paths('context-forge').config
├── projects.json                     # ProjectData[] — primary data
├── projects.json.backup              # Single backup, overwritten each write
├── projects.json.{timestamp}.backup  # Versioned backups (max 10)
└── app-state.json                    # AppState (Electron-only for now)
```

**Platform resolution** (via `env-paths('context-forge', { suffix: '' }).config`):
- **macOS**: `~/Library/Preferences/context-forge/`
- **Linux**: `~/.config/context-forge/` (XDG_CONFIG_HOME)
- **Windows**: `%APPDATA%/context-forge/`

**Note on macOS path change**: Electron's legacy location is `~/Library/Application Support/context-forge/context-forge/` (Electron's `app.getPath('userData')` + `/context-forge` subdirectory). The new location is `~/Library/Preferences/context-forge/`. These are completely separate directories. The migration strategy (below) handles the one-time data copy.

## Technical Decisions

### Interface Design

**Decision**: Define an `IProjectStore` interface that both `FileProjectStore` (core) and Electron's existing stores can satisfy structurally.

```typescript
export interface IProjectStore {
  getAll(): Promise<ProjectData[]>;
  getById(id: string): Promise<ProjectData | undefined>;
  create(data: CreateProjectData): Promise<ProjectData>;
  update(id: string, updates: UpdateProjectData): Promise<void>;
  delete(id: string): Promise<void>;
}
```

**Rationale**: The MCP server only needs CRUD operations. Backup management, app state, and migration are separate concerns. This interface is minimal, testable, and mockable.

### Storage Service Interface

**Decision**: Define a low-level `IStorageService` for reading/writing arbitrary JSON files with backup support.

```typescript
export interface StorageReadResult {
  data: string;
  recovered?: boolean;
  message?: string;
}

export interface IStorageService {
  read(filename: string): Promise<StorageReadResult>;
  write(filename: string, data: string): Promise<void>;
  createBackup(filename: string): Promise<void>;
  exists(filename: string): Promise<boolean>;
}
```

**Rationale**: Separates file I/O concerns from project business logic. `FileProjectStore` composes `FileStorageService`, keeping both focused. This also enables Electron's main process to use `FileStorageService` directly for non-project files (like `app-state.json`), reducing duplication.

### Storage Path Strategy

**Decision**: Use `env-paths('context-forge').config` as the canonical storage location. Allow override via `CONTEXT_FORGE_DATA_DIR` environment variable for testing and custom deployments.

```typescript
import envPaths from 'env-paths';

const paths = envPaths('context-forge', { suffix: '' });

export function getStoragePath(): string {
  return process.env.CONTEXT_FORGE_DATA_DIR || paths.config;
}
```

**Rationale**: `env-paths` follows XDG conventions on Linux, uses appropriate OS directories elsewhere, and is the package recommended in the architecture document. The `suffix` option is set to `''` to avoid the `-nodejs` suffix that `env-paths` adds by default. The environment variable override supports testing (temp directories) and custom deployments.

### Data Migration Strategy

**Concrete paths (macOS — current platform)**:

| File | Legacy (Electron) | New (env-paths `.config`) |
|---|---|---|
| Project data | `~/Library/Application Support/context-forge/context-forge/projects.json` | `~/Library/Preferences/context-forge/projects.json` |
| Single backup | `~/Library/Application Support/context-forge/context-forge/projects.json.backup` | `~/Library/Preferences/context-forge/projects.json.backup` |
| App state | `~/Library/Application Support/context-forge/context-forge/app-state.json` | Stays in Electron scope (not migrated) |
| Versioned backups | `~/Library/Application Support/context-forge/context-forge/projects.json.*.backup` | **Manual copy by Project Manager** (see below) |

**Automated migration**: On first read, `FileProjectStore` checks whether data exists at the `env-paths` location. If not, it checks the Electron legacy location. If legacy data is found, it copies `projects.json` and `projects.json.backup` to the new location (copy, not move — Electron may still reference the old location until it's updated).

```typescript
export async function migrateFromLegacyLocation(
  newPath: string,
  legacyPath: string
): Promise<boolean> {
  // Only migrate if new location has no data and legacy location does
  const newFile = path.join(newPath, 'projects.json');
  const legacyFile = path.join(legacyPath, 'projects.json');

  if (existsSync(newFile) || !existsSync(legacyFile)) {
    return false; // Nothing to migrate
  }

  await mkdir(newPath, { recursive: true });
  await copyFile(legacyFile, newFile);
  // Also copy single backup if it exists
  const legacyBackup = path.join(legacyPath, 'projects.json.backup');
  if (existsSync(legacyBackup)) {
    await copyFile(legacyBackup, path.join(newPath, 'projects.json.backup'));
  }
  return true;
}
```

**Manual step — versioned backups**: The ~10 versioned backup files (`projects.json.{timestamp}.backup`) are not migrated automatically. Project Manager will copy these manually once after the first successful automated migration:

```bash
# Run after slice is implemented and first launch confirms migration worked
cp ~/Library/Application\ Support/context-forge/context-forge/projects.json.*.backup \
   ~/Library/Preferences/context-forge/
```

**When automated migration runs**: `FileProjectStore.getAll()` calls `ensureInitialized()` on first access, which triggers migration check. This is lazy — no startup cost if data already exists in the new location.

**Legacy path detection**: The legacy path is the well-known macOS location `~/Library/Application Support/context-forge/context-forge/`. This is derived from Electron's `app.getPath('userData')` (`~/Library/Application Support/context-forge/`) plus the `context-forge` subdirectory added by `getStoragePath()` in `main.ts`. For non-Electron contexts on other platforms, `env-paths` typically resolves close to Electron's default, so migration may be a no-op.

### Backup Service Extraction

**Decision**: Extract `backupService.ts` from Electron's `packages/electron/src/main/services/storage/` into core's `packages/core/src/storage/backupService.ts` with minimal changes.

**Rationale**: The backup service is already well-structured with injectable `BackupFsDeps`. It uses only `fs` and `path` — no Electron dependency. The function signatures and behavior are preserved.

**Changes**:
- Import paths updated to core-relative
- The `BackupFsDeps` interface, `createVersionedBackup`, `pruneOldBackups`, `checkWriteGuard` functions move as-is
- `MAX_VERSIONED_BACKUPS` constant moves as-is

### ID Generation

**Decision**: Preserve the existing `project_{timestamp}_{random}` format.

```typescript
function generateProjectId(): string {
  return `project_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
}
```

**Rationale**: Existing data uses this format. No reason to change. IDs are opaque strings — consumers don't parse them.

### Project Data Migration (Schema)

**Decision**: `FileProjectStore.getAll()` applies the same field-migration logic currently in `ElectronProjectStore.migrateProjects()` — ensuring all projects have `taskFile`, `instruction`, `isMonorepo`, and `customData` with sensible defaults.

**Rationale**: Data written by older versions of the Electron app may lack newer fields. The migration logic is trivial (~15 lines) and already proven. Moving it to core ensures the MCP server doesn't encounter incomplete data.

### Concurrency

**Decision**: No in-process locking. Each operation follows read-modify-write with atomic rename. No long-lived in-memory caches of project lists.

**Rationale**: The MCP server and Electron won't run concurrent writes in practice — the MCP server handles one tool call at a time (stdio transport is sequential), and Electron writes are user-initiated. Atomic file writes prevent corruption from process crashes. If concurrent access becomes a problem later, file-level locking (e.g., `proper-lockfile`) can be added to `FileStorageService` without changing the `IProjectStore` interface.

## Implementation Details

### Migration Plan

**Source → Destination mapping**:

| Component | Source (Electron) | Destination (Core) |
|---|---|---|
| Backup service | `packages/electron/src/main/services/storage/backupService.ts` | `packages/core/src/storage/backupService.ts` |
| Low-level storage | `packages/electron/src/services/storage/StorageService.ts` | `packages/core/src/storage/FileStorageService.ts` (rewritten — removes `app.getPath()` dependency) |
| Project CRUD | `packages/electron/src/services/storage/ProjectStore.ts` | `packages/core/src/storage/FileProjectStore.ts` (rewritten — uses core types, env-paths) |
| Storage path | `app.getPath('userData')` in `main.ts` | `env-paths('context-forge').config` in `storagePaths.ts` |

**What stays in Electron**:

| Component | Reason |
|---|---|
| `ElectronStorageService.ts` | Renderer-side IPC wrapper — stays until Electron Client Conversion |
| `ElectronProjectStore.ts` | Renderer-side project store via IPC — stays until Electron Client Conversion |
| `PersistentProjectStore.ts` | Manages AppState (UI concern) + project ops via IPC — stays until Electron Client Conversion |
| `StorageClient.ts` | `window.electronAPI` bridge — stays until Electron Client Conversion |
| `SimpleProjectStore.ts` | In-memory test helper — stays in Electron |
| `types/AppState.ts` | UI-specific types — stays in Electron |

**Electron main.ts update**: The IPC handlers (`storage:read`, `storage:write`, `storage:backup`, `storage:list-backups`) are updated to delegate to `FileStorageService` from core instead of implementing filesystem logic inline. This eliminates ~140 lines of duplicated filesystem code from `main.ts`. The `getStoragePath()` function in `main.ts` is replaced by `getStoragePath()` from core.

**Consumers that must be updated**:

| Consumer | Current | After |
|---|---|---|
| `main.ts` IPC handlers | Inline fs logic | Delegate to `FileStorageService` |
| `main.ts` `getStoragePath()` | `app.getPath('userData')` | `getStoragePath()` from core |
| `main.ts` versioned backup on exit | Calls `backupService` from local | Calls `backupService` from core |
| `ProjectManager.ts` | No change (uses `PersistentProjectStore`) | No change needed for this slice |

### Pipeline Integration Test

After this slice, the complete context generation pipeline can run end-to-end without Electron. The integration test validates this:

```typescript
// packages/core/src/__tests__/pipeline-integration.test.ts

import { FileProjectStore } from '../storage/FileProjectStore.js';
import { createContextPipeline } from '../services/CoreServiceFactory.js';
import type { ProjectData, CreateProjectData } from '../types/project.js';

describe('Context Pipeline Integration (no Electron)', () => {
  let store: FileProjectStore;
  let tempDir: string;

  beforeEach(async () => {
    // Use a temp directory for storage
    tempDir = await mkdtemp(join(tmpdir(), 'cf-test-'));
    process.env.CONTEXT_FORGE_DATA_DIR = tempDir;
    store = new FileProjectStore();
  });

  afterEach(async () => {
    delete process.env.CONTEXT_FORGE_DATA_DIR;
    await rm(tempDir, { recursive: true, force: true });
  });

  it('creates a project and generates context', async () => {
    // 1. Create a project via core storage
    const project = await store.create({
      name: 'test-project',
      template: 'default',
      slice: 'auth',
      isMonorepo: false,
    });

    // 2. Verify project persists
    const loaded = await store.getById(project.id);
    expect(loaded).toBeDefined();
    expect(loaded!.name).toBe('test-project');

    // 3. Wire up context pipeline
    //    (needs a real project path with prompt files — use a fixture)
    const fixtureProjectPath = join(__dirname, '__fixtures__', 'test-project');
    const { integrator } = createContextPipeline(fixtureProjectPath);

    // 4. Generate context from the project
    const context = await integrator.generateContextFromProject(project);

    // 5. Verify context was generated
    expect(context).toBeDefined();
    expect(typeof context).toBe('string');
    expect(context.length).toBeGreaterThan(0);
  });

  it('round-trips CRUD operations', async () => {
    // Create
    const project = await store.create({
      name: 'crud-test',
      template: 'default',
      slice: '',
      isMonorepo: false,
    });
    expect(project.id).toMatch(/^project_/);

    // Read all
    const all = await store.getAll();
    expect(all).toHaveLength(1);

    // Update
    await store.update(project.id, { slice: 'updated-slice' });
    const updated = await store.getById(project.id);
    expect(updated!.slice).toBe('updated-slice');

    // Delete
    await store.delete(project.id);
    const afterDelete = await store.getAll();
    expect(afterDelete).toHaveLength(0);
  });

  it('recovers from backup on corrupted main file', async () => {
    // Create valid data
    await store.create({ name: 'backup-test', template: '', slice: '', isMonorepo: false });

    // Corrupt main file
    await writeFile(join(tempDir, 'projects.json'), 'NOT VALID JSON');

    // New store instance should recover from backup
    const freshStore = new FileProjectStore();
    const projects = await freshStore.getAll();
    expect(projects).toHaveLength(1);
    expect(projects[0].name).toBe('backup-test');
  });
});
```

**Fixture project**: Create a minimal fixture at `packages/core/src/__tests__/__fixtures__/test-project/` containing:
- `project-documents/ai-project-guide/prompt.ai-project.system.md` (minimal prompt file)
- `project-documents/ai-project-guide/statements.ai-project.default.md` (minimal statements)

This fixture enables `createContextPipeline()` to resolve files and generate output, validating the full chain: storage → project data → pipeline → context output.

## Integration Points

### Provides to Other Slices

- **MCP Server — Project Tools (slice 146)**: `IProjectStore` interface and `FileProjectStore` implementation. The MCP server's `project_list`, `project_get`, `project_update` tools call `store.getAll()`, `store.getById()`, `store.update()`.
- **MCP Server — Context Tools (slice 147)**: `FileProjectStore.getById()` to load project data before calling `createContextPipeline()`.
- **Electron Client Conversion (slice 149)**: Electron's main process can use `FileProjectStore` directly instead of its own `ProjectStore`. The renderer can switch from `PersistentProjectStore` (IPC-based) to a simpler IPC layer that delegates to core's store.
- **Core Test Suite (slice 149)**: Storage tests validate data integrity independently of Electron.

### Consumes from Other Slices

- **Core Types Extraction (slice 141)**: `ProjectData`, `CreateProjectData`, `UpdateProjectData` from `@context-forge/core`.
- **Core Orchestration Extraction (slice 143)**: `createContextPipeline()` used in the pipeline integration test.

## Success Criteria

### Functional Requirements

- [ ] `IProjectStore` interface defined in `packages/core/src/storage/interfaces.ts`
- [ ] `FileProjectStore` implements full CRUD: `getAll()`, `getById()`, `create()`, `update()`, `delete()`
- [ ] `FileStorageService` implements atomic writes (temp file + rename), backup on write, recovery from backup on corrupted read
- [ ] Backup service extracted to core: `createVersionedBackup()`, `pruneOldBackups()`, `checkWriteGuard()` with injectable fs deps
- [ ] `getStoragePath()` returns `env-paths('context-forge').config` by default, respects `CONTEXT_FORGE_DATA_DIR` override
- [ ] Data migration from Electron legacy location works on first access when new location is empty
- [ ] Project field migration applied on read (defaults for `taskFile`, `instruction`, `isMonorepo`, `customData`)
- [ ] Electron main process IPC handlers delegate to core's `FileStorageService`
- [ ] Electron app still builds and runs identically from a user perspective

### Technical Requirements

- [ ] `pnpm --filter @context-forge/core build` succeeds with new storage modules
- [ ] `pnpm --filter @context-forge/electron build` succeeds with updated main.ts imports
- [ ] `pnpm -r build` succeeds (full workspace)
- [ ] All existing tests pass (same pass/fail as pre-slice)
- [ ] New unit tests for `FileStorageService`, `FileProjectStore`, `backupService` pass
- [ ] Pipeline integration test passes — full context generation without Electron
- [ ] No `any` types in new code
- [ ] `.js` extensions on all relative imports within `packages/core/`
- [ ] No Electron-specific imports in any core file

### Integration Requirements

- [ ] `FileProjectStore` is importable from `@context-forge/core/node` (workspace link verified)
- [ ] `IProjectStore` type is importable from `@context-forge/core` (browser-safe barrel)
- [ ] MCP server package can import and instantiate `FileProjectStore` (verified by build, not by implementing MCP tools)

## Risk Assessment

### Storage Path Divergence

**Risk**: `env-paths` returns a different path than Electron's `app.getPath('userData')` on macOS (`~/Library/Preferences/` vs `~/Library/Application Support/`). During the transition period (before Electron Client Conversion), both Electron and MCP server may access different paths.

**Mitigation**: The Electron main.ts IPC handlers are updated to use `getStoragePath()` from core in this slice. This means Electron and MCP server use the same path immediately. The one-time migration copies data from the old Electron location to the new one.

**Alternative considered**: Use `~/Library/Application Support/context-forge/context-forge/` hardcoded instead of `env-paths`. Rejected because it doesn't help Linux/Windows and ties core to Electron's path convention.

### Concurrent Write Safety

**Risk**: If Electron and MCP server run simultaneously and both write to `projects.json`, last-write-wins could lose data.

**Mitigation**: Accepted for v2 scope. The MCP server uses stdio transport (sequential tool calls). Electron writes are user-initiated with debounce. Atomic file writes prevent corruption. True concurrent-write safety (file locking) is deferred — it would add a dependency and complexity disproportionate to the risk.

## Implementation Notes

### Development Approach

**Suggested order**:

1. Add `env-paths` dependency to `packages/core/package.json`
2. Create `packages/core/src/storage/storagePaths.ts` — `getStoragePath()`
3. Create `packages/core/src/storage/interfaces.ts` — `IProjectStore`, `IStorageService`, `StorageReadResult`
4. Extract backup service from Electron to `packages/core/src/storage/backupService.ts`
5. Create `packages/core/src/storage/FileStorageService.ts` — low-level file ops
6. Create `packages/core/src/storage/FileProjectStore.ts` — project CRUD
7. Create storage barrel `packages/core/src/storage/index.ts`
8. Update `packages/core/src/node.ts` — export storage modules
9. Update `packages/core/src/index.ts` — export `IProjectStore` type (browser-safe)
10. Build core, verify compilation
11. Update Electron `main.ts` IPC handlers to delegate to core
12. Update Electron `main.ts` backup-on-exit to use core's backup service
13. Build Electron, run existing tests
14. Create test fixture project
15. Write unit tests for `FileStorageService`, `FileProjectStore`, `backupService`
16. Write pipeline integration test
17. Full workspace build and test

### Testing Strategy

- **Unit tests**: Each storage module tested against temp directories. `FileStorageService` covers atomic writes, backup/recovery, corruption handling. `FileProjectStore` covers CRUD, migration, ID generation. `backupService` tests are largely ported from Electron.
- **Pipeline integration test**: Validates the full chain: `FileProjectStore` → `createContextPipeline()` → context output. Uses a fixture project with minimal prompt/statement files.
- **Existing test suite**: Must pass unchanged. Electron's storage tests (renderer-side) are not affected because the renderer-side classes remain.
