---
docType: review
layer: project
reviewType: tasks
slice: sliceplanparser-deprecated-entry-handling
project: context-forge
verdict: CONCERNS
sourceDocument: project-documents/user/tasks/918-tasks.sliceplanparser-deprecated-entry-handling.md
aiModel: minimax/minimax-m3
status: complete
dateCreated: 20260731
dateUpdated: 20260731
findings:
  - id: F001
    severity: concern
    category: uncategorized
    summary: "`arch-status-vs-plans` rule has no dedicated test"
    location: unverified
  - id: F002
    severity: note
    category: uncategorized
    summary: "Task 9 extends beyond Decision 4's stated \"one-line\" change"
    location: unverified
  - id: F003
    severity: note
    category: uncategorized
    summary: "Task 11 covers `getNext()` unit-level but not `cf next` CLI-level"
    location: unverified
  - id: F004
    severity: pass
    category: uncategorized
    summary: "All seven Success Criteria have corresponding task coverage"
    location: unverified
  - id: F005
    severity: pass
    category: uncategorized
    summary: "Sequencing and dependencies are clean"
    location: unverified
  - id: F006
    severity: pass
    category: uncategorized
    summary: "No load-test or CI-gating tasks required"
    location: unverified
  - id: F007
    severity: pass
    category: uncategorized
    summary: "Commit checkpoints are distributed, not batched"
    location: unverified
  - id: F008
    severity: pass
    category: uncategorized
    summary: "Tasks are appropriately scoped"
    location: unverified
---

# Review: tasks — slice 918

**Verdict:** CONCERNS
**Model:** minimax/minimax-m3

## Findings

### [CONCERN] `arch-status-vs-plans` rule has no dedicated test

Success Criterion 6 explicitly names **both** `plan-status-vs-entries` **and** `arch-status-vs-plans`. Task 12 adds regression coverage only for `plan-status-vs-entries`. While both rules consume the same `completedSlices`/`totalSlices` arithmetic (covered by Task 4 + Task 5's updated `totalSlices: 7, completedSlices: 5` assertion), the specific rule-invocation path for `arch-status-vs-plans` is never asserted. A junior AI executing this breakdown will likely consider the criterion met after Task 12, leaving the arch rule uncovered. Add a complementary test case mirroring Task 12's pattern but for an architecture-level fixture (plan containing a `[~]` entry under an arch whose frontmatter is `status: complete`) — or document in Task 12 why the `plan-status-vs-entries` test is sufficient evidence for both rules.

### [NOTE] Task 9 extends beyond Decision 4's stated "one-line" change

Decision 4 says `cf list slices` gets "the same one-line addition to its inline `deriveEntryStatus({...})` call". Task 9 also modifies the `derivedStatus` initializer above the try block (the fallback used when `detectDocuments` throws). The task justifies this as a filesystem-error defense, and it does protect Success Criterion 4's rendering guarantee — but it's not in the slice design's explicit decision text. Consider noting in Task 9 that this is an additive hardening beyond Decision 4, so reviewers can spot it.

### [NOTE] Task 11 covers `getNext()` unit-level but not `cf next` CLI-level

Verification Walkthrough step 4 says "Run `cf next` against a project whose active slice plan's first not-yet-checked entry is the `[~]` line". Task 11 exercises the underlying `getNext()` (via `WorkflowNavigator.test.ts`), which is the correct unit boundary — `cf next` is a thin wrapper. The unit test is sufficient, but Task 11's success criterion could explicitly state that `cf next` is covered transitively via the `getNext()` test, so a reviewer doesn't flag the absence of a CLI-level `cf next` integration test.

### [PASS] All seven Success Criteria have corresponding task coverage

Criterion 1 (indexed `[~]` parses with `status: 'deprecated'`, `isChecked: false`, description captured) → Tasks 1, 2, 3, 5. Criterion 2 (unindexed form equivalent) → Tasks 1, 2, 3, 5. Criterion 3 (arithmetic) → Tasks 4, 5. Criterion 4 (cf list slices renders `⊘ deprecated`, no `← next`) → Tasks 9, 10. Criterion 5 (findFirstNotCompleteEntry skips) → Tasks 8, 11. Criterion 6 (ConsistencyChecker no false-positive) → Tasks 4, 12 (partial — see CONCERN above). Criterion 7 (regression-free for `[ ]`/`[x]`/`[X]`) → Task 5's explicit regression test assertion.

### [PASS] Sequencing and dependencies are clean

Fixture-first ordering (Task 1 before parser changes) honors the CLAUDE.md lenient-parsing rule explicitly cited in Task 1's note. Parser implementation (2→3→4) precedes parser tests (5). Signal type addition (6) precedes signal tests (7). Both wiring tasks (8, 9) precede their integration tests (10, 11). Task 11 correctly notes that its success is verification-only (no production code change expected) and explicitly says to stop and report if it fails — preventing a junior AI from guessing at a fix to a design-level error. No circular dependencies.

### [PASS] No load-test or CI-gating tasks required

The slice design does not restate any NFR (no performance/capacity/durability claims). Per the evaluation criteria, no load test task is needed, and consequently no CI-wiring task is required. The verification walkthrough is purely behavioral/correctness.

### [PASS] Commit checkpoints are distributed, not batched

Six commit points spread across Tasks 5, 7, 10, 11, 12, and 13 (conditional). Each commit message is specific to its task's change type (`fix(core):`, `feat(core):`, `feat(core,cli):`, `test(core):`). The breakdown avoids the anti-pattern of a single squashed commit at the end.

### [PASS] Tasks are appropriately scoped

No task is too large (each touches at most two files and has a single verifiable success criterion). No task is too granular — even the two-line regex widening in Task 2 is justified as a logical unit because the two regexes are mirror images and any divergence would be a regression risk. Task 13 (full verification pass) is appropriately the final task and is explicitly marked as a process task, not an implementation task.
