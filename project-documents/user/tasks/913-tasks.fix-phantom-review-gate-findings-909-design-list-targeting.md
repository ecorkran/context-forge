---
docType: tasks
slice: fix-phantom-review-gate-findings-909-design-list-targeting
project: context-forge
parent: project-documents/user/slices/913-slice.fix-phantom-review-gate-findings-909-design-list-targeting.md
lldReference: project-documents/user/slices/913-slice.fix-phantom-review-gate-findings-909-design-list-targeting.md
dependencies: [240, 241, 242, 911, 912]
projectState: >
  TD-1/TD-2/TD-3 implemented and committed. Reopened after PM review of cf check
  output surfaced two further pre-existing bugs: TD-5 (preAdvance code-review
  guard false-flags checked plan entries with no slice-design/task-file — no
  code exists to review) and TD-6 (zero-padded artifact filenames like
  050-arch.*.md fail matchFiles()'s exact-prefix lookup, which silently skips
  the effective-date cutoff check for them since gatedArtifactFrontmatter
  resolves null before the cutoff is ever consulted). Both are narrow,
  independent fixes in ConsistencyChecker.ts/documentDetector.ts. TD-1/TD-3
  build on existing ConsistencyChecker/list-command machinery already merged
  to main; no new gate primitive, config key, or frontmatter field from any TD.
dateCreated: 20260710
dateUpdated: 20260711
status: complete
---

# Tasks: Fix Phantom Review-Gate Findings, 909's Missing Slice-Design, and List-Command Plan Targeting

## Context Summary

Three independent, narrow fixes bundled by shared discovery event (dogfooding the
review-gate system, initiative 240, post-slice-243) — not by shared code path. See
the design's Overview for the grouping rationale (reviewed and deliberate, F001).

- **TD-1** — `ConsistencyChecker.checkAll()` merges every discovered `*-slices.*.md`
  plan's entries into one global `index`-keyed map. `slicePlanParser.ts`'s unindexed-entry
  fallback assigns a per-file sequential counter as `index`, which collides with real
  project indices once merged. `140-slices.context-forge-restructure.md` (12 unindexed,
  fully-complete legacy entries) is the actual collision source, producing phantom
  "Slice 1"–"Slice 12" review-gate findings. Fix: tag each entry's `indexSource`
  (`'explicit'` | `'fallback'`) at parse time; exclude `'fallback'` entries from
  `checkAll()`'s cross-plan merge only.
- **TD-2** — 909 has no slice-design file, so `--set-review-none 909` refuses. The
  retroactive design (`909-slice.configurable-branch-root-prefix.md`, citing shipped
  commit `713d0c0`) is **already written** — this slice's only TD-2 task is verifying
  it and confirming the CLI can now target it.
- **TD-3** — `cf list slices` / `cf list tasks` only ever read `project.fileSlicePlan`
  (the active pointer), forcing a four-step `cf set arch` round-trip to inspect another
  initiative. Fix: optional positional `[archIndex]` argument on both commands, backed
  by a new `resolveSlicePlanPathByIndex()` core helper, with zero project-state mutation.

Key files:
- `packages/core/src/introspection/types.ts` — `SlicePlanEntry` (TD-1: new field)
- `packages/core/src/introspection/parsers/slicePlanParser.ts` — (TD-1: tag `indexSource`)
- `packages/core/src/introspection/ConsistencyChecker.ts` — `checkAll()` merge loop (TD-1)
- `packages/core/src/schema/resolveFileByIndex.ts` — co-locate new helper (TD-3)
- `packages/cli/src/commands/list.ts` — positional arg registration (TD-3)
- `packages/cli/src/commands/slice.ts` — `sliceListAction` (TD-3)
- `packages/cli/src/commands/task.ts` — `taskListAction`/`listTaskFiles` (TD-3)
- `project-documents/user/slices/909-slice.configurable-branch-root-prefix.md` — already
  exists; TD-2 verifies only, does not author.

Grounding facts (verified against source, design TD-1/TD-3):
- `discoverAllSlicePlans()` ([ConsistencyChecker.ts:1169-1180]) globs `*-slices.*.md`
  project-wide, unchanged by this slice — only the *merge* is narrowed.
