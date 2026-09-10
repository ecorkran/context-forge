---
docType: tasks
slice: guide-install-robustness
project: context-forge
lld: user/slices/925-slice.guide-install-robustness.md
dependencies: [916]
projectState: main is green, working tree clean at 14c2096. v0.13.2 is tagged and published (all four packages). Slice 925 design is approved with a CONCERNS slice review (F004/F005 resolved in the design). GuideMethod is still 'submodule' | 'clone' | 'manual'; GuideDetector.checkSyncStatus() exists but detect() does not record checkout state; cf init has no --strategy flag; resolveStrategy() hard-codes 'submodule' at GuideManager.ts:196 behind a silent catch. Next release will be 0.14.0 (user-visible rename manual → tarball).
dateCreated: 20260909
dateUpdated: 20260909
status: in_progress
---

## Context Summary

- Working on slice 925: fix GitHub #80 (auto-init an uninitialized guide
  submodule before any read command), #81 (rename strategy `manual` →
  `tarball`, expose `cf init --strategy`, document trade-offs), and #82
  (state that the guide directory is managed content).
- Design decisions D1–D10 in the slice design are settled — do not
  relitigate during implementation. Notably: default strategy stays
  `submodule` (D6); auto-act only on `not_initialized`, warn on
  `out_of_sync` (D2); notices go to stderr / MCP `notices[]` (D4);
  `manual` is a deprecated alias handled in one `normalizeGuideMethod()`
  (D5); auto-init fetch is bounded by `GUIDE_INIT_TIMEOUT_MS`, install and
  update stay unbounded (D10).
- Prerequisites shipped: slice 916 branch guard; #77/#78 error surfacing in
  `packages/core/src/guides/gitExec.ts` (`withNetworkErrorHint`,
  `GUIDE_OFFLINE_REMEDIATION`, non-interactive git env).
- Delivers: `normalizeGuideMethod()`, `GuideInfo.checkout`,
  `SubmoduleStrategy.init()`, `GuideManager.ensureCheckout()`, CLI/MCP
  call-site wiring, `cf init --strategy`, `GUIDE_STRATEGIES` help
  descriptor, `GUIDE_MANAGED_NOTICE`, README/CHANGELOG/DEVLOG.
- Next planned slice: none scheduled; 900 initiative returns to complete
  when this slice merges.

Full rationale lives in `user/slices/925-slice.guide-install-robustness.md`.

**Implementation order rationale:** the rename first because every later
step touches `GuideMethod` and it is the widest change; then detection and
init primitives in core; then the call sites that consume them; then the
`cf init` surface and help; then the managed-directory notice and docs.

**Branch:** `925-slice.guide-install-robustness` forked from `main`
(`git.integration_branch` is unset). Create it before Task 1.

**Existing test locations:** core guide tests are in
`packages/core/tests/guides/` (and `strategies/`), CLI in
`packages/cli/tests/commands/`, MCP in `packages/mcp-server/tests/`.
`GuideDetector.test.ts` mocks the filesystem; `SubmoduleStrategy.test.ts`
is the place to look for an existing real-git temp-repo pattern.

---

## Tasks

### Part 1 — Strategy Vocabulary (D5, D6, D7)

- [x] **Task 1: `GuideMethod` rename and `normalizeGuideMethod()`** (effort: 2)
  - [x] In `packages/core/src/guides/types.ts` change `GuideMethod` to
        `'submodule' | 'clone' | 'tarball'`.
  - [x] Add and export `normalizeGuideMethod(input: string): GuideMethod`.
        Accepts the three canonical values unchanged; maps `manual` →
        `tarball`; anything else throws an error whose message names the
        valid values. This is the only place the `manual` alias is spelled
        in source outside the `ConfigKeys` enum.
  - [x] Add and export `GUIDE_METHOD_DEPRECATED_ALIASES` (or equivalent
        single lookup) so callers can detect that the input was an alias
        and emit the deprecation warning (D5) without re-comparing strings.
  - [x] Export from `packages/core/src/guides/index.ts` and confirm it
        reaches `@context-forge/core/node`.
  - [x] Success criteria: `pnpm --filter @context-forge/core typecheck`
        reports errors only at the `'manual'` sites listed in the design's
        "Rename sweep" section (those are fixed in Task 3).

- [x] **Task 2: Tests for `normalizeGuideMethod()`** (effort: 1)
  - [x] New test file `packages/core/tests/guides/types.test.ts` (or add to
        an existing guides test if a types test already exists).
  - [x] Cases: each canonical value passes through; `manual` → `tarball`;
        empty string, whitespace, and an unknown word each throw; the error
        message contains all three canonical values.
  - [x] Success criteria: tests pass.

