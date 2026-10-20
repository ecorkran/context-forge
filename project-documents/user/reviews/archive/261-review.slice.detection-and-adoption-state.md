---
docType: review
layer: project
reviewType: slice
slice: detection-and-adoption-state
conventionsSource: AGENTS.md
projectRules: []
project: context-forge
verdict: CONCERNS
verdictSource: stated
sourceDocument: project-documents/user/slices/261-slice.detection-and-adoption-state.md
aiModel: claude-sonnet-5-5
aiProfile: sdk
status: complete
dateCreated: 20261020
dateUpdated: 20261020
reviewedSha: a8bc673ed9d876b585e510a73491006d71dd7771
revision_number: 1
toolsGiven: [read_file, list_files, grep]
toolCallsMade: 2
turns: 3
promptTokens: 98922
cachedTokens: 11266
cacheWriteTokens: 87652
completionTokens: 9582
durationSeconds: 75.7
costUsd: 0.448292
costBasis: provider
runId: run-20261020-slices-plan-a67cc35b
squadronVersion: 0.23.5
findings:
  - id: F001
    severity: pass
    category: architecture-alignment
    summary: "Outcome order, state model and scope boundaries match the architecture"
    location: "project-documents/user/slices/261-slice.detection-and-adoption-state.md:30-40"
  - id: F002
    severity: pass
    category: error-handling
    summary: "Failure modes are enumerated for the new I/O paths"
    location: "project-documents/user/slices/261-slice.detection-and-adoption-state.md#D2 — Source walk rules"
  - id: F003
    severity: concern
    category: dependency-direction
    summary: "Dependency direction: `adoption/` depends on contracts defined in `services/`"
    location: "project-documents/user/slices/261-slice.detection-and-adoption-state.md:98-100, 247-271"
  - id: F004
    severity: concern
    category: integration-points
    summary: "The squadron placeholder doesn't match the Adoption Facts contract in the architecture"
    location: "project-documents/user/slices/261-slice.detection-and-adoption-state.md:40, 223"
  - id: F005
    severity: concern
    category: under-specification
    summary: "The explicit `--it brownfield-adoption` path is under-specified"
    location: "project-documents/user/slices/261-slice.detection-and-adoption-state.md:112-121, 184, 219-220, 233"
  - id: F006
    severity: concern
    category: hidden-dependency
    summary: "Resume depends on the stored instruction staying at Phase 0, which the slice doesn't establish"
    location: "project-documents/user/slices/261-slice.detection-and-adoption-state.md:180-186, 298, 362"
  - id: F007
    severity: concern
    category: proportionality
    summary: "The design is heavier than the slice needs"
    location: "project-documents/user/slices/261-slice.detection-and-adoption-state.md:159-168, 227-236, 332-372"
  - id: F008
    severity: note
    category: architecture-alignment
    summary: "\"One detection, many consumers\" is only partly realized"
    location: "project-documents/user/slices/261-slice.detection-and-adoption-state.md:45, 199, 211"
---

# Review: slice — slice 261

**Verdict:** CONCERNS
**Model:** claude-sonnet-5-5

## Findings

### [PASS] Outcome order, state model and scope boundaries match the architecture

