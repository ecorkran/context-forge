---
docType: review
layer: project
reviewType: tasks
slice: guide-exclude-globs-for-tarball-installs
targetKind: slice
rulesSource: project
project: context-forge
verdict: CONCERNS
verdictSource: stated
sourceDocument: project-documents/user/tasks/212-tasks.guide-exclude-globs-for-tarball-installs.md
aiModel: claude-sonnet-5-5
status: complete
dateCreated: 20261003
dateUpdated: 20261003
reviewedSha: 93f3a7d12b3807be195cbbd3d8bc7406dd1c57be
toolsGiven: [read_file, list_files, grep]
toolCallsMade: 2
durationSeconds: 35.5
squadronVersion: 0.18.3
findings:
  - id: F001
    severity: concern
    category: completeness
    summary: "No task merges the slice branch into the target"
    location: "project-documents/user/tasks/212-tasks.guide-exclude-globs-for-tarball-installs.md:73-83"
  - id: F002
    severity: concern
    category: sequencing
    summary: "Shared record reader is introduced two tasks after its first use"
    location: "project-documents/user/tasks/212-tasks.guide-exclude-globs-for-tarball-installs.md:238-244"
  - id: F003
    severity: concern
    category: task-sizing
    summary: "Task 8 is too large for one task"
    location: "project-documents/user/tasks/212-tasks.guide-exclude-globs-for-tarball-installs.md:222-253"
  - id: F004
    severity: concern
    category: error-handling
    summary: "`status()` behavior on an invalid hand-edited key is undefined"
    location: "project-documents/user/tasks/212-tasks.guide-exclude-globs-for-tarball-installs.md:302-308"
  - id: F005
    severity: concern
    category: test-coverage
    summary: "Test gaps against the slice's success criteria"
    location: "project-documents/user/tasks/212-tasks.guide-exclude-globs-for-tarball-installs.md:363-381"
  - id: F006
    severity: note
    category: commit-checkpoints
    summary: "Several implementation tasks have no commit of their own"
    location: "project-documents/user/tasks/212-tasks.guide-exclude-globs-for-tarball-installs.md:124-171"
  - id: F007
    severity: note
    category: nfr
    summary: "No NFR load-test or CI-gating task is needed"
    location: "project-documents/user/slices/212-slice.guide-exclude-globs-for-tarball-installs.md:219"
  - id: F008
    severity: pass
    category: coverage
    summary: "Success-criteria traceability and scope"
    location: "project-documents/user/tasks/212-tasks.guide-exclude-globs-for-tarball-installs.md:85-415"
---

# Review: tasks — slice 212

**Verdict:** CONCERNS
**Model:** claude-sonnet-5-5

## Findings

### [CONCERN] No task merges the slice branch into the target

Task 0 creates the slice branch from `main`, but no final task merges it back. The project Git Rules require a merge into the target (re-read `git.integration_branch`, checkout the target, merge, stop and ask on failure) when slice implementation is done. Task 19 ends with a docs commit on the slice branch and nothing after it. Add a closing task, or state in Task 19 that the merge is a PM action.

### [CONCERN] Shared record reader is introduced two tasks after its first use

Task 8 has `update` read and parse the exclude record inline. Task 11 (lines 303-307) then asks for that parsing to be exported as a shared helper such as `readExcludeRecord(targetDir)`. Following the tasks in order means writing the parsing in Task 8 and extracting it in Task 11, which breaks the project's DRY rule. Define and export the helper in Task 8, and have Task 11 only consume it.

### [CONCERN] Task 8 is too large for one task

Task 8 (effort 3) bundles five changes:
- the constructor change;
- the `isSkippedTarballEntry` refactor;
- unmatched-pattern tracking in the filter;
- record writing;
- the update comparison logic (re-extract, commit message, result flags).

It also carries a conditional file split. Task 9 then tests all of it at once. Split it into two tasks, each followed by its tests:
1. The matcher, constructor and unmatched tracking.
2. The record write/read and the same-version re-extract.

### [CONCERN] `status()` behavior on an invalid hand-edited key is undefined

Task 11 builds `excludeConfigured` from `resolveExclude`, which per Task 10 throws `GuideExcludeError` on a protected or malformed value. A hand-edited bad value would therefore make `cf guides status` fail entirely. The design only requires install and update to fail before downloading, and it does not say what status should do. Task 12 has no test for this case. Decide whether status propagates the error or reports it, state that in Task 11, and add a test.

### [CONCERN] Test gaps against the slice's success criteria

Some behaviors are only covered by the manual walkthrough:
- Task 14 maps `GuideExcludeError` to a user error with no stack trace. Task 15 has no test for it.
- CLI tests for the `excludeIgnored` notice on update, and for the non-tarball ignored line, are not explicit. Task 15 lists the install, update-`excludeChanged` and status cases only.
- "A fresh `cf init` with a pre-set `guide.exclude` installs a filtered guide" is an Integration Requirement. Neither a task nor walkthrough steps 1-10 exercise it.

Add these cases to Task 15 or Task 19.

### [NOTE] Several implementation tasks have no commit of their own

Tasks 1, 3, 5, 6, 8, 10, 11, 13 and 14 have no commit step. Their changes land in the commit of the following test task. Tasks 13 and 14 end up inside Task 15's `feat(cli)` commit, which also carries a core change. Commits are still distributed through the work, not batched at the end, so this is acceptable. Consider a separate commit for Task 13 so the core message builder is not hidden in a CLI commit.

### [NOTE] No NFR load-test or CI-gating task is needed

The slice only asserts that the existing onboarding target is "unaffected". It adds no measurable NFR, so no `tests/load/` task or CI-wiring task is required.

### [PASS] Success-criteria traceability and scope

Each functional and technical criterion in the design maps to a task:

| Criterion | Tasks |
| --- | --- |
| Config validation and protected paths | 1-4 |
| Hand-edit guard | 10, 12 |
| Staging and swap, with failure leaving the guide intact | 6, 7 |
| Same-version re-extract and no-op update | 8, 9 |
| Unmatched warnings | 8, 9, 13 |
| `excludeIgnored` | 10, 12 |
| Status fields | 11, 12, 14 |
| MCP notices | 16 |
| README and key description | 17, 3 |
| Walkthrough | 19 |

No task falls outside the slice's scope. The test-with pattern is followed throughout, and the dependency order (pure module, config key, strategy, manager, CLI/MCP, docs, verification) has no cycles.

### Run Digest

- Response length: 5235 chars
- Response is newline-free: no
- Tool calls made: 2
- Tool calls failed: 0
- Stop reason: end_turn
- Output budget: backend default
- System prompt: preset+append
- Settings sources: project
- Reasoning characters: 0
- Effort: backend default
- Turns: not computed
- Tokens — prompt / cached / completion / reasoning: not computed / not computed / not computed / not computed
- Duration: 35.5 s
- `## Summary` located: yes
- `## Findings` located: yes
- Finding-shaped matches — whole response: 8
- Finding-shaped matches — inside fences: 0
- Finding-shaped matches — in findings section: 8
- Finding-shaped matches — surviving validation: 8
