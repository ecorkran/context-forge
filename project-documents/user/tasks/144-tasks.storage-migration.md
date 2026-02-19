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
- [ ] Run `pnpm --filter @context-forge/core add env-paths` (v3.x, ESM)
- [ ] Create `packages/core/src/storage/storagePaths.ts`
  1. Import `envPaths` from `env-paths`
  2. Call `envPaths('context-forge', { suffix: '' })` to get platform paths
  3. Export `getStoragePath(): string` returning `process.env.CONTEXT_FORGE_DATA_DIR || paths.config`
  4. Export `getLegacyElectronPath(): string | null` — on macOS (`process.platform === 'darwin'`), return `join(os.homedir(), 'Library', 'Application Support', 'context-forge', 'context-forge')`; on other platforms return `null`
- [ ] All relative imports use `.js` extensions
- [ ] **Success**: File compiles; `getStoragePath()` returns a string; `CONTEXT_FORGE_DATA_DIR` override works when set

### Task 2: Create storage interfaces in `interfaces.ts`
- [ ] Create `packages/core/src/storage/interfaces.ts`
  1. Import `ProjectData`, `CreateProjectData`, `UpdateProjectData` from `../types/project.js`
  2. Define `IProjectStore` interface — see slice design §Interface Design for exact signatures
  3. Define `StorageReadResult` interface (`data: string`, optional `recovered?: boolean`, `message?: string`)
  4. Define `IStorageService` interface — see slice design §Storage Service Interface for exact signatures
- [ ] Types only — no runtime dependencies
- [ ] **Success**: File compiles; all interfaces importable; no `any` types

### Task 3: Build core and commit setup
- [ ] Run `pnpm --filter @context-forge/core build` — verify success
- [ ] Git commit: storage interfaces and storage path module
- [ ] **Success**: Core builds clean; commit created

---

## Phase 2: Backup Service Extraction

### Task 4: Extract backup service from Electron to core
- [ ] Copy `packages/electron/src/main/services/storage/backupService.ts` to `packages/core/src/storage/backupService.ts`
- [ ] Update imports to core-relative paths (only `fs/promises`, `fs`, `path` — no Electron deps)
- [ ] Preserve all exports unchanged: `BackupFsDeps`, `MAX_VERSIONED_BACKUPS`, `createVersionedBackup`, `pruneOldBackups`, `checkWriteGuard`
- [ ] Ensure `.js` extensions on any relative imports
- [ ] **Success**: File compiles in core; no Electron imports; function signatures identical to source

### Task 5: Write backup service tests
- [ ] Create `packages/core/src/storage/__tests__/backupService.test.ts`
- [ ] Port tests from `packages/electron/tests/unit/services/storage/backupService.test.ts`, updating import paths to `../backupService.js`
- [ ] Tests cover: `createVersionedBackup` (skip if missing, timestamped filename, unique timestamps, filename pattern), `pruneOldBackups` (under limit, at limit, over limit deletes oldest, preserves plain `.backup`, handles rotation failure, handles unlink failure), `checkWriteGuard` (non-projects.json allowed, missing file allowed, reject catastrophic reduction, allow normal delete, allow small existing, allow corrupt existing, allow invalid incoming JSON, allow readFile failure)
- [ ] All tests use injectable `BackupFsDeps` mocks (same pattern as Electron tests)
- [ ] **Success**: All backup service tests pass via `pnpm --filter @context-forge/core test`

### Task 6: Build and commit backup service extraction
- [ ] Run `pnpm --filter @context-forge/core build` — verify success
- [ ] Git commit: backup service extraction with tests
- [ ] **Success**: Core builds clean; backup tests pass; commit created

---

## Phase 3: FileStorageService Implementation

