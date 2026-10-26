---
docType: review
layer: project
reviewType: tasks
slice: docs-and-guide-alignment
conventionsSource: AGENTS.md
projectRules: []
project: context-forge
verdict: CONCERNS
verdictSource: stated
sourceDocument: project-documents/user/tasks/272-tasks.docs-and-guide-alignment.md
aiModel: claude-sonnet-5-5
aiProfile: sdk
status: complete
dateCreated: 20261026
dateUpdated: 20261026
reviewedSha: c53d750a674e034e7af0e72cc65d339dbe1b76c4
revision_number: 1
toolsGiven: [read_file, list_files, grep]
toolCallsMade: 2
turns: 3
promptTokens: 98979
cachedTokens: 8843
cacheWriteTokens: 90132
completionTokens: 5102
durationSeconds: 40.9
costUsd: 0.413175
costBasis: provider
runId: run-20261026-p5-f0c76bb8
squadronVersion: 0.24.5
findings:
  - id: F001
    severity: pass
    category: coverage
    summary: "Success criteria coverage"
    location: "project-documents/user/tasks/272-tasks.docs-and-guide-alignment.md"
  - id: F002
    severity: pass
    category: sequencing
    summary: "Sequencing and test-with pattern"
    location: "project-documents/user/tasks/272-tasks.docs-and-guide-alignment.md:92-116"
  - id: F003
    severity: concern
    category: sequencing
    summary: "Validation never runs if task 11 blocks"
    location: "project-documents/user/tasks/272-tasks.docs-and-guide-alignment.md:203"
  - id: F004
    severity: concern
    category: proportionality
    summary: "Task file is heavier than a docs-mostly, effort-2 slice needs"
    location: "project-documents/user/tasks/272-tasks.docs-and-guide-alignment.md:136-143"
  - id: F005
    severity: note
    category: sequencing
    summary: "First-step precondition conflicts with current repo state"
    location: "project-documents/user/tasks/272-tasks.docs-and-guide-alignment.md:57"
  - id: F006
    severity: note
    category: risk
    summary: "Guide-restore command in 11.1 is broader than needed"
    location: "project-documents/user/tasks/272-tasks.docs-and-guide-alignment.md:203"
  - id: F007
    severity: pass
    category: clarity
    summary: "Task sizing and clarity for a junior implementer"
    location: "project-documents/user/tasks/272-tasks.docs-and-guide-alignment.md:126-134"
---

# Review: tasks — slice 272

**Verdict:** CONCERNS
**Model:** claude-sonnet-5-5

## Findings

### [PASS] Success criteria coverage

Each criterion from the slice design maps to a task:
- **Stale-text search:** 9.1 and 12.1.
- **No doc tells users to adopt via `cf build`, or describes adoption steps in `cf next`:** 6.1 and 7.1.
- **Reference rows and links:** 7.1 and 8.1, checked in 9.1.
- **JSON examples match the build:** 5.1 and 5.3.
- **Guide text at the new minimum:** 11.1.
- **Delivered prompt names Adoption Inputs:** 11.3, step 5.
- **Old-guide warning:** 4.1, 4.2 and 11.3, step 6.
- **`MIN_GUIDE_VERSION` equals the release tag:** 11.2.
- **`pureBuild.test.ts` writes no comprehension doc:** 3.2.
- **One test per D4 case:** 4.2, five cases.
- **Hand-offs to the guide and squadron sessions:** 2.1 and 10.1.
- **Full suite and golden tests:** 12.1.

No task lacks a criterion. The slice has no NFR, so no load-test or CI-gating task is needed.

### [PASS] Sequencing and test-with pattern

There are no circular dependencies.
- The contract document (task 5) comes before the squadron hand-off (task 10), which needs its commit hash.
- The `MIN_GUIDE_VERSION` raise (task 11) is last, after the docs work, and its dependency on the external release is stated.
- Tests for the `cf prompt get` warning follow the implementation immediately (4.1, 4.2). Fixture changes are committed together with the suites that exercise them (3.3).
- Commits are spread through the file: after tasks 3, 4, 5, 6, 7, 8, 11 and 12.

### [CONCERN] Validation never runs if task 11 blocks

11.1 says to leave "tasks 11–12 unchecked, and stop" when no release carries D3. The slice's only full-workspace validation (12.1: `pnpm -r build/lint/typecheck/test`, golden tests, final stale-text re-run) therefore never runs against tasks 1–10. Those tasks are the bulk of the slice, and the design says they can land without the release. Run the full-suite checks of 12.1 once before task 11, or let 11.1 hand off to 12.1's non-version-dependent checks. Leave only the version-dependent items (11.2–11.4) blocked.

### [CONCERN] Task file is heavier than a docs-mostly, effort-2 slice needs

The file has 12 task groups and about 25 subtasks. Several can be merged without losing coverage:
- **5.3 repeats 5.1.** Both run `cf detect --json` and the error case against the local build. Fold the comparison into 5.2's success check, or fold 5.2's example insertion into 5.1.
- **Commit-only subtasks:** 4.3, 5.4 and 6.2 hold nothing but a commit, and 11.4 adds a commit step. Make the commit the last step of 4.2, 5.2, 6.1 and 11.3 as 3.3, 7.1 and 8.1 already do.
- **9.1 repeats checks already made.** Its walkthrough step 2 re-runs greps that 7.1 and 8.1 already state as success checks. Keep step 1 as the sweep and drop the duplicate step 2 greps, or drop the per-task grep checks in 7.1 and 8.1.

### [NOTE] First-step precondition conflicts with current repo state

1.1 requires an empty `git status --short`. At the start of this review the status shows this task file as modified (` M project-documents/user/tasks/272-tasks.docs-and-guide-alignment.md`). Planning artifacts commit directly to the target, so the task file should be committed before implementation starts. Otherwise 1.1's stop condition fires immediately.

### [NOTE] Guide-restore command in 11.1 is broader than needed

`git checkout -- project-documents/ai-project-guide` discards any uncommitted tracked changes in the whole guide directory. It also leaves untracked files that the update added. Before the revert, check that `git status` shows only the `cf guides update` changes there. Alternatively, record `git status` right before the update so the revert undoes exactly that delta.

### [PASS] Task sizing and clarity for a junior implementer

Tasks have concrete success checks, usually a grep with a `clean` token or a named test file. Values that could be hallucinated are read from tool output rather than typed: the version in 11.2, the paths and hashes in 10.1. The BLOCKED handling for the missing session and missing release follows the project rule. The largest task, 5.2 (effort 3), is bounded by pointing at the code definitions rather than re-listing the schema, which avoids duplicating the schema.

### Run Digest

- Response length: 5207 chars
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
- Tokens — prompt / cached / cache write / completion / reasoning: 98979 / 8843 / 90132 / 5102 / not computed
- Duration: 40.9 s
- Cost: $0.41 (provider)
- `## Summary` located: yes
- `## Findings` located: yes
- Finding-shaped matches — whole response: 7
- Finding-shaped matches — inside fences: 0
- Finding-shaped matches — in findings section: 7
- Finding-shaped matches — surviving validation: 7
