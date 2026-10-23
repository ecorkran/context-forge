---
docType: review
layer: project
reviewType: tasks
slice: retroactive-marker-and-existing-state-slice-plan
conventionsSource: AGENTS.md
projectRules: []
project: context-forge
verdict: CONCERNS
verdictSource: stated
sourceDocument: project-documents/user/tasks/263-tasks.retroactive-marker-and-existing-state-slice-plan.md
aiModel: deepseek/deepseek-v4.1-flash
aiProfile: openrouter
status: complete
dateCreated: 20261022
dateUpdated: 20261022
reviewedSha: adadbf7e929b087f6f066f8d17bc9f724022ca58
revision_number: 1
toolsGiven: [read_file, list_files, grep]
toolCallsMade: 40
turns: 16
promptTokens: 1064766
cachedTokens: 891392
completionTokens: 107267
reasoningTokens: 102659
durationSeconds: 462.2
costUsd: 0.081207
costBasis: alias_pricing
runId: run-20261023-p56-13766e72
squadronVersion: 0.23.7
findings:
  - id: F001
    severity: concern
    category: testability
    summary: "Existing parser `toEqual` assertions break, but Task 1 only tells the implementer to fix compiler-reported literals"
    location: "packages/core/tests/introspection/slicePlanParser.test.ts:12-36"
  - id: F002
    severity: note
    category: design-consistency
    summary: "The navigator bypasses `evaluateEntryGate`, so the design's \"one entry point used by both call sites\" is not implemented"
    location: "packages/core/src/introspection/WorkflowNavigator.ts#deriveSliceStatus"
  - id: F003
    severity: note
    category: api-surface
    summary: "`SliceStatus.retroactive` (R3) adds an item to a response surface the design does not account for"
    location: "packages/mcp-server/src/tools/workflowTools.ts:128"
  - id: F004
    severity: note
    category: scope
    summary: "The \"no extra code\" claim for `cf list slices --json` is wrong; Task 8's hedge is required work"
    location: "packages/cli/src/commands/slice.ts:171-179"
  - id: F005
    severity: note
    category: proportionality
    summary: "Tasks 6 and 7 are single-step tasks that could merge into their neighbours"
    location: "project-documents/user/tasks/263-tasks.retroactive-marker-and-existing-state-slice-plan.md"
  - id: F006
    severity: pass
    category: traceability
    summary: "Success criteria are fully traced, correctly sequenced, and scoped to the slice"
    location: "project-documents/user/tasks/263-tasks.retroactive-marker-and-existing-state-slice-plan.md"
---

# Review: tasks — slice 263

**Verdict:** CONCERNS
**Model:** deepseek/deepseek-v4.1-flash

## Findings

### [CONCERN] Existing parser `toEqual` assertions break, but Task 1 only tells the implementer to fix compiler-reported literals

Task 1 adds a required `retroactive: boolean` to `SlicePlanEntry` and sets it on **every** indexed entry (`retroactive` from the regex) and on every unindexed entry (`retroactive: false`). Its instruction for fallout is: "Fix every `SlicePlanEntry` literal the compiler reports in `packages/*/src` and `packages/*/tests` by adding `retroactive: false` (R4)", and its success criterion is "existing tests pass".

