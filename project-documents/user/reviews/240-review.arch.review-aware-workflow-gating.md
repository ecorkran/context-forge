---
docType: review
layer: project
reviewType: arch
slice: review-aware-workflow-gating
project: squadron
verdict: CONCERNS
sourceDocument: project-documents/user/architecture/240-arch.review-aware-workflow-gating.md
aiModel: z-ai/glm-5.1
status: complete
dateCreated: 20260621
dateUpdated: 20260621
findings:
  - id: F001
    severity: concern
    category: completeness
    summary: "Review artifact path resolution is load-bearing but unspecified"
    location: 240-arch.review-aware-workflow-gating.md#technical-considerations
  - id: F002
    severity: concern
    category: dependencies
    summary: "Frontmatter contract is owned by an external deliverable that doesn't exist yet"
    location: 240-arch.review-aware-workflow-gating.md#related-work
  - id: F003
    severity: concern
    category: completeness
    summary: "Interaction with `workflow.auto_advance` is unaddressed"
    location: 240-arch.review-aware-workflow-gating.md#envisioned-state
  - id: F004
    severity: concern
    category: completeness
    summary: "Malformed frontmatter and file-read failure modes are undefined"
    location: 240-arch.review-aware-workflow-gating.md#technical-considerations
  - id: F005
    severity: concern
    category: completeness
    summary: "Multiple review artifacts per slice is unaddressed"
    location: 240-arch.review-aware-workflow-gating.md#technical-considerations
  - id: F006
    severity: concern
    category: consistency
    summary: "ConsistencyChecker only flags missing artifacts, not failing verdicts"
    location: 240-arch.review-aware-workflow-gating.md#envisioned-state
  - id: F007
    severity: note
    category: antipattern
    summary: "\"Priority 5.5\" insertion suggests the priority system needs rethinking"
    location: 240-arch.review-aware-workflow-gating.md#technical-considerations
  - id: F008
    severity: note
    category: abstraction
    summary: "`criteria` and `provenance` frontmatter fields have no CF consumer"
    location: 240-arch.review-aware-workflow-gating.md#technical-considerations
---

# Review: arch — slice 240

**Verdict:** CONCERNS
**Model:** z-ai/glm-5.1

## Findings

### [CONCERN] Review artifact path resolution is load-bearing but unspecified

The gate's entire function depends on resolving a review artifact path from a slice index, yet the document only offers an illustrative example (`NNN-review.<slug>.md`) without committing to a convention. Critical questions are unanswered: Where does the slug come from — the slice plan, the task file, a new frontmatter field? How does the resolver handle slices that have never been reviewed? How are collisions with existing document types prevented beyond "must be chosen"? The Anticipated Slices section defers this to Slice 1 as "purely definition and documentation," but the path convention is not a documentation task — it is a load-bearing design decision that constrains the gate logic, the ConsistencyChecker integration, and every external tool that must write review artifacts. An architecture document should specify the design; a later slice should implement it.

### [CONCERN] Frontmatter contract is owned by an external deliverable that doesn't exist yet

The document states the `verdict`/`score`/`criteria`/`provenance` schema is "owned cross-project" by Squadron slice 300 and that "The schema must be documented and stable before the gate can be validated; it must not be extended unilaterally by CF." This creates a hard gate on an external team's deliverable. If Squadron's schema differs from what CF assumes (different field names, different verdict values, different types), the gate breaks silently or loudly. The architecture document should either define the contract as CF-authored with Squadron as a consumer, or include a concrete schema specification that Squadron must conform to — not the reverse. As written, CF is building a reader for a writer that hasn't shipped and whose output format CF cannot control.

### [CONCERN] Interaction with `workflow.auto_advance` is unaddressed

When `workflow.auto_advance` is `true` and `workflow.review_required` is configured, the gate fires before the advance recommendation. This means the gate would block auto-advance when a review is absent or failing — but the document never acknowledges this interaction. Teams that auto-advance but also want review gates are the most likely early adopters. If the gate silently overrides auto-advance, that's a behavioral change users need to understand. If auto-advance is supposed to skip the review gate, that contradicts the stated priority ordering. The document must specify which takes precedence and why.

### [CONCERN] Malformed frontmatter and file-read failure modes are undefined

The document says the gate must "gracefully handle a frontmatter that is missing individual fields" but doesn't specify behavior for the harder edge cases: completely malformed YAML, a file that exists but can't be read (permissions, encoding, disk error), or a `verdict` field with an unexpected value (e.g., `"pending"`, `"unknown"`, or a typo like `"fial"`). The default threshold is "anything except `fail`," which means a typo or `pending` would pass — is that the intended behavior? Treating `pending` as a pass is semantically wrong (the review isn't done), but treating it as a fail contradicts the stated default. The document needs an explicit enumeration of recognized verdict values and a defined fallback for unrecognized ones.

### [CONCERN] Multiple review artifacts per slice is unaddressed

The naming convention `NNN-review.<slug>.md` suggests a one-to-one mapping between slice and review artifact, but nothing prevents multiple files matching the pattern (e.g., `001-review.design.md` and `001-review.security.md`). If two review artifacts exist with different verdicts, which is authoritative? The path resolver's behavior must be defined for this case — first match, last match, merge, or error? The gate's determinism guarantee depends on this.

### [CONCERN] ConsistencyChecker only flags missing artifacts, not failing verdicts

The document states the ConsistencyChecker should flag "slices that are complete-in-plan but missing a required review artifact, when gating is configured." But a slice that is complete-in-plan with a review artifact whose verdict is `fail` is equally inconsistent — the quality gate isn't satisfied, yet the slice plan says done. The ConsistencyChecker's scope should include verdict validation, not just artifact presence, to be consistent with the gate's own logic. Flagging only absence creates a false-negative path: a present-but-failing review passes the consistency check but fails the gate.

### [NOTE] "Priority 5.5" insertion suggests the priority system needs rethinking

Inserting a gate at "Priority 5.5" between existing numbered priorities is a code smell. Fractional priorities indicate the numbering scheme doesn't accommodate new entries cleanly and will likely produce more fractions as new rules are added. A named priority system (e.g., `post-task-completion`, `pre-advance`) or renumbering the existing priorities would be more maintainable. This isn't blocking for v1 but will become a readability and maintenance issue as the state machine grows.

### [NOTE] `criteria` and `provenance` frontmatter fields have no CF consumer

The frontmatter schema lists `criteria` and `provenance` fields, but the gate logic only reads `verdict` and optionally `score`. CF parses and stores these fields for no purpose in v1. This is acceptable as forward-compatible schema definition, but the document should explicitly acknowledge that CF is a passive carrier of these fields and state when (if ever) CF plans to consume them. Otherwise they become dead schema that CF must forever preserve for compatibility.
