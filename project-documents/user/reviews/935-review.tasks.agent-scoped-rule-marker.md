---
docType: review
layer: project
reviewType: tasks
slice: agent-scoped-rule-marker
targetKind: slice
rulesSource: project
conventionsSource: AGENTS.md
projectRules: []
project: context-forge
verdict: PASS
verdictSource: stated
sourceDocument: project-documents/user/tasks/935-tasks.agent-scoped-rule-marker.md
aiModel: claude-sonnet-5-5
aiProfile: sdk
status: complete
dateCreated: 20261025
dateUpdated: 20261025
reviewedSha: 846bcb665d0ea07247b592cff17da5c0113bc876
toolsGiven: [read_file, list_files, grep]
toolCallsMade: 2
turns: 3
promptTokens: 90339
cachedTokens: 11222
cacheWriteTokens: 79113
completionTokens: 3145
durationSeconds: 28.9
costUsd: 0.349767
costBasis: provider
squadronVersion: 0.24.1
findings:
  - id: F001
    severity: pass
    category: coverage
    summary: "Success criteria coverage is complete"
    location: "project-documents/user/tasks/935-tasks.agent-scoped-rule-marker.md"
  - id: F002
    severity: pass
    category: sequencing
    summary: "Sequencing, sizing and commit distribution"
    location: "project-documents/user/tasks/935-tasks.agent-scoped-rule-marker.md"
  - id: F003
    severity: note
    category: test-with-pattern
    summary: "Task 2 tests arrive one task later"
    location: "project-documents/user/tasks/935-tasks.agent-scoped-rule-marker.md:44-49"
  - id: F004
    severity: note
    category: design-fidelity
    summary: "Task 4 narrows `live` to composite audiences, without a test"
    location: "project-documents/user/tasks/935-tasks.agent-scoped-rule-marker.md:67"
  - id: F005
    severity: note
    category: test-coverage
    summary: "Closing-count behavior has no assertion"
    location: "project-documents/user/tasks/935-tasks.agent-scoped-rule-marker.md:47"
  - id: F006
    severity: note
    category: clarity
    summary: "Task 5 test location is unspecified"
    location: "project-documents/user/tasks/935-tasks.agent-scoped-rule-marker.md:83"
---

# Review: tasks — slice 935

**Verdict:** PASS
**Model:** claude-sonnet-5-5

## Findings

### [PASS] Success criteria coverage is complete

Each functional and technical requirement has a task:
- **Composite blocks and scoped files:** Tasks 2, 3 and 3T cover the alwaysApply and scoped-file requirements and the skip lines.
- **Byte-identical output on the real guide:** the "snapshot tests pass unchanged" success lines in Tasks 2 and 3 cover this.
- **Manifest prune, unedited and edited:** Task 3T.
- **Parse forms and the block-list case:** Task 1T checks the parse forms and that a valueless key yields no known audiences. Task 5 checks the warning.
- **Unknown-value warning with exit 0:** Task 5.
- **Per-audience resolution rendering:** Tasks 4 and 4T.
- **Inventory `agents` field:** Task 4T.
- **Lint, typecheck and the full suite:** Task 7.
- **Verification Walkthrough:** Task 7.

No task falls outside a success criterion. Task 6 (docs) is listed in the design's Included scope. The slice states no NFRs, so no load test or CI-gating task is needed.

### [PASS] Sequencing, sizing and commit distribution

The order follows the design's Development Approach: parser, then compilers and copiers, then resolutions and inventory, then the warning, then docs, then verification. There are no circular dependencies. Task 2 makes `audience` a required option, and it only needs the Task 1 module. Task 4 depends on the Task 1 parser and does not depend on the filtering in Tasks 2 and 3. Commits sit after Tasks 1T, 3T, 4T, 5, 6 and 7, so none are batched at the end. Each task is small enough for a junior AI to finish, and Task 4 (effort 3) is the largest.

### [NOTE] Task 2 tests arrive one task later

Task 2 has no tests of its own. Task 3T covers the composite blocks, and Tasks 2 and 3 share the Task 3C commit. The task file states this on purpose, and no commit lands without tests. The result is a long gap between the first filtering change and its first test. If a junior implementer drifts, the error will surface late. Splitting out a small test task for the composite blocks before Task 3 would shorten that gap, but this is optional.

### [NOTE] Task 4 narrows `live` to composite audiences, without a test

The design says `live` holds resolutions whose rule is delivered "to at least one audience". Task 4 says "at least one composite audience", which leaves out `cursor`. This is probably intended, because resolutions only render in composite blocks. But a resolution on a `[cursor]`-only rule then drops out of `live` entirely, and Task 4T has no case for that. Either add a one-line case to Task 4T, or confirm that composite-only is the intended reading.

### [NOTE] Closing-count behavior has no assertion

Task 2 changes the closing counts (`📋 Embedded N alwaysApply rules`) to count only the rules written. No test in Task 3T asserts this. The behavior is in the design's Data Flow but not in its Success Criteria, so a single assertion in Task 3T is enough if you want it covered.

### [NOTE] Task 5 test location is unspecified

Task 5 does not say which test file holds the warning tests. Other tasks name `tests/ideInstall/` or `tests/commands/`. Naming the file would remove a small guess for the implementer.

### Run Digest

- Response length: 4049 chars
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
- Tokens — prompt / cached / cache write / completion / reasoning: 90339 / 11222 / 79113 / 3145 / not computed
- Duration: 28.9 s
- Cost: $0.35 (provider)
- `## Summary` located: yes
- `## Findings` located: yes
- Finding-shaped matches — whole response: 6
- Finding-shaped matches — inside fences: 0
- Finding-shaped matches — in findings section: 6
- Finding-shaped matches — surviving validation: 6
