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
reviewedSha: b81bf5e3490b451c77c15adb1fac8f41e8970413
toolsGiven: [read_file, list_files, grep]
toolCallsMade: 2
turns: 3
promptTokens: 99211
cachedTokens: 11176
cacheWriteTokens: 88031
completionTokens: 5146
durationSeconds: 46.6
costUsd: 0.405463
costBasis: provider
runId: run-20261028-p5-cdb39c2a
squadronVersion: 0.24.8
findings:
  - id: F001
    severity: pass
    category: coverage
    summary: "Success criteria coverage is complete"
    location: "project-documents/user/tasks/274-tasks.carry-codebase-comprehension-into-later-phases.md:56-228"
  - id: F002
    severity: pass
    category: sequencing
    summary: "Sequencing and checkpoints"
    location: "project-documents/user/tasks/274-tasks.carry-codebase-comprehension-into-later-phases.md:81-193"
  - id: F003
    severity: concern
    category: task-sizing
    summary: "Task 16 bundles too much for one junior-AI task"
    location: "project-documents/user/tasks/274-tasks.carry-codebase-comprehension-into-later-phases.md:171-179"
  - id: F004
    severity: concern
    category: test-placement
    summary: "Parser test and fixture check sit in the wrong task"
    location: "project-documents/user/tasks/274-tasks.carry-codebase-comprehension-into-later-phases.md:78"
  - id: F005
    severity: note
    category: proportionality
    summary: "Task 17 and Task 18 overlap"
    location: "project-documents/user/tasks/274-tasks.carry-codebase-comprehension-into-later-phases.md:181-192"
  - id: F006
    severity: note
    category: naming
    summary: "Generalized helper keeps a comprehension-specific name"
    location: "project-documents/user/tasks/274-tasks.carry-codebase-comprehension-into-later-phases.md:127"
---

# Review: tasks — slice 274

**Verdict:** CONCERNS
**Model:** claude-sonnet-5-5

## Findings

### [PASS] Success criteria coverage is complete

Each design criterion traces to a task:
- **Section with freshness and CLI/MCP parity:** Tasks 14–18.
- **Neutral `none` lines:** Tasks 14, 15 and 17.
- **Missing, not-readable and cannot-check lines that never fail the build:** Tasks 14, 15 and 18, including the exit-0 assertion.
- **`out of date` to `current` after `cf docs map`:** Tasks 12, 13 and 18.
- **Byte-identical builds under today's guide, and the one added `brownfield-adoption` line:** Tasks 16, 17 and 18.
- **`cf prompt get` ignoring the stored field:** Task 9.
- **`cf set` rejecting missing, directory and outside-root paths:** Tasks 8 and 9.
- **Purity:** Task 18.
- **Compact-row fixture:** Task 3.
- **Shared compare step:** Task 12.
- **271 guard test:** Tasks 7 and 21.
- **Docs:** Task 19.
- **External requests and `MIN_GUIDE_VERSION`:** Tasks 1 and 23.

I found no scope creep. Task 20 (architecture amendment) and Task 22 (walkthrough refinement) both come from the design's Implementation Notes.

### [PASS] Sequencing and checkpoints

Dependencies run forward with no cycles:
- The schema helper (Task 4) comes before the core check (Task 6), which comes before the setters (Tasks 8 and 10).
- The compare step (Task 12) comes before the facts function (Task 14), which comes before the wiring (Task 16).

Implementation tasks are each followed by their tests (4→5, 6→7, 8→9, 10→11, 12→13, 14→15, 16→17), and the commits land at those pairs. The recorded decision that containment applies to the setters only keeps the existing `prompt.adoption.test.ts` assertion valid. Task 23 uses the permitted `BLOCKED:` form for a genuine external dependency.

### [CONCERN] Task 16 bundles too much for one junior-AI task

Task 16 (effort 3) does five things:
- Adds a field to the context data.
- Extends profile filtering to report which variables are listed.
- Injects a resolver through `CoreServiceFactory`.
- Adds rendered text to the context data.
- Changes `SectionBuilder`/`ContextTemplateEngine` ordering, with a byte-identical guarantee when the text is empty.

Task 14 (effort 3) is similarly broad: wording constants, an async facts function with seven cases, and a render function. Split Task 16 into two tasks, "profile gate and resolver injection" and "section emission in `SectionBuilder`". The first can be checked by typecheck plus the golden test, and the second by the Task 17 tests. Consider moving Task 14's render function into its own sub-task so the facts and render tests in Task 15 line up with it.

### [CONCERN] Parser test and fixture check sit in the wrong task

Task 3 creates the fixture, but its success check is deferred to Task 13, which is about the docs-map compare step. The `ContextProfileParser` test for the fixture (Task 13, line 147) has nothing to do with the compare step. It also lands ten tasks after the fixture it validates, so a malformed fixture would surface late. Move the parser test into Task 3 (or a test sub-item committed with it), and drop the "checked in Task 13's tests" deferral.

### [NOTE] Task 17 and Task 18 overlap

Task 17 asserts the Phase 4 section content, the none/both cases, and the absence in Phases 5 and 6 at core level. Task 18 then asserts the same section through `cf build` and `context_build`. The CLI and MCP parity and purity checks are required by the design. The core-level assertions in Task 17 could be cut down to the byte-identical and gating cases, with content assertions left to Task 18. This trims test volume without losing any criterion.

### [NOTE] Generalized helper keeps a comprehension-specific name

Task 10 passes "every path-valued field" through `normalizeComprehensionValue`, and Task 8 branches on `isPathValuedField`. The marker is generic but the normalizer is named for one field. If more path-valued fields are expected, name the function for the behavior (for example `normalizePathValue`). Otherwise keep the current name and note that only `fileComprehension` is path-valued.

### Run Digest

- Response length: 5094 chars
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
- Tokens — prompt / cached / cache write / completion / reasoning: 99211 / 11176 / 88031 / 5146 / not computed
- Duration: 46.6 s
- Cost: $0.41 (provider)
- `## Summary` located: yes
- `## Findings` located: yes
- Finding-shaped matches — whole response: 6
- Finding-shaped matches — inside fences: 0
- Finding-shaped matches — in findings section: 6
- Finding-shaped matches — surviving validation: 6
