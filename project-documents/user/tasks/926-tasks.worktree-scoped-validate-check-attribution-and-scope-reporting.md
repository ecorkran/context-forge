---
docType: tasks
slice: worktree-scoped-validate-check-attribution-and-scope-reporting
project: context-forge
lld: user/slices/926-slice.worktree-scoped-validate-check-attribution-and-scope-reporting.md
dependencies: []
projectState: main is green, working tree clean at 15de0a1. v0.16.0 is tagged and published (all four packages; tarball is now the default guide strategy). Slice 926 design is approved with a PASS slice review (no concerns; the single NOTE is self-resolving — the parent architecture states no NFRs). No code has been written for this slice. `resolveExplicitPaths` in packages/core/src/schema/frontmatterFileValidator.ts still drops paths through three unrecorded `continue` branches; validate.ts:89 still discards `worktreeId`; `mergeCheckResults` is still duplicated verbatim in CLI and MCP; `arch.ts:80` and `arch.ts:173` still range-filter initiative indices.
dateCreated: 20260922
dateUpdated: 20260922
status: in_progress
---

## Context Summary

- Working on slice 926: fix GitHub #88, #92, #96 (`cf validate frontmatter`
  reports a clean pass when it examined nothing), #87 (`cf check` blames the
  wrong checkout for a finding), and #97 (`cf list arch` reports no
  initiatives against a populated plan).
- Design decisions D1–D8 in the slice design are settled — do not
  relitigate during implementation. Notably: generalize the existing
  `findProjectByCwd` matcher rather than write a new one (D1); the shared
  resolver goes in core, not CLI (D2); **all JSON changes are additive
  only** (D3); per-path outcomes carry a reason, not just a count (D4);
  attribution is a structured field, never a description prefix (D5a);
  `cf check`'s top-level `projectPath` keeps its current meaning (D6);
  initiatives are not range-filtered at all (D7).
- Prerequisites: none. Worktree registration, detection, and overlay all
  ship today (`resolveProjectWorktree`, `findProjectByCwd`,
  `applyWorktreeOverlay`, `resolveOperationPath`).
- Delivers: `resolveWorktreeForPath()` in core; worktree-correct roots for
  `cf validate frontmatter`; a per-path outcome report replacing silent
  skipping; worktree attribution on `cf check` findings (CLI + MCP); the
  `cf list arch` initiative-filter removal.
- **Two riders added after the design and its PASS review**, both at PM
  direction on 20260922, both unrelated to the worktree surface and
  sharing no code with Parts 1–5 or with each other. The design and its
  review predate both and do not cover them:
  - **Part 6 — GitHub #98** (dual managed-marker recognition). Bundled
    because ai-project-guide#22 is implemented and waiting on it.
  - **Part 7 — `rules.exclude` config key.** Counterpart to
    ai-project-guide#23. One registry entry; cf stores and validates the
    key, the guide's `setup-ide` script acts on it.
  Each is independently implementable, committable, and mergeable at any
  point in the sequence.
- Next planned slice: none scheduled; the 900 initiative returns to
  complete when this slice merges.

Full rationale lives in
`user/slices/926-slice.worktree-scoped-validate-check-attribution-and-scope-reporting.md`.

**External consumer — read before changing any output.** squadron's
pre-commit `frontmatter_gate.py` and `tests/documents/test_schema_drift.py`
parse `cf validate frontmatter --json` today. Every change here is
additive: the five existing fields (`filesChecked`, `totalFindings`,
`errors`, `warnings`, `findings`) keep their exact current meaning and
type. An unmodified squadron must keep working. No coordinated squadron
release is part of this slice.

