---
docType: tasks
slice: smart-cf-init-composition
project: context-forge
lld: user/slices/202-slice.smart-cf-init-composition.md
dependencies: []
dateCreated: 20260315
dateUpdated: 20260315
status: not_started
---

# Tasks: Slice 202 — Smart cf init Composition

## Context Summary

Extend `cf init` into a full onboarding sequencer: git init, project creation, guide installation, command installation, and IDE configuration. Core work is extracting `guidesInstallAction` and `setupIdeAction` from inline command handlers into exportable functions (same pattern as `projectSetAction` in `project.ts`). `installCommands()` is already standalone — add a thin `installCommandsAction` wrapper. Then rewrite `init.ts` action to compose all steps with detection-based skipping and new flags (`--lite`, `--no-ide`, `--ide`, `--name`).

**Files to modify:**
- `packages/cli/src/commands/guides.ts`
- `packages/cli/src/commands/setup-ide.ts`
- `packages/cli/src/commands/commandInstaller.ts`
- `packages/cli/src/commands/init.ts`
- `packages/cli/tests/commands/guides.test.ts`
- `packages/cli/tests/commands/setup-ide.test.ts`
- `packages/cli/tests/commands/init.test.ts`

**Branch:** `202-slice.smart-cf-init-composition`

---

## Section 1: Setup

- [ ] **1.1** Verify branch
  - [ ] Run `git branch` — confirm on `main`
  - [ ] Create and switch: `git checkout -b 202-slice.smart-cf-init-composition`

---

## Section 2: Extract guidesInstallAction

- [ ] **2.1** Extract `guidesInstallAction` from `guides.ts`
  - [ ] Add export: `export async function guidesInstallAction(projectPath: string, opts?: { strategy?: GuideMethod; source?: string }): Promise<void>`
  - [ ] Move install logic (lines 86–96 of current `guides.ts`) into the function body
  - [ ] The `cf guides install` command action becomes a thin wrapper: resolves `projectPath` then calls `guidesInstallAction(projectPath, opts)`
  - [ ] Existing command behavior unchanged — same output, same errors

- [ ] **2.2** Test: `guidesInstallAction` unit tests (add to `guides.test.ts`)
  - [ ] Import `guidesInstallAction` directly (not via Command) and call it with a mocked `GuideManager`
  - [ ] Test: successful install prints version and method
  - [ ] Test: error thrown by `manager.install()` propagates (not swallowed)
  - [ ] Test: existing `cf guides install` command tests still pass unchanged
  - [ ] Run `pnpm --filter @context-forge/cli test` — all pass

**Commit:** `refactor(cli): extract guidesInstallAction from guides install handler`

---

## Section 3: Extract setupIdeAction + CLAUDE.md Backup Strategy

- [ ] **3.1** Extract `setupIdeAction` from `setup-ide.ts`
  - [ ] Add export: `export async function setupIdeAction(projectPath: string, target: string, opts?: { yes?: boolean }): Promise<void>`
  - [ ] Move logic from lines 34–105 into the function body (target validation, guide check, script location, CLAUDE.md handling, script execution)
  - [ ] The `cf setup-ide` command action becomes a thin wrapper: resolves `projectPath` then calls `setupIdeAction(projectPath, target, opts)`

- [ ] **3.2** Implement updated CLAUDE.md backup logic inside `setupIdeAction`
  - [ ] Add helper: `isManagedClaudeMd(filePath: string): boolean` — reads first 20 lines, returns true if any line trims to `[//]: # (context-forge:managed)`
  - [ ] Replace current backup block with three-case logic:
    - No CLAUDE.md → proceed silently
    - CLAUDE.md present, managed marker found → skip backup, proceed silently
    - CLAUDE.md present, no marker, no `.bak` → copy to `.bak`, print notice (`console.log`)
    - CLAUDE.md present, no marker, `.bak` exists → skip copy, print "existing backup preserved at CLAUDE.md.bak" (`console.log`)
  - [ ] `--yes` flag still bypasses interactive prompt only; backup logic runs regardless

- [ ] **3.3** Test: `setupIdeAction` unit tests (add to `setup-ide.test.ts`)
  - [ ] Import `setupIdeAction` directly and call with mocked `fs`, `execFileSync`, `GuideDetector`
  - [ ] Test: managed marker present — `copyFileSync` not called, script runs
  - [ ] Test: no CLAUDE.md — `copyFileSync` not called, script runs
  - [ ] Test: no marker, no `.bak` — `copyFileSync` called with `.bak` path, notice printed
  - [ ] Test: no marker, `.bak` exists — `copyFileSync` not called, "existing backup preserved" printed
  - [ ] Test: existing `cf setup-ide` command tests still pass unchanged (update the "creates .bak" test to use managed marker logic if needed)
  - [ ] Run `pnpm --filter @context-forge/cli test` — all pass

**Commit:** `refactor(cli): extract setupIdeAction with managed CLAUDE.md backup strategy`

---

## Section 4: Add installCommandsAction wrapper

- [ ] **4.1** Add thin wrapper to `commandInstaller.ts`
  - [ ] Add export: `export function installCommandsAction(targetDir?: string): void`
  - [ ] Body: resolves `targetDir` to `defaultTarget()` if omitted, calls `installCommands(targetDir)`, prints the same success output as the command handler
  - [ ] No change to `installCommands()` itself or the `registerInstallCommandsCommand` handler