- `PLAN_INDEXED_RE`/`PLAN_UNINDEXED_RE` in `slicePlanParser.ts` are the two entry-construction
  sites; `indexSource` is set at both.
- `checkAll()`'s merge loop is at [ConsistencyChecker.ts:94-104] (`uniqueEntries` Map,
  "first occurrence wins by index").
- `resolveArtifactPath()` lives in `resolveFileByIndex.ts` — the new helper is a sibling,
  same "index → path" concern, same file.
- `sliceListAction` resolves its plan at ~[slice.ts:14-96]; `taskListAction`/`listTaskFiles`
  at ~[task.ts:16-45,127-190]. Both currently key exclusively off `project.fileSlicePlan`.

Test suites run via `pnpm --filter @context-forge/core test <file>` and
`pnpm --filter @context-forge/cli test <file>`; full build via `pnpm -r build`.

---

## TD-1 — Exclude unindexed-fallback entries from cross-plan aggregation

- [x] **Task 1.1 — Add `indexSource` to `SlicePlanEntry` and tag it in the parser**
  - In `packages/core/src/introspection/types.ts`, add `indexSource: 'explicit' | 'fallback'`
    to the `SlicePlanEntry` interface.
  - In `packages/core/src/introspection/parsers/slicePlanParser.ts`, set
    `indexSource: 'explicit'` on entries built from `PLAN_INDEXED_RE` matches, and
    `indexSource: 'fallback'` on entries built from `PLAN_UNINDEXED_RE` matches.
  - Success: `parseSlicePlan()`'s return type carries the new field on every entry; a plan
    mixing both formats produces entries correctly tagged per-entry (not per-file).
  - Effort: 1/5

- [x] **Task 1.2 — Test the parser tagging**
  - Extend `slicePlanParser` unit tests: an indexed-format entry → `indexSource: 'explicit'`;
    an unindexed-format entry → `indexSource: 'fallback'`; a plan with both formats mixed
    (one line indexed, one line unindexed) → each entry tagged independently and correctly.
  - Success: all three cases pass; no change to existing index/status/isChecked assertions
    (field is additive, not a behavior change to parsing itself).
  - Effort: 1/5

- [x] **Task 1.3 — Exclude `'fallback'` entries from `checkAll()`'s cross-plan merge**
  - In `ConsistencyChecker.checkAll()`'s merge loop (~[ConsistencyChecker.ts:94-104]), skip
    entries with `indexSource === 'fallback'` before inserting into `uniqueEntries` — they
    must never enter the cross-plan index space.
  - Do not change `discoverAllSlicePlans()`, single-slice `check()`, or `parseSlicePlan()`
    itself — this is a narrowing of `checkAll()`'s aggregation input only (design scope
    boundary, TD-1).
  - Success: a fallback-indexed entry from any discovered plan can no longer collide with,
    mask, or generate a cross-plan finding against a real slice index.
  - Effort: 2/5

- [x] **Task 1.4 — Regression fixture: reproduce and fix the real 140-plan collision**
  - Add a `ConsistencyChecker` test fixture (mkdtemp scratch project, mirroring existing
    `checkAll()` test conventions): two slice plans — one indexed-format plan with real
    entries at indices 1–3 (mirroring `900-slices.*.md`-style), one unindexed-format plan
    using **140's actual list-item format** (`N. [x] **Name** — description`, no bolded
    index) whose sequential fallback indices collide with 1–3.
  - Assert `checkAll()` produces **zero** findings attributable to the unindexed plan's
    synthetic indices, and that the indexed plan's real 1–3 entries still evaluate and
    report normally (collision avoided, not just findings suppressed wholesale).
  - Success: fixture fails against pre-Task-1.3 code (proves it reproduces the real bug)
    and passes after — confirm by running it before/after locally if convenient, otherwise
    reason through the collision explicitly in the test's setup comment.
  - Effort: 3/5

