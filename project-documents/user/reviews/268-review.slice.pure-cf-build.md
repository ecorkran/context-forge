---
docType: review
layer: project
reviewType: slice
slice: pure-cf-build
conventionsSource: AGENTS.md
projectRules: []
project: context-forge
verdict: CONCERNS
verdictSource: stated
sourceDocument: project-documents/user/slices/268-slice.pure-cf-build.md
aiModel: claude-sonnet-5-5
aiProfile: sdk
status: complete
dateCreated: 20261025
dateUpdated: 20261025
reviewedSha: 00afdad1d28b92e0b300051aa5bf867f81a906f5
revision_number: 2
toolsGiven: [read_file, list_files, grep]
toolCallsMade: 2
turns: 3
promptTokens: 95768
cachedTokens: 11266
cacheWriteTokens: 84498
completionTokens: 3718
durationSeconds: 30.5
costUsd: 0.377039
costBasis: provider
runId: run-20261025-p4-084178d9
squadronVersion: 0.24.1
findings:
  - id: F001
    severity: pass
    category: architecture-alignment
    summary: "Scope matches the architecture's 268 definition"
    location: "project-documents/user/slices/268-slice.pure-cf-build.md#Technical Scope"
  - id: F002
    severity: concern
    category: architectural-principle
    summary: "Explicit `brownfield-adoption` key falls back instead of erroring on a missing prompt"
    location: "project-documents/user/slices/268-slice.pure-cf-build.md#D2 — Explicit `brownfield-adoption` instruction gets no special handling"
  - id: F003
    severity: concern
    category: consistency
    summary: "\"No orphan exports\" requirement contradicts what the slice keeps"
    location: "project-documents/user/slices/268-slice.pure-cf-build.md#Technical Requirements"
  - id: F004
    severity: note
    category: proportionality
    summary: "Test and verification weight is at the high end but justified"
    location: "project-documents/user/slices/268-slice.pure-cf-build.md#D5 — Purity is proven by behavior, on all three surfaces"
  - id: F005
    severity: pass
    category: integration
    summary: "Interim risk is named and bounded"
    location: "project-documents/user/slices/268-slice.pure-cf-build.md#Risk Assessment"
  - id: F006
    severity: pass
    category: dependencies
    summary: "Dependency direction and boundaries"
    location: "project-documents/user/slices/268-slice.pure-cf-build.md#Component Structure"
---

# Review: slice — slice 268

**Verdict:** CONCERNS
**Model:** claude-sonnet-5-5

## Findings

### [PASS] Scope matches the architecture's 268 definition

The slice removes the build-time resolver, the instruction swap, Adoption Facts, state writes and the pipeline seam. This is the architecture's "`cf build` is pure again". Exclusions (269 state semantics, 270 navigation, 271 report and prompt delivery, 272 docs and `MIN_GUIDE_VERSION`) match the Anticipated Slices list. Deleting the probe here (D3) matches the architecture's note that 271 "removes the probe integration (done in 268, D3)".

### [CONCERN] Explicit `brownfield-adoption` key falls back instead of erroring on a missing prompt

The architecture says "A missing guide prompt is an error, never a reason to fall back to another prompt." D2 says that when the installed guide has no prompt under `brownfield-adoption`, the build falls back to the "custom instruction" statement. D2 also removes the adoption-specific missing-profile error. The fallback is visible and already applies to unknown keys, so it is not a hidden swap. But for this key it is exactly the case the principle forbids, and D2 does not say whether the principle applies.

Pick one:
- State explicitly that the principle governs 271's delivery primitive and not the generic instruction lookup.
- Or keep a named error for this one key until 271 lands.

D2 also leaves the explicit-key path half-working until 271: the prompt renders with no facts and no comprehension path, so it stops. The slice should say this is acceptable as an interim state.

### [CONCERN] "No orphan exports" requirement contradicts what the slice keeps

The requirement says no exported symbol remains that only the deleted code used. Its only exception is the detection exports listed under Interfaces Required. But the slice also keeps `adoptionOutcome.ts` (`decideOutcome`, `BROWNFIELD_MIN_SOURCE_LINES`). It describes this as "the outcome mapping that 269 reworks and 271 exposes". After the cut, the resolver was its apparent build-path consumer, and the slice names no other production consumer. `AdoptionError` is kept because the kept detection modules throw it, which is fine. `readAdoptionState` has a named consumer in navigation. The criterion as written can't be checked as stated, or it fails on `decideOutcome`.

Either:
- Add `adoptionOutcome` to the stated exception, with 269/271 as its named consumers.
- Or name its current production consumer.

The same applies to the "have consumers outside the build or are inputs to 271" claim for the detection modules. List the consumer per module, or say plainly that they are retained for 271.

### [NOTE] Test and verification weight is at the high end but justified

D5 combines a fake `sq` on `PATH`, a CLI state matrix, MCP runs, a CLI/MCP parity check and an explicit-instruction check. D6 adds pre-cut golden files. This is heavier than a 2/5 effort slice would usually carry. Each piece maps to a stated success criterion, though: purity, parity and byte identity. The Verification Walkthrough steps 3 and 4 restate the tests and could be dropped to a one-line pointer.

### [PASS] Interim risk is named and bounded

The slice states that between 268 and 270 `cf next` and the `adoption.state` key description give wrong advice. It ties mitigation to a no-release window until 272, which fits the architecture's "cf's part ends at 272" sequencing. The slice also states what it adds no check for.

### [PASS] Dependency direction and boundaries

The build pipeline and `services/` import nothing from `adoption/` or `detection/`, and CLI and MCP both go through `createContextPipeline(projectPath)`. This agrees with the architecture's "cf does not orchestrate squadron" and "adoption logic never hides inside" `cf build`. No new I/O path is introduced. The change removes a process spawn, so no failure modes are left unenumerated and no NFR from the architecture applies.

### Run Digest

- Response length: 4902 chars
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
- Tokens — prompt / cached / cache write / completion / reasoning: 95768 / 11266 / 84498 / 3718 / not computed
- Duration: 30.5 s
- Cost: $0.38 (provider)
- `## Summary` located: yes
- `## Findings` located: yes
- Finding-shaped matches — whole response: 6
- Finding-shaped matches — inside fences: 0
- Finding-shaped matches — in findings section: 6
- Finding-shaped matches — surviving validation: 6
