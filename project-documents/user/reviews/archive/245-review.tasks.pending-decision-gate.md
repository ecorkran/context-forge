---
docType: review
layer: project
reviewType: tasks
slice: pending-decision-gate
conventionsSource: AGENTS.md
projectRules: []
project: context-forge
verdict: CONCERNS
verdictSource: stated
sourceDocument: project-documents/user/tasks/245-tasks.pending-decision-gate.md
aiModel: claude-sonnet-5-5
aiProfile: sdk
status: complete
dateCreated: 20261017
dateUpdated: 20261017
reviewedSha: f91bcdf6d58c164bb810c0011f3866bd0f5aa444
revision_number: 1
toolsGiven: [read_file, list_files, grep]
toolCallsMade: 3
turns: 4
promptTokens: 174538
cachedTokens: 89256
cacheWriteTokens: 85276
completionTokens: 2617
durationSeconds: 22.8
costUsd: 0.376925
costBasis: provider
runId: run-20261018-p5-f1858748
squadronVersion: 0.23.1
findings:
  - id: F001
    severity: pass
    category: coverage
    summary: "Success-criteria coverage is complete"
    location: "project-documents/user/tasks/245-tasks.pending-decision-gate.md"
  - id: F002
    severity: concern
    category: sequencing
    summary: "Tasks 2, 5 and 7 have no commit and sit apart from their test tasks"
    location: "project-documents/user/tasks/245-tasks.pending-decision-gate.md:79-97"
  - id: F003
    severity: concern
    category: proportionality
    summary: "Task 3 over-specifies the parser test matrix"
    location: "project-documents/user/tasks/245-tasks.pending-decision-gate.md:99-123"
  - id: F004
    severity: concern
    category: scope
    summary: "Task 7 is dense and its `deriveSliceStatus()` restructuring is under-specified"
    location: "project-documents/user/tasks/245-tasks.pending-decision-gate.md:177-190"
  - id: F005
    severity: concern
    category: proportionality
    summary: "Task 12 duplicates verification and lacks an explicit CI check"
    location: "project-documents/user/tasks/245-tasks.pending-decision-gate.md:256-266"
  - id: F006
    severity: note
    category: accuracy
    summary: "Verified code anchors"
    location: "packages/core/src/schema/frontmatterSchema.ts:32"
  - id: F007
    severity: note
    category: granularity
    summary: "Task 0 pre-flight is lightweight but appropriate"
    location: "project-documents/user/tasks/245-tasks.pending-decision-gate.md:55-62"
---

# Review: tasks — slice 245

**Verdict:** CONCERNS
**Model:** claude-sonnet-5-5

## Findings

### [PASS] Success-criteria coverage is complete

Every Functional and Technical Requirement in the slice traces to a task:
- **Parser (D1/D2):** Tasks 2 and 3.
- **`cf validate design` PASS/FAIL, JSON, and the no-status-line case:** Tasks 5 and 6.
- **`cf next` at no task file, zero progress, partial progress, and all checked:** Tasks 7 and 8.
- **Review-gate precedence:** Task 8.
- **`cf status` and the MCP tools:** Task 9.
- **`cf check` warning:** Task 10.
- **Gate off:** Tasks 6, 8, and 10.
- **Docs and the D8 non-blocking statement:** Task 11.
- **Template and self-design fixtures, and the D6 behavior-preservation check:** Tasks 1 and 3.
- **Verification Walkthrough:** Task 12.

I found no scope creep.

### [CONCERN] Tasks 2, 5 and 7 have no commit and sit apart from their test tasks

Tasks 2, 5 and 7 are implementation tasks with no commit step of their own. Their tests and commits come in Tasks 3, 6 and 8. This follows the test-with pattern. But `git add`/commit "at least once per task" is the project rule, and Task 5 touches core and CLI together with no checkpoint until Task 6.
- **Fix:** keep the code and tests in one commit as the file already does, but state it. Merge each pair into one task ("Task 2+3"), or add an explicit note that the commit is deferred to the paired test task.
- **Task 7 detail:** Task 7's own success criterion ("existing navigator tests pass unchanged") is the only gate before the new behavior is tested. This is fine only if the pair is treated as one unit.

