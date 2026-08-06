---
docType: review
layer: project
reviewType: tasks
slice: unify-canonical-status-vocabulary
project: context-forge
verdict: CONCERNS
sourceDocument: project-documents/user/tasks/922-tasks.unify-canonical-status-vocabulary.md
aiModel: minimax/minimax-m3
status: complete
dateCreated: 20260806
dateUpdated: 20260806
reviewedSha: 49fcec2063f7f6b2d3a99bb589567611230a1db8
findings:
  - id: F001
    severity: pass
    category: uncategorized
    summary: "All 8 success criteria map to tasks"
    location: project-documents/user/tasks/922-tasks.unify-canonical-status-vocabulary.md
  - id: F002
    severity: pass
    category: uncategorized
    summary: "Sequencing respects the design's hard ordering constraint"
    location: project-documents/user/tasks/922-tasks.unify-canonical-status-vocabulary.md
  - id: F003
    severity: pass
    category: uncategorized
    summary: "Test-with pattern respected"
    location: project-documents/user/tasks/922-tasks.unify-canonical-status-vocabulary.md
  - id: F004
    severity: pass
    category: uncategorized
    summary: "Commit checkpoints distributed throughout"
    location: project-documents/user/tasks/922-tasks.unify-canonical-status-vocabulary.md
  - id: F005
    severity: pass
    category: uncategorized
    summary: "Risk mitigations from design are addressed"
    location: project-documents/user/slices/922-slice.unify-canonical-status-vocabulary.md
  - id: F006
    severity: pass
    category: uncategorized
    summary: "Required new regression tests are present"
    location: project-documents/user/tasks/922-tasks.unify-canonical-status-vocabulary.md
  - id: F007
    severity: pass
    category: uncategorized
    summary: "No NFR restated; no load test or CI wiring needed"
    location: project-documents/user/slices/922-slice.unify-canonical-status-vocabulary.md
  - id: F008
    severity: concern
    category: process
    summary: "Design's \"each step must leave the suite green\" rule conflicts with Task 4 and Task 7"
    location: project-documents/user/slices/922-slice.unify-canonical-status-vocabulary.md
  - id: F009
    severity: concern
    category: correctness
    summary: "Task 2's \"expected type errors\" may be over-stated given the dependency note"
    location: project-documents/user/tasks/922-tasks.unify-canonical-status-vocabulary.md
  - id: F010
    severity: concern
    category: correctness
    summary: "Task 19 references \"six files\" but only five are explicitly handled"
    location: project-documents/user/tasks/922-tasks.unify-canonical-status-vocabulary.md
  - id: F011
    severity: concern
    category: error-handling
    summary: "Task 8's replacement changes error-message behavior for unrecognized input"
    location: packages/core/src/schema/frontmatterSchema.ts:256-264
  - id: F012
    severity: note
    category: documentation
    summary: "Task 22 updates the design document in place with real output"
    location: project-documents/user/tasks/922-tasks.unify-canonical-status-vocabulary.md
  - id: F013
    severity: note
    category: process
    summary: "Task 26 close-out uses unchecked assertion format"
    location: project-documents/user/tasks/922-tasks.unify-canonical-status-vocabulary.md
---

# Review: tasks — slice 922

**Verdict:** CONCERNS
**Model:** minimax/minimax-m3

## Findings

### [PASS] All 8 success criteria map to tasks

SC1 (single source of truth) → Tasks 1–3, 5–6, 21. SC2 (delete workaround) → Task 8. SC3 (--fix writes canonical) → Tasks 13, 22. SC4 (validateFrontmatter rejects) → Task 9. SC5 (alias leniency preserved) → Task 10. SC6 (no bare literals) → Task 21. SC7 (suite green) → Tasks 6, 23. SC8 (release notes) → Task 25. All eight are covered with no gaps.

### [PASS] Sequencing respects the design's hard ordering constraint

