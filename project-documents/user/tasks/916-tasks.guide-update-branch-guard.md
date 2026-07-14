---
docType: tasks
slice: guide-update-branch-guard
project: context-forge
lld: user/slices/916-slice.guide-update-branch-guard.md
dependencies: [914]
projectState: >
  914 (git.integration_branch config key) is complete on main. GuideManager.update()
  currently calls SubmoduleStrategy.update()/CloneStrategy.update() with zero
  branch-awareness — no guard exists yet. gitExec() (packages/core/src/guides/gitExec.ts)
  is the existing generic git runner used by all strategies. No branchGuard.ts module
  exists yet.
dateCreated: 20260714
dateUpdated: 20260716
status: not_started
---

## Context Summary
- Working on slice 916: Guide Update Branch Guard
- Adds a branch guard to `GuideManager.update()` that resolves `trunk` (`git.integration_branch` config, or `main` if unset) and either proceeds, blocks, or warns-and-confirms based on current branch position relative to `trunk`
- New module `packages/core/src/guides/branchGuard.ts`: `evaluateBranchGuard()`, an `isAncestor()` helper, and two error classes (`BranchGuardBlockedError`, `BranchGuardWarnError`)
- `GuideManager.update()` gains an optional `{ confirmed?: boolean }` parameter
- CLI (`cf guides update`) gets a `-y`/`--yes` flag and an interactive confirmation prompt; MCP (`guide_update`) gets a `confirm` input parameter
- No dependencies beyond 914 (complete on `main`); `TarballStrategy` and `cf guides install` are explicitly out of scope
- Full design detail, including the decision table and failure-mode handling, lives in `user/slices/916-slice.guide-update-branch-guard.md` — tasks reference it rather than duplicating it
- **Prerequisite fix bundled into this slice** (see slice design's "Prerequisite Fix" section): `cf config set` was found to default to machine-wide user scope whenever `--project` is omitted, causing config values set in one project to silently leak into every other project on the machine. Section 0 below fixes this before any branch-guard work begins, since the guard itself depends on `git.integration_branch` resolving correctly per-project. Also folded in: `cf config unset` did not exist at all (no `ConfigManager.delete()`, no CLI subcommand) — needed to clean up the leaked machine-wide keys without hand-editing TOML, and a small addition given `set`'s scope-resolution flags are already being built.
- Next planned slice: 915 (Config Key Scope Classification), per Project Manager's stated sequencing

## Tasks

### 0. Prerequisite Fix: `cf config set` Default Scope

- [x] **0.1 Flip `cf config set` default scope from user to project**
  - [x] In `packages/cli/src/commands/config.ts`, change the `set` command's local `--project` option declaration from the shared `withProjectOption` (`-p, --project <id>`, required value) to a command-local `-p, --project [id]` (optional value) — do not modify `withProjectOption` itself or any of its other ~30 call sites
  - [x] Add a new `--global` boolean flag to the `set` command
  - [x] Replace `const scope = opts.project ? 'project' : 'user';` (currently line 92) with: `--global` present → `'user'`; otherwise → `'project'` (resolved via `resolveConfigProjectPath`, same as today's `get` command). If both `--global` and `--project` are passed, throw a clear error (mutually exclusive) rather than silently picking one
  - [x] Update `resolveConfigProjectPath(opts.project)` call: when `opts.project === true` (bare flag), resolve from CWD identically to `opts.project === undefined`; when `opts.project` is a string, resolve by name/id as today
  - [x] Also apply the `-p, --project [id]` optional-value declaration to the `get` command for symmetry (same file, same local pattern — `get` already resolves CWD correctly when `--project` is absent, this only adds the bare-flag case)
  - [x] Success: file saves, TypeScript compiles

- [x] **0.1b Add `ConfigManager.delete()` and `cf config unset`**
  - [x] In `packages/core/src/config/ConfigManager.ts`, add a `deleteKey(obj: TomlObject, key: string): void` helper mirroring `setKey` — navigates to the parent table and removes the leaf key via `delete`; after removal, walk back up and prune any now-empty parent tables (so `stringify` doesn't leave a dangling `[git]` section behind) — no-op if the key or an intermediate table doesn't exist
  - [x] Add `async delete(key: string, scope: 'user' | 'project'): Promise<void>` to `ConfigManager`: validate the key exists in `CONFIG_KEYS` (same error as `get`/`set` for unknown keys); resolve `filePath` the same way `set()` does; read the TOML, call `deleteKey`, write back — even when the key wasn't present (idempotent no-op write is fine, avoids a separate existence-check branch)
  - [x] In `packages/cli/src/commands/config.ts`, add `cmd.command('unset <key>')` with the same `-p, --project [id]` and `--global` flags and scope-resolution logic as `set` (extract the shared scope-resolution bit — `--global` present → `'user'`, else project-from-CWD/named — into a small local helper both `set` and `unset` call, rather than duplicating the mutually-exclusive check and ternary)
  - [x] `unset` action calls `cm.delete(key, scope)`; on success print a neutral confirmation (e.g. `Unset ${key} (${scope})`) — same message regardless of whether the key was actually present, since silent no-op is the intended behavior, not a distinguishable case
  - [x] Success: file saves, TypeScript compiles

- [x] **0.2 Test: config set/get/unset default-scope behavior**
  - [x] In `packages/cli/tests/commands/config.test.ts` (create if it does not exist), test: `set` with no flags → writes to project scope resolved from CWD
  - [x] Test: `set --global` → writes to user scope
  - [x] Test: `set --project` (bare) → writes to project scope resolved from CWD (same result as no flags)
  - [x] Test: `set --project <id>` → writes to the named project's scope (unchanged behavior)
  - [x] Test: `set --project <id> --global` together → rejected with a clear mutually-exclusive error, no write performed
  - [x] Test: `get` with no flags still resolves from CWD (regression check — behavior must be unchanged)
  - [x] Test: `unset <key>` with no flags → removes the key from project scope resolved from CWD
  - [x] Test: `unset <key> --global` → removes the key from user scope
  - [x] Test: `unset <key> --project <id> --global` together → rejected with the same mutually-exclusive error as `set`
  - [x] Test: `unset` on a key not present at the target scope → exits 0, neutral message, no error
  - [x] Test: `unset` on an unknown key → errors, same as `get`/`set` on an unknown key
  - [x] In `packages/core/tests/config/ConfigManager.test.ts`, test: `delete()` prunes an empty parent table left behind after removing the last key in a nested section (e.g. `git.integration_branch` alone under `[git]`)
  - [x] Success: `pnpm test -w packages/cli -- config` and `pnpm test -w packages/core -- ConfigManager` pass

- [x] **0.3 Clean up leaked machine-wide config**
  - [x] Inspect `~/Library/Preferences/context-forge/config.toml` (or platform equivalent) for keys that were set unintentionally via the old default-to-user behavior — currently known: `git.integration_branch`, `workflow.review_enabled`, `workflow.review_gate_effective_date`
  - [x] Confer with Project Manager before removing/editing any keys found — do not delete entries without explicit confirmation of which values are intentional machine-wide defaults vs. accidental leaks
  - [x] For any key confirmed as an accidental leak, remove it with `cf config unset <key> --global` (now available per task 0.1b) rather than hand-editing the TOML file
  - [x] Success: machine-wide config file contains only intentional entries, confirmed by Project Manager

- [x] **0.4 Commit config scope fix**
  - [x] Stage `packages/core/src/config/ConfigManager.ts`, `packages/core/tests/config/ConfigManager.test.ts`, `packages/cli/src/commands/config.ts`, `packages/cli/tests/commands/config.test.ts`
  - [x] Run `pnpm -r build` and `pnpm test` — clean
  - [x] Commit: `fix(cli): default config set to project scope instead of machine-wide user scope`
  - [x] Success: commit created, build/tests green

### 1. Setup

- [x] **1.1 Create slice branch and verify starting state**
  - [x] Confirm `git.integration_branch` reads correctly for this repo (`cf config get git.integration_branch --project context-forge` or run from repo root with no flag) — should reflect only what has been explicitly set for `context-forge` itself, not a value leaked from another project (this is now guaranteed by Section 0's fix)
  - [x] Determine target branch: if `context-forge` has no `git.integration_branch` set at project scope, target is `main`; if it does, target is that value — do not assume `main` without checking
  - [x] Verify on the target branch, working tree clean
  - [x] Create branch: `git checkout -b 916-slice.guide-update-branch-guard <target>`
  - [x] Run `pnpm -r build` — succeeds
  - [x] Run `pnpm test` — all tests pass
  - [x] Success: on correct branch, build and tests green

### 2. Core Guard Module

- [x] **2.1 Implement `isAncestor()` helper in `branchGuard.ts`**
  - [x] Create `packages/core/src/guides/branchGuard.ts`
  - [x] Implement `async function isAncestor(trunk: string, cwd: string): Promise<boolean>` using Node's `execFile('git', ['merge-base', '--is-ancestor', trunk, 'HEAD'], { cwd }, ...)` directly (not via `gitExec`, since `gitExec` throws on any non-zero exit and this command uses exit code as its return value)
  - [x] Exit code 0 → resolve `true`
  - [x] Exit code 1 (clean process exit, not a spawn error) → resolve `false`
  - [x] Any other outcome (exit code >1, or the `execFile` `error` callback firing for a spawn failure) → reject with `new Error(...)`, message formatted identically to `gitExec`'s own error shape: `` `git merge-base --is-ancestor ${trunk} HEAD failed in ${cwd}: ${stderr.trim() || error.message}` ``
  - [x] Do not modify `gitExec.ts` — this is a standalone local helper per the design's explicit instruction not to change `gitExec`'s throw-on-nonzero contract
  - [x] Success: file saves, TypeScript compiles (`pnpm -w packages/core build` or equivalent)

- [x] **2.2 Test: `isAncestor()` exit code handling**
  - [x] Create `packages/core/tests/guides/branchGuard.test.ts`
  - [x] Mock `child_process.execFile` (same approach as other `execFile`-based tests in this repo, or mock at the module level)
  - [x] Test: exit code 0 → `isAncestor` resolves `true`
  - [x] Test: exit code 1 (clean exit, no `error` callback) → `isAncestor` resolves `false`
  - [x] Test: exit code 128 (simulated git error, e.g. invalid ref) → `isAncestor` rejects with an `Error` whose message includes `merge-base --is-ancestor`
  - [x] Test: spawn failure (`execFile`'s `error` callback fires, e.g. ENOENT) → `isAncestor` rejects
  - [x] Success: `pnpm test -w packages/core -- branchGuard` passes for all four cases

- [x] **2.3 Implement `evaluateBranchGuard()` decision logic**
  - [x] In `branchGuard.ts`, define `BranchGuardVerdict` discriminated union exactly as specified in the design's Component Structure section: `{ outcome: 'proceed' } | { outcome: 'block'; trunk: string; current: string } | { outcome: 'warn'; trunk: string; current: string; ancestry: 'descends' | 'unrelated' }`
  - [x] Implement `async function evaluateBranchGuard(projectPath: string, configManager?: ConfigManager): Promise<BranchGuardVerdict>`
  - [x] Resolve `trunk`: if `configManager` is provided, read `git.integration_branch`; if unset/empty or `configManager` is undefined, `trunk = 'main'` (matches the existing fallback pattern in `resolveSource()`/`resolveStrategy()`)
  - [x] Resolve `current` via `gitExec(['rev-parse', '--abbrev-ref', 'HEAD'], projectPath)`
  - [x] Apply the decision table from the design's Technical Decisions section, in this exact order:
    1. `current === 'HEAD'` → `{ outcome: 'block', trunk, current: 'HEAD' }`
    2. `current === trunk` → `{ outcome: 'proceed' }`
    3. `current === 'main' && trunk !== 'main'` → `{ outcome: 'block', trunk, current }`
    4. otherwise, call `isAncestor(trunk, projectPath)`: `true` → `{ outcome: 'warn', trunk, current, ancestry: 'descends' }`; `false` → `{ outcome: 'warn', trunk, current, ancestry: 'unrelated' }`; a thrown error from `isAncestor` propagates uncaught (not converted to a verdict)
  - [x] Success: file saves, TypeScript compiles

- [x] **2.4 Test: `evaluateBranchGuard()` full decision table**
  - [x] In `branchGuard.test.ts`, mock `gitExec` (rev-parse call) and `isAncestor` (or the underlying `execFile`) independently per test case
  - [x] Test: trunk unset (`main`), current `main` → `proceed`
  - [x] Test: trunk unset (`main`), current `HEAD` (detached) → `block` with `current: 'HEAD'`
  - [x] Test: trunk unset (`main`), current descends from `main` → `warn` with `ancestry: 'descends'`
  - [x] Test: trunk unset (`main`), current unrelated to `main` → `warn` with `ancestry: 'unrelated'`
  - [x] Test: trunk set (e.g. `dev/erik`), current equals trunk → `proceed`
  - [x] Test: trunk set, current `main` → `block` with `trunk: 'dev/erik'`, `current: 'main'`
  - [x] Test: trunk set, current `HEAD` (detached) → `block` with `current: 'HEAD'` (verifies detached-HEAD check runs before the trunk/main check)
  - [x] Test: trunk set, current descends from trunk → `warn` with `ancestry: 'descends'`
  - [x] Test: trunk set, current unrelated to trunk → `warn` with `ancestry: 'unrelated'`
  - [x] Test: `isAncestor` rejects (simulated exit code >1) → `evaluateBranchGuard()` rejects with the same error, does not return a `warn` verdict
  - [x] Test: `configManager` omitted entirely → treated as trunk unset (`main`)
  - [x] Success: all cases in `pnpm test -w packages/core -- branchGuard` pass

- [x] **2.5 Implement `BranchGuardBlockedError` and `BranchGuardWarnError`**
  - [x] In `branchGuard.ts`, add `export class BranchGuardBlockedError extends Error` with `readonly trunk: string` and `readonly current: string`
  - [x] Message must name both `trunk` and `current`, AND include a concrete remediation instruction per the slice design's CLI Interface Changes section: for the normal case, suggest switching to the trunk branch OR unsetting `git.integration_branch` if that's not actually desired; for the detached-HEAD case (`current === 'HEAD'`), suggest checking out a branch before updating instead. This message is the single source of remediation text — CLI and MCP surface it as-is, they do not add their own remediation wording (see task 4.1's note on this)
  - [x] Add `export class BranchGuardWarnError extends Error` with `readonly trunk: string`, `readonly current: string`, `readonly ancestry: 'descends' | 'unrelated'`, constructed with ancestry-appropriate message text (softer wording for `descends`, stronger for `unrelated`)
  - [x] Set `this.name` on each class (e.g. `'BranchGuardBlockedError'`) so `instanceof` checks and error logging both work correctly
  - [x] Success: file saves, TypeScript compiles

- [x] **2.6 Test: error class construction**
  - [x] Test: `BranchGuardBlockedError` constructed with trunk/current — `.trunk`, `.current`, `.message`, `instanceof Error` all correct
  - [x] Test: `BranchGuardBlockedError` normal case — message includes remediation text mentioning both switching to the trunk branch and unsetting `git.integration_branch`
  - [x] Test: `BranchGuardBlockedError` with `current: 'HEAD'` — message mentions detached HEAD AND its distinct remediation (checking out a branch), not the normal-case remediation
  - [x] Test: `BranchGuardWarnError` with `ancestry: 'descends'` and with `ancestry: 'unrelated'` — both produce distinguishable message text
  - [x] Success: tests pass

- [x] **2.7 Commit core guard module**
  - [x] Stage `packages/core/src/guides/branchGuard.ts`, `packages/core/tests/guides/branchGuard.test.ts`
  - [x] Run `pnpm -r build` and `pnpm test` — clean
  - [x] Commit: `feat(core): add guide-update branch guard decision logic`
  - [x] Success: commit created on slice branch, build/tests green

### 3. Wire Guard into GuideManager

- [x] **3.1 Update `GuideManager.update()` to call the guard**
  - [x] In `packages/core/src/guides/GuideManager.ts`, import `evaluateBranchGuard`, `BranchGuardBlockedError`, `BranchGuardWarnError` from `./branchGuard.js`
  - [x] Change `update()` signature to `async update(opts?: { confirmed?: boolean }): Promise<UpdateResult>`
  - [x] At the start of `update()`, after resolving `source`/`targetDir` but before the `strategy.update()` call: call `evaluateBranchGuard(this.projectPath, this.configManager)`
  - [x] On `outcome: 'block'` → throw `new BranchGuardBlockedError(verdict.trunk, verdict.current)`
  - [x] On `outcome: 'warn'` and `opts?.confirmed !== true` → throw `new BranchGuardWarnError(verdict.trunk, verdict.current, verdict.ancestry)`
  - [x] On `outcome: 'warn'` and `opts?.confirmed === true`, or `outcome: 'proceed'` → continue to the existing `strategy.update()` call and worktree-sync logic, unchanged
  - [x] Success: file saves, TypeScript compiles

- [x] **3.2 Test: `GuideManager.update()` guard integration**
  - [x] In `packages/core/tests/guides/GuideManager.test.ts`, add a `describe('update - branch guard', ...)` block
  - [x] Mock `evaluateBranchGuard` (via `vi.mock('../../src/guides/branchGuard.js', ...)`) to return each of `proceed`, `block`, and `warn` in turn
  - [x] Test: `proceed` verdict → `strategy.update()` is called, returns normally
  - [x] Test: `block` verdict → `update()` rejects with `BranchGuardBlockedError`, `strategy.update()` is NOT called
  - [x] Test: `warn` verdict, `update()` called with no opts → rejects with `BranchGuardWarnError`, `strategy.update()` is NOT called
  - [x] Test: `warn` verdict, `update({ confirmed: true })` → `strategy.update()` IS called, returns normally
  - [x] Test: existing pre-guard `update()` tests (already in the file) still pass — mock `evaluateBranchGuard` to return `proceed` as the default in the shared `beforeEach` so unrelated tests aren't broken by the new call
  - [x] Success: `pnpm test -w packages/core -- GuideManager` passes, including pre-existing cases

- [x] **3.3 Verify `TarballStrategy` path evaluates the guard like any other strategy**
  - [x] Confirm (by reading, not by writing new code) that `evaluateBranchGuard()` is called unconditionally in `update()` regardless of `info.method` — no strategy-type conditional is added to skip `manual`-strategy installs (deliberate: not worth the extra branch for a strategy with negligible real-world usage, per Project Manager decision)
  - [x] Add one test: `info.method === 'manual'`, guard returns `proceed` → `TarballStrategy.update()` is called normally
  - [x] Add one test: `info.method === 'manual'`, guard returns `block` → `TarballStrategy.update()` is NOT called, `BranchGuardBlockedError` thrown (confirms a manual-strategy user does see the block/warn UX even though `TarballStrategy.update()` never commits — this is expected per the corrected slice design, not a bug)
  - [x] Success: tests pass; confirms the guard treats `manual` strategy identically to `submodule`/`clone` for evaluation purposes

- [x] **3.4 Commit GuideManager wiring**
  - [x] Stage `GuideManager.ts`, `GuideManager.test.ts`
  - [x] Run `pnpm -r build` and `pnpm test` — clean
  - [x] Commit: `feat(core): wire branch guard into GuideManager.update`
  - [x] Success: commit created, build/tests green

### 4. CLI: `cf guides update`

- [x] **4.1 Add `--yes` option and error-type handling**
  - [x] In `packages/cli/src/commands/guides.ts`, import `withYesOption` from `../options.js` and `BranchGuardBlockedError`, `BranchGuardWarnError` from `@context-forge/core/node` (confirm these are exported from the core package's node entrypoint; add to the export barrel if not already present)
  - [x] Apply `withYesOption(updateCmd)` to the `update` command definition
  - [x] In the `update` action handler, wrap `manager.update()` in a way that catches `BranchGuardWarnError` specifically (before the general `catch (err) { handleError(err) }`)
  - [x] On `BranchGuardBlockedError`: let it propagate to `handleError(err)` — no special handling needed, `handleError` already prints message and exits non-zero. The error's `.message` (constructed in task 2.5) already contains the full remediation text; do NOT add CLI-side remediation wording — remediation text lives in exactly one place (`branchGuard.ts`)
  - [x] Success: file saves, TypeScript compiles

- [x] **4.2 Implement warn-and-confirm flow**
  - [x] On catching `BranchGuardWarnError`: if `opts.yes` is true, immediately re-call `manager.update({ confirmed: true })` and continue with the normal success-reporting logic (no prompt)
  - [x] If `opts.yes` is false/undefined: print the warning message (from the caught error), then call `askConfirmation('Continue? (y/N) ')` — reuse the existing helper pattern from `packages/cli/src/commands/setup-ide.ts` (extract it to a shared location, e.g. `packages/cli/src/utils/prompt.ts`, if not already shared — check first whether extracting vs. duplicating is more consistent with existing CLI conventions)
  - [x] If confirmed: re-call `manager.update({ confirmed: true })`, continue with normal success-reporting logic
  - [x] If declined: print a neutral "Update cancelled." message (or similar) and exit 0 — this is a user choice, not a failure
  - [x] Success: file saves, TypeScript compiles

- [x] **4.3 Test: CLI guide update branch guard behavior**
  - [x] In `packages/cli/tests/commands/guides.test.ts`, add test cases for the `update` command
  - [x] Test: `manager.update()` throws `BranchGuardBlockedError` → command exits non-zero, error message printed, no retry attempted
  - [x] Test: `manager.update()` throws `BranchGuardWarnError`, `--yes` passed → `manager.update({ confirmed: true })` is called, success path reached
  - [x] Test: `manager.update()` throws `BranchGuardWarnError`, no `--yes`, confirmation mocked to return `true` → `manager.update({ confirmed: true })` is called
  - [x] Test: `manager.update()` throws `BranchGuardWarnError`, no `--yes`, confirmation mocked to return `false` → `manager.update` is NOT called a second time, command exits without error
  - [x] Success: `pnpm test -w packages/cli -- guides` passes

- [x] **4.4 Commit CLI changes**
  - [x] Stage `guides.ts`, `guides.test.ts`, and any extracted prompt utility file
  - [x] Run `pnpm -r build` and `pnpm test` — clean
  - [x] Commit: `feat(cli): add branch guard confirmation flow to guides update`
  - [x] Success: commit created, build/tests green

### 5. MCP: `guide_update` Tool

- [x] **5.1 Add `confirm` input parameter and error-type handling**
  - [x] In `packages/mcp-server/src/tools/guideTools.ts`, add `confirm: z.boolean().optional().describe(...)` to the `guide_update` tool's `inputSchema`. Describe text should explain the confirm-required flow so agent callers understand a `BranchGuardWarnError`-shaped response is not a transient failure (per the design's Special Considerations note)
  - [x] Update the tool's top-level `description` to mention that updates may require branch confirmation when not on the configured trunk/integration branch
  - [x] In the handler, wrap `manager.update()` similarly to CLI: catch `BranchGuardBlockedError` and `BranchGuardWarnError` before the general `catch`
  - [x] On `BranchGuardBlockedError`: return `errorResult(error.message)` — same message as CLI surfaces
  - [x] Success: file saves, TypeScript compiles

- [x] **5.2 Implement confirm-required response and retry**
  - [x] On catching `BranchGuardWarnError` and `confirm !== true`: return `errorResult(...)` with the warning message plus explicit instruction to retry the same tool call with `confirm: true`
  - [x] On catching `BranchGuardWarnError` and `confirm === true`: re-call `manager.update({ confirmed: true })`, then continue with the existing success path (worktree sync, `jsonResult`)
  - [x] Success: file saves, TypeScript compiles

- [x] **5.3 Test: MCP guide_update branch guard behavior**
  - [x] In `packages/mcp-server/tests/guideTools.test.ts`, add test cases for `guide_update`
  - [x] Test: `manager.update()` throws `BranchGuardBlockedError` → `errorResult` returned, message includes trunk/current
  - [x] Test: `manager.update()` throws `BranchGuardWarnError`, called without `confirm` → `errorResult` returned, message instructs retry with `confirm: true`, `manager.update` called only once
  - [x] Test: `manager.update()` throws `BranchGuardWarnError`, called with `confirm: true` → `manager.update({ confirmed: true })` called, `jsonResult` returned with success shape
  - [x] Success: `pnpm test -w packages/mcp-server -- guideTools` passes

- [x] **5.4 Commit MCP changes**
  - [x] Stage `guideTools.ts`, `guideTools.test.ts`
  - [x] Run `pnpm -r build` and `pnpm test` — clean
  - [x] Commit: `feat(mcp): add branch guard confirm flow to guide_update tool`
  - [x] Success: commit created, build/tests green

### 6. Full Verification

- [ ] **6.1 Full build and test suite**
  - [ ] Run `pnpm -r build` from project root — all packages build
  - [ ] Run `pnpm test` from project root — all tests pass, no regressions in unrelated suites
  - [ ] Success: clean build, all tests green

- [ ] **6.2 Manual verification walkthrough**
  - [ ] Follow the Verification Walkthrough steps in `user/slices/916-slice.guide-update-branch-guard.md` (steps 1–5) in a scratch git repo with context-forge initialized and the guide installed via submodule strategy
  - [ ] Confirm: block case (trunk configured, on `main`) fails with no commit
  - [ ] Confirm: proceed case (on trunk) behaves identically to pre-slice behavior
  - [ ] Confirm: warn case (descendant branch) prompts, `y` proceeds and commits, declining aborts cleanly
  - [ ] Confirm: `--yes` skips the prompt
  - [ ] Confirm: same three-way behavior holds with `git.integration_branch` unset (trunk = `main`)
  - [ ] Success: all five walkthrough steps behave as documented in the slice design

### 7. Wrap-up

- [ ] **7.1 Update slice design status**
  - [ ] In `user/slices/916-slice.guide-update-branch-guard.md`, update frontmatter `status: not_started` → `status: complete`
  - [ ] Success: status updated

- [ ] **7.2 Update DEVLOG**
  - [ ] Add entry to `DEVLOG.md` for slice 916 completion, listing commit hashes
  - [ ] Success: DEVLOG updated

- [ ] **7.3 Final commit for docs**
  - [ ] Stage and commit doc updates: `docs: complete slice 916 guide update branch guard`
  - [ ] Success: docs commit created

- [ ] **7.4 Merge to target**
  - [ ] Confirm target is `main` (per `git.integration_branch` check in task 1.1 — unset for this repo)
  - [ ] Merge `916-slice.guide-update-branch-guard` into `main` per standard project git workflow
  - [ ] Success: slice merged, branch work complete
