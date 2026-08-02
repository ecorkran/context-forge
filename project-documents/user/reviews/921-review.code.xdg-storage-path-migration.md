---
docType: review
layer: project
reviewType: code
slice: xdg-storage-path-migration
project: context-forge
verdict: CONCERNS
sourceDocument: project-documents/user/slices/921-slice.xdg-storage-path-migration.md
aiModel: minimax/minimax-m3
status: complete
dateCreated: 20260801
dateUpdated: 20260801
findings:
  - id: F001
    severity: concern
    category: error-handling
    summary: "Silent fallback for invalid env var values"
    location: packages/core/src/storage/storagePaths.ts:62-64
  - id: F002
    severity: concern
    category: testing
    summary: "Tests assert on real `env-paths` resolution, coupling test to library behavior"
    location: packages/core/tests/storage/storagePaths.test.ts:17,140-147
  - id: F003
    severity: concern
    category: testing
    summary: "`getStoragePath()` not covered by new tests"
    location: packages/core/src/storage/storagePaths.ts:78-80
  - id: F004
    severity: concern
    category: design
    summary: "Migration runs on every command, even after success"
    location: packages/core/src/storage/storagePaths.ts:39-48
  - id: F005
    severity: concern
    category: design
    summary: "`process.env` not injected into `StoragePathDeps`"
    location: packages/core/src/storage/storagePaths.ts:55-60
  - id: F006
    severity: note
    category: typing
    summary: "`mkdirSync` parameter type is `string` but default wraps options form"
    location: packages/core/src/storage/storagePaths.ts:12
  - id: F007
    severity: note
    category: logging
    summary: "`console.log` / `console.error` for migration messaging"
    location: packages/core/src/storage/storagePaths.ts:45,51
  - id: F008
    severity: pass
    category: testing
    summary: "Test mocks `node:fs` correctly with `importOriginal` passthrough"
    location: packages/core/tests/introspection/ConsistencyChecker.test.ts:23-32
  - id: F009
    severity: pass
    category: error-handling
    summary: "Migration handles failure safely"
    location: packages/core/src/storage/storagePaths.ts:44-53
  - id: F010
    severity: pass
    category: design
    summary: "`StoragePathDeps` is a good testability seam"
    location: packages/core/src/storage/storagePaths.ts:6-13
---

# Review: code — slice 921

**Verdict:** CONCERNS
**Model:** minimax/minimax-m3

## Findings

### [CONCERN] Silent fallback for invalid env var values

`resolveStoragePath` reads `process.env.CONTEXT_FORGE_DATA_DIR` and returns it verbatim without validation. CLAUDE.md explicitly says: "Never use silent fallback values. Fail explicitly with errors or obviously-placeholder values." If `CONTEXT_FORGE_DATA_DIR` is set to an empty string (`""`) — e.g. `export CONTEXT_FORGE_DATA_DIR=` in a shell — the `if (process.env.CONTEXT_FORGE_DATA_DIR)` check treats it as truthy-ish (actually falsy here, good), but if someone sets it to a relative path like `"."` or a path with embedded nulls, the code happily returns it. Consider validating that the override is a non-empty absolute path and throwing otherwise, or at least asserting on the empty-string case explicitly. The current behavior is mostly fine, but documenting the contract (must be absolute, non-empty) and asserting it would match project guidelines.

### [CONCERN] Tests assert on real `env-paths` resolution, coupling test to library behavior

`const expectedNonDarwinPath = envPaths('context-forge', { suffix: '' }).config;` is computed at module load time on whatever machine runs the test. On a macOS developer machine, `env-paths` returns `~/Library/Preferences/context-forge` for darwin — which is exactly the *legacy* path this PR is moving away from. On Linux it returns `~/.config/context-forge`. So `case 6: linux is unaffected` and `case 7: windows is unaffected` rely on `env-paths` to do the right thing on each platform. That's defensible, but the test as written will silently pass on the wrong OS: a developer running locally on macOS sees `expectedNonDarwinPath = ~/Library/Preferences/context-forge`, and the linux test will still match whatever `env-paths` produces on darwin. Consider asserting the platform in the test, or skipping the linux/windows assertions when the host isn't that platform, with a clear note.

