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
reviewedSha: e6542cb74a4778872caee399f162a9bc1852952f
toolsGiven: [read_file, list_files, grep]
toolCallsMade: 8
turns: 9
promptTokens: 508560
cachedTokens: 414100
cacheWriteTokens: 94446
completionTokens: 4692
durationSeconds: 43.0
costUsd: 0.466872
costBasis: provider
runId: run-20261025-p4-498956e8
squadronVersion: 0.24.4
findings:
  - id: F001
    severity: concern
    category: under-specification
    summary: "D5's \"single directory pass\" conflicts with the existing interfaces it relies on"
    location: "project-documents/user/slices/269-slice.collapse-adoption-state.md#D5 — Split the mapping into a stage and an outcome"
  - id: F002
    severity: concern
    category: under-specification
    summary: "Concept-only projects are not addressed in the \"already planned\" rule"
    location: "project-documents/user/slices/269-slice.collapse-adoption-state.md#D5 — Split the mapping into a stage and an outcome"
  - id: F003
    severity: concern
    category: proportionality
    summary: "D6's navigation mapping adds a throwaway layer, and the design says so itself"
    location: "project-documents/user/slices/269-slice.collapse-adoption-state.md#D6 — Navigation adapts with a mapping, not a rewrite"
  - id: F004
    severity: concern
    category: integration
    summary: "Success criteria claim `cf check` is unaffected without verifying how it reads config"
    location: "project-documents/user/slices/269-slice.collapse-adoption-state.md#Success Criteria"
  - id: F005
    severity: note
    category: scope
    summary: "Repeating notice replaces the plan's \"one-time notice\""
    location: "project-documents/user/slices/269-slice.collapse-adoption-state.md#D3 — The notice repeats until the value is removed; cf never removes it"
  - id: F006
    severity: pass
    category: uncategorized
    summary: "Outcome ordering and stored-value model match the amended arch"
    location: "project-documents/user/slices/269-slice.collapse-adoption-state.md#D5 — Split the mapping into a stage and an outcome"
  - id: F007
    severity: pass
    category: uncategorized
    summary: "Boundaries, dependencies and slice hand-offs are clean"
    location: "project-documents/user/slices/269-slice.collapse-adoption-state.md#Integration Points"
---

# Review: slice — slice 269

**Verdict:** CONCERNS
**Model:** claude-sonnet-5-5

## Findings

### [CONCERN] D5's "single directory pass" conflicts with the existing interfaces it relies on

D5 says `readPlanningFacts` does "a single `findPlanningArtifacts` pass" and that both the derived-architecture check and `findExistingStatePlan` "work from that pass's results, not from a second directory scan." The interfaces listed under Interfaces Required don't support that:
- `findExistingStatePlan(checkoutPath)` takes a path and calls `findPlanningArtifacts` itself (`existingStatePlan.ts:17-18`).
- `findArchitectureArtifacts(root)` lists the directories again on its own.

So `readPlanningFacts` as written makes three scans. The design either changes those signatures to accept pre-listed results, which the Component Structure table and Consumers Updated don't mention, or the single-pass claim is wrong. Pick one:
- Drop the single-pass claim. The scans are cheap and happen only on `cf next`.
- Name the signature change for `findExistingStatePlan` and `findArchitectureArtifacts`, and list the callers it affects.

The lighter option is the first.

### [CONCERN] Concept-only projects are not addressed in the "already planned" rule

The arch's Detection case 3 says "A concept on its own does not count" as a planning artifact. D5 step 3 uses `artifacts.length > 0` from `findPlanningArtifacts`, and the design never says whether that function excludes concepts. The test list has no concept-only case. If concepts are included, a concept-only brownfield repo would be classified `already-planned` instead of brownfield. Add the rule to D5 and a concept-only fixture to `planningFacts.test.ts` and `adoptionOutcome.test.ts`.

### [CONCERN] D6's navigation mapping adds a throwaway layer, and the design says so itself

D6 introduces `AdoptionNavState` and a stage-to-state table that slice 270 deletes. The Special Considerations section declines to fix `UNSET_STATE_WARNING` because "work 270 throws away" isn't worth doing. The same reasoning applies to this table. It is needed to keep `cf next` working between the two slices, so it can't simply be cut. It can be kept to the minimum:
- Do not introduce a renamed internal type. Keep the existing switch input and map into it.
- State that this mapping is the only navigation change besides the deletions.

Alternatively, sequence 269 and 270 together. The design should say which.

### [CONCERN] Success criteria claim `cf check` is unaffected without verifying how it reads config

The criteria and Verification step 2 say a stored `in_progress` or `complete` produces no error on `cf check`, and that `cf check` "describe[s] only the remaining value" (slice plan). The design only establishes that `ConfigManager.get` skips enum validation. It doesn't say whether `cf check` or config loading validates stored values against `ADOPTION_STATES`, or which code path would do so. Once the enum shrinks, any such validator would flag legacy values. The Risk section covers `cf next` but not other readers. Add a check, or a named test, that every reader of the config file tolerates legacy values. Also add `adoption/contracts.ts`, whose `AdoptionError` doc comment mentions `adoption.state`, to the sweep, or confirm the comment is accurate after the change.

### [NOTE] Repeating notice replaces the plan's "one-time notice"

The slice plan asks for a one-time notice. D3 documents why that is not implemented: remembering it would store state, which is what this slice removes. The repeating notice names the command that silences it. This is a reasoned, recorded deviation and is consistent with the arch's "no stored state" principle. I recommend noting the deviation back in the slice plan entry so the two documents agree.

### [PASS] Outcome ordering and stored-value model match the amended arch

`decideStage` order matches the arch Detection section: opted out, then adoption incomplete (derived architecture and no retroactive plan), then already planned, then brownfield or greenfield by `BROWNFIELD_MIN_SOURCE_LINES`. Keeping `declined` under `adoption.state` (D1) and leaving the retroactive marker unchanged are consistent with the arch. The data flow keeps read paths read-only.

### [PASS] Boundaries, dependencies and slice hand-offs are clean

- **Dependencies:** they point one way: 269 depends on 268 and exposes primitives that 270 and 271 consume.
- **Excluded work:** deleting navigation, the report command and the docs stay with 270, 271 and 272.
- **Squadron ban:** nothing in the design touches squadron, so the PM ban is respected.
- **Failure handling:** unreadable architecture files, legacy values and unknown values each have explicit behavior (D2, D4).

### Run Digest

- Response length: 6155 chars
- Response is newline-free: no
- Tool calls made: 8
- Tool calls failed: 0
- Stop reason: end_turn
- Output budget: backend default
- System prompt: preset+append
- Settings sources: project
- Reasoning characters: 0
- Effort: backend default
- Turns: 9
- Tokens — prompt / cached / cache write / completion / reasoning: 508560 / 414100 / 94446 / 4692 / not computed
- Duration: 43.0 s
- Cost: $0.47 (provider)
- `## Summary` located: yes
- `## Findings` located: yes
- Finding-shaped matches — whole response: 7
- Finding-shaped matches — inside fences: 0
- Finding-shaped matches — in findings section: 7
- Finding-shaped matches — surviving validation: 7
