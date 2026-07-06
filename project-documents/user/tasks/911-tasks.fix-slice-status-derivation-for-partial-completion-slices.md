---
docType: tasks
slice: workflow-status-derivation
project: context-forge
lld: user/slices/911-slice.workflow-status-derivation.md
dependencies: [241, 242]
projectState: 241 (STATUS const) and 242 (evaluateReviewGate extraction) are complete on main. Slice-plan entry status is still derived purely from the plan checkbox, causing #56 (tasks-complete-but-unchecked slices read as "not started"). #57 (docs-only slices gated for a code review) is unresolved.
dateCreated: 20260705
dateUpdated: 20260705
status: not_started
---

## Context Summary
- Working on the `workflow-status-derivation` slice (911): fixes GitHub #56 (slice-plan entry status collapses partial/complete-unchecked slices into "not started") and #57 (docs-only slices gated for a code review they can't produce).
- Depends on 241 (`STATUS` const, `packages/core/src/introspection/types.ts`) and 242 (`evaluateReviewGate()`, `packages/core/src/introspection/reviewGate.ts`) — both complete on `main`.
- Delivers: one shared `deriveEntryStatus` helper replacing four divergent inline status mappings; two missing not-started-boundary consistency-rule branches; a docs-only frontmatter declaration read by the review gate; and a fix to `normalizeStatus()`'s silent fallback (found during this breakdown — see Task 1a).
- Full design: [911-slice.workflow-status-derivation.md](../slices/911-slice.workflow-status-derivation.md). Review: [911-review.slice.workflow-status-derivation.md](../reviews/911-review.slice.workflow-status-derivation.md).
- Next planned slice: 910 (NormalizedStatus literal sweep) — separate, not blocked by this one.

### Decisions locked for this breakdown
- Docs-only frontmatter field: `codeReview` on the slice-design schema, single allowed value `"none"` when present; absent ⇒ code review required (unchanged default).
- The two new not-started-boundary checks are added as **additional branches inside the existing `ruleTaskVsPlan` and `ruleFrontmatterVsComputed` methods**, reusing their existing `rule: 'task-vs-plan'` / `rule: 'frontmatter-vs-computed'` ids — this matches how those two rules already cover both directions of the complete boundary.
- `normalizeStatus()` (`packages/core/src/introspection/parsers/statusNormalizer.ts`) changes its return type to `NormalizedStatus | undefined`: `undefined` means "input present but unrecognized," never silently coerced to `'not-started'`. Its one caller ([ProjectModelBuilder.ts:175](../../../packages/core/src/introspection/ProjectModelBuilder.ts)) surfaces this as a visible `status: 'unknown'` in the doc summary rather than a throw — a bulk directory scan must not abort the whole project model over one malformed doc.

---

## Tasks

- [x] **1. Fix `normalizeStatus()` silent fallback** — Prerequisite for TD-2a; discovered during task breakdown, not in the original design.
  - [x] Change `normalizeStatus(raw: string | undefined | null): NormalizedStatus` to return `NormalizedStatus | undefined` in `packages/core/src/introspection/parsers/statusNormalizer.ts`. Remove the `?? 'not-started'` fallback (line 24) — an unmapped/empty key returns `undefined` instead.
  - [x] Update the JSDoc comment to state that `undefined` means the raw value was present but not recognized (distinct from a real `not-started`), and note that `deferred` is intentionally absent from `STATUS_MAP` (it has no `NormalizedStatus` equivalent) and therefore also normalizes to `undefined`.
  - [x] Update the sole caller, `packages/core/src/introspection/ProjectModelBuilder.ts:175`: when `normalizeStatus(fm.data.status)` returns `undefined`, set the doc's `status` field (typed `string` on `DocSummary`) to the literal `'unknown'` rather than silently defaulting to `not-started`. Do not throw — this runs during a bulk directory scan and one malformed doc must not abort the whole project model.
  - [x] Success: `normalizeStatus('garbage')` and `normalizeStatus(undefined)` and `normalizeStatus('deferred')` all return `undefined`; `normalizeStatus('complete')` etc. still return their mapped `NormalizedStatus` unchanged. `pnpm --filter @context-forge/core build` succeeds (no remaining callers rely on the old signature).

