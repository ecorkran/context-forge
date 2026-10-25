---
docType: review
layer: project
reviewType: slice
slice: collapse-adoption-state
targetKind: slice
rulesSource: project
conventionsSource: AGENTS.md
projectRules: []
project: context-forge
verdict: CONCERNS
verdictSource: stated
sourceDocument: project-documents/user/slices/269-slice.collapse-adoption-state.md
aiModel: claude-sonnet-5-5
aiProfile: sdk
status: complete
dateCreated: 20261025
dateUpdated: 20261025
reviewedSha: 622a6e2a4b131d9464c3975f0aa31969dd601d8f
toolsGiven: [read_file, list_files, grep]
toolCallsMade: 6
turns: 7
promptTokens: 373174
cachedTokens: 270277
cacheWriteTokens: 102887
completionTokens: 4164
durationSeconds: 37.9
costUsd: 0.480966
costBasis: provider
squadronVersion: 0.24.5
findings:
  - id: F001
    severity: concern
    category: error-handling
    summary: "`cf next` can hard-fail on a project that is merely unplanned"
    location: "project-documents/user/slices/269-slice.collapse-adoption-state.md#D6 — Navigation: two lines, no adoption steps"
  - id: F002
    severity: concern
    category: dependency-direction
    summary: "Module dependency cycle between `adoption/` and `introspection/`"
    location: "project-documents/user/slices/269-slice.collapse-adoption-state.md#Component Structure"
  - id: F003
    severity: note
    category: proportionality
    summary: "Proportionality is acceptable"
    location: "project-documents/user/slices/269-slice.collapse-adoption-state.md#Technical Scope"
  - id: F004
    severity: note
    category: alignment
    summary: "Alignment with the architecture and slice plan"
    location: "project-documents/user/slices/269-slice.collapse-adoption-state.md#D5 — Split the mapping into a stage and an outcome"
  - id: F005
    severity: note
    category: consistency
    summary: "Remedy constant in `sourceVolume.ts` is still the old text"
    location: "project-documents/user/slices/269-slice.collapse-adoption-state.md#Migration Plan"
---

# Review: slice — slice 269

**Verdict:** CONCERNS
**Model:** claude-sonnet-5-5

## Findings

### [CONCERN] `cf next` can hard-fail on a project that is merely unplanned

D6 says a source-volume walk failure throws `AdoptionError` and propagates. For navigation that is a new failure mode, because today's unset-state path never walks the tree (the Risk section admits this). `measureSourceVolume` throws in two situations:
- On any non-ENOENT `readdir`, `lstat` or `readFile` error.
- When `MAX_WALK_ENTRIES` (20,000) entries are visited before 2000 source lines are found (`detection/sourceVolume.ts:89`).

The second case is not rare. A greenfield project with a concept document and a large asset, data or vendored tree reaches it without being brownfield. That project would now get an error from `cf next` and `workflow_next`, with an opt-out remedy that tells a greenfield user to declare something about their project.

The warning is advisory, yet it can block the project's primary navigation command. The design doesn't mention the cap case and has no test for it. Decide this explicitly. One option is for `adoptionNavLines` to catch `AdoptionError` from the walk and return a visible warning that detection was inconclusive, which is not a silent fallback. The other is to keep the throw and document it as intended, with a test for the cap case. Name the cap case in D6 either way.

### [CONCERN] Module dependency cycle between `adoption/` and `introspection/`

The new `adoption/planningFacts.ts` consumes `findExistingStatePlan` and `parseFrontmatter` from `introspection/parsers/`. The new `introspection/adoptionLines.ts` consumes `adoption/` (opt-out, facts, stage). That makes `adoption → introspection → adoption` at the module level.

Slice 271's report will also consume `adoption/` from outside introspection. Place `adoptionNavLines` in `adoption/`, or in a layer above both, and have `WorkflowNavigator` import it from there. The dependency then runs one way: navigator → adoption → parsers. The same fix keeps the arch principle "one detection, many consumers" clean for 271. The design should state the intended layering.

### [NOTE] Proportionality is acceptable

The design adds `planningFacts.ts`, `adoptionLines.ts` and the `decideStage`/`decideOutcome` split. Each is justified by 271 reuse or by skipping the source walk. The repeating legacy notice (D3) is required by the slice plan's "ignored with a notice". The `cf check` legacy-value test is cheap and guards a stated success criterion. Folding 270 in delivers the plan's scope, so nothing assigned to this slice is dropped. No cuts are needed.

### [NOTE] Alignment with the architecture and slice plan

- **Outcome order:** D5 matches the arch's Detection order: opted out, then adoption incomplete, then already planned, then code signals.
- **Concept-only rule:** a concept on its own is not a planning artifact, as the arch requires.
- **Outcome names:** `AdoptionOutcome` uses the five outcomes the arch fixes for the 271 report contract.
- **Navigation:** `cf next` gets one line for unadopted brownfield and one for incomplete adoption, with no adoption steps, which is arch row (g). Naming `sq onboard` only in message text does not breach the PM ban on cf invoking squadron.
- **Writes:** nothing writes config, so the read-only principle holds.
- **Opt-out key:** D1 keeps `declined` under `adoption.state`. That resolves the choice the slice plan left open, and the reasoning is sound.
- **`cf config unset`:** `cf config unset` exists in `packages/cli/src/commands/config.ts`, so the notice's remedy is real.

### [NOTE] Remedy constant in `sourceVolume.ts` is still the old text

`OVERRIDE_REMEDY` in `detection/sourceVolume.ts:37-39` currently offers `in_progress`. The design already lists this for removal and for sharing a single definition from `adoption/adoptionState.ts`. When it does, `detection/` will import from `adoption/`. Check that this direction doesn't add a second cycle. If it does, put the constant in a lower-level module that both can import.

### Run Digest

- Response length: 5020 chars
- Response is newline-free: no
- Tool calls made: 6
- Tool calls failed: 0
- Stop reason: end_turn
- Output budget: backend default
- System prompt: preset+append
- Settings sources: project
- Reasoning characters: 0
- Effort: backend default
- Turns: 7
- Tokens — prompt / cached / cache write / completion / reasoning: 373174 / 270277 / 102887 / 4164 / not computed
- Duration: 37.9 s
- Cost: $0.48 (provider)
- `## Summary` located: yes
- `## Findings` located: yes
- Finding-shaped matches — whole response: 5
- Finding-shaped matches — inside fences: 0
- Finding-shaped matches — in findings section: 5
- Finding-shaped matches — surviving validation: 5
