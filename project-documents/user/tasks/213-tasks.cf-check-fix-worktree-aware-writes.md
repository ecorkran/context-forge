---
docType: tasks
slice: cf-check-fix-worktree-aware-writes
project: context-forge
lld: user/slices/213-slice.cf-check-fix-worktree-aware-writes.md
dependencies: [207, 926, 927]
projectState: main at c94cc74, v0.18.4 released. Slice 213 design reviewed (CONCERNS, all findings resolved in the design). No code written for this slice. `cf check --fix` still writes into every checkout with a fixable finding (927 D5). `fixAction` has no subject index, `FixLogEntry` has no worktree, and there is no multi-path commit helper.
dateCreated: 20261004
dateUpdated: 20261004
status: in_progress
---

## Context Summary

- Working on slice 213: make `cf check --fix` ownership-aware. Each fix is
  written once, in the checkout that owns the fix's subject. Writes into a
  checkout other than the invoking one are committed there, scoped to the
  written paths. Everything not written is reported under `deferred` with a
  reason.
- Design decisions D1–D7 (incl. D5a, D5b) are settled and PM-confirmed. Do
  not relitigate. Key points:
  - Ownership is per fix **subject** (an index), not per file (D1). The
    index is a structured field, never parsed from `location` or
    `description`.
  - Owner resolution order is fixed (D2). Unclaimed or `null` index → the
    view at primary `project.projectPath`. Overlap → `null` → deferred.
  - Non-invoking writes are committed, never pushed, no config switch (D4).
  - Readiness runs at plan time **and** again at apply time (D5).
  - Hooks run; every git call against another checkout is bounded by
    `FIX_GIT_TIMEOUT_MS`; a failed commit restores the paths (D5a).
  - Invoking checkout = realpath of git top level from cwd; unregistered
    in fix mode with 2+ checkouts is an explicit error (D5b). MCP uses the
    server's cwd.
- Prerequisites (all complete): 207 (per-worktree views), 926
  (`FindingWorktree` attribution), 927 (`runAttributed`,
  `mergeCheckResults`, `mergeFixResults`, per-view fix application).
- Delivers: `subjectIndex` on every fixable rule; `resolveFixOwner`;
  `checkoutReadiness`; `commitPathsIfChanged`; `resolveInvokingCheckout`;
  `planRoutedFixes` / `applyFixPlan`; CLI and MCP on that one path; README
  and CHANGELOG.
- Next planned slice: none scheduled.

Full rationale, API contracts, CLI output sample and walkthrough:
`user/slices/213-slice.cf-check-fix-worktree-aware-writes.md`. Tasks below
reference design sections by name rather than repeating them.

**Single-checkout invariant (SC 9).** Projects with zero or one worktree
must stay byte-identical to 0.18.4: `deferred: []`, `commits: []`, no
`worktree` on log entries, and no git commands run while fixing. Every
task that touches the fix path keeps this true.

**Never run `cf check --fix` in this repository.** It closes the 900
maintenance plan and architecture, which stay `in_progress` permanently.
All manual verification uses a throwaway repo (Task 26).

**Testing local changes:** use `node packages/cli/dist/index.js`, not the
global `cf` (that is the published npm build).

**Task review resolution** (`user/reviews/213-review.tasks.cf-check-fix-worktree-aware-writes.md`, CONCERNS, 20261004):
- F001, F007: routing is split into plan (Tasks 12–13, tested in 14) and apply (Tasks 15–16, tested in 17), each with a commit.
- F002: the `mergeFixResults` extension is now Task 11, ahead of its use.
- F003: `FIX_GIT_TIMEOUT_MS` lives in `git/checkoutReadiness.ts`.
- F004: apply is split into a write-and-commit task and a failure task. Written paths come from `fixLog[].filePath`, `fixed` is adjusted on `COMMIT_FAILED`, and the restore is a named helper, `restorePathsToHead` (Task 7). `DeferredFix.detail` was added to the design's API Contracts.
- F005: `auto_fix` tests were added to Tasks 19 and 23.
- F006: Task 21 asserts the grouped text and that every reason has a label.

