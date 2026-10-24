---
docType: review
layer: project
reviewType: tasks
slice: end-to-end-adoption-verification-and-docs
conventionsSource: AGENTS.md
projectRules: []
project: context-forge
verdict: CONCERNS
verdictSource: stated
sourceDocument: project-documents/user/tasks/265-tasks.end-to-end-adoption-verification-and-docs.md
aiModel: claude-sonnet-5-5
aiProfile: sdk
status: complete
dateCreated: 20261023
dateUpdated: 20261023
reviewedSha: 729a36d7ca4c2378f37ff9ab7438788eb5b122a0
revision_number: 2
toolsGiven: [read_file, list_files, grep]
toolCallsMade: 2
turns: 3
promptTokens: 97277
cachedTokens: 11222
cacheWriteTokens: 86051
completionTokens: 5547
durationSeconds: 44.7
costUsd: 0.401539
costBasis: provider
runId: run-20261024-p56-a717819c
squadronVersion: 0.23.7
findings:
  - id: F001
    severity: pass
    category: coverage
    summary: "Success criteria trace to tasks"
    location: "project-documents/user/tasks/265-tasks.end-to-end-adoption-verification-and-docs.md"
  - id: F002
    severity: concern
    category: coverage
    summary: "Greenfield session is never pointed at the local build"
    location: "project-documents/user/tasks/265-tasks.end-to-end-adoption-verification-and-docs.md:73"
  - id: F003
    severity: concern
    category: sequencing
    summary: "A blocked brownfield run needlessly blocks the README example and Task 9"
    location: "project-documents/user/tasks/265-tasks.end-to-end-adoption-verification-and-docs.md:57"
  - id: F004
    severity: note
    category: coverage
    summary: "Task 6M's MCP result has no explicit row in Task 6R"
    location: "project-documents/user/tasks/265-tasks.end-to-end-adoption-verification-and-docs.md:127-129"
  - id: F005
    severity: note
    category: conventions
    summary: "\"Task 4\" is a heading with no checkbox"
    location: "project-documents/user/tasks/265-tasks.end-to-end-adoption-verification-and-docs.md:80"
  - id: F006
    severity: note
    category: proportionality
    summary: "Proportionality"
    location: "project-documents/user/tasks/265-tasks.end-to-end-adoption-verification-and-docs.md"
---

# Review: tasks — slice 265

**Verdict:** CONCERNS
**Model:** claude-sonnet-5-5

## Findings

### [PASS] Success criteria trace to tasks

- **Functional criteria:**
  - Greenfield run: Tasks 2 and 3.
  - CF-only run: Tasks 5 and 5R.
  - Squadron run: Tasks 6, 6M and 6R.
  - Every defect gets a disposition: the Task 4 procedure and the Task 10 check.
- **Technical criteria:**
  - A failing test for each fix: Task 4.
  - Build, lint, typecheck and tests: Task 11.
  - `cf build` and `cf next --json` unchanged for this repository: the Task 0 baselines compared in Task 11.
- **Integration criteria:**
  - Documentation: Tasks 7, 8 and 9.
  - Report and its `cf check` validation: Tasks 1 and 10.
- **Scope:** no task falls outside the slice. The Excluded items (CHANGELOG, `MIN_GUIDE_VERSION`, new options) are never touched.

### [CONCERN] Greenfield session is never pointed at the local build

Design D2 requires every scratch session to resolve `cf` to the local build. The global `cf` is the published 0.19.17, which predates slices 260–264. Task 5 includes the `cf install-commands --local` and PATH step. Task 3 does not.
- **Risk:** the `/cf:onboard` session in `greenfield-fresh` could run against the published build. The greenfield regression check would then prove nothing about this initiative's code.
- **Fix, part 1:** add the same local-build setup to Task 3, and record the `cf --version` the session saw.
- **Fix, part 2:** add a check after the session that `adoption.state` is still unset in `greenfield-fresh`. D3 defines the greenfield pass as "`adoption.state` stays unset", and Task 3 only checks it before the session, in the original project.

### [CONCERN] A blocked brownfield run needlessly blocks the README example and Task 9

The design says docs for shipped behavior do not wait on the external releases. The task wiring contradicts that in three places:
- **Task 1** puts a `BLOCKED:` line on all of Task 5 when the guide lacks the retroactive-marker rule. The Adoption Facts excerpt comes from the first `cf build`, which does not depend on the marker. Task 5R, and so Task 7's example, can therefore be held up for no reason.
- **Task 7** (lines 136–142) says that if 5R is not done, do Tasks 8 and 9 first.
- **Task 9** (line 152) says to align the `/cf:onboard` line with the root README (Task 7). Tasks 7 and 9 then depend on each other, and the fallback order cannot be followed.

Suggested changes:
- Scope Task 1's BLOCKED line to the later steps (marker, completion, first new slice) rather than the whole of Task 5.
- Let Task 5R capture the first-build Adoption Facts regardless of that block.
- Make Task 9's `/cf:onboard` alignment conditional on Task 7, or drop it from the fallback path.

### [NOTE] Task 6M's MCP result has no explicit row in Task 6R

Task 6M saves the MCP PATH outputs, but Task 6R's "one row per check" does not name the MCP check. Task 5 and Task 5R likewise leave the guide version out of the setup line, although D7 requires it. Naming both in 5R and 6R would stop either from being dropped, and Task 10 would catch the guide version anyway.

### [NOTE] "Task 4" is a heading with no checkbox

Repository convention is checkbox items for everything in a task file. Task 4 is deliberately a reference procedure that Tasks 3, 5 and 6 apply per defect. That is reasonable here, but the numbering gap and the unchecked heading may confuse the task-checker agent, so keep the "reference, not a checklist task" label.

### [NOTE] Proportionality

- **Size:** about 14 task items in a single file for a slice sized 2/5 is acceptable. The slice is mostly run time and documentation.
- **Splits:** the 5/5R and 6/6R splits exist so each commit lands only after its report rows are filled. That is defensible.
- **Test tasks:** none are added beyond the per-defect regression tests the design requires, and no load-test task is needed since the slice states no NFR.
- **Commits:** checkpoints are spread across Tasks 1, 3, 5R, 6R, 7, 8, 9, 10 and 11, not batched at the end.

### Run Digest

- Response length: 5041 chars
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
- Tokens — prompt / cached / cache write / completion / reasoning: 97277 / 11222 / 86051 / 5547 / not computed
- Duration: 44.7 s
- Cost: $0.40 (provider)
- `## Summary` located: yes
- `## Findings` located: yes
- Finding-shaped matches — whole response: 6
- Finding-shaped matches — inside fences: 0
- Finding-shaped matches — in findings section: 6
- Finding-shaped matches — surviving validation: 6
