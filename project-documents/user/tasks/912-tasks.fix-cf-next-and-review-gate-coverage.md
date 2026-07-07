---
docType: tasks
slice: fix-cf-next-and-review-gate-coverage
project: context-forge
parent: project-documents/user/slices/912-slice.fix-cf-next-and-review-gate-coverage.md
lldReference: project-documents/user/slices/912-slice.fix-cf-next-and-review-gate-coverage.md
dependencies: [240, 241, 242, 911]
projectState: >
  Slice 912 design (Phase 4) complete and reviewed (PASS, F004 resolved via TD-5).
  911 merged to main: evaluateReviewGate() with the boundary-agnostic effective-date
  cutoff and codeReview:none docs-only declaration are in place. This slice only
  rewires callers of that primitive and corrects one suggestedCommand — no new
  gate primitive, config key, or frontmatter field.
dateCreated: 20260707
dateUpdated: 20260707
status: not_started
---

# Tasks: Fix cf next Stale-Phase Remediation and Review-Gate Coverage Gaps

## Context Summary

Three localized defects in the shared workflow-navigation / consistency layer, all
routing through the existing `evaluateReviewGate()` primitive (slice 911):

- **#58** — `WorkflowNavigator.getNext()` no-active-slice branch prints `cf set arch <index>`
  even when `arch` is already set (a no-op); should advance `phase` instead (TD-1).
- **#59 Gap 1** — the arch (`preSlicePlan`) gate in `getNext()` is orphaned once a slice
  plan exists; drop the `slicePlan === null` clause (TD-2).
- **#59 Gap 2** — `ConsistencyChecker.ruleReviewGate()` only checks `preAdvance`; widen to
  all four boundaries, adding a per-arch-index aggregate rule (TD-3), with error isolation
  so one malformed document doesn't abort the whole audit (TD-5).

Key files:
- `packages/core/src/introspection/WorkflowNavigator.ts` (TD-1, TD-2)
- `packages/core/src/schema/projectSchema.ts` (TD-1 constant export)
- `packages/core/src/introspection/ConsistencyChecker.ts` (TD-3, TD-5)
- `packages/core/src/introspection/reviewGate.ts` — **read only**, not modified (TD-4)

Grounding facts (verified against source):
- `detectDocuments(projectPath, index)` returns `{ sliceDesign, taskFile, architecture, slicePlan, review }`
  — the per-boundary existence guards key off `architecture`/`sliceDesign`/`taskFile` being non-null.
- `ConsistencyFinding` = `{ rule, severity, location, description, suggestedFix, fixable }`.
- The canonical phase strings live in `projectSchema.ts` (`PHASE_STRINGS`, module-private today;
  `PHASE_MAP` is exported). `'Phase 2: Architecture'` appears as a bare literal at 4 sites in
  `WorkflowNavigator.ts` — the new code must reference a constant, not add a 5th literal.

Test suites run via `pnpm --filter @context-forge/core test <file>`; full build via `pnpm -r build`.

---

## TD-1 — #58: Correct the stale-phase remediation command

- [x] **Task 1.1 — Export a canonical architecture-phase constant from `projectSchema.ts`**
  - In `packages/core/src/schema/projectSchema.ts`, export a named constant for the
    architecture phase string (e.g. `export const ARCHITECTURE_PHASE = 'Phase 2: Architecture'`),
    derived from / consistent with the existing `PHASE_STRINGS` tuple so it stays the single
    source of truth. Do not duplicate the literal — reference the tuple entry if practical.
  - Success: the constant is exported and importable from `@context-forge/core`; `PHASE_MAP`
    and `PHASE_STRINGS` still resolve `'Phase 2: Architecture'` byte-identically (no behavior change).
  - Effort: 1/5

- [x] **Task 1.2 — Make the no-active-slice `suggestedCommand` conditional (TD-1)**
  - In `WorkflowNavigator.ts`, the no-active-slice branch at `if (!archFileExists && !status.slicePlan)`
    (~line 158): make `suggestedCommand` and the `phase` field branch on the same `project.fileArch`
    predicate the `rationale` already uses.
    - `project.fileArch` set → `suggestedCommand: \`cf set phase '${ARCHITECTURE_PHASE}'\``,
      and set `phase: ARCHITECTURE_PHASE` on the returned `NextAction`.
    - `project.fileArch` absent → keep `suggestedCommand: 'cf set arch <index>'` (unchanged),
      no `phase` field.
  - Import and use the Task 1.1 constant — no bare `'Phase 2: Architecture'` literal in the new code.
  - Success: matches the behavior of the sibling active-slice branch (~line 225-235) which already
    suggests the phase-advance.
  - Effort: 1/5