**Task re-review resolution** (same review file, re-run at b6d95ab, CONCERNS):
- F001: Task 17 case 7 covers commit-and-restore failure → `fixErrors`.
- F002: CLI split into routing (18) → tests (19) → grouped output (20) → tests (21), each pair committed.
- F003: `ReadinessResult` (Task 9), `AttributedCheckResult` and `FixPlan` (Task 13) are spelled out; the design's API Contracts match.
- F004: commit added after Task 8.
- F005: Task 1 says not to commit until Task 2's build is green.
- F006: `restorePathsToHead` added to the design's component list; Task 26 commits as `docs:`.

## Branch Setup

- [x] **Task 0: Create slice branch**
  - [x] Run `cf config get git.integration_branch`; the target is its value, or `main` if empty
  - [x] `git checkout -b 213-slice.cf-check-fix-worktree-aware-writes {target}`
  - [x] Success: on the new branch, `git status` clean

## Part 1 — Types and Subject Index

- [x] **Task 1: Add the new types** (effort 2)
  - [x] In `packages/core/src/introspection/types.ts`, add `subjectIndex: number | null` to `fixAction` as a **required** key (design: API Contracts)
  - [x] Add optional `worktree?: FindingWorktree` to `FixLogEntry`
  - [x] Add the `DeferReason` const object with the seven values from D6 / API Contracts, plus a `DeferReasonValue` type derived from it
  - [x] Add `DeferredFix { finding; reason; owner?; detail? }`. `detail?: string` carries git's error text for `COMMIT_FAILED` (D5a)
  - [x] Add `CheckoutCommit { worktree?; checkoutPath; sha; files }`
  - [x] Add `deferred: DeferredFix[]` and `commits: CheckoutCommit[]` to `ConsistencyFixResult`
  - [x] Export all new names from `packages/core/src/introspection/index.ts` and the core package root, following how existing introspection types are exported
  - [x] Every existing place that constructs a `ConsistencyFixResult` (start with `ConsistencyChecker.applyFixes` and `mergeFixResults`) returns `deferred: []` and `commits: []`
  - [x] Success: `pnpm --filter @context-forge/core build` fails **only** on `fixAction` literals missing `subjectIndex` (that is Task 2's work). Record the list of failing sites; it is the checklist for Task 2
  - [x] Do not commit between Task 1 and Task 2; the first commit is at Task 3 with the build green

- [x] **Task 2: Set `subjectIndex` in every fixable rule** (effort 3)
  - [x] Each rule below sets `subjectIndex` from a numeric value already available in the rule's scope (a parsed index field, not a regex over a label). If a rule has no numeric index in scope, STOP and ask the PM; do not parse it from `location` or `description`
  - [x] Subject per rule is the D1 table. Work through them one at a time:
    1. `task-vs-plan` (both fix sites): slice index of the plan entry
    2. `plan-vs-frontmatter` (both fix sites): slice index of the plan entry
    3. `frontmatter-vs-computed` (all fix sites): slice index
    4. `task-file-status` (both fix sites): slice index
    5. `plan-status-vs-entries` (both fix sites): slice plan index
    6. `arch-status-vs-plans` (both fix sites): architecture index
    7. `initiative-entry-vs-arch` (all fix sites): architecture / initiative index
    8. `initiative-plan-status-vs-entries` (both fix sites): initiative index
    9. Frontmatter-schema findings (the `sf.fixAction` mapping near the end of `ConsistencyChecker.ts`): the document's own leading filename index, or `null` when the filename has none
  - [x] Non-fixable rules (`missing-artifact`, `review-gate`, `duplicate-index`, `stale-worktree-path`, `personal-config-in-shared-file`) are unchanged
  - [x] Do not change `applyFixes`' signature or behavior
  - [x] Success: core build and typecheck pass; existing core tests pass unchanged

- [x] **Task 3: Test subject index coverage** (effort 2)
  - [x] Add a test in `packages/core/tests/introspection/` that runs `checkAll` over a fixture producing at least one fixable finding from **each** fixable rule in Task 2, and asserts every finding with `fixable: true` has a `fixAction.subjectIndex` key (`number` or `null`, never `undefined`)
  - [x] Reuse fixtures from `ConsistencyChecker.test.ts` / `tests/helpers/testData.ts` where they already produce these findings; add only what is missing
  - [x] Add one assertion per rule that `subjectIndex` equals the expected index for that fixture (e.g. a `task-vs-plan` finding for slice 120 has `subjectIndex === 120`)
  - [x] Add one frontmatter-schema case with an unindexed filename → `subjectIndex === null`
  - [x] Success: new tests pass; full core suite passes
  - [x] Commit: `feat(core): add subjectIndex to fix actions and fix result types`

## Part 2 — Owner Resolution

- [ ] **Task 4: Implement `resolveFixOwner`** (effort 2)
  - [ ] Create `packages/core/src/introspection/fixOwnership.ts` exporting `resolveFixOwner(project, subjectIndex, views)` per D2 and API Contracts
  - [ ] Pure function: no fs, no git. Implement the four D2 rules in order, using `isInIndexRange` from `utils/worktree-overlay.ts`
  - [ ] "Primary view" = the view whose root equals `project.projectPath`. Compare the same way `buildAttributedViews` builds view roots; read that code before writing the comparison
  - [ ] `rangeOverride` is ignored (D2)
  - [ ] The "owner lacks the target file" rule is **not** here; it lives in `planRoutedFixes` (Task 13)
  - [ ] Export from the introspection index
  - [ ] Success: core build passes

- [ ] **Task 5: Test `resolveFixOwner`** (effort 1)
  - [ ] Add `packages/core/tests/introspection/fixOwnership.test.ts` with the six cases from Technical Requirements: single checkout; one claimant; unclaimed → primary; `null` index → primary; overlapping ranges → `null`; no primary view → `null`
  - [ ] Add one case confirming `rangeOverride` on a worktree does not make it the owner of an out-of-range index
  - [ ] Success: tests pass
  - [ ] Commit: `feat(core): add resolveFixOwner for worktree fix ownership`

## Part 3 — Git Helpers

- [ ] **Task 6: Add a temporary git worktree test fixture** (effort 2)
  - [ ] Add a helper under `packages/core/tests/helpers/` (e.g. `gitWorktreeFixture.ts`) that creates, inside `realpathSync(mkdtempSync(...))`:
    - a primary repo with an initial commit and a configured local `user.name` / `user.email`
    - N linked worktrees via `git worktree add -b <name>`
    - a `cleanup()` that removes the temp root
  - [ ] Helpers for: writing and committing a file in a checkout; reading `git status --porcelain`; reading `git log -1 --format=%s`; starting an unresolved conflicting merge; detaching HEAD; installing a rejecting `pre-commit` hook in a checkout
  - [ ] Use real `git` via `execFileSync`. Do not mock `child_process` (existing `gitExec.test.ts` mocks it; these tests must not share that file)
  - [ ] Follow the temp-dir pattern in `packages/cli/tests/commands/check-worktree-fix.test.ts` (realpath of mkdtemp)
  - [ ] Success: a trivial smoke test creating two worktrees and cleaning up passes

- [ ] **Task 7: Implement `commitPathsIfChanged`** (effort 2)
  - [ ] In `packages/core/src/guides/gitExec.ts`, add `commitPathsIfChanged(repoPath, relPaths, message, opts?)` per D5a: returns the new sha, or `null` when nothing under `relPaths` changed; throws on any git failure, including not-a-repo
  - [ ] Stage only `relPaths` and commit with `git commit -m <message> -- <paths>` so other staged changes stay staged and out of the commit (D4). No `--no-verify`
  - [ ] Pass `opts` (incl. `timeoutMs`) through to every `gitExec` call
  - [ ] Rewrite `commitPathIfChanged` as: its existing `isGitRepo` check returning `false`, then delegate to `commitPathsIfChanged` with a one-element array and return `sha !== null`. Its boolean contract and existing callers (`TarballStrategy`) are unchanged
  - [ ] In the same file, add `restorePathsToHead(repoPath, relPaths, opts?)`: runs `git restore --source=HEAD --staged --worktree -- <paths>`, passes `opts` through, throws on failure. This is the only place that restore command lives (used by Task 16)
  - [ ] Export both from wherever `commitPathIfChanged` is exported
  - [ ] Success: core build passes; existing `gitExec.test.ts` and guide-update tests pass unchanged

- [ ] **Task 8: Test `commitPathsIfChanged` and `restorePathsToHead`** (effort 2)
  - [ ] New file `packages/core/tests/guides/commitPaths.test.ts`, using the Task 6 fixture (real git)
  - [ ] `commitPathsIfChanged` cases: two changed paths → one commit containing exactly those paths, sha returned; no changes → `null`, no commit; an unrelated file staged beforehand stays staged and is not in the commit; not a repo → throws; rejecting `pre-commit` hook → throws
  - [ ] `restorePathsToHead` cases: a modified and staged path is back to HEAD content and unstaged afterwards; an unrelated modified file is untouched
  - [ ] Success: tests pass; full core suite passes
  - [ ] Commit: `feat(core): add commitPathsIfChanged and restorePathsToHead`

- [ ] **Task 9: Implement `checkoutReadiness` and `FIX_GIT_TIMEOUT_MS`** (effort 2)
  - [ ] Define and export `FIX_GIT_TIMEOUT_MS = 60_000` in `packages/core/src/git/checkoutReadiness.ts` (the `git/` layer, so `introspection/` imports from `git/`, never the reverse). All later git calls against a non-invoking checkout reference this constant
  - [ ] Create `packages/core/src/git/checkoutReadiness.ts` exporting `checkoutReadiness(checkoutPath, relPaths, opts?)` returning `ReadinessResult { blocked: DeferReasonValue | null; dirtyPaths: string[] }`. `blocked` is one of `NOT_A_CHECKOUT`, `DETACHED_HEAD`, `CHECKOUT_BUSY`, or `null` when the checkout is usable; `dirtyPaths` is the subset of `relPaths` that are modified (always `[]` when `blocked` is set). Export the type. `opts` (a `GitExecOptions`, for `timeoutMs`) is an addition to the design's signature
  - [ ] Detection exactly per the D5 table:
    1. path missing, or realpath of `git rev-parse --show-toplevel` ≠ realpath of `checkoutPath` → `NOT_A_CHECKOUT`
    2. `git symbolic-ref -q HEAD` fails → `DETACHED_HEAD`
    3. any of `MERGE_HEAD`, `rebase-merge`, `rebase-apply`, `CHERRY_PICK_HEAD` exists at `git rev-parse --git-path <name>` → `CHECKOUT_BUSY`
    4. `git status --porcelain -- <path>` non-empty → that path is `FILE_DIRTY`
  - [ ] Reasons use the `DeferReason` constants, not string literals
  - [ ] Every `gitExec` call passes `opts.timeoutMs`
  - [ ] Export from `packages/core/src/git/index.ts`
  - [ ] Success: core build passes

- [ ] **Task 10: Test `checkoutReadiness`** (effort 2)
  - [ ] New file `packages/core/tests/git/checkoutReadiness.test.ts`, Task 6 fixture
  - [ ] Cases: clean worktree → ready, no dirty paths; missing directory → `NOT_A_CHECKOUT`; a subdirectory of a checkout passed as `checkoutPath` → `NOT_A_CHECKOUT`; detached HEAD → `DETACHED_HEAD`; unresolved merge → `CHECKOUT_BUSY`; one of two target paths modified → only that path reported dirty
  - [ ] Success: tests pass
  - [ ] Commit: `feat(core): add checkoutReadiness git helper`

## Part 4 — Routed Planning and Application

- [ ] **Task 11: Extend `mergeFixResults`** (effort 1)
  - [ ] In `packages/core/src/introspection/mergeCheckResults.ts`, `mergeFixResults` concatenates `deferred` and `commits` from every input alongside its existing fields
  - [ ] Preserve existing merge behavior for `fixed`, `fixLog`, `fixErrors`
  - [ ] Update `packages/core/tests/introspection/mergeCheckResults.test.ts`: add a case merging two results that each carry `deferred` and `commits`; existing cases still pass with empty arrays
  - [ ] Success: core build and tests pass

- [ ] **Task 12: Implement `resolveInvokingCheckout`** (effort 1)
  - [ ] Create `packages/core/src/introspection/routedFixes.ts` and add `resolveInvokingCheckout(views, cwd?)` per D5b. `cwd` defaults to `process.cwd()`; the parameter exists so tests and MCP can pass it explicitly
  - [ ] Realpath of `git rev-parse --show-toplevel` from `cwd`, compared exactly with the realpath of each view root
  - [ ] No match → throw an `Error` whose message says the checkout is not a registered worktree and to run `cf worktree init` or run from a registered checkout. Also throw if `cwd` is not inside a git checkout
  - [ ] Callers only invoke this in fix mode with 2+ views (Tasks 18, 22); the function itself does not check view count
  - [ ] Success: core build passes

- [ ] **Task 13: Implement `planRoutedFixes`** (effort 3)
  - [ ] In `routedFixes.ts`, export these types (they are the shapes Tasks 14–23 build against):
    - `AttributedCheckResult { view: AttributedView; result: ConsistencyCheckResult }`. This is new: `runAttributed` returns plain results in view order, so callers zip `views` with its output
    - `FixPlanEntry { view: AttributedView; result: ConsistencyCheckResult; commit: boolean }`. `result.findings` holds only the kept fixable findings, so it can go straight to `checker.applyFixes`
    - `FixPlan { entries: FixPlanEntry[]; deferred: DeferredFix[] }`
  - [ ] Export `planRoutedFixes(project, viewResults: AttributedCheckResult[], invokingPath)` per Data Flow and API Contracts
  - [ ] Single checkout (one view): return the plan with every fixable finding kept in that view, `deferred: []`, and make **no** git calls (SC 9)
  - [ ] Otherwise, for each fixable finding in each view:
    1. `resolveFixOwner(project, finding.fixAction.subjectIndex, views)`
    2. `null` → defer `OWNER_UNRESOLVED`
    3. owner is this view → keep
    4. owner is another view **and** the owner's checkout has a file at the fix's path relative to its root → defer `NOT_OWNER` with `owner` set (D3)
    5. owner is another view and the owner's checkout lacks the file → keep in this view (D2, "owner lacks the target file")
  - [ ] For each non-invoking view with kept fixes, call `checkoutReadiness` with the kept fixes' relative paths and `timeoutMs: FIX_GIT_TIMEOUT_MS`. A checkout-wide block defers all its fixes with that reason; dirty paths defer just those fixes as `FILE_DIRTY`
  - [ ] `commit` is `true` only for non-invoking views
  - [ ] Deferred entries carry the finding's `worktree` attribution so CLI output can group them
  - [ ] Success: core build passes

- [ ] **Task 14: Test `resolveInvokingCheckout` and `planRoutedFixes`** (effort 3)
  - [ ] New file `packages/core/tests/introspection/routedFixes.test.ts`. Build a shared setup on the Task 6 fixture: real `project-documents/` content (a slice plan with entries in two ranges, matching slice designs and task files), a `ProjectData` with two worktrees and ranges, and views built through `buildAttributedViews`. Task 17 reuses this setup
  - [ ] `resolveInvokingCheckout`: primary root → primary view; worktree subdirectory → that worktree's view; unregistered directory → throws with the D5b message
  - [ ] `planRoutedFixes` cases (plan only, nothing written):
    1. fix owned by the non-invoking worktree → kept in its view, `commit: true`
    2. same subject flagged in the non-owner view → `NOT_OWNER` with `owner` set
    3. overlapping ranges → `OWNER_UNRESOLVED`
    4. owner lacks the file → kept in the view that reported it
    5. dirty target → `FILE_DIRTY`; unresolved merge → all `CHECKOUT_BUSY`; detached HEAD → `DETACHED_HEAD`; missing worktree path → `NOT_A_CHECKOUT`
  - [ ] Single checkout: everything kept, `deferred` is `[]`, no git process ran (spy on `gitExec` or `child_process.execFile` for this case only)
  - [ ] Success: tests pass
  - [ ] Commit: `feat(core): add invoking-checkout resolution and routed fix planning`

- [ ] **Task 15: Implement `applyFixPlan` — write and commit** (effort 3)
  - [ ] In `routedFixes.ts`, export `applyFixPlan(checker, plan, dateStamp?)` per Data Flow and D5a
  - [ ] Compute one `dateStamp` (same format `applyFixes` uses today) if not passed, and use it for every view
  - [ ] For each non-invoking plan entry: re-run `checkoutReadiness` before writing. Newly failing fixes move to `deferred` with the same reasons as Task 13
  - [ ] Call `checker.applyFixes` per view with that view's remaining findings. With 2+ views, tag every resulting `fixLog` entry with the view's `worktree`
  - [ ] Written paths for a view = the unique `fixLog[].filePath` values from that view's `applyFixes` result, made relative to the view's checkout root
  - [ ] For each non-invoking view with written paths: `commitPathsIfChanged(checkout, writtenRelPaths, FIX_COMMIT_MESSAGE, { timeoutMs: FIX_GIT_TIMEOUT_MS })`. Define `FIX_COMMIT_MESSAGE` once, in `routedFixes.ts`, with the exact text in D4. Record a `CheckoutCommit` when a sha is returned
  - [ ] Invoking view writes are never committed
  - [ ] Combine per-view results through `mergeFixResults` (Task 11)
  - [ ] Single checkout: no readiness, no commit, no git calls
  - [ ] Success: core build passes

- [ ] **Task 16: Implement `applyFixPlan` — commit failure handling** (effort 2)
  - [ ] Wrap the Task 15 commit call. On a throw (hook rejection, timeout, `index.lock`), call `restorePathsToHead(checkout, writtenRelPaths, { timeoutMs: FIX_GIT_TIMEOUT_MS })` (Task 7)
  - [ ] After a successful restore: remove that view's log entries for the restored paths, subtract the same number from that view's `fixed` so `fixed` and `fixLog` agree, and defer each of those findings as `COMMIT_FAILED` with git's error text in `detail`
  - [ ] If the restore also throws: leave the log entries in place, and add one `fixErrors` entry naming the checkout and the files left written but uncommitted (the only path from git to `fixErrors`)
  - [ ] Log the caught error per the project's exception rules before converting it to a deferral or `fixErrors` entry
  - [ ] Success: core build passes

- [ ] **Task 17: Test `applyFixPlan`** (effort 3)
  - [ ] In `routedFixes.test.ts`, using the Task 14 setup:
    1. owner commit: fix owned by the non-invoking worktree is written and committed there with `FIX_COMMIT_MESSAGE`; that checkout's `git status --porcelain` is empty; `commits[0].files` lists exactly the written paths
    2. staged unrelated file in the target checkout is still staged and absent from the fix commit
    3. invoking checkout writes stay uncommitted (file modified, no new commit)
    4. state change between plan and apply (dirty the target after `planRoutedFixes`, before `applyFixPlan`) → deferred `FILE_DIRTY`, not written
    5. rejecting `pre-commit` hook → paths back at HEAD, `COMMIT_FAILED` with `detail`, `fixed` equals `fixLog.length`, `fixErrors` empty
    6. owner-lacks-file fix written in each reporting view produces identical bytes (shared `dateStamp`)
    7. commit fails **and** restore fails → the `fixLog` entries stay, and exactly one `fixErrors` entry names the checkout and the files left uncommitted. Use a mechanism that really makes the restore fail and assert that it failed for that reason. Mocking `restorePathsToHead` to throw (`vi.mock` of the gitExec module, this case only) is acceptable
  - [ ] Single checkout: `deferred` and `commits` are `[]`, no log entry has `worktree`, no git process ran
  - [ ] Success: tests pass; full core suite passes
  - [ ] Commit: `feat(core): add routed fix application with scoped commits`

## Part 5 — CLI

- [ ] **Task 18: Route CLI `cf check --fix` through plan and apply** (effort 3)
  - [ ] In `packages/cli/src/commands/check.ts`, replace both fix paths (single-slice `fix` per view, all-slices `applyFixes` per view) with: dry run via `runAttributed` → `planRoutedFixes` → preview/prompt → `applyFixPlan`
  - [ ] With 2+ views in fix mode, call `resolveInvokingCheckout(views)` first; on error print the message and exit non-zero with nothing written (SC 12). Read-only `cf check` and single-checkout projects skip this
  - [ ] The `workflow.auto_fix` path uses the same plan and apply, skipping preview and prompt (SC 11)
  - [ ] The all-slices preview prints the routed plan (fixes per checkout, deferrals) before anything is written; `--yes` skips the prompt (SC 10). A plain list is fine here; Task 20 adds the final grouped format
  - [ ] JSON output includes `fixLog[].worktree`, `deferred[]`, `commits[]`
  - [ ] Single-checkout text and JSON output stay identical to 0.18.4 except for the added empty `deferred` / `commits` JSON fields
  - [ ] Success: CLI build passes

- [ ] **Task 19: Rewrite `check-worktree-fix.test.ts` to the 213 routing contract** (effort 3)
  - [ ] The fixture in `packages/cli/tests/commands/check-worktree-fix.test.ts` must become real git checkouts (primary + `git worktree add`), since commits now happen. Reuse the core Task 6 helper if importable from the CLI tests; otherwise copy only the minimum needed
  - [ ] Replace the 927 assertion (both checkouts rewritten, `fixed === 2`) with: written once in the owner's checkout, the other copy listed in `deferred` as `NOT_OWNER`, `fixed === 1`
  - [ ] Add: a non-invoking owner write produces one commit with the defined message and a clean `git status` there (SC 3, 4)
  - [ ] Add: running from an unregistered directory with `--fix` exits with the D5b error and writes nothing (SC 12)
  - [ ] Add: the all-slices preview lists the routed plan before the prompt
  - [ ] Add: with `workflow.auto_fix = true`, a plain `cf check` (no `--fix`, no `--yes`) routes the same way, does not prompt, and commits the owner write in the non-invoking checkout (SC 11)
  - [ ] Add: single-checkout `--fix --json` has `deferred: []`, `commits: []`, no `worktree` on log entries
  - [ ] Success: CLI test suite passes
  - [ ] Commit: `feat(cli): route cf check --fix through worktree-aware plan and apply`

- [ ] **Task 20: CLI grouped text output and deferral labels** (effort 2)
  - [ ] Add one display map keyed by `DeferReason` values (D6), e.g. `NOT_OWNER` → "stale copy; owned by {owner}", `FILE_DIRTY` → "file has uncommitted edits". All seven reasons have an entry; no reason string is written anywhere else in the CLI. Export the map so Task 21 can test it
  - [ ] Multi-checkout output (the result and the all-slices preview) groups fixes and deferrals by checkout as in the design's "CLI text output" sample: invoking group marked "(invoking checkout, uncommitted)", committed groups show the short sha and checkout path, then a "Left alone" section
  - [ ] `fixErrors` from a failed restore are printed with checkout and file names
  - [ ] Grouping and `[worktree]` prefixes appear only with 2+ worktrees
  - [ ] Success: CLI build passes; Task 19 tests still pass

- [ ] **Task 21: Test CLI grouped output** (effort 1)
  - [ ] In `check-worktree-fix.test.ts`: a run with one invoking write, one committed write and one deferral prints "invoking checkout, uncommitted", "committed <short sha>", and "Left alone" in their groups
  - [ ] Every `DeferReason` value has an entry in the Task 20 label map
  - [ ] Single-checkout text output has no group headers or `[worktree]` prefixes
  - [ ] Success: CLI test suite passes
  - [ ] Commit: `feat(cli): group cf check --fix output by checkout`

## Part 6 — MCP

- [ ] **Task 22: Route MCP `workflow_check` through plan and apply** (effort 2)
  - [ ] In `packages/mcp-server/src/tools/workflowTools.ts`, replace `fix` / `fixAll` per view with: `checkAll` (or `check` for single-slice) per view via `runAttributed` → `planRoutedFixes` → `applyFixPlan`. No prompt
  - [ ] The invoking checkout comes from `resolveInvokingCheckout(views)` using the server's working directory, no longer `project.projectPath` (D5b). Only in fix mode with 2+ views; on error return a tool error, nothing written
  - [ ] The `workflow.auto_fix` branch uses the same path
  - [ ] Tool input schema unchanged; response gains `deferred`, `commits`, and `fixLog[].worktree`
  - [ ] Remove the now-unused `fixAll` call; do not delete `ConsistencyChecker.fixAll` itself unless nothing else references it (grep first)
  - [ ] Success: MCP build passes

- [ ] **Task 23: Test MCP routing** (effort 2)
  - [ ] Update `packages/mcp-server/tests/workflowTools.test.ts`: `workflow_check { fix: true }` against a two-checkout git fixture yields the same routed result as the CLI owner-commit case (design walkthrough step 9)
  - [ ] Add: server cwd in an unregistered directory with `fix: true` → tool error, no writes
  - [ ] Add: with `workflow.auto_fix = true` and no `fix` argument, the same routed result and commit (SC 11)
  - [ ] Existing single-checkout tests pass with only the additive empty arrays
  - [ ] Success: MCP test suite passes
  - [ ] Commit: `feat(mcp): route workflow_check fixes through worktree-aware plan and apply`

## Part 7 — Docs and Verification

- [ ] **Task 24: README and CHANGELOG** (effort 1)
  - [ ] README `cf check --fix` section: fixes are written only in the owning checkout; writes into other checkouts are committed there with the fixed message, never pushed; stale copies and unsafe checkouts are left alone and listed; unregistered worktree in fix mode is an error
  - [ ] README note under `workflow.auto_fix`: with worktrees, a plain `cf check` can commit into other checkouts (Special Considerations)
  - [ ] CHANGELOG `[Unreleased]` → Changed: the routing behavior and the smaller `fixed`/`fixLog` with 2+ worktrees (D7 observable changes); Added: `deferred`, `commits`, `fixLog[].worktree` in JSON / MCP output
  - [ ] Success: docs describe behavior matching the code
  - [ ] Commit: `docs: describe worktree-aware cf check --fix in README and CHANGELOG`

- [ ] **Task 25: Full build and test pass** (effort 1)
  - [ ] `pnpm -r build`, typecheck, lint, and `pnpm -r test` all clean
  - [ ] Fix any failure at its cause; do not skip or weaken tests
  - [ ] Success: all commands exit 0

- [ ] **Task 26: Verification walkthrough against the local build** (effort 2)
  - [ ] Follow the design's "Verification Walkthrough" steps 1–8 in a `mktemp -d` scratch repo using `node <repo>/packages/cli/dist/index.js`. Never in this repository
  - [ ] Record the outcome of each step (pass, or the actual output on failure) in the slice design's walkthrough section or a short note in this task
  - [ ] Any failure: get the actual error text, fix at the cause, re-run Task 25, then repeat the failing step
  - [ ] Delete the scratch directory when done
  - [ ] Success: steps 1–8 behave as the design states
  - [ ] Commit recorded results on the slice branch: `docs: record 213 verification walkthrough results` (code fixes found here get their own `fix:` commit)
