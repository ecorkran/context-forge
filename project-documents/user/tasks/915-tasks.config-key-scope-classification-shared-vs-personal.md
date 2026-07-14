---
docType: tasks
slice: config-key-scope-classification-shared-vs-personal
project: context-forge
lld: user/slices/915-slice.config-key-scope-classification-shared-vs-personal.md
dependencies: [914]
projectState: >
  914 (git.integration_branch rename) and the 916 guide-update-branch-guard slice are both
  complete on main. ConfigManager currently has one project-scoped file
  (.context-forge.toml via getProjectConfigPath) plus one user-scoped file
  ({storagePath}/config.toml via getUserConfigPath), with precedence project → user →
  default. CONFIG_KEYS (packages/core/src/config/ConfigKeys.ts) has no scope field yet —
  all 14 existing keys are undifferentiated. No .context-forge.local.toml, no
  getProjectPersonalConfigPath, no migrate-personal command, and no gitignore-writing logic
  anywhere in packages/cli or packages/core exist yet. cf init (packages/cli/src/commands/init.ts)
  writes no .gitignore at all today.
dateCreated: 20260713
dateUpdated: 20260714
status: complete
---

## Context Summary
- Working on slice 915: Config Key Scope Classification (Shared vs. Personal)
- Adds a required `scope: 'shared' | 'personal'` field to `ConfigKeyDefinition`, classifies all 11 existing `CONFIG_KEYS` entries (only `git.integration_branch` is `personal`)
- Adds a second project-scoped config file, `.context-forge.local.toml`, via a new `getProjectPersonalConfigPath()` helper
- `ConfigManager.get/set/delete` route project-scope reads/writes to whichever file the key's `scope` maps to, transparently — callers keep passing `scope: 'project'`, no call-site changes
- New read precedence: project-personal → project-shared → user → default, with a read-time fallback so a personal key already sitting in the shared file (pre-existing-commit case) still resolves correctly
- New `ConsistencyChecker` rule flags personal keys found in the shared file; new `cf config migrate-personal` command moves them, with explicit collision semantics (skip-and-report, never silently overwrite the personal file)
- `cf init` gains a minimal `.gitignore` ensure-step for `.context-forge.local.toml` only
- MCP `configTools.ts` surfaces both project config paths in `config_get`
- Full design detail, including the collision-semantics table and failure-mode handling, lives in `user/slices/915-slice.config-key-scope-classification-shared-vs-personal.md` — tasks reference it rather than duplicating it
- Next planned slice: none currently sequenced beyond this one in the 900-band maintenance initiative

## Tasks

### 1. Setup

- [x] **1.1 Create slice branch and verify starting state**
  - [x] Read `git.integration_branch` for `context-forge` (`cf config get git.integration_branch --project context-forge` or run from repo root with no flag); target is that value if set, else `main`
  - [x] Verify on the target branch, working tree clean
  - [x] Create branch: `git checkout -b 915-slice.config-key-scope-classification-shared-vs-personal <target>`
  - [x] Run `pnpm -r build` — succeeds
  - [x] Run `pnpm test` — all tests pass (baseline before changes)
  - [x] Success: on correct branch, build and tests green

### 2. Registry: Scope Classification

- [x] **2.1 Add `scope` field to `ConfigKeyDefinition` and classify all keys**
  - [x] In `packages/core/src/config/ConfigKeys.ts`, add `scope: 'shared' | 'personal';` to the `ConfigKeyDefinition` interface (required, no default, no `?`)
  - [x] Set `scope: 'shared'` on all entries except `git.integration_branch`: `guide.auto_update`, `guide.source`, `guide.git_strategy`, `workflow.auto_advance`, `workflow.auto_fix`, `workflow.review_enabled`, `workflow.review_threshold`, `workflow.review_unknown_as`, `workflow.review_gates.code.threshold`, `workflow.review_gates.arch.threshold`, `workflow.review_gates.slice.threshold`, `workflow.review_gates.tasks.threshold`, `workflow.review_gate_effective_date`
  - [x] Set `scope: 'personal'` on `git.integration_branch`
  - [x] Success: `pnpm -w packages/core build` compiles with zero errors — making the field required means any missed entry is a compile error, not a runtime gap