- [x] **Task 1.3 — Test the #58 fix**
  - In the WorkflowNavigator test file, add cases for the no-active-slice + arch-file-missing state:
    - `fileArch` set, file missing → `suggestedCommand` is `cf set phase 'Phase 2: Architecture'`
      and `NextAction.phase === 'Phase 2: Architecture'`.
    - `fileArch` unset → `suggestedCommand` is `cf set arch <index>` (fallback unchanged).
  - Add an assertion (or a repo-level grep test) proving the new site contains no bare
    `'Phase 2: Architecture'` literal (success criterion 2) — e.g. assert the returned string
    equals the imported constant, not a hardcoded copy.
  - Success: both cases pass; the fallback case proves no regression.
  - Effort: 2/5

- [x] **Commit checkpoint** — after 1.3: `fix: correct cf next stale-phase remediation (#58)`.
  TD-1 is self-contained (constant export + one branch fix + tests).

---

## TD-2 — #59 Gap 1: Un-orphan the arch review gate

- [x] **Task 2.1 — Drop the `slicePlan === null` clause from the arch gate guard (TD-2)**
  - In `WorkflowNavigator.getNext()`, the arch-gate block at
    `if (archFileExists && status.slicePlan === null)` (~line 126): remove `&& status.slicePlan === null`
    so the gate evaluates whenever `archFileExists` is true and an `archIndex` resolves, still
    inside the no-active-slice guard.
  - Do not touch the active-slice path — the design's scope boundary (TD-2) deliberately leaves it
    unchanged; `cf check` (TD-3) covers the deep-in-slice-work arch audit.
  - Success: with a slice plan present but no active slice and no passing arch review, the gate now
    fires; behavior is unchanged when the arch review is present-and-passing or grandfathered
    (gate returns `null`).
  - Effort: 1/5

