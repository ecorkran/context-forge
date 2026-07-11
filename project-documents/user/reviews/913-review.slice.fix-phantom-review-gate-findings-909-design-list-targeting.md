---
docType: review
layer: project
reviewType: slice
slice: fix-phantom-review-gate-findings-909-design-list-targeting
project: context-forge
verdict: CONCERNS
sourceDocument: project-documents/user/slices/913-slice.fix-phantom-review-gate-findings-909-design-list-targeting.md
aiModel: z-ai/glm-5.1
status: complete
dateCreated: 20260710
dateUpdated: 20260710
findings:
  - id: F001
    severity: concern
    category: architectural-principles
    summary: "Thematic grouping violates \"Slice by theme, not by urgency\" principle"
    location: 913-slice.fix-phantom-review-gate-findings-909-design-list-targeting.md#overview
  - id: F002
    severity: note
    category: test-coverage
    summary: "TD-3 automated test commitment is less explicit than architecture principle and TD-1 precedent require"
    location: 913-slice.fix-phantom-review-gate-findings-909-design-list-targeting.md#td-3
  - id: F003
    severity: pass
    category: scope-alignment
    summary: "Scope alignment with architecture's defined maintenance categories"
    location: 913-slice.fix-phantom-review-gate-findings-909-design-list-targeting.md
  - id: F004
    severity: pass
    category: dependency-direction
    summary: "Dependency direction correctness for TD-1 and TD-3"
    location: 913-slice.fix-phantom-review-gate-findings-909-design-list-targeting.md#data-flows--component-interactions
  - id: F005
    severity: pass
    category: design-honesty
    summary: "TD-2 intentionally minimal, avoids fabricated planning artifacts"
    location: 913-slice.fix-phantom-review-gate-findings-909-design-list-targeting.md#td-2
  - id: F006
    severity: pass
    category: error-handling
    summary: "Error handling for TD-3's new I/O paths is explicitly specified"
    location: 913-slice.fix-phantom-review-gate-findings-909-design-list-targeting.md#td-3
---

# Review: slice — slice 913

**Verdict:** CONCERNS
**Model:** z-ai/glm-5.1

## Findings

### [CONCERN] Thematic grouping violates "Slice by theme, not by urgency" principle

The architecture document states: **"Slice by theme, not by urgency. Group related maintenance items into themed slices rather than creating one slice per fix."** The slice's own Overview section explicitly acknowledges the three defects "share no code path with each other" and were grouped because "all three are small, low-risk, and were discovered in the same dogfooding pass." TD-1 addresses review-gate aggregation correctness, TD-2 addresses a documentation artifact gap, and TD-3 addresses CLI read-only targeting UX — three distinct themes bundled by discovery coincidence (urgency/convenience), not thematic cohesion. While the slice cites precedent from slice 912, the architectural principle is clear and this grouping directly contradicts it. Each fix could stand as its own themed micro-slice or be absorbed into the architecture's anticipated "CLI pattern consistency" slice (TD-3) and a "review-gate correctness" slice (TD-1), with TD-2 as pure documentation.

### [NOTE] TD-3 automated test commitment is less explicit than architecture principle and TD-1 precedent require

The architecture principle states: **"No behavior changes without tests. Refactoring slices must have test coverage verifying preserved behavior before and after the change."** TD-3 adds new behavior — a CLI positional argument, a new core helper `resolveSlicePlanPathByIndex`, and mutual-exclusion error handling — yet the document's test commitment is limited to manual CLI commands in the Verification Walkthrough (Part D) and success criteria #5/#6 that describe outcomes ("confirmed by reading project state," "exits with a `UserError`") without specifying *automated* tests. By contrast, TD-1 explicitly commits to a regression fixture with specific assertions ("asserts `checkAll()` produces zero findings attributable to the unindexed plan's synthetic indices"). TD-3 should make a comparable commitment: at minimum, automated tests for `resolveSlicePlanPathByIndex` (found/not-found/error paths) and for the new CLI argument handling (valid index, missing plan, `--all` mutual exclusion).

### [PASS] Scope alignment with architecture's defined maintenance categories

All three fixes fall within the architecture's enumerated scope categories: TD-1 (phantom findings) is a code quality/developer-experience fix; TD-2 (retroactive design) closes a documentation gap (within the architecture's general maintenance mandate); TD-3 (cross-initiative listing) is a developer experience improvement and aligns with the anticipated "CLI pattern consistency" slice. No scope creep beyond what the architecture defines.

### [PASS] Dependency direction correctness for TD-1 and TD-3

TD-1's `indexSource` field flows correctly: `slicePlanParser` (producer) → `SlicePlanEntry` type → `ConsistencyChecker.checkAll()` (consumer). TD-3's new helper `resolveSlicePlanPathByIndex` resides in `packages/core` and is consumed by `packages/cli` actions — core-to-cli dependency direction is correct and consistent with the existing pattern (`discoverAllSlicePlans` lives in core, CLI actions call it).

### [PASS] TD-2 intentionally minimal, avoids fabricated planning artifacts

The decision to omit Technical Decisions / Data Flow / Verification sections for 909's retroactive design is well-reasoned: those sections "describe planning that never happened and would be fabricated." This aligns with the architecture's principle of "intentional" work with "clear success criteria" — the retroactive doc has a clear, honest purpose (artifact trail closure) and explicitly avoids misrepresenting shipped work as planned work. Leaving the review-gate field absent rather than pre-deciding exemption is also architecturally sound: it defers a project-manager decision rather than encoding an architectural default.

### [PASS] Error handling for TD-3's new I/O paths is explicitly specified

TD-3 enumerates concrete failure modes: (1) no plan file matches the given `archIndex` → `UserError` with named index and searched directory; (2) `[archIndex]` combined with `--all` → `UserError` with clear message. For local filesystem glob operations (no network I/O), hang/timeout/peer-disconnect failure modes are not applicable, so the enumerated set is sufficient. The error messaging is explicitly designed to mirror existing conventions (`cf set arch`'s "No file matching index" wording).
