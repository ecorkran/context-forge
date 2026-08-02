---
docType: slice-design
slice: xdg-storage-path-migration
project: context-forge
parent: project-documents/user/architecture/900-slices.maintenance-and-refactoring.md
dependencies: []
interfaces: []
dateCreated: 20260801
dateUpdated: 20260801
status: not-started
---

# Slice Design: User Storage Path — macOS XDG Consistency

## Overview

Fixes GitHub issue #53. `getStoragePath()` — the single function every persisted
read/write in Context Forge depends on (`projects.json`, `config.toml`, versioned
backups) — resolves via the `env-paths` package to `~/Library/Preferences/context-forge/`
on macOS. That location is Apple-specific, meant historically for plist files
rather than hand-edited TOML, not where a developer looks for config, and
inconsistent with sibling tooling (Squadron stores its config under
`~/.config/squadron/`). The reporting incident: locating `config.toml` to remove
a stray user-scope key required reading `getStoragePath()`'s source rather than
guessing the path.

The fix adds a macOS-specific default of `~/.config/context-forge/` and migrates
any existing install transparently by moving (renaming) the whole legacy
directory into the new location the first time it's needed.

## Current Behavior (confirmed by code reading)

[storagePaths.ts](packages/core/src/storage/storagePaths.ts):

```ts
const paths = envPaths('context-forge', { suffix: '' });

export function getStoragePath(): string {
  return process.env.CONTEXT_FORGE_DATA_DIR || paths.config;
}
```

`env-paths`' own source (`node_modules/env-paths/index.js`) resolves `config` per
platform:

| Platform | `config` resolves to |
|---|---|
| macOS | `~/Library/Preferences/<name>` |
| Linux | `$XDG_CONFIG_HOME/<name>` or `~/.config/<name>` (already XDG-correct) |
| Windows | `%APPDATA%/<name>/Config` |

So **only macOS is out of line** with the desired `~/.config/<name>` convention —
Linux already resolves there today via `env-paths`' own XDG handling. This
narrows the fix considerably from what the issue title implies.

`getStoragePath()`'s directory holds exactly two things in practice, confirmed by
searching every consumer: `projects.json` (+ `.backup` and timestamped
`.<ts>.backup` versions, written by [FileProjectStore.ts](packages/core/src/storage/FileProjectStore.ts)
and [backupService.ts](packages/core/src/storage/backupService.ts)) and
`config.toml` (written by [ConfigManager.ts](packages/core/src/config/ConfigManager.ts)
via [configPaths.ts](packages/core/src/config/configPaths.ts)). No other files or
subdirectories are ever written there.