- [x] **Task 2.2 — Test the un-orphaned arch gate**
  - Add WorkflowNavigator cases using a scratch fixture (mkdtemp, mirroring existing gate tests):
    - arch file present, slice plan present, no active slice, no arch review, gating on →
      `cf next` surfaces the pending arch review ("Review required before creating the slice plan").
    - Same but with a passing arch review artifact → gate clears, arch review not surfaced.
    - Regression: removing the slice plan (plan === null) still surfaces the pending arch review
      (proves the fix didn't narrow the pre-existing case).
  - Success: all three pass; the plan-present case is the one that failed before this slice.
  - Effort: 2/5

- [x] **Commit checkpoint** — after 2.2: `fix: un-orphan the arch review gate in cf next (#59)`.

---

## TD-3 / TD-5 — #59 Gap 2: cf check covers all four boundaries, with error isolation

- [x] **Task 3.1 — Add a shared safe-gate helper (TD-5)**
  - In `ConsistencyChecker.ts`, add a private helper that wraps a single `evaluateReviewGate()`
    call in try/catch: on success it returns the `GateEvaluation | null`; on throw it returns a
    synthetic `error`-severity, non-fixable `review-gate` finding for that index (description names
    the boundary + the parse failure; `location` points at the offending artifact when known).
  - The helper must never let the throw escape — this is what keeps one malformed document from
    aborting `checkAll()`. Follow the existing `safe*` wrapper convention already used for
    `safeDetectDocuments`/`safeParseFrontmatter`.
  - Success: a throwing gate evaluation yields a finding, not an exception; a clearing gate yields
    `null`; a pending/failed gate yields its normal finding.
  - Note: this private helper has no dedicated test task by design — its behavior (including the
    throw→finding path) is verified through its public callers in Tasks 3.3 and 3.5, avoiding
    duplicate coverage. Implement it before those tests so they exercise it directly.
  - Effort: 2/5

- [x] **Task 3.2 — Widen `ruleReviewGate()` to the three slice-keyed boundaries (TD-3)**
  - Change `ruleReviewGate()` to evaluate `preTasks` (`slice`), `preImplementation` (`tasks`),
    and `preAdvance` (`code`) — not just `preAdvance`. Route each call through the Task 3.1 helper.
  - Guard each boundary on the relevant artifact's existence, derived from the `detectDocuments`
    result: `preTasks` only when `sliceDesign` exists, `preImplementation` only when `taskFile`
    exists, `preAdvance` retains its current `planEntry.isChecked` guard. A boundary whose artifact
    doesn't exist yet emits no finding (never demand a review of an unwritten artifact).
  - Fix the `suggestedFix` wording to name the actual review type
    (`Run the ${reviewType} review for slice ${index}`) instead of the hardcoded "code review".
  - Preserve the existing severity/fixability/location conventions (warning=pending, error=failed,
    fixable:false).
  - Success: single-slice `check()` now reports pending/failed slice/tasks/code reviews with correct
    per-type wording, each gated on artifact existence.
  - Effort: 3/5

- [x] **Task 3.3 — Test the widened per-slice rule**
  - Add ConsistencyChecker cases (scratch fixtures):
    - slice-design present, no slice review, gating on → finding names the **slice** review.
    - task file present, no tasks review → finding names the **tasks** review.
    - plan entry checked, no code review → finding names the **code** review (existing behavior, new wording).
    - slice-design absent → no `preTasks` finding (existence guard holds).
  - Success: each boundary produces a correctly-worded finding only when its artifact exists.
  - Effort: 3/5

- [x] **Task 3.4 — Add the `ruleArchReviewGate` aggregate rule (TD-3)**
  - Add a `checkAll()`-only aggregate rule that, for each discovered arch index (reuse
    `discoverArchPlanPairs` / the existing arch discovery), calls the Task 3.1 safe helper with
    `'preSlicePlan'` and emits a finding when the arch review is pending/failed. Guard on the arch
    file existing. Wire it into `checkAll()` alongside `ruleArchStatusVsPlans` (~line 127-133); do
    **not** add it to single-slice `check()` (the arch boundary is not a property of the active slice).
  - Finding uses the same shape; `suggestedFix` names the **arch** review for the arch index.
  - Success: `cf check` (all-slices) reports a pending arch review when an arch file exists without
    a passing arch review; single-slice `check()` is unaffected.
  - Effort: 2/5

- [x] **Task 3.5 — Test the arch aggregate rule + error isolation (TD-5)**
  - Add ConsistencyChecker cases:
    - arch file present, no arch review, gating on → `checkAll()` reports a pending **arch** review.
    - arch review present-and-passing → no finding.
    - **Error isolation:** a slice (or arch) document with malformed review-gate frontmatter →
      an `error`-severity `review-gate` finding for that index, AND findings for other slices still
      present — assert the run did not throw and other results survive (success criterion 6).
  - Success: aggregate rule fires correctly; the malformed-document case degrades to one finding
    without aborting the run.
  - Effort: 3/5

- [x] **Commit checkpoint** — after 3.5: `feat: widen cf check review-gate coverage to all four boundaries (#59)`.
  Covers the safe helper, the widened per-slice rule, the arch aggregate rule, and their tests.

---

## Verification

- [ ] **Task 4.1 — Cutoff-across-all-boundaries integration check**
  - Add a test (or extend an existing gate integration test) proving that with
    `workflow.review_gate_effective_date` set after a slice's/arch's `dateCreated`, none of the four
    boundaries produce a finding for that slice/arch, in both the navigator (`getNext`) and checker
    (`checkAll`) paths (success criterion 5). No new cutoff code — this confirms the inherited
    behavior holds through the new callers.
  - Success: grandfathered slice/arch produce zero review-gate findings across all four boundaries.
  - Effort: 2/5

- [ ] **Task 4.2 — Full build + suite + walkthrough**
  - Run `pnpm -r build` (clean) and the core / cli / mcp-server test suites; confirm only the
    documented pre-existing failures remain (success criterion 7).
  - Execute the design's Verification Walkthrough (Parts A–F) against a scratch fixture or this repo
    (noting live-state caveats as slice 911's walkthrough did), and update the design's walkthrough
    with actual command output.
  - Success: build clean, no new failures, walkthrough parts A–F confirmed.
  - Effort: 2/5

- [ ] **Task 4.3 — Docs: CHANGELOG + DEVLOG**
  - Add user-facing CHANGELOG entries (the #58 remediation fix, the arch-gate coverage, the widened
    `cf check` boundaries + correct wording) and a developer-facing DEVLOG session entry.
  - Note: this is standard project practice, not tied to a specific success criterion (the slice
    design lists no documentation deliverable); included for release hygiene, consistent with 911.
  - Success: both files updated at repo root (not under `project-documents`).
  - Effort: 1/5

- [ ] **Commit checkpoint** — after 4.2/4.3: `docs: slice 912 verification + changelog/devlog`
  (or fold the docs into the final feature commit). Verification and doc updates close the slice.
