---
slice: storage-migration
project: context-forge
lld: user/slices/144-slice.storage-migration.md
dependencies: [core-types-extraction]
projectState: >
  Slices 140-143 complete. packages/core contains types (6 modules), services
  (5 services + 3 orchestrators + factory), and full context assembly pipeline.
  Full workspace builds clean. Storage is currently Electron-only: main.ts has
  ~140 lines of inline fs logic for IPC handlers, backupService.ts lives in
  packages/electron with no Electron dependencies, and all project data lives at
  ~/Library/Application Support/context-forge/context-forge/.
dateCreated: 20260219
dateUpdated: 20260219
status: complete
---

## Context Summary
- Working on storage-migration slice (slice 144)
- Replaces Electron-specific storage with filesystem-based storage in `packages/core`
- Creates `IProjectStore`, `FileStorageService`, `FileProjectStore` in `packages/core/src/storage/`
- Uses `env-paths` for cross-platform storage path (`~/Library/Preferences/context-forge/` on macOS)
- Includes one-time data migration from Electron legacy location
- Updates Electron main.ts IPC handlers to delegate to core
- Pipeline integration test validates full chain without Electron
- Prerequisite slices 141 (types) and 143 (orchestration) are complete
- Next planned slice: MCP Server — Project Tools (slice 146)

---

## Phase 1: Setup and Interfaces

### Task 1: Add `env-paths` dependency and create `storagePaths.ts`
- [x] Run `pnpm --filter @context-forge/core add env-paths` (v3.x, ESM)
- [x] Create `packages/core/src/storage/storagePaths.ts`
  1. Import `envPaths` from `env-paths`
  2. Call `envPaths('context-forge', { suffix: '' })` to get platform paths
  3. Export `getStoragePath(): string` returning `process.env.CONTEXT_FORGE_DATA_DIR || paths.config`
  4. Export `getLegacyElectronPath(): string | null` — on macOS (`process.platform === 'darwin'`), return `join(os.homedir(), 'Library', 'Application Support', 'context-forge', 'context-forge')`; on other platforms return `null`
- [x] All relative imports use `.js` extensions
- [x] **Success**: File compiles; `getStoragePath()` returns a string; `CONTEXT_FORGE_DATA_DIR` override works when set

### Task 2: Create storage interfaces in `interfaces.ts`
- [x] Create `packages/core/src/storage/interfaces.ts`
  1. Import `ProjectData`, `CreateProjectData`, `UpdateProjectData` from `../types/project.js`
  2. Define `IProjectStore` interface — see slice design §Interface Design for exact signatures
  3. Define `StorageReadResult` interface (`data: string`, optional `recovered?: boolean`, `message?: string`)
  4. Define `IStorageService` interface — see slice design §Storage Service Interface for exact signatures
- [x] Types only — no runtime dependencies
- [x] **Success**: File compiles; all interfaces importable; no `any` types

### Task 3: Build core and commit setup
- [x] Run `pnpm --filter @context-forge/core build` — verify success
- [x] Git commit: storage interfaces and storage path module
- [x] **Success**: Core builds clean; commit created

---

## Phase 2: Backup Service Extraction

### Task 4: Extract backup service from Electron to core
- [x] Copy `packages/electron/src/main/services/storage/backupService.ts` to `packages/core/src/storage/backupService.ts`
- [x] Update imports to core-relative paths (only `fs/promises`, `fs`, `path` — no Electron deps)
- [x] Preserve all exports unchanged: `BackupFsDeps`, `MAX_VERSIONED_BACKUPS`, `createVersionedBackup`, `pruneOldBackups`, `checkWriteGuard`
- [x] Ensure `.js` extensions on any relative imports
- [x] **Success**: File compiles in core; no Electron imports; function signatures identical to source

