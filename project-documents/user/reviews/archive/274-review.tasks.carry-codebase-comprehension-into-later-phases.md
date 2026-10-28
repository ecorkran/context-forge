---
docType: review
layer: project
reviewType: tasks
slice: carry-codebase-comprehension-into-later-phases
conventionsSource: AGENTS.md
projectRules: []
project: context-forge
verdict: CONCERNS
verdictSource: stated
sourceDocument: project-documents/user/tasks/274-tasks.carry-codebase-comprehension-into-later-phases.md
aiModel: claude-sonnet-5-5
aiProfile: sdk
status: complete
dateCreated: 20261028
dateUpdated: 20261028
reviewedSha: d91d5b1e294faafc24b1e52a3f805eb115b43f12
revision_number: 1
toolsGiven: [read_file, list_files, grep]
toolCallsMade: 2
turns: 3
promptTokens: 99440
cachedTokens: 11176
cacheWriteTokens: 88260
completionTokens: 4780
durationSeconds: 44.4
costUsd: 0.402719
costBasis: provider
runId: run-20261028-p5-cdb39c2a
squadronVersion: 0.24.8
findings:
  - id: F001
    severity: pass
    category: coverage
    summary: "Success criteria coverage is complete"
    location: "project-documents/user/tasks/274-tasks.carry-codebase-comprehension-into-later-phases.md:57-236"
  - id: F002
    severity: pass
    category: sequencing
    summary: "Sequencing and checkpoints"
    location: "project-documents/user/tasks/274-tasks.carry-codebase-comprehension-into-later-phases.md:57-236"
  - id: F003
    severity: concern
    category: task-sizing
    summary: "Task 14 is oversized and mixes three responsibilities"
    location: "project-documents/user/tasks/274-tasks.carry-codebase-comprehension-into-later-phases.md:154-163"
  - id: F004
    severity: concern
    category: dry
    summary: "Error-to-`UserError` mapping is written in two CLI places"
    location: "project-documents/user/tasks/274-tasks.carry-codebase-comprehension-into-later-phases.md:103,117"
  - id: F005
    severity: concern
    category: test-coverage
    summary: "The `brownfield-adoption` one-line change is not tested beside `pureBuild.test.ts`"
    location: "project-documents/user/tasks/274-tasks.carry-codebase-comprehension-into-later-phases.md:189-198"
  - id: F006
    severity: concern
    category: proportionality
    summary: "Test tasks overlap and are slightly over-split"
    location: "project-documents/user/tasks/274-tasks.carry-codebase-comprehension-into-later-phases.md:79,179-193"
  - id: F007
    severity: note
    category: process
    summary: "External-request task is placed before the branch exists"
    location: "project-documents/user/tasks/274-tasks.carry-codebase-comprehension-into-later-phases.md:61-72"
---

# Review: tasks — slice 274

**Verdict:** CONCERNS
**Model:** claude-sonnet-5-5

## Findings

### [PASS] Success criteria coverage is complete

Each criterion in the slice design maps to a task:
- **Section content (both paths, freshness, CLI/MCP identical):** Tasks 14, 15, 18, 19 and 20.
- **Neutral `none` lines:** Tasks 14, 15 and 19.
- **Missing, directory and broken-marker cases never fail the build:** Tasks 14, 15 and 20.
- **`out of date` to `current` after `cf docs map`:** Tasks 13 and 20.
- **Byte-identical builds under the current guide:** Tasks 18 and 19.
- **`cf prompt get` ignores the stored field (D2):** Task 9.
- **Setter rejections and root-relative storage:** Tasks 8 to 11.
- **Purity:** Task 20.
- **Technical and integration requirements:**
  - The squadron ban guard test: Tasks 7 and 23.
  - Docs: Task 21.
  - The `MIN_GUIDE_VERSION` bump: Task 25.
  - The architecture amendments: Task 22.
  - The walkthrough: Task 24.
  - The external requests: Task 1.

I found no scope creep. The slice states no NFR, so no load test or CI gating task is required.

