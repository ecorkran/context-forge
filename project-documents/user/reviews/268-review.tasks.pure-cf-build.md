---
docType: review
layer: project
reviewType: tasks
slice: pure-cf-build
conventionsSource: AGENTS.md
projectRules: []
project: context-forge
verdict: CONCERNS
verdictSource: stated
sourceDocument: project-documents/user/tasks/268-tasks.pure-cf-build.md
aiModel: claude-sonnet-5-5
aiProfile: sdk
status: complete
dateCreated: 20261025
dateUpdated: 20261025
reviewedSha: f903c18bc04f160cfe20712ffb74caf8f1fa43fb
revision_number: 2
toolsGiven: [read_file, list_files, grep]
toolCallsMade: 3
turns: 4
promptTokens: 176610
cachedTokens: 89734
cacheWriteTokens: 86870
completionTokens: 4094
durationSeconds: 34.6
costUsd: 0.398138
costBasis: provider
runId: run-20261025-p5-2a7d0b92
squadronVersion: 0.24.1
findings:
  - id: F001
    severity: concern
    category: sequencing
    summary: "Task 3.2a's \"core tests pass\" gate fails because 3.1–3.2 leave tests that assert the removed output"
    location: "project-documents/user/tasks/268-tasks.pure-cf-build.md:89-101"
  - id: F002
    severity: concern
    category: sequencing
    summary: "The note on what fails between 3.4 and 3.6 is wrong for 3.4–3.5"
    location: "project-documents/user/tasks/268-tasks.pure-cf-build.md:87"
  - id: F003
    severity: concern
    category: task-clarity
    summary: "The 6.2 export audit is open-ended for a junior implementer"
    location: "project-documents/user/tasks/268-tasks.pure-cf-build.md:200"
  - id: F004
    severity: note
    category: scope
    summary: "5.1 bundles many assertions and a mutation check into one task"
    location: "project-documents/user/tasks/268-tasks.pure-cf-build.md:175-186"
  - id: F005
    severity: pass
    category: coverage
    summary: "Success criteria coverage"
    location: "project-documents/user/tasks/268-tasks.pure-cf-build.md"
  - id: F006
    severity: pass
    category: process
    summary: "Commit cadence and proportionality"
    location: "project-documents/user/tasks/268-tasks.pure-cf-build.md"
---

# Review: tasks — slice 268

**Verdict:** CONCERNS
**Model:** claude-sonnet-5-5

## Findings

### [CONCERN] Task 3.2a's "core tests pass" gate fails because 3.1–3.2 leave tests that assert the removed output

Tasks 3.1–3.2 stop rendering `Comprehension:` and `### Adoption Facts`, while the resolver still produces those fields until 3.3. The 3.2a gate is `pnpm --filter @context-forge/core test`. A grep of the tests shows several more files than 3.1–3.2 edit that reference those strings:
- `core/tests/pipeline-integration.test.ts`
- `core/tests/adoption/adoptionBuild.integration.test.ts`
- `core/tests/adoption/adoptionResolver.test.ts`
- `core/tests/adoption/adoptionFacts.test.ts`
- `core/tests/services/ContextIntegrator.test.ts`

Tasks 3.1–3.2 only touch `SectionBuilder.test.ts` and `ContextTemplateEngine.test.ts`. The files above are deleted or edited later, in 3.3 and 4.1.

Brownfield cases that assert rendered facts will fail at 3.2a if they exercise the render path. A junior implementer would then either improvise edits outside the task or commit a red tree. Pick one fix:
- Fold 3.1–3.2 into the 3.3–3.6 commit.
- Add the test edits to 3.2 for every file that asserts the rendered text.
- Run the core tests at 3.2a only for the two touched test files, and move the full-suite gate to 3.7.

### [CONCERN] The note on what fails between 3.4 and 3.6 is wrong for 3.4–3.5

The note says only `mcp-server` typecheck is expected to fail between 3.4 and 3.6. After 3.4 rebuilds core's `dist`, `cli/src/commands/build.ts` still passes a second argument to the one-argument `createContextPipeline`. So `cli` also fails typecheck until 3.5. The same note says the CLI passes once 3.5 is done, so it contradicts itself. Reword it to say that `cli` and `mcp-server` both fail typecheck after 3.4, `cli` is fixed by 3.5, and `mcp-server` by 3.6.

### [CONCERN] The 6.2 export audit is open-ended for a junior implementer

The audit tells the implementer to walk every remaining export in `adoption/index.ts` and `detection/index.ts`. They must match each to a production consumer from the design's Interfaces Required, or to a retained module, and remove any export that only deleted code used. This is the only task that checks the "no orphan exports" Technical Requirement, and it has no concrete procedure.

The design already names the expected survivors: `pathPresent`, `presentPaths`, `sourceVolume`, `ciDetection`, `buildManifest`, `planningArtifacts`, `history`, `comprehensionAnalysis`, `adoptionOutcome`, `readAdoptionState` and `AdoptionError`. Add that list to the task as the expected set, so anything outside it is a candidate to remove and the audit becomes mechanical. The conditional commit in 6.3 is the right mechanism for the cleanup.

### [NOTE] 5.1 bundles many assertions and a mutation check into one task

Task 5.1 has effort 3 and covers fixture setup, a fake `sq`, a snapshot helper, four run variants, a parity check, an explicit-key check and a manual mutation check. Each piece traces to D5, so nothing is scope creep. If it proves too large for one pass, split it at the snapshot-helper boundary: infrastructure first, then the assertions. The mutation check is a manual verification step, not a deliverable.

### [PASS] Success criteria coverage

- **No `adoption.state` read or write, no detection, no `sq` spawn, and Phase 0 returns the concept prompt:** tasks 3.3–3.6 remove the code, and 5.1 proves it by behavior.
- **Byte-identical greenfield, planned and later-phase output:** golden capture in 2.1–2.3, checked in 3.7 and 6.1.
- **CLI and MCP parity:** 5.1.
- **Guide warning preserved:** the 3.5 and 3.6 constraints, plus 6.1's check that no warning `expect` line changed.
- **`services/` imports nothing from `adoption/` or `detection/`:** the 3.3 grep and 6.2.
- **No orphan exports:** 6.2.
- **Format, lint, typecheck and full tests:** 3.7 and 6.1.
- **Verification Walkthrough:** 6.3.

No task lacks a success criterion. The load-test and CI-gating checks do not apply because the slice states no NFR.

### [PASS] Commit cadence and proportionality

Commits are spread across the file: 2.3, 3.2a, 3.7, one each in 4.1–4.4, and 5.1. The test-with pattern holds because test edits sit in the same task as the code they cover. The single task file suits a slice of effort 2/5. The merge and push steps are correctly left to Phase 7.

### Run Digest

- Response length: 5137 chars
- Response is newline-free: no
- Tool calls made: 3
- Tool calls failed: 0
- Stop reason: end_turn
- Output budget: backend default
- System prompt: preset+append
- Settings sources: project
- Reasoning characters: 0
- Effort: backend default
- Turns: 4
- Tokens — prompt / cached / cache write / completion / reasoning: 176610 / 89734 / 86870 / 4094 / not computed
- Duration: 34.6 s
- Cost: $0.40 (provider)
- `## Summary` located: yes
- `## Findings` located: yes
- Finding-shaped matches — whole response: 6
- Finding-shaped matches — inside fences: 0
- Finding-shaped matches — in findings section: 6
- Finding-shaped matches — surviving validation: 6
