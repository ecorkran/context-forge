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
reviewedSha: 5bf364897adf7d1348d7bfd4ece017359965c1d8
revision_number: 2
toolsGiven: [read_file, list_files, grep]
toolCallsMade: 5
turns: 6
promptTokens: 340167
cachedTokens: 251887
cacheWriteTokens: 88270
completionTokens: 2813
durationSeconds: 26.7
costUsd: 0.407149
costBasis: provider
runId: run-20261025-p4-498956e8
squadronVersion: 0.24.4
findings:
  - id: F001
    severity: pass
    category: architecture-alignment
    summary: "Outcome order and statelessness match the amended Detection section"
    location: "project-documents/user/slices/269-slice.collapse-adoption-state.md#D5 — Split the mapping into a stage and an outcome"
  - id: F002
    severity: pass
    category: dependencies
    summary: "Dependency direction and the squadron ban are respected"
    location: "project-documents/user/slices/269-slice.collapse-adoption-state.md#Integration Points"
  - id: F003
    severity: concern
    category: scope-deviation
    summary: "One-time notice replaced by a repeating notice without PM ruling"
    location: "project-documents/user/slices/269-slice.collapse-adoption-state.md#D3 — The notice repeats until the value is removed; cf never removes it"
  - id: F004
    severity: concern
    category: integration
    summary: "Intermediate state leaves mid-adoption projects with no adoption guidance between 269 and 270"
    location: "project-documents/user/slices/269-slice.collapse-adoption-state.md#D6 — Navigation changes its input only; 270 deletes it whole"
  - id: F005
    severity: concern
    category: proportionality
    summary: "Design carries scope that can be cut or deferred"
    location: "project-documents/user/slices/269-slice.collapse-adoption-state.md#Technical Scope"
  - id: F006
    severity: concern
    category: error-handling
    summary: "Failure modes for the new frontmatter reads are partly enumerated, and one case routes silently"
    location: "project-documents/user/slices/269-slice.collapse-adoption-state.md#D4 — \"Derived\" means `provenance: derived` in an architecture file's frontmatter"
  - id: F007
    severity: note
    category: nfr
    summary: "NFRs"
    location: "project-documents/user/slices/269-slice.collapse-adoption-state.md#Technical Requirements"
---

# Review: slice — slice 269

**Verdict:** CONCERNS
**Model:** claude-sonnet-5-5

## Findings

### [PASS] Outcome order and statelessness match the amended Detection section

`decideStage` checks opted-out, then adoption-incomplete (derived architecture and no retroactive plan), then already-planned (any planning artifact), then unplanned. That is the order in arch Detection items 1–3, and `decideOutcome` covers item 4. A concept alone is not a planning artifact, which matches the arch. Nothing is stored except the opt-out, and the read paths write nothing.

### [PASS] Dependency direction and the squadron ban are respected

The slice depends on 268 only. It gives 270 and 271 the primitives they consume and adds no cf→squadron coupling. It leaves deletion of the navigation module to 270, which matches the slice plan's ordering, and gives 271 the `legacyAdoptionStateNotice` function to reuse.

### [CONCERN] One-time notice replaced by a repeating notice without PM ruling

The slice plan entry for 269 assigns "ignored with a one-time notice, never an error". D3 changes this to a notice shown on every `cf next` and `workflow_next` until the user runs `cf config unset adoption.state`. The reasoning is sound: a true one-time notice needs a stored "shown" flag, which brings back state. D3 itself says "The PM has not ruled on this yet" and leaves a possible design change before Phase 5. A decision that departs from the slice plan and is left undecided is a gap in the design. Get the PM ruling and amend the slice plan entry, or mark D3 as decided against the plan with the deviation recorded there. As written, D3 contradicts the plan while its status says "decided".

### [CONCERN] Intermediate state leaves mid-adoption projects with no adoption guidance between 269 and 270

D6 says outright that after 269, "a project mid-adoption gets no adoption step until 270's line". Navigation also keeps emitting `UNSET_STATE_WARNING`, which still advises `cf build` (Special Considerations). The arch already parks adoption until `sq onboard` exists, so this is acceptable only if 269 and 270 ship in the same release. State that coupling in the design, or have the slice plan record it. Otherwise a release cut between the two slices ships guidance the arch calls wrong ("`cf build` is pure again").

### [CONCERN] Design carries scope that can be cut or deferred

Effort is 2/5, but the design adds more than the slice needs:
- It keeps `adoptionNavigation.ts` branches that it says are unreachable, and it edits `gatherAdoptionInputs` to map `decideStage` back into the old input shape (`declined`/`''`, `planningArtifactsExist`), then deletes the tests for those branches. 270 deletes the whole file. Adapting navigation is throwaway work; that is the same reason D6 gives for not fixing `UNSET_STATE_WARNING`. If the unreachable branches can stay without the adapter, the adapter could be cut. If the adapter is needed to keep `declined` and unset navigation working, say that explicitly.
- It adds `planningFacts.ts` as a new module plus an unrequested `LEGACY_ADOPTION_STATES` constant and a moved `AdoptionState` type, and it consolidates two `OVERRIDE_REMEDY` copies into a shared constant. The consolidation is justified by the DRY rule. The other items are small, so this is minor.
- The Verification Walkthrough has eight steps, and some repeat what the tests already cover (step 4 is just "the tests pass").
Cut or defer the navigation adapter, or justify it, and trim the walkthrough.

### [CONCERN] Failure modes for the new frontmatter reads are partly enumerated, and one case routes silently

D4 enumerates failures per call, and that is good. However, an unreadable or malformed architecture file is treated as "not derived", so a derived architecture with a frontmatter typo silently lands in "already planned" instead of "adoption-incomplete". The design calls this a safe default and the Risk Assessment repeats it, but there is no surfaced warning, and the arch's "never use silent fallback values" principle applies. Either record an observable warning when an architecture file's frontmatter cannot be parsed, or state why `cf check` is the sole place this is surfaced and cite the rule that covers it.

### [NOTE] NFRs

The architecture states no latency or throughput NFR for this path. `readPlanningFacts` makes three directory listings per navigation call, and the design notes that this is small. No restatement is needed.

### Run Digest

- Response length: 5682 chars
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
- Tokens — prompt / cached / cache write / completion / reasoning: 340167 / 251887 / 88270 / 2813 / not computed
- Duration: 26.7 s
- Cost: $0.41 (provider)
- `## Summary` located: yes
- `## Findings` located: yes
- Finding-shaped matches — whole response: 7
- Finding-shaped matches — inside fences: 0
- Finding-shaped matches — in findings section: 7
- Finding-shaped matches — surviving validation: 7
