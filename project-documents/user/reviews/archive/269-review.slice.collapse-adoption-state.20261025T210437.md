---
docType: review
layer: project
reviewType: slice
slice: collapse-adoption-state
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
reviewedSha: 39dbc8dc896f34f83a267acdd108cae73becb3dc
revision_number: 1
toolsGiven: [read_file, list_files, grep]
toolCallsMade: 5
turns: 6
promptTokens: 261676
cachedTokens: 172187
cacheWriteTokens: 89481
completionTokens: 3654
durationSeconds: 29.9
costUsd: 0.412428
costBasis: provider
runId: run-20261025-p4-498956e8
squadronVersion: 0.24.4
findings:
  - id: F001
    severity: concern
    category: scope
    summary: "New stage and outcome code ships with no production caller"
    location: "project-documents/user/slices/269-slice.collapse-adoption-state.md#Data Flow"
  - id: F002
    severity: concern
    category: scope
    summary: "Navigation is partly deleted now and fully deleted in 270"
    location: "project-documents/user/slices/269-slice.collapse-adoption-state.md#D6"
  - id: F003
    severity: concern
    category: error-handling
    summary: "File-read failure modes for `readPlanningFacts` are only partly enumerated"
    location: "project-documents/user/slices/269-slice.collapse-adoption-state.md#D4"
  - id: F004
    severity: note
    category: alignment
    summary: "D3 deviates from the slice plan's \"one-time notice\""
    location: "project-documents/user/slices/269-slice.collapse-adoption-state.md#D3"
  - id: F005
    severity: pass
    category: alignment
    summary: "Outcome ordering and detection semantics match the architecture"
    location: "project-documents/user/slices/269-slice.collapse-adoption-state.md#D5"
  - id: F006
    severity: pass
    category: compatibility
    summary: "Opt-out key and legacy migration"
    location: "project-documents/user/slices/269-slice.collapse-adoption-state.md#D1"
---

# Review: slice — slice 269

**Verdict:** CONCERNS
**Model:** claude-sonnet-5-5

## Findings

### [CONCERN] New stage and outcome code ships with no production caller

The design says "In 269 the new stage and outcome functions have no production caller." It still builds `planningFacts.ts` (new module), `decideStage`, the reworked `decideOutcome`, `DERIVED_PROVENANCE`, and a full test suite for them. The slice plan entry does assign "outcome derived from files" to 269, and 271 depends on 269 for "no stored state to report". So this is not scope creep, but it is untested-in-production code built for two later slices.
- Keep `decideStage`, `decideOutcome` and `readPlanningFacts`. They are the pure derivation the plan entry asks for.
- Cut or defer the extra pieces nothing in 269 uses: the lazy `source` throw path and the "opted-out project skips the file reads" optimization. Both can arrive with 271, which is their only consumer.

### [CONCERN] Navigation is partly deleted now and fully deleted in 270

D6 deletes `decideInProgress`, `decideComplete`, the `cf build` steps, `register-plan`, `plan-new-work` and the `routeAdoption` cases. It also narrows `AdoptionNav` and rewrites the navigation tests. Yet "Special Considerations" declines to fix `UNSET_STATE_WARNING` because "270 deletes it" and the work would be thrown away. That rationale applies equally to the rest of the navigation surface.
- Some deletion is forced, because `readAdoptionState` is removed and those branches become unreachable. Limit D6 to the minimum needed to compile and pass after that removal.
- Leave the `AdoptionNav` narrowing and the `routeAdoption` case removal to 270, which owns `adoptionNavigation.ts` and `routeAdoption` (the Excluded list).
- At minimum, state why the extra deletion is not rework for 270. Slice plan entry 270 says "No adoption-specific routing remains in the navigator", so the overlap needs a stated boundary.

### [CONCERN] File-read failure modes for `readPlanningFacts` are only partly enumerated

`readPlanningFacts` is a new I/O path. D4 covers one failure: an unreadable architecture file counts as not derived, so the project lands in "already planned". Several cases are not addressed:
- A missing `project-documents/user/` directory.
- A directory that cannot be listed.
- A malformed slice plan seen by `findExistingStatePlan`.
- A malformed `.context-forge.toml` read by `readAdoptionOptOut`.

The design should say, for each, whether it throws or degrades, so the result isn't hidden behind "as they are today".

A related risk follows from D4. A derived architecture that is unreadable, or that lacks `provenance`, drops to "already planned". For the unreadable case, this hides an incomplete adoption instead of reporting it, and it does so silently. This conflicts with the project rule against silent fallbacks. Either surface it (a warning on the facts) or record it explicitly as an accepted trade-off against the architecture's lopsided-cost rule.

### [NOTE] D3 deviates from the slice plan's "one-time notice"

The slice plan says "one-time notice". The design uses a repeating notice, because remembering that it was shown would need stored state. The design says this was raised with the PM, and the reasoning fits the architecture's "nothing persists" principle. The command it names, `cf config unset adoption.state`, exists in the CLI. Update the slice plan entry so the two documents agree.

### [PASS] Outcome ordering and detection semantics match the architecture

The `decideStage` order (opted-out, adoption-incomplete, already-planned, unplanned) matches the architecture's four-step mapping. A concept alone is excluded, a non-derived architecture lands in already-planned, and the threshold stays in `adoptionOutcome.ts`. The five-kind `AdoptionOutcome` set matches the architecture's report contract values for 271.

### [PASS] Opt-out key and legacy migration

Keeping `adoption.state = "declined"` resolves the architecture's open question about the key. Legacy values are tolerated on read, rejected on write, and never auto-rewritten, which honors the "read-only" and "additive and reversible" principles. The Migration Plan table covers every stored value.

### Run Digest

- Response length: 5302 chars
- Response is newline-free: no
- Tool calls made: 5
- Tool calls failed: 0
- Stop reason: end_turn
- Output budget: backend default
- System prompt: preset+append
- Settings sources: project
- Reasoning characters: 0
- Effort: backend default
- Turns: 6
- Tokens — prompt / cached / cache write / completion / reasoning: 261676 / 172187 / 89481 / 3654 / not computed
- Duration: 29.9 s
- Cost: $0.41 (provider)
- `## Summary` located: yes
- `## Findings` located: yes
- Finding-shaped matches — whole response: 6
- Finding-shaped matches — inside fences: 0
- Finding-shaped matches — in findings section: 6
- Finding-shaped matches — surviving validation: 6