- [x] **Task 3: Rename sweep across core** (effort: 2)
  - [x] Replace every non-test `'manual'` literal at the locations listed in
        the design's "Rename sweep (exact locations)": `GuideDetector.ts`,
        `GuideManager.ts` (`getStrategy` case), `CloneStrategy.ts`,
        `SubmoduleStrategy.ts`, `TarballStrategy.ts` (method field,
        `DetectionResult`, `InstallResult`, `UpdateResult`).
  - [x] `packages/core/src/config/ConfigKeys.ts`: enum becomes
        `['submodule', 'clone', 'tarball', 'manual']` — `manual` stays so
        existing shared config validates (D5). Default remains `'submodule'`.
  - [x] Success criteria: `grep -rn "'manual'" packages/core/src` returns
        only the `normalizeGuideMethod()` alias entry and the `ConfigKeys`
        enum line. Core typechecks.

- [x] **Task 4: Update existing core tests for the rename** (effort: 1)
  - [x] Update `GuideDetector.test.ts`, `TarballStrategy.test.ts`, and
        `GuideManager.test.ts` expectations from `manual` to `tarball`.
  - [x] Success criteria: `pnpm --filter @context-forge/core test` passes in
        full. Commit: `refactor(core): rename guide strategy manual to tarball`.

- [x] **Task 5: Remove silent catches in `resolveStrategy()` / `resolveSource()`** (effort: 2)
  - [x] In `packages/core/src/guides/GuideManager.ts` remove the `catch`
        blocks at ~lines 177 and 192. Config read errors propagate (D7).
  - [x] `resolveStrategy()` returns
        `normalizeGuideMethod(configValue)` where the config value comes
        from `ConfigManager.get()`; an unset key already yields the
        `ConfigKeys` default with `source: 'default'`, so no fallback branch
        is needed. Delete the `'submodule'` literal at ~line 196.
  - [x] `resolveStrategy()` (or its caller `install()`) must surface whether
        the config value was the deprecated alias so `cf guides install` can
        print the D5 warning for the config-file case. Choose one return
        shape (e.g. `{ method, deprecatedAlias?: string }`) and use it for
        both the CLI flag and the config path.
  - [x] Success criteria: `grep -n "'submodule'" GuideManager.ts` shows only
        method comparisons (`=== 'submodule'`, `case 'submodule'`), no
        default assignment. No `catch {}` without an explanatory comment
        remains in the file.

- [x] **Task 6: Tests for config-sourced strategy** (effort: 2)
  - [x] In `GuideManager.test.ts`: (a) unset key → `install()` uses the
        `ConfigKeys` default (read the expected value from `ConfigKeys`, do
        not hard-code); (b) `guide.git_strategy: manual` in config →
        `TarballStrategy` selected and the alias is reported; (c) a
        `ConfigManager.get()` that throws → `install()` rejects with that
        error, no install attempted.
  - [x] Success criteria: tests pass. Commit:
        `fix(core): source guide strategy default from ConfigKeys, drop silent catches`.

- [x] **Task 7: Alias handling at CLI and MCP input boundaries** (effort: 2)
  - [x] `packages/cli/src/commands/guides.ts` install action: pass the raw
        `--strategy` string through `normalizeGuideMethod()`; on alias input
        print one deprecation line to **stderr** (`console.error`) naming
        `tarball`. Remove the `as GuideMethod` cast at ~line 125.
  - [x] Same file: `guidesInstallAction()` prints the config-path
        deprecation warning when Task 5's return shape reports an alias.
  - [x] `packages/mcp-server/src/tools/guideTools.ts` `guide_install`: zod
        enum becomes `['submodule', 'clone', 'tarball', 'manual']`;
        normalize before calling `manager.install()`; on alias, add a
        `notices: string[]` entry to the result. Update the description
        strings at ~lines 47 and 92–93 to say `tarball`.
  - [x] `guide_status` description string: replace `manual` with `tarball`.
  - [x] Success criteria: `grep -rn "manual" packages/cli/src packages/mcp-server/src`
        returns only the MCP enum entry and deprecation-message text.