The "constants before workaround removal" ordering (the design's "Ordering constraint (hard)") is enforced: Part 1 flips `STATUS` (Tasks 1–3) before Part 3 deletes the `.replace()` workaround (Task 8). Within Part 4, test classification precedes the new round-trip regression test that depends on it.

### [PASS] Test-with pattern respected

Task 9 (validation gate tests) immediately follows Task 8 (workaround removal). Task 13 (round-trip test) is added in the same file as Task 12 (ConsistencyChecker.test.ts classification), with all implementation dependencies (Tasks 2, 5/6, 8) already complete. Task 10 (alias coverage) sits next to the alias-preserving replacement in Task 8.

### [PASS] Commit checkpoints distributed throughout

8 commits across 27 tasks (Tasks 4, 7, 11, 14, 17, 20, 24, 27), distributed across all six parts rather than batched at the end. Each commit's success criterion is explicit, including which gates (build/test) apply.

### [PASS] Risk mitigations from design are addressed

Import-cycle risk → Task 1 verifies direction and prescribes a leaf-module hoist (no value duplication). Ordering-inversion risk → Parts 1 and 3 are sequenced so workaround removal happens after the constant flip. Silent leniency loss risk → Tasks 12, 15, 16, 18, 19 all explicitly forbid bulk find-replace and require per-occurrence classification.

### [PASS] Required new regression tests are present

The design's Test Plan lists five required new tests. Task 9 covers three (reject hyphenated, accept all five, VALID_STATUSES ⊆ Object.values(STATUS)). Task 10 covers alias coverage. Task 13 covers the `--fix` round-trip — the "single most valuable test in the slice" per the design.

### [PASS] No NFR restated; no load test or CI wiring needed

The slice design does not restate any performance or load NFR, so no `tests/load/` task is required. No CI gate change is required — the regression tests in Tasks 9, 10, 13 are the CI gate, and they are run by the existing `pnpm -r test` infrastructure verified in Task 23.

### [CONCERN] Design's "each step must leave the suite green" rule conflicts with Task 4 and Task 7

The design's Ordering Constraint section states "Each step below must leave the suite green." Tasks 4 and 7 explicitly violate this: Task 4 says "Full build is not expected to pass yet (Task 2 introduced type errors by design) — do not gate this commit on a green build" and Task 7 says "Test suites are not expected to be green yet (Part 3 has not run) — do not gate this commit on `pnpm -r test`." This is a defensible execution choice (checkpoint commits between logical steps), but the design should acknowledge it. Without that acknowledgment, a reviewer comparing the two documents will flag the inconsistency. Recommend either (a) updating the design's "each step must leave the suite green" sentence to "each logical step" or (b) restructuring Task 4 to combine the constant flip with the source sweep so a green build is achieved before the first commit.

### [CONCERN] Task 2's "expected type errors" may be over-stated given the dependency note

Task 2's success criterion states the build "fails with type errors at every call site now incompatible with the new literal types (expected at this checkpoint — do not fix yet)." However, the Context Summary states "30 STATUS.InProgress/STATUS.NotStarted references exist across 10 source files... all already reference the constant post-slice-910, so most need no edit." If all 30 call sites reference `STATUS.*` constants (not literals), TypeScript will accept the new literal values via the constant indirection, and Task 2 should compile cleanly — no type errors to resolve in Tasks 5/6. Either the task breakdown is wrong about Task 2 producing type errors, or there are unmentioned bare-literal references in source (e.g., in switch cases, comparison expressions, or string-keyed lookups) that survived slice 910. Recommend verifying by running `pnpm --filter @context-forge/core build` after Task 2 in a dry run before committing to the "Tasks 5/6 fix errors" framing — if the build is already green, Tasks 5/6 reduce to verification only, and the Task 4 commit can be gated on a green build, resolving the previous CONCERN.

### [CONCERN] Task 19 references "six files" but only five are explicitly handled

Task 19 says "excluding the six files already handled in Tasks 12, 15, 16, 18." Counting: Task 12 handles 1 file (ConsistencyChecker.test.ts), Task 15 handles 1 (WorkflowNavigator.test.ts), Task 16 handles 1 (statusNormalizer.test.ts), Task 18 handles 2 (list-derived-status.test.ts, list.test.ts) — totaling 5 files, not 6. This matches the design's Test Plan table (5 named files + "13 further files" = 18 total). Recommend changing "six files" to "five files."

### [CONCERN] Task 8's replacement changes error-message behavior for unrecognized input

The current code applies `effectiveValue.replace(/[-\s]/g, '_')` to unrecognized status values before checking against `def.values`. The proposed replacement `normalizeStatus(normalizedValue) ?? normalizedValue` passes unrecognized input through unchanged. Both paths reject, but the error message changes: e.g., `'some-thing'` was reported as invalid `'some_thing'`; it will now be reported as invalid `'some-thing'`. This is arguably an improvement (shows the user what they typed), but it is an observable behavior change worth either (a) calling out in the CHANGELOG entry in Task 25, or (b) noting in the commit message for Task 11. The task's own "Verify the `??` fallback does not silently coerce" check covers the rejection path but not the message-shape change.

### [NOTE] Task 22 updates the design document in place with real output

Task 22 asks to update the slice design's Verification Walkthrough section in place with actual commands run and observed output. This is unusual (a design doc being modified during implementation) but reasonable for capturing ground truth. It does mean the design file is touched by the implementation rather than remaining a frozen reference — make sure reviewers understand this is intentional and not a mid-implementation design change.

### [NOTE] Task 26 close-out uses unchecked assertion format

Task 26 says to "Check off entry 22 `(922)` in `user/architecture/900-slices.maintenance-and-refactoring.md`" but does not specify the format (e.g., `✓`, `[x]`, `[ ]` → `[x]`, or strikethrough). Minor — the implementer can follow whatever convention the file already uses, but explicit guidance would prevent ambiguity.
