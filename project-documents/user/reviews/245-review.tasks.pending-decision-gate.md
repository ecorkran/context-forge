---
docType: review
layer: project
reviewType: tasks
slice: pending-decision-gate
conventionsSource: AGENTS.md
projectRules: []
project: context-forge
verdict: CONCERNS
verdictSource: stated
sourceDocument: project-documents/user/tasks/245-tasks.pending-decision-gate.md
aiModel: claude-sonnet-5-5
aiProfile: sdk
status: complete
dateCreated: 20261017
dateUpdated: 20261017
reviewedSha: a5532ef74d49b626bc568769ab0a3b4ac92261aa
toolsGiven: [read_file, list_files, grep]
toolCallsMade: 2
turns: 3
promptTokens: 97439
cachedTokens: 8724
cacheWriteTokens: 88711
completionTokens: 4517
durationSeconds: 38.4
costUsd: 0.401606
costBasis: provider
runId: run-20261018-p5-f1858748
squadronVersion: 0.23.1
findings:
  - id: F001
    severity: pass
    category: coverage
    summary: "Success criteria coverage is complete"
    location: "project-documents/user/tasks/245-tasks.pending-decision-gate.md:79-318"
  - id: F002
    severity: concern
    category: coverage
    summary: "No automated check that `cf status` and the MCP tools surface the new status and payload"
    location: "project-documents/user/tasks/245-tasks.pending-decision-gate.md:47,233"
  - id: F003
    severity: concern
    category: sequencing
    summary: "The Task 6 temporary hard-coded `true` leaves a committed transitional state"
    location: "project-documents/user/tasks/245-tasks.pending-decision-gate.md:159,172"
  - id: F004
    severity: concern
    category: proportionality
    summary: "Task count and step detail are heavy for an effort-2/5 slice"
    location: "project-documents/user/tasks/245-tasks.pending-decision-gate.md:127-148,152-197"
  - id: F005
    severity: concern
    category: prompt-hygiene
    summary: "Task 3 puts example frontmatter values next to a lookup instruction"
    location: "project-documents/user/tasks/245-tasks.pending-decision-gate.md:105"
  - id: F006
    severity: note
    category: architecture
    summary: "Task 13 puts consistency-finding construction in a `schema/` module"
    location: "project-documents/user/tasks/245-tasks.pending-decision-gate.md:265-270"
  - id: F007
    severity: note
    category: clarity
    summary: "Stray context line"
    location: "project-documents/user/tasks/245-tasks.pending-decision-gate.md:51"
---

# Review: tasks — slice 245

**Verdict:** CONCERNS
**Model:** claude-sonnet-5-5

## Findings

### [PASS] Success criteria coverage is complete

Each functional and technical requirement traces to a task:
- Parser grammar, attribution and fixtures are in Tasks 2–3. These include the real template, the amoeba layout fixture, and this design as a fixture.
- `cf validate design` output and JSON are in Tasks 6–9, including the disabled-gate case.
- Navigator zero, partial and complete positions, review-gate precedence, and no-config behaviour are in Tasks 10–11.
- The `cf check` warning, per-slice error isolation, and complete slices being skipped are in Tasks 13–14.
- Docs and the Squadron contract are in Task 15.
- The walkthrough and the self-validation of this design are in Task 16.
- The fence-helper move is checked by the unchanged `sliceDesignValidator` tests in Task 1.

No task falls outside the slice scope. No merge task is written, which follows the Phase 7 rule. Commits are spread through the file. There is no NFR, so no load-test or CI-wiring task is needed.

### [CONCERN] No automated check that `cf status` and the MCP tools surface the new status and payload

The slice requires that `cf status` shows `Status: pending-decision` and that `--json` includes `pendingDecisions`. The task file asserts `status.ts` needs no change (line 47). Task 11 tests only the core `getStatus()` result (line 233). No CLI `status` test and no MCP `workflow_next` or `workflow_status` test checks that the field survives serialization. Only the manual walkthrough in Task 16 covers it. Add one assertion to the existing `status` CLI test. Alternatively, state explicitly that serialization is covered by the walkthrough only.

### [CONCERN] The Task 6 temporary hard-coded `true` leaves a committed transitional state

Task 6 makes the CLI pass `{ decisionGateEnabled: true }` with a `TODO(245 Task 8)` comment. Task 7 then commits this on its own, so the commit ignores the config key. That is the silent hard-coded default the project rules prohibit, and it is only temporary. Move the CLI plumbing so it lands before the first commit that touches `validateSliceDesignFiles` callers. Alternatively, merge Tasks 6–9 into one implementation task followed by one test task. That removes the TODO round-trip.

### [CONCERN] Task count and step detail are heavy for an effort-2/5 slice

The file has 17 tasks, and several are 1/5 implementation or test halves: Tasks 4/5, 6/7, 8/9, and 12. Merge each small implementation and test pair into one task with a single commit. That keeps the test-with pattern and cuts roughly four tasks. Task 10 also dictates internal structure that the slice does not require. Examples are the helper name, the "restructure order only as far as needed" guidance, and the "~40 lines, else move to decisionGate.ts" rule (lines 210-224). Trim these to the behavioural requirements from D4 and D5. Task 3 enumerates each label and value form as separate bullets (lines 102-105). Collapsing them into the `it.each` tables the task already mentions would keep the same coverage with less text.

### [CONCERN] Task 3 puts example frontmatter values next to a lookup instruction

The instruction says to use "each frontmatter status value (`not_started`, `in_progress`, `complete`, and any others listed in `packages/core/src/schema/frontmatterSchema.ts`)". The project's hallucination-trap rule says not to place hard-coded example values beside a value the implementer must retrieve from a source. Rewrite it as: derive the values from the exported frontmatter status vocabulary in `frontmatterSchema.ts`, and fail if that list cannot be found. Do not list examples.

### [NOTE] Task 13 puts consistency-finding construction in a `schema/` module

`pendingDecisionFindings` lives in `schema/decisionGate.ts` but returns introspection finding types. That creates a schema-to-introspection dependency while introspection already imports from schema. The slice design mandates `decisionGate.ts` as the single call target, so this is acceptable. Check that no import cycle appears when Task 13 is built.

### [NOTE] Stray context line

"The next planned slice comes from the 240 slice plan. Slice 245 is the last listed entry." has no use in any task. Remove it, or state what it is for.

### Run Digest

- Response length: 5172 chars
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
- Tokens — prompt / cached / cache write / completion / reasoning: 97439 / 8724 / 88711 / 4517 / not computed
- Duration: 38.4 s
- Cost: $0.40 (provider)
- `## Summary` located: yes
- `## Findings` located: yes
- Finding-shaped matches — whole response: 7
- Finding-shaped matches — inside fences: 0
- Finding-shaped matches — in findings section: 7
- Finding-shaped matches — surviving validation: 7
