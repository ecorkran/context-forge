---
docType: slice-design
slice: fix-cf-next-and-review-gate-coverage
project: context-forge
parent: project-documents/user/architecture/900-slices.maintenance-and-refactoring.md
dependencies: [240, 241, 242, 911]
interfaces: []
dateCreated: 20260706
dateUpdated: 20260707
status: not-started
---

# Slice Design: Fix cf next Stale-Phase Remediation and Review-Gate Coverage Gaps

## Overview

Three defects, all in the shared workflow-navigation and consistency layer, all surfaced while dogfooding slice 911's review-gate work on this repo. They share a code neighborhood (`WorkflowNavigator.getNext()`, `ConsistencyChecker.ruleReviewGate()`, and the shared `evaluateReviewGate()`) and a single reusable gate primitive, so they fold into one slice rather than three.

1. **#58 — `cf next` suggests a no-op remediation.** When `arch` points at an initiative whose architecture file doesn't exist yet (a normal transition between initiatives) and `phase` is stale from the prior initiative, `cf next`'s *rationale* correctly says "create the architecture document," but its `Run:` command prints `cf set arch <index>` — which is already satisfied and does nothing. The correct remediation is to advance `phase` to the step that creates that file.

2. **#59 Gap 1 — the arch (`preSlicePlan`) review gate is orphaned.** In `getNext()`, the arch review gate only evaluates inside the no-active-slice guard *and* only when `status.slicePlan === null`. Once a slice plan exists, the arch-review requirement silently stops being checked forever — even if the architecture was never reviewed. The other three boundaries (`preTasks`, `preImplementation`, `preAdvance`) don't have this problem: they evaluate for the *active slice* regardless of what else exists.

3. **#59 Gap 2 — `cf check` only evaluates one of four boundaries.** `ConsistencyChecker.ruleReviewGate()` hardcodes `'preAdvance'`, so `cf check`/`workflow_check` only ever flags a missing *code* review. A missing `arch`, `slice`, or `tasks` review is never surfaced.

The fixes are small and localized. #58 is a one-line correction to a `suggestedCommand`. #59 Gap 1 lifts the arch-gate evaluation out from under the `slicePlan === null` condition. #59 Gap 2 widens `ruleReviewGate()` to iterate all four boundaries. All three route through machinery that already exists — no new gate primitives, no new config.

