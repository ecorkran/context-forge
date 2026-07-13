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
dateUpdated: 20260714
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
- Next planned slice: 915 (Config Key Scope Classification), per Project Manager's stated sequencing

## Tasks

### 1. Setup

- [ ] **1.1 Create slice branch and verify starting state**
  - [ ] Confirm `git.integration_branch` is unset for this repo (`cf config get git.integration_branch`) — target branch is `main`
  - [ ] Verify on `main`, working tree clean
  - [ ] Create branch: `git checkout -b 916-slice.guide-update-branch-guard main`
  - [ ] Run `pnpm -r build` — succeeds
  - [ ] Run `pnpm test` — all tests pass
  - [ ] Success: on correct branch, build and tests green

### 2. Core Guard Module

- [ ] **2.1 Implement `isAncestor()` helper in `branchGuard.ts`**
  - [ ] Create `packages/core/src/guides/branchGuard.ts`
  - [ ] Implement `async function isAncestor(trunk: string, cwd: string): Promise<boolean>` using Node's `execFile('git', ['merge-base', '--is-ancestor', trunk, 'HEAD'], { cwd }, ...)` directly (not via `gitExec`, since `gitExec` throws on any non-zero exit and this command uses exit code as its return value)
  - [ ] Exit code 0 → resolve `true`
  - [ ] Exit code 1 (clean process exit, not a spawn error) → resolve `false`
  - [ ] Any other outcome (exit code >1, or the `execFile` `error` callback firing for a spawn failure) → reject with `new Error(...)`, message formatted identically to `gitExec`'s own error shape: `` `git merge-base --is-ancestor ${trunk} HEAD failed in ${cwd}: ${stderr.trim() || error.message}` ``
  - [ ] Do not modify `gitExec.ts` — this is a standalone local helper per the design's explicit instruction not to change `gitExec`'s throw-on-nonzero contract
  - [ ] Success: file saves, TypeScript compiles (`pnpm -w packages/core build` or equivalent)

