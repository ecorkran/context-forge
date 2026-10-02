---
docType: tasks
slice: agent-skills-path-alignment-codex-copilot
project: context-forge
lld: user/slices/929-slice.agent-skills-path-alignment-codex-copilot.md
dependencies: []
projectState: main is clean at 3b97640; published version is 0.18.2. The agents command target installs machine-level Codex skills to ~/.codex/skills (slice 924 D2), which Codex now marks deprecated in favor of ~/.agents/skills. setup-ide's copilot descriptor propagates only .github/instructions and .github/prompts to worktrees. The 929 design was reviewed (CONCERNS) and all findings are resolved in the design.
dateCreated: 20261002
dateUpdated: 20261002
status: not_started
---

## Context Summary

- Working on slice 929: move cf's skill delivery onto the shared Agent
  Skills directory. Fixes GitHub #99 (Codex machine-level skills path) and
  #102 (copilot worktrees miss `.agents/skills`).
- Decisions D1–D5 in the slice design are settled. Do not reopen them while
  implementing. In short:
  - D1: `agents` machine-level dir becomes `~/.agents/skills` (`CODEX_HOME`
    is not honored).
  - D2/D3: every default-scope install and uninstall for `agents` sweeps cf's
    bundled skill names out of the legacy `~/.codex/skills`, by calling the
    existing `uninstallCommands(target, legacyDir)`.
  - D3a: skip the sweep when the legacy and install dirs are the same real
    directory.
  - D3b: sweep errors propagate; no rollback.
  - D4: copilot keeps `.github/prompts` and adds `.agents/skills` to
    `propagateDirs`.
  - D5: `legacyGlobalDir` is one optional descriptor field, not a list.
- #102 can't happen yet (no guide release through v0.19.2 ships skills).
  The descriptor fix still lands; walkthrough step 4 seeds a skill to show it.
- No dependencies. The next planned slice is 930 (prune stale guide files in
  worktrees), then 212 (guide exclude globs).
- Full rationale lives in the slice design. Read its Data Flow and Technical
  Decisions sections before starting Part 1.

**Key files**
- `packages/cli/src/commands/commandInstaller.ts`: `COMMAND_TARGETS`,
  `resolveInstallDir`, `uninstallCommands`, `installCommandsForTarget`,
  `registerUninstallCommandsCommand`.
- `packages/cli/src/commands/setup-ide.ts`: `TARGETS.copilot.propagateDirs`
  (around line 46).
- `packages/cli/tests/commands/commandInstaller.test.ts`
- `packages/cli/tests/commands/setup-ide.test.ts` (copilot propagation test,
  around line 922).

**Testing note:** use the local build (`node packages/cli/dist/index.js`).
The global `cf` is the published npm package and won't show your changes.

---

## Tasks

### Part 0 — Branch

- [ ] **Task 0: Create the slice branch** (effort: 1)
  - [ ] Run `cf config get git.integration_branch`. If it prints a value,
        STOP and ask the Project Manager. The plan assumes it is empty and
        the target is `main`.
  - [ ] From a clean `main`, run
        `git checkout -b 929-slice.agent-skills-path-alignment-codex-copilot main`.
        If the branch already exists, switch to it instead.
  - [ ] Success criteria: `git branch --show-current` prints the branch
        name, and the working tree is clean.

### Part 1 — Codex machine-level path and legacy sweep (#99)

