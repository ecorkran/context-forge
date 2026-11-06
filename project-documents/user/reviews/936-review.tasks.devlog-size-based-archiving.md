---
docType: review
layer: project
reviewType: tasks
slice: devlog-size-based-archiving
conventionsSource: AGENTS.md
projectRules: []
project: context-forge
verdict: CONCERNS
verdictSource: stated
sourceDocument: project-documents/user/tasks/936-tasks.devlog-size-based-archiving.md
aiModel: claude-sonnet-5-5
aiProfile: sdk
status: complete
dateCreated: 20261105
dateUpdated: 20261105
reviewedSha: 75862770b5f81c5a71fe92de085965fbced04a81
revision_number: 2
toolsGiven: [read_file, list_files, grep]
toolCallsMade: 2
turns: 3
promptTokens: 100712
cachedTokens: 11198
cacheWriteTokens: 89510
completionTokens: 4875
durationSeconds: 40.7
costUsd: 0.408688
costBasis: provider
runId: run-20261106-p5-a04af627
squadronVersion: 0.24.22
findings:
  - id: F001
    severity: pass
    category: coverage
    summary: "Success criteria coverage"
    location: "project-documents/user/tasks/936-tasks.devlog-size-based-archiving.md"
  - id: F002
    severity: concern
    category: sequencing
    summary: "Task 8 does not say where `applyFixes` gets `maxBytes` and today's date"
    location: "project-documents/user/tasks/936-tasks.devlog-size-based-archiving.md:161"
  - id: F003
    severity: concern
    category: task-sizing
    summary: "Task 4 is too large for one task"
    location: "project-documents/user/tasks/936-tasks.devlog-size-based-archiving.md:91-101"
  - id: F004
    severity: concern
    category: proportionality
    summary: "More task structure than the slice needs"
    location: "project-documents/user/tasks/936-tasks.devlog-size-based-archiving.md:77-80"
  - id: F005
    severity: note
    category: commit-placement
    summary: "Long uncommitted span across Tasks 6–8T"
    location: "project-documents/user/tasks/936-tasks.devlog-size-based-archiving.md:179"
  - id: F006
    severity: note
    category: commit-placement
    summary: "Final commit marker follows a verification-only task"
    location: "project-documents/user/tasks/936-tasks.devlog-size-based-archiving.md:194"
---

# Review: tasks — slice 936

**Verdict:** CONCERNS
**Model:** claude-sonnet-5-5

## Findings

### [PASS] Success criteria coverage

Each success criterion has a task, and the test requirements are covered as follows.
- Criteria 1 and 2 map to Tasks 2/2T and 4/4T.
- Criterion 3 maps to Task 1/1T.
- Criterion 4 maps to the squadron-format fixture in 1T/4T and walkthrough step 6 in Task 10.
- Criterion 5 maps to Tasks 4T and 10.
- Criterion 6 maps to Tasks 4T and 5T.
- Criterion 7 maps to Tasks 6–8T. That includes the `workflow_check` test and the `auto_fix` test.
- Criterion 8 maps to Tasks 2T and 6T.
- Criterion 9 maps to Tasks 7T and 8T.
- Criterion 10 maps to the concurrent-edit and re-run test in 4T.

The regression gate on the three existing test files and the merge-dedup test (D8) are also covered. No task falls outside a criterion or a design decision.

### [CONCERN] Task 8 does not say where `applyFixes` gets `maxBytes` and today's date

Task 8 has `applyFixes` call `archiveDevlog` "with the finding's detail". D9 fixes that detail as `{ targetBytes, projectName }`. Task 4 gives `archiveDevlog` options of checkout path, max and target bytes, project name, today's date and dry-run. Task 4 also does a stat-first check against the max and calls `assertDevlogLimits(max, target)`.

Two required inputs are missing from the fix path:
- `maxBytes` is not in the detail.
- Today's date has no stated source, and Task 4 forbids an inline clock.

An implementer would have to guess. The options are to re-read config inside `applyFixes` or to widen the detail, and widening it contradicts D9. Add a step to Task 8 saying `applyFixes` reads `devlog.max_bytes` from the checker's `ConfigManager` and takes the date from the same source other fixes use. If neither is in scope, `archiveDevlog` should take only the target and skip the stat-first limit check when called from the fix path.

