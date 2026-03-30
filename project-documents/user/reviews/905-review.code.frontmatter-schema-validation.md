---
docType: review
layer: project
reviewType: code
slice: frontmatter-schema-validation
project: squadron
verdict: PASS
sourceDocument: project-documents/user/slices/905-slice.frontmatter-schema-validation.md
aiModel: minimax/minimax-m2.7
status: complete
dateCreated: 20260330
dateUpdated: 20260330
---

# Review: code — slice 905

**Verdict:** PASS
**Model:** minimax/minimax-m2.7

## Findings

### [PASS] Well-architected schema registry

The `FRONTMATTER_SCHEMAS` in `packages/core/src/schema/frontmatterSchema.ts` provides a clean, data-driven approach mapping 8 docTypes to required fields with value constraints. The TypeScript interfaces (`FrontmatterFieldDef`, `DocTypeSchema`, `FrontmatterFinding`) are appropriately typed.

### [PASS] Pure validation function

`validateFrontmatter()` is a pure function that correctly:
- Returns early when docType is missing (no schema lookup possible)
- Passes through unknown docTypes (forward-compatible)
- Checks required fields with empty-string handling
- Validates value constraints with status alias normalization

### [PASS] Status alias normalization

The normalization in `validateFrontmatter()` correctly handles documented aliases:
- `in-progress` (hyphenated) → `in_progress`
- `not started` (spaced) → `not_started`
- `completed` → `complete`
- `active` → `in_progress`

### [PASS] Rule 12 integration

In `ConsistencyChecker.ts`, the `ruleFrontmatterSchema()` method properly:
- Discovers documents across 6 methodology directories
- Converts `FrontmatterFinding[]` to `ConsistencyFinding[]`
- Includes fixAction for missing status with default `not_started`
- Uses relative paths in descriptions

### [PASS] Test coverage

The tests properly follow the "test-with" pattern:
- `frontmatterSchema.test.ts`: 12 tests covering schema registry and validation function
- `ConsistencyChecker.test.ts`: 3 tests for Rule 12 integration
- Old Rule 9/11 tests removed and replaced appropriately

### [PASS] Clean rule removal

Rules 9 and 11 are cleanly removed with the relevant code deleted from `checkAll()` and the method removed entirely. The remaining plan-status-vs-entries logic is preserved.

### [PASS] Proper exports

Core exports in `packages/core/src/index.ts` correctly expose the new schema types and function.

### [PASS] Documentation updates

CHANGELOG and DEVLOG are properly updated with the feature summary, and project documents are fixed to comply with the new schema requirements.

### [MINOR] Missing status fixAction always present
In `validateFrontmatter()`, only `status` gets a `fixAction`. For other missing required fields, the `suggestedFix` becomes generic "Add the missing field to frontmatter" without indicating which field or value. Consider including field/value in fixAction for all auto-fixable cases, though this is a minor UX improvement rather than a correctness issue.

### [MINOR] Type annotation reflects string coercion
`validateFrontmatter(data: Record<string, string>)` implies frontmatter values are strings, but `parseFrontmatter` may return mixed types. The implementation correctly handles this with `String(value).trim()`, but the type could be `Record<string, unknown>` for accuracy. Not a functional issue.
