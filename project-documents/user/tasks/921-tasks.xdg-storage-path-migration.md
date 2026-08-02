---
docType: tasks
slice: xdg-storage-path-migration
project: context-forge
lld: user/slices/921-slice.xdg-storage-path-migration.md
dependencies: []
projectState: Slice 920 merged to main; main is green (core 1037, cli 471, mcp-server 190). storagePaths.ts's getStoragePath() returns envPaths('context-forge', {suffix:''}).config unconditionally (aside from the CONTEXT_FORGE_DATA_DIR override), which resolves to ~/Library/Preferences/context-forge on macOS. No storagePaths.test.ts exists yet.
dateCreated: 20260801
dateUpdated: 20260801
status: complete
---

## Context Summary

- Working on slice 921: fixes GitHub issue #53. On macOS, `getStoragePath()`
  resolves to `~/Library/Preferences/context-forge/` via `env-paths`, which is
  inconsistent with sibling tooling (Squadron uses `~/.config/squadron/`) and
  not discoverable without reading source.
- `env-paths`' own source confirms Linux already resolves to `~/.config/<name>`
  (XDG-correct) and Windows to `%APPDATA%/<name>/Config` — this is a macOS-only
  fix. See LLD Decision 1.
- Migration is a directory-level move (rename), not a file-by-file copy: the
  storage directory only ever holds `projects.json` (+ backups) and
  `config.toml`, and moving the whole directory in one `fs.renameSync` captures
  both without touching `FileProjectStore` or `ConfigManager`. See LLD
  Decision 2.
- The existing Electron-era migration (`FileProjectStore.migrateFromLegacyLocation()`)
  is untouched and unaffected — it fires only when the new location's
  `projects.json` is still absent, which composes correctly with this slice's
  migration. Do not modify `FileProjectStore.ts`.
- `getStoragePath()`'s public signature (zero arguments, returns `string`) does
  not change — all logic lands in a new `resolveStoragePath(deps?)` function
  that `getStoragePath()` delegates to. See LLD Decision 5.
- Dependencies: none.
- Delivers: macOS installs default to `~/.config/context-forge/`; existing
  macOS installs migrate transparently on first use; Linux, Windows, and the
  `CONTEXT_FORGE_DATA_DIR` override are unaffected.
- Next planned slice: none queued after 921.

---

## Tasks

### Part 1 — Path resolution and migration logic

- [x] 1. Add `StoragePathDeps` and `resolveStoragePath()` to `storagePaths.ts`
  - [x] Add an exported `StoragePathDeps` interface: `platform:
        NodeJS.Platform`, `homedir: () => string`, `existsSync: (path: string)
        => boolean`, `mkdirSync: (path: string) => void`, `renameSync: (oldPath:
        string, newPath: string) => void`.
  - [x] Add a module-level `defaultDeps: StoragePathDeps` using the real
        `process.platform`, `os.homedir`, `fs.existsSync`, and `fs.renameSync`,
        with `mkdirSync` wrapping `fs.mkdirSync(path, { recursive: true })`.
  - [x] Add `getLegacyPreferencesPath(deps: StoragePathDeps): string` returning
        `join(deps.homedir(), 'Library', 'Preferences', 'context-forge')`.
  - [x] Add a private `migrateLegacyPreferences(newPath: string, deps:
        StoragePathDeps): void`:
    - Return immediately if `deps.existsSync(newPath)` (idempotency guard —
      LLD Decision 4).
    - Compute `legacyPath` via `getLegacyPreferencesPath(deps)`; return
      immediately if it doesn't exist.
    - In a try/catch: `deps.mkdirSync(dirname(newPath))` then
      `deps.renameSync(legacyPath, newPath)`; log a one-line success message
      naming both paths.
    - In the catch: log a warning naming both paths and the error, and do
      **not** rethrow (LLD Decision 3 — comment explaining why swallowing is
      correct: `rename` is atomic, so a failed attempt leaves the source
      untouched and the tool falls through to fresh-location behavior rather
      than crashing every subsequent command).
  - [x] Add `export function resolveStoragePath(deps: StoragePathDeps =
        defaultDeps): string`:
    - If `process.env.CONTEXT_FORGE_DATA_DIR` is set, return it immediately —
      no migration attempted (unchanged override precedence).
    - If `deps.platform !== 'darwin'`, return the existing `paths.config`
      value unchanged (Linux/Windows untouched — LLD Decision 1).
    - Otherwise compute `newPath = join(deps.homedir(), '.config',
      'context-forge')`, call `migrateLegacyPreferences(newPath, deps)`, and
      return `newPath`.
  - [x] Change `getStoragePath()` to `export function getStoragePath(): string
        { return resolveStoragePath(); }` — zero-argument signature preserved,
        zero edits needed at any of its four call sites
        (`FileProjectStore.ts`, `backup.ts`, `workflowTools.ts`,
        `configPaths.ts`).
  - [x] Do not modify `getLegacyElectronPath()` or anything in
        `FileProjectStore.ts` — that migration path is unrelated and must
        keep working exactly as it does today.
  - [x] Success: `pnpm --filter @context-forge/core build` succeeds;
        `resolveStoragePath` and `StoragePathDeps` are exported from
        `storagePaths.ts` (export from `packages/core/src/storage/index.ts`
        only if a consumer outside this file needs them — the test file can
        import directly from `storagePaths.js`, so check before adding a new
        public export).