There is already a precedent for a legacy-location migration, but it is narrower
than what this issue needs: `FileProjectStore.migrateFromLegacyLocation()`
([FileProjectStore.ts:140-165](packages/core/src/storage/FileProjectStore.ts#L140-L165))
copies (not moves) `projects.json` — and only that file — from the pre-monorepo
Electron storage location (`~/Library/Application Support/context-forge/context-forge/`,
via `getLegacyElectronPath()`) the first time `FileProjectStore` finds no data at
the new location. It never touches `config.toml`, and it leaves the old file in
place. That precedent is reused conceptually (lazy, guarded, one-directional) but
not reused as code — see Decision 2.

## Value

Consistency with sibling tooling and standard macOS/Linux developer expectations;
a config file a developer can actually find without reading source. Low user
count today makes this the cheapest point in the project's life to make the
change — the migration path only gets more consequential the more installs exist.

## Technical Scope

**Included:**

- A macOS-specific default storage path: `~/.config/context-forge/`.
- A one-time, transparent move (rename) of `~/Library/Preferences/context-forge/`
  into the new location, run lazily inside `getStoragePath()`'s resolution path.
- Dependency-injectable path-resolution logic so the macOS-only branch and the
  migration are unit-testable regardless of the platform running the test suite
  (Decision 5).
- Unit tests covering fresh install, existing-install migration, override
  precedence, idempotency, and failure handling.
- A doc sweep for any place that states the config location.

**Explicitly excluded:**

- `getLegacyElectronPath()` / `migrateFromLegacyLocation()` in `FileProjectStore` —
  a separate, older migration (Electron era → env-paths era) that stays exactly
  as it is. It still runs, unaffected, after this slice's migration: it only
  fires when the new location's `projects.json` is still absent, which remains
  true immediately after this slice's directory-level move restores it.
- Linux behavior — already correct, per the table above.
- Windows behavior — the issue explicitly deferred this decision ("decide during
  design"); nothing in the current backlog asks for a Windows change, and
  `%APPDATA%` is the platform-idiomatic location there. Out of scope.
- A `cf` command for manual/forced migration. Automatic-on-first-run satisfies
  the issue's acceptance criteria without additional CLI surface.

## Technical Decisions

### Decision 1: Scope the override to `darwin` only

Confirmed against `env-paths`' source (table above): Linux already resolves
`paths.config` to `~/.config/context-forge` (or `$XDG_CONFIG_HOME` if set), so
applying an override there would be a no-op at best and a divergence from
`env-paths`' own `XDG_CONFIG_HOME` handling at worst (this code doesn't currently
read `XDG_CONFIG_HOME` itself, and shouldn't start reimplementing it). The fix is
therefore: `if (platform === 'darwin') return '~/.config/context-forge'; else
return paths.config` — Linux and Windows both fall through unchanged.

### Decision 2: Migration is a directory-level move, not a file-level copy

Two reasons the existing `migrateFromLegacyLocation()` pattern doesn't fit:

1. It is scoped to `projects.json` specifically and has no equivalent for
   `config.toml` — `ConfigManager` reads `getUserConfigPath()` directly with no
   migration hook at all today. A file-by-file approach would need a second,
   near-duplicate migration for `config.toml`, and would miss any future file
   added to the storage directory unless remembered again.
2. It copies and leaves the source in place. The Project Manager explicitly
   asked for a move: no stale duplicate left behind at the old path.

Implementing the migration once, at the `storagePaths.ts` level — the one place
both `FileProjectStore` and `ConfigManager` ultimately depend on via
`getStoragePath()` — captures `projects.json`, `config.toml`, and any versioned
backups together as a single `fs.renameSync` of the whole directory. This is a
strict superset of file-by-file copying and requires no changes to
`FileProjectStore` or `ConfigManager` at all.

Composition with the existing Electron-era migration: unaffected. That migration
only fires when the *new* location's `projects.json` is absent
(`FileProjectStore.ensureInitialized()`'s `hasData` check). Immediately after
this slice's directory move, `projects.json` exists at the new location if it
existed at the old one — so the Electron-era fallback correctly stays silent in
that case, and still correctly fires for the (now rare) case of a user who never
had a Preferences-era install at all.

### Decision 3: Failure handling — best-effort, never destructive

Wrap the rename in try/catch. On failure (permission error, unexpected `EXDEV`
if the two paths ever resolved to different filesystems — implausible since both
are under `$HOME`, but not impossible), log a warning and continue: the caller
falls through to normal fresh-location behavior. This is a deliberate, commented
exception swallow (per the project's exception-handling rule) — `rename` is
atomic from the caller's perspective (it either fully completes or leaves the
source untouched), so a failed migration never partially moves or loses data;
the user's data remains exactly where it was, and the only cost of a failure is
that the tool temporarily behaves as though it's a fresh install until the
directory is moved manually or the transient failure clears.

### Decision 4: Idempotency guard doubles as the "already migrated" check

Skip migration entirely whenever the new location already exists (even empty).
This is the single guard that makes the migration safe to run on every
`getStoragePath()` call, forever, with no separate "have we already checked this
process" flag needed: the first successful migration creates the new directory,
so every subsequent call short-circuits on the existence check before touching
the filesystem further. It also means the migration never merges into or
overwrites an existing new-location directory — if one already exists (even
because a fresh install already wrote there), old Preferences-location data, if
any, is left untouched rather than silently discarded or merged.

### Decision 5: Dependency injection for testability

`process.platform` is fixed for the lifetime of the test runner's process, so a
plain `if (process.platform === 'darwin')` cannot be exercised on non-macOS CI
without mocking global state. Following the existing `BackupFsDeps` pattern in
[backupService.ts](packages/core/src/storage/backupService.ts) (injectable
`existsSync`/`copyFile`/`readdir`/`unlink`, defaulted to real `fs` in
production), add a small `StoragePathDeps` interface (`platform`, `homedir`,
`existsSync`, `mkdirSync`, `renameSync`) with a `resolveStoragePath(deps =
defaultDeps)` function that contains all the branching and migration logic.
`getStoragePath()` itself stays a zero-argument wrapper —
`export function getStoragePath(): string { return resolveStoragePath(); }` — so
its signature and every existing call site (`FileProjectStore`, `backup.ts`,
`workflowTools.ts`, `configPaths.ts`) are completely unaffected. Tests call
`resolveStoragePath()` directly with a fake `darwin` deps object and a temp
directory standing in for `homedir()`.

`process.env.CONTEXT_FORGE_DATA_DIR` is read directly rather than injected —
`FileProjectStore.test.ts` already establishes the convention of setting/
restoring that env var directly in `beforeEach`/`afterEach`, so there is no need
for a second injection mechanism covering the same concern.

## Architecture

### Component Structure

```
packages/core/src/storage/storagePaths.ts
  StoragePathDeps                  (new — platform/homedir/fs injection point)
  defaultDeps                      (new — real process.platform/os/fs)
  getLegacyPreferencesPath()       (new — ~/Library/Preferences/context-forge)
  resolveStoragePath(deps?)        (new — override precedence + darwin branch + migration)
  getStoragePath()                 (unchanged signature; now delegates to resolveStoragePath())
  getLegacyElectronPath()          (unchanged — separate, older migration source)
```

### Resolution Flow

```
getStoragePath()
  │
  ▼
resolveStoragePath(deps = defaultDeps)
  │
  ├─ CONTEXT_FORGE_DATA_DIR set? ──yes──▶ return it (no migration attempted)
  │
  ├─ platform !== darwin? ──yes──▶ return env-paths' paths.config (Linux/Windows, unchanged)
  │
  └─ darwin:
       newPath = ~/.config/context-forge
       ├─ newPath exists? ──yes──▶ return newPath (already migrated or fresh)
       └─ no:
            legacyPath = ~/Library/Preferences/context-forge
            ├─ legacyPath exists? ──no───▶ return newPath (genuinely fresh install)
            └─ yes: try { mkdir + rename(legacyPath → newPath) } catch { log, fall through }
                 return newPath
```

## Success Criteria

### Functional Requirements

1. Fresh macOS install (nothing at either location): `getStoragePath()` returns
   `~/.config/context-forge`, and no migration attempt is logged.
2. Existing macOS install with data only at
   `~/Library/Preferences/context-forge/` (`projects.json`, `config.toml`, and at
   least one versioned backup file): after one call to `getStoragePath()`, that
   directory no longer exists, and `~/.config/context-forge/` contains its former
   contents byte-identical.
3. `CONTEXT_FORGE_DATA_DIR`, when set, is returned as-is; no migration is
   attempted regardless of what exists at either the legacy or new default path.
4. Linux: `resolveStoragePath()` returns the same value as before this slice
   (`env-paths`' `paths.config`) — confirmed by a test that injects
   `platform: 'linux'`.
5. Windows: same — `resolveStoragePath()` returns `paths.config` unchanged,
   confirmed by a test that injects `platform: 'win32'`.
6. Calling `getStoragePath()` a second time after a successful migration does not
   attempt to move anything again (guarded by the new-location existence check)
   and returns the same path both times.
7. If the new location already exists (even empty) and the legacy location also
   has data, no migration is attempted and the legacy data is left untouched.

### Technical Requirements

8. A simulated migration failure (injected `renameSync` that throws) logs a
   warning via `console.error` or equivalent and does not throw out of
   `resolveStoragePath()` / `getStoragePath()`.
9. `pnpm -r build` clean; `pnpm -r test` green for core, cli, and mcp-server
   (`packages/electron`'s known pre-existing unrelated failure unchanged).
10. No new `any`. `getStoragePath()`'s public signature is unchanged (zero
    arguments, returns `string`) — every existing call site compiles with zero
    edits.
11. New tests use injected `StoragePathDeps` (following the `BackupFsDeps`
    pattern) rather than mocking `process.platform` globally or touching the
    real `$HOME`.

## Implementation Notes

### Development Approach

1. Add `StoragePathDeps`, `defaultDeps`, `getLegacyPreferencesPath()`, and
   `resolveStoragePath()` to `storagePaths.ts`. Keep `getStoragePath()` as a
   trivial wrapper — this is the one change that must produce zero diffs
   anywhere else in the codebase.
2. `pnpm --filter @context-forge/core build` and run the existing
   `FileProjectStore.test.ts` suite unedited — it already sets
   `CONTEXT_FORGE_DATA_DIR` in every test, so the override-precedence branch is
   exercised and must stay green throughout.
3. Add the new `storagePaths.test.ts` covering the criteria above, using
   `mkdtemp`/`rm` for real temp directories (mirroring
   `FileProjectStore.test.ts`) with an injected `homedir` pointing at the temp
   root, rather than mocking the real filesystem's `os.homedir()`.
4. Full verification pass (build + all three suites) and a doc sweep — search
   the repo for `Library/Preferences` and `env-paths` in prose docs (e.g. any
   `README.md` mention of the config location) and update them to describe the
   new default, noting the migration.

### Testing Strategy

New tests in `packages/core/tests/storage/storagePaths.test.ts`:

| # | scenario | deps | expect |
|---|---|---|---|
| 1 | fresh darwin install | `platform: darwin`, temp `homedir`, nothing exists | returns `{home}/.config/context-forge`, no rename called |
| 2 | existing install migrates | `platform: darwin`, legacy dir pre-populated with `projects.json` + `config.toml` | rename called once; returned path is the new location |
| 3 | already migrated (idempotent) | `platform: darwin`, new location already exists | no rename attempted |
| 4 | new location exists, legacy also has data | `platform: darwin`, both exist | no rename attempted, legacy left as-is |
| 5 | `CONTEXT_FORGE_DATA_DIR` override | env var set, `platform: darwin`, legacy has data | returns the override path; no rename attempted |
| 6 | linux unaffected | `platform: linux` | returns `paths.config` unchanged |
| 7 | windows unaffected | `platform: win32` | returns `paths.config` unchanged |
| 8 | migration failure is non-throwing | `platform: darwin`, legacy has data, injected `renameSync` throws | `resolveStoragePath()` returns normally (new path), warning logged |