- [ ] **Task 1: Point the `agents` target at `~/.agents/skills`** (effort: 1)
  - [ ] In `COMMAND_TARGETS.agents`, change `globalDir` to return
        `path.join(os.homedir(), '.agents', 'skills')`.
  - [ ] Replace the comment above it ("design D2 — live-verified before
        merge") with one that cites the Codex source: in
        `codex-rs/ext/skills/src/host_roots.rs`, `$CODEX_HOME/skills` is the
        deprecated user location and `$HOME/.agents/skills` is the user root.
        Also mention that squadron writes to the same place.
  - [ ] Leave `localDir` (`.agents/skills`) and the `claude` target
        unchanged.
  - [ ] Success criteria: `pnpm --filter @context-forge/cli build` passes.

- [ ] **Task 1a: Update the path test** (effort: 1)
  - [ ] In `commandInstaller.test.ts`, the `resolveInstallDir` test (around
        line 77) expects `path.join(os.homedir(), '.agents', 'skills')` for
        `agents`.
  - [ ] Success criteria: the `commandInstaller` test file passes.
  - [ ] Commit: `fix: install Codex skills to ~/.agents/skills`

- [ ] **Task 2: Add the `legacyGlobalDir` descriptor field** (effort: 1)
  - [ ] Add an optional `legacyGlobalDir?: () => string` to
        `CommandTargetDescriptor`. Write a doc comment saying it is a
        machine-level dir cf used to install into, which the default scope
        sweeps clean.
  - [ ] Set it on `agents` only: `path.join(os.homedir(), '.codex', 'skills')`.
        Do not set it on `claude` (D5).
  - [ ] Success criteria: build passes, and no code branches on the target
        name to find the legacy path (it comes from the descriptor).

- [ ] **Task 3: Implement `sweepLegacyGlobalDir(target)`** (effort: 2)
  - [ ] Add an exported `sweepLegacyGlobalDir(target: CommandTarget, installDir: string): string[]`
        that returns the removed skill names:
    1. If the descriptor has no `legacyGlobalDir`, return `[]`.
    2. If the legacy dir does not exist, return `[]`.
    3. Same-dir guard (D3a): if the install dir exists and
       `fs.realpathSync(legacyDir) === fs.realpathSync(installDir)`, return
       `[]`.
    4. Otherwise return `uninstallCommands(target, legacyDir)`.
  - [ ] Do not wrap anything in try/catch. Errors propagate with their real
        message (D3b).
  - [ ] Do not copy removal logic. The only removal path is
        `uninstallCommands`, which removes exactly the bundled skill names.
  - [ ] Success criteria: build passes. The function has no `any` and is
        well under ~50 lines.

- [ ] **Task 3a: Unit tests for the sweep** (effort: 2)
  - [ ] Use temp dirs for both the legacy dir and the install dir. Stub
        `os.homedir()` to a temp dir so the descriptor's paths resolve
        inside it. If `vi.spyOn(os, 'homedir')` doesn't take effect with the
        ESM namespace import, use `vi.mock('node:os', …)` and keep the rest
        of `os` real.
  - [ ] Add these cases:
    1. Legacy dir has all nine bundled `cf-*` skills, `.system/`, a
       non-cf skill, and a hand-made `cf-custom/SKILL.md`. The sweep returns
       exactly the nine bundled names. `.system`, the non-cf skill,
       `cf-custom`, and the legacy dir itself all remain.
    2. A missing legacy dir returns `[]` and does not throw.
    3. Legacy dir is a symlink to the install dir, which holds installed
       skills. The sweep returns `[]`, and the installed skills are still
       there.
    4. Calling it for the `claude` target returns `[]`.
  - [ ] Success criteria: the new tests pass, and existing `commandInstaller`
        tests still pass.
  - [ ] Commit: `feat: sweep cf skills from legacy ~/.codex/skills`

- [ ] **Task 4: Run the sweep on default-scope install** (effort: 2)
  - [ ] In `installCommandsForTarget`, after `installCommands` returns and
        `reportInstall` prints, run the sweep only when the scope is the
        default (`!opts.local && !opts.targetDir`). Install happens first,
        so a failed install never reaches the sweep.
  - [ ] Add a small reporting helper for the legacy line, shared with
        Task 5. When the sweep removed anything, print one separate line:
        `Removed <N> <noun> from legacy location <legacyDir>: <hint>, <hint>, …`.
        Build each hint with `descriptor.invocationHint`, e.g. `$cf-build`.
        Print nothing when the list is empty.
  - [ ] Don't change call sites. `setup-ide.ts:294` and `init.ts:141` use
        the default scope, so they pick this up automatically.
  - [ ] Success criteria: build passes. `--local` and `--target` code paths
        never call the sweep.

- [ ] **Task 4a: Install-path tests** (effort: 2)
  - [ ] Using the stubbed home from Task 3a, add these cases to the
        `installCommandsAction` describe block:
    1. Default-scope `installCommandsAction('codex')` with bundled skills in
       the legacy dir installs to `<home>/.agents/skills`, removes them from
       `<home>/.codex/skills`, and the log contains the
       `from legacy location` line.
    2. Running it again with an already-clean legacy dir: the log has no
       `legacy location` line.
    3. `{ local: true }` (with `process.cwd()` pointed at a temp dir) and
       `{ targetDir }` leave the legacy dir untouched.
    4. Install failure: make `installCommands` throw (e.g. make the install
       dir path an existing *file*). The call throws, and the legacy skills
       are still there.
  - [ ] Success criteria: all `commandInstaller` tests pass.
  - [ ] Commit: `feat: migrate Codex skills on default-scope install`

- [ ] **Task 5: Run the sweep on default-scope uninstall** (effort: 2)
  - [ ] Move the body of the `uninstall-commands` action into an exported
        `uninstallCommandsAction(ide: string, opts: InstallScopeOptions)` so
        it can be tested. Keep the register function as a thin wrapper with
        the same try/catch and `process.exit(1)`.
  - [ ] In it: remove from the install dir as today and keep the existing
        `Removed N <noun> from <dir>` line. Then, for the default scope only,
        run `sweepLegacyGlobalDir` and print its removals with the Task 4
        helper.
  - [ ] Print `No <noun> found to remove.` only when both the install-dir
        removal and the sweep removed nothing.
  - [ ] Success criteria: build passes. CLI behavior for `--local` and
        `--target` is unchanged.

- [ ] **Task 5a: Uninstall-path tests** (effort: 2)
  - [ ] Add a `uninstallCommandsAction` describe block (stubbed home) with
        these cases:
    1. Skills in both `.agents/skills` and `.codex/skills`: both are
       removed, and the log has two separate lines, one naming each folder.
    2. Skills only in the legacy dir: only the legacy line prints, and there
       is no "No skills found" line.
    3. Both dirs empty: only `No skills found to remove.` prints.
    4. `{ local: true }` with a populated legacy dir: the legacy dir is
       untouched.
  - [ ] Success criteria: all `commandInstaller` tests pass, and
        `init.test.ts` (which mocks `registerUninstallCommandsCommand`)
        still passes.
  - [ ] Commit: `feat: sweep legacy Codex skills on uninstall`

### Part 2 — Copilot worktree propagation (#102)

- [ ] **Task 6: Add `.agents/skills` to copilot `propagateDirs`** (effort: 1)
  - [ ] In `setup-ide.ts`, `TARGETS.copilot.propagateDirs` (around line
        46), add `'.agents/skills'` and keep `.github/instructions` and
        `.github/prompts` (D4).
  - [ ] No other changes. `propagateToWorktrees` already skips missing
        source dirs and copies each entry with `cpSync` recursively.
  - [ ] Success criteria: build passes.

- [ ] **Task 6a: Copilot propagation test** (effort: 1)
  - [ ] In `setup-ide.test.ts`, extend the test "copilot copies both marker
        files and .github/instructions/ + .github/prompts/" (around line
        922): make `'/tmp/test/.agents/skills'` exist in `mockExistsSync`,
        and assert
        `mockCpSync` was called with `'/tmp/test/.agents/skills'`,
        `` `${wtPath}/.agents/skills` ``, `{ recursive: true }`. Update the
        test title to mention `.agents/skills/`.
  - [ ] Success criteria: the `setup-ide` tests pass.
  - [ ] Commit: `fix: propagate .agents/skills to copilot worktrees`

