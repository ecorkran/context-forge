---
docType: slice-design
slice: workflow-status-derivation
project: context-forge
parent: project-documents/user/architecture/900-slices.maintenance-and-refactoring.md
dependencies: [241, 242]
interfaces: []
dateCreated: 20260705
dateUpdated: 20260706
status: complete
---

# Slice Design: Fix Slice-Status Derivation for Partial-Completion Slices

## Overview

A slice-plan entry's `status` is derived from one bit: `isChecked ? 'complete' : 'not-started'` ([slicePlanParser.ts:60,77](../../../packages/core/src/introspection/parsers/slicePlanParser.ts)). The parser has no task-file knowledge — correctly, it should stay pure. But every consumer that reads the entry treats that two-state field as if it answered a three-state question, so a slice whose tasks are underway, or even 100% complete but whose plan checkbox is still unchecked, is bucketed identically to a slice nobody has touched.

This surfaced as GitHub issue #56: after slice 242 finished (26/26 tasks), `cf status` correctly reported `complete`, yet `cf next` and `cf list slices` both called it "not started" and recommended advancing *into* it as the next unstarted slice. The logic was never right about the tasks-done-but-unchecked state — but that state used to last minutes (finish tasks, tick the box, same sitting). The review-gate workflow (initiative 240) made it a sanctioned, multi-day state ("tasks done, awaiting sign-off"), turning a latent misread into a visible bug (process journal, 20260706).

This slice fixes the derivation in **one shared helper** and routes every consumer through it, then closes the matching consistency-rule gaps that let the underlying invariants drift unnoticed. It also folds in issue #57 (docs-only slices gated for a code review they can't produce) as a small, related declaration read at the review-gate boundary.

Three units of work:

