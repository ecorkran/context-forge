---
item: projects-versioned-backup
project: context-forge
type: feature
github: https://github.com/ecorkran/context-forge/issues/30
dependencies: [110-slice.persistence]
projectState: >
  Electron+React+TypeScript app. Persistence via ElectronStorageService writing
  projects.json through Electron IPC (storage:write handler in main.ts). Current
  backup is single-generation .backup file overwritten on every write. Auto-save
  fires on 500ms debounce after any form change. A cascading data loss incident
  destroyed a 16-project dataset because the single backup was overwritten by
  bad state before recovery was possible.
status: not started
dateCreated: 20260214
dateUpdated: 20260214
---

# Feature: Versioned Backup System for Project Data

## User-Provided Concept

The current single-file backup (`projects.json.backup`) provides zero protection against cascading data loss. When the app loads corrupt or empty data, auto-save immediately writes that bad state to disk, then the next write overwrites the backup with the bad state too. This destroyed a 16-project dataset with no recovery path.

We need versioned backups with reasonable retention, and protection so that bad state cannot overwrite good backups.

## HLD

### Problem Analysis

The data loss path:
1. `projects.json` becomes unreadable (corrupt, locked, permissions, or prior bad write)
2. `readProjects()` catches the error and returns `[]` (line 50-54 of ElectronStorageService)
3. App sees 0 projects → creates default empty project → auto-save writes `[{empty}]`
4. `writeProjects()` first calls `createBackup()` which copies the now-bad `projects.json` to `.backup`
5. Both files now contain garbage. All data permanently lost.

Two separate problems:
1. **No backup versioning** — single `.backup` file is insufficient
2. **No write guard** — the system happily writes a near-empty dataset over a large one

### Solution

**Versioned timestamped backups** in the main process `storage:write` handler, with a rotation policy. Plus a **write guard** that refuses to overwrite a substantially larger file with a near-empty one without explicit override.

### Architecture Placement

All changes are in the **main process** (`src/main/main.ts` storage handlers). The renderer, `ElectronStorageService`, `PersistentProjectStore`, and `StorageClient` remain unchanged. This is purely a backend resilience layer — the renderer doesn't need to know backups are versioned.

## LLD

### 1. Versioned Backup on Write

Modify the `storage:write` IPC handler in `main.ts`. Before the atomic write:

```typescript
// Instead of single .backup, create timestamped version
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const versionedBackupPath = join(storagePath, `${filename}.${timestamp}.backup`);

if (existsSync(filePath)) {
  await copyFile(filePath, versionedBackupPath);
}
```

This produces files like: `projects.json.2026-02-14T15-30-00-000Z.backup`

### 2. Rotation Policy

After creating a versioned backup, prune old ones:

- **Keep**: Last 10 versioned backups per file
- **Implementation**: Read directory, filter for `{filename}.*.backup` pattern, sort by timestamp descending, delete everything beyond the 10th

10 backups of `projects.json` at ~17KB each = ~170KB. Negligible.

### 3. Write Guard

Before writing, compare the incoming data against the existing file:

```typescript
// Only for projects.json (not app-state.json or other small files)
if (filename === 'projects.json' && existsSync(filePath)) {
  const existing = await readFile(filePath, 'utf-8');
  const existingParsed = JSON.parse(existing);
  const incomingParsed = JSON.parse(data);

  if (Array.isArray(existingParsed) && Array.isArray(incomingParsed)) {
    // Refuse to overwrite N projects with 0-1 projects unless explicit
    if (existingParsed.length > 2 && incomingParsed.length <= 1) {
      console.error(
        `Write guard: refusing to overwrite ${existingParsed.length} projects with ${incomingParsed.length}`
      );
      return { success: false, error: 'Write guard: significant data reduction detected' };
    }
  }
}
```

This catches the exact cascading-loss scenario: app loads empty, tries to write 1 project over 6+. The guard blocks it. The user can still explicitly delete projects one at a time (each delete reduces count by 1, which the guard allows).

### 4. Startup Recovery Improvement

In `ElectronStorageService.readProjects()`, if the main file and `.backup` both fail, scan for versioned backups and try the most recent one:

```typescript
// Current: returns [] on any error
// New: try versioned backups before giving up
```

This is a renderer-side change in `ElectronStorageService` that requires a new IPC channel (`storage:list-backups`) to discover versioned backup files from the main process.

### 5. Files Changed

| File | Change | Effort |
|------|--------|--------|
| `src/main/main.ts` | Versioned backup in `storage:write`, rotation, write guard | 3 |
| `src/main/main.ts` | New `storage:list-backups` IPC handler | 1 |
| `src/services/storage/ElectronStorageService.ts` | Fallback to versioned backups in `readProjects()` | 1 |
| `src/preload/preload.ts` | Expose `storage.listBackups` | 1 |
| `src/services/storage/StorageClient.ts` | Type declaration for `listBackups` | 1 |

**Total relative effort: 3** (most logic is concentrated in `main.ts`)

### 6. What This Does NOT Do

- Does not change the renderer persistence flow
- Does not add UI for browsing/restoring backups (possible future enhancement)
- Does not change the auto-save debounce timing
- Does not fix bug #29 (projectPath loss on switch) — that's a separate issue

### Dependencies

- Slice 110 (persistence) — this feature modifies the persistence layer it established
- No new dependencies introduced

### Risks

- **Rotation race**: If two writes happen simultaneously, rotation could delete a backup the other write just created. Mitigated by the fact that writes are serialized through IPC (single main process thread handles all `storage:write` calls sequentially).
- **Clock skew**: Timestamps use `Date.now()` on the local machine. Not a real concern for local backup naming.