The six full-shape `toEqual` assertions in `slicePlanParser.test.ts` (lines 12, 22, 36, 135, 145, 162) are **not** typed as `SlicePlanEntry` — they are bare object literals passed to `expect(...).toEqual()`, so the compiler will not report them, yet they will fail at runtime once the parsed object carries an extra `retroactive: false` key (vitest's `toEqual` ignores `undefined` properties, not extra defined ones). These cover `sample-slice-plan.md` (indexed) and `unindexed-slice-plan.md` (fallback), so both paths break. I confirmed no other parser-output assertions of full entry shape exist (the CLI and checker tests use field access or mock literals, not parsed entries). Either Task 1's step or Task 1T should name this fix explicitly, otherwise following the task verbatim fails the task's own success criterion.

### [NOTE] The navigator bypasses `evaluateEntryGate`, so the design's "one entry point used by both call sites" is not implemented

The slice design's Technical Scope says "a new `GateSkip` result and **one entry-aware entry point, used by both the navigator and the checker**", and D3 says "The navigator and `ruleReviewGate` both call it, so the skip rule is written once." Task 3 (via R3) instead has the navigator test `entry.retroactive` directly and evaluate no gate for it, leaving `evaluateEntryGate` used only by the checker. R3's factual reason is sound (`!docs.sliceDesign → needs-design` would otherwise fire first), and the success criteria are still met — but the skip fact is now read in two places, contrary to D3's stated property. Either Task 3 should map a `skipped` result to `complete`, or the design should be amended to match the implementation.

### [NOTE] `SliceStatus.retroactive` (R3) adds an item to a response surface the design does not account for

R3 says the new optional `SliceStatus.retroactive` flag is "internal to core ... no CLI or MCP schema change", but `SliceStatus` is the `activeSlice` field of `WorkflowStatus`, and the `workflow_status` tool advertises its shape as "activeSlice: { name, index, status, taskProgress? }". For an adopted project with a retroactive active slice the field will appear while the tool description stays stale. Design's Integration Requirements only budget for the `retroactive` field on `cf list slices --json`, so this is an unaccounted-for surface. A one-line description update in the same task would close it.

### [NOTE] The "no extra code" claim for `cf list slices --json` is wrong; Task 8's hedge is required work

Design D8 asserts `SlicePlanEntry.retroactive` "flows into `cf list slices --json` with no extra code, since entries are serialized as parsed." The command actually rebuilds each entry field-by-field (`index`, `name`, `isChecked`, `designFile`, `status`, `isActive`, `isNext`), so `retroactive` must be added there. Task 8 does hedge ("if the JSON builds entries field by field, add `retroactive` there"), so the work is covered — but Task 12's CLI assertion of `retroactive: true/false` depends on that branch being taken, and the design's Integration Requirement ("differs only by the added `retroactive: false` field") is only true once it is.

### [NOTE] Tasks 6 and 7 are single-step tasks that could merge into their neighbours

Task 6 is one call-site insertion ("push `ruleRetroactiveEntries(...)` once, after the per-slice loop") with its own test task (6T) and its own commit (6C) — it can fold into Task 5, which creates the rule it wires in. Task 7 is a single schema-field addition; it already shares commit 8C with Task 8, so merging it there would remove a task boundary without losing anything. Neither is a correctness problem, and both target the right layers, so this is trimming rather than a defect.

### [PASS] Success criteria are fully traced, correctly sequenced, and scoped to the slice

Every Functional Requirement maps to tasks: marker parsing → 1/1T; "complete" in list/status/next/plan-status → 1/1T, 3/3T, 6T, 8/8T, 12; gate skip + per-plan info → 2/2T, 4/4T, 12; `cf set slice 100` + `cf next` → 3T; the four `retroactive-entry` errors → 5/5T; `provenance` validation → 7/7T; adoption completion (persist / `template_preview` / no-marker) → 9/9T, 10/10T, 11/11T. Every Technical Requirement's named unit test and the integration + real-format + "this repo's `cf check` unchanged" items appear as tasks (0 baseline, 12 fixture, 13 diff/walkthrough). Sequencing mirrors the design's Development Approach 1–6 with no circularity; the 261-dependent completion work (9–11) sits last, matching the design's mitigation. I found no task that does not trace to a criterion and no criterion left uncovered. The parent slice restates no NFR and specifies no load test, so the absence of a `tests/load/` task (and any CI-gating task) is not a gap.

### Run Digest

- Response length: 6511 chars
- Response is newline-free: no
- Tool calls made: 40
- Tool calls failed: 0
- Stop reason: stop
- Output budget: 384000 tokens
- System prompt: custom
- Settings sources: n/a (non-SDK)
- Reasoning characters: 403960
- Effort: backend default
- Turns: 16
- Tokens — prompt / cached / cache write / completion / reasoning: 1064766 / 891392 / not computed / 107267 / 102659
- Duration: 462.2 s
- Cost: $0.08 (alias_pricing)
- `## Summary` located: yes
- `## Findings` located: yes
- Finding-shaped matches — whole response: 6
- Finding-shaped matches — inside fences: 0
- Finding-shaped matches — in findings section: 6
- Finding-shaped matches — surviving validation: 6
