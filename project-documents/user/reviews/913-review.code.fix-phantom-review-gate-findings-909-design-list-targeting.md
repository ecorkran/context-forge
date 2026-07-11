---
docType: review
layer: project
reviewType: code
slice: fix-phantom-review-gate-findings-909-design-list-targeting
project: context-forge
verdict: CONCERNS
sourceDocument: project-documents/user/slices/913-slice.fix-phantom-review-gate-findings-909-design-list-targeting.md
aiModel: z-ai/glm-5.1
status: complete
dateCreated: 20260711
dateUpdated: 20260711
findings:
  - id: F001
    severity: concern
    category: correctness
    summary: "resolveSlicePlanPathByIndex doesn't handle zero-padded filenames — inconsistent with documentDetector fix"
    location: packages/core/src/schema/resolveFileByIndex.ts:128
  - id: F002
    severity: concern
    category: design
    summary: "Duplicated archIndex validation logic violates DRY"
    location: packages/cli/src/commands/slice.ts:40
  - id: F003
    severity: pass
    category: design
    summary: "Discriminated indexSource field prevents cross-plan index collisions"
    location: packages/core/src/introspection/types.ts:21
  - id: F004
    severity: pass
    category: testing
    summary: "Thorough test coverage following test-with pattern"
    location: packages/cli/tests/commands/list-arch-index-targeting.test.ts
  - id: F005
    severity: pass
    category: correctness
    summary: "Widened preAdvance guard prevents false review-gate findings"
    location: packages/core/src/introspection/ConsistencyChecker.ts:640
  - id: F006
    severity: pass
    category: correctness
    summary: "planName extraction refactored to work for both archIndex and default paths"
    location: packages/cli/src/commands/slice.ts:148
---

# Review: code — slice 913

**Verdict:** CONCERNS
**Model:** z-ai/glm-5.1

## Findings

### [CONCERN] resolveSlicePlanPathByIndex doesn't handle zero-padded filenames — inconsistent with documentDetector fix

`documentDetector.ts` was explicitly fixed (TD-6) to tolerate zero-padded filenames by changing `matchFiles` to use `^0*${idx}${escapedSuffix}`. However, the new `resolveSlicePlanPathByIndex` uses `^${archIndex}-slices\\..*\\.md$`, which will **not** match a file like `070-slices.plan.md` when queried with `archIndex=70`. Both functions search the same `project-documents/user/architecture/` directory for the same kind of files, so this inconsistency means `cf list slices 70` would fail to find a `070-slices.plan.md` file while `detectDocuments(…, 70)` would correctly resolve `070-arch.*.md`. The regex should be `^0*${archIndex}-slices\\..*\\.md$` to match the convention established in `documentDetector.ts`.

### [CONCERN] Duplicated archIndex validation logic violates DRY

The archIndex parsing and validation (`Number(opts.archIndex)`, `Number.isInteger`, `>= 0` check, and `UserError` throw) is duplicated verbatim in both `slice.ts` (lines ~40–44) and `task.ts` (lines ~46–50). Per project conventions: "Do not duplicate logic. Respect DRY." This should be extracted into a shared helper (e.g., in `src/utils/`), so changing the validation rules requires editing exactly one place.

### [PASS] Discriminated indexSource field prevents cross-plan index collisions

The addition of `indexSource: 'explicit' | 'fallback'` to `SlicePlanEntry` is a clean solution to the collision problem. Using a discriminated field rather than runtime string checks follows the TypeScript rules' recommendation for tagged unions. The `ConsistencyChecker` filter at line 101 (`if (entry.indexSource === 'fallback') continue;`) is a direct, minimal fix that prevents synthetic sequential indices from polluting the cross-plan index space while leaving single-plan consumers unaffected.

### [PASS] Thorough test coverage following test-with pattern

New tests exercise the `archIndex` feature end-to-end with real filesystem fixtures (only `FileProjectStore` mocked), covering valid indices, missing plans, non-numeric input, state non-mutation, and the `--all` mutual-exclusion rule. The `slicePlanParser.test.ts` additions explicitly reproduce the TD-1 collision at the parser level and verify `indexSource` tagging for indexed, unindexed, and mixed-format plans. The `documentDetector.test.ts` additions cover zero-padded matching, non-padded regression, and near-miss prefix guards. This is a strong test-with approach.

### [PASS] Widened preAdvance guard prevents false review-gate findings

Adding `docs?.sliceDesign !== null && docs?.sliceDesign !== undefined` to the `preAdvance` guard is logically sound: if there is no slice design (and therefore no code to review), the checker should not flag a missing code review. The corresponding test in `ConsistencyChecker.reviewGateWidened.test.ts` (index 500 with no slice-design fixture) confirms the fix.

### [PASS] planName extraction refactored to work for both archIndex and default paths

The `planName` computation was previously dependent on `project.fileSlicePlan` and duplicated inside the JSON and table branches. The refactor moves it to a single computation after the branch, using `planPath` (which is set correctly in both the `archIndex` and default paths) and stripping `.md`. This eliminates the duplicate computation and correctly handles both code paths.