### [CONCERN] Task 4 is too large for one task

Task 4 bundles at least six separable responsibilities:
- Constants and the `ProjectModelBuilder` swap.
- The stat-first and read/decode ordering.
- New-archive formatting.
- Prepend into an existing archive.
- Idempotence.
- The concurrent-edit guard and failure reporting.

Its test task 4T lists about ten cases. The file is likely to pass the ~300-line guideline.

Split out an archive-file composer, covering the D6 new-file format and the insert-before-first-dated-heading logic, as its own small module, task and test. Then `archiveDevlog` is left as orchestration: order, guard and errors.

Also, 4T's concurrent-edit test needs "an injectable hook or a mocked read at the re-read point", but Task 4 never specifies that seam. Task 4 should name it. A named seam is better than a mock keyed to read-call count.

### [CONCERN] More task structure than the slice needs

These items could be cut or merged.
- **Commit-only tasks:** Tasks 2C, 4C, 5C and 8C only run format, lint, typecheck and tests. The `**Commit**:` marker already implies that, so fold each into the preceding test task's Success line.
- **Trivial case:** 3T's "both keys are shared scope" case is a trivial assertion. Drop it, or fold it into the defaults test.
- **Overlapping tests:** 6T and 7T both assert that an over-limit project yields one finding, and 8T repeats the `auto_fix` and multi-checkout paths. Keep the 7T line that covers a checker run, and trim 6T to builder-specific cases.
- **Restated design:** Tasks 1, 6 and 8 repeat design tables and rules (D2 heading rules, the API Contracts finding table, D9 per-function changes) nearly verbatim. Referencing D2, D3 and the API Contracts table and listing only the exceptions would shorten the file and avoid drift.

### [NOTE] Long uncommitted span across Tasks 6–8T

There is no commit between 4C and 8C, so six implementation and test tasks (6–8T) land in one commit. The note explains why: the finding is marked fixable in Task 6 and only works once Task 8 lands. The reasoning is sound and the markers sit at working, tested points. If the span feels risky, moving Task 8 ahead of Tasks 6 and 7 would allow a commit after 8T. Task 8's `applyFixes` change needs only the Task 6 type additions, so those would have to move with it. This is optional.

### [NOTE] Final commit marker follows a verification-only task

The last `docs:` commit sits after Task 10, whose steps change nothing and end with a clean `git status`. Only the README change from Task 9 is committed. This is acceptable. Putting the marker after Task 9 would match the commit message and keep Task 10 as the final gate.

### Run Digest

- Response length: 5379 chars
- Response is newline-free: no
- Tool calls made: 2
- Tool calls failed: 0
- Stop reason: end_turn
- Output budget: backend default
- System prompt: preset+append
- Settings sources: project
- Reasoning characters: 0
- Effort: backend default
- Turns: 3
- Tokens — prompt / cached / cache write / completion / reasoning: 100712 / 11198 / 89510 / 4875 / not computed
- Duration: 40.7 s
- Cost: $0.41 (provider)
- `## Summary` located: yes
- `## Findings` located: yes
- Finding-shaped matches — whole response: 6
- Finding-shaped matches — inside fences: 0
- Finding-shaped matches — in findings section: 6
- Finding-shaped matches — surviving validation: 6

## Resolution

- [pass] Success criteria coverage: no change needed.
- [concern] Task 8 inputs for `applyFixes`: fixed. Task 8 now says `maxBytes` comes from `readDevlogLimits` on the checker's `ConfigManager`, `targetBytes` and `projectName` from the finding's detail, and today's date from the date source `applyFixes` already uses.
- [concern] Task 4 too large: rejected. Task 4 was split once and merged back after an earlier review found the split over-structured, and this review also asks for less structure. It stays one task, with its tests in 4T.
- [concern] More task structure than needed: fixed. The separate 2C, 4C, 5C and 8C commit tasks are removed. Each commit marker stays, with a plain "before committing, run..." line above it.
- [note] Long uncommitted span across Tasks 6–8T: rejected. The review calls the reasoning sound and the reorder optional. Reordering would also move the Task 6 type additions into Task 8 and rework the dependencies.
- [note] Final commit marker after a verification-only task: fixed. The `docs:` marker now follows Task 9, and Task 10 is stated to be a final gate with no marker.