- [ ] **4.2** Test: `installCommandsAction` (add to `commandInstaller.test.ts`)
  - [ ] Test: called without args uses default target directory
  - [ ] Test: called with explicit dir passes it through to `installCommands`
  - [ ] Run `pnpm --filter @context-forge/cli test` — all pass

**Commit:** `refactor(cli): add installCommandsAction wrapper to commandInstaller`

---

## Section 5: Enhance cf init

- [ ] **5.1** Add new flags to `init.ts` command registration
  - [ ] `--lite` (boolean) — project creation only, skip guides/commands/IDE
  - [ ] `--no-ide` (boolean) — skip IDE setup step
  - [ ] `--ide <target>` (string, default `'claude'`) — IDE target
  - [ ] `--name <name>` already exists — no change needed

- [ ] **5.2** Implement detection phase in `init.ts` action
  - [ ] **Check 1 — No `.git`:** use `fs.existsSync(path.join(cwd, '.git'))`. If absent, run `execFileSync('git', ['init'], { cwd, stdio: 'inherit' })` and print `✓ git initialized`. Wrap in try/catch — failure prints warning, continues.
  - [ ] **Check 2 — CF project at CWD:** `store.getAll()` → find `p.projectPath === cwd`. If found, print status ("Project '{name}' is already registered. Run cf status for details.") and return.
  - [ ] **Check 3 — Git worktree:** implement `isWorktreeOf(cwd, registeredPaths): boolean` — runs `execFileSync('git', ['worktree', 'list', '--porcelain'], { cwd, encoding: 'utf8' })`, parses `worktree <path>` lines, checks if main worktree path is in `registeredPaths` and differs from `cwd`. Wrap in try/catch → return false on error. If true, print suggestion ("This looks like a worktree. Run cf worktree init instead.") and return.

- [ ] **5.3** Implement step execution in `init.ts` action
  - [ ] **Step 1 — Create project:** call `store.create(...)` with same defaults as current `init.ts`. Print `✓ Project '{name}' registered`. Fatal on error.
  - [ ] **Step 2 — Guides:** if not `--lite`: call `guidesInstallAction(cwd)` in try/catch. On success print `✓ Guides installed`. On `GuideAlreadyInstalledError` (or message contains "already installed") print dim skip message. On other error print `warn(...)` and continue.
  - [ ] **Step 3 — Commands:** if not `--lite`: call `installCommandsAction()` in try/catch. On success print `✓ Commands installed`. On error print `warn(...)` and continue.
  - [ ] **Step 4 — IDE:** if not `--lite` and not `--no-ide`: call `setupIdeAction(cwd, opts.ide ?? 'claude', { yes: true })` in try/catch. On success print `✓ IDE configured for {target}`. On error print `warn(...)` and continue.
  - [ ] Print separator line and `cf next` nudge at end.

- [ ] **5.4** Test: extend `init.test.ts` with new cases
  - [ ] Mock `node:child_process` (`execFileSync`) and `node:fs` (`existsSync`) — follow pattern from `setup-ide.test.ts`
  - [ ] Mock `guidesInstallAction`, `setupIdeAction`, `installCommandsAction` via `vi.mock`
  - [ ] Test: no `.git` → `execFileSync('git', ['init'], ...)` called
  - [ ] Test: CF project already at CWD → returns early with status message, no `store.create`
  - [ ] Test: worktree detected → returns early with worktree suggestion, no `store.create`
  - [ ] Test: `--lite` → only `store.create` called; guides/commands/IDE actions not called
  - [ ] Test: `--no-ide` → guides + commands called; `setupIdeAction` not called
  - [ ] Test: `--ide cursor` → `setupIdeAction` called with `'cursor'`
  - [ ] Test: guides already installed (action throws "already installed") → skip message printed, init continues
  - [ ] Test: guides install failure (other error) → warning printed, init continues (no process.exit)
  - [ ] Test: existing `init.test.ts` tests (basename name, --name override, already registered) still pass
  - [ ] Run `pnpm --filter @context-forge/cli test` — all pass

**Commit:** `feat(cli): enhance cf init with full onboarding sequence and detection`

---

## Section 6: Build & Verify

- [ ] **6.1** Build all packages
  - [ ] `pnpm build` from repo root — no errors

- [ ] **6.2** Run full test suite
  - [ ] `pnpm test` from repo root — all packages pass

- [ ] **6.3** Smoke test (manual)
  - [ ] `mkdir /tmp/cf-init-202-test && cd /tmp/cf-init-202-test`
  - [ ] `cf init --lite --name "Smoke Test"` — confirms project created, no guides/commands/IDE
  - [ ] `cf status` — confirms project registered at path
  - [ ] Unregister or skip if full-flow test not desired (guides install requires network)

**Commit:** `chore: verify build and tests for slice 202`

---

## Section 7: Wrap-up

- [ ] **7.1** Update slice and slice plan status
  - [ ] `202-slice.smart-cf-init-composition.md` → `status: complete`, `dateUpdated: today`
  - [ ] `200-slices.developer-onboarding.md` → check off slice 202 entry, `dateUpdated: today`

- [ ] **7.2** Write DEVLOG entry (format: `## YYYY-MM-DD` → brief notes + commit hashes)

- [ ] **7.3** Final commit
  - [ ] `git add` all changed doc files
  - [ ] `git commit -m "docs: complete slice 202 smart cf init composition"`

- [ ] **7.4** Merge to main
  - [ ] `git checkout main && git merge 202-slice.smart-cf-init-composition --no-ff`