- [x] **2.2 Test: every `CONFIG_KEYS` entry has a valid `scope`**
  - [x] Add a test in `packages/core/tests/config/ConfigKeys.test.ts` (create if it does not exist) asserting `Object.values(CONFIG_KEYS)` every entry's `scope` is exactly `'shared'` or `'personal'`
  - [x] Add a test asserting `CONFIG_KEYS['git.integration_branch'].scope === 'personal'` and spot-checking two other keys (e.g. `guide.source`, `workflow.review_enabled`) are `'shared'`
  - [x] Success: `pnpm test -w packages/core -- ConfigKeys` passes

### 3. Personal Config File Path Helper

- [x] **3.1 Add `getProjectPersonalConfigPath()`**
  - [x] In `packages/core/src/config/configPaths.ts`, add `export function getProjectPersonalConfigPath(projectPath: string): string` returning `join(projectPath, '.context-forge.local.toml')`, following the exact pattern of the existing `getProjectConfigPath`
  - [x] Export it from `packages/core/src/config/index.ts` alongside the existing path helpers
  - [x] Success: file saves, TypeScript compiles

- [x] **3.2 Test: `getProjectPersonalConfigPath()`**
  - [x] In `packages/core/tests/config/configPaths.test.ts` (create if it does not exist, otherwise extend it), test that `getProjectPersonalConfigPath('/some/project')` returns `/some/project/.context-forge.local.toml`
  - [x] Success: `pnpm test -w packages/core -- configPaths` passes

### 4. ConfigManager Routing and Precedence

- [x] **4.1 Implement scope-aware file routing in `ConfigManager.get()`**
  - [x] In `packages/core/src/config/ConfigManager.ts`, in `get(key)`: after resolving `def = CONFIG_KEYS[key]`, if `this.projectPath` is set and `def.scope === 'personal'`, read `getProjectPersonalConfigPath(this.projectPath)` first; if a value is found there, return it with `source: 'project-personal'`
  - [x] If not found in the personal file (or `def.scope === 'shared'`), fall through to the existing shared-project-file read (`getProjectConfigPath`), keeping `source: 'project'` for a value found there — this covers both the normal shared-key case and the pre-migration fallback for a personal key still sitting in the shared file
  - [x] Leave the subsequent user-config and default fallback branches unchanged
  - [x] Update `ConfigResult['source']` type to `'project-personal' | 'project' | 'user' | 'default'`
  - [x] Confirm `list()` needs no separate implementation change: it already delegates per-key to `get()` (`packages/core/src/config/ConfigManager.ts`, current `list()` body calls `await this.get(key)` for every `CONFIG_KEYS` entry and spreads the result) — once `get()`'s routing lands, `list()` inherits correct per-key `source` values automatically. If a future edit ever changes `list()` to read files directly instead of delegating to `get()`, that change must include the same routing logic as this task
  - [x] Success: file saves, TypeScript compiles

- [x] **4.2 Implement scope-aware file routing in `ConfigManager.set()` and `delete()`**
  - [x] In `set(key, value, scope)`: when `scope === 'project'`, resolve `filePath` to `getProjectPersonalConfigPath(this.projectPath!)` if `def.scope === 'personal'`, else `getProjectConfigPath(this.projectPath!)` (existing behavior) — `scope === 'user'` path is unchanged (always `getUserConfigPath()`, regardless of `def.scope`)
  - [x] Apply the identical routing logic in `delete(key, scope)`
  - [x] Success: file saves, TypeScript compiles

- [x] **4.3 Test: `ConfigManager` file routing and precedence**
  - [x] In `packages/core/tests/config/ConfigManager.test.ts`, using a temp directory per test (existing pattern in this file), test: `set('git.integration_branch', 'dev/erik', 'project')` writes to `.context-forge.local.toml`, and `.context-forge.toml` is not created/modified
  - [x] Test: `set('workflow.review_enabled', true, 'project')` writes to `.context-forge.toml` (unchanged behavior), `.context-forge.local.toml` is not created
  - [x] Test: `get('git.integration_branch')` with a value only in the personal file → returns that value, `source: 'project-personal'`
  - [x] Test: `get('git.integration_branch')` with a value only in the shared file (personal file absent or key not present there) → returns that value, `source: 'project'` — this is the pre-migration fallback case
  - [x] Test: `get('git.integration_branch')` with a value in **both** files → returns the personal file's value, `source: 'project-personal'` (personal wins per precedence)
  - [x] Test: `delete('git.integration_branch', 'project')` removes it from the personal file, leaves the shared file untouched
  - [x] Test: `list()` includes a `git.integration_branch` entry with the correct `source` reflecting whichever file resolution found it
  - [x] Success: `pnpm test -w packages/core -- ConfigManager` passes, including all pre-existing tests in this file (behavior for shared keys must be unchanged)