### [CONCERN] Task 3 over-specifies the parser test matrix

Task 3 enumerates roughly 40 parser cases. The slice's Technical Requirements already require most of them.
- **Duplicated cases:** The "Label forms" and "Values that block" lists each repeat forms the slice names. The separate "Pending-word list pin" `it.each` duplicates the six words already tested individually in "Values that block" (`pending_pm`, `TBD`, `undecided`, `open`, and the rest).
- **Suggested cut:** Fold the pin into a single `it.each` over the pending constant's words, as the slice's pin fixture intends. Drop the individual word cases from the "Values that block" list.
- **Splitting:** The task also bundles fixtures, skips, edge cases, attribution, the amoeba fixture, the real template and the self-design fixture. If it stays together, state that these are `it.each` tables so the junior executor does not write 40 separate tests.

### [CONCERN] Task 7 is dense and its `deriveSliceStatus()` restructuring is under-specified

Task 7 combines three changes:
- the type changes;
- a re-ordering of `deriveSliceStatus()` ("restructure the existing order only as far as that requires");
- the new `getNext()` branch with its rationale, summary and constant strings.

The restructuring is the riskiest part. A junior executor gets no concrete guidance on which existing early returns the decision check must precede, or how `gateExempt` and `complete` interact. The slice's D4 lists the positions (`needs-tasks`, review-gate statuses, `in-implementation`), but the task does not map them to code.
- **Fix:** split Task 7 into 7a (types plus `deriveSliceStatus`) and 7b (`getNext()` branch). Or add a sentence naming the return points the check goes before, and what stays unchanged for the `complete` case.

### [CONCERN] Task 12 duplicates verification and lacks an explicit CI check

The slice states no NFRs, so no load test is needed, and this is not a finding.
- **Redundant verification:** Task 12 re-runs `pnpm test`, build, lint and typecheck, which the earlier tasks already run per-package. The walkthrough is valuable because it is the only end-to-end check of the CLI and MCP surfaces, but the full-suite duplication is mostly redundant. It is acceptable as a final gate.
- **Walkthrough mutates the tracked design:** Steps 5–9 temporarily edit the 245 design file, which is tracked. A crash mid-walkthrough would leave a pending line in a tracked file that Task 3's self-design fixture asserts is clean. Use a copy in a scratch project, as the slice's Walkthrough preamble itself suggests ("a scratch project (or context-forge itself)").

### [NOTE] Verified code anchors

Both `VALID_STATUSES` (frontmatterSchema.ts:32) and `SLICE_DESIGN_TEMPLATE_RELATIVE_PATH` (guides/types.ts:315) exist as the task file cites. I did not verify the other line-number anchors in the Context Summary.

### [NOTE] Task 0 pre-flight is lightweight but appropriate

Task 0 has no commit and is small, but it handles branch creation and the baseline, so keeping it separate is reasonable.

### Run Digest

- Response length: 5558 chars
- Response is newline-free: no
- Tool calls made: 3
- Tool calls failed: 0
- Stop reason: end_turn
- Output budget: backend default
- System prompt: preset+append
- Settings sources: project
- Reasoning characters: 0
- Effort: backend default
- Turns: 4
- Tokens — prompt / cached / cache write / completion / reasoning: 174538 / 89256 / 85276 / 2617 / not computed
- Duration: 22.8 s
- Cost: $0.38 (provider)
- `## Summary` located: yes
- `## Findings` located: yes
- Finding-shaped matches — whole response: 7
- Finding-shaped matches — inside fences: 0
- Finding-shaped matches — in findings section: 7
- Finding-shaped matches — surviving validation: 7