- [x] **Task 8: Tests for boundary alias handling** (effort: 2)
  - [x] `packages/cli/tests/commands/guides.test.ts`: `install --strategy manual`
        installs via tarball, deprecation text appears on stderr only,
        `guides info --json` reports `"method": "tarball"`.
  - [x] Same file: with `guide.git_strategy: manual` in the shared config
        and no `--strategy` flag, `cf guides install` prints the same
        deprecation line to stderr and installs via tarball (review F002 —
        the config-sourced path is tested end to end, not only in core).
  - [x] `packages/mcp-server/tests/guideTools.test.ts`: `guide_install`
        accepts `tarball` and `manual`; the `manual` call returns a
        `notices` array with one entry; `tarball` call returns none.
  - [x] Success criteria: CLI and MCP suites pass. Commit:
        `feat: accept tarball strategy name with manual as deprecated alias`.

### Part 2 — Checkout Detection and Init (D1, D2, D10)

- [x] **Task 9: Test fixture — real git repo with a guide submodule** (effort: 3)
  - [x] Add a helper under `packages/core/tests/guides/` (e.g.
        `helpers/submoduleFixture.ts`) that creates, in a temp directory: a
        bare "guide" repo with one commit and one tag, and a "host" repo
        that adds it as a submodule at `GUIDE_RELATIVE_PATH` and commits.
        Provide three states: `cloned()` — a fresh `git clone` of host
        without `--recurse-submodules` (the #80 state, gitlink present,
        directory empty); `initialized()` — same then
        `git submodule update --init`; `outOfSync()` — initialized then a
        second guide commit checked out inside the submodule.
  - [x] Check whether `SubmoduleStrategy.test.ts` already has a temp-repo
        helper; extend it rather than duplicating.
  - [x] Helper returns paths and a cleanup function; tests skip when
        `isGitAvailable()` is false.
  - [x] Success criteria: a smoke test asserts `git submodule status` output
        begins with `-` for `cloned()`, a space for `initialized()`, and
        `+` for `outOfSync()`.

- [x] **Task 10: `SubmoduleCheckoutState`, labels, `GuideInfo.checkout`** (effort: 1)
  - [x] In `types.ts` export
        `type SubmoduleCheckoutState = 'in_sync' | 'out_of_sync' | 'not_initialized'`,
        `CHECKOUT_STATE_LABELS: Record<SubmoduleCheckoutState, string>`
        (`not_initialized` label is exactly "not initialized" — the success
        criteria string), and `GUIDE_INIT_TIMEOUT_MS = 60_000`.
  - [x] Add `checkout: SubmoduleCheckoutState | null` to `GuideInfo` (null
        for clone/tarball and for not-installed).
  - [x] Retype `GuideDetector.checkSyncStatus()` return as
        `SubmoduleCheckoutState | 'error'` using the exported type.
  - [x] Success criteria: typecheck passes once Task 11 populates the field.

- [x] **Task 11: `GuideDetector.detect()` populates `checkout`** (effort: 2)
  - [x] When the detected method is `submodule`, call
        `checkSyncStatus(operationPath ?? projectPath)` and store the
        result; if it returns `'error'`, throw (git unavailable or not a
        repo is surfaced, not swallowed — D1/D7). Otherwise set `null`.
  - [x] `detect()` remains read-only — no `git submodule update` here.
  - [x] Success criteria: `GuideInfo.checkout` is populated for submodule
        installs.

- [x] **Task 12: `GuideDetector` checkout tests** (effort: 2)
  - [x] Using the Task 9 fixture: `cloned()` → `checkout === 'not_initialized'`
        and `installed === true`; `initialized()` → `'in_sync'`;
        `outOfSync()` → `'out_of_sync'`; a tarball fixture (existing mocked
        test) → `checkout === null`.
  - [x] Assert the fixture directory is unchanged after `detect()` (compare
        `git submodule status` before and after).
  - [x] Success criteria: tests pass. Commit:
        `feat(core): report submodule checkout state in GuideInfo`.

- [x] **Task 13: `gitExec` optional `timeoutMs`** (effort: 1)
  - [x] In `gitExec.ts` add a third parameter
        `opts?: { timeoutMs?: number }`; pass `timeout` and
        `killSignal: 'SIGTERM'` to `execFile` only when provided.
  - [x] On timeout, reject with a message stating the git command timed out
        after N seconds (N derived from `timeoutMs`), then run through the
        existing `withNetworkErrorHint` path so the remediation text is
        appended (the `/timed out/i` pattern already matches).
  - [x] No other caller passes a timeout (D10).
  - [x] Success criteria: existing `gitExec.test.ts` passes unchanged.

