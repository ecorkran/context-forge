---
docType: review
layer: project
reviewType: code
slice: sliceplanparser-deprecated-entry-handling
project: context-forge
verdict: CONCERNS
sourceDocument: project-documents/user/slices/918-slice.sliceplanparser-deprecated-entry-handling.md
aiModel: moonshotai/kimi-k2.7-code
status: complete
dateCreated: 20260801
dateUpdated: 20260801
findings:
  - id: F001
    severity: concern
    category: software-design
    summary: "Duplicate checkbox-to-status mapping in slice plan parser"
    location: packages/core/src/introspection/parsers/slicePlanParser.ts:56-65
  - id: F002
    severity: concern
    category: software-design
    summary: "Deprecated marker literal is scattered across regex and parser logic"
    location: packages/core/src/introspection/parsers/slicePlanParser.ts:6
  - id: F003
    severity: pass
    category: testing
    summary: "Tests cover deprecated plan-line behavior across layers"
    location: packages/core/tests/introspection/slicePlanParser.test.ts:33
---

# Review: code — slice 918

**Verdict:** CONCERNS
**Model:** moonshotai/kimi-k2.7-code

## Findings

### [CONCERN] Duplicate checkbox-to-status mapping in slice plan parser

The indexed and unindexed parsing branches both contain nearly identical logic for mapping a checkbox character to `status` and `isChecked`. For example, lines 56–65 and the corresponding unindexed block both repeat the ternary `checkboxChar === '~' ? STATUS.Deprecated : isChecked ? STATUS.Complete : STATUS.NotStarted`. Per the project's DRY rule, this should be extracted into a single helper (e.g., `parseCheckboxStatus(char: string): { status: Status; isChecked: boolean }`).

### [CONCERN] Deprecated marker literal is scattered across regex and parser logic

The `~` character is hardcoded both in the regex character class `[ xX~]` (lines 6 and 9) and in the status check `checkboxChar === '~'` (lines 62 and 83). The project conventions state that comparison values should be defined once and referenced everywhere. Centralizing the marker (e.g., `const DEPRECATED_MARKER = '~'`) would ensure the regex and status logic cannot drift apart.

### [PASS] Tests cover deprecated plan-line behavior across layers

The new tests verify the feature end-to-end: parser handling of indexed and unindexed `[~]` lines (`slicePlanParser.test.ts`), status derivation precedence (`statusDerivation.test.ts`), `getNext`/`getStatus` skipping deprecated entries (`WorkflowNavigator.test.ts`), consistency checker not warning when all entries are checked or deprecated (`ConsistencyChecker.test.ts`), and CLI list output (`list-derived-status.test.ts`). This provides good coverage for the feature.