- [x] **4.4 Commit registry, path helper, and ConfigManager routing**
  - [x] Stage `packages/core/src/config/ConfigKeys.ts`, `packages/core/src/config/configPaths.ts`, `packages/core/src/config/ConfigManager.ts`, `packages/core/src/config/index.ts`, and all new/modified test files from tasks 2.1–4.3
  - [x] Run `pnpm -r build` and `pnpm test` — clean
  - [x] Commit: `feat(core): route personal-scope config keys to a separate project file`
  - [x] Success: commit created, build/tests green

### 5. Consistency Check: Personal Key in Shared File

- [x] **5.1 Implement `personal-config-in-shared-file` rule**
  - [x] In `packages/core/src/introspection/ConsistencyChecker.ts`, add a new check method following the existing per-rule method pattern in this file (returns `ConsistencyFinding[]`, called from `checkAll()`)
  - [x] Logic: for each key in `CONFIG_KEYS` where `scope === 'personal'`, read the shared project config file directly (reuse `ConfigManager`'s project-path-scoped `get()` is not sufficient here since it already applies the fallback — this check needs to know specifically whether the *shared* file itself contains the key; read the shared TOML file directly via the same `readToml`/`resolveKey` helpers `ConfigManager` uses, or add a narrow read-only method to `ConfigManager` for this purpose if direct file access from the checker is not architecturally appropriate — follow whichever pattern existing `ConsistencyChecker` rules already use for reading external state)
  - [x] If found, push a `ConsistencyFinding`: `rule: 'personal-config-in-shared-file'`, `severity: 'warning'`, `location` naming the shared config file path, `description` naming the key and both file paths, `suggestedFix: 'Run cf config migrate-personal to move it to the personal config file'`, `fixable: false` (no `fixAction` — per design, this is not wired to `workflow.auto_fix`)
  - [x] One finding per personal key found in the shared file (not one finding total)
  - [x] Success: file saves, TypeScript compiles

- [x] **5.2 Test: `personal-config-in-shared-file` rule**
  - [x] In `packages/core/tests/introspection/ConsistencyChecker.test.ts`, using the existing `makeStubConfig` pattern (extend it if it needs a way to stub raw shared-file contents, or construct a temp project directory with a hand-written `.context-forge.toml` if that matches how other file-reading rules in this suite are tested — follow the existing convention for whichever rules already read project files directly)
  - [x] Test: shared file contains `git.integration_branch` → one `warning` finding with `rule: 'personal-config-in-shared-file'` naming the key
  - [x] Test: shared file does not contain any personal key → no finding from this rule
  - [x] Test: shared file contains `git.integration_branch` AND personal file also has a (possibly different) value → finding still fires (detection is based on presence in the shared file, independent of whether it's also overridden in the personal file)
  - [x] Success: `pnpm test -w packages/core -- ConsistencyChecker` passes, including all pre-existing tests in this file

- [x] **5.3 Commit ConsistencyChecker rule**
  - [x] Stage `packages/core/src/introspection/ConsistencyChecker.ts` and its test file
  - [x] Run `pnpm -r build` and `pnpm test` — clean
  - [x] Commit: `feat(core): flag personal config keys committed to the shared project file`
  - [x] Success: commit created, build/tests green

### 6. CLI: `cf config migrate-personal`

- [x] **6.1 Implement `migrate-personal` command**
  - [x] In `packages/cli/src/commands/config.ts`, add `cmd.command('migrate-personal')` with a `-p, --project [id]` option matching the existing pattern used by `get`/`set`/`unset` in this file
  - [x] For each key in `CONFIG_KEYS` where `scope === 'personal'`: read the shared file's raw value and the personal file's raw value directly (not through `ConfigManager.get()`'s fallback-merged result — this command needs to distinguish "absent from personal" vs. "present and different" vs. "present and identical")
  - [x] Apply collision semantics exactly as specified in the design's Migration Plan: absent from personal → move (write personal via `ConfigManager.set(key, value, 'project')`, then delete from shared via `ConfigManager.delete(key, 'project')` — note both calls route to the correct file automatically per task 4.2's routing); present in personal with an **identical** value → delete the shared copy only (no personal write needed), report as moved; present in personal with a **different** value → skip both files, report as `skipped (personal value already set)`
  - [x] If a per-key operation throws, catch it, report that key as `failed: <error message>`, and continue processing remaining keys (do not abort the whole run)
  - [x] Print a summary line per personal key processed (moved / skipped / failed), and if zero personal keys were found in the shared file at all, print `No personal keys found in the shared config file.` and exit cleanly
  - [x] Success: file saves, TypeScript compiles

- [x] **6.2 Test: `migrate-personal` command**
  - [x] In `packages/cli/tests/commands/config.test.ts`, test: shared file has `git.integration_branch`, personal file absent → after running, personal file has the value, shared file no longer has it, output reports it moved
  - [x] Test: shared file has `git.integration_branch = "a"`, personal file has `git.integration_branch = "a"` (identical) → shared copy removed, personal file unchanged, reported as moved
  - [x] Test: shared file has `git.integration_branch = "a"`, personal file has `git.integration_branch = "b"` (different) → both files unchanged, reported as `skipped (personal value already set)`
  - [x] Test: no personal keys present in shared file → reports `No personal keys found in the shared config file.`, no files modified
  - [x] Test: `migrate-personal` is idempotent — running it twice in a row on the same project produces no error and no further changes on the second run
  - [x] Success: `pnpm test -w packages/cli -- config` passes, including all pre-existing tests in this file

- [x] **6.3 Commit `migrate-personal` command**
  - [x] Stage `packages/cli/src/commands/config.ts` and its test file
  - [x] Run `pnpm -r build` and `pnpm test` — clean
  - [x] Commit: `feat(cli): add cf config migrate-personal to relocate personal keys`
  - [x] Success: commit created, build/tests green

### 7. `cf init` Gitignore Handling

- [x] **7.1 Ensure `.context-forge.local.toml` is gitignored on `cf init`**
  - [x] In `packages/cli/src/commands/init.ts`, add a step (after project registration, alongside the other setup steps) that ensures the CWD's `.gitignore` contains a line for `.context-forge.local.toml`
  - [x] If `.gitignore` does not exist, create it with a single line: `.context-forge.local.toml`
  - [x] If `.gitignore` exists, read it and append the line only if not already present as an exact line match (simple line-based check, not a full gitignore-pattern parse, per the design's lenient-parsing guidance) — preserve existing file contents and trailing newline conventions
  - [x] On a file-write failure (e.g. permission denied), let the error propagate to the existing `handleError(err)` catch block already wrapping this command's action — no new error-handling path
  - [x] This step runs regardless of `--lite`, since it's about repo hygiene, not guide/IDE setup (place it near the project registration step, not inside the `if (!opts.lite)` block)
  - [x] Success: file saves, TypeScript compiles

- [x] **7.2 Test: `cf init` gitignore behavior**
  - [x] In `packages/cli/tests/commands/init.test.ts`, test: running `init` in a directory with no `.gitignore` creates one containing `.context-forge.local.toml`
  - [x] Test: running `init` in a directory with an existing `.gitignore` that does not mention it → the line is appended, existing content preserved
  - [x] Test: running `init` in a directory whose `.gitignore` already contains the line → file is unchanged (no duplicate line)
  - [x] Success: `pnpm test -w packages/cli -- init` passes, including all pre-existing tests in this file

- [x] **7.3 Commit `cf init` gitignore handling**
  - [x] Stage `packages/cli/src/commands/init.ts` and its test file
  - [x] Run `pnpm -r build` and `pnpm test` — clean
  - [x] Commit: `feat(cli): gitignore .context-forge.local.toml on cf init`
  - [x] Success: commit created, build/tests green

### 8. MCP: Surface Both Project Config Paths

- [x] **8.1 Update `config_get` to report both project config paths**
  - [x] In `packages/mcp-server/src/tools/configTools.ts`, in the `config_get` handler's no-key (list) branch, add `projectPersonal: projectPath ? getProjectPersonalConfigPath(projectPath) : null` alongside the existing `project` entry in the `configPaths` object returned
  - [x] Import `getProjectPersonalConfigPath` from `@context-forge/core/node` alongside the existing `ConfigManager`/`getUserConfigPath`/`getProjectConfigPath` imports
  - [x] No change needed to the single-key branch or to `config_set` — `ConfigResult` already carries the correct `source` value transparently per task 4.1
  - [x] Success: file saves, TypeScript compiles

- [x] **8.2 Test: MCP `config_get` reports both project paths**
  - [x] In `packages/mcp-server/tests/configTools.test.ts`, test: calling `config_get` with a `projectPath` and no `key` returns `configPaths.projectPersonal` as the expected `.context-forge.local.toml` path
  - [x] Test: calling `config_get` with a `key` for a personal-scope key set only in the personal file returns `source: 'project-personal'` in the result
  - [x] Success: `pnpm test -w packages/mcp-server -- configTools` passes, including all pre-existing tests in this file

- [x] **8.3 Commit MCP config tool update**
  - [x] Stage `packages/mcp-server/src/tools/configTools.ts` and its test file
  - [x] Run `pnpm -r build` and `pnpm test` — clean
  - [x] Commit: `feat(mcp): surface personal config file path in config_get`
  - [x] Success: commit created, build/tests green

### 9. Full Verification

- [x] **9.1 Full build and test suite**
  - [x] Run `pnpm -r build` — clean across all packages
  - [x] Run each package's test suite individually (`pnpm test -w packages/core`, `packages/cli`, `packages/mcp-server`, `packages/electron`) rather than `pnpm -r test`, since a fail-fast root script can mask which package actually has an issue
  - [x] Confirm no new test failures beyond any pre-existing, unrelated failures already present on `main` before this slice (note their names if present, do not attempt to fix them as part of this slice)
  - [x] Success: build clean, no new test failures attributable to this slice's changes

- [x] **9.2 Manual verification walkthrough**
  - [x] In a scratch git repo (registered via `cf init --lite`), work through all 9 steps of the Verification Walkthrough in `user/slices/915-slice.config-key-scope-classification-shared-vs-personal.md` in order, including the collision case (step 9)
  - [x] Record any deviation between actual behavior and the documented walkthrough; if found, fix the underlying code (not the walkthrough) unless the Project Manager confirms the walkthrough itself was wrong
  - [x] Clean up the scratch project registration and directory afterward
  - [x] Success: all 9 walkthrough steps behave exactly as documented, scratch project cleaned up

### 10. Wrap-up

- [x] **10.1 Update slice design and task file status**
  - [x] Update `user/slices/915-slice.config-key-scope-classification-shared-vs-personal.md` frontmatter `status` to `complete`, `dateUpdated` to the actual completion date
  - [x] Update this task file's frontmatter `status` to `complete`, `dateUpdated` to the actual completion date
  - [x] Success: both frontmatter blocks updated with the real date, confirmed with the Project Manager if there is any ambiguity about the date

- [x] **10.2 DEVLOG and CHANGELOG entries**
  - [x] Add a dated `DEVLOG.md` entry covering the shared/personal config split, the new `.context-forge.local.toml` file, `migrate-personal`, and the new `cf check` rule
  - [x] Add user-facing `CHANGELOG.md` entries under `[Unreleased]`: Added — personal config file, `cf config migrate-personal`, personal-key-in-shared-file check
  - [x] Success: both files updated

- [x] **10.3 Update slice plan entry**
  - [x] In `user/architecture/900-slices.maintenance-and-refactoring.md`, check off entry 15 (915) — mark `[x]`
  - [x] Success: entry checked, `cf check` reports no findings for slice 915's plan-entry consistency

- [x] **10.4 Final commit**
  - [x] Stage all wrap-up documentation changes
  - [x] Commit: `docs: complete slice 915 (config key scope classification)`
  - [x] Success: commit created, `cf check` clean for anything related to slice 915
