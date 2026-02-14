---
layer: project
docType: tasks
feature: projects-versioned-backup
project: context-forge
lld: user/features/756-feature.projects-versioned-backup.md
dependencies: [110-slice.persistence]
status: not started
projectState: >
  Electron+React+TypeScript app (Vite build). Persistence via projects.json
  written through Electron IPC (storage:write in main.ts). Current backup is
  single-generation .backup file overwritten every write. ElectronStorageService
  in renderer calls StorageClient which invokes IPC. Main process handles
  atomic writes (temp file + rename) with single backup copy. Auto-save on
  500ms debounce. Data loss incident destroyed 16-project dataset due to
  cascading overwrites of the single backup.
dateCreated: 20260214
dateUpdated: 20260214
---

## Context Summary

- Feature 756: Versioned Backup System for Project Data (Issue #30)
- Context Forge is an Electron + React + TypeScript app using Vite
- Current persistence: `storage:write` IPC handler in `src/main/main.ts` does atomic write (temp → rename) with single `.backup` copy
- `ElectronStorageService.readProjects()` reads main file, falls back to `.backup`, returns `[]` on failure
- `PersistentProjectStore.updateProject()` does load-all → merge → write-all on every save
- Storage path: `{userData}/context-forge/` (e.g., `~/Library/Application Support/context-forge/context-forge/`)
- Files affected: `projects.json`, `app-state.json`
- The feature adds: versioned timestamped backups, rotation policy, write guard, startup recovery fallback

---

## Task 1: Implement Versioned Backup in storage:write Handler

**Owner**: Junior AI
**Dependencies**: None
**Effort**: 2
**Objective**: Replace single `.backup` copy with timestamped versioned backups in the main process `storage:write` IPC handler.

**Steps**:
- [ ] Open `src/main/main.ts`
- [ ] Locate the `storage:write` IPC handler (currently at approximately line 158)
- [ ] Find the section that creates a backup before writing:
  ```typescript
  if (existsSync(filePath)) {
    await copyFile(filePath, backupPath)
  }
  ```
- [ ] Replace with versioned backup creation:
  - Generate timestamp string from `new Date().toISOString()` with `:` and `.` replaced by `-`
  - Create backup at `{storagePath}/{filename}.{timestamp}.backup`
  - Keep the existing single `.backup` copy as well (backwards compatibility — `storage:read` still uses it for first-tier recovery)
- [ ] Verify the atomic write flow (temp → validate → rename) remains unchanged after the backup step

**Success Criteria**:
- [ ] Each `storage:write` call creates a new timestamped backup file alongside the existing `.backup`
- [ ] Timestamped backup filenames follow pattern `{filename}.{ISO-timestamp}.backup`
- [ ] Existing `.backup` file still created for backwards compatibility
- [ ] Atomic write flow (temp file → JSON validate → rename) unchanged

---

## Task 2: Implement Backup Rotation Policy

**Owner**: Junior AI
**Dependencies**: Task 1
**Effort**: 2
**Objective**: After creating a versioned backup, prune old ones to keep only the last 10 per file.

**Steps**:
- [ ] In `src/main/main.ts`, after the versioned backup copy in `storage:write`:
- [ ] Read the storage directory with `readdir`
- [ ] Filter entries matching the pattern `{filename}.*.backup` (but NOT the plain `{filename}.backup`)
- [ ] Sort matches by filename descending (ISO timestamps sort lexicographically)
- [ ] Delete all entries beyond the 10th (oldest first)
- [ ] Wrap rotation in try/catch — rotation failure must not block the write operation
- [ ] Log rotation activity (number pruned) at debug level

**Success Criteria**:
- [ ] At most 10 versioned backup files exist per source file after any write
- [ ] The plain `.backup` file is NOT counted or deleted by rotation
- [ ] Rotation failure does not prevent the write from completing
- [ ] Oldest backups are deleted first

---

## Task 3: Implement Write Guard for projects.json

**Owner**: Junior AI
**Dependencies**: Task 1
**Effort**: 2
**Objective**: Prevent catastrophic data loss by refusing to overwrite a multi-project file with near-empty data.

**Steps**:
- [ ] In `src/main/main.ts`, in the `storage:write` handler, before the atomic write step:
- [ ] Add guard logic only for `projects.json` (check `filename === 'projects.json'`)
- [ ] If the existing file exists, read and parse it
- [ ] Parse the incoming `data` parameter
- [ ] If both are arrays: reject the write when existing has >2 entries and incoming has ≤1
- [ ] Return `{ success: false, error: 'Write guard: significant data reduction detected. Refusing to overwrite N projects with M.' }` on rejection
- [ ] Log the rejection with `console.error` including both counts
- [ ] Wrap all guard logic in try/catch — if the guard itself fails (e.g., existing file unparseable), allow the write to proceed (the guard is protective, not blocking)

**Success Criteria**:
- [ ] Writing 1 project over 3+ projects is rejected with descriptive error
- [ ] Writing 5 projects over 6 projects is allowed (normal single-delete)
- [ ] Writing 0 projects over 3+ projects is rejected
- [ ] Guard only applies to `projects.json`, not `app-state.json` or other files
- [ ] Guard failure (unparseable existing file) allows write to proceed

---

## Task 4: Add storage:list-backups IPC Handler

**Owner**: Junior AI
**Dependencies**: Task 1
**Effort**: 1
**Objective**: Expose an IPC channel that lists available versioned backups for a given file.

**Steps**:
- [ ] In `src/main/main.ts`, add new IPC handler `storage:list-backups`:
  - Receives `filename: string`
  - Validates filename (same traversal checks as `storage:read`)
  - Reads storage directory, filters for `{filename}.*.backup` entries
  - Returns sorted array (newest first) of `{ name: string, timestamp: string, size: number }`
  - Returns `{ success: true, backups: [...] }` or `{ success: false, error: string }`
- [ ] Open `src/preload/preload.ts`
- [ ] Add to the `storage` namespace:
  ```typescript
  listBackups: (filename: string) => ipcRenderer.invoke('storage:list-backups', filename)
  ```
- [ ] Open `src/services/storage/StorageClient.ts`
- [ ] Add to the `Window.electronAPI.storage` type declaration:
  ```typescript
  listBackups: (filename: string) => Promise<{ success: boolean; backups?: Array<{ name: string; timestamp: string; size: number }>; error?: string }>;
  ```

**Success Criteria**:
- [ ] `window.electronAPI.storage.listBackups('projects.json')` returns list of versioned backups
- [ ] Results sorted newest first
- [ ] Invalid filenames return structured error
- [ ] Build passes with no type errors

---

## Task 5: Add Startup Recovery Fallback in ElectronStorageService

**Owner**: Junior AI
**Dependencies**: Task 4
**Effort**: 2
**Objective**: When both `projects.json` and `projects.json.backup` fail to load, attempt recovery from versioned backups before returning empty.

**Steps**:
- [ ] Open `src/services/storage/ElectronStorageService.ts`
- [ ] In `readProjects()`, in the catch block that currently returns `[]` (line 50-54):
- [ ] Before returning empty, call `storageClient.listBackups(this.mainFile)` (add method to StorageClient if needed)
- [ ] If backups exist, try reading the most recent one via `storage:read` with the backup filename
  - This requires the `storage:read` handler to support reading backup files by full name, OR a new `storage:read-backup` channel
  - Evaluate which approach is simpler — likely easiest to add a `storage:read-raw` that reads any file in the storage directory by name
- [ ] Parse and validate the backup data (same validation as main file: must be array, each entry needs id and name)
- [ ] If valid, log recovery message and return the recovered data
- [ ] If no backups or all fail, then return `[]` as before
- [ ] Add `listBackups` method to `StorageClient` class:
  ```typescript
  async listBackups(filename: string): Promise<Array<{ name: string; timestamp: string; size: number }>>
  ```

**Success Criteria**:
- [ ] If main file and `.backup` both fail, versioned backups are attempted
- [ ] Most recent valid versioned backup is used for recovery
- [ ] Recovery is logged clearly
- [ ] If no versioned backups exist, behavior unchanged (returns `[]`)
- [ ] No changes to the happy-path read flow

---

## Task 6: Write Unit Tests

**Owner**: Junior AI
**Dependencies**: Tasks 1-5
**Effort**: 2
**Objective**: Test the versioned backup, rotation, and write guard logic.

**Steps**:
- [ ] Create test file for the backup/guard logic (main process side)
- [ ] Test versioned backup creation:
  - [ ] Write creates timestamped backup file
  - [ ] Multiple writes create multiple backup files
  - [ ] Backup filename matches expected pattern
- [ ] Test rotation:
  - [ ] 11th write deletes the oldest backup
  - [ ] Plain `.backup` file is not deleted by rotation
  - [ ] Rotation failure doesn't block write
- [ ] Test write guard:
  - [ ] Rejects 1-over-3+ scenario
  - [ ] Allows normal single-delete (N-1 over N)
  - [ ] Allows writes to non-projects.json files regardless of size
  - [ ] Guard failure (corrupt existing file) allows write through
- [ ] Test recovery fallback:
  - [ ] Returns data from versioned backup when main and `.backup` both fail
  - [ ] Returns `[]` when no backups exist at all

**Success Criteria**:
- [ ] All tests pass with `pnpm test`
- [ ] Covers happy path, edge cases, and error conditions
- [ ] Tests use mocks for filesystem operations (consistent with existing ProjectPathService.test.ts patterns)

---

## Task 7: Build Verification

**Owner**: Junior AI
**Dependencies**: Tasks 1-6
**Effort**: 1
**Objective**: Verify full build and no regressions.

**Steps**:
- [ ] Run `pnpm build` — fix any TypeScript or build errors
- [ ] Run `pnpm test` — all tests pass (existing + new)
- [ ] Verify no regressions:
  - [ ] App starts and loads projects normally
  - [ ] Auto-save still works (form changes persist)
  - [ ] Project create/switch/delete still works
  - [ ] Settings dialog still works
- [ ] Verify new functionality:
  - [ ] Versioned backup files appear in storage directory after saves
  - [ ] Old backups are pruned after 10 accumulate
  - [ ] Write guard blocks catastrophic overwrites (can test by temporarily forcing a bad write)

**Success Criteria**:
- [ ] Build succeeds with no errors
- [ ] All tests pass
- [ ] No regressions in existing features
- [ ] Versioned backups observable in storage directory