- [x] **2. Test: `normalizeStatus()` undefined-on-unrecognized** — Effort: 1/5
  - [x] In the existing `statusNormalizer` test file (or create one colocated with the parser tests if none exists), add cases: unmapped string → `undefined`; empty string → `undefined`; `undefined` input → `undefined`; `'deferred'` → `undefined`; every existing mapped key still returns its prior value (regression for the rename).
  - [x] Add a `ProjectModelBuilder` test asserting a doc with an invalid/garbage frontmatter `status` appears in the built model with `status: 'unknown'`, not `'not-started'`, and that the rest of the scan completes (other docs still populate normally).
  - [x] Success: new tests pass; `pnpm --filter @context-forge/core test` green.

- [x] **3. Implement `deriveEntryStatus` helper** — The core derivation lattice (TD-1, TD-2, TD-2a). Effort: 3/5
  - [x] Add a new file `packages/core/src/introspection/statusDerivation.ts` (or add to an existing derivation-adjacent module if the codebase has a clearer home — prefer a new file for a clean, independently-testable unit).
  - [x] Define and export:
    ```
    export interface EntryStatusSignals {
      frontmatterStatus?: NormalizedStatus;
      taskInferredStatus?: NormalizedStatus;
      isChecked: boolean;
    }
    export function deriveEntryStatus(signals: EntryStatusSignals): NormalizedStatus
    ```
  - [x] Implement the precedence lattice exactly as specified in the design (highest priority first): (1) `frontmatterStatus === STATUS.Deprecated` → `STATUS.Deprecated`; (2) `taskInferredStatus` defined → return it as-is; (3) `frontmatterStatus` defined (and not deprecated) → return it as-is; (4) neither defined → `isChecked ? STATUS.Complete : STATUS.NotStarted`.
  - [x] Return only `STATUS.*` values (no bare string literals) per the 241 convention.
  - [x] Export `deriveEntryStatus` and `EntryStatusSignals` from `packages/core/src/introspection/index.ts`.
  - [x] Success: function compiles with no `any`; every branch reachable per the lattice table in the design.

