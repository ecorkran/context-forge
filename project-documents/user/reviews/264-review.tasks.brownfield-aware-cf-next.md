---
docType: review
layer: project
reviewType: tasks
slice: brownfield-aware-cf-next
conventionsSource: AGENTS.md
projectRules: []
project: context-forge
verdict: CONCERNS
verdictSource: stated
sourceDocument: project-documents/user/tasks/264-tasks.brownfield-aware-cf-next.md
aiModel: claude-sonnet-5-5
aiProfile: sdk
status: complete
dateCreated: 20261023
dateUpdated: 20261023
reviewedSha: a07a47146e23d93f4f9d602c4c33656a4db0273d
revision_number: 1
toolsGiven: [read_file, list_files, grep]
toolCallsMade: 2
turns: 3
promptTokens: 98725
cachedTokens: 11222
cacheWriteTokens: 87499
completionTokens: 4043
durationSeconds: 38.2
costUsd: 0.39229
costBasis: provider
runId: run-20261023-p5-ad1e6a4a
squadronVersion: 0.23.7
findings:
  - id: F001
    severity: pass
    category: coverage
    summary: "Success-criteria coverage is complete"
    location: "project-documents/user/tasks/264-tasks.brownfield-aware-cf-next.md"
  - id: F002
    severity: pass
    category: sequencing
    summary: "Sequencing and test-with pattern are sound"
    location: "project-documents/user/tasks/264-tasks.brownfield-aware-cf-next.md"
  - id: F003
    severity: concern
    category: test-coverage
    summary: "Task 10 commits `gatherAdoptionInputs` with no tests"
    location: "project-documents/user/tasks/264-tasks.brownfield-aware-cf-next.md"
  - id: F004
    severity: concern
    category: coverage
    summary: "Task 13 parity coverage is narrower than the success criterion"
    location: "project-documents/user/tasks/264-tasks.brownfield-aware-cf-next.md"
  - id: F005
    severity: concern
    category: proportionality
    summary: "Task granularity is heavy for a single-module navigator change"
    location: "project-documents/user/tasks/264-tasks.brownfield-aware-cf-next.md"
  - id: F006
    severity: note
    category: clarity
    summary: "Task 14 has a hedged format step"
    location: "project-documents/user/tasks/264-tasks.brownfield-aware-cf-next.md"
---

# Review: tasks — slice 264

**Verdict:** CONCERNS
**Model:** claude-sonnet-5-5

## Findings

### [PASS] Success-criteria coverage is complete

Each Functional Requirement in the slice design maps to a task:
- **Declined, unset and D2 warning:** Task 11T item 1.
- **`in_progress` at Phase 0:** Task 11T item 2.
- **`in_progress` outside Phase 0 (D5):** Task 11T item 3.
- **`complete` branches:** Task 11T item 4.
- **Active slice unchanged:** Task 11T item 5.
- **Read-only:** Task 11T item 6.
- **Out-of-enum state (D7):** Task 11T item 7.
- **Arch gate during adoption:** Task 12T.
- **Parity:** Task 13.

The Technical Requirements are covered too:
- **`decideAdoptionNav` rows and D4 order pin:** Task 5T.
- **`findExistingStatePlan` cases, including the unreadable-plan case:** Task 2T.
- **D8 lint rule, with a check that it fires:** Task 4.
- **This repo's `cf next` output unchanged:** Tasks 0B and 14.

Every task traces to a design item or to an approved resolution (R1–R7). I found no scope creep.

### [PASS] Sequencing and test-with pattern are sound

- **Dependencies:** Task 1 → 2 → 3 → 4 follows the shared-reads-first order. Task 7 (`findFirstNotCompleteEntry`) and Task 9 (fixture helper) come before Task 10 and Task 11T, which use them. Task 8 (`gateBlockAction`) comes before Task 12. I found no circular dependencies.
- **Test placement:** Test tasks follow their implementation tasks, and commits fall at the end of each test task (1T, 2T, 3, 4, 5T, 6T, 7, 8, 9, 10, 11T, 12T, 13, 14).

### [CONCERN] Task 10 commits `gatherAdoptionInputs` with no tests

Task 10 is the I/O-heavy reader and holds the ENOENT handling, the registered-plan resolution and the open-entry logic. It is committed as `feat:` on its own, and its tests only arrive in Task 11T, two tasks later. This weakens the test-with pattern, and the commit sits on the slice branch with no coverage. Either fold Task 10 into Task 11, with one commit at the end of 11T, or state that Task 10's commit is intentionally untested. Folding is cleaner because no code is exercised before it is wired.

### [CONCERN] Task 13 parity coverage is narrower than the success criterion

The design's Parity bullet says `workflow_next` matches `cf next --json` "for every adoption fixture", including warnings. Task 13 checks three fixtures on the MCP side (`in_progress` `architecture` step, `complete` `register-plan`, `complete` adopted) and only one on the CLI side. None of them is a `warn` case, so `warnings` parity is never tested on a fixture that actually carries a warning. Add the D2 warn fixture (unset, Phase 0, concept present, no planning artifact), or limit the stated claim to the fixtures that are tested.

### [CONCERN] Task granularity is heavy for a single-module navigator change

There are 15 implementation tasks and 9 test tasks (24 in total, counting 0 and 0B). Several are very small and could be merged:
- **Tasks 12 and 12T:** a handful of lines and one test. Merge them into Tasks 11 and 11T. Task 12's success check ("no more than ~40 lines across Tasks 11 and 12") is an arbitrary budget that doesn't trace to a success criterion. Drop it.
- **Tasks 5/5T and 6/6T:** both pairs edit the same new module. Merging them into one task with one test file would remove a task pair and a commit without losing coverage.
- **Tasks 7 and 8:** two tiny `refactor:` extractions with unchanged tests. They could share one task and one commit, such as `refactor: extract shared navigator helpers`.
- **Task 1T item 6 and Task 2T item 6:** each adds a `chmod 000` filesystem test that skips on Windows and root. The D7 design requires only one unreadable-directory test and one unreadable-plan test, so these are within the criteria. Keep exactly one of each and don't add more.

### [NOTE] Task 14 has a hedged format step

"Format (if the repo has a format script)" leaves a junior implementer guessing. Check the root `package.json` scripts when writing the task and name the exact command, or remove the step if lint covers formatting.

### Run Digest

- Response length: 4846 chars
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
- Tokens — prompt / cached / cache write / completion / reasoning: 98725 / 11222 / 87499 / 4043 / not computed
- Duration: 38.2 s
- Cost: $0.39 (provider)
- `## Summary` located: yes
- `## Findings` located: yes
- Finding-shaped matches — whole response: 6
- Finding-shaped matches — inside fences: 0
- Finding-shaped matches — in findings section: 6
- Finding-shaped matches — surviving validation: 6
