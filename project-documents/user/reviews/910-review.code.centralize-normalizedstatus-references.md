---
docType: review
layer: project
reviewType: code
slice: centralize-normalizedstatus-references
project: squadron
verdict: PASS
sourceDocument: project-documents/user/slices/910-slice.centralize-normalizedstatus-references.md
aiModel: z-ai/glm-5.1
status: complete
dateCreated: 20260709
dateUpdated: 20260709
findings:
  - id: F001
    severity: pass
    category: project-convention
    summary: "Centralized STATUS constant replaces scattered string literals"
    location: packages/core/src/introspection/types.ts
  - id: F002
    severity: note
    category: type-safety
    summary: "InferredStatus type widened from specific union to NormalizedStatus"
    location: packages/core/src/introspection/types.ts:44
  - id: F003
    severity: note
    category: typescript-patterns
    summary: "Verify STATUS constant uses `as const` assertion"
    location: packages/core/src/introspection/types.ts
  - id: F004
    severity: note
    category: type-safety
    summary: "Frontmatter status comparisons remain loosely typed (pre-existing)"
    location: packages/core/src/introspection/ConsistencyChecker.ts:350
---

# Review: code — slice 910

**Verdict:** PASS
**Model:** z-ai/glm-5.1

## Findings

### [PASS] Centralized STATUS constant replaces scattered string literals

All hardcoded status values (`'complete'`, `'in-progress'`, `'not-started'`, `'deprecated'`) across `ConsistencyChecker.ts`, `slicePlanParser.ts`, `statusNormalizer.ts`, and `taskFileParser.ts` are replaced with references to `STATUS.Complete`, `STATUS.InProgress`, `STATUS.NotStarted`, and `STATUS.Deprecated` imported from `../types.js`. This directly fulfills the project convention against scattering comparison values. Every comparison, assignment, and lookup now references the single source of truth.

---

### [NOTE] InferredStatus type widened from specific union to NormalizedStatus

The `TaskFileResult.inferredStatus` type changed from `'complete' | 'in-progress' | 'not-started'` to `NormalizedStatus`. Since `NormalizedStatus` includes `'deprecated'`, the type now admits a value that `taskFileParser.ts` can never produce — task file inference only yields `Complete`, `InProgress`, or `NotStarted`. This is a minor loss of type precision: the previous type more accurately modeled the impossible state. If stricter typing is desired, a helper like `type TaskInferredStatus = Exclude<NormalizedStatus, 'deprecated'>` could preserve both centralization and precision. This is not a bug — just a tradeoff favoring consistency over maximal narrowness.

---

### [NOTE] Verify STATUS constant uses `as const` assertion

The `STATUS` constant definition is not visible in the diff (likely outside the changed-line context), but per the TypeScript rules, it should be defined as an `as const` object so that `STATUS.Complete` has the literal type `'complete'` rather than `string`. Without `as const`, assignments like `status: STATUS.Complete` to fields typed as `NormalizedStatus` would fail to compile, so the code almost certainly uses `as const` or equivalent. This is a reminder to confirm the definition follows the recommended pattern:

```typescript
export const STATUS = {
  Complete: 'complete',
  InProgress: 'in-progress',
  NotStarted: 'not-started',
  Deprecated: 'deprecated',
} as const;
```

---

### [NOTE] Frontmatter status comparisons remain loosely typed (pre-existing)

Several methods compute `fmStatus` via `frontmatter.data.status.toLowerCase()`, producing a `string`. Comparisons like `fmStatus === STATUS.Complete` are type-safe at runtime but TypeScript cannot narrow `fmStatus` to `NormalizedStatus` through this comparison — the variable remains `string` in both branches. A more robust approach would route these through `statusNormalizer.normalizeStatus()` to produce a `NormalizedStatus`-typed value. This is pre-existing behavior, not introduced by this change, and is noted only as a future improvement opportunity.