### Task 7: Create `FileStorageService.ts`
- [ ] Create `packages/core/src/storage/FileStorageService.ts`
- [ ] Implement `IStorageService` with constructor taking `storagePath: string`
- [ ] `read(filename)`: validate filename (reject `..`, `/`, `\`); try main file + JSON parse; on failure try `{filename}.backup` recovery; on backup success restore main file; return `StorageReadResult`; throw on ENOENT or both-corrupted
- [ ] `write(filename, data)`: validate filename; ensure directory exists; backup existing to `{filename}.backup`; call `checkWriteGuard()`; write to `.tmp` file; validate JSON; atomic rename `.tmp` → main
- [ ] `createBackup(filename)`: validate; copy main file to `{filename}.backup` if it exists
- [ ] `exists(filename)`: validate; check file existence
- [ ] Reference: Electron's `main.ts` IPC handlers (lines 63-228) contain the logic being extracted
- [ ] All relative imports use `.js` extensions
- [ ] **Success**: File compiles; implements `IStorageService`; no `any` types; no Electron imports

### Task 8: Write FileStorageService tests
- [ ] Create `packages/core/src/storage/__tests__/FileStorageService.test.ts`
- [ ] Test write + read round-trip: write JSON data, read it back, verify content match
- [ ] Test atomic write: verify no `.tmp` file remains after successful write
- [ ] Test backup on write: verify `{filename}.backup` exists after write
- [ ] Test recovery from corrupted main file: write valid data, corrupt main file, read again, verify backup recovery and `recovered` flag
- [ ] Test filename validation: reject `..`, `/`, `\` in filenames for read, write, createBackup, exists
- [ ] Test read non-existent file: verify appropriate error thrown
- [ ] Test write creates storage directory if missing
- [ ] All tests use temp directories (`mkdtemp` + cleanup in `afterEach`)
- [ ] **Success**: All FileStorageService tests pass

### Task 9: Commit FileStorageService with tests
- [ ] Run `pnpm --filter @context-forge/core build` — verify success
- [ ] Git commit: FileStorageService implementation and tests
- [ ] **Success**: Core builds; all storage tests pass; commit created

---

## Phase 4: FileProjectStore Implementation

### Task 10: Create `FileProjectStore.ts`
- [ ] Create `packages/core/src/storage/FileProjectStore.ts`
- [ ] Implement `IProjectStore`, composing `FileStorageService` internally
- [ ] Constructor: create `FileStorageService` using `getStoragePath()`
- [ ] Lazy initialization (`ensureInitialized()`): on first access, check if `projects.json` exists; if not, call `migrateFromLegacyLocation()`; set initialized flag
- [ ] `getAll()`: call `ensureInitialized()`; read + parse `projects.json`; apply field migration (defaults: `taskFile: ''`, `instruction: 'implementation'`, `isMonorepo: false`, `customData: {}`); return `ProjectData[]`. Handle file-not-found by returning `[]`
- [ ] `getById(id)`: call `getAll()`, find by id, return match or `undefined`
- [ ] `create(data)`: generate ID (`project_{timestamp}_{random}`), construct full `ProjectData` with timestamps, append to existing list, write
- [ ] `update(id, updates)`: load all, find by id (throw if not found), merge updates, set `updatedAt`, write
- [ ] `delete(id)`: load all, verify exists (throw if not found), filter out, write
- [ ] Implement `migrateFromLegacyLocation()` — see slice design §Data Migration Strategy: copy `projects.json` and `projects.json.backup` from legacy path to new path if new location is empty and legacy has data
- [ ] All relative imports use `.js` extensions
- [ ] **Success**: File compiles; implements `IProjectStore`; no `any` types; no Electron imports

### Task 11: Write FileProjectStore tests
- [ ] Create `packages/core/src/storage/__tests__/FileProjectStore.test.ts`
- [ ] Test CRUD round-trip: create → getAll (length 1) → getById → update → verify changes → delete → getAll (length 0)
- [ ] Test ID generation: verify `project_` prefix format via regex match
- [ ] Test field migration on read: manually write projects.json missing `taskFile`/`instruction`/`isMonorepo`/`customData` fields, instantiate store, call `getAll()`, verify defaults applied
- [ ] Test create sets `createdAt` and `updatedAt` as ISO timestamps
- [ ] Test update modifies `updatedAt` but not `createdAt`
- [ ] Test update non-existent ID throws
- [ ] Test delete non-existent ID throws
- [ ] Test getAll on empty store returns `[]`
- [ ] Test migration from legacy location: seed projects.json in mock legacy path, verify first `getAll()` copies to new location
- [ ] Test migration skipped when new location already has data
- [ ] All tests use temp directories via `CONTEXT_FORGE_DATA_DIR` env var override + cleanup
- [ ] **Success**: All FileProjectStore tests pass

### Task 12: Create storage barrel, update core exports, build and commit
- [ ] Create `packages/core/src/storage/index.ts` barrel:
  1. Re-export all from `./interfaces.js`
  2. Export `FileStorageService` from `./FileStorageService.js`
  3. Export `FileProjectStore` from `./FileProjectStore.js`
  4. Export `getStoragePath`, `getLegacyElectronPath` from `./storagePaths.js`
  5. Export backup functions and types from `./backupService.js`
- [ ] Update `packages/core/src/node.ts`: add `export * from './storage/index.js'`
- [ ] Update `packages/core/src/index.ts`: add type-only re-exports for `IProjectStore`, `IStorageService`, `StorageReadResult` from `./storage/interfaces.js`
- [ ] Run `pnpm --filter @context-forge/core build` — verify success
- [ ] Verify `dist/` contains storage `.js` and `.d.ts` files
- [ ] Git commit: FileProjectStore, barrel exports, core integration
- [ ] **Success**: Core builds; `IProjectStore` importable from `@context-forge/core`; `FileProjectStore` importable from `@context-forge/core/node`

---

## Phase 5: Electron Integration

### Task 13: Update Electron main.ts IPC handlers to delegate to core
- [ ] In `packages/electron/src/main/main.ts`:
  1. Import `FileStorageService`, `getStoragePath` from `@context-forge/core/node`
  2. Remove or replace local `getStoragePath()` function with core's version
  3. Instantiate `FileStorageService` using `getStoragePath()` (after app ready)
  4. Replace `storage:read` handler body with delegation to `storageService.read(filename)`, wrapping result in existing `{ success, data, recovered, message }` format
  5. Replace `storage:write` handler body with delegation to `storageService.write(filename, data)`, wrapping in `{ success }` / `{ success: false, error }` format
  6. Replace `storage:backup` handler body with delegation to `storageService.createBackup(filename)`
  7. Keep `storage:list-backups` handler logic (reads directory for versioned backups — this is backup enumeration, not covered by `IStorageService`)
- [ ] Preserve IPC return contract: `{ success: boolean, data?: string, error?: string, recovered?: boolean, message?: string, notFound?: boolean }`
- [ ] Remove now-unused `fs/promises` imports (`readFile`, `writeFile`, `copyFile`, `rename`, `unlink` — keep `readdir`, `stat`, `mkdir` if still needed by list-backups or other handlers)
- [ ] **Success**: IPC handlers delegate to core; ~100+ lines of inline fs logic eliminated; storage behavior unchanged

### Task 14: Update Electron main.ts backup-on-exit to use core backup service
- [ ] In `packages/electron/src/main/main.ts`:
  1. Import `createVersionedBackup` from `@context-forge/core/node` instead of local `./services/storage/backupService`
  2. In `before-quit` handler, use core's `getStoragePath()` (already updated in Task 13)
  3. `VERSIONED_BACKUP_FILES` constant and exit backup logic structure remain unchanged
- [ ] **Success**: Exit backup uses core's `createVersionedBackup`; local backup import removed

### Task 15: Build and test Electron, commit integration
- [ ] Run `pnpm --filter @context-forge/electron build` — verify success
- [ ] Run `pnpm --filter @context-forge/electron test` — verify same pass/fail as pre-slice
- [ ] Git commit: Electron main.ts delegates to core storage
- [ ] **Success**: Electron builds clean; test results unchanged; commit created

---

## Phase 6: Pipeline Integration Test and Final Verification

### Task 16: Create test fixture project
- [ ] Create `packages/core/src/__tests__/__fixtures__/test-project/project-documents/ai-project-guide/`
- [ ] Create minimal `prompt.ai-project.system.md` containing a simple template with at least one variable placeholder (e.g., `{{project_state}}`)
- [ ] Create minimal `statements.ai-project.default.md` with at least one statement section
- [ ] Verify fixture structure matches what `createContextPipeline()` expects (`PROMPT_FILE_RELATIVE_PATH` and `STATEMENTS_FILE_RELATIVE_PATH` constants)
- [ ] **Success**: Fixture directory exists with valid prompt and statement files

### Task 17: Write pipeline integration test
- [ ] Create `packages/core/src/__tests__/pipeline-integration.test.ts`
- [ ] Test: create project via `FileProjectStore`, wire `createContextPipeline()` with fixture path, call `integrator.generateContextFromProject(project)`, verify non-empty string output — see slice design §Pipeline Integration Test
- [ ] Test: CRUD round-trip on `FileProjectStore` (create, read, update, delete)
- [ ] Test: recovery from corrupted `projects.json` via backup
- [ ] All tests use `CONTEXT_FORGE_DATA_DIR` env var with temp directories; clean up in `afterEach`
- [ ] **Success**: All pipeline integration tests pass; validates full context generation chain without Electron

### Task 18: Full workspace build, test, and final commit
- [ ] Run `pnpm --filter @context-forge/core build` — verify success
- [ ] Run `pnpm --filter @context-forge/electron build` — verify success
- [ ] Run `pnpm -r build` — full workspace builds in correct order
- [ ] Run `pnpm --filter @context-forge/core test` — all storage and integration tests pass
- [ ] Run `pnpm --filter @context-forge/electron test` — same pass/fail as pre-slice
- [ ] Grep `packages/core/src/` for Electron imports (`electron`, `app.getPath`, `BrowserWindow`) — must find zero
- [ ] Verify `FileProjectStore` importable from `@context-forge/core/node` (workspace link)
- [ ] Verify `IProjectStore` type importable from `@context-forge/core` (browser-safe barrel)
- [ ] Git commit: pipeline integration test and final verification
- [ ] Update DEVLOG with slice 144 implementation summary
- [ ] **Note**: After successful build, PM should manually copy versioned backups:
  ```
  cp ~/Library/Application\ Support/context-forge/context-forge/projects.json.*.backup \
     ~/Library/Preferences/context-forge/
  ```
- [ ] **Success**: Full workspace builds; all tests pass; no Electron imports in core; storage accessible from MCP server package