- [x] **Task 1.5 — Regression: existing cross-plan rules still fire correctly**
  - Run (or extend if needed) the existing cross-plan aggregation tests — duplicate-index
    detection, `ruleArchStatusVsPlans`, `ruleInitiativeEntryVsArch` — against plans using
    only the indexed `(NNN)` format. Confirm no change in behavior (success criterion 2).
  - Success: existing suite passes unmodified, or with only additive assertions — no
    existing indexed-format test needs to change its expected output.
  - Effort: 1/5

- [x] **Task 1.6 — Regression: single-plan unindexed reads unaffected**
  - Add or confirm a `cf list slices` / `parseSlicePlan()` test against a plan using only
    the unindexed format in isolation (no colliding sibling plan) — entries still display
    with sequential indices, unchanged from today (success criterion 3).
  - Success: single-plan unindexed display behavior is provably unchanged by this slice.
  - Effort: 1/5

- [x] **Commit checkpoint** — after 1.6: `fix: exclude unindexed-fallback plan entries from cross-plan review-gate aggregation`.
  TD-1 is self-contained (type field + parser tagging + merge-loop filter + regression fixture).

---

## TD-2 — Verify 909's retroactive slice-design is usable

- [x] **Task 2.1 — Confirm 909's slice-design file and CLI targeting**
  - Confirm `project-documents/user/slices/909-slice.configurable-branch-root-prefix.md`
    exists (already authored at design time), has `docType: slice-design`,
    `status: complete`, and cites commit `713d0c0`.
  - Run `cf check --set-review-none 909` (or the equivalent review-declaration workflow)
    against this repo and confirm it no longer refuses with "no file found" — it now has
    an artifact to act on (success criterion 4). Note the actual command and result.
  - No code changes in this task — this is a verification-only task confirming a Phase-4
    deliverable behaves as designed. If the file is missing or malformed, stop and flag to
    the Project Manager rather than authoring/repairing it here (TD-2 explicitly assigns
    that authorship to the design phase, already completed).
  - Success: command output captured; 909 is confirmed reachable by the review-declaration
    tooling.
  - Effort: 1/5

- [x] **Commit checkpoint** — none required; TD-2 makes no code changes. Fold its verification
  note into the final verification-walkthrough commit (Task 4.2).

---

## TD-3 — `[archIndex]` positional argument for `cf list slices` / `cf list tasks`

- [x] **Task 3.1 — Add `resolveSlicePlanPathByIndex()` core helper**
  - In `packages/core/src/schema/resolveFileByIndex.ts` (co-located with
    `resolveArtifactPath`), add `resolveSlicePlanPathByIndex(projectPath: string, archIndex: number): Promise<string | null>`.
  - Reads `project-documents/user/architecture/`, finds the file matching
    `^${archIndex}-slices\..*\.md$` (same glob pattern `discoverAllSlicePlans()` already
    uses, narrowed to one index), returns its full path or `null` if none exists.
  - If more than one file matches (malformed project), pick deterministically (e.g. first
    alphabetically after `readdir` + `.sort()`) — document the tie-break in a short comment.
  - Export it from the core package's node entry point alongside `resolveArtifactPath`.
  - Success: importable from `@context-forge/core/node`; returns the correct single path
    for a normal project.
  - Effort: 2/5

- [x] **Task 3.2 — Test `resolveSlicePlanPathByIndex()`**
  - Unit tests (scratch fixture): matching file found → correct path; no matching file →
    `null`; two candidate files for the same index → deterministic single result matching
    the documented tie-break.
  - Success: all three cases pass.
  - Effort: 2/5

- [x] **Task 3.3 — Add `[archIndex]` positional argument to `cf list slices` / `cf list tasks`**
  - In `packages/cli/src/commands/list.ts`, add an optional positional `[archIndex]` to
    both the `slices` and `tasks` subcommands (commander `.argument('[archIndex]', ...)`),
    threading it into `sliceListAction`/`taskListAction`'s options object.
  - Success: `cf list slices --help` / `cf list tasks --help` document the new optional
    argument, and it is threaded through to the action functions as a string. Numeric
    validation itself is NOT done here — Commander passes `archIndex` through as a raw
    string; parsing/validating it into a `UserError` on non-numeric input is Task 3.4's
    and Task 3.6's responsibility, exercised end-to-end by Tasks 3.5/3.7.
  - Effort: 1/5

