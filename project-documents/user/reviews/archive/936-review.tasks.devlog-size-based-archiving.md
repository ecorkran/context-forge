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
reviewedSha: 21acbd30cd50c0383a55c8c3a34c2bcface8750b
revision_number: 1
toolsGiven: [read_file, list_files, grep]
toolCallsMade: 2
turns: 3
promptTokens: 100716
cachedTokens: 11198
cacheWriteTokens: 89514
completionTokens: 3847
durationSeconds: 33.9
costUsd: 0.398424
costBasis: provider
runId: run-20261106-p5-a04af627
squadronVersion: 0.24.22
findings:
  - id: F001
    severity: pass
    category: coverage
    summary: "Success-criterion coverage is complete"
    location: "project-documents/user/tasks/936-tasks.devlog-size-based-archiving.md:44-200"
  - id: F002
    severity: concern
    category: sequencing
    summary: "Commit marker after Task 7 lands a state where the fixable finding cannot be fixed"
    location: "project-documents/user/tasks/936-tasks.devlog-size-based-archiving.md:161-164"
  - id: F003
    severity: concern
    category: scoping
    summary: "Ownership of the `target >= max` check is ambiguous across Tasks 3, 4, 5 and 6"
    location: "project-documents/user/tasks/936-tasks.devlog-size-based-archiving.md:84"
  - id: F004
    severity: concern
    category: proportionality
    summary: "Task 4 and its guard are split into four tasks where two would do"
    location: "project-documents/user/tasks/936-tasks.devlog-size-based-archiving.md:105-113"
  - id: F005
    severity: note
    category: commits
    summary: "Commit marker cadence otherwise fits"
    location: "project-documents/user/tasks/936-tasks.devlog-size-based-archiving.md:80"
---

# Review: tasks — slice 936

**Verdict:** CONCERNS
**Model:** claude-sonnet-5-5

## Findings

### [PASS] Success-criterion coverage is complete

- **SC1:** Tasks 2, 2T, 4, 4T.
- **SC2:** Tasks 2T and 4T.
- **SC3:** Task 1T.
- **SC4:** Task 4T (prepend into a squadron-format archive) and Task 10 step 6.
- **SC5:** Task 10 (`cf validate frontmatter`).
- **SC6:** Tasks 4T and 5T.
- **SC7:** Tasks 7T and 8T, including the `workflow_check` test and the `auto_fix` path.
- **SC8:** Tasks 2T and 6T.
- **SC9:** Task 8T (not-owner, file-dirty, single commit) and the Task 7T merge test (D8).
- **SC10:** Task 4bT.

The Technical Requirements are also covered: the conservation test, the real-format parser fixtures, the non-UTF-8 archive test, the non-ENOENT `stat` test, the regression gate on the three existing test files, the pre-commit-hook restore test and the README task. No restated NFR exists, so no load test or CI wiring task is needed. No task is scope creep. Every task, including the `ProjectModelBuilder.ts:314` constant swap, traces to the design.

### [CONCERN] Commit marker after Task 7 lands a state where the fixable finding cannot be fixed

- **The gap:** Task 6 adds the `archive-devlog` fixAction and makes the finding `fixable`. Task 7 wires the rule into `checkAll`.
- **When `applyFixes` handles it:** only in Task 8.
- **Why the marker is wrong:** the `**Commit**` at 7C therefore captures a build where `cf check` advertises `cf check --fix` and `workflow.auto_fix` would try to apply an action nothing handles. That is not a working, tested point.
- **Fix:** move the 7C marker to after Task 8T and merge 7C and 8C into one commit. Alternatively, have Task 7 emit the finding as non-fixable until Task 8 lands.
- **Related risk:** Task 6 widens the `fixAction.type` union. If any exhaustive switch exists, the Task 6 build check could fail before Task 8 touches it. Task 6 should say to fix such switches there.

### [CONCERN] Ownership of the `target >= max` check is ambiguous across Tasks 3, 4, 5 and 6

- **What the tasks say:** Task 3 puts the pair check in a shared helper that reads config and throws. Task 4's `archiveDevlog` receives `max` and `target` as plain options. Task 4T nevertheless tests a `target >= max` error from the writer. Task 6 takes "config values" and must emit an `error` finding for the invalid pair.
- **What is unspecified:** which layer calls the helper, and whether `archiveDevlog` re-validates its inputs.
- **Risk:** an implementer could build the check in three places (DRY violation) or leave the Task 4T test with nothing to assert.
- **Fix:** state that the caller (CLI, `ConsistencyChecker` or finding builder) calls the helper. Either have `archiveDevlog` assert the invariant itself, or move the 4T case to the CLI and finding tests.

### [CONCERN] Task 4 and its guard are split into four tasks where two would do

- **What is split:** Tasks 4b and 4bT carve the concurrent-edit re-read and failure reporting out of Task 4 and 4T. Both edit `archiveDevlog.ts` and `archiveDevlog.test.ts`, and Task 4 already defers to 4b in its last step.
- **Why merging works:** merging 4b into Task 4 gives one writer task at effort 5–6 and one test task, and nothing is committed between them.
- **If you keep them:** that is acceptable, since the combined effort is large. The split only has value if you want a smaller review unit.
- **Smaller trim:** Task 8T lists seven scenarios. Each traces to a criterion, so none is padding, but the `workflow.auto_fix` and `fixErrors` cases could share one fixture with the earlier bullets.

### [NOTE] Commit marker cadence otherwise fits

- **Markers 2C, 4C and 5C:** each sits after a tested, buildable unit (parser and planner, writer and config, CLI).
- **Final marker:** it follows the README and walkthrough, so the last commit is verified.
- **One note:** it carries a `docs:` message. Task 10 can only produce changes if the walkthrough finds a defect, and those would belong to the same commit.

### Run Digest

- Response length: 4724 chars
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
- Tokens — prompt / cached / cache write / completion / reasoning: 100716 / 11198 / 89514 / 3847 / not computed
- Duration: 33.9 s
- Cost: $0.40 (provider)
- `## Summary` located: yes
- `## Findings` located: yes
- Finding-shaped matches — whole response: 5
- Finding-shaped matches — inside fences: 0
- Finding-shaped matches — in findings section: 5
- Finding-shaped matches — surviving validation: 5
