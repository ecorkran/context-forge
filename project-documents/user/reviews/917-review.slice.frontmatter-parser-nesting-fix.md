---
docType: review
layer: project
reviewType: slice
slice: frontmatter-parser-nesting-fix
project: context-forge
verdict: CONCERNS
sourceDocument: project-documents/user/slices/917-slice.frontmatter-parser-nesting-fix.md
aiModel: z-ai/glm-5.1
status: complete
dateCreated: 20260715
dateUpdated: 20260715
findings:
  - id: F001
    severity: concern
    category: scope
    summary: "Slice bundles unrelated fixes, violating \"slice by theme\" architectural principle"
    location: 917-slice.frontmatter-parser-nesting-fix.md#Scope
  - id: F002
    severity: concern
    category: error-handling
    summary: "Failure modes not enumerated for verification harness I/O paths"
    location: 917-slice.frontmatter-parser-nesting-fix.md#TD-3
  - id: F003
    severity: note
    category: robustness
    summary: "Indentation-based parsing has unaddressed tab-vs-space edge case"
    location: 917-slice.frontmatter-parser-nesting-fix.md#TD-2
  - id: F004
    severity: pass
    category: testing
    summary: "Test coverage aligns with \"no behavior changes without tests\" principle"
    location: 917-slice.frontmatter-parser-nesting-fix.md#Success-Criteria
  - id: F005
    severity: pass
    category: dependencies
    summary: "Contract preservation and dependency direction are correct"
    location: 917-slice.frontmatter-parser-nesting-fix.md#TD-4
---

# Review: slice — slice 917

**Verdict:** CONCERNS
**Model:** z-ai/glm-5.1

## Findings

### [CONCERN] Slice bundles unrelated fixes, violating "slice by theme" architectural principle

The architecture document states: *"Slice by theme, not by urgency. Group related maintenance items into themed slices rather than creating one slice per fix."* This slice explicitly bundles two fixes that "share no code and are unrelated in mechanism," justified only by being "small enough individually, and close enough in time/context, to ship as one slice rather than two." That is slicing by urgency and convenience — the exact anti-pattern the principle warns against. Each fix (#64 parser nesting, #66 stale-phase-on-review-gate) has its own Technical Decision, its own Success Criteria, and its own distinct codepaths. Splitting them into two themed slices would align with the architecture and preserve independent reviewability.

### [CONCERN] Failure modes not enumerated for verification harness I/O paths

TD-3 introduces a new I/O path: filesystem traversal and read across multiple external project roots. The design does not enumerate failure modes for this path. What happens when: a project root doesn't exist or is unmounted? A `.md` file is unreadable (permissions, encoding, symlink breakage)? A file is too large to parse? A project root contains tens of thousands of `.md` files causing the harness to hang or OOM? The design says neither parser "is designed never to throw" but does not specify the harness's explicit handling strategy for I/O failures — only that the count of files "where either parser throws (should be zero)" is reported. An explicit strategy for each failure mode (skip-and-log, abort, retry) should be stated rather than left implicit.

### [NOTE] Indentation-based parsing has unaddressed tab-vs-space edge case

TD-2 defines top-level keys as lines with "zero leading whitespace" on the untrimmed line. The design does not specify whether tab characters count as whitespace for this purpose. If a file mixes tabs and spaces for indentation (common in editor handoffs), a tab-indented nested line could be misclassified as top-level, or a tab-indented block could fail to be recognized as nested. The corpus survey (TD-3) may surface this, but the design should state the assumed convention (e.g., "only spaces count as indentation; tab-indented content is treated as top-level") so the edge case is explicit rather than accidental.

### [PASS] Test coverage aligns with "no behavior changes without tests" principle

The architecture mandates *"No behavior changes without tests."* This slice satisfies that principle thoroughly: Success Criteria 5 mandates new unit tests for nested shapes, SC 4 requires a corpus-diff run, SC 6 requires full suite pass, and SC 10 mandates new unit tests for the `#66` fix covering both stale and correct-phase scenarios. The differential-verification harness (TD-3) goes further by providing a before/after regression proof across real-world data. This is a strong alignment with the architectural principle.

### [PASS] Contract preservation and dependency direction are correct

TD-1 and TD-4 explicitly preserve the `FrontmatterData = { [key: string]: string }` contract, enumerate all five consumers, and confirm none require changes. No new runtime dependency is introduced. The `enrich()` function is consumed unchanged — only its input gains a populated `phase` field, which is additive and backward-compatible. Dependency direction remains consumers → parser (unchanged). This is well-reasoned and aligned with minimizing blast radius for a maintenance slice.