- The order is persisted state, then already planned (concept alone doesn't count), then code signals. This matches the architecture's three-way outcome.
- Detection is scoped to the project folder, with CI at the repo root delegated to 260's `recognizeCi`, as the architecture requires.
- Squadron probing, the retroactive marker, `cf next` and rule-file interpretation are excluded and mapped to 262, 263, 264 and 266/267.
- D9 refuses to fall back to the concept prompt when the guide lacks the profile or prompt. This honours "guide owns content, cf owns logic".

### [PASS] Failure modes are enumerated for the new I/O paths

- D2 covers ENOENT mid-walk, other filesystem errors and the entry cap.
- D5 covers git absence, non-repo and the 5 s timeout.
- D9 covers a failed state write, concurrent builds, a malformed config and a missing guide prompt.
- Each has an explicit outcome, and none falls back silently.
- The one-second detection target is stated, and the architecture sets no NFR on this path.

### [CONCERN] Dependency direction: `adoption/` depends on contracts defined in `services/`

- `AdoptionResolver`, `AdoptionSelection`, `AdoptionPromptMissingError` and `BROWNFIELD_ADOPTION_INSTRUCTION` are declared in `services/ContextIntegrator.ts`.
- `adoption/adoptionResolver.ts` must return and throw them, so the decision layer imports from the consuming layer.
- 262 and 264 also extend `adoption/`, and they will inherit that inverted import.
- Declare these contracts in `adoption/`, and have `ContextIntegrator` import them. That matches the doc's own rule that `adoption/` owns the selection rule and the instruction key.

### [CONCERN] The squadron placeholder doesn't match the Adoption Facts contract in the architecture

- The architecture says the Adoption Facts section carries the probe JSON verbatim or a plain statement that squadron is unavailable. The prompt takes the CF-only path when squadron is absent or unreadable.
- The slice introduces a third state, "Squadron probe: not run… no probe output is available". It asserts that the guide v0.22.2 prompt will take the CF-only path, but nothing in the slice verifies that.
- If the prompt keys on "unavailable" wording, a squadron user could be sent down the wrong path.
- Check the v0.22.2 prompt's handling of this section and align the bullet's wording to it. Alternatively, emit the architecture's "squadron unavailable" statement with a "probe not implemented in this cf version" qualifier.
- Add the check to the Verification Walkthrough.

### [CONCERN] The explicit `--it brownfield-adoption` path is under-specified

- D4 says an explicit `brownfield-adoption` instruction "always gets the Adoption Facts… whatever the outcome", and never writes state.
- The Data Flow steps and D8's "Outcome and why" bullet assume `decideOutcome` ran. The slice doesn't say whether the decide step (state read, planning check, source walk) runs on this path.
- If it runs, a `declined` or planned project gets a brownfield prompt whose facts say "adoption closed" or "already planned". A big non-source tree could also throw `DetectionError` on the escape hatch that D9 recommends.
- If it doesn't run, the Outcome bullet has nothing to show.
- State what the facts section says for an explicit instruction. Examples are "outcome: not evaluated (explicit instruction)" with the decide step skipped, or evaluated and shown.
- Also say which root each fact uses: `projectPath` or `checkoutPath`. The resolver receives both, but D5 only says "checkout root".

### [CONCERN] Resume depends on the stored instruction staying at Phase 0, which the slice doesn't establish

- The architecture requires that a re-run of `cf build` resume the brownfield prompt from the persisted state.
- D4 narrows selection to builds whose instruction resolves to the concept phase. Resume then works only if nothing advances or persists the project's instruction while adoption proceeds.
- That could be `cf next`, `--phase` persistence, or an instruction updated when artifacts appear.
- The slice never checks this. Walkthrough step 5 only adds files and rebuilds.
- Confirm, and record in D4, that no existing command mutates the stored instruction. If one does, the architecture's resume guarantee fails silently.
- Also note that selecting on the instruction string is selecting on a user-visible label. Using the phase constants, as the doc does for `CONCEPT_PHASE`, mitigates this. The literal `'brownfield-adoption'` instruction match remains.

### [CONCERN] The design is heavier than the slice needs

Cuts to consider:
- **Error types.** There are four new types: `AdoptionPromptMissingError`, `AdoptionStateWriteError`, `AdoptionStateReadError` and `DetectionError`. `AdoptionStateReadError` only re-wraps a parse error that already exists. Let the existing parse error propagate, and fold the other two into one adoption error that carries a remedy.
- **`SOURCE_EXTENSIONS`.** About 40 entries are specified up front. The 2000-line threshold has wide margin, so a core list with extension by constant later would meet the requirement. 265's real-repo runs are already planned to tune it.
- **Walkthrough.** Ten steps, including an `npm create vite` network step. They largely restate the Success Criteria. Keep the planned-project diff, the brownfield persist, the override, the missing-profile and the parity steps. Fold the rest into the automated fixtures already listed.
- **Rejected-alternatives text.** The "Rejected:" paragraphs restate reasoning at length. Trim them to one line each.
- The history, docs, ADR and rule-file facts are assigned by the slice plan, so don't drop them. They are gathered lazily and only rendered, which is the right weight.

### [NOTE] "One detection, many consumers" is only partly realized

- The Value section says 262–267 "read the report… from core". D5 and D7 state that no `DetectionReport` type exists and that facts go straight into the renderer.
- Only `decideOutcome`, `readAdoptionState` and `findPlanningArtifacts` are reusable. 264 extracts its own read-only resolver later.
- This is acceptable for proportionality, since the first non-build consumer shapes the contract. Reword the Value bullet so it doesn't overstate what 262–267 receive.

### Run Digest

- Response length: 7729 chars
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
- Tokens — prompt / cached / cache write / completion / reasoning: 98922 / 11266 / 87652 / 9582 / not computed
- Duration: 75.7 s
- Cost: $0.45 (provider)
- `## Summary` located: yes
- `## Findings` located: yes
- Finding-shaped matches — whole response: 8
- Finding-shaped matches — inside fences: 0
- Finding-shaped matches — in findings section: 8
- Finding-shaped matches — surviving validation: 8