- [x] **Task 3.4 — Wire `archIndex` into `sliceListAction`**
  - In `packages/cli/src/commands/slice.ts`, when `archIndex` is provided: resolve the plan
    path via `resolveSlicePlanPathByIndex()` instead of
    `resolveArtifactPath('fileSlicePlan', project.fileSlicePlan)`, and skip worktree
    index-range filtering entirely (always show the full target plan).
  - `activeIndex`/`isActive`/`isNext` marking still runs against `project.fileSlice` as today.
  - If no plan matches `archIndex`, throw `UserError` naming the index and the searched
    directory (mirror `cf set arch`'s "No file matching index" wording).
  - No mutation of `project.fileSlicePlan`/`fileArch`/`fileSlice` in either branch.
  - Success: `cf list slices <archIndex>` prints the target plan's entries; project state
    is unchanged before/after; missing index produces the named error.
  - Effort: 2/5

- [x] **Task 3.5 — Test `sliceListAction` with `archIndex`**
  - CLI-level tests: valid `archIndex` returns the target plan's entries without reading
    `project.fileSlicePlan`; missing/unmatched `archIndex` throws the named `UserError`;
    a project-state snapshot taken before and after an indexed call is byte-identical
    (asserts no-mutation directly).
  - Success: all cases pass, including the byte-identical state-snapshot assertion.
  - Effort: 2/5

- [x] **Task 3.6 — Wire `archIndex` into `taskListAction`/`listTaskFiles`**
  - In `packages/cli/src/commands/task.ts`, when `archIndex` is provided: resolve the plan
    via `resolveSlicePlanPathByIndex()` and read task files from the single project path
    only (no worktree/`--all` aggregation).
  - `[archIndex]` and `--all` are mutually exclusive: if both are passed, throw `UserError`
    ("cannot combine an explicit index with --all — --all lists tasks across worktrees of
    the active plan").
  - If no plan matches `archIndex`, throw the same-style `UserError` as Task 3.4.
  - No mutation of project state.
  - Success: `cf list tasks <archIndex>` prints the target plan's task-file summaries;
    `<archIndex> --all` together is rejected; project state unchanged before/after.
  - Effort: 2/5

- [x] **Task 3.7 — Test `taskListAction`/`listTaskFiles` with `archIndex`**
  - CLI-level tests mirroring Task 3.5: valid `archIndex` returns target-plan task
    summaries without touching `project.fileSlicePlan`; missing `archIndex` throws the
    named `UserError`; `archIndex` + `--all` throws the mutual-exclusion `UserError`;
    project-state snapshot before/after an indexed call is byte-identical.
  - Success: all cases pass.
  - Effort: 2/5

- [x] **Commit checkpoint** — after 3.7: `feat: add optional archIndex targeting to cf list slices/tasks`.
  Covers the core helper, its tests, both CLI wirings, and their tests.

---

## TD-5 — Code-review gate requires a reviewable artifact to exist

- [x] **Task 5.1 — Guard `preAdvance` on `docs?.sliceDesign` existence**
  - In `packages/core/src/introspection/ConsistencyChecker.ts`'s `ruleReviewGate()`
    (~lines 642-646), change the `preAdvance` boundary's guard from `!!planEntry?.isChecked`
    alone to also require `docs?.sliceDesign !== null && docs?.sliceDesign !== undefined`,
    mirroring the `preTasks` guard's pattern immediately above it.
  - Do not change `preTasks`/`preImplementation` guards — already correct.
  - Success: a checked plan entry with no slice-design file produces zero `preAdvance`
    (code-review) findings; a checked plan entry WITH a slice-design file and no review
    artifact still produces the finding (no regression to the legitimate case).
  - Effort: 1/5

- [x] **Task 5.2 — Test the guard fix**
  - Unit test in `ConsistencyChecker.test.ts`: checked plan entry + no `docs.sliceDesign`
    → zero `preAdvance` findings. Checked plan entry + `docs.sliceDesign` present + no
    review → `preAdvance` finding still fires (regression guard for slices 908/910/911/913's
    class of legitimate finding).
  - Success: both cases pass.
  - Effort: 1/5

---

## TD-6 — Zero-padded artifact index lookup fails, defeating the effective-date cutoff

- [x] **Task 6.1 — Make `matchFiles()` tolerant of leading zeros on the index**
  - In `packages/core/src/introspection/parsers/documentDetector.ts`, change the prefix
    match in `matchFiles()`/`detectDocuments()` from an exact literal (`${idx}-`) to a
    regex allowing optional leading zeros (`^0*${idx}-`), applied consistently across all
    5 call sites (slice, tasks, arch, slicePlan, review).
  - Do not change `extractFileIndex()`, `evaluateReviewGate()`, or the cutoff-comparison
    logic — those are already correct; this is purely a filename-matching fix.
  - Success: `detectDocuments(projectPath, 50, ...)` correctly resolves
    `050-arch.design-decisions.md` as `architecture`.
  - Effort: 2/5

- [x] **Task 6.2 — Test the zero-padded match fix**
  - Unit test in `documentDetector.test.ts` (or `ConsistencyChecker.test.ts` if no
    dedicated test file exists yet): a fixture with a zero-padded filename (e.g.
    `050-arch.foo.md`) is correctly matched when queried by its numeric index (`50`).
    A non-padded index (e.g. `140-arch.foo.md` queried as `140`) continues to match
    unchanged (no regression). A near-miss (e.g. `1400-arch.foo.md` queried as `140`)
    does NOT match (guards the existing suffix-boundary behavior).
  - End-to-end regression: architecture 050 in this repo, once matched, correctly falls
    through the effective-date cutoff (`dateCreated: 20260531` <
    `workflow.review_gate_effective_date: 20260701`) and produces zero review-gate
    findings.
  - Success: all three matching cases pass; 050 is confirmed cutoff-exempt end-to-end.
  - Effort: 2/5

- [x] **Commit checkpoint** — after 6.2: `fix: exclude artifact-less slices from code-review
  gate and fix zero-padded index lookup`. Covers TD-5 and TD-6 together (both found in the
  same PM review pass, both narrow ConsistencyChecker/documentDetector fixes).

---

## Verification

- [x] **Task 4.1 — Full build + suite**
  - Run `pnpm -r build` (clean across core, cli, mcp-server, electron) and the core + cli
    test suites; confirm only pre-existing DEVLOG-documented failures remain (success
    criterion 9).
  - Success: build clean, no new test failures introduced by this slice.
  - Effort: 1/5

- [x] **Task 4.2 — Execute the design's Verification Walkthrough and update it with real output**
  - Run Parts A–E from the slice design against this repo (or a scratch fixture where a
    real repro is impractical, noting the caveat as prior slices' walkthroughs did):
    Part A (phantom findings gone), Part B (regression fixture run), Part C (909 targeting
    — fold in Task 2.1's captured output), Part D (list targeting + error paths), Part E
    (full regression). Add Part F (TD-5: artifact-less slices no longer flagged) and
    Part G (TD-6: 050 correctly cutoff-exempt).
  - Replace the design document's draft walkthrough with the actual commands and output
    executed, per this repo's established convention (see slices 911/912/243).
  - Success: all seven parts confirmed with real command output; design doc's Verification
    Walkthrough section updated accordingly.
  - Effort: 2/5

- [x] **Task 4.3 — Docs: CHANGELOG + DEVLOG**
  - Add user-facing CHANGELOG entries (phantom review-gate findings fixed, 909 artifact
    trail closed, `cf list slices`/`cf list tasks` `[archIndex]` targeting, code-review
    gate no longer false-flags artifact-less slices, zero-padded index lookup fixed) and
    a developer-facing DEVLOG session entry (append to the existing 913 entry or add a
    follow-up entry per this repo's convention).
  - Success: both files updated at repo root (not under `project-documents`).
  - Effort: 1/5

- [x] **Commit checkpoint** — after 4.2/4.3: `docs: slice 913 verification + changelog/devlog
  (TD-5/TD-6 follow-up)` (or fold into the final feature commit). Verification and doc
  updates close the slice.