### [CONCERN] `getStoragePath()` not covered by new tests

The public `getStoragePath()` function is the entrypoint most callers use, but the new test file only exercises `resolveStoragePath` directly with injected `deps`. Add at least one test that calls `getStoragePath()` to confirm the default-deps wiring works end-to-end (e.g. on a real platform, returns the env-paths-derived value, respects override). This is the test-with-not-test-after gap: the production entrypoint is unverified.

### [CONCERN] Migration runs on every command, even after success

`migrateLegacyPreferences` correctly short-circuits when the new path already exists, but it still calls `existsSync(legacyPath)` on every invocation. For a CLI that runs `resolveStoragePath` on every command, that's an extra stat() per process start in the common case (post-migration). A marker file (e.g. `.migrated-from-prefs`) or a one-shot env-file would eliminate the recurring syscall. This is a CONCERN, not FAIL — the cost is small — but the design leaves a per-invocation filesystem check that could be removed.

### [CONCERN] `process.env` not injected into `StoragePathDeps`

`resolveStoragePath` reads `process.env.CONTEXT_FORGE_DATA_DIR` directly, but every other platform/os/fs dependency is injected via `StoragePathDeps`. This makes the env-var path untestable through the deps interface and creates an inconsistency. The new test file works around this by mutating `process.env` directly in `beforeEach`/`afterEach`, which is fine but coupling. Consider adding `env: NodeJS.ProcessEnv` to `StoragePathDeps` and defaulting it to `process.env`, so the override path is testable with the same injection pattern as everything else.

### [NOTE] `mkdirSync` parameter type is `string` but default wraps options form

```ts
mkdirSync: (path: string) => void;
```

The default implementation calls `fsMkdirSync(path, { recursive: true })` (with options), but the interface signature only accepts a path. This is fine because the recursive flag is always used and the second arg is purely a default detail — but it means callers can never pass a non-recursive `mkdirSync`. Since the intent is "always recursive," either rename the interface member to `mkdirSyncRecursive` or document that the second arg is intentionally absent. Minor naming clarity issue.

### [NOTE] `console.log` / `console.error` for migration messaging

The migration uses `console.log` for success and `console.error` for failure, which is appropriate for a CLI utility — but the codebase has a logger convention in `CLAUDE.md` ("log at ERROR level with logger.exception" is mentioned for exception handling). If there's a shared logger elsewhere in the project, prefer it over raw `console.*` so output formatting and log levels are consistent. This is a NOTE because for a one-time migration message raw `console` is reasonable, and the test file mocks `console.log`/`console.error` directly which would break if a logger were used without updating the test.

### [PASS] Test mocks `node:fs` correctly with `importOriginal` passthrough

The updated mock spreads the original `node:fs` exports and only overrides `existsSync`. The previous version replaced the entire module with a partial mock, which would have broken any code under test that uses other fs APIs. The diff comment is accurate: "other fs exports pass through unmocked." Good catch and correct fix.

### [PASS] Migration handles failure safely

`renameSync` is atomic on a single filesystem, so a failure leaves the source directory intact — and the surrounding `try/catch` logs and falls through to fresh-location behavior rather than throwing. This is the right call for a non-blocking migration: failing the user's primary command because of a convenience upgrade would be hostile. The error message tells the user how to recover manually.

### [PASS] `StoragePathDeps` is a good testability seam

Injecting `platform`, `homedir`, `existsSync`, `mkdirSync`, and `renameSync` cleanly separates the production code from the filesystem, and the new test file uses it well — including simulating `EACCES` by throwing from a fake `renameSync`. This is the right pattern for code that touches the OS.
