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
verdict: CONCERNS
verdictSource: stated
sourceDocument: project-documents/user/tasks/935-tasks.agent-scoped-rule-marker.md
aiModel: claude-sonnet-5-5
aiProfile: sdk
status: complete
dateCreated: 20261025
dateUpdated: 20261025
reviewedSha: b55f4ec80e0ec2709c19c33c3080fc12d4a3b78e
toolsGiven: [read_file, list_files, grep]
toolCallsMade: 2
turns: 3
promptTokens: 89889
cachedTokens: 8843
cacheWriteTokens: 81042
completionTokens: 3666
durationSeconds: 37.8
costUsd: 0.362455
costBasis: provider
squadronVersion: 0.24.1
findings:
  - id: F001
    severity: pass
    category: coverage
    summary: "Success criteria coverage"
    location: "project-documents/user/tasks/935-tasks.agent-scoped-rule-marker.md"
  - id: F002
    severity: pass
    category: sequencing
    summary: "Sequencing, scope and commits"
    location: "project-documents/user/tasks/935-tasks.agent-scoped-rule-marker.md"
  - id: F003
    severity: concern
    category: maintainability
    summary: "Unknown-value warning could hardcode the known-audience list"
    location: "project-documents/user/tasks/935-tasks.agent-scoped-rule-marker.md (Task 5)"
  - id: F004
    severity: concern
    category: test-coverage
    summary: "Task 5 test omits the valueless-key warning"
    location: "project-documents/user/tasks/935-tasks.agent-scoped-rule-marker.md (Task 5)"
  - id: F005
    severity: concern
    category: sequencing
    summary: "Task 2 has no tests of its own"
    location: "project-documents/user/tasks/935-tasks.agent-scoped-rule-marker.md (Tasks 2, 3, 3T)"
  - id: F006
    severity: note
    category: dry
    summary: "Parser should reuse the existing frontmatter helpers"
    location: "project-documents/user/tasks/935-tasks.agent-scoped-rule-marker.md (Task 1)"
---

# Review: tasks — slice 935

**Verdict:** CONCERNS
**Model:** claude-sonnet-5-5

## Findings

### [PASS] Success criteria coverage

Each functional requirement maps to a task:
- Block filtering per composite file: Task 2, asserted in Task 3T.
- Scoped copiers, the AGENTS.md index and the skip line: Task 3, asserted in Task 3T.
- Byte-identical output on the real guide: the "snapshots pass unchanged" success lines in Tasks 2 and 3.
- Manifest prune of unedited files and kept-with-warning for edited ones: Task 3T.
- Parser forms and the block-list case: Tasks 1 and 1T.
- Unknown-value warning with exit 0: Task 5.
- Per-audience resolution rendering and the inventory field: Tasks 4 and 4T.
- Docs and CHANGELOG: Task 6.
- Lint, typecheck, full suite and the walkthrough: Task 7.

No task falls outside the design. Skills filtering, block-list parsing and per-target audience are explicitly excluded.

### [PASS] Sequencing, scope and commits

- The dependency order is sound. The parser comes first, then the compilers and copiers, then resolutions and the inventory, then the warning, then docs, then verification.
- There are no cycles.
- Commit checkpoints (1C, 3C, 4C, 5C, 6C and the Task 7 commit) are spread through the file rather than batched at the end.
- No merge or push task is written, which matches the Phase 7 rule.
- A single task file with 8 tasks fits the slice, and the test tasks track the design's Technical Requirements without extras.

### [CONCERN] Unknown-value warning could hardcode the known-audience list

Task 5 gives the literal message `(known: claude, agents, copilot, cursor)`. An implementer could copy that string into `installer.ts`. That repeats the audience values outside `RULE_AUDIENCE`, which breaks the project rule to define comparison values once and the design's own "no string literals at call sites" convention. Add a step to derive the list from `RULE_AUDIENCE` (for example, the object's values joined with `, `). Ideally the message builder lives in `ruleAudience.ts` next to the scan.

### [CONCERN] Task 5 test omits the valueless-key warning

The design's success criterion says a block-list `agents:` warns and reaches no output. Task 5 adds the inline-message case to the implementation, but its test line covers only "one warning per unknown value", exit 0, and a clean guide. Task 1T checks the parser for the valueless case, but nothing checks that the install prints the inline-form message. Add one install-level case for a valueless `agents:` that asserts the message and exit 0. It fits in the existing test bullet.

### [CONCERN] Task 2 has no tests of its own

The test-with pattern says tests should follow the implementation task. Task 2 (the compilers) is verified only by "existing snapshots pass", and its filtering tests are deferred until Task 3T, after Task 3 as well. The existing snapshots can't detect a broken filter, because the real guide has no marked rules. Either move the composite-block assertions into a "2T" task before Task 3, or note in Task 2 that they are covered by Task 3T. The first option keeps a failure close to the change that caused it.

### [NOTE] Parser should reuse the existing frontmatter helpers

The design says the parser follows `frontmatter.ts` (`toRecords`, exact `---` fence, and a `---\r` line is not a fence). Task 1 restates the fence behavior but does not tell the implementer to reuse those helpers. Add a short pointer so the fence logic isn't reimplemented.

### Run Digest

- Response length: 4213 chars
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
- Tokens — prompt / cached / cache write / completion / reasoning: 89889 / 8843 / 81042 / 3666 / not computed
- Duration: 37.8 s
- Cost: $0.36 (provider)
- `## Summary` located: yes
- `## Findings` located: yes
- Finding-shaped matches — whole response: 6
- Finding-shaped matches — inside fences: 0
- Finding-shaped matches — in findings section: 6
- Finding-shaped matches — surviving validation: 6
