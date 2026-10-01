---
docType: review
layer: project
reviewType: tasks
slice: review-gate-provenance-and-exemption-visibility
targetKind: slice
rulesSource: project
project: context-forge
verdict: CONCERNS
verdictSource: stated
sourceDocument: project-documents/user/tasks/928-tasks.review-gate-provenance-and-exemption-visibility.md
aiModel: deepseek/deepseek-v4.1-flash
status: complete
dateCreated: 20261001
dateUpdated: 20261001
reviewedSha: cb73661e121734f6fb878818ae75fd5ac727607e
toolsGiven: [read_file, list_files, grep]
toolCallsMade: 31
turns: 12
promptTokens: 461826
cachedTokens: 380672
completionTokens: 22079
reasoningTokens: 19083
durationSeconds: 83.6
squadronVersion: 0.17.0
findings:
  - id: F001
    severity: pass
    category: coverage
    summary: "All Thirteen Functional Criteria Map to Tasks"
    location: "project-documents/user/tasks/928-tasks.review-gate-provenance-and-exemption-visibility.md"
  - id: F002
    severity: concern
    category: coverage
    summary: "MCP Parity (workflow_next / workflow_check) Has No Verification Task"
    location: "project-documents/user/tasks/928-tasks.review-gate-provenance-and-exemption-visibility.md"
  - id: F003
    severity: note
    category: scope
    summary: "Task 22's Optional #84 Fix Is Explicitly Out of Scope"
    location: "project-documents/user/tasks/928-tasks.review-gate-provenance-and-exemption-visibility.md"
  - id: F004
    severity: note
    category: consistency
    summary: "PROVENANCE Token Location Diverges From TD-3"
    location: "packages/core/src/introspection/reviewGate.ts"
  - id: F005
    severity: note
    category: coverage
    summary: "`no any` Technical Requirement Is Not Explicitly Checked"
    location: "project-documents/user/tasks/928-tasks.review-gate-provenance-and-exemption-visibility.md"
---

# Review: tasks — slice 928

**Verdict:** CONCERNS
**Model:** deepseek/deepseek-v4.1-flash

## Findings

### [PASS] All Thirteen Functional Criteria Map to Tasks

Cross-referencing the slice design's Success Criteria against the tasks: criteria 1–8 → Tasks 9–10; criterion 9 → Task 4; criterion 10 (cf next half) → Tasks 11–12; criteria 11/11a → Tasks 13–14; criterion 12 → Tasks 15–17; criterion 13 → Tasks 18–20. Technical Requirements (unit tests per `classifyEvidence` row, per-policy weak-PASS, split-review provenance, ~300-line budget) → Tasks 7–10, 23; Integration Requirements (CHANGELOG, docs/REVIEW-GATING.md) → Tasks 21–22; Verification Walkthrough → Task 24. No functional criterion is orphaned, and no task lacks a traceable criterion (Task 15's `askConfirmation` dedup traces to TD-6/F005; Task 19 traces to TD-7).

### [CONCERN] MCP Parity (workflow_next / workflow_check) Has No Verification Task

Criterion 10 requires `cf next` **and** `workflow_next` to show `EXEMPT_NOTE` in the rationale, and criterion 11/11a's findings must appear in `workflow_check`; the Integration Requirements reiterate "The CLI and MCP (`workflow_next`, `workflow_check`) both show the exemption note and finding without MCP code changes." Task 12 (exemption note) only exercises `WorkflowNavigator.getStatus()`/`getNext()` directly, and Task 14 only exercises `ConsistencyChecker`. Nothing asserts the MCP surface — not even a parity test asserting `workflow_next` delegates to `getNext` (there is an existing `packages/mcp-server/tests/workflowTools.test.ts` that would be the natural home). Because MCP passes through `getNext`/the checker, the behavior is likely correct, but the criterion as written is not independently verified, so a regression there would not be caught.

### [NOTE] Task 22's Optional #84 Fix Is Explicitly Out of Scope

Task 22 includes an optional subtask to fix #84 ("documented field that doesn't exist"). The slice design lists #84 under **Excluded** ("it's not a success criterion") while permitting it opportunistically. The subtask is correctly marked optional, but since it produces no success criterion any change to it is untestable scope; consider dropping it or stating it is not counted toward completion, to avoid ambiguity about what "done" means for Task 22.

### [NOTE] PROVENANCE Token Location Diverges From TD-3

Design TD-3 states the accepted provenance values live in one `as const` object (`PROVENANCE`) "in `reviewGate.ts`," and TD-5/TD-1 place `EXEMPT_NOTE`/`ExemptReason` there too. Task 7 instead creates `packages/core/src/introspection/reviewProvenance.ts` and places `PROVENANCE` and the description helper in it, while Task 11 keeps `EXEMPT_NOTE` in `reviewGate.ts`. This is authorized by the design's Technical Requirement escape hatch ("If it doesn't [stay ~300 lines], move provenance parsing into `reviewProvenance.ts`") and produces a cleaner module split, so it is not a defect — but the task file's Context Summary and the design's TD-3 bullet now disagree on where the single source of truth lives. A one-line note in the task would prevent an implementer from "fixing" the divergence.

### [NOTE] `no any` Technical Requirement Is Not Explicitly Checked

The Technical Requirements bundle "No `any` and no string literals for exempt reasons or provenance tokens outside their definitions." Task 23 verifies the string-literal half with two greps, but no task verifies the no-`any` half. If the project's lint/tsc config already forbids `any` this is covered implicitly; otherwise add a check to Task 23's reduced verification set.

### Run Digest

- Response length: 4578 chars
- Response is newline-free: no
- Tool calls made: 31
- Tool calls failed: 1
- Stop reason: stop
- Output budget: 384000 tokens
- System prompt: custom
- Settings sources: n/a (non-SDK)
- Reasoning characters: 76698
- Effort: backend default
- Turns: 12
- Tokens — prompt / cached / completion / reasoning: 461826 / 380672 / 22079 / 19083
- Duration: 83.6 s
- `## Summary` located: yes
- `## Findings` located: yes
- Finding-shaped matches — whole response: 5
- Finding-shaped matches — inside fences: 0
- Finding-shaped matches — in findings section: 5
- Finding-shaped matches — surviving validation: 5
