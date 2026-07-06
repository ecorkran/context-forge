---
docType: review
layer: project
reviewType: slice
slice: workflow-status-derivation
project: squadron
verdict: CONCERNS
sourceDocument: project-documents/user/slices/911-slice.workflow-status-derivation.md
aiModel: claude-fable-5
status: complete
dateCreated: 20260705
dateUpdated: 20260705
findings:
  - id: F001
    severity: pass
    category: alignment
    summary: "Core derivation work aligns squarely with the maintenance architecture"
    location: project-documents/user/slices/911-slice.workflow-status-derivation.md:29-34
  - id: F002
    severity: pass
    category: testing
    summary: "\"No behavior changes without tests\" principle satisfied"
    location: project-documents/user/slices/911-slice.workflow-status-derivation.md:163
  - id: F003
    severity: pass
    category: dependencies
    summary: "Dependency directions and integration points are correct"
    location: project-documents/user/slices/911-slice.workflow-status-derivation.md:55-68
  - id: F004
    severity: concern
    category: scope
    summary: "#57 docs-only declaration is scope creep beyond the planned slice and its theme"
    location: project-documents/user/slices/911-slice.workflow-status-derivation.md:27
  - id: F005
    severity: concern
    category: error-handling
    summary: "No failure modes enumerated for the new per-entry signal-resolution I/O"
    location: project-documents/user/slices/911-slice.workflow-status-derivation.md:84
  - id: F006
    severity: note
    category: consistency
    summary: "Slice-plan entry and design disagree on dependencies"
    location: project-documents/user/slices/911-slice.workflow-status-derivation.md:6
  - id: F007
    severity: note
    category: performance
    summary: "Added per-entry filesystem cost on listing paths is unquantified"
    location: project-documents/user/slices/911-slice.workflow-status-derivation.md:97-103
  - id: F008
    severity: note
    category: under-specification
    summary: "Two naming decisions deferred to task breakdown are acceptably bounded"
    location: project-documents/user/slices/911-slice.workflow-status-derivation.md:276
---

# Review: slice — slice 911

**Verdict:** CONCERNS
**Model:** claude-fable-5

## Findings

### [PASS] Core derivation work aligns squarely with the maintenance architecture

The primary unit (one shared `deriveEntryStatus` helper replacing at least four divergent inline mappings) is a direct instance of the architecture's "Pattern consolidation and code quality improvements" scope item and the project-level "define comparison values once" rule, applied to a comparison policy. The slice-plan entry (900-slices.maintenance-and-refactoring.md:29) describes exactly this fix for issue #56, and the design implements it faithfully, including the `workflow_check` rule additions the plan entry calls for.

### [PASS] "No behavior changes without tests" principle satisfied

The architecture requires refactoring slices to verify preserved behavior with tests. The design handles this well: existing suites guard "nothing else changed," the one *intended* behavior change is pinned to slice 242's real on-disk state, the load-bearing gate-ordering invariant gets a dedicated regression test, and the helper is exhaustively unit-tested per lattice branch before any call site is switched. Known pre-existing failures are explicitly enumerated rather than hand-waved.

### [PASS] Dependency directions and integration points are correct

The helper lives in `packages/core/src/introspection` and is consumed by CLI and MCP — the correct direction (surfaces depend on core, never the reverse). Prerequisites 241 (`STATUS` const) and 242 (`evaluateReviewGate`) are real, verified on disk, and stated complete on `main`. The design also correctly anticipates the interaction with slice 905's unknown-frontmatter-field check (TD-3, schema registration required) — a hidden dependency many designs would miss.

### [CONCERN] #57 docs-only declaration is scope creep beyond the planned slice and its theme

Slice-plan entry 911 (900-slices.maintenance-and-refactoring.md:29) scopes this slice to the #56 derivation fix plus matching consistency rules — it does not mention issue #57. The design folds in a new user-facing frontmatter field, a `frontmatterSchema.ts` registration, and a behavior change to `evaluateReviewGate()`. That is review-gate *feature* work (initiative 240's axis), not status-derivation consolidation, and it strains the architecture's "Slice by theme, not by urgency" principle (900-arch.maintenance-and-refactoring.md:36) — the design itself concedes the gate is "a different axis, evaluated first" (line 121). It also changes gate behavior, which sits uneasily with a maintenance initiative whose scope list (arch lines 21-28) covers consolidation, cleanup, and DX, not new workflow declarations. Either move #57 to its own small slice (or into the 240 family), or update slice-plan entry 911 to explicitly include it so plan and design agree on scope.

### [CONCERN] No failure modes enumerated for the new per-entry signal-resolution I/O

The helper itself is pure, but routing five consumers through it creates new I/O at call sites that don't currently perform it — notably `WorkflowNavigator.getNext()`'s two find-sites and `ProjectModelBuilder`'s paths must now resolve `detectDocuments` / `parseTaskFile` / `parseFrontmatter` per entry. The design specifies the happy path (signals optional, lattice degrades) but never states what happens when resolution *fails* rather than being absent: a task file that exists but fails to parse, slice-design frontmatter with a malformed or unrecognized `status` value, or `detectDocuments` erroring on a single entry mid-listing. If a parse failure is silently treated as "signal undefined," the lattice falls through to a lower-priority signal — a silent fallback that both misreports status (the exact bug class this slice fixes) and violates the project's "never use silent fallback values" rule. The design should state explicitly, per signal: parse failure ⇒ error surfaced (or a distinct degraded indicator), not absent-signal fallthrough — and the task breakdown should test at least one malformed-input case.

### [NOTE] Slice-plan entry and design disagree on dependencies

The design declares `dependencies: [241, 242]` while slice-plan entry 911 says "Dependencies: none." Since both 241 and 242 are complete on `main` this has no practical effect, but the plan entry should be updated so the two artifacts don't contradict each other — this is exactly the class of drift the slice's own new consistency rules exist to police.

### [NOTE] Added per-entry filesystem cost on listing paths is unquantified

The parent architecture states no NFRs, so no target restatement is required. But `cf next`, `cf list slices`, and `workflow_status` move from a checkbox scan to per-entry document detection plus task-file and frontmatter parsing across the whole plan. For current project sizes this is trivial; the design could note it as an accepted cost (and that `cf list slices` already pays it at slice.ts's existing `detectDocuments` call) so a future large-plan regression has a documented baseline.

### [NOTE] Two naming decisions deferred to task breakdown are acceptably bounded

The docs-only frontmatter key/value and the new-rule-vs-new-branch decision are deferred, but both deferrals are explicit, bounded (allowed values and default behavior are already fixed in TD-3), and flagged in "Special Considerations." This is appropriate design-level abstraction, not under-specification.
