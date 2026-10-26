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
reviewedSha: 4d282a8395ce46c3dd2e4d37f3fe44ffb6e24b04
toolsGiven: [read_file, list_files, grep]
toolCallsMade: 4
turns: 5
promptTokens: 223118
cachedTokens: 139677
cacheWriteTokens: 83435
completionTokens: 4001
durationSeconds: 33.0
costUsd: 0.388463
costBasis: provider
runId: run-20261026-p5-f0c76bb8
squadronVersion: 0.24.5
findings:
  - id: F001
    severity: pass
    category: coverage
    summary: "Success criteria coverage is complete"
    location: "project-documents/user/tasks/272-tasks.docs-and-guide-alignment.md"
  - id: F002
    severity: pass
    category: sequencing
    summary: "Sequencing and commit distribution"
    location: "project-documents/user/tasks/272-tasks.docs-and-guide-alignment.md"
  - id: F003
    severity: concern
    category: proportionality
    summary: "Task file is overweight for a docs-mostly slice"
    location: "project-documents/user/tasks/272-tasks.docs-and-guide-alignment.md"
  - id: F004
    severity: concern
    category: test-coverage
    summary: "Task 4.2 omits the \"unreadable version marker\" case"
    location: "packages/cli/src/commands/prompt.ts"
  - id: F005
    severity: concern
    category: robustness
    summary: "Hard-coded older version in 11.3 step 6"
    location: "project-documents/user/tasks/272-tasks.docs-and-guide-alignment.md"
  - id: F006
    severity: note
    category: dependencies
    summary: "Task 11.3 depends on the fixture from 5.1"
    location: "project-documents/user/tasks/272-tasks.docs-and-guide-alignment.md"
  - id: F007
    severity: note
    category: accuracy
    summary: "Task 3.5 importer list verified"
    location: "packages/core/src/detection/presentPaths.ts"
---

# Review: tasks — slice 272

**Verdict:** CONCERNS
**Model:** claude-sonnet-5-5

## Findings

### [PASS] Success criteria coverage is complete

Every slice criterion maps to a task. The stale-text search is covered by 9.1 and 12.1. The no-adoption-via-`cf build` criterion is covered by tasks 6 and 7. Listing the primitives in the CLI and MCP READMEs is covered by tasks 7 and 8. The JSON examples are checked in 5.3. The guide content checks and the Adoption Inputs prompt are covered by 11.1 and 11.3 step 5. The old-guide warning is covered by 4.2 and 11.3 step 6. The `MIN_GUIDE_VERSION` raise is 11.2. The `pureBuild.test.ts` cleanup is 3.4. Both hand-offs are covered by tasks 2 and 10. I found no tasks that don't trace to the slice design.

### [PASS] Sequencing and commit distribution

Dependencies are respected. The `cf prompt get` warning (task 4) lands before the contract doc (task 5) that describes it. The contract doc is committed before squadron is messaged. The external-release-dependent `MIN_GUIDE_VERSION` raise is last, with an explicit `BLOCKED:` path. Commits come after each of tasks 3, 4, 5, 6, 7, 8 and 11, not at the end. Test task 4.2 follows implementation task 4.1.

### [CONCERN] Task file is overweight for a docs-mostly slice

The file has 12 task groups and about 35 sub-tasks, nearly all effort 1. Several are one-line edits that each get their own checkbox and success line. Merge them as follows:
- 3.1–3.3: the same one-line change in three fixture stubs. Make it one task with one grep success check.
- 3.5 and 3.6: fold the `presentPaths.ts` comment into the fixtures task, then run the tests once.
- 7.1–7.6: six CLI README row edits. Make them one or two tasks, since the Migration Plan table already specifies each row.
- 8.1 and 8.2: merge into one task.
- 2.1 and 2.2: composing and sending one message. Merge them.
- 9.1–9.3: a sweep that is mostly verification. One task is enough.
- 12.2: it only checks that earlier checkboxes are ticked. Fold it into 12.1 or 12.3.
This keeps the same coverage with roughly 6–7 fewer task entries.

### [CONCERN] Task 4.2 omits the "unreadable version marker" case

Slice Technical Requirements say "old version and unreadable version warn on stderr", and D4 lists "missing, empty or unreadable". Task 4.2 tests only "missing or empty". Either add an unreadable-marker case, for example a directory in place of the file, or state that `checkGuideMinimum` treats it identically and is already covered by `guideMinimum.test.ts`. Otherwise the stated Technical Requirement is only partly verified.

### [CONCERN] Hard-coded older version in 11.3 step 6

Task 11.3 tells the implementer to write the literal `v0.22.7` into the version marker, on the assumption that it is "below the new minimum". That holds only if the new minimum is above 0.22.7, and the task never checks it. If it isn't, step 6 passes vacuously or confusingly. Add a check that the value is strictly below the `MIN_GUIDE_VERSION` just set in 11.2, or derive an older value from the repo's prior installed version. This is close to the hallucination-trap pattern the project guidelines warn about.

### [NOTE] Task 11.3 depends on the fixture from 5.1

Task 11.3 reuses the brownfield fixture created in 5.1 under a temp dir. That is an implicit cross-task dependency, and the temp dir may be gone by then. Say to recreate the fixture if it is missing. Also, task 4.1 offers example paths (`output/`, `utils/guideReady.ts`) for a shared warning prefix. The existing `Warning: ` literal is in `build.ts:89` and `prompt.ts` has none, so this is only suggestive. It is acceptable as written.

### [NOTE] Task 3.5 importer list verified

The importers named in 3.5 (`adoption/projectDetection.ts`, `docs-map/discoverDocs.ts`, `ruleReconciliation/projectSources.ts`) all exist and reference `presentPaths`.

### Run Digest

- Response length: 4425 chars
- Response is newline-free: no
- Tool calls made: 4
- Tool calls failed: 0
- Stop reason: end_turn
- Output budget: backend default
- System prompt: preset+append
- Settings sources: project
- Reasoning characters: 0
- Effort: backend default
- Turns: 5
- Tokens — prompt / cached / cache write / completion / reasoning: 223118 / 139677 / 83435 / 4001 / not computed
- Duration: 33.0 s
- Cost: $0.39 (provider)
- `## Summary` located: yes
- `## Findings` located: yes
- Finding-shaped matches — whole response: 7
- Finding-shaped matches — inside fences: 0
- Finding-shaped matches — in findings section: 7
- Finding-shaped matches — surviving validation: 7
