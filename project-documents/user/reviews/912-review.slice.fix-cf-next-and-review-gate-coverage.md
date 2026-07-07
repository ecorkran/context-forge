---
docType: review
layer: project
reviewType: slice
slice: fix-cf-next-and-review-gate-coverage
project: squadron
verdict: PASS
sourceDocument: project-documents/user/slices/912-slice.fix-cf-next-and-review-gate-coverage.md
aiModel: claude-fable-5
status: complete
dateCreated: 20260706
dateUpdated: 20260707
findings:
  - id: F001
    severity: pass
    category: alignment
    summary: "Slice fits the maintenance initiative's scope and principles"
    location: project-documents/user/slices/912-slice.fix-cf-next-and-review-gate-coverage.md#overview
  - id: F002
    severity: pass
    category: alignment
    summary: "Plan-entry design obligation discharged and verified accurate"
    location: project-documents/user/slices/912-slice.fix-cf-next-and-review-gate-coverage.md:27
  - id: F003
    severity: pass
    category: dependencies
    summary: "Dependency directions and integration surface are correct"
    location: project-documents/user/slices/912-slice.fix-cf-next-and-review-gate-coverage.md#td-4--no-config-no-schema-no-new-gate-primitive
  - id: F004
    severity: resolved
    category: error-handling
    summary: "Failure modes for the new `cf check` evaluation paths are not enumerated (resolved: TD-5 added)"
    location: project-documents/user/slices/912-slice.fix-cf-next-and-review-gate-coverage.md#td-5--error-handling-for-the-new-cf-check-evaluation-paths
  - id: F005
    severity: note
    category: scope
    summary: "Active-slice path never re-checks the arch boundary — deliberate, but coverage relies on TD-3"
    location: project-documents/user/slices/912-slice.fix-cf-next-and-review-gate-coverage.md:79
  - id: F006
    severity: note
    category: performance
    summary: "No NFRs to restate; `checkAll()` cost growth is unbounded but unstated"
    location: project-documents/user/slices/912-slice.fix-cf-next-and-review-gate-coverage.md#td-3--59-gap-2-widen-rulereviewgate-to-all-four-boundaries
---

# Review: slice — slice 912

**Verdict:** CONCERNS
**Model:** claude-fable-5

## Findings

### [PASS] Slice fits the maintenance initiative's scope and principles

The architecture (900-arch) mandates "slice by theme, not by urgency" and "clear success criteria — not open-ended clean up." This slice groups three defects sharing one code neighborhood (`WorkflowNavigator.getNext()`, `ConsistencyChecker.ruleReviewGate()`, `evaluateReviewGate()`) into a themed unit with six concrete, testable success criteria and a per-boundary verification walkthrough. The `suggestedCommand` fix and correct review-type wording in findings also fall squarely under the architecture's "developer experience improvements (error messages, CLI help text)" scope item.

### [PASS] Plan-entry design obligation discharged and verified accurate

The slice-plan entry (912) required: "confirm this holds during design" for cutoff inheritance. The design doc confirms it with a specific mechanism claim — `evaluateReviewGate()` applies `gate.effectiveDate` vs `dateCreated` uniformly with no per-boundary branching. I verified this against `reviewGate.ts` (cutoff logic at lines 198–200, boundary-agnostic) — the claim is correct, so "zero additional cutoff plumbing" is a sound design premise, and success criterion 5 plus walkthrough Part D re-verify it empirically.

### [PASS] Dependency directions and integration surface are correct

Callers (`WorkflowNavigator`, `ConsistencyChecker`) depend on the centralized gate primitive (`reviewGate.ts`, from 911/242) and on the schema layer (`projectSchema.ts` constant export) — correct direction, no reverse dependency introduced. Declared dependencies [240, 241, 242, 911] match the slice-plan entry. The finding shape reused by consumers of `cf check`/`workflow_check` is explicitly held stable (severity/fixability/location conventions unchanged, wording-only change), so integration points with existing consumers are preserved. The exported phase constant also directly serves the architecture's "hard-coded values → configuration or constants" scope item, with the optional literal sweep explicitly bounded to prevent scope creep.

### [RESOLVED] Failure modes for the new `cf check` evaluation paths are not enumerated

**Resolution (20260707):** the design now carries **TD-5 — error handling for the new `cf check` evaluation paths**, adopting the existing `safe*` convention: each `evaluateReviewGate()` call is wrapped so a throw on malformed frontmatter surfaces as its own `error`-severity `review-gate` finding for that index rather than aborting `checkAll()`; sibling boundaries and indices continue to evaluate. Success criterion 6 and walkthrough Part E cover it. The original concern text is retained below for the record.

---


TD-3 adds new I/O paths: a per-slice loop over three boundaries and a new aggregate rule `ruleArchReviewGate` that, for every discovered arch index, calls `evaluateReviewGate()` (filesystem reads + frontmatter parsing of review artifacts and gated docs). The design specifies the *existence* guards ("never demand a review of an artifact not yet authored") but says nothing about the *error* path: what happens when `evaluateReviewGate()` throws or a review artifact / arch doc has malformed frontmatter — does one bad arch index abort the whole `checkAll()` run, get silently skipped, or surface as its own finding? Given the project's exception-handling rule (no silent swallowing; explicit failure), the intended strategy should be stated in the design, not left implicit. One sentence per path (e.g., "a throwing boundary evaluation is caught and emitted as an `error`-severity finding for that index; remaining indices still evaluate") would close this.

### [NOTE] Active-slice path never re-checks the arch boundary — deliberate, but coverage relies on TD-3

TD-2's scope boundary means `cf next` still won't surface an unreviewed architecture once an active slice is set; the "arch never reviewed, deep into slice work" case is covered only by `cf check`'s new aggregate rule. This is explicitly reasoned in the doc and is a defensible division (navigator advances the current slice; checker audits project-wide), but it makes success criterion 4 the sole guard for that scenario — worth ensuring the TD-3 fixtures include an active-slice state so the two TDs' coverage boundary is actually tested where they meet.

### [NOTE] No NFRs to restate; `checkAll()` cost growth is unbounded but unstated

The parent architecture (900-arch, riskLevel: low) states no latency/throughput NFRs on these paths, so the slice has nothing to restate — no violation. Observationally: `checkAll()` grows from one gate evaluation per slice to up to three per slice plus one per discovered arch index (each involving file reads). For repositories of this project's size this is negligible, but the design doesn't note the scaling shape; a one-line acknowledgment would make the trade explicit.
