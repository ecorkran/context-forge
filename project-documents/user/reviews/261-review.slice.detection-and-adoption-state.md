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
reviewedSha: b88df50313d4624368a1405dbb52c18b1f10236f
revision_number: 2
toolsGiven: [read_file, list_files, grep]
toolCallsMade: 4
turns: 5
promptTokens: 265886
cachedTokens: 174618
cacheWriteTokens: 91260
completionTokens: 7246
durationSeconds: 60.5
costUsd: 0.455709
costBasis: provider
runId: run-20261020-slices-plan-a67cc35b
squadronVersion: 0.23.5
findings:
  - id: F001
    severity: pass
    category: architecture-alignment
    summary: "Outcome order, boundaries and failure handling match the architecture"
    location: "project-documents/user/slices/261-slice.detection-and-adoption-state.md#Technical Decisions"
  - id: F002
    severity: concern
    category: scope-and-interfaces
    summary: "No reusable detection report is delivered, although the plan and architecture promise one"
    location: "project-documents/user/slices/261-slice.detection-and-adoption-state.md#D5 and #D7"
  - id: F003
    severity: concern
    category: integration
    summary: "Phase 0 gating leaves the exit from adoption undefined"
    location: "project-documents/user/slices/261-slice.detection-and-adoption-state.md#D4 and #Integration Points"
  - id: F004
    severity: concern
    category: error-handling
    summary: "Source signal can silently miss real codebases, and the walk cap can block a build"
    location: "project-documents/user/slices/261-slice.detection-and-adoption-state.md#D2"
  - id: F005
    severity: note
    category: dependency-direction
    summary: "Package-level import direction between `adoption/` and `services/`"
    location: "project-documents/user/slices/261-slice.detection-and-adoption-state.md#Component Structure"
  - id: F006
    severity: note
    category: proportionality
    summary: "Proportionality is acceptable, with some restatement"
    location: "project-documents/user/slices/261-slice.detection-and-adoption-state.md"
---

# Review: slice — slice 261

**Verdict:** CONCERNS
**Model:** claude-sonnet-5-5

## Findings

### [PASS] Outcome order, boundaries and failure handling match the architecture

- **Outcome order:** D1 uses the architecture's order of state, then already planned, then code signals. A concept alone does not count as planned.
- **Boundaries:** `detection/` stays facts-only and policy lives in `adoption/`. Squadron is not probed, and the "squadron unavailable" statement is checked against the v0.22.2 prompt.
- **Missing guide profile:** D9 fails the build with a named error and never falls back to the concept prompt.
- **I/O failure modes:** D2, D5 and D9 cover walk errors, the walk cap, git timeout or absence, state write failure, concurrent writes and a malformed TOML file. Each has an explicit strategy.

### [CONCERN] No reusable detection report is delivered, although the plan and architecture promise one

- **What the plan assigns:** The slice plan says 261 "provides the detection report, the outcome and the adoption state (consumed by 262–264, 266, 267)". The architecture's principle is "One detection, many consumers", exposed to every surface including `cf next`.
- **What the design does:** D5 drops the `DetectionReport` type and builder. Facts are gathered lazily inside `adoptionResolver.ts` only when the brownfield prompt is selected. The state write (step 5) sits in the same sequence as the decision.
- **Consequence:** D7 defers the read-only resolver to 264 ("264 extracts one from `adoptionResolver.ts`"). The one decision that is meant to live in core is therefore only partly reusable. 264 and 262 have to refactor the build-time resolver to get the report.
- **What to change:** Either split the pure decision from the build side effects now, or reduce the Provides list and the "One decision in core" claim to what is actually delivered. A thin `decide(checkoutPath)` function returning the outcome with no write would cost little. The Integration Requirements ("263 and 264 can read and write the state through `adoption/` only") should then be checked against it.

### [CONCERN] Phase 0 gating leaves the exit from adoption undefined

- **The coupling:** D4 selects the brownfield prompt only while the stored instruction is the concept phase. Nothing in cf moves the phase (D4 verified this). The architecture's resume model ("The adoption state resumes the brownfield prompt") now depends on the instruction staying at Phase 0 for the whole adoption.
- **The gap:** When the state reaches `complete`, the stored instruction is still `Phase 0: Concept`. `cf build` on an adopted project then assembles the concept prompt, because `complete` is treated as closed. The architecture's goal is that the workflow "starts where the project is".
- **What to change:** D4 records the constraint on 264 but not who moves the phase at completion. Add to Integration Points for 263 and 264 that completing adoption must also take the instruction off the concept phase, or say explicitly that the PM does this by hand. Otherwise the property the slice relies on becomes a silent trap for the slices after it.

### [CONCERN] Source signal can silently miss real codebases, and the walk cap can block a build

- **Missed languages:** `SOURCE_EXTENSIONS` omits mainstream ecosystems such as `vue`, `svelte`, `scala`, `ex`/`exs`, `dart`, `sh` and `lua`. A real Vue, Svelte, Elixir, Dart or Scala repo scores well under 2000 lines and gets the greenfield concept prompt.
- **No visibility:** The Adoption Facts section reports only the count. It reports nothing about skipped files, so the PM cannot see why a large repo was judged greenfield.
- **Cost of the miss:** The architecture says a false greenfield costs only a conversation, and that is true here. But brownfield detection is the whole point of the initiative, and D2 defers gap discovery to 265.
- **Hard fail on the cap:** Hitting `MAX_WALK_ENTRIES` (20,000) below the line threshold throws `AdoptionError` and fails the whole Phase 0 build. That is plausible for a repo with large non-source trees that are not in `EXCLUDED_DIRS`. The failure carries a remedy, but it is harsher than the architecture's lopsided-cost reasoning supports.
- **What to change:** Widen the extension list to cover the main ecosystems. Decide whether the cap should fail the build or report "undetermined" in the facts. Report the number of unrecognized-extension files, so the PM can see the miss.

### [NOTE] Package-level import direction between `adoption/` and `services/`

`ContextIntegrator` (services) imports contracts from `adoption/`, while `adoptionResolver.ts` imports the guide parsers from `services/`. The `contracts.ts` split avoids a file-level cycle, but the two directories still depend on each other. The design must ensure the integrator never imports from `adoption/index.ts`. Wiring the resolver in `CoreServiceFactory`, the composition root, makes the direction one-way.

### [NOTE] Proportionality is acceptable, with some restatement

The mechanism count fits an effort 3/5 slice. The explicit `brownfield-adoption` instruction path is extra to the plan, but D9 needs it as the escape hatch for read-only checkouts. The resolver's step order is stated three times (Data Flow, D7 and Component Structure), and the Technical Requirements fixture list overlaps the Functional Requirements list. Both could be trimmed without losing anything.

### Run Digest

- Response length: 6506 chars
- Response is newline-free: no
- Tool calls made: 4
- Tool calls failed: 0
- Stop reason: end_turn
- Output budget: backend default
- System prompt: preset+append
- Settings sources: project
- Reasoning characters: 0
- Effort: backend default
- Turns: 5
- Tokens — prompt / cached / cache write / completion / reasoning: 265886 / 174618 / 91260 / 7246 / not computed
- Duration: 60.5 s
- Cost: $0.46 (provider)
- `## Summary` located: yes
- `## Findings` located: yes
- Finding-shaped matches — whole response: 6
- Finding-shaped matches — inside fences: 0
- Finding-shaped matches — in findings section: 6
- Finding-shaped matches — surviving validation: 6
