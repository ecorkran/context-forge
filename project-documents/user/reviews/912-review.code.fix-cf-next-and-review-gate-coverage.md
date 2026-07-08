---
docType: review
layer: project
reviewType: code
slice: fix-cf-next-and-review-gate-coverage
project: squadron
verdict: CONCERNS
sourceDocument: project-documents/user/slices/912-slice.fix-cf-next-and-review-gate-coverage.md
aiModel: claude-sonnet-5
status: complete
dateCreated: 20260707
dateUpdated: 20260707
findings:
  - id: F001
    severity: pass
    category: correctness
    summary: "CONFIG_KEYS-driven type coercion is correct and well-justified"
    location: packages/cli/src/commands/config.ts:93-108
  - id: F002
    severity: pass
    category: correctness
    summary: "Review-gate widening is behaviorally sound and covered by targeted regression tests"
    location: packages/core/src/introspection/WorkflowNavigator.ts:129-147
  - id: F003
    severity: concern
    category: consistency
    summary: "New `ARCHITECTURE_PHASE` constant not swept into sibling literals in the same file"
    location: packages/core/src/introspection/WorkflowNavigator.ts:235-236
  - id: F004
    severity: concern
    category: dry
    summary: "Gate-finding construction duplicated between `ruleReviewGate` and `ruleArchReviewGate`"
    location: packages/core/src/introspection/ConsistencyChecker.ts:608-641
  - id: F005
    severity: note
    category: structure
    summary: "ConsistencyChecker.ts continues growing past the project's file-size guideline"
    location: packages/core/src/introspection/ConsistencyChecker.ts
  - id: F006
    severity: pass
    category: test-coverage
    summary: "Test coverage is thorough and test-with (not test-after)"
    location: packages/core/tests/introspection/ConsistencyChecker.reviewGateWidened.test.ts
---

# Review: code — slice 912

**Verdict:** CONCERNS
**Model:** claude-sonnet-5

## Findings

### [PASS] CONFIG_KEYS-driven type coercion is correct and well-justified

The fix replaces blind `Number()`/`'true'/'false'` coercion with a lookup against the `CONFIG_KEYS` registry (`packages/core/src/config/ConfigKeys.ts`), correctly preventing a `YYYYMMDD`-style string value for `workflow.review_gate_effective_date` from being misinterpreted as a number. Unknown keys are deliberately left uncoerced so `cm.set` produces its normal error. Verified against the real `ConfigKeyDefinition.type` field. Regression test added and passing.

### [PASS] Review-gate widening is behaviorally sound and covered by targeted regression tests

The arch (`preSlicePlan`) gate check now fires regardless of whether a slice plan already exists, closing the "orphaned gate" gap (#59 Gap 1) described in the comment. Confirmed the only `preSlicePlan` call site is this one, and that `ConsistencyChecker.ruleArchReviewGate` independently covers the `checkAll()` path for every discovered arch file (not just the one paired to a slice). Checked out commit `870e7eb` in isolation and ran the full affected suite (`reviewGate.test.ts`, `ConsistencyChecker.reviewGate(Widened).test.ts`, `WorkflowNavigator.test.ts`, `reviewGate.cutoffIntegration.test.ts`, CLI `config.test.ts`) plus `tsc --noEmit` — all green.

### [CONCERN] New `ARCHITECTURE_PHASE` constant not swept into sibling literals in the same file

`projectSchema.ts:33` adds `ARCHITECTURE_PHASE` explicitly as "single source of truth for callers that need it," and it's wired into the "No architecture (or arch set but file not yet created)" branch (~line 168-170), with a meta-test (`WorkflowNavigator.test.ts` "#58 ... references ARCHITECTURE_PHASE, not a bare literal") enforcing that *one* block uses the constant. But two sibling occurrences of the identical literal `'Phase 2: Architecture'` in the same file — the `arch-file-missing` guard at lines 235-236, and another at line 469 — were left as bare string literals, unconverted. This is exactly the pattern CLAUDE.md's "Never scatter comparison values across code" rule calls out: changing the phase-2 display string now requires editing three places in this file (plus `projectSchema.ts`), not the one the new constant was created to establish. Since the PR touched this exact file for this exact purpose, the sweep should have been complete, or the remaining literals called out as deliberately deferred.

### [CONCERN] Gate-finding construction duplicated between `ruleReviewGate` and `ruleArchReviewGate`

The per-boundary `pending-review` / `review-failed` finding-building block (status check → `warning` finding with `Run the {type} review for ...` vs `error` finding with `join(projectPath, result.artifactPath!)` and `Resolve the review findings or rerun the {type} review for ...`) is duplicated almost verbatim in `ruleReviewGate` (lines 620-640) and `ruleArchReviewGate` (lines 771-790), differing only in the entity label ("slice N" vs "architecture N") and location value. Given `positionToReviewType(boundary)` and `safeEvaluateGate` were already extracted as shared helpers in this same diff, extracting a third helper (e.g. `buildGateFinding(result, boundary, index, location, entityLabel)`) would have eliminated this repeat rather than just moving it into a new call site. Not a correctness bug — both copies are consistent — but it's the kind of duplication CLAUDE.md's DRY rule flags, and it means the two blocks can now drift independently.

### [NOTE] ConsistencyChecker.ts continues growing past the project's file-size guideline

The file is 1321 lines, well past CLAUDE.md's "~300 lines where practical" guidance; this diff adds another ~95 lines of review-gate rule logic to it (`safeEvaluateGate`, `ruleArchReviewGate`, the widened `ruleReviewGate`). This isn't a regression introduced by this diff, but the diff had a natural opportunity to extract the review-gate rule methods into their own module (mirroring how `reviewGate.ts` already separates the pure gate-evaluation logic from `ConsistencyChecker`/`WorkflowNavigator`), which would have kept the class file from growing further. Flagging as informational since it's a pre-existing condition this diff extends rather than causes.

### [PASS] Test coverage is thorough and test-with (not test-after)

New behavior (widened per-slice boundaries, arch-wide gate rule, effective-date cutoff propagation across both `getNext()`/TD-2 and `checkAll()`/TD-3 call sites) is covered by dedicated new test files with clear intent comments tying back to the design doc (slice 912 TD-2/TD-3/TD-5, #58, #59 Gap 1). The `makeStubConfig` helper's fail-on-unrequested-key behavior is a good pattern for catching silent reliance on unstubbed config keys.