**Implementation order rationale:** the shared resolver first, because it
is a pure refactor that establishes the canonical matching rule in one
place. Note (tasks review F003) that it is consumed only by the
`findProjectByCwd` refactor in Task 3 — Task 4 (#88) uses the existing
`resolveOperationPath`, and Task 13 (#87) uses the existing per-worktree
view building. Part 1 is not a prerequisite for those fixes; it is
deduplication that stands on its own. Then #88 (the smallest
change and the highest-severity defect); then outcome reporting, which
reshapes the validator result; then the merge extraction before
attribution, so the attribution change lands in one place rather than two.
#97 is independent of everything else and can move anywhere in the
sequence.

**Existing test locations:** core schema tests in
`packages/core/tests/schema/`, core utils in `packages/core/tests/utils/`,
CLI commands in `packages/cli/tests/commands/`, MCP in
`packages/mcp-server/tests/`. Real-git temp-repo patterns exist in
`packages/core/tests/guides/strategies/`.

**Commands:** `pnpm -r build`, `pnpm -r test`, `pnpm -r typecheck`. Test a
local build with `node packages/cli/dist/index.js <args>` — the global `cf`
is a separately published npm install, not this working tree.

---

## Tasks

### Part 1 — Shared path→worktree resolver (D1, D2)

- [x] **Task 1: Add `resolveWorktreeForPath()` to core** (effort: 2)
  - [x] Add the function to `packages/core/src/utils/worktree-overlay.ts`
        (or a sibling module in the same directory). Signature takes a
        project and an absolute path; returns the owning worktree's
        identity (id, name, root path) or null when nothing matches.
  - [x] Port the matching rule from `findProjectByCwd`
        (`packages/cli/src/utils/project.ts:65-77`) exactly: candidates are
        the project's `projectPath` plus every worktree's `worktreePath`;
        a candidate matches when the path equals it or starts with it plus
        a separator; longest path wins; on a tie prefer the worktree over
        the project root. Handle a trailing slash on stored paths, as the
        existing code does.
  - [x] A worktree with no `worktreePath` is skipped (it cannot own a
        path). Do not invent a fallback.
  - [x] Export from `packages/core/src/index.ts`.
  - [x] Do not change `findProjectByCwd` yet — that is Task 3.
  - [x] Success criteria: `pnpm --filter @context-forge/core typecheck`
        passes; the function is importable from `@context-forge/core`.

- [x] **Task 2: Tests for `resolveWorktreeForPath()`** (effort: 2)
  - [x] Add `packages/core/tests/utils/` coverage for: path inside a
        registered worktree; path inside the project root but no worktree;
        path outside everything (null); nested worktree paths where the
        longest must win; the equal-length tie preferring the worktree;
        a worktree with `worktreePath` undefined; a stored path with a
        trailing slash.
  - [x] Include a case proving a path that merely shares a string prefix
        with a root but is not inside it does **not** match (e.g. a sibling
        directory whose name extends the root's name).
  - [x] Success criteria: `pnpm --filter @context-forge/core test` passes.

- [x] **Task 3: Refactor `findProjectByCwd` to delegate** (effort: 2)
  - [x] Change `findProjectByCwd` (`packages/cli/src/utils/project.ts:38`)
        to call `resolveWorktreeForPath` with `process.cwd()` instead of
        carrying its own candidate-building and sorting. Its external
        signature and return type (`CwdMatch`) must not change.
  - [x] Remove the now-duplicated matching logic. The rule must exist in
        exactly one place after this task.
  - [x] Success criteria: `pnpm -r test` passes with no changes to any
        existing test in `packages/cli/tests/utils/` — the refactor is
        behavior-preserving, so existing assertions are the proof.
  - [x] Commit checkpoint: the resolver plus its delegation, green build.

### Part 2 — #88: worktree-correct validate root

- [x] **Task 4: Apply `worktreeId` in `cf validate frontmatter`** (effort: 1)
  - [x] In `packages/cli/src/commands/validate.ts:89`, stop discarding
        `worktreeId` from `resolveProjectWorktree` — destructure it.
  - [x] Replace the `project.projectPath` argument at line 100 with the
        worktree-resolved operation path, using the existing
        `resolveOperationPath(project, worktreeId)` helper from
        `packages/cli/src/utils/worktree-overlay.ts` (the same helper
        `guides.ts` and `status.ts` already use). Keep the existing
        `projectPath` as the fallback when it returns nothing.
  - [x] Do not change `frontmatterFileValidator.ts` in this task — the
        validator keeps deriving `documentRoot` from the path it is given.
  - [x] Success criteria: from a registered sibling worktree,
        `node packages/cli/dist/index.js validate frontmatter --json <a
        file inside that worktree>` reports `filesChecked: 1`, where it
        reported `0` before.

- [x] **Task 5: Two-worktree integration test for #88** (effort: 3)
  - [x] Add a CLI test registering a project with **two** worktrees whose
        `worktreePath`s are real temporary directories containing real
        `project-documents/user/**` markdown fixtures.
  - [x] Assert: an explicit path inside the non-default worktree is
        checked (`filesChecked: 1`), and the no-paths full-walk form still
        walks that same worktree.
  - [x] Derive fixture paths from the registered worktree records, not
        from a constant the code under test also reads. A test that builds
        its expected root the same way the product does will pass against
        the unfixed code — that is exactly how this bug survived.
  - [x] Success criteria: the test fails against the pre-Task-4 code and
        passes after it. Verify both directions before moving on.
  - [x] Commit checkpoint: #88 fixed and pinned.

### Part 3 — #92/#96: per-path outcome reporting (D3, D4)

- [x] **Task 6: Define the outcome vocabulary** (effort: 1)
  - [x] In `packages/core/src/schema/frontmatterFileValidator.ts`, add an
        `as const` object with the five outcomes from the design's D4
        table: checked, skipped-out-of-scope, skipped-not-markdown,
        skipped-not-found, skipped-no-frontmatter. Derive the union type
        from it.
  - [x] Per the project rule against scattered comparison values, every
        later comparison references this object — no bare string literals
        at call sites.
  - [x] Export the constant and the type from `packages/core/src/index.ts`.
  - [x] Success criteria: typecheck passes; the literal strings appear in
        exactly one place in source.

- [x] **Task 7: Record per-path outcomes in the validator** (effort: 3)
  - [x] Change `resolveExplicitPaths`
        (`frontmatterFileValidator.ts:52-66`) to return, for each input
        path, the resolved absolute path plus its outcome — instead of
        silently dropping via the three `continue` branches. Map each
        branch to its outcome: non-`.md` → skipped-not-markdown;
        out-of-root → skipped-out-of-scope; nonexistent →
        skipped-not-found.
  - [x] In `validateFrontmatterFiles`, record the fourth skip: a file that
        reaches the loop but has no parseable frontmatter (line 94)
        becomes skipped-no-frontmatter, and still does not increment
        `filesChecked`.
  - [x] Extend `FrontmatterFileValidationResult` (lines 17-20) with the
        per-path list and the resolved document root. `findings` and
        `filesChecked` keep their current meaning exactly — `filesChecked`
        still counts only files whose frontmatter was parsed and
        validated.
  - [x] Preserve the relative-path base: explicit relative paths resolve
        against `process.cwd()` as they do today (line 58), which is not
        necessarily the document root.
  - [x] The full-walk (no-paths) form produces no per-path list — there
        are no caller-supplied paths to report on. Do not synthesize one
        from the ~500 discovered documents.
  - [x] Success criteria: `pnpm --filter @context-forge/core typecheck`
        passes; no call site outside this file needs changing yet.

- [x] **Task 8: Tests for outcome recording** (effort: 2)
  - [x] Extend `packages/core/tests/schema/frontmatterFileValidator.test.ts`
        with one case per outcome value, asserting both the outcome and
        that `filesChecked` counts only `checked` entries.
  - [x] Add a case mixing in-scope and out-of-scope paths in one call,
        asserting the in-scope file is still validated (this is the
        pairing behavior #92 observed but could not confirm).
  - [x] Add a regression case pinning that a default-checkout call with
        in-scope paths returns the same `filesChecked` and `findings` as
        before the slice.
  - [x] Success criteria: `pnpm --filter @context-forge/core test` passes.

- [x] **Task 9: Surface outcomes in validate's JSON (D3, D5)** (effort: 2)
  - [x] Replace the inline `Record<string, unknown>` at
        `packages/cli/src/commands/validate.ts:137-148` with a declared,
        exported interface. The untyped shape is how this output drifted
        from its documentation in the first place.
  - [x] Keep all five existing fields byte-identical in name, type, and
        meaning. Add the per-path list, a derived skipped count, and the
        resolved `documentRoot` (D5 — validate currently emits no path at
        all, so a caller cannot tell which checkout was scanned).
  - [x] Emit the per-path list only for explicit-path invocations; omit it
        or leave it empty for the full walk.
  - [x] Leave the human-readable output path alone except where it would
        now be actively misleading; this task is about `--json`.
  - [x] Success criteria: `node packages/cli/dist/index.js validate
        frontmatter --json CHANGELOG.md` still reports `filesChecked: 0`
        and now reports that path as skipped-out-of-scope.

- [x] **Task 10: CLI tests for the JSON contract** (effort: 2)
  - [x] Extend `packages/cli/tests/commands/validate.test.ts`: assert the
        five legacy fields are unchanged for an in-scope invocation, and
        that the new fields appear as specified.
  - [x] Add the #96 acceptance case: a call whose paths are **all**
        out-of-scope is distinguishable, from JSON alone, from a call that
        checked nothing for an unknown reason. This is the property
        squadron's gate needs.
  - [x] **Automated single-checkout regression (tasks review F002).** Add
        a test that pins the *whole* `--json` object for a single-checkout
        project — not just the five legacy fields individually — so an
        accidental change to shape, ordering, or a field's meaning fails
        CI rather than waiting on Task 19's one-time manual diff. D3's
        additive-only guarantee is the primary defense for an external
        consumer, so it deserves an automated gate.
  - [ ] Do the same for `cf check`'s single-checkout output in Task 14's
        test file, where the two-worktree fixture already lives.
  - [x] Success criteria: `pnpm --filter @context-forge/cli test` passes;
        deliberately adding a stray field to either output fails the test.
  - [x] Commit checkpoint: #92/#96 fixed and pinned.

- [x] **Task 11: Correct the `--fix` and help text** (effort: 1)
  - [x] `validate.ts:169` help text advertises that out-of-root paths are
        "silently skipped" — this slice makes that false. Reword to say
        skipped paths are reported.
  - [x] Confirm `--fix` still only applies `fixAction`s already present on
        findings; skipped paths must never be fix targets.
  - [x] Success criteria: `node packages/cli/dist/index.js validate
        frontmatter --help` describes the actual behavior.

### Part 4 — #87: check attribution (D5a, D6)

- [ ] **Task 12: Extract `mergeCheckResults` to core** (effort: 2)
  - [ ] Move the function to core (alongside the consistency types in
        `packages/core/src/introspection/`). The CLI copy
        (`packages/cli/src/commands/check.ts:47-71`) and the MCP copy
        (`packages/mcp-server/src/tools/workflowTools.ts:26-52`) are
        verbatim duplicates; both already carry a TODO to extract it.
  - [ ] Switch both call sites to the core function and delete both local
        copies, including the now-satisfied TODO comments.
  - [ ] Pure move — no behavior change in this task. Attribution comes
        next, so it lands in one place instead of two.
  - [ ] Success criteria: `pnpm -r build` and `pnpm -r test` pass;
        the existing MCP merge tests
        (`packages/mcp-server/tests/workflowTools.test.ts:608-712`) pass
        unchanged, retargeted at the core function.
  - [ ] Commit checkpoint: extraction verified green before attribution.

- [ ] **Task 13: Carry worktree identity onto findings** (effort: 3)
  - [ ] Add an optional worktree field (name and path) to
        `ConsistencyFinding`
        (`packages/core/src/introspection/types.ts:232-245`). Optional, so
        single-checkout projects and existing producers are unaffected.
  - [ ] In `check.ts:221-223`, the per-worktree views are built from
        `wt.id` but discard it. Keep each view paired with its worktree so
        the findings it produces can be tagged **before** they reach the
        merge.
  - [ ] Attribution must be attached pre-merge. The dedup key
        (`rule|location|description`) has no worktree component, so
        deriving attribution after the merge would misattribute
        first-seen-wins duplicates.
  - [ ] Do **not** add worktree to the dedup key. Aggregate rules run per
        view and legitimately produce identical findings across views;
        the merge is supposed to collapse them. Adding worktree to the key
        would multiply project-level findings by worktree count.
  - [ ] Do not derive attribution from `location` — it is not always a
        filesystem path (`ConsistencyChecker.ts:461` emits a
        `slice plan entry N` string). It comes from the producing view.
  - [ ] Do not encode it in the description string (D5a), despite the
        existing `[917] `-prefix precedent at
        `ConsistencyChecker.ts:128-131`.
  - [ ] Leave the top-level `projectPath` as-is (D6) — it keeps meaning
        "the invoking checkout."
  - [ ] Success criteria: `cf check --json` from a two-worktree project
        carries per-finding worktree identity; `pnpm -r typecheck` passes.

- [ ] **Task 14: Tests for merge attribution** (effort: 3)
  - [ ] `packages/cli/tests/commands/check.test.ts` has **zero** worktree
        coverage today: its fixture project has no `worktrees`, so
        `mergeCheckResults` always returns at its `results.length === 1`
        early guard and the multi-view path is never exercised. Add a
        two-worktree fixture.
  - [ ] Assert: findings from each view carry that view's worktree; a
        finding arising identically in two worktrees still dedups to one
        entry (and the attribution is deterministic, not arbitrary);
        a single-worktree project produces findings with no attribution
        change from today.
  - [ ] Mirror the equivalent cases for the MCP `workflow_check` path so
        both consumers of the shared merge are covered.
  - [ ] Success criteria: `pnpm -r test` passes.

- [ ] **Task 15: Render the worktree label** (effort: 2)
  - [ ] `printCheckOutput` (`check.ts:273-310`) currently receives only
        `projectName` — worktree information never reaches the renderer.
        Pass what it needs.
  - [ ] Prefix each finding with its worktree name, per #87's suggestion,
        so a reader can tell at a glance which checkout a finding belongs
        to. Existing slice grouping stays as-is.
  - [ ] Suppress the label when the project has no registered worktrees,
        or only the implicit `default` — single-checkout users must see no
        change.
  - [ ] Success criteria: with two worktrees, `cf check` shows the
        owning worktree on each finding; with none, output is
        byte-identical to the pre-slice build.
  - [ ] Commit checkpoint: #87 fixed and pinned.

### Part 5 — #97: initiative filter removal (D7, D8)

- [ ] **Task 16: Stop range-filtering initiatives** (effort: 1)
  - [ ] Remove the `isInIndexRange` filter from `archListFromPlan`
        (`packages/cli/src/commands/arch.ts:80`) and from the
        `archListFromModel` fallback (`arch.ts:173`). An initiative plan
        is a project-level artifact; `indexRange` is a slice-index
        concept.
  - [ ] Change **only** these two call sites. The other six
        `isInIndexRange` call sites (`slice.ts`, `task.ts`, `plan.ts`,
        `future.ts`, `project.ts`, `WorkflowNavigator.ts`) filter genuinely
        slice-indexed things and are correct.
  - [ ] Drop the now-unused `indexRange` plumbing on this path only if it
        becomes dead; do not disturb `operationPath` resolution, which is
        already correct.
  - [ ] Success criteria: `cf list arch` and `cf list arch --all` return
        identical output from a worktree in a two-worktree project.

- [ ] **Task 17: Correct the empty-initiatives message (D8)** (effort: 1)
  - [ ] **Scope narrowed after the tasks review (F001).** D8 says a
        "filtered" branch belongs on *paths that retain a filter*. After
        Task 16 the arch initiative paths retain none, so a
        filtered-vs-empty branch here would be unreachable. Do **not**
        add one — that was the original wording and it would produce dead
        code.
  - [ ] Instead, correct the wording only. The message at `arch.ts:83`
        (and its `archListFromModel` counterpart) should state plainly
        that the plan contains no initiative entries, rather than implying
        a lookup failure.
  - [ ] The six other `isInIndexRange` call sites do retain filters and
        would genuinely benefit from D8's distinction, but they are
        explicitly out of scope (see Task 16). Do not expand into them.
        If the distinction looks needed there, report it for a future
        slice rather than widening this one.
  - [ ] Success criteria: an empty initiative list reads as an accurate
        statement about the plan's contents; no unreachable branch is
        added.

- [ ] **Task 18: Two-worktree tests for `cf list arch`** (effort: 2)
  - [ ] Add a test with **two** registered worktrees. One is not enough:
        `getWorktreeIndexRange` returns `undefined` for single-worktree
        projects (`packages/core/src/utils/worktree-overlay.ts:33`), so no
        filtering occurs and a one-worktree test passes against the
        unfixed code.
  - [ ] Cover both the plan-driven and `archListFromModel` fallback paths.
  - [ ] Assert the default and `--all` forms agree — that is the real
        invariant.
  - [ ] `packages/cli/tests/commands/list-arch-index-targeting.test.ts`
        covers `list slices`/`list tasks` archIndex targeting and does not
        assert the removed filter, so it should not need rewriting. If it
        does, stop and confirm with the Project Manager rather than
        weakening it.
  - [ ] Success criteria: the test fails against the pre-Task-16 code and
        passes after it.
  - [ ] Commit checkpoint: #97 fixed and pinned.

### Part 6 — #98: dual managed-marker recognition (rider)

**Unrelated to the worktree surface.** Added after the slice design and its
PASS review, at PM direction, because it is a two-function change with an
external repo waiting on it. It shares no code with Parts 1–5. Treat it as
an independent unit: it may be implemented, committed, and merged at any
point in the sequence.

**Cross-repo contract — read before starting.** ai-project-guide#22 changes
what `scripts/setup-ide` emits. cf only ever *reads* the marker; the guide
script is the sole writer, so there is no cf-side emitter to update.
**cf must recognize the new form before the guide emits it** — reversing
that order makes `isManagedInstall` return false on every existing install,
which reverts cf to prompting and backing up files it currently treats as
managed. The peer session has #22 implemented but explicitly withheld from
landing until this ships. This work is inert until then: nothing emits the
new form yet, so it is safe to merge early.

- [ ] **Task 22: Recognize both marker forms, search whole file** (effort: 2)
  - [ ] In `packages/cli/src/commands/setup-ide.ts`, replace the single
        `MANAGED_MARKER` constant (line 72) with a single exported
        collection holding both forms — the legacy exact-match line
        `[//]: # (context-forge:managed)` and the new
        `<!-- BEGIN:context-forge -->`. Per the project rule against
        scattered comparison values, the literals appear in exactly one
        place. Keep the legacy constant exported if anything still imports
        it; it is harmless to retain indefinitely.
  - [ ] In `isManagedInstall` (line 79), treat presence of **either** form
        as managed. Legacy keeps its trimmed exact-line match; the new form
        matches a line *containing* the begin marker (it may be indented or
        followed by trailing content).
  - [ ] Remove the 20-line window (`content.split('\n').slice(0, 20)`,
        line 84) and search the whole file. This is **required**, not
        optional: once #22 preserves user content and appends the managed
        block, a project's own preamble pushes the begin marker past line
        20. This repo's CLAUDE.md has its marker at line 3 of 150 today, so
        a both-forms-but-still-20-lines fix would pass on every current
        file and fail on exactly the files #22 creates. No performance
        concern — at most two marker files per target, ~10KB each, already
        fully read by `readFileSync` before the existing slice.
  - [ ] Do **not** add `<!-- context-forge:generated -->` (the peer's
        standalone marker for `.github/instructions/*` and
        `.github/prompts/*`). Verified no-op: those paths appear only in
        `propagateDirs`, which is pure `copyFileSync`/`cpSync` and never
        inspects content. No target's `markerFiles` includes them —
        `markerFiles` is only `CLAUDE.md`, `AGENTS.md`, and
        `.github/copilot-instructions.md` across all four targets.
  - [ ] Success criteria: a file carrying either marker at any line is
        reported managed; a file with neither is not.

- [ ] **Task 23: Tests for dual-marker recognition** (effort: 2)
  - [ ] Extend `packages/cli/tests/commands/setup-ide.test.ts`: new-form
        marker near the top; new-form marker far below line 20 (the #22
        preserve-and-append shape); legacy marker still recognized;
        both forms present in one file; neither present; an END marker
        without a BEGIN (should not count as managed).
  - [ ] **Invert the existing test at line 367**,
        `'ignores a marker appearing after line 20'`. It pins the 20-line
        cap as intended behavior, so this is a deliberate behavior change,
        not a test rewritten to go green. Rename it to state the new rule
        and keep a comment noting it was inverted for #98 — so a future
        reader sees a decision rather than an erosion.
  - [ ] Success criteria: `pnpm --filter @context-forge/cli test` passes.

- [ ] **Task 24: Confirm script-failure output is surfaced** (effort: 1)
  - [ ] #22 makes `setup-ide` exit non-zero, leaving the file untouched,
        when it finds broken or duplicate marker pairs. The actionable
        part is the script's own stderr message.
  - [ ] Confirm cf surfaces it rather than swallowing it. Already verified
        by inspection and simulation: `execFileSync` uses
        `stdio: 'inherit'` (line 168), so script stderr reaches the
        terminal verbatim, and cf then raises a `UserError` naming the
        exit code and pointing at that output. This task is a
        confirmation against the real script once #22 lands, not new work.
  - [ ] If it turns out a real failure is swallowed, stop and report —
        do not restructure error handling as part of this rider.
  - [ ] Success criteria: a simulated broken-marker failure shows the
        script's message followed by cf's exit-code error.
  - [ ] Commit checkpoint: #98 complete; notify the ai-project-guide
        session that #22 is unblocked.

### Part 7 — `rules.exclude` config key (rider)

**Second rider, added 20260922 at PM direction.** Counterpart to
ai-project-guide#23 (excluding irrelevant scoped rules — e.g. a project
with no Dart code skipping `dart.md`). Unrelated to the worktree surface
and to #98; shares no code with any other Part. The design and its PASS
review predate it.

**Scope is deliberately tiny: cf owns the key, the guide owns the
behavior.** cf adds one registry entry so the key is settable,
gettable, and validated. All matching, skipping, and warning logic lives
in `scripts/setup-ide` on the guide side. cf never reads this key itself.

**Contract agreed with the peer session (20260922):**
- Key name `rules.exclude`; comma-separated filename globs, no spaces
  around commas (e.g. `dart.md,swift*.md`).
- **Three-tier resolution, implemented entirely on the guide side**
  (PM ruling 20260922, reversing an earlier config-only decision). The
  script resolves exclusions as: `CONTEXT_FORGE_RULES_EXCLUDE` if set →
  else `cf config get rules.exclude` when `cf` is on PATH → else no
  exclusions.
  - **cf does not read the env var.** The precedent that no cf config key
    is env-overridable is preserved: the only two env vars in the codebase
    remain deliberately not config — `CONTEXT_FORGE_DATA_DIR`
    (`storagePaths.ts:66`) is a bootstrap path override that must work
    before config is readable, and `CF_JSON` (`index.ts:175`) mirrors the
    `--json` flag. `CONTEXT_FORGE_RULES_EXCLUDE` is an input to the bash
    script, not an alias for the cf key, so it sets no precedent on cf's
    config surface.
  - **Why the env tier is required.** `scripts/setup-ide` is 1078 lines of
    standalone bash with zero `cf` invocations, and its `show_usage`
    documents it as directly runnable — it is genuinely run standalone
    during guide development. Under config-only, a standalone caller has no
    channel for exclusions at all. An earlier decision here rested on an
    incorrect claim that the script already shelled out to cf; it does not.
  - **Env-only was rejected.** It would delete this Part entirely and lose
    persistence (exclusions are a project property that should be committed
    and shared, not per-shell), inspectability via `cf config get`, and
    set-time validation — which matters precisely because a malformed
    pattern fails silently.
  - The script should report which tier supplied active exclusions, so a
    stale `CONTEXT_FORGE_RULES_EXCLUDE` shadowing the config value is
    visible rather than silent.
- Matching is basename-only, skip-only (never deletes an already-installed
  file), and unset/empty means exactly current behavior.
- `alwaysApply` rules are not excludable — they compile into the managed
  block rather than being copied as files.

- [ ] **Task 25: Add the `rules.exclude` registry entry** (effort: 1)
  - [ ] Add one entry to `CONFIG_KEYS`
        (`packages/core/src/config/ConfigKeys.ts:17`) under a new `rules.`
        namespace.
  - [ ] `type: 'string'` — `ConfigKeyDefinition.type` is only
        `'string' | 'boolean' | 'number'`; there is no list type, so a
        delimited string is the only representable form. This is why the
        comma-separated format was agreed.
  - [ ] `default: ''` — empty is the identity default (no exclusions),
        matching `git.integration_branch` and
        `workflow.review_gate_effective_date`.
  - [ ] `scope: ConfigScope.Shared`. "This project has no Dart code" is a
        property of the project, not of the developer, so every
        contributor should get the same exclusions. 14 of 15 existing keys
        are Shared; the lone Personal key is `git.integration_branch`, a
        per-developer workflow preference.
  - [ ] Add a `validate` function following the established shape: empty
        returns null (identity); otherwise reject entries with surrounding
        whitespace, since the guide's bash `case` match is literal and
        ` swift*.md` would silently never match. Reject an empty entry
        from a doubled or trailing comma for the same reason. A silently
        non-matching pattern is the exact failure this key must not have.
  - [ ] The description must state the format, that matching is
        basename-only and skip-only, and that the consumer is the guide's
        `setup-ide` script — not cf itself. Someone reading
        `cf config get rules.exclude` should not have to guess who acts
        on it.
  - [ ] Success criteria: `cf config set rules.exclude 'dart.md,swift*.md'`
        round-trips through `cf config get`; a value with a space around a
        comma is rejected with a message naming the problem.

- [ ] **Task 26: Tests for the `rules.exclude` key** (effort: 1)
  - [ ] Extend `packages/core/tests/config/ConfigKeys.test.ts`: the key
        exists with the expected type, default, and scope; empty validates;
        a well-formed multi-glob list validates; a list with spaces around
        a comma is rejected; a doubled/trailing comma is rejected.
  - [ ] Check whether `packages/cli/tests/commands/config.test.ts` asserts
        anything about the full key set (a count or an enumerated list). If
        it does, update it — a new key must not silently break it.
  - [ ] Success criteria: `pnpm -r test` passes.
  - [ ] Commit checkpoint: `rules.exclude` available; notify the
        ai-project-guide session that the key is live.

### Part 8 — Verification and release prep

- [ ] **Task 19: Full verification walkthrough** (effort: 2)
  - [ ] Run `pnpm -r build && pnpm -r test && pnpm -r typecheck` clean.
  - [ ] Execute the design's Verification Walkthrough steps 1–7 against a
        local build, including the step-6a `cf list arch` repro and its
        temporary-worktree cleanup.
  - [ ] Confirm step 7 explicitly: in a project with no registered
        worktrees, `cf check` and `cf validate frontmatter` output is
        identical to a pre-slice build. Capture the before-output first.
  - [ ] Success criteria: every step produces the documented "after"
        result.

- [ ] **Task 20: External consumer verification** (effort: 2)
  - [ ] Run squadron's `tests/documents/test_schema_drift.py` from a
        squadron worktree against this build. It currently fails 3/6
        because of #88; expect 6/6.
  - [ ] Confirm an **unmodified** squadron `frontmatter_gate.py` still
        works against the new output — the additive-only guarantee (D3).
  - [ ] Do not modify squadron in this slice. If either check fails,
        report to the Project Manager rather than changing squadron.
  - [ ] Success criteria: 6/6 passing; gate behavior unchanged.

- [ ] **Task 21: CHANGELOG and docs** (effort: 1)
  - [ ] Add a CHANGELOG entry covering all six issues, noting the
        additive JSON fields, the `cf list arch` behavior change, and
        (#98) that cf now recognizes both managed-marker forms anywhere in
        the file. Call out #98 as the prerequisite for ai-project-guide#22
        so the ordering is recoverable from the changelog alone.
  - [ ] Note the new `rules.exclude` config key, stating that the guide's
        `setup-ide` script is what acts on it (ai-project-guide#23) —
        cf only stores and validates it.
  - [ ] Note the new `documentRoot` and per-path fields as available for
        consumers; do not document them as required.
  - [ ] Success criteria: CHANGELOG describes the user-visible changes;
        `pnpm -r build` still clean.
  - [ ] Commit checkpoint: slice complete, ready for merge to `main`.
