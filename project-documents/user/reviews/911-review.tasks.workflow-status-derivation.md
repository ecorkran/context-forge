---
docType: review
layer: project
reviewType: tasks
slice: workflow-status-derivation
project: squadron
verdict: CONCERNS
sourceDocument: project-documents/user/tasks/911-tasks.fix-slice-status-derivation-for-partial-completion-slices.md
aiModel: z-ai/glm-5.1
status: complete
dateCreated: 20260705
dateUpdated: 20260705
findings:
  - id: F001
    severity: concern
    category: completeness
    summary: "`cf next` recommendation wording (\"continue\" vs \"advance to\") not explicitly task-ified"
    location: packages/core/src/introspection/WorkflowNavigator.ts
  - id: F002
    severity: concern
    category: completeness
    summary: "TD-2a signal-resolution-failure handling and tests incomplete for `getNext`, `ProjectModelBuilder`, and `cf list arch`"
    location: unverified
  - id: F003
    severity: concern
    category: completeness
    summary: "`cf list arch` TD-2a degraded-indicator handling absent from Task 8"
    location: packages/cli/src/commands/arch.ts
  - id: F004
    severity: note
    category: task-sequencing
    summary: "Test-with pattern relaxed for paired implementations sharing a single test task"
    location: unverified
  - id: F005
    severity: note
    category: completeness
    summary: "`cf status` surface not explicitly tested but implicitly covered via shared path"
    location: unverified
  - id: F006
    severity: pass
    category: task-sequencing
    summary: "Commit checkpoints well-distributed throughout the task sequence"
    location: unverified
  - id: F007
    severity: pass
    category: task-sequencing
    summary: "Task sequencing respects dependencies with no circular dependencies"
    location: unverified
  - id: F008
    severity: pass
    category: completeness
    summary: "No scope creep detected — all tasks trace to success criteria or TD decisions"
    location: unverified
  - id: F009
    severity: pass
    category: completeness
    summary: "Core derivation logic and primary #56 fix well-covered with thorough lattice tests"
    location: packages/core/src/introspection/statusDerivation.ts
---

# Review: tasks — slice 911

**Verdict:** CONCERNS
**Model:** z-ai/glm-5.1

## Findings

### [CONCERN] `cf next` recommendation wording ("continue" vs "advance to") not explicitly task-ified

Functional requirement #3 states: "`cf next` recommends 'continue' for an in-progress derived slice and 'advance to' only for a genuinely not-started next slice." The slice design's in-scope section also explicitly includes: "`getNext` recommendations that say 'continue in-progress slice N' vs 'advance to slice N' per derived status." Task 5 changes the *selection predicate* (which entry `getNext` picks) but does not mention updating the *recommendation text* that `getNext` returns. Task 6 tests the routing (#56 regression) and gate ordering but does not assert the wording distinction. The routing logic is covered, but the user-facing text — an explicit success criterion — has no implementation or test task.

### [CONCERN] TD-2a signal-resolution-failure handling and tests incomplete for `getNext`, `ProjectModelBuilder`, and `cf list arch`

Functional requirement #9 requires that a signal resolution failure (unparseable task file, invalid frontmatter `status`, `detectDocuments` error) is surfaced or shown as a degraded indicator across *all* surfaces — never silently downgraded. The technical requirement calls for "at least one malformed-input test per signal," which Task 9 satisfies for `cf list slices`. However:
- **`getNext`**: Task 5 describes TD-2a error propagation ("propagate the error for that entry's resolution"), but Task 6 contains no test asserting this propagation behavior (e.g., that `parseTaskFile` throwing causes `getNext` to surface an error rather than silently fall through to the checkbox).
- **`ProjectModelBuilder`**: Task 10 does not mention TD-2a handling at all — what happens when a task file is unparseable or frontmatter `status` normalizes to `undefined` in the builder's two call sites is unspecified.
- **`cf list arch`**: Task 8 routes arch through the helper but never addresses what happens when `frontmatterStatus` resolution fails for an arch entry (no degraded-indicator or error-propagation specification).
- **`detectDocuments` throwing**: TD-2a lists three failure modes; only two (unparseable task file, invalid frontmatter) have explicit tests. The third (`detectDocuments` erroring mid-listing) has no test anywhere.