1. **A shared derivation helper** implementing the agreed precedence lattice, replacing the scattered inline mappings in `slicePlanParser`, `ProjectModelBuilder`, `WorkflowNavigator.getNext()`, `cf list slices`, and `cf list arch`.
2. **The two missing not-started-boundary consistency rules** — task file / plan and task file / design frontmatter — mirroring the existing complete-boundary rules, auto-fixable in the same style.
3. **The docs-only review declaration** (#57): a set-once frontmatter field on the slice design, read by `evaluateReviewGate()` at the pre-advance boundary so a slice that declares itself docs-only is not gated for a code review.

## Value

- **Developer-facing correctness.** `cf next`, `cf status`, `cf list slices`, and `workflow_status` stop contradicting each other. A partially-done or awaiting-sign-off slice reads as in-progress everywhere, not as "not started" in three surfaces and "complete" in a fourth.
- **DRY.** Today the (frontmatter status + task ratio + checkbox) → status mapping exists inline in at least three places with three *different* answers ([ProjectModelBuilder.ts:245-249](../../../packages/core/src/introspection/ProjectModelBuilder.ts) starts from frontmatter and overrides toward completion; [ProjectModelBuilder.ts:421](../../../packages/core/src/introspection/ProjectModelBuilder.ts) and the slice-plan parser use bare checkbox; [arch.ts:105-109](../../../packages/cli/src/commands/arch.ts) uses a fourth checkbox+file variant). This slice defines the mapping once and references it everywhere — the CLAUDE.md "define comparison values once" rule applied to a comparison *policy*.
- **Invariants become enforced, not just documented.** The rules "any task checked ⇒ task file is not `not_started`" and "task file beyond `not_started` ⇒ slice design is not `not_started`" were never policed (existing rules guard only the *complete* boundary). `cf check` will now catch and auto-fix these drifts.
- **Docs-only slices are unblocked** (#57) without weakening the gate for code slices: the default is unchanged (code review required unless the slice declares otherwise).

## Technical Scope

**In scope**

- A single exported helper (`deriveEntryStatus`) in `packages/core/src/introspection` that maps the available on-disk signals to a `NormalizedStatus`, implementing the agreed precedence lattice.
- Routing the five derivation consumers through the helper: `WorkflowNavigator.getNext()` (both `!e.isChecked` sites), `cf list slices`, `cf list arch`, `ProjectModelBuilder` (plan-only and task-entry paths), and MCP `workflow_status` (inherits via `getStatus`, no direct change).
- Two new `ConsistencyChecker` rules (or extensions of the two existing sibling rules) covering the not-started boundary, auto-fixable via the existing `update-checkbox` / `update-frontmatter` fix actions.
- One set-once frontmatter field on the slice design declaring a slice docs-only, read by `evaluateReviewGate()` at the `preAdvance` boundary only (#57), **and registered as an optional field in the `slice-design` frontmatter schema** so 905's unknown-field check does not flag it.
- Unit tests for the helper (every lattice branch), the two new rule branches (fires / auto-fixes / stays silent), and the docs-only gate skip. A `workflow_status` / `cf list slices` regression proving 242's real state now reads in-progress-or-complete-not-"not started".
- Display wording so a derived-complete-but-unchecked entry is distinguishable from a signed-off complete entry (e.g. `● tasks done` vs `✓ complete`), and `getNext` recommendations that say "continue in-progress slice N" vs "advance to slice N" per derived status.

**Out of scope**

- Changing `slicePlanParser` to read task files. The parser stays pure; the entry's `status` field continues to be checkbox-only *as parsed*. Derivation is a separate, explicit step performed by consumers via the helper — never folded back into the parser.
- Writing `pending_review` (or any workflow position) into frontmatter. It is computed, not stored (process journal, 20260705). The review gate remains a lifecycle position evaluated by `evaluateReviewGate()`, orthogonal to the progress status this slice derives.
- Per-entry review-gate evaluation in `cf list` / `workflow_status`. 242 deliberately declined this (TD-3 noise rationale): evaluating the gate for every in-flight slice on every listing would flag a pending review on each one. The gate stays where 242 put it — the pre-advance boundary in `getNext` and the one `review-gate` check rule.
- Git-diff-based docs-only detection. CF is artifact-based; "the slice's diff" is undefined after merge or across multiple slices. #57 is a declaration, not a detection (design decision below).
- NormalizedStatus literal sweep — that is slice 910, separate.

## Dependencies

### Prerequisites

- **Slice 241** — introduced the `STATUS` `as const` object ([types.ts:2-9](../../../packages/core/src/introspection/types.ts)); the helper returns `STATUS.*` values, no bare literals.
- **Slice 242** — extracted `evaluateReviewGate()` into [reviewGate.ts](../../../packages/core/src/introspection/reviewGate.ts). The #57 docs-only unit hooks the declaration into that single evaluator, so all gate consumers (`cf next`/`status`/`check`, `workflow_*`) inherit it with no per-call-site change.

Both are complete and on `main`.

### Interfaces Required

- `parseTaskFile(filePaths) → TaskFileResult` with `inferredStatus` and completed/total counts ([taskFileParser.ts:39](../../../packages/core/src/introspection/parsers/taskFileParser.ts)).
- `detectDocuments(projectPath, sliceIndex, reviewType?) → DocumentDetectionResult` ([documentDetector.ts:46](../../../packages/core/src/introspection/parsers/documentDetector.ts)) — resolves a slice index to its `sliceDesign`, `taskFile[]`, and (with a reviewType) `review` paths.
- `parseFrontmatter(path)` — reads slice-design frontmatter `status` (and, for #57, the new docs-only field).

## Architecture

### Component Structure

**The derivation helper (new).** A pure function, colocated with the other derivation logic in `packages/core/src/introspection` (a `statusDerivation.ts`, or added to an existing derivation module — the task breakdown picks the file):

```
deriveEntryStatus(signals: {
  frontmatterStatus?: NormalizedStatus | undefined;   // slice-design frontmatter, if a design exists
  taskInferredStatus?: NormalizedStatus | undefined;   // from parseTaskFile, if a task file exists
  isChecked: boolean;                                  // the plan checkbox
}): NormalizedStatus
```

It performs **only** the lattice; the *caller* is responsible for the I/O (calling `detectDocuments` / `parseTaskFile` / `parseFrontmatter`) and passing the resolved signals in. This keeps the helper trivially unit-testable (no filesystem) and lets each caller decide how much it wants to resolve (e.g. `cf list slices` already calls `detectDocuments` per entry; the plan-only path in `ProjectModelBuilder` may have no task file at all).

**Precedence lattice** (highest authority first), per the agreed design (process journal, 20260706):

| Priority | Signal | Rule |
|----------|--------|------|
| 1 | `deprecated` in frontmatter | if slice-design frontmatter status is `deprecated`, the entry is `deprecated` (relates to open issue #54). |
| 2 | computed task completion | if a task file exists, its `inferredStatus` (complete / in-progress / not-started) **is** the derived status. Task checkbox == task done is the axiom; this is the finest-grained mechanical signal. |
| 3 | slice-design frontmatter | no task file yet, but a slice design exists → use its frontmatter status (a set-once declaration of where the slice is). |
| 4 | plan checkbox | nothing on disk (no design, no tasks) → fall back to `isChecked ? complete : not-started`. |

The plan checkbox's *only* authority is asserting `complete` (sign-off, policed by the `task-vs-plan` rule); unchecked means **not complete**, never **not started**. So when a higher-priority signal is present, the checkbox is ignored for the not-started/in-progress distinction.

**Consumers routed through the helper:**

- [WorkflowNavigator.ts:186](../../../packages/core/src/introspection/WorkflowNavigator.ts) and [:299](../../../packages/core/src/introspection/WorkflowNavigator.ts) — the two `entries.find((e) => !e.isChecked)` calls become "find the first entry whose *derived* status is not `complete`/`deprecated`." This is the direct #56 fix: 242 (tasks complete, unchecked) is no longer selected as "next unstarted."
- [slice.ts:110-112](../../../packages/cli/src/commands/slice.ts) — the binary `isChecked ? '✓ complete' : '○ not started'` becomes a derived, three-plus-way display. It already calls `detectDocuments` per entry ([slice.ts:66](../../../packages/cli/src/commands/slice.ts)), so it can resolve task/frontmatter signals cheaply.
- [arch.ts:105-109](../../../packages/cli/src/commands/arch.ts) — replace the bespoke checkbox+file three-way with the helper (arch entries have no task files; the helper degrades to frontmatter-or-checkbox naturally).
- [ProjectModelBuilder.ts:245-249](../../../packages/core/src/introspection/ProjectModelBuilder.ts) (task-entry override) and [:421](../../../packages/core/src/introspection/ProjectModelBuilder.ts) (plan-only) — both inline mappings deleted in favor of the helper.
- MCP `workflow_status` ([workflowTools.ts:154-159](../../../packages/mcp-server/src/tools/workflowTools.ts)) — no direct change; it returns `nav.getStatus()`, and `slicePlan.entries[].status` will be helper-derived once the navigator populates it via the helper. **The task breakdown must confirm where `slicePlan.entries` status is set on the `WorkflowStatus` object** so the derivation actually reaches the MCP surface, not only `getNext`'s local `find`.

### Data Flow

```
detectDocuments(path, index)  ──►  { sliceDesign, taskFile[], ... }
        │                                   │
        │ taskFile[] ──► parseTaskFile ──► inferredStatus ─┐
        │ sliceDesign ─► parseFrontmatter ─► status ───────┤
        │ plan entry ──────────────────────► isChecked ────┤
        ▼                                                   ▼
                              deriveEntryStatus(signals) ──► NormalizedStatus
                                                             │
                 ┌───────────────────────┬───────────────────┼───────────────────────┐
             getNext find            list slices          list arch            ProjectModelBuilder
             (skip complete)          display              display              entry.status
```

The review gate sits *downstream and orthogonal*: `getNext` computes `deriveSliceStatus()` (which includes the `pending-review` / `review-failed` gate positions) for the **active** slice at [WorkflowNavigator.ts:73](../../../packages/core/src/introspection/WorkflowNavigator.ts), and the gate branches ([:280-295](../../../packages/core/src/introspection/WorkflowNavigator.ts)) return **before** the complete-advance branch ([:298](../../../packages/core/src/introspection/WorkflowNavigator.ts)). So changing how the *plan entry* progress status is derived cannot bypass a pending review — the gate is a different axis, evaluated first. This is a load-bearing ordering invariant and gets an explicit regression test.

## Technical Decisions

### TD-1 — One helper, signals in, status out (no I/O in the helper)

The helper takes already-resolved signals rather than a project path + index. Rationale: (a) pure and filesystem-free ⇒ exhaustive lattice testing with plain objects; (b) callers differ in what they can cheaply resolve (`cf list slices` already has `detectDocuments` results in hand; the plan-only builder path has neither design nor tasks); (c) it keeps the helper from re-doing I/O a caller already did. The cost is that each caller writes a few lines of resolve-then-derive, but that wiring is explicit and already present in most call sites.

### TD-2 — Precedence: computed task completion outranks frontmatter; `deprecated` outranks everything

Task checkboxes are ground truth (the axiom). Frontmatter status is a hand-maintained mirror — a cache for human readability, validated by `cf check`, never a decision input when the computed source is available (process journal, 20260706). `deprecated`, however, is a *declaration of intent* that checkboxes cannot express (a fully-checked slice can still be deprecated), so it sits above task completion. Order: `deprecated` > task completion > frontmatter (no tasks) > checkbox (nothing on disk).

### TD-2a — Signal *resolution* failure is surfaced, never silently treated as absent

The helper is pure, but routing five consumers through it introduces per-entry I/O at call sites that previously did none (`getNext`'s two finds, `ProjectModelBuilder`'s paths): each must resolve `detectDocuments` / `parseTaskFile` / `parseFrontmatter` for the entry. Two states must not be conflated:

- **Signal absent** — the document does not exist (no task file, no slice design). This is a normal lattice input: the helper falls through to the next-priority signal by design. `undefined` in the `signals` object means exactly this.
- **Signal resolution failed** — the document *exists* but could not be read/parsed (a task file that fails to parse, slice-design frontmatter with a malformed or unrecognized `status`, or `detectDocuments` erroring mid-listing). Treating this as "absent" and falling through is a **silent fallback** — it both misreports status (the precise bug class this slice exists to kill) and violates the CLAUDE.md "never use silent fallback values" rule.

**Rule:** a resolution *failure* is never coerced to `undefined`. Per signal:

- **Task file present but unparseable** → surface an error (the resolving caller propagates it), or — where a single bad entry must not abort a whole listing (`cf list slices`) — render a distinct degraded indicator for that row (e.g. `⚠ unreadable`) rather than `not started`. The choice per call site (propagate vs. degrade-visibly) is a task-breakdown decision, but "fall through to a lower-priority signal" is **not** an option.
- **Slice-design frontmatter `status` present but not a valid `NormalizedStatus`** → this is already a `cf check` finding class (905 schema validation); the helper treats an unrecognized frontmatter status as a resolution failure for that signal, not as absent. It does not silently drop to the checkbox.
- **`detectDocuments` throws** for an entry → surfaced/degraded per the same rule, never swallowed into an absent-signal result.

The task breakdown must include at least one malformed-input test per signal (unparseable task file; invalid frontmatter status) asserting the surfaced-error / degraded-indicator behavior, not a silent status downgrade. The helper's own signature stays `undefined = absent`; the *distinction* between absent and failed is enforced at the resolve step in each caller, which is where the I/O and its errors live.

### TD-3 — #57 is a declaration, not a diff

Docs-only status is a set-once frontmatter field on the slice design (proposed name `codeReview: none`, default absent ⇒ required — **task breakdown finalizes the exact key/value**). It records design-time intent and does not drift as work progresses, so it is legitimate frontmatter (unlike a computed mirror). Git-diff detection is rejected: CF operates on artifacts, and a slice's "diff" is undefined post-merge and across multiple slices. Enforcement is a single branch in `evaluateReviewGate()` at the `preAdvance` boundary: if the slice declares docs-only, the `code` gate returns `null` (clears). Default unchanged. Per PM, the declarative-over-diff rationale is to be recorded on issue #57 when it is closed.

**Schema registration is required, not optional.** Slice 905 made `ConsistencyChecker` flag *unknown* frontmatter fields against the per-`docType` schema in [frontmatterSchema.ts:77-86](../../../packages/core/src/schema/frontmatterSchema.ts). A new field on the slice design that is not registered there will be reported as an unknown field by `cf check`. So this unit must add the docs-only field to the `slice-design` schema entry as an **optional** field (with its allowed values) in the same change — otherwise the fix for #57 introduces a fresh consistency warning. (Note: the `reviewType` vocabulary referenced in the process journal lives in the upstream ai-project-guide review-artifact schema, *not* in CF's `frontmatterSchema.ts`; it is not a CF field and is out of scope here.)

### TD-4 — Missing rules mirror existing siblings exactly

The two new checks extend the not-started boundary that [`ruleTaskVsPlan`](../../../packages/core/src/introspection/ConsistencyChecker.ts) (263-310) and [`ruleFrontmatterVsComputed`](../../../packages/core/src/introspection/ConsistencyChecker.ts) (313-363) leave unguarded:

- **task file / plan (not-started boundary):** task file `inferredStatus` is `in-progress` (any task checked) while the derived-or-frontmatter picture would read `not_started` → `warning`, auto-fixable by the existing `update-checkbox` / `update-frontmatter` actions as appropriate. (The complete side is already covered; this adds the in-progress side.)
- **task file / design frontmatter (not-started boundary):** task file beyond `not_started` while slice-design frontmatter still says `not_started` → `warning`, auto-fix `update-frontmatter` status → `in-progress` (mirrors the existing `in-progress|not-started` + `tasksComplete` → `complete` branch already in `ruleFrontmatterVsComputed`).

Whether these are new `rule` names or additional branches inside the two existing functions is a task-breakdown call; either way they reuse the existing `ConsistencyFinding` shape and fix-action machinery ([types.ts:216-229](../../../packages/core/src/introspection/types.ts)) — no new fix-action types.

### Patterns and Conventions

- Return `STATUS.*` values (241), never bare literals.
- The helper is exported from the introspection index so CLI and MCP can both reach it.
- Findings and fix actions reuse `update-checkbox` / `update-frontmatter`; no new `fixAction.type`.
- Display strings are presentation-only and never fed back into logic (CLAUDE.md: labels are not logical structure). `getNext` branches on the derived `NormalizedStatus`, not on the rendered label.

## Implementation Details

### Migration Plan (refactoring slice)

**What moves:** the inline (signals → status) mappings at `slicePlanParser` (as-consumed, not the parser itself), `ProjectModelBuilder.ts:245-249` and `:421`, `arch.ts:105-109`, and the two `!e.isChecked` finds in `WorkflowNavigator`. **Destination:** the single `deriveEntryStatus` helper.

**Consumers updated within this slice** (the working-state guarantee): all five call sites above are switched to the helper in the same slice. No call site is left computing status inline. Because `workflow_status` and `cf status` read through `WorkflowNavigator`/`ProjectModelBuilder`, updating those two updates the MCP and status surfaces transitively — the task breakdown verifies the entry-status write path reaches `WorkflowStatus.slicePlan.entries`.

**Behavior verification:** the existing introspection/navigator/consistency test suites are the regression guard for "nothing else changed." The one *intended* behavior change — partial/complete-unchecked slices no longer read `not-started` — is pinned by new tests keyed to slice 242's real on-disk state and asserted against `cf list slices` / `getNext` / `workflow_status`.

### API / Declaration (for #57)

- New slice-design frontmatter field (key TBD in task breakdown) declaring docs-only; absent/false ⇒ code review required (unchanged default).
- `evaluateReviewGate()` gains one branch at `preAdvance`: declared docs-only ⇒ return `null` (gate clears). All other boundaries and slices unaffected.

## Integration Points

### Provides to Other Slices

- `deriveEntryStatus` becomes the canonical status-derivation entry point; any future consumer (a new command, a report) calls it instead of re-deriving.

### Consumes from Other Slices

- 241's `STATUS` const; 242's `evaluateReviewGate()` / `reviewGate.ts`.

## Success Criteria

### Functional Requirements

- A slice with all tasks complete but an unchecked plan entry (slice 242's real state) reads **complete** (or an explicit "tasks done, unchecked" variant) in `cf status`, `cf list slices`, `cf next`, and `workflow_status` — never "not started."
- A slice with some tasks done reads **in-progress** in all four surfaces.
- `cf next` recommends "continue" for an in-progress derived slice and "advance to" only for a genuinely not-started next slice; it never recommends advancing *into* a slice whose tasks are already done.
- A never-touched slice (no design, no tasks, unchecked) still reads **not-started**.
- A `deprecated`-frontmatter slice reads **deprecated** regardless of checkbox/task state.
- `cf check` flags (and `--fix` corrects) a task file with partial completion whose plan entry / design frontmatter still says not-started.
- A slice declaring itself docs-only is not blocked at the pre-advance gate for a missing `code` review; a normal slice still is (default unchanged).
- The review gate still fires before the complete-advance branch — a pending/failed review is never bypassed by the derivation change.
- A signal that fails to resolve (task file present but unparseable, frontmatter `status` invalid, `detectDocuments` error) is surfaced or shown as a distinct degraded indicator — **never** silently downgraded to `not-started` by falling through the lattice (TD-2a).

### Technical Requirements

- Exactly one implementation of the (signals → status) lattice; the previously-inline sites reference it.
- Helper returns `STATUS.*`; no new bare status literals introduced.
- Full existing test suite passes except the known pre-existing failures (3 core `FileProjectStore`, 4 cli `list.test.ts`).
- New unit tests: every lattice branch; both new rule branches (fires / auto-fixes / silent); docs-only gate skip; the gate-ordering regression; **at least one malformed-input test per signal** (unparseable task file, invalid frontmatter `status`) asserting surfaced-error / degraded-indicator, not silent fallthrough (TD-2a).

### Verification Walkthrough

**Caveats found during implementation, read before following the steps below:**

- **Slice 242's plan checkbox is now checked.** At design time, 242's entry in `240-slices.review-aware-workflow-gating.md` was unchecked (the exact #56 bug state). By the time this slice was implemented, that checkbox had already been manually corrected (ticked) — presumably by someone who noticed the misreport before this fix shipped. So step 1 no longer reproduces the original bug live: 242 reads correctly today regardless of this fix, because the checkbox itself now agrees with reality. **The #56 fix is verified instead by dedicated regression tests** that reconstruct 242's exact original state (task file 100% complete, plan checkbox unchecked) via scratch fixtures: `WorkflowNavigator.test.ts`'s `"#56 regression: tasks 100% complete, plan checkbox unchecked → not selected as next-unstarted"` and the MCP-parity test in the same file, plus `ProjectModelBuilder.test.ts`'s `"deriveEntryStatus parity"` block. All pass, confirming `getNext()`/`cf list slices`/`workflow_status` no longer select or display such a slice as "not started."
- **Slice 243 does not exist.** It's an unchecked line item in `240-slices.review-aware-workflow-gating.md` ("(243) Documentation and README Updates") with no slice-design or task file ever written. Step 4 (docs-only gate) is instead verified against a purpose-built fixture (`405-slice.gate-docs-only.md` / `405-tasks.gate-docs-only.md` in the introspection test fixtures) with `codeReview: none`, exercised by `reviewGate.test.ts`'s `"docs-only declaration (#57, slice 911)"` block. **Flag for the PM:** when slice 243 is eventually designed, its plan description is plausibly docs-only — consider adding `codeReview: none` to its frontmatter at that time.
- Live commands below were run against this repo's actual `context-forge` project (active plan `900-slices.maintenance-and-refactoring`, active slice 911) rather than switching the project's live config to point at the 240-initiative, to avoid mutating checked-in project state for a read-only check.

1. **Reproduce #56 is fixed.** Verified via the regression tests noted above (not live 242, per the caveat). Live commands on this repo confirm the derivation is wired up correctly end-to-end:
   ```
   $ cf list slices
   Slice Plan: 900-slices.maintenance-and-refactoring
     #    Slice                                                      Status         File
     901  MCP Tool Surface Cleanup                                   ✓ complete     —
     ...
     911  Fix Slice-Status Derivation for Partial-Completion Slices  ◐ in progress  911-slice....md ← active
   ```
   911 (this slice, mid-implementation, plan checkbox unchecked) correctly renders `◐ in progress`, not `○ not started` — the derivation is live.
   ```
   $ cf next
   Next:      Continue implementation — 7 tasks remaining
   Slice:     911-slice.fix-slice-status-derivation-for-partial-completion-slices
   Rationale: Slice 911 is in progress with 7 tasks left to complete.
   ```
   Confirms the wording fix: "Continue implementation," never "Advance to."

2. **Partial completion reads in-progress.** Confirmed live by the same `cf list slices`/`cf next` output above (911 itself is a real partial-completion slice: 79/86 tasks at time of this check) and by `statusDerivation.test.ts`'s full lattice coverage.

3. **Consistency rules catch the drift.** Confirmed live:
   ```
   $ cf check --slice 911
   Consistency Check: context-forge
     Project-level
     ⚠ Tasks in progress (79/86) but slice 911 is unchecked in plan
       → No single auto-fix for in-progress — leave the slice plan entry for (911) unchecked until tasks complete
     1 finding: 1 warning
   ```
   This is Task 12's new `ruleTaskVsPlan` in-progress branch firing on real, unstaged project data — not a scratch fixture. The `--fix` / frontmatter-drift path is covered by `ConsistencyChecker.test.ts`'s new Rule 1/Rule 2 tests (scratch-fixture, since reproducing a *frontmatter* drift live would require editing a real slice-design file).

4. **Docs-only gate (#57).** Verified via `reviewGate.test.ts`'s docs-only test block (see caveat above re: slice 243 not existing) — `codeReview: none` clears the pre-advance gate with zero review artifact present; a slice without the declaration still gates normally (regression-tested).

5. **Gate ordering preserved.** Verified via `WorkflowNavigator.test.ts`'s `"gate-ordering regression"` test (a complete-but-unreviewed scratch fixture, gating enabled, confirms `getNext()` still routes to review rather than "advance to next slice") and live: `cf check` on this repo shows numerous `pending-review` findings for slices with completed tasks but no code review artifact, confirming the gate still fires under real gating-enabled conditions.

6. **MCP parity.** Confirmed via `WorkflowNavigator.test.ts`'s dedicated MCP-parity test (`getStatus().slicePlan.entries` shows the same derived statuses `getNext()` uses to select the next slice, using the 242-shaped scratch fixture) — this was also the mechanism that surfaced and fixed the gap where `workflow_status` had been returning the raw checkbox-only status even after `getNext`/`cf list slices` were fixed (see the Task 10/11 commit).

All commands referenced here (`cf list slices`, `cf status`, `cf next`, `cf check [--fix]`, `cf set slice`, `workflow_status`) exist and were exercised, either live against this repo or via the test suite as noted per step.

## Risk Assessment

### Technical Risks

- **Shared-logic blast radius.** The helper is read by `getNext`, two `cf list` commands, `ProjectModelBuilder`, and (transitively) `workflow_status` / `cf status`. A wrong lattice ordering skews every status surface at once.

### Mitigation

- Helper is pure and exhaustively unit-tested per branch before any call site is switched.
- Call sites migrated one at a time, existing suites run between; the intended behavior change is pinned to 242's real state so a regression in the "don't over-report complete" direction is caught immediately.
- The gate-ordering invariant gets a dedicated regression test (a complete-but-unreviewed slice must still route to review).

## Implementation Notes

### Development Approach

Suggested order:

1. Write `deriveEntryStatus` + exhaustive unit tests (pure, no call sites touched yet).
2. Switch `WorkflowNavigator.getNext()` both find-sites; run navigator suite; add the #56 regression (242 not selected as next-unstarted) and the gate-ordering regression.
3. Switch `cf list slices`, `cf list arch`, `ProjectModelBuilder` (both paths); confirm `workflow_status` inherits; add the MCP-parity test.
4. Add the two not-started-boundary consistency rules/branches + tests + auto-fix tests.
5. Add the #57 docs-only frontmatter field + the `evaluateReviewGate()` pre-advance branch + tests; verify against slice 243.
6. Refresh the verification walkthrough with actual command output captured after implementation.

### Special Considerations

- **Display vs. logic separation** is non-negotiable here: the "tasks done, unchecked" vs "signed-off complete" distinction is a *rendering* choice; `getNext` and the rules branch on the `NormalizedStatus`, never on the label.
- **Finalize two names in task breakdown:** the docs-only frontmatter key/value and whether the two new rules are new `rule` ids or branches inside the existing two rule functions.
- **Accepted per-entry cost.** `cf next`, `cf list slices`, and `workflow_status` move from a checkbox scan to per-entry document detection plus task-file/frontmatter parsing across the whole plan. The parent architecture states no NFRs; this is an accepted cost at current project sizes (tens of slices), documented here as the baseline for any future large-plan regression. Note `cf list slices` already pays the `detectDocuments`-per-entry cost today ([slice.ts:66](../../../packages/cli/src/commands/slice.ts)); the added cost there is the task/frontmatter parse, not a new directory walk.
