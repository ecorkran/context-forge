---
docType: review
layer: project
reviewType: tasks
slice: gate-logic-in-workflownavigator
project: squadron
verdict: CONCERNS
sourceDocument: project-documents/user/tasks/241-tasks.gate-logic-in-workflownavigator.md
aiModel: z-ai/glm-5.1
status: complete
dateCreated: 20260703
dateUpdated: 20260703
findings:
  - id: F001
    severity: concern
    category: task-sequencing
    summary: "Task 4.5 depends on Task 6.1 fixtures, breaking linear sequencing and the test-with pattern"
    location: project-documents/user/tasks/241-tasks.gate-logic-in-workflownavigator.md
  - id: F002
    severity: concern
    category: test-coverage-gap
    summary: "Missing integration-level test for \"present file, absent/malformed verdict → UNKNOWN\" path"
    location: project-documents/user/tasks/241-tasks.gate-logic-in-workflownavigator.md
  - id: F003
    severity: note
    category: commit-structure
    summary: "Commit checkpoints batched at the end rather than distributed"
    location: project-documents/user/tasks/241-tasks.gate-logic-in-workflownavigator.md
  - id: F004
    severity: pass
    category: completeness
    summary: "All success criteria have corresponding tasks with no scope creep"
    location: project-documents/user/tasks/241-tasks.gate-logic-in-workflownavigator.md
  - id: F005
    severity: pass
    category: task-sizing
    summary: "Task granularity and scoping are appropriate"
    location: project-documents/user/tasks/241-tasks.gate-logic-in-workflownavigator.md
---

# Review: tasks — slice 241

**Verdict:** CONCERNS
**Model:** z-ai/glm-5.1

## Findings

### [CONCERN] Task 4.5 depends on Task 6.1 fixtures, breaking linear sequencing and the test-with pattern

Task 4.5 ("Test: navigator gate behavior") explicitly states "point `project.projectPath` at a fixture (Task 6)", but Task 6 comes after Task 4. This creates a forward dependency: the test cannot be implemented or run until fixtures in Task 6.1 exist. The test-with pattern requires that tests immediately follow their implementation, which this ordering violates. Either move Task 6 (fixtures) before Task 4, or split Task 4.5 into a Task 4.5 (wiring only, no fixture-dependent assertions) and a later test task that runs after fixtures exist. The latter keeps the test-with spirit while acknowledging the fixture dependency.

### [CONCERN] Missing integration-level test for "present file, absent/malformed verdict → UNKNOWN" path

The success criteria explicitly state: *"An unparseable/unreadable review file that exists is treated as UNKNOWN (never silently cleared) and follows `review_unknown_as`."* Task 3.3 and 3.5 test `normalizeVerdict(undefined) → UNKNOWN` and the UNKNOWN × unknownAs matrix at the unit level, and Task 6.1 includes a "no-verdict artifact" fixture — but Task 4.5 (the integration/boundary test) only explicitly lists three cases: absent artifact → pending, FAIL → review-failed, and clearing verdict → unchanged. The "present file with no/malformed verdict → UNKNOWN → follows unknownAs" case at the navigator level is not called out. Add an explicit assertion in Task 4.5 (or a companion test) that a fixture with a present review file but no `verdict` field produces `review-failed` (under default `unknownAs=fail`) or `pending-review` (under appropriate unknownAs), confirming the present-but-no-verdict path does not silently clear.

### [NOTE] Commit checkpoints batched at the end rather than distributed

Task 7.3 is the only commit checkpoint. For a slice with seven task groups spanning types, a new module, navigator changes, surface wiring, and fixtures, a single commit at the end loses intermediate save points. Consider adding commit checkpoints after Task 2 (types), Task 3 (reviewGate module), and Task 4 (navigator changes) — each is a coherent, independently testable unit. This aligns with the instruction that "commit checkpoints are distributed throughout, not batched at end."

### [PASS] All success criteria have corresponding tasks with no scope creep

Every functional requirement (FR1–FR7) and technical requirement (TR1–TR6) from the slice design traces to at least one task. The verification walkthrough is covered by Task 7.2. No task traces to work outside the slice's declared scope — the STATUS const is introduced without sweeping existing sites (explicitly deferred to slice 910), ConsistencyChecker wiring is excluded (slice 242), and documentation updates are excluded (slice 243). The scope boundary is clean.

### [PASS] Task granularity and scoping are appropriate

Tasks are individually completable by a junior AI with clear success criteria. Task 4.2 (wiring three boundaries via a shared helper) is the largest single subtask but remains coherent — it introduces one helper (`evaluateGate`) and applies it at three call sites following the same pattern. No task is trivially small (requiring merging) and no task is unreasonably large for a single implementation pass.