- [x] **Task 14: `gitExec` timeout test** (effort: 1)
  - [x] In `gitExec.test.ts`: a command that sleeps longer than a small
        `timeoutMs` (e.g. run a git command against a listener that never
        answers, or mock `execFile` to invoke the callback with a
        `killed: true` error) rejects with a message containing "timed out"
        and `GUIDE_OFFLINE_REMEDIATION`.
  - [x] Success criteria: test passes. Commit:
        `feat(core): add optional timeout to gitExec`.

- [x] **Task 15: Extract `SubmoduleStrategy.init()` from `sync()`** (effort: 2)
  - [x] Add `init(operationPath: string): Promise<{ commit: string }>` that
        runs `git submodule update --init GUIDE_RELATIVE_PATH` in
        `operationPath` with `{ timeoutMs: GUIDE_INIT_TIMEOUT_MS }`, then
        reads the short SHA of the checked-out guide commit (`git rev-parse
        --short HEAD` in the guide dir).
  - [x] `sync()` calls `init()` for its existing `--init` step (~line 127)
        but **without** the timeout: pass the timeout as an `init()` option
        so `sync()` and `update()` keep unbounded behavior (D10).
  - [x] `init()` never touches the host repo index (no `git add`) — it must
        not trip the 916 branch guard.
  - [x] Success criteria: existing `SubmoduleStrategy.test.ts` passes.

- [x] **Task 16: `SubmoduleStrategy.init()` tests** (effort: 2)
  - [x] Using the Task 9 fixture `cloned()`: after `init()` the guide
        directory is populated, returned `commit` matches
        `git rev-parse --short HEAD` in the guide dir, and host
        `git status --porcelain` is empty (no index change).
  - [x] `initialized()`: `init()` is a no-op and returns the same commit.
  - [x] Success criteria: tests pass. Commit:
        `refactor(core): extract SubmoduleStrategy.init from sync`.

- [ ] **Task 17: `GuideManager.ensureCheckout()`** (effort: 3)
  - [ ] Add `EnsureCheckoutResult` to `types.ts` exactly as in the design's
        Implementation Details (`action: 'none' | 'initialized' | 'warned'`,
        optional `commit`, `message`).
  - [ ] Implement per the Data Flow diagram: not installed → `none`;
        method not submodule → `none`; `checkout === 'in_sync'` → `none`;
        `'not_initialized'` → `SubmoduleStrategy.init(operationPath)` →
        `{ action: 'initialized', commit, message }` where message names
        the submodule and short SHA; `'out_of_sync'` →
        `{ action: 'warned', message }` naming `cf guides update` /
        `git submodule update` and stating the checkout was not changed.
  - [ ] Use `GuideInfo.checkout` from `detector.detect()` (Task 11) rather
        than calling `checkSyncStatus()` a second time.
  - [ ] On `init()` failure, rethrow with `GUIDE_OFFLINE_REMEDIATION`
        appended (mirror `setup-ide.ts:113`).
  - [ ] `operationPath` resolution matches `getGuideContext()` in
        `guides.ts` (worktree path when inside a registered worktree).
  - [ ] Success criteria: core typechecks; no new `catch` without a comment.

- [ ] **Task 18: `ensureCheckout()` tests** (effort: 2)
  - [ ] In `GuideManager.test.ts`, one test per branch: not installed;
        tarball install; submodule `in_sync`; `not_initialized` (fixture
        `cloned()`, assert directory populated and result `initialized`
        with a 7+ char commit); `out_of_sync` (assert `warned`, message
        names `cf guides update`, and `git submodule status` unchanged);
        `init()` rejection propagates with `GUIDE_OFFLINE_REMEDIATION` in
        the message.
  - [ ] Success criteria: tests pass. Commit:
        `feat(core): add GuideManager.ensureCheckout for submodule auto-init`.

### Part 3 — Call Sites (D3, D4)

- [ ] **Task 19: `ensureGuideReady()` CLI helper** (effort: 2)
  - [ ] New `packages/cli/src/utils/guideReady.ts` exporting
        `ensureGuideReady(projectPath, operationPath)`; builds
        `GuideManager` the same way `getGuideContext()` does, calls
        `ensureCheckout()`, and prints `result.message` to **stderr** when
        `action !== 'none'`. Returns the result.
  - [ ] Nothing is written to stdout under any branch (D4).
  - [ ] Success criteria: helper compiles and is the only place the CLI
        formats auto-init notices.