- [x] **4. Test: `deriveEntryStatus` lattice** — Effort: 2/5
  - [x] New test file `packages/core/src/introspection/statusDerivation.test.ts`. Cover, as separate cases: deprecated-frontmatter wins regardless of tasks/checkbox; task `in-progress` wins over frontmatter `complete`; task `complete` wins over unchecked checkbox (the direct #56 regression shape); task `not-started` wins over frontmatter; frontmatter-only (no task signal) returns frontmatter value; neither signal, checked → `complete`; neither signal, unchecked → `not-started`.
  - [x] Success: all cases pass; 100% branch coverage of the lattice (manually confirm each table row from the design has an asserting test, not just line coverage).

- [x] **5. Route `WorkflowNavigator.getNext()` through the helper** — The direct #56 fix. Effort: 3/5
  - [x] In `packages/core/src/introspection/WorkflowNavigator.ts`, at both `entries.find((e) => !e.isChecked)` sites (~line 186, the no-active-slice guard, and ~line 299, the complete-advance branch): for each candidate entry, resolve `taskInferredStatus` (via `detectDocuments` + `parseTaskFile` when a task file exists) and `frontmatterStatus` (via `detectDocuments` + `parseFrontmatter` + `normalizeStatus` when a slice design exists), call `deriveEntryStatus`, and change the predicate to select the first entry whose derived status is **not** `STATUS.Complete` and **not** `STATUS.Deprecated`.
  - [x] Apply TD-2a here: if a task file exists but `parseTaskFile` throws, or a slice design exists but its frontmatter `status` normalizes to `undefined` (Task 1), do not silently treat the signal as absent — propagate the error for that entry's resolution rather than falling through to the checkbox. (`getNext` operates on the plan as a whole; a single malformed entry may throw for that call rather than silently mis-selecting the next slice — this is acceptable because `getNext` already fails loudly on missing project state elsewhere.)
  - [x] Update the recommendation **text**, not just the selection predicate — this is an explicit success criterion (design functional requirement #3, in-scope item "getNext recommendations that say 'continue in-progress slice N' vs 'advance to slice N'"). At the complete-advance branch (~line 298): when the *active* slice's own derived status (not just the next-candidate's) is `in-progress` rather than `complete`, the recommendation must read "Continue slice N: {name}" / rationale "Slice N is in progress — N of M tasks complete," not "Advance to slice N+1." Only emit "Advance to slice N" when the active slice's derived status is genuinely `complete`.
  - [x] Success: `getNext()` skips any entry whose derived status is complete/deprecated, in both branches; the returned `recommendation`/`summary` text distinguishes "continue in-progress" from "advance to" per the active slice's derived status; existing navigator suite still passes for entries with no design/task file (falls through to checkbox unchanged).

- [x] **6. Test: `getNext()` #56 regression, wording, gate-ordering, and TD-2a propagation** — Effort: 2/5
  - [x] Add a fixture-based test (using a fixture shaped like slice 242's real state: task file 100% complete, plan checkbox unchecked) asserting `getNext()` does **not** select that entry as "next unstarted," and instead recommends continuing it (if active) or skips to the next genuinely not-started entry.
  - [x] Add a wording test: an active slice with derived status `in-progress` (partial task completion) produces a recommendation containing "continue"/"Continue," not "advance to"; an active slice with derived status `complete` produces "advance to." Assert on the actual returned string content, not just the selected entry.
  - [x] Add the load-bearing gate-ordering regression: a slice whose tasks are complete but whose code review is absent or failing (with review gating enabled) still routes to the `pending-review` / `review-failed` position from `getNext()` — confirm the derivation change does not let it fall through to "advance to next slice." This exercises the existing `deriveSliceStatus()` gate branches (~lines 280-295), which must still fire before the complete-advance branch (~line 298).
  - [x] Add a TD-2a propagation test: a fixture where the active/candidate entry's task file exists but is unparseable (malformed content) — assert `getNext()` surfaces an error (throws or returns an explicit error result per whatever pattern Task 5 implements) rather than silently falling through to checkbox-based selection.
  - [x] Success: all four new test groups pass; full existing `WorkflowNavigator` test suite still green.
  - [x] **Commit checkpoint:** helper + navigator routing + tests, buildable state. `git commit` with message `feat: add deriveEntryStatus helper, route WorkflowNavigator through it`.

- [ ] **7. Route `cf list slices` through the helper** — Effort: 2/5
  - [ ] In `packages/cli/src/commands/slice.ts`, the row-building logic (~lines 62-118): it already calls `detectDocuments` per entry (~line 66). Extend it to also resolve `taskInferredStatus` (parse the detected task file(s) if present) and `frontmatterStatus` (parse the detected slice-design frontmatter if present, via `normalizeStatus`), call `deriveEntryStatus`, and replace the binary `isChecked ? '✓ complete' : '○ not started'` display with a rendering keyed on the derived `NormalizedStatus`.
  - [ ] Add a distinguishing display for "derived complete but checkbox still unchecked" vs "signed-off complete" — e.g. `● tasks done` (derived complete, unchecked) vs `✓ complete` (derived complete, checked). In-progress renders as e.g. `◐ in progress`; not-started as `○ not started`; deprecated as its own label.
  - [ ] Per TD-2a: if a detected task file fails to parse, or detected frontmatter status normalizes to `undefined`, render that row with a distinct degraded indicator (e.g. `⚠ unreadable`) rather than silently showing `not started` — do not abort the whole listing for one bad entry.
  - [ ] Success: display branches only on the derived `NormalizedStatus` (or the explicit degraded/unreadable case), never on a raw label string fed back into logic.

- [ ] **8. Route `cf list arch` through the helper** — Effort: 2/5
  - [ ] In `packages/cli/src/commands/arch.ts` (~lines 89-109): replace the bespoke `entry.isChecked ? 'complete' : archFile ? 'in_progress' : 'not_started'` three-way with a call to `deriveEntryStatus`. Arch entries have no task file, so `taskInferredStatus` is always absent for this caller — pass only `frontmatterStatus` (parsed from the arch file if `archFile` is found) and `isChecked`.
  - [ ] Per TD-2a (same treatment as Task 7): since `frontmatterStatus` is the *only* non-checkbox signal available here, a resolution failure on it must not silently fall through to the checkbox branch — that would be exactly the silent fallback TD-2a prohibits. If `archFile` is found but its frontmatter `status` normalizes to `undefined` (Task 1), render that row with the same distinct degraded indicator used in Task 7 (e.g. `⚠ unreadable`) instead of falling through to `isChecked ? 'complete' : 'not_started'`.
  - [ ] Success: `cf list arch` output is unchanged for the common cases (no regression) but now shares the same derivation logic as `cf list slices` instead of a fourth bespoke mapping; a malformed arch frontmatter status renders as degraded, never silently as checkbox-derived.

- [ ] **9. Test: `cf list slices` and `cf list arch` derived display** — Effort: 2/5
  - [ ] Extend or add CLI command tests asserting: a fixture shaped like slice 242 (tasks complete, unchecked) renders as complete/"tasks done" in `cf list slices`, not "not started." A partial-completion fixture renders in-progress. A fixture with an unparseable task file renders the degraded indicator, not "not started." A fixture with a `detectDocuments` failure for one entry (simulate via a fixture that triggers an error in the detection step, e.g. an unreadable directory permission or injected throw) renders that one row degraded without aborting the rest of the listing.
  - [ ] Add an equivalent `cf list arch` test confirming its three prior cases (checked, unchecked-with-file, unchecked-no-file) still map to the same outputs via the shared helper, **plus** a malformed-frontmatter case: an arch file with an invalid/unrecognized `status` value renders the degraded indicator (per Task 8), not silently falling through to the checkbox-derived value.
  - [ ] Success: new tests pass, including the `detectDocuments`-failure case (the third TD-2a failure mode, previously untested anywhere in the design) and the arch malformed-frontmatter case; note in the design's known pre-existing failures (3 core `FileProjectStore`, 4 cli `list.test.ts`) — confirm those specific 4 pre-existing `list.test.ts` failures are unrelated to this change (still fail for the same pre-existing reason, not a new regression) before proceeding.

- [ ] **10. Route `ProjectModelBuilder` through the helper** — Effort: 2/5
  - [ ] In `packages/core/src/introspection/ProjectModelBuilder.ts`: delete the inline override at ~lines 245-249 (task-entry status-from-checkbox-ratio) and the inline mapping at ~line 421 (plan-only `entry.isChecked ? 'complete' : 'not-started'`). Replace both with calls to `deriveEntryStatus`, resolving whatever signals are available at each call site (the task-entry path already has `taskInferredStatus` in hand from its own parse; the plan-only path has neither task nor frontmatter signal available, so it degrades to the checkbox branch exactly as before).
  - [ ] Confirm (read the code, do not assume) where `WorkflowStatus.slicePlan.entries[].status` is populated on the path from `ProjectModelBuilder` / `WorkflowNavigator` through to the MCP `workflow_status` handler (`packages/mcp-server/src/tools/workflowTools.ts:154-159`), so the derivation actually reaches that surface and is not limited to `getNext`'s local variable.
  - [ ] Per TD-2a: the task-entry path (~lines 236-262) already surfaces a parse failure naturally — `parseTaskItems`/frontmatter parsing throwing propagates up through the existing per-doc scan (this is the same scan Task 1/2 touch for `normalizeStatus`'s `undefined` case; reuse that same "surface as `status: 'unknown'` in the doc entry, don't silently default" treatment here for consistency across the builder's docs loop). Do not add a second, differently-behaved fallback path for task entries.
  - [ ] Success: both inline mappings are deleted (no duplicate lattice logic remains in `ProjectModelBuilder`); a task entry whose frontmatter status fails to normalize surfaces `status: 'unknown'` rather than a silently-derived value; existing `ProjectModelBuilder` test suite passes unmodified for cases with no task file / no design.

- [ ] **11. Test: `ProjectModelBuilder` + MCP `workflow_status` parity** — Effort: 2/5
  - [ ] Add a `ProjectModelBuilder` test asserting the task-entry and plan-only paths produce the same status a direct `deriveEntryStatus` call would for equivalent signals (no drift between the inline call and the helper's own unit tests).
  - [ ] Add an integration-level test (or extend an existing `workflow_status` / `getStatus` test) asserting the 242-shaped fixture's `slicePlan.entries` status in the MCP response matches what `cf list slices` renders for the same fixture — no surface disagreement.
  - [ ] Success: new tests pass; full existing test suite passes except the already-enumerated pre-existing failures.
  - [ ] **Commit checkpoint:** all five derivation consumers routed through the helper, buildable and tested. `git commit` with message `refactor: route cf list slices/arch, ProjectModelBuilder through deriveEntryStatus`.

- [ ] **12. Add not-started-boundary branch to `ruleTaskVsPlan`** — TD-4, first of two missing consistency-rule branches. Effort: 2/5
  - [ ] In `packages/core/src/introspection/ConsistencyChecker.ts`, extend `ruleTaskVsPlan` (~lines 263-310): add a branch for task file `inferredStatus === 'in-progress'` (any task checked, not all) while the plan entry checkbox is unchecked (`!sliceChecked`) — currently this state produces no finding at all. Emit a `warning`-severity `ConsistencyFinding` with `rule: 'task-vs-plan'` (reusing the existing rule id per the locked decision above), a description naming the partial-completion mismatch, and `fixable: false` (there is no single correct auto-fix for "in progress" — do not check the box, and there is no in-progress checkbox state to write).
  - [ ] Verify this new branch does not duplicate or conflict with the existing `tasksComplete && !sliceChecked` branch (~line 279) or `sliceChecked && !tasksComplete` branch (~line 295) — it covers the third quadrant (`in-progress && !sliceChecked`) those two leave silent.
  - [ ] Success: the new branch fires only for the in-progress-unchecked quadrant; existing two branches' behavior is unchanged (regression-tested in Task 14).

- [ ] **13. Add not-started-boundary branch to `ruleFrontmatterVsComputed`** — TD-4, second missing branch. Effort: 2/5
  - [ ] In the same file, extend `ruleFrontmatterVsComputed` (~lines 313-363): the existing branch at ~line 340 already handles `(fmStatus === 'in-progress' || fmStatus === 'not-started') && tasksComplete`. Add the adjacent case: `fmStatus === 'not_started' && taskResult.inferredStatus === 'in-progress'` (tasks have started but design frontmatter still says not-started) → `warning`, `fixable: true`, `fixAction: { type: 'update-frontmatter', filePath: sliceDesignFullPath, detail: { key: 'status', value: 'in-progress' } }` — mirrors the existing fix-action shape exactly, just a different target value.
  - [ ] Success: a task file with partial completion and design frontmatter still `not_started` produces this finding; `cf check --fix` flips the frontmatter to `in-progress`.

- [ ] **14. Test: both new not-started-boundary rule branches** — Effort: 2/5
  - [ ] Add fixture-based tests for `ruleTaskVsPlan`: in-progress tasks + unchecked plan entry → warning fires, not fixable. Confirm the two pre-existing branches (complete-unchecked, checked-incomplete) still fire correctly and are unaffected by the new branch (regression).
  - [ ] Add fixture-based tests for `ruleFrontmatterVsComputed`: in-progress tasks + `not_started` frontmatter → warning fires, `--fix` flips frontmatter to `in-progress`; confirm existing complete-boundary branches unaffected.
  - [ ] Success: all four rule-branch scenarios (two existing + two new) pass in isolation and together; `cf check` / `cf check --fix` integration test (or existing equivalent) confirms end-to-end behavior on a scratch fixture.
  - [ ] **Commit checkpoint:** both consistency-rule branches + tests. `git commit` with message `feat: add not-started-boundary branches to task-vs-plan and frontmatter-vs-computed rules`.

- [ ] **15. Register `codeReview` field in the slice-design frontmatter schema** — TD-3, prerequisite for the gate change. Effort: 1/5
  - [ ] In `packages/core/src/schema/frontmatterSchema.ts`, add an optional field to the `'slice-design'` entry (~lines 77-86): `codeReview: { required: false, values: ['none'] }`. Absent is the default (code review required); the only other accepted value is `'none'`.
  - [ ] Success: a slice-design frontmatter with `codeReview: none` produces no "unknown field" finding from `cf check`; a slice-design frontmatter with `codeReview: something-else` produces an invalid-value finding (existing schema-validation behavior for out-of-vocabulary values).

- [ ] **16. Add docs-only branch to `evaluateReviewGate()`** — TD-3, the #57 fix. Effort: 2/5
  - [ ] In `packages/core/src/introspection/reviewGate.ts`, inside `evaluateReviewGate()` (~lines 166-200): after resolving `boundary` and before the `detectDocuments` call, check whether `boundary === 'preAdvance'` and the slice's design frontmatter has `codeReview: 'none'`. If so, return `null` immediately (gate clears) without looking for a review artifact. All other boundaries (`preSlicePlan`, `preTasks`, `preImplementation`) and all slices without the declaration are unaffected.
  - [ ] This requires the function to read the slice-design frontmatter for the `codeReview` field — reuse `parseFrontmatter` + `detectDocuments` (for the `sliceDesign` path) the same way the rest of the function already resolves paths; do not add a second detection mechanism.
  - [ ] Success: `evaluateReviewGate(path, index, 'preAdvance', config)` returns `null` for a slice whose design declares `codeReview: none`, regardless of whether a code review artifact exists; unchanged behavior for every other case.

- [ ] **17. Test: docs-only gate skip + verify against slice 243** — Effort: 2/5
  - [ ] Add a unit test for `evaluateReviewGate()`: `codeReview: none` + `preAdvance` boundary + no review artifact present → returns `null` (clears), not `pending-review`. Confirm `preSlicePlan`/`preTasks`/`preImplementation` boundaries are unaffected by the same declaration (still evaluate normally).
  - [ ] Add a regression test confirming a slice **without** the declaration, missing a code review, still returns the `pending-review` `GateEvaluation` at `preAdvance` (default unchanged).
  - [ ] As a real-world check (not just a fixture), read `project-documents/user/slices/243-slice.*.md` frontmatter and confirm whether it is a plausible docs-only candidate per its actual content; if the PM confirms it should carry the declaration, that is a documentation follow-up outside this task file (do not modify slice 243 itself as part of this task — flag it in the final task instead).
  - [ ] Success: new tests pass; `evaluateReviewGate` test suite fully green including 242's existing test coverage (regression-free per the design's dependency on 242).
  - [ ] **Commit checkpoint:** schema field + gate branch + tests. `git commit` with message `feat: add codeReview:none declaration, skip pre-advance gate for docs-only slices`.

- [ ] **18. Full-suite verification and walkthrough refresh** — Final task. Effort: 2/5
  - [ ] Run the complete test suite (`pnpm -r test` or project equivalent). Confirm the only failures are the previously-known pre-existing ones (3 core `FileProjectStore`, 4 cli `list.test.ts`) — any other failure must be investigated and fixed before this task is marked done.
  - [ ] Run `pnpm -r build` and confirm a clean build across all packages.
  - [ ] Manually execute the design's Verification Walkthrough steps 1-6 (reproduce #56 fixed via `cf list slices`/`cf status`/`cf next` against real slice 242 state; partial-completion display; `cf check`/`--fix` on a scratch fixture; docs-only gate against slice 243 if applicable per Task 17's finding, else a scratch fixture; gate-ordering preserved; MCP `workflow_status` parity) and record actual command output in the slice design's Verification Walkthrough section, replacing the draft.
  - [ ] Flag to the Project Manager: whether slice 243 should retroactively receive the `codeReview: none` declaration (per Task 17's finding), and whether issue #57 should be updated/closed with the declarative-over-diff rationale per the design's TD-3 note.
  - [ ] Success: full suite green (modulo known failures), build clean, walkthrough output captured in the design doc, PM notified of the two follow-up flags. Update this task file's frontmatter `status: complete` and the slice design's `status: complete`.
  - [ ] **Final commit:** `git commit` with message `docs: capture verification walkthrough output for slice 911`.