### Task 5: Write backup service tests
- [x] Create `packages/core/src/storage/__tests__/backupService.test.ts`
- [x] Port tests from `packages/electron/tests/unit/services/storage/backupService.test.ts`, updating import paths to `../backupService.js`
- [x] Tests cover: `createVersionedBackup` (skip if missing, timestamped filename, unique timestamps, filename pattern), `pruneOldBackups` (under limit, at limit, over limit deletes oldest, preserves plain `.backup`, handles rotation failure, handles unlink failure), `checkWriteGuard` (non-projects.json allowed, missing file allowed, reject catastrophic reduction, allow normal delete, allow small existing, allow corrupt existing, allow invalid incoming JSON, allow readFile failure)
- [x] All tests use injectable `BackupFsDeps` mocks (same pattern as Electron tests)
- [x] **Success**: All backup service tests pass via `pnpm --filter @context-forge/core test`

### Task 6: Build and commit backup service extraction
- [x] Run `pnpm --filter @context-forge/core build` — verify success
- [x] Git commit: backup service extraction with tests
- [x] **Success**: Core builds clean; backup tests pass; commit created

---

## Phase 3: FileStorageService Implementation

### Task 7: Create `FileStorageService.ts`
- [x] Create `packages/core/src/storage/FileStorageService.ts`
- [x] Implement `IStorageService` with constructor taking `storagePath: string`
- [x] `read(filename)`: validate filename (reject `..`, `/`, `\`); try main file + JSON parse; on failure try `{filename}.backup` recovery; on backup success restore main file; return `StorageReadResult`; throw on ENOENT or both-corrupted
- [x] `write(filename, data)`: validate filename; ensure directory exists; backup existing to `{filename}.backup`; call `checkWriteGuard()`; write to `.tmp` file; validate JSON; atomic rename `.tmp` → main
- [x] `createBackup(filename)`: validate; copy main file to `{filename}.backup` if it exists
- [x] `exists(filename)`: validate; check file existence
- [x] Reference: Electron's `main.ts` IPC handlers (lines 63-228) contain the logic being extracted
- [x] All relative imports use `.js` extensions
- [x] **Success**: File compiles; implements `IStorageService`; no `any` types; no Electron imports

### Task 8: Write FileStorageService tests
- [x] Create `packages/core/src/storage/__tests__/FileStorageService.test.ts`
- [x] Test write + read round-trip: write JSON data, read it back, verify content match
- [x] Test atomic write: verify no `.tmp` file remains after successful write
- [x] Test backup on write: verify `{filename}.backup` exists after write
- [x] Test recovery from corrupted main file: write valid data, corrupt main file, read again, verify backup recovery and `recovered` flag
- [x] Test filename validation: reject `..`, `/`, `\` in filenames for read, write, createBackup, exists
- [x] Test read non-existent file: verify appropriate error thrown
- [x] Test write creates storage directory if missing
- [x] All tests use temp directories (`mkdtemp` + cleanup in `afterEach`)
- [x] **Success**: All FileStorageService tests pass

### Task 9: Commit FileStorageService with tests
- [x] Run `pnpm --filter @context-forge/core build` — verify success
- [x] Git commit: FileStorageService implementation and tests
- [x] **Success**: Core builds; all storage tests pass; commit created

---

## Phase 4: FileProjectStore Implementation

### Task 10: Create `FileProjectStore.ts`
- [x] Create `packages/core/src/storage/FileProjectStore.ts`
- [x] Implement `IProjectStore`, composing `FileStorageService` internally
- [x] Constructor: create `FileStorageService` using `getStoragePath()`
- [x] Lazy initialization (`ensureInitialized()`): on first access, check if `projects.json` exists; if not, call `migrateFromLegacyLocation()`; set initialized flag
- [x] `getAll()`: call `ensureInitialized()`; read + parse `projects.json`; apply field migration (defaults: `taskFile: ''`, `instruction: 'implementation'`, `isMonorepo: false`, `customData: {}`); return `ProjectData[]`. Handle file-not-found by returning `[]`
- [x] `getById(id)`: call `getAll()`, find by id, return match or `undefined`
- [x] `create(data)`: generate ID (`project_{timestamp}_{random}`), construct full `ProjectData` with timestamps, append to existing list, write
- [x] `update(id, updates)`: load all, find by id (throw if not found), merge updates, set `updatedAt`, write
- [x] `delete(id)`: load all, verify exists (throw if not found), filter out, write
- [x] Implement `migrateFromLegacyLocation()` — see slice design §Data Migration Strategy: copy `projects.json` and `projects.json.backup` from legacy path to new path if new location is empty and legacy has data
- [x] All relative imports use `.js` extensions
- [x] **Success**: File compiles; implements `IProjectStore`; no `any` types; no Electron imports

### Task 11: Write FileProjectStore tests
- [x] Create `packages/core/src/storage/__tests__/FileProjectStore.test.ts`
- [x] Test CRUD round-trip: create → getAll (length 1) → getById → update → verify changes → delete → getAll (length 0)
- [x] Test ID generation: verify `project_` prefix format via regex match
- [x] Test field migration on read: manually write projects.json missing `taskFile`/`instruction`/`isMonorepo`/`customData` fields, instantiate store, call `getAll()`, verify defaults applied
- [x] Test create sets `createdAt` and `updatedAt` as ISO timestamps
- [x] Test update modifies `updatedAt` but not `createdAt`
- [x] Test update non-existent ID throws
- [x] Test delete non-existent ID throws
- [x] Test getAll on empty store returns `[]`
- [x] Test migration from legacy location: seed projects.json in mock legacy path, verify first `getAll()` copies to new location
- [x] Test migration skipped when new location already has data
- [x] All tests use temp directories via `CONTEXT_FORGE_DATA_DIR` env var override + cleanup
- [x] **Success**: All FileProjectStore tests pass

### Task 12: Create storage barrel, update core exports, build and commit
- [x] Create `packages/core/src/storage/index.ts` barrel:
  1. [x] Re-export all from `./interfaces.js`
  2. [x] Export `FileStorageService` from `./FileStorageService.js`
  3. [x] Export `FileProjectStore` from `./FileProjectStore.js`
  4. [x] Export `getStoragePath`, `getLegacyElectronPath` from `./storagePaths.js`
  5. [x] Export backup functions and types from `./backupService.js`
- [x] Update `packages/core/src/node.ts`: add `export * from './storage/index.js'`
- [x] Update `packages/core/src/index.ts`: add type-only re-exports for `IProjectStore`, `IStorageService`, `StorageReadResult` from `./storage/interfaces.js`
- [x] Run `pnpm --filter @context-forge/core build` — verify success
- [x] Verify `dist/` contains storage `.js` and `.d.ts` files
- [x] Git commit: FileProjectStore, barrel exports, core integration
- [x] **Success**: Core builds; `IProjectStore` importable from `@context-forge/core`; `FileProjectStore` importable from `@context-forge/core/node`

---

## Phase 5: Electron Integration

### Task 13: Update Electron main.ts IPC handlers to delegate to core
- [x] In `packages/electron/src/main/main.ts`:
  1. [x] Import `FileStorageService`, `getStoragePath` from `@context-forge/core/node`
  2. [x] Remove or replace local `getStoragePath()` function with core's version
  3. [x] Instantiate `FileStorageService` using `getStoragePath()` (after app ready)
  4. [x] Replace `storage:read` handler body with delegation to `storageService.read(filename)`, wrapping result in existing `{ success, data, recovered, message }` format
  5. [x] Replace `storage:write` handler body with delegation to `storageService.write(filename, data)`, wrapping in `{ success }` / `{ success: false, error }` format
  6. [x] Replace `storage:backup` handler body with delegation to `storageService.createBackup(filename)`
  7. [x] Keep `storage:list-backups` handler logic (reads directory for versioned backups — this is backup enumeration, not covered by `IStorageService`)
- [x] Preserve IPC return contract: `{ success: boolean, data?: string, error?: string, recovered?: boolean, message?: string, notFound?: boolean }`
- [x] Remove now-unused `fs/promises` imports (`readFile`, `writeFile`, `copyFile`, `rename`, `unlink` — keep `readdir`, `stat`, `mkdir` if still needed by list-backups or other handlers)
- [x] **Success**: IPC handlers delegate to core; ~100+ lines of inline fs logic eliminated; storage behavior unchanged

### Task 14: Update Electron main.ts backup-on-exit to use core backup service
- [x] In `packages/electron/src/main/main.ts`:
  1. [x] Import `createVersionedBackup` from `@context-forge/core/node` instead of local `./services/storage/backupService`
  2. [x] In `before-quit` handler, use core's `getStoragePath()` (already updated in Task 13)
  3. [x] `VERSIONED_BACKUP_FILES` constant and exit backup logic structure remain unchanged
- [x] **Success**: Exit backup uses core's `createVersionedBackup`; local backup import removed

### Task 15: Build and test Electron, commit integration
- [x] Run `pnpm --filter @context-forge/electron build` — verify success
- [x] Run `pnpm --filter @context-forge/electron test` — verify same pass/fail as pre-slice
- [x] Git commit: Electron main.ts delegates to core storage
- [x] **Success**: Electron builds clean; test results unchanged; commit created

---

## Phase 6: Pipeline Integration Test and Final Verification

### Task 16: Create test fixture project
- [x] Create `packages/core/src/__tests__/__fixtures__/test-project/project-documents/ai-project-guide/`
- [x] Create minimal `prompt.ai-project.system.md` containing a simple template with at least one variable placeholder (e.g., `{{project_state}}`)
- [x] Create minimal `statements.ai-project.default.md` with at least one statement section
- [x] Verify fixture structure matches what `createContextPipeline()` expects (`PROMPT_FILE_RELATIVE_PATH` and `STATEMENTS_FILE_RELATIVE_PATH` constants)
- [x] **Success**: Fixture directory exists with valid prompt and statement files

### Task 17: Write pipeline integration test
- [x] Create `packages/core/src/__tests__/pipeline-integration.test.ts`
- [x] Test: create project via `FileProjectStore`, wire `createContextPipeline()` with fixture path, call `integrator.generateContextFromProject(project)`, verify non-empty string output — see slice design §Pipeline Integration Test
- [x] Test: CRUD round-trip on `FileProjectStore` (create, read, update, delete)
- [x] Test: recovery from corrupted `projects.json` via backup
- [x] All tests use `CONTEXT_FORGE_DATA_DIR` env var with temp directories; clean up in `afterEach`
- [x] **Success**: All pipeline integration tests pass; validates full context generation chain without Electron

### Task 18: Full workspace build, test, and final commit
- [x] Run `pnpm --filter @context-forge/core build` — verify success
- [x] Run `pnpm --filter @context-forge/electron build` — verify success
- [x] Run `pnpm -r build` — full workspace builds in correct order
- [x] Run `pnpm --filter @context-forge/core test` — all storage and integration tests pass
- [x] Run `pnpm --filter @context-forge/electron test` — same pass/fail as pre-slice
- [x] Grep `packages/core/src/` for Electron imports (`electron`, `app.getPath`, `BrowserWindow`) — must find zero
- [x] Verify `FileProjectStore` importable from `@context-forge/core/node` (workspace link)
- [x] Verify `IProjectStore` type importable from `@context-forge/core` (browser-safe barrel)
- [x] Git commit: pipeline integration test and final verification
- [x] Update DEVLOG with slice 144 implementation summary
- [x] **Note**: After successful build, PM should manually copy versioned backups:
  ```
  cp ~/Library/Application\ Support/context-forge/context-forge/projects.json.*.backup \
     ~/Library/Preferences/context-forge/
  ```
- [x] **Success**: Full workspace builds; all tests pass; no Electron imports in core; storage accessible from MCP server package