- [ ] **2.2 Test: `isAncestor()` exit code handling**
  - [ ] Create `packages/core/tests/guides/branchGuard.test.ts`
  - [ ] Mock `child_process.execFile` (same approach as other `execFile`-based tests in this repo, or mock at the module level)
  - [ ] Test: exit code 0 → `isAncestor` resolves `true`
  - [ ] Test: exit code 1 (clean exit, no `error` callback) → `isAncestor` resolves `false`
  - [ ] Test: exit code 128 (simulated git error, e.g. invalid ref) → `isAncestor` rejects with an `Error` whose message includes `merge-base --is-ancestor`
  - [ ] Test: spawn failure (`execFile`'s `error` callback fires, e.g. ENOENT) → `isAncestor` rejects
  - [ ] Success: `pnpm test -w packages/core -- branchGuard` passes for all four cases

- [ ] **2.3 Implement `evaluateBranchGuard()` decision logic**
  - [ ] In `branchGuard.ts`, define `BranchGuardVerdict` discriminated union exactly as specified in the design's Component Structure section: `{ outcome: 'proceed' } | { outcome: 'block'; trunk: string; current: string } | { outcome: 'warn'; trunk: string; current: string; ancestry: 'descends' | 'unrelated' }`
  - [ ] Implement `async function evaluateBranchGuard(projectPath: string, configManager?: ConfigManager): Promise<BranchGuardVerdict>`
  - [ ] Resolve `trunk`: if `configManager` is provided, read `git.integration_branch`; if unset/empty or `configManager` is undefined, `trunk = 'main'` (matches the existing fallback pattern in `resolveSource()`/`resolveStrategy()`)
  - [ ] Resolve `current` via `gitExec(['rev-parse', '--abbrev-ref', 'HEAD'], projectPath)`
  - [ ] Apply the decision table from the design's Technical Decisions section, in this exact order:
    1. `current === 'HEAD'` → `{ outcome: 'block', trunk, current: 'HEAD' }`
    2. `current === trunk` → `{ outcome: 'proceed' }`
    3. `current === 'main' && trunk !== 'main'` → `{ outcome: 'block', trunk, current }`
    4. otherwise, call `isAncestor(trunk, projectPath)`: `true` → `{ outcome: 'warn', trunk, current, ancestry: 'descends' }`; `false` → `{ outcome: 'warn', trunk, current, ancestry: 'unrelated' }`; a thrown error from `isAncestor` propagates uncaught (not converted to a verdict)
  - [ ] Success: file saves, TypeScript compiles

- [ ] **2.4 Test: `evaluateBranchGuard()` full decision table**
  - [ ] In `branchGuard.test.ts`, mock `gitExec` (rev-parse call) and `isAncestor` (or the underlying `execFile`) independently per test case
  - [ ] Test: trunk unset (`main`), current `main` → `proceed`
  - [ ] Test: trunk unset (`main`), current `HEAD` (detached) → `block` with `current: 'HEAD'`
  - [ ] Test: trunk unset (`main`), current descends from `main` → `warn` with `ancestry: 'descends'`
  - [ ] Test: trunk unset (`main`), current unrelated to `main` → `warn` with `ancestry: 'unrelated'`
  - [ ] Test: trunk set (e.g. `dev/erik`), current equals trunk → `proceed`
  - [ ] Test: trunk set, current `main` → `block` with `trunk: 'dev/erik'`, `current: 'main'`
  - [ ] Test: trunk set, current `HEAD` (detached) → `block` with `current: 'HEAD'` (verifies detached-HEAD check runs before the trunk/main check)
  - [ ] Test: trunk set, current descends from trunk → `warn` with `ancestry: 'descends'`
  - [ ] Test: trunk set, current unrelated to trunk → `warn` with `ancestry: 'unrelated'`
  - [ ] Test: `isAncestor` rejects (simulated exit code >1) → `evaluateBranchGuard()` rejects with the same error, does not return a `warn` verdict
  - [ ] Test: `configManager` omitted entirely → treated as trunk unset (`main`)
  - [ ] Success: all cases in `pnpm test -w packages/core -- branchGuard` pass

- [ ] **2.5 Implement `BranchGuardBlockedError` and `BranchGuardWarnError`**
  - [ ] In `branchGuard.ts`, add `export class BranchGuardBlockedError extends Error` with `readonly trunk: string` and `readonly current: string`, constructed with a message naming both (distinguish the detached-HEAD case in the message text, e.g. mention "detached HEAD" when `current === 'HEAD'`)
  - [ ] Add `export class BranchGuardWarnError extends Error` with `readonly trunk: string`, `readonly current: string`, `readonly ancestry: 'descends' | 'unrelated'`, constructed with ancestry-appropriate message text (softer wording for `descends`, stronger for `unrelated`)
  - [ ] Set `this.name` on each class (e.g. `'BranchGuardBlockedError'`) so `instanceof` checks and error logging both work correctly
  - [ ] Success: file saves, TypeScript compiles

- [ ] **2.6 Test: error class construction**
  - [ ] Test: `BranchGuardBlockedError` constructed with trunk/current — `.trunk`, `.current`, `.message`, `instanceof Error` all correct
  - [ ] Test: `BranchGuardBlockedError` with `current: 'HEAD'` — message mentions detached HEAD
  - [ ] Test: `BranchGuardWarnError` with `ancestry: 'descends'` and with `ancestry: 'unrelated'` — both produce distinguishable message text
  - [ ] Success: tests pass

- [ ] **2.7 Commit core guard module**
  - [ ] Stage `packages/core/src/guides/branchGuard.ts`, `packages/core/tests/guides/branchGuard.test.ts`
  - [ ] Run `pnpm -r build` and `pnpm test` — clean
  - [ ] Commit: `feat(core): add guide-update branch guard decision logic`
  - [ ] Success: commit created on slice branch, build/tests green

### 3. Wire Guard into GuideManager

- [ ] **3.1 Update `GuideManager.update()` to call the guard**
  - [ ] In `packages/core/src/guides/GuideManager.ts`, import `evaluateBranchGuard`, `BranchGuardBlockedError`, `BranchGuardWarnError` from `./branchGuard.js`
  - [ ] Change `update()` signature to `async update(opts?: { confirmed?: boolean }): Promise<UpdateResult>`
  - [ ] At the start of `update()`, after resolving `source`/`targetDir` but before the `strategy.update()` call: call `evaluateBranchGuard(this.projectPath, this.configManager)`
  - [ ] On `outcome: 'block'` → throw `new BranchGuardBlockedError(verdict.trunk, verdict.current)`
  - [ ] On `outcome: 'warn'` and `opts?.confirmed !== true` → throw `new BranchGuardWarnError(verdict.trunk, verdict.current, verdict.ancestry)`
  - [ ] On `outcome: 'warn'` and `opts?.confirmed === true`, or `outcome: 'proceed'` → continue to the existing `strategy.update()` call and worktree-sync logic, unchanged
  - [ ] Success: file saves, TypeScript compiles

- [ ] **3.2 Test: `GuideManager.update()` guard integration**
  - [ ] In `packages/core/tests/guides/GuideManager.test.ts`, add a `describe('update - branch guard', ...)` block
  - [ ] Mock `evaluateBranchGuard` (via `vi.mock('../../src/guides/branchGuard.js', ...)`) to return each of `proceed`, `block`, and `warn` in turn
  - [ ] Test: `proceed` verdict → `strategy.update()` is called, returns normally
  - [ ] Test: `block` verdict → `update()` rejects with `BranchGuardBlockedError`, `strategy.update()` is NOT called
  - [ ] Test: `warn` verdict, `update()` called with no opts → rejects with `BranchGuardWarnError`, `strategy.update()` is NOT called
  - [ ] Test: `warn` verdict, `update({ confirmed: true })` → `strategy.update()` IS called, returns normally
  - [ ] Test: existing pre-guard `update()` tests (already in the file) still pass — mock `evaluateBranchGuard` to return `proceed` as the default in the shared `beforeEach` so unrelated tests aren't broken by the new call
  - [ ] Success: `pnpm test -w packages/core -- GuideManager` passes, including pre-existing cases

- [ ] **3.3 Verify `TarballStrategy` path is unaffected**
  - [ ] Confirm (by reading, not by writing new code) that `evaluateBranchGuard()` is called unconditionally in `update()` regardless of `info.method`, so a `manual`-strategy project still gets guard evaluation even though `TarballStrategy.update()` itself does no git commit
  - [ ] Add one test: `info.method === 'manual'`, guard returns `proceed` → `TarballStrategy.update()` is called normally (confirms the guard doesn't special-case or skip tarball installs, and doesn't break them)
  - [ ] Success: test passes; confirms design's "TarballStrategy is unaffected" claim holds for the guard's unconditional-evaluation behavior, not just its no-commit behavior

- [ ] **3.4 Commit GuideManager wiring**
  - [ ] Stage `GuideManager.ts`, `GuideManager.test.ts`
  - [ ] Run `pnpm -r build` and `pnpm test` — clean
  - [ ] Commit: `feat(core): wire branch guard into GuideManager.update`
  - [ ] Success: commit created, build/tests green

### 4. CLI: `cf guides update`

- [ ] **4.1 Add `--yes` option and error-type handling**
  - [ ] In `packages/cli/src/commands/guides.ts`, import `withYesOption` from `../options.js` and `BranchGuardBlockedError`, `BranchGuardWarnError` from `@context-forge/core/node` (confirm these are exported from the core package's node entrypoint; add to the export barrel if not already present)
  - [ ] Apply `withYesOption(updateCmd)` to the `update` command definition
  - [ ] In the `update` action handler, wrap `manager.update()` in a way that catches `BranchGuardWarnError` specifically (before the general `catch (err) { handleError(err) }`)
  - [ ] On `BranchGuardBlockedError`: let it propagate to `handleError(err)` — no special handling needed, `handleError` already prints message and exits non-zero. Confirm the error message text (from task 2.5) is sufficiently actionable as-is (names trunk and current branch, or detached-HEAD condition); if not, adjust the error message in `branchGuard.ts` rather than adding CLI-side remediation text, to keep remediation text in one place
  - [ ] Success: file saves, TypeScript compiles

- [ ] **4.2 Implement warn-and-confirm flow**
  - [ ] On catching `BranchGuardWarnError`: if `opts.yes` is true, immediately re-call `manager.update({ confirmed: true })` and continue with the normal success-reporting logic (no prompt)
  - [ ] If `opts.yes` is false/undefined: print the warning message (from the caught error), then call `askConfirmation('Continue? (y/N) ')` — reuse the existing helper pattern from `packages/cli/src/commands/setup-ide.ts` (extract it to a shared location, e.g. `packages/cli/src/utils/prompt.ts`, if not already shared — check first whether extracting vs. duplicating is more consistent with existing CLI conventions)
  - [ ] If confirmed: re-call `manager.update({ confirmed: true })`, continue with normal success-reporting logic
  - [ ] If declined: print a neutral "Update cancelled." message (or similar) and exit 0 — this is a user choice, not a failure
  - [ ] Success: file saves, TypeScript compiles

- [ ] **4.3 Test: CLI guide update branch guard behavior**
  - [ ] In `packages/cli/tests/commands/guides.test.ts`, add test cases for the `update` command
  - [ ] Test: `manager.update()` throws `BranchGuardBlockedError` → command exits non-zero, error message printed, no retry attempted
  - [ ] Test: `manager.update()` throws `BranchGuardWarnError`, `--yes` passed → `manager.update({ confirmed: true })` is called, success path reached
  - [ ] Test: `manager.update()` throws `BranchGuardWarnError`, no `--yes`, confirmation mocked to return `true` → `manager.update({ confirmed: true })` is called
  - [ ] Test: `manager.update()` throws `BranchGuardWarnError`, no `--yes`, confirmation mocked to return `false` → `manager.update` is NOT called a second time, command exits without error
  - [ ] Success: `pnpm test -w packages/cli -- guides` passes

- [ ] **4.4 Commit CLI changes**
  - [ ] Stage `guides.ts`, `guides.test.ts`, and any extracted prompt utility file
  - [ ] Run `pnpm -r build` and `pnpm test` — clean
  - [ ] Commit: `feat(cli): add branch guard confirmation flow to guides update`
  - [ ] Success: commit created, build/tests green

### 5. MCP: `guide_update` Tool

- [ ] **5.1 Add `confirm` input parameter and error-type handling**
  - [ ] In `packages/mcp-server/src/tools/guideTools.ts`, add `confirm: z.boolean().optional().describe(...)` to the `guide_update` tool's `inputSchema`. Describe text should explain the confirm-required flow so agent callers understand a `BranchGuardWarnError`-shaped response is not a transient failure (per the design's Special Considerations note)
  - [ ] Update the tool's top-level `description` to mention that updates may require branch confirmation when not on the configured trunk/integration branch
  - [ ] In the handler, wrap `manager.update()` similarly to CLI: catch `BranchGuardBlockedError` and `BranchGuardWarnError` before the general `catch`
  - [ ] On `BranchGuardBlockedError`: return `errorResult(error.message)` — same message as CLI surfaces
  - [ ] Success: file saves, TypeScript compiles

- [ ] **5.2 Implement confirm-required response and retry**
  - [ ] On catching `BranchGuardWarnError` and `confirm !== true`: return `errorResult(...)` with the warning message plus explicit instruction to retry the same tool call with `confirm: true`
  - [ ] On catching `BranchGuardWarnError` and `confirm === true`: re-call `manager.update({ confirmed: true })`, then continue with the existing success path (worktree sync, `jsonResult`)
  - [ ] Success: file saves, TypeScript compiles

- [ ] **5.3 Test: MCP guide_update branch guard behavior**
  - [ ] In `packages/mcp-server/tests/guideTools.test.ts`, add test cases for `guide_update`
  - [ ] Test: `manager.update()` throws `BranchGuardBlockedError` → `errorResult` returned, message includes trunk/current
  - [ ] Test: `manager.update()` throws `BranchGuardWarnError`, called without `confirm` → `errorResult` returned, message instructs retry with `confirm: true`, `manager.update` called only once
  - [ ] Test: `manager.update()` throws `BranchGuardWarnError`, called with `confirm: true` → `manager.update({ confirmed: true })` called, `jsonResult` returned with success shape
  - [ ] Success: `pnpm test -w packages/mcp-server -- guideTools` passes

- [ ] **5.4 Commit MCP changes**
  - [ ] Stage `guideTools.ts`, `guideTools.test.ts`
  - [ ] Run `pnpm -r build` and `pnpm test` — clean
  - [ ] Commit: `feat(mcp): add branch guard confirm flow to guide_update tool`
  - [ ] Success: commit created, build/tests green

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
