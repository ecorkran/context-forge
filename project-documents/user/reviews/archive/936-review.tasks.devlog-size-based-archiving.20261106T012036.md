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
reviewedSha: 9b583abdf2319488ae5ce35f5a93a029ebf81f7a
toolsGiven: [read_file, list_files, grep]
toolCallsMade: 2
turns: 3
promptTokens: 100245
cachedTokens: 8831
cacheWriteTokens: 91410
completionTokens: 3460
durationSeconds: 29.6
costUsd: 0.401902
costBasis: provider
runId: run-20261106-p5-a04af627
squadronVersion: 0.24.22
findings:
  - id: F001
    severity: concern
    category: sequencing
    summary: "Task 6 and Task 7 depend on type changes that Task 8 introduces"
    location: "project-documents/user/tasks/936-tasks.devlog-size-based-archiving.md:129"
  - id: F002
    severity: concern
    category: test-coverage
    summary: "The `workflow_check` criterion may have no test"
    location: "project-documents/user/tasks/936-tasks.devlog-size-based-archiving.md:146"
  - id: F003
    severity: note
    category: scope
    summary: "Writer task (Task 4) is large, and the CLI tests repeat some of its error cases"
    location: "project-documents/user/tasks/936-tasks.devlog-size-based-archiving.md:89"
  - id: F004
    severity: note
    category: traceability
    summary: "The D10 guide request is not a task"
    location: "project-documents/user/slices/936-slice.devlog-size-based-archiving.md:356"
  - id: F005
    severity: pass
    category: uncategorized
    summary: "Success criteria coverage"
    location: "project-documents/user/tasks/936-tasks.devlog-size-based-archiving.md"
  - id: F006
    severity: pass
    category: uncategorized
    summary: "Commit markers and test-with pattern"
    location: "project-documents/user/tasks/936-tasks.devlog-size-based-archiving.md:78"
---

# Review: tasks — slice 936

**Verdict:** CONCERNS
**Model:** claude-sonnet-5-5

## Findings

### [CONCERN] Task 6 and Task 7 depend on type changes that Task 8 introduces

Task 6 builds a `ConsistencyFinding` whose `fixAction` has type `archive-devlog` and an `additionalPaths` field. Task 6's success check is `pnpm -r build` passes. The type-union and `additionalPaths` changes in `types.ts` are only made in Task 8 (line 156). So Task 6's build check cannot pass as written, and the Task 6T and 7T tests can't compile either.

There is a second problem at the Task 7C commit (line 153). That commit would ship a rule that emits a fixable `archive-devlog` finding, but `applyFixes` and the routed-fix path can't handle it until Task 8. `cf check --fix` would therefore offer a fix that doesn't work at that commit. Two ways to fix this:
- Move the `types.ts` bullet (and ideally all of Task 8) ahead of Task 6.
- Move the `types.ts` additions into Task 6 and move the Task 7C marker to after Task 8T. That leaves the rule and its fix handling in one commit.

### [CONCERN] The `workflow_check` criterion may have no test

Success criterion 7 requires that the same findings appear from `workflow_check`. Task 7T only says to add a test "if a `workflow_check` test exists", so it can be skipped and nothing else covers that criterion. Pick one: name the existing MCP test file to extend, or state that the shared-checker unit tests are the accepted coverage and drop the conditional.

### [NOTE] Writer task (Task 4) is large, and the CLI tests repeat some of its error cases

Task 4 packs the stat gate, strict UTF-8 reads, the new-archive format, prepend and append, idempotence, write ordering, the concurrent-edit re-read and the error reporting into one effort-4 task. It has a single test task and a single commit. That is acceptable because the pieces share one function and the test task follows immediately. A junior implementer may still find it heavy, so it is worth considering a split between "plan and format" and "write order and failures".

Task 5T (line 118) re-tests the missing-file, non-UTF-8 and changed-during-run rows that Task 4T already covers. Trimming 5T to output wording and exit codes would reduce overlap without losing coverage.

### [NOTE] The D10 guide request is not a task

The Integration Requirements list sending the request to the guide agent after release. It is post-release and outside the implementation, so leaving it out of the task file is reasonable. Make sure it is handled at release time.

### [PASS] Success criteria coverage

- **SC1 and SC2:** Tasks 2, 2T, 4, 4T and 5.
- **SC3:** Task 1T, including the real-DEVLOG fixture and the code-fence case.
- **SC4 and SC5:** Task 4T (prepend into an existing archive) and Task 10 (squadron layout, `cf validate frontmatter`).
- **SC6 and SC8:** Tasks 4T, 5T, 2T and 6T.
- **SC7:** Tasks 6, 7, 8 and 8T, including the `workflow.auto_fix` path.
- **SC9:** Tasks 7T (merge tests) and 8T (multi-path readiness, commit, not-owner).
- **SC10:** Task 4T (concurrent edit, re-run with no duplicates).
- **README criterion:** Task 9.
- **Regression gate:** the unmodified-existing-tests requirement is enforced in Tasks 7T and 8T through new or added-only test files.

The slice states no NFR, so no load test or CI gating task is needed.

### [PASS] Commit markers and test-with pattern

Each implementation task is immediately followed by its test task. The `**Commit**:` markers are plain lines at tested points (after 2C, 4C, 5C, 7C, 8C and the end). Apart from the Task 6/7 issue above, each commit leaves a working state. Task 0 creates the slice branch, and no task merges or pushes.

### Run Digest

- Response length: 4402 chars
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
- Tokens — prompt / cached / cache write / completion / reasoning: 100245 / 8831 / 91410 / 3460 / not computed
- Duration: 29.6 s
- Cost: $0.40 (provider)
- `## Summary` located: yes
- `## Findings` located: yes
- Finding-shaped matches — whole response: 6
- Finding-shaped matches — inside fences: 0
- Finding-shaped matches — in findings section: 6
- Finding-shaped matches — surviving validation: 6