- [ ] **Task 20: Wire `cf build`, `cf prompt`, `cf setup-ide`** (effort: 2)
  - [ ] Grep `packages/cli/src` for `createContextPipeline`,
        `resolvePromptFilePath`, `GUIDE_RELATIVE_PATH`, and
        `PROMPT_FILE_RELATIVE_PATH` (the last is how `prompt.ts` reaches the
        guide — it is not in the design's list). Every non-test hit that
        reads guide content gets an `await ensureGuideReady(...)` before
        the read: `build.ts` (~line 78), `prompt.ts` (~lines 60 and 116),
        `setup-ide.ts` (before the `detector.detect()` at ~line 106).
  - [ ] `cf guides info` is **not** wired — it stays read-only (D3).
  - [ ] Success criteria: list the covered call sites in the commit body;
        CLI typechecks.

- [ ] **Task 21: CLI auto-init tests** (effort: 3)
  - [ ] In `build.test.ts` using the Task 9 fixture `cloned()` with a
        registered project: `cf build` exits 0, stderr contains the
        initialized notice with a short SHA, guide dir is populated;
        `cf build --json` stdout parses as JSON and stderr still carries
        the notice. `outOfSync()`: stderr warning names `cf guides update`,
        checkout unchanged.
  - [ ] In `prompt.test.ts` and `setup-ide.test.ts`: one `cloned()` case
        each asserting the command proceeds and the notice is on stderr.
  - [ ] Success criteria: tests pass. Commit:
        `feat(cli): auto-init uninitialized guide submodule before reads`.

- [ ] **Task 22: MCP `context_build` / `prompt_list` / `prompt_get` and `guide_status`** (effort: 2)
  - [ ] In `packages/mcp-server/src/tools/contextTools.ts`, before
        `createContextPipeline` (~line 57) and `resolvePromptFilePath`
        (~line 98), call `ensureCheckout()`; when `action !== 'none'`
        append `message` to a `notices: string[]` array on the tool result
        without changing the primary payload shape (D4).
  - [ ] `guideTools.ts` `guide_status`: include `checkout` (raw state) and
        its `CHECKOUT_STATE_LABELS` text in the result for submodule
        installs.
  - [ ] Success criteria: MCP typechecks; `grep -rn "notices" packages/mcp-server/src`
        shows one shared shape, not per-tool ad hoc fields.

- [ ] **Task 23: MCP tests** (effort: 2)
  - [ ] `contextTools.test.ts`: `context_build` on `cloned()` returns the
        existing payload plus one `notices` entry; on `initialized()` no
        `notices` key (or empty array — pick one and assert it).
  - [ ] Same file: `prompt_list` and `prompt_get` each get one `cloned()`
        case asserting the call succeeds and returns one `notices` entry
        (review F001 — both wired call sites need their own assertion; the
        shared `resolvePromptFilePath` site is not assumed covered by the
        `context_build` test).
  - [ ] `guideTools.test.ts`: `guide_status` on `cloned()` reports
        `checkout: 'not_initialized'` and does not initialize.
  - [ ] Success criteria: tests pass. Commit:
        `feat(mcp): auto-init guide submodule in context tools, report checkout state`.

- [ ] **Task 24: `cf guides info` prints checkout state** (effort: 1)
  - [ ] In `showStatus()` (`guides.ts` ~line 63) add a `Checkout:` line for
        submodule installs using `CHECKOUT_STATE_LABELS`; `--json` already
        prints the whole `GuideInfo`, so `checkout` appears automatically.
  - [ ] Add a `guides.test.ts` case: `cloned()` → text output contains
        `Checkout:` and "not initialized"; directory unchanged afterward.
  - [ ] Success criteria: test passes. Commit:
        `feat(cli): show submodule checkout state in cf guides info`.

### Part 4 — `cf init --strategy` and Help (D8)

- [ ] **Task 25: `GUIDE_STRATEGIES` descriptor and install help** (effort: 1)
  - [ ] In `guides.ts` export `GUIDE_STRATEGIES: Record<GuideMethod, { summary: string }>`
        with the three summaries from the design's Implementation Details.
  - [ ] Add a small `strategyHelpText()` that renders the option description
        from the table; use it for `cf guides install --strategy` (replace
        the literal at ~line 119).
  - [ ] Success criteria: `cf guides install --help` lists all three names
        with their one-line trade-offs; adding a fourth `GuideMethod`
        without a table entry is a type error.

- [ ] **Task 26: `cf init --strategy <method>`** (effort: 1)
  - [ ] In `init.ts` add `.option('--strategy <method>', strategyHelpText())`
        and pass `normalizeGuideMethod(opts.strategy)` (with the alias
        warning to stderr) into `guidesInstallAction(cwd, { strategy })`
        at ~line 118. Existing "already installed" / install-failure
        handling is unchanged.
  - [ ] Success criteria: `cf init --help` shows the same strategy text as
        `cf guides install --help`.

- [ ] **Task 27: `init --strategy` and help tests** (effort: 2)
  - [ ] `init.test.ts`: `--strategy tarball` calls `guidesInstallAction`
        with `tarball` and no `.gitmodules` is created; `--strategy manual`
        does the same plus a stderr deprecation line; `--strategy bogus`
        fails with the valid-values message before any install.
  - [ ] `help.test.ts` (or `guides.test.ts`): both `--help` outputs contain
        `submodule`, `clone`, and `tarball`.
  - [ ] Success criteria: tests pass. Commit:
        `feat(cli): add --strategy to cf init, shared strategy help text`.

### Part 5 — Managed-Directory Notice and Docs (D9)

- [ ] **Task 28: `GUIDE_MANAGED_NOTICE`** (effort: 1)
  - [ ] Add the constant to `types.ts` with the exact D9 sentence. Print it
        from `showStatus()` in the installed branch; return it as
        `managedNotice` from `guide_status`.
  - [ ] Success criteria: `cf guides info` (installed) shows the line.

- [ ] **Task 29: Managed-notice tests** (effort: 1)
  - [ ] `guides.test.ts`: installed text output contains the constant's
        text (import the constant; do not retype the sentence).
  - [ ] `guideTools.test.ts`: `guide_status` result includes `managedNotice`
        equal to the constant.
  - [ ] Success criteria: tests pass. Commit:
        `feat: state that the guide directory is managed content`.

- [ ] **Task 30: README** (effort: 2)
  - [ ] Add a "Choosing a guide install strategy" section listing the three
        strategies with the `GUIDE_STRATEGIES` summaries and the D6
        reasoning for keeping submodule as default (api.github.com surface,
        pinned reviewable commit, contribute-back path). Mention that fresh
        clones auto-init on first read and that `cf guides info` shows
        checkout state.
  - [ ] Quote `GUIDE_MANAGED_NOTICE` verbatim where the guide directory is
        introduced.
  - [ ] Replace any remaining `manual` strategy mentions with `tarball`,
        noting the alias is deprecated.
  - [ ] Success criteria: `grep -n "overwritten on" README.md` finds the
        sentence; `grep -n "strategy manual" README.md` finds nothing.

- [ ] **Task 31: CHANGELOG and DEVLOG** (effort: 1)
  - [ ] CHANGELOG under Unreleased (0.14.0): auto-init (#80), rename with
        alias and the user-visible `method: "manual"` → `"tarball"` output
        change (#81), `cf init --strategy`, managed-directory notice (#82),
        `gitExec` timeout for auto-init only.
  - [ ] DEVLOG entry summarizing the slice and the D6 default decision.
  - [ ] Success criteria: both files updated. Commit:
        `docs: add README strategy section, CHANGELOG and DEVLOG for slice 925`.

- [ ] **Task 32: Full validation and verification walkthrough** (effort: 2)
  - [ ] `pnpm -r build && pnpm -r test` green.
  - [ ] Run steps 1–4 of the design's "Verification Walkthrough" using
        `node packages/cli/dist/index.js` (the global `cf` is the published
        npm build, not this checkout). Record actual stderr/stdout lines in
        the DEVLOG entry.
  - [ ] Confirm the success-criteria greps: no `'submodule'` default
        literal outside `ConfigKeys`; no `'manual'` outside the alias table
        and enum.
  - [ ] Clean up the throwaway `/tmp` projects (step 5 of the walkthrough).
  - [ ] Success criteria: all pass; final commit; PM reviews before merge
        to `main`. Version bump to 0.14.0 is a PM release-time decision.

---

## Review Resolution

Tasks review 20260909 (`925-review.tasks.guide-install-robustness.md`,
verdict CONCERNS, clears the `concerns` threshold). Resolved here, not in
the review:

- **F001 (concern):** Task 23 now requires one `cloned()` case each for
  `prompt_list` and `prompt_get`.
- **F002 (note):** Task 8 now requires a CLI-level test of the
  config-sourced `manual` deprecation warning.
- **F003 (note):** no action. Tasks 25–26 are one `--strategy` unit and
  Task 27 tests both help outputs together.