### Part 3 — Docs

- [ ] **Task 7: README copilot layout line** (effort: 1)
  - [ ] At `README.md:113-114`, change the copilot layout from
        `.github/{instructions,prompts}/` to `.github/instructions/` plus
        `.agents/skills/<name>/SKILL.md`.
  - [ ] Search the README for `.codex/skills` and change any machine-level
        Codex path to `~/.agents/skills`.
  - [ ] Success criteria: the README has no `~/.codex/skills` as the
        install location.

- [ ] **Task 8: CHANGELOG entry** (effort: 1)
  - [ ] Under `## [Unreleased]` in `CHANGELOG.md`, add entries in the
        existing style:
    - Fixed (#99): machine-level Codex skills now install to
      `~/.agents/skills`. The next default-scope install, `setup-ide codex`,
      or `init --ide codex` removes cf's own skills from the legacy
      `~/.codex/skills`. Other skills there are left alone.
    - Fixed (#102): `setup-ide copilot` propagates `.agents/skills` to
      worktrees.
  - [ ] Success criteria: both issues are referenced, and the entry says
        what happens to existing installs.

- [ ] **Task 9: Mark 924's D2 as superseded** (effort: 1)
  - [ ] In `user/slices/924-slice.codex-command-installer-parity.md`, line
        50 (D2), strike through the old D2 text and add a bold one-line
        note, in the same style as the D5 note on line 53: superseded by
        slice 929 (20261002); the machine-level dir is now
        `~/.agents/skills`, since Codex marks `~/.codex/skills` deprecated.
  - [ ] Success criteria: D2 is marked superseded and points to 929.

- [ ] **Task 10: Add the stale-prompt-files note to 930's plan entry**
      (effort: 1)
  - [ ] In `user/architecture/900-slices.maintenance-and-refactoring.md`,
        entry 30 (930), add one sentence to the "Design must settle" list:
        worktrees propagated before guide 0.18.1 can hold generated
        `.github/prompts/*.prompt.md` files marked
        `<!-- context-forge:generated -->`, which the guide's manifest doesn't
        list. The guide removes them at the root with a marker check, so 930
        needs the same check in worktrees. Also note that 929 added
        `.agents/skills` to copilot's `propagateDirs`.
  - [ ] Success criteria: the 930 entry mentions both points. No other plan
        entries change.
  - [ ] Commit: `docs: update README, CHANGELOG and plans for slice 929`

### Part 4 — Validation

- [ ] **Task 11: Full build and test pass** (effort: 1)
  - [ ] From the project root, run `pnpm -r build`, then `pnpm -r test`.
  - [ ] Grep the source for leftover `'.codex', 'skills'` outside
        `legacyGlobalDir` and its tests. There should be none.
  - [ ] Success criteria: build and all package test suites pass with no
        `any` added. If they fail, fix and commit
        (`fix: …`) before moving on.

- [ ] **Task 12: Verification walkthrough steps 1 and 3 (Codex migration)**
      (effort: 2)
  - [ ] Run walkthrough step 1 from the slice design on the PM's machine
        using the local build. Confirm: the install line names
        `~/.agents/skills`, the legacy line lists the 9 `cf-*` skills,
        `~/.codex/skills` has no `cf-*` left (`.system` intact), and a
        second run prints no legacy line.
  - [ ] Run walkthrough step 3 (`--local` leaves `cf-dummy`; default-scope
        uninstall removes it), then re-run step 1's install to restore the
        machine-level skills.
  - [ ] Success criteria: every expected result in steps 1 and 3 matches.
        Record actual output in the slice design's verification section if
        anything differs.

- [ ] **Task 13: Walkthrough step 2 (live Codex discovery, PM-assisted)**
      (effort: 1)
  - [ ] Ask the PM to start `codex`, type `$cf-`, and confirm each cf skill
        appears exactly once, then run `$cf-status`.
  - [ ] Success criteria: the PM confirms no duplicates and that `$cf-status`
        works. Do not mark this complete without that confirmation.

- [ ] **Task 14: Walkthrough step 4 (copilot worktree)** (effort: 2)
  - [ ] Build a scratch project with one registered worktree, isolated from
        the real project store with `CONTEXT_FORGE_DATA_DIR` plus a `cf`
        wrapper script that calls the local build (same approach as slice
        928's walkthrough). Seed `.agents/skills/demo/SKILL.md` at the root,
        run `cf setup-ide copilot --yes`, and confirm the worktree has
        `.agents/skills/demo/SKILL.md`.
  - [ ] Clean up the scratch project, its worktree, and the isolated data
        dir afterward.
  - [ ] Success criteria: `demo` is present in the worktree, and the real
        project store is untouched.
  - [ ] Commit any walkthrough notes:
        `docs: record slice 929 verification results`

- [ ] **Task 15: Close out** (effort: 1)
  - [ ] Set the slice design and this task file to `status: complete`, and
        check off 929 in the 900 slice plan (update `dateUpdated`).
  - [ ] Run `cf check` and confirm it reports no new warnings for 929.
  - [ ] Commit: `docs: mark slice 929 complete`
  - [ ] Stop here. Merging to `main` and releasing are the PM's call
        (release is a patch bump per the release-bump preference).