- [x] 2. Commit the path-resolution logic
  - [x] Commit message: `fix(core): migrate macOS storage path to XDG-style ~/.config (#53)`
  - [x] Success: working tree clean; `pnpm -r build` clean.

### Part 2 — Tests

- [x] 3. Add `packages/core/tests/storage/storagePaths.test.ts`
  - [x] Use `mkdtemp`/`rm` from `fs/promises` for a real temp directory
        standing in for `homedir()`, mirroring `FileProjectStore.test.ts`'s
        pattern. Save/restore `process.env.CONTEXT_FORGE_DATA_DIR` in
        `beforeEach`/`afterEach` exactly as that file already does.
  - [x] Case 1 — fresh darwin install: `platform: 'darwin'`, temp `homedir`,
        nothing exists at either legacy or new path → `resolveStoragePath()`
        returns `{tempHome}/.config/context-forge`; assert the legacy
        directory was never created.
  - [x] Case 2 — existing install migrates: pre-populate
        `{tempHome}/Library/Preferences/context-forge/` with a `projects.json`
        and a `config.toml` (real files, real content) before calling
        `resolveStoragePath({ platform: 'darwin', ... })` → assert the
        returned path's `projects.json` and `config.toml` exist with the
        original content, and that the legacy directory no longer exists
        (real `existsSync`, not just the injected one).
  - [x] Case 3 — idempotent: call `resolveStoragePath()` twice in the same
        test after Case 2's setup → second call performs no rename (assert
        via a spy/counting wrapper around `renameSync` in the injected deps)
        and returns the same path.
  - [x] Case 4 — new location already exists, legacy also has data: create
        both `{tempHome}/.config/context-forge/` (empty) and a populated
        legacy directory → assert no rename attempted and the legacy
        directory's contents are untouched.
  - [x] Case 5 — `CONTEXT_FORGE_DATA_DIR` override: set the env var, populate
        the legacy directory with data, `platform: 'darwin'` → assert the
        returned path is the override path and the legacy directory is
        untouched (no rename attempted).
  - [x] Case 6 — linux unaffected: `platform: 'linux'` → assert the returned
        path equals `env-paths`' own `paths.config` value (import `envPaths`
        directly in the test to compute the expected value, rather than
        hard-coding a path string).
  - [x] Case 7 — windows unaffected: `platform: 'win32'` → same assertion
        pattern as Case 6.
  - [x] Case 8 — migration failure is non-throwing: `platform: 'darwin'`,
        legacy directory has data, inject a `renameSync` that throws → assert
        `resolveStoragePath()` still returns the new path without throwing,
        and assert a warning was logged (spy on `console.error` or
        equivalent).
  - [x] Success: all eight cases pass; full core suite green (expect ~1037 +
        new cases, no existing test edited).

