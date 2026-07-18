---
docType: review
layer: project
reviewType: code
slice: frontmatter-parser-nesting-fix
project: context-forge
verdict: CONCERNS
sourceDocument: project-documents/user/slices/917-slice.frontmatter-parser-nesting-fix.md
aiModel: moonshotai/kimi-k2.7-code
status: complete
dateCreated: 20260718
dateUpdated: 20260718
findings:
  - id: F001
    severity: concern
    category: parsing
    summary: "Hand-rolled YAML frontmatter parser is fragile and error-prone"
    location: packages/core/src/introspection/parsers/frontmatterParser.ts#parseFrontmatter
  - id: F002
    severity: concern
    category: correctness
    summary: "Tab-indented nested content treated as top-level"
    location: packages/core/src/introspection/parsers/frontmatterParser.ts#parseFrontmatter
  - id: F003
    severity: concern
    category: typing
    summary: "REVIEW_TYPE_PHASE map has overly broad typing"
    location: packages/core/src/introspection/WorkflowNavigator.ts#REVIEW_TYPE_PHASE
  - id: F004
    severity: concern
    category: maintainability
    summary: "Review-phase lookup is duplicated in two branches"
    location: packages/core/src/introspection/WorkflowNavigator.ts#getNext
  - id: F005
    severity: pass
    category: testing
    summary: "Unit tests cover new regression scenarios"
    location: packages/core/tests/introspection/frontmatterParser.test.ts:72
  - id: F006
    severity: pass
    category: conventions
    summary: "Phase constants centralized instead of scattered literals"
    location: packages/core/src/schema/projectSchema.ts:35-42
  - id: F007
    severity: pass
    category: testing
    summary: "Review-gate regression test added for nested collision fixture"
    location: packages/core/tests/introspection/ConsistencyChecker.reviewGate.test.ts:170
---

# Review: code — slice 917

**Verdict:** CONCERNS
**Model:** moonshotai/kimi-k2.7-code

## Findings

### [CONCERN] Hand-rolled YAML frontmatter parser is fragile and error-prone

Description: The parser is built with `split('\n')`, `indexOf(':')`, and regex rather than a real YAML parser. The new indentation-aware logic only partially handles nested YAML constructs (block scalars, folded scalars) while still mishandling plain multi-line scalars, flow objects, quoted keys with colons, and other valid frontmatter. This conflicts with the project guideline to avoid cheap hacks/anti-patterns and to handle common YAML format variations leniently.

### [CONCERN] Tab-indented nested content treated as top-level

Description: The new indentation check only recognizes a leading space as indentation, so a tab-indented line exits the nested block and is parsed as a top-level key. YAML permits tab indentation, and the project convention forbids silent fallback values; such input will silently corrupt parsed values instead of failing or being handled correctly.

### [CONCERN] REVIEW_TYPE_PHASE map has overly broad typing

Description: The static map is typed as `Record<string, string>`, which hides the valid domain keys (`slice`, `tasks`, `code`) and produces no compile-time error for an invalid or unhandled `reviewType`. Per the TypeScript rules in this project, prefer an `as const` object or a union-typed map so that unhandled cases are caught by the compiler.

### [CONCERN] Review-phase lookup is duplicated in two branches

Description: The conditional lookup of `reviewPhase` is repeated almost verbatim inside both the `pending-review` and `review-failed` branches. Extract a small helper or compute the value once before the branches to follow DRY and reduce the chance of the two cases diverging.

### [PASS] Unit tests cover new regression scenarios

Description: New tests verify that nested `findings[].verdict` does not clobber the top-level `verdict` and that colon-bearing lines inside folded block scalars are skipped. Additional `WorkflowNavigator` tests exercise phase attachment for `slice`, `tasks`, and `code` review types.

### [PASS] Phase constants centralized instead of scattered literals

Description: New `SLICE_DESIGN_PHASE`, `TASK_BREAKDOWN_PHASE`, and `IMPLEMENTATION_PHASE` constants export canonical phase strings from `projectSchema.ts`, aligning with the rule to define comparison values in exactly one place.

### [PASS] Review-gate regression test added for nested collision fixture

Description: The new fixture-406 test directly validates the nested-verdict collision bug, matching the test-with pattern by adding the regression case alongside the implementation change.