The "at least one test per signal" threshold is met, but functional #9 applies universally, and three surfaces lack both implementation specification and test assertion for TD-2a.

### [CONCERN] `cf list arch` TD-2a degraded-indicator handling absent from Task 8

Task 7 (`cf list slices`) explicitly specifies TD-2a degraded-indicator rendering ("⚠ unreadable") for unparseable task files and invalid frontmatter. Task 8 (`cf list arch`) only says to pass `frontmatterStatus` and `isChecked` to the helper — it does not specify what happens when the arch file's frontmatter `status` normalizes to `undefined` (per Task 1's signature change). Since arch entries have no task file, `taskInferredStatus` is always absent, making `frontmatterStatus` the only non-checkbox signal. If that signal fails to resolve, the helper falls through to the checkbox — exactly the silent fallback TD-2a prohibits. Task 8 needs an explicit degraded-indicator specification matching Task 7's approach.

### [NOTE] Test-with pattern relaxed for paired implementations sharing a single test task

Tasks 7+8 share Task 9, Tasks 12+13 share Task 14, and Tasks 15+16 share Task 17. Strict test-with would place a test task immediately after each implementation task. The paired approach is pragmatic (closely related implementations, shared fixture setup) and the implementations are small (2/5 effort each), but it means a failure in the first implementation isn't caught until after the second is also written. Not blocking, but worth noting.

### [NOTE] `cf status` surface not explicitly tested but implicitly covered via shared path

Functional requirement #1 lists four surfaces: `cf status`, `cf list slices`, `cf next`, and `workflow_status`. Task 11 tests MCP `workflow_status` parity with `cf list slices`. `cf status` reads through the same `getStatus()` path as `workflow_status`, so if MCP parity passes, `cf status` should also be correct. However, no task explicitly asserts `cf status` CLI output for the 242-shaped fixture. The manual walkthrough (Task 18, step 1) covers this, but there's no automated regression guard for the `cf status` command specifically.

### [PASS] Commit checkpoints well-distributed throughout the task sequence

Commit checkpoints appear at Task 6 (helper + navigator), Task 11 (all five consumers routed), Task 14 (consistency rules), Task 17 (schema + gate), and Task 18 (final walkthrough). No batching at the end. Each checkpoint represents a buildable, tested intermediate state. This follows the required pattern.

### [PASS] Task sequencing respects dependencies with no circular dependencies

The sequence correctly follows the design's suggested development approach: helper first (Task 3→4), then navigator routing (5→6), then CLI + builder routing (7→11), then consistency rules (12→14), then docs-only gate (15→17), then final verification (18). Task 1 (normalizeStatus) is correctly placed as a prerequisite before the routing tasks. Task 15 (schema registration) correctly precedes Task 16 (gate branch). No circular dependencies exist.

### [PASS] No scope creep detected — all tasks trace to success criteria or TD decisions

Task 1 (normalizeStatus fix) was discovered during breakdown but traces directly to TD-2a and functional #9 — it's properly documented as a prerequisite, not extraneous work. Task 17's "verify against slice 243" step is explicitly scoped as a flag-only action (no modification of slice 243). Every other task maps clearly to a functional requirement, technical requirement, or technical decision from the slice design.

### [PASS] Core derivation logic and primary #56 fix well-covered with thorough lattice tests

Tasks 3+4 implement and exhaustively test the `deriveEntryStatus` helper, covering every lattice branch including the deprecated-wins-all case. Task 5+6 route `getNext` through the helper with the direct #56 regression test and the load-bearing gate-ordering regression. The primary value proposition of the slice (partial-completion slices no longer read "not started") has solid implementation and test coverage.