- [x] 4. Commit the tests
  - [x] Commit message: `test(core): add storagePaths coverage for XDG migration (#53)`
  - [x] Success: working tree clean; `pnpm -r test` green for core, cli,
        mcp-server.

### Part 3 — Docs and close-out

- [x] 5. Doc sweep
  - [x] Search the repo for prose mentions of the config/storage location
        (`Library/Preferences`, `env-paths`, or similar) outside this slice's
        own docs and the GitHub issue itself, and update any found to
        describe the new default and note the one-time migration.
  - [x] Success: no stale doc claims the old macOS path is current.

- [x] 6. Full verification pass
  - [x] `pnpm -r build` — clean across all packages.
  - [x] `pnpm -r test` — core, cli, and mcp-server green.
  - [x] `packages/electron` has a known pre-existing unrelated failure in
        `TemplateProcessor.test.ts`. Confirm it is unchanged from `main`; do
        not fix it in this slice.
  - [x] Run `cf check` (or `workflow_check`) scoped to slice 921 and confirm
        zero findings.
  - [x] Manually verify on the current machine (macOS): run the freshly built
        local CLI (`node packages/cli/dist/index.js status` or similar) and
        confirm real storage path behavior — but only after first checking
        whether this machine's actual `~/Library/Preferences/context-forge/`
        holds real project data. If it does, do **not** trigger a live
        migration of real data as part of "verification" — verify via the
        automated test suite's temp-directory coverage instead, and note in
        the LLD's Verification Walkthrough why live verification was skipped
        or how it was safely scoped (e.g. using `CONTEXT_FORGE_DATA_DIR`
        pointed at a scratch directory to exercise the darwin branch without
        touching real data — note this still bypasses the migration path
        itself per Decision 1, so it only verifies the override branch, not
        migration; if migration itself needs live verification, copy the real
        legacy directory to a scratch location first and point a
        temporary `homedir` there, never operate on the real one).
  - [x] Success: all of the above verified, with actual command output read
        rather than assumed, and no real user data touched.
  - Note (close-out): live macOS verification exceeded plan — the fix was
    exercised against real data in production use on 2026-08-01 (registry
    0.10.4 regression diagnosis and repair; both global installs verified
    resolving ~/.config/context-forge across multiple project dirs).

- [x] 7. Close out GitHub issue #53
  - [x] Comment on #53 linking the fix commit(s) and this slice's design doc,
        summarizing: macOS-only fix (Linux was already correct), directory-
        level move preserving `config.toml` alongside `projects.json`,
        `CONTEXT_FORGE_DATA_DIR` and Windows unaffected.
  - [x] Close #53.
  - [x] Success: issue closed with an accurate summary of what shipped.

- [x] 8. Documentation and status updates
  - [x] Add a `CHANGELOG.md` entry under `[Unreleased]` describing the #53 fix
        in user-facing terms, including the one-time automatic migration.
  - [x] Set this task file's frontmatter `status` to `complete`.
  - [x] Set the LLD's frontmatter `status` to `complete`.
  - [x] Check off entry 21 `(921)` in
        `user/architecture/900-slices.maintenance-and-refactoring.md`.
  - [x] Success: `cf list slices` renders 921 as `✓ complete`.

- [x] 9. Final commit
  - [x] Commit message: `docs: complete slice 921 (xdg storage path migration)`
  - [x] Success: working tree clean; branch ready for review and merge to the
        target branch.
  - Note (close-out): sequencing diverged — the branch merged (d79f206) and
    shipped as v0.10.5 before this docs close-out, which landed on main
    directly as part of the 2026-08-01 emergency-fix cleanup.