### [PASS] Sequencing and checkpoints

The dependency order holds:
- The Task 3 fixture comes before its consumers (Tasks 17, 19, 20 and 24).
- The schema marker (Task 4) comes before the setters (Tasks 8 and 10).
- The path check move (Task 6) comes before the setters and the facts code (Task 14).
- The compare step (Task 12) comes before the facts code (Task 14).
- The profile gate (Task 16) comes before the section emission (Task 18).

I found no cycles. Commits land at Tasks 3, 5, 7, 9, 11, 13, 15, 17, 19, 20, 21 and 22, not at the end. Task 25's `BLOCKED:` handling follows the project rule.

### [CONCERN] Task 14 is oversized and mixes three responsibilities

Task 14 is rated effort 3, the highest in the file. It adds wording constants, an async facts reader with eight or more distinct outcomes, and a pure renderer. All of this goes into `codebaseReference.ts`, which already holds the moved path check and `normalizePathFieldValue` from Task 6. The task itself concedes the file may pass 300 lines.

Split it so a junior AI can finish each piece alone:
- 14a: the wording constants, created up front in `codebaseReferenceText.ts`.
- 14b: the facts reader.
- 14c: the renderer.

Task 15's tests already divide along the same lines. Alternatively, mandate the `codebaseReferenceText.ts` split in this task instead of leaving it conditional.

### [CONCERN] Error-to-`UserError` mapping is written in two CLI places

Task 6 maps the core error reasons to `UserError` codes in the prompt command. Task 8 repeats the same mapping in `project.ts` ("Map core errors to `UserError` as in Task 6"), plus `outside-root`. Project rules forbid duplicated logic. Have Task 6 add one small CLI helper, for example `toUserError(err)`, that covers all three reasons. Task 8 and the prompt command then both call it. The MCP side returns the message text only, so it needs no mapping.

### [CONCERN] The `brownfield-adoption` one-line change is not tested beside `pureBuild.test.ts`

The slice's Functional Requirements say the `brownfield-adoption` change is "covered by a test beside `pureBuild.test.ts`". Task 19 puts that assertion in the core template-engine test. Task 20 puts the MCP test beside `pureBuild.test.ts`, but it covers only parity and purity. As a result, nothing checks through the real `context_build` and `cf build` path that the one-line change appears and that Phase 2 to 4 output is unchanged. Move that assertion into Task 20, or say in Task 19 that the core test replaces the one beside `pureBuild.test.ts`.

### [CONCERN] Test tasks overlap and are slightly over-split

Three overlaps add test tasks without adding criterion coverage:
- Task 17 (profile gate via `ContextIntegrator`) and Task 19 (build output) both check "Phase 2 to 4 emit, Phase 5/6/default don't". Merge them into one build-level test task with the resolver-not-called assertions folded in.
- Task 3's `ContextProfileParser` test only checks the contents of the fixture the task just made. It does not exercise any new code. The real-layout parsing requirement is already met when the Task 17/19 tests consume the fixture. Drop it, or keep it only if the parser needs to be shown to accept the fixture.
- Task 7 dictates implementation detail that the slice does not require ("use `path.posix`/`split(path.sep)` as appropriate"). State the outcome instead: the stored value uses `/` separators.

### [NOTE] External-request task is placed before the branch exists

Task 1 (messages to other sessions) comes before Task 2 (branch creation). This is harmless because Task 1 changes no files. It matches the design's "send once approved" step, and the `NOT SENT` fallback keeps the later tasks unblocked.

### Run Digest

- Response length: 5945 chars
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
- Tokens — prompt / cached / cache write / completion / reasoning: 99440 / 11176 / 88260 / 4780 / not computed
- Duration: 44.4 s
- Cost: $0.40 (provider)
- `## Summary` located: yes
- `## Findings` located: yes
- Finding-shaped matches — whole response: 7
- Finding-shaped matches — inside fences: 0
- Finding-shaped matches — in findings section: 7
- Finding-shaped matches — surviving validation: 7
