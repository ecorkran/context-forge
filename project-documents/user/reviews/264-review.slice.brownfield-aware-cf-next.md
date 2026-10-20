---
docType: review
layer: project
reviewType: slice
slice: brownfield-aware-cf-next
conventionsSource: AGENTS.md
projectRules: []
project: context-forge
verdict: CONCERNS
verdictSource: stated
sourceDocument: project-documents/user/slices/264-slice.brownfield-aware-cf-next.md
aiModel: claude-sonnet-5-5
aiProfile: sdk
status: complete
dateCreated: 20261020
dateUpdated: 20261020
reviewedSha: 3c10eb2a273c85be6c1dbb8d2152cf03c29387c2
revision_number: 2
toolsGiven: [read_file, list_files, grep]
toolCallsMade: 2
turns: 3
promptTokens: 96015
cachedTokens: 11266
cacheWriteTokens: 84745
completionTokens: 4880
durationSeconds: 43.5
costUsd: 0.389646
costBasis: provider
runId: run-20261020-slices-plan-a67cc35b
squadronVersion: 0.23.5
findings:
  - id: F001
    severity: concern
    category: scope-gap
    summary: "D2's accepted derailment case rests on a premise the architecture contradicts"
    location: "project-documents/user/slices/264-slice.brownfield-aware-cf-next.md#D2 — `cf next` doesn't run brownfield detection"
  - id: F002
    severity: concern
    category: dependency-direction
    summary: "Package dependency becomes bidirectional and is guarded only by code review"
    location: "project-documents/user/slices/264-slice.brownfield-aware-cf-next.md#Special Considerations"
  - id: F003
    severity: concern
    category: proportionality
    summary: "Design is heavier than the core goal needs, and leans on cross-slice edits"
    location: "project-documents/user/slices/264-slice.brownfield-aware-cf-next.md#D1, #D4, #D6, #Interfaces Required"
  - id: F004
    severity: note
    category: architecture-alignment
    summary: "Departure from \"One detection, many consumers\" is recorded but the architecture is not amended"
    location: "project-documents/user/slices/264-slice.brownfield-aware-cf-next.md#D2"
  - id: F005
    severity: note
    category: coupling
    summary: "Step count and ordering mirror the guide prompt"
    location: "project-documents/user/slices/264-slice.brownfield-aware-cf-next.md#D4"
  - id: F006
    severity: pass
    category: error-handling
    summary: "Layering, read-only behavior, and failure-mode coverage"
    location: "project-documents/user/slices/264-slice.brownfield-aware-cf-next.md#D3, #D7"
---

# Review: slice — slice 264

**Verdict:** CONCERNS
**Model:** claude-sonnet-5-5

## Findings

### [CONCERN] D2's accepted derailment case rests on a premise the architecture contradicts

D2 accepts "Phase 0, concept present, state unset → Advance to Phase 1" on a brownfield repo. Its justification is that "no CF flow writes" a concept before the first `cf build`. The architecture's Current State says the existing onboarding is a greenfield recipe that runs the Phase 0 conversation and never inspects the code. Projects onboarded by earlier releases can therefore already hold a greenfield-written `000-concept` on an old codebase, with `adoption.state` unset.

The architecture also anticipates this case. Its "Already planned" rule says "a concept on its own does not count", and that wording only makes sense if concept-only repos exist.

For those projects, `cf next` still gives the derailing advice. Following it moves the instruction off Phase 0, so 261 D4 never runs detection. The goal "the workflow starts where the project is" is unmet for the existing adopters most likely to try this feature. The recovery path is three manual commands that `cf next` never mentions.

Either narrow the claim and have the Phase 0 / concept-present / state-unset recommendation name the recovery path, or reconsider a cheap read-only detection signal. Do not leave the premise as stated.

### [CONCERN] Package dependency becomes bidirectional and is guarded only by code review

`adoption/` already imports `introspection/parsers/` (263). This slice makes `introspection/` import `adoption/`. The slice argues there is no file-level cycle, but at package level the two layers now depend on each other. The only guard is "a code-review check" on import paths. That leaves the boundary rule under-specified: nothing mechanical stops a later change from importing `introspection/WorkflowNavigator` from `adoption/`.

Pick one of these:
- Put the shared parsers and the existing-state-plan predicate in a lower layer that both import.
- Add a lint or import-boundary rule to the slice's technical requirements.

### [CONCERN] Design is heavier than the core goal needs, and leans on cross-slice edits

The architecture's goal for this slice is two behaviors: point at the next adoption step while in progress, and point at the first new work once complete. The design delivers that with:
- seven `AdoptionNavStep` values;
- four result kinds;
- a nine-field inputs struct;
- a two-command variant of `plan-new-work`, which needs its own `slicePlanningInstruction` input;
- a `gateBlockAction` extraction;
- three new helpers that edit 261's resolver and 263's completion function, both unbuilt.

Candidates to cut or defer:
- The phase-aware two-command `plan-new-work` could be a single message with the phase command in the rationale. That removes the `slicePlanningInstruction` input and one unit-test row.
- `plan-missing` covers only a hand-set `complete` state, which is not a slice-owned flow.
- The long D2 and D7 prose largely restates 261 and 263 behavior.

Dropping `register-plan` or the arch gate is not recommended, because both serve stated goals.

### [NOTE] Departure from "One detection, many consumers" is recorded but the architecture is not amended

D2 explicitly records that `cf next` consumes only the persisted `adoption.state`, not detection. The architecture still lists `cf next` as a detection consumer. Make the same amendment in the architecture so later slices (265, reconciliation) don't read the original principle as binding.

### [NOTE] Step count and ordering mirror the guide prompt

"Adoption step N of 3" hard-codes the guide prompt's artifact sequence in cf. The architecture's guide-prompt contract (concept → architecture → existing-state plan) sanctions this. If the guide changes the sequence, cf's wording drifts silently. A test that pins the three artifact kinds to the architecture contract would make the coupling visible.

### [PASS] Layering, read-only behavior, and failure-mode coverage

- `cf next` stays read-only (D3), and completion remains the build's single writer.
- A malformed config, an out-of-enum state and an unreadable directory each fail explicitly with named messages, never as silent fallbacks.
- Parity between `cf next` and `workflow_next` follows from both calling `getNext`.
- The slice states the performance cost for non-adopting projects. The architecture sets no NFR on this path.

### Run Digest

- Response length: 5491 chars
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
- Tokens — prompt / cached / cache write / completion / reasoning: 96015 / 11266 / 84745 / 4880 / not computed
- Duration: 43.5 s
- Cost: $0.39 (provider)
- `## Summary` located: yes
- `## Findings` located: yes
- Finding-shaped matches — whole response: 6
- Finding-shaped matches — inside fences: 0
- Finding-shaped matches — in findings section: 6
- Finding-shaped matches — surviving validation: 6