**Confirmed at design time (issue #59's stated requirement):** the effective-date grandfather cutoff (`workflow.review_gate_effective_date`, slice 911) is read inside `evaluateReviewGate()` and applied uniformly to every boundary — it keys off `gate.effectiveDate` and the gated artifact's `dateCreated`, with no per-boundary branching ([reviewGate.ts:198-203](../../../packages/core/src/introspection/reviewGate.ts)). Widening `cf check`'s coverage to the other three boundaries therefore needs **zero** additional cutoff plumbing: every boundary that routes through `evaluateReviewGate()` inherits the cutoff for free. This slice adds no cutoff code; it only adds callers, and the cutoff already covers them.

## Value

- `cf next` stops printing a remediation that does nothing, which currently strands a user mid-transition between initiatives (the exact scenario in #58's repro).
- The arch review gate actually holds: a project that created a slice plan without reviewing its architecture now sees the pending arch review in `cf next` instead of it vanishing.
- `cf check` reports the full review picture (arch/slice/tasks/code), not just code — so the review workflow is auditable in one command instead of only catching the last boundary.

## Technical Decisions

### TD-1 — #58: correct the `suggestedCommand`, reference the canonical phase string

The bug is at [WorkflowNavigator.ts:158-166](../../../packages/core/src/introspection/WorkflowNavigator.ts), the no-active-slice branch:

```ts
if (!archFileExists && !status.slicePlan) {
  return {
    recommendation: 'Create architecture document',
    rationale: project.fileArch
      ? `Architecture is set to '${project.fileArch}' but the file does not exist yet. ...`
      : 'No architecture document or slice plan is configured. ...',
    suggestedCommand: 'cf set arch <index>',   // ← wrong when fileArch is already set
    summary: 'Create an architecture document to define project structure',
  };
}
```

The `suggestedCommand` is correct only for the `!project.fileArch` sub-case (nothing is set yet — the user genuinely needs to point `arch` somewhere). When `project.fileArch` **is** set (the #58 case), the arch pointer is already correct and the real fix is to advance the phase. The remedy is to make `suggestedCommand` conditional on the same `project.fileArch` predicate the `rationale` already branches on:

- `project.fileArch` set → `cf set phase 'Phase 2: Architecture'` (advance to the step that creates the file), and set the `phase` field on the returned `NextAction` to `'Phase 2: Architecture'` so downstream enrichment is consistent.
- `project.fileArch` absent → keep `cf set arch <index>` (unchanged).

The sibling active-slice branch at [WorkflowNavigator.ts:225-235](../../../packages/core/src/introspection/WorkflowNavigator.ts) already does exactly this (`suggestedCommand: "cf set phase 'Phase 2: Architecture'"`). This TD makes the no-active-slice branch match it.

**Constant, not literal.** The string `'Phase 2: Architecture'` already appears as a bare literal at four sites in this file. Per the project rule "define comparison values once, reference everywhere," this TD does **not** add a fifth. The canonical phase strings live in [projectSchema.ts:21-30](../../../packages/core/src/schema/projectSchema.ts) (`PHASE_STRINGS`, currently module-private) with an exported `PHASE_MAP`. Decision: export a named `ARCHITECTURE_PHASE` (or the whole `PHASE_STRINGS` tuple typed `as const`) from `projectSchema.ts` and reference it at the new site. Sweeping the four *pre-existing* literals to the constant is optional cleanup within this slice — do it only if it stays a mechanical, low-risk edit guarded by the existing tests; otherwise leave them and note the debt. The new code must not introduce a new literal.

### TD-2 — #59 Gap 1: evaluate the arch gate independently of slice-plan existence

Currently the arch gate is nested under two conditions ([WorkflowNavigator.ts:126](../../../packages/core/src/introspection/WorkflowNavigator.ts)):

```ts
if (archFileExists && status.slicePlan === null) {   // ← the second condition orphans it
  const archIndex = extractSliceIndex(project.fileArch);
  if (archIndex !== null) {
    const gate = await this.evaluateGate(project.projectPath, archIndex, 'preSlicePlan');
    ...
```

The `status.slicePlan === null` clause is the bug: once a plan exists, the block is skipped. But this block sits inside the **no-active-slice guard** (`if (!slice || slice.status === 'no-active-slice')`), so lifting the condition here only widens coverage to "arch exists, no active slice, plan may or may not exist." The reported live failure — "completed Phase 2, ran `cf next`, no pending arch review because a slice plan already existed" — is exactly the *no-active-slice + plan-exists* state, so fixing it here resolves the report.

**Decision:** drop `&& status.slicePlan === null` from the guard at line 126 so the arch gate evaluates whenever `archFileExists` and an `archIndex` resolves, still inside the no-active-slice path. The gate returns `null` (clears) when the arch review is present-and-passing or the arch is grandfathered by the effective-date cutoff, so widening the condition does not introduce false pendings for already-reviewed architectures.

**Scope boundary (deliberate).** Once an *active slice* is set, `getNext()` leaves the no-active-slice guard entirely and follows the slice path, which never re-checks the arch boundary. Extending the arch gate into the active-slice path is **out of scope** for this slice: the active-slice path's job is to advance the current slice, the arch review is a Phase-2/3 concern that precedes any slice work, and re-litigating it on every active slice would be noise. The narrow report is the no-active-slice case; that is what this TD fixes. `cf check` (TD-3) provides the project-wide arch-review audit that does not depend on the active slice, covering the "arch never reviewed, deep into slice work" case at the boundary where it belongs.

### TD-3 — #59 Gap 2: widen `ruleReviewGate()` to all four boundaries

`ConsistencyChecker.ruleReviewGate()` ([ConsistencyChecker.ts:543-578](../../../packages/core/src/introspection/ConsistencyChecker.ts)) hardcodes `'preAdvance'`. Each boundary gates a different artifact for a different index:

| Boundary | Review type | Gated index | Guard: only evaluate when the *predecessor* artifact is done |
|---|---|---|---|
| `preSlicePlan` | `arch` | arch index | arch file exists |
| `preTasks` | `slice` | slice index | slice-design file exists |
| `preImplementation` | `tasks` | slice index | task file exists |
| `preAdvance` | `code` | slice index | plan entry checked (current guard) |

**Decision:** the three slice-keyed boundaries (`preTasks`, `preImplementation`, `preAdvance`) are added to `ruleReviewGate()`, each guarded so it only fires once the relevant slice artifact exists — a boundary should flag a *missing review of an artifact that exists*, never demand a review of an artifact not yet authored. `evaluateReviewGate()` already keys the `slice`/`tasks`/`code` boundaries off the slice index and reads the slice-design frontmatter, so this is a loop over the three boundaries with per-boundary existence guards derived from the `detectDocuments` result the gate already computes.

The `arch` (`preSlicePlan`) boundary keys off an **arch index**, not the slice index, so it does not belong in the per-slice `ruleReviewGate()`. It belongs in `checkAll()`'s aggregate section alongside the existing arch-plan-pair discovery ([ConsistencyChecker.ts:127-133](../../../packages/core/src/introspection/ConsistencyChecker.ts), `discoverArchPlanPairs`). **Decision:** add a small aggregate rule `ruleArchReviewGate` that, for each discovered arch index, calls `evaluateReviewGate(projectPath, archIndex, 'preSlicePlan', config, resolvedGate)` and emits a finding when a review is pending/failed. This mirrors how `ruleArchStatusVsPlans` already runs per arch-plan pair. It runs in `checkAll()` only (project-wide audit), not in single-slice `check()`, because the arch boundary is not a property of the active slice.

**Finding shape.** Reuse the existing finding structure from `ruleReviewGate()` (`rule: 'review-gate'`, `severity: 'warning'` for pending / `'error'` for failed, `fixable: false`). The `suggestedFix` text must name the actual review type (`Run the ${reviewType} review for slice ${index}` / `for architecture ${archIndex}`) rather than the current hardcoded "code review" wording, so a pending `slice` review doesn't tell the user to run a code review. This is the one wording change; the severity/fixability/location conventions are unchanged.

**Cutoff inheritance (the #59 requirement).** No cutoff code is added here. Every new caller routes through `evaluateReviewGate()`, which already applies `gate.effectiveDate` uniformly ([reviewGate.ts:198-203](../../../packages/core/src/introspection/reviewGate.ts)). A slice/arch dated before the cutoff returns `null` from the gate → no finding, at every boundary. This is verified explicitly in the walkthrough.

### TD-4 — no config, no schema, no new gate primitive

This slice adds no config keys, no frontmatter schema fields, and no new functions in `reviewGate.ts`. It rewires existing callers of `evaluateReviewGate()` and corrects one `suggestedCommand`. The single new symbol is the exported phase constant in `projectSchema.ts` (TD-1). Keeping the surface this small is deliberate: the review-gate primitive and the cutoff are already correct and centralized (911); the bugs are entirely in *how the callers invoke them*.

### TD-5 — error handling for the new `cf check` evaluation paths

TD-3 adds new I/O that can throw on malformed frontmatter: a per-slice loop over three boundaries, and the aggregate `ruleArchReviewGate` that calls `evaluateReviewGate()` for every discovered arch index. Today these `checkAll()` loops have **no per-iteration isolation** — an `await` that throws propagates straight out of `check()`/`checkAll()`, so one unparseable review or arch document would abort the entire run and every other slice's findings with it. That is the wrong failure mode for an audit command, and it is what F004 correctly flags as unstated.

**Decision — follow the existing `safe*` convention, do not invent a new one.** `checkSlice()` already reads every artifact through `safeDetectDocuments`/`safeParseTaskFile`/`safeParseFrontmatter` wrappers ([ConsistencyChecker.ts:226-228](../../../packages/core/src/introspection/ConsistencyChecker.ts)): a malformed file degrades *that one signal* and the remaining rules still run. The new review-gate paths adopt the same posture:

- **Per boundary / per arch index, a throwing `evaluateReviewGate()` is caught at the call site and surfaced as its own `error`-severity, non-fixable finding** for that index (`rule: 'review-gate'`, description naming the boundary and the parse failure, `location` pointing at the offending artifact when known). It is not silently swallowed — that would violate the project's exception-handling rule — and it does not abort sibling evaluations.
- **Remaining boundaries and remaining slice/arch indices continue to evaluate.** `checkAll()` is an audit: a single corrupt document must not blind the whole report.

This applies uniformly to the three slice boundaries in `ruleReviewGate()` and to `ruleArchReviewGate()`. Concretely: wrap each `evaluateReviewGate()` call in a try/catch that converts a throw into an error finding (a small shared helper, since both rules need identical treatment) rather than letting it escape. `check()` (single active slice) inherits the same helper, so a malformed active-slice review reports as a finding instead of failing the command. Note this also *tightens* today's behavior: the existing `preAdvance`-only `ruleReviewGate()` currently lets an `evaluateReviewGate()` throw escape uncaught — this TD brings that pre-existing path under the same isolation as the new ones.

## Data Flows & Component Interactions

```
cf next  ──► WorkflowNavigator.getNext()
              ├─ no-active-slice guard
              │    ├─ arch gate (TD-2: now runs regardless of slicePlan presence)
              │    │     └─ evaluateReviewGate(archIndex, 'preSlicePlan') ──► cutoff + verdict
              │    └─ "create architecture" branch (TD-1: suggestedCommand now
              │          phase-advance when fileArch already set)
              └─ active-slice path (unchanged)

cf check / workflow_check ──► ConsistencyChecker
              ├─ checkSlice() ──► ruleReviewGate (TD-3: preTasks/preImplementation/preAdvance,
              │                     each guarded on its artifact's existence)
              │                     └─ evaluateReviewGate(sliceIndex, boundary) ──► cutoff + verdict
              └─ checkAll() aggregate ──► ruleArchReviewGate (TD-3: per arch index, 'preSlicePlan')
                                            └─ evaluateReviewGate(archIndex, 'preSlicePlan') ──► cutoff + verdict
```

Every arrow into `evaluateReviewGate()` inherits the effective-date cutoff and the `codeReview: none` docs-only declaration with no per-caller handling.

## Success Criteria

1. **#58 fixed.** With `arch` set to an index whose file does not exist, `phase` stale (e.g. Phase 6), and no active slice, `cf next` prints `Run: cf set phase 'Phase 2: Architecture'` (not `cf set arch <index>`). With `arch` unset, the fallback still prints `cf set arch <index>`. The `NextAction.phase` field is `'Phase 2: Architecture'` in the former case.
2. **No new phase-string literal.** The #58 fix references an exported constant from `projectSchema.ts`; grep confirms the new site contains no bare `'Phase 2: Architecture'` literal.
3. **#59 Gap 1 fixed.** With an arch file present, no active slice, a slice plan that *does* exist, and no arch review artifact (and the arch not grandfathered), `cf next` surfaces the pending arch review. Removing the plan does not change this. If the arch review exists and passes, `cf next` does not surface it.
4. **#59 Gap 2 fixed.** `cf check`/`workflow_check` on a project with gating enabled reports pending/failed reviews for `arch`, `slice`, `tasks`, and `code` boundaries (each only when the corresponding artifact exists), with the finding's `suggestedFix` naming the correct review type. A boundary whose artifact does not yet exist produces no finding.
5. **Cutoff holds across all boundaries.** With `workflow.review_gate_effective_date` set to a date after a slice's/arch's `dateCreated`, none of the four boundaries produce a finding for that slice/arch in either `cf next` or `cf check`.
6. **Malformed frontmatter is isolated (TD-5).** In `checkAll()`, a slice or arch document whose review-gate frontmatter fails to parse produces its own `error`-severity `review-gate` finding for that index; every other slice and boundary still evaluates and reports normally. The run does not abort.
7. **No regressions.** The full core + cli + mcp-server suites pass (modulo the known pre-existing failures documented in DEVLOG), and `pnpm -r build` is clean.

## Verification Walkthrough

> Draft demo script — to be refined with actual command output at Phase 6 completion. Run from the repo root against a scratch project fixture (or this repo, noting live-state caveats as slice 911's walkthrough did).

**Setup.** A scratch project with `workflow.review_enabled: true` and an arch file `140-arch.demo.md` whose `dateCreated` is *after* any effective-date cutoff used below.

**Part A — #58 (stale-phase remediation).**
```
cf set arch 140          # arch pointer set; file 140-arch.demo.md does NOT exist yet
cf set phase 6           # stale phase from a prior initiative
cf next
#   expect Run: cf set phase 'Phase 2: Architecture'   (NOT cf set arch 140)
cf set arch ""           # or a fixture with fileArch unset
cf next
#   expect Run: cf set arch <index>                    (fallback unchanged)
```

**Part B — #59 Gap 1 (arch gate not orphaned).**
```
# arch file exists, a slice plan exists, no arch-review artifact, no active slice
cf next
#   expect: "Review required before creating the slice plan" surfacing the pending arch review
# add a passing arch review artifact, re-run:
cf next
#   expect: arch review no longer surfaced (gate clears)
```

**Part C — #59 Gap 2 (cf check covers all boundaries).**
```
# slice with a slice-design file but no slice-review artifact, gating on
cf check
#   expect a review-gate finding naming the *slice* review (not "code review")
# repeat with a task file present but no tasks review → finding names the tasks review
# repeat with the plan entry checked but no code review → finding names the code review (existing behavior)
# arch file present, no arch review → cf check (checkAll path) reports a pending arch review
```

**Part D — cutoff is boundary-agnostic.**
```
cf config set workflow.review_gate_effective_date <date-after-the-fixtures'-dateCreated>
cf check
#   expect: zero review-gate findings for the grandfathered slice/arch across ALL four boundaries
cf next
#   expect: no pending arch review for the grandfathered architecture
```

**Part E — malformed frontmatter isolation (TD-5).**
```
# corrupt one slice's review-artifact frontmatter (e.g. an unterminated YAML block)
cf check
#   expect: an error-severity review-gate finding naming that slice/index,
#           AND findings for every other slice still present — the run did not abort
```

**Part F — regression.**
```
pnpm -r build          # clean
# run core + cli + mcp-server test suites; only the documented pre-existing failures remain
```

## Effort

Relative effort: **3/5**. Three localized fixes with clear reproductions; the work is in getting the per-boundary existence guards and the arch-index aggregate rule right, plus test fixtures for each boundary. No new subsystems.
