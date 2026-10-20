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
reviewedSha: 68134c88b145a834b9867e66edaaedec8d68d395
revision_number: 1
toolsGiven: [read_file, list_files, grep]
toolCallsMade: 3
turns: 4
promptTokens: 175402
cachedTokens: 89230
cacheWriteTokens: 86166
completionTokens: 3339
durationSeconds: 30.1
costUsd: 0.38772
costBasis: provider
runId: run-20261020-slices-plan-a67cc35b
squadronVersion: 0.23.5
findings:
  - id: F001
    severity: concern
    category: proportionality
    summary: "Design is heavier than the slice requires"
    location: "project-documents/user/slices/264-slice.brownfield-aware-cf-next.md#Technical Scope"
  - id: F002
    severity: concern
    category: architectural-alignment
    summary: "Departure from the architecture's detection principle weakens the stated unset-repo behavior"
    location: "project-documents/user/slices/264-slice.brownfield-aware-cf-next.md#D2 — `cf next` doesn't run brownfield detection"
  - id: F003
    severity: concern
    category: error-handling
    summary: "Failure modes of the new read paths are not enumerated"
    location: "project-documents/user/slices/264-slice.brownfield-aware-cf-next.md#Patterns and Conventions"
  - id: F004
    severity: concern
    category: dependencies
    summary: "Heavy dependence on unbuilt 261/263 interfaces with a \"adapt to code as built\" escape hatch"
    location: "project-documents/user/slices/264-slice.brownfield-aware-cf-next.md#Interfaces Required"
  - id: F005
    severity: note
    category: layering
    summary: "Module placement and dependency direction"
    location: "project-documents/user/slices/264-slice.brownfield-aware-cf-next.md#Component Structure"
  - id: F006
    severity: pass
    category: architectural-alignment
    summary: "Alignment with the architecture's navigation and responsibility split"
    location: "project-documents/user/slices/264-slice.brownfield-aware-cf-next.md#Technical Decisions"
  - id: F007
    severity: pass
    category: scope
    summary: "Scope matches the slice plan entry and NFRs"
    location: "project-documents/user/slices/264-slice.brownfield-aware-cf-next.md#Success Criteria"
---

# Review: slice — slice 264

**Verdict:** CONCERNS
**Model:** claude-sonnet-5-5

## Findings

### [CONCERN] Design is heavier than the slice requires

The slice plan entry asks for three outcomes: an in-progress step, a post-adoption pointer at new work, and unchanged navigation for greenfield and planned projects. The design delivers those, and also adds the following.
- **Structured `adoptionStep` field.** The field has a seven-value `ADOPTION_NAV_STEP` enum, which is public API surface on `NextAction` and on the MCP output. Nothing in this slice or in the architecture consumes it. 265 is the only named consumer, and it could assert on `suggestedCommand` and recommendation text. The guide consumer is explicitly "no change required". The CLAUDE.md rule about not keying on labels doesn't force a new public field when no consumer exists yet. The field could be deferred, or limited to the steps that need it.
- **Three-way refactor of 261/263 code.** The slice changes `findPlanningArtifacts` to return a different type and updates its callers in 261 and 263. It also splits `completeAdoptionIfPlanRecorded` and extracts `isConceptInstruction`. The `isConceptInstruction` and `findExistingStatePlan` extractions are justified by DRY. The return-type change exists only so the navigator can find an `architecture` entry, and a narrower helper would do.
- **Extra mechanisms.**
  - The `plan-missing`, `register-plan`, and two-variant `plan-new-work` steps.
  - A `SLICE_PLANNING_PHASE` export.
  - A `gateBlockAction` helper extraction.
  - An import-boundary test that scans source files.

Name what to cut or defer: `adoptionStep` and its enum (or most of its values); the `findPlanningArtifacts` retyping, replaced by a single `findArchitectureArtifact` helper; and the import-boundary test, replaced by a code-review note. Each is separable.

### [CONCERN] Departure from the architecture's detection principle weakens the stated unset-repo behavior

The architecture's principle is "One detection, many consumers", and it lists `cf next` as a consumer. D2 records the departure honestly. Its justification is that detection can throw and that onboarding hands off to `cf build`. The consequence is that on an unset brownfield repo, `cf next` gives today's navigation, which the slice's own Overview calls the wrong recommendation ("Advance to Phase 1" on Phase 0 with a concept). The arch's own "Navigation" section says only that `cf next` reads the adoption state, so reading only `adoption.state` is arguably consistent. The D2 text claims the unset case "recommends `cf build`, which is correct". That holds only for Phase 0 without a concept. With a concept present and state `""`, today's flow says "Advance to Phase 1", which is the exact derailment this slice exists to prevent.

The slice should do one of two things. It could state which unset-state fixtures still produce a recommendation other than `cf build`, and say that this is accepted. Or it could handle the concept-present, state-`""` Phase 0 case with `cf build`. Both options need to be weighed against D2's rejection of a detection resolver.

### [CONCERN] Failure modes of the new read paths are not enumerated

The only failure handling is the sentence "Errors from `readAdoptionState`, `findPlanningArtifacts` and `findExistingStatePlan` propagate, so `cf next` fails explicitly." The slice adds new I/O to a query command that today fails rarely, and it leaves these cases open.
- **Malformed `adoption.state` value.** It isn't stated whether `readAdoptionState` throws or normalizes the value.
- **Registered slice plan fails to parse.** `findExistingStatePlan` and `findFirstNotCompleteEntry` read the plan. A plan parse error would take down `cf next`, and with it the only path toward the user's next step. Propagation is defensible, but the doc should say the error surfaces with the file name, and should say what the user does next.
- **`workflow_next` over MCP.** It isn't stated whether a thrown error maps to the same failure shape as `cf next`. The parity criterion covers only successful fixtures.
- **Concurrent edits between reads.** Between the state read, the artifact scan and the plan read, a file can change (a build running in another terminal). The result is stale but harmless. It's worth a one-line note, since D3 depends on `cf next` never writing.

Add a short failure-mode table covering these cases, or point to the 261/263 behavior it inherits.

### [CONCERN] Heavy dependence on unbuilt 261/263 interfaces with a "adapt to code as built" escape hatch

Three required interfaces (`isConceptInstruction`, kinded `findPlanningArtifacts`, `findExistingStatePlan`) don't exist in the designs of 261 and 263. The doc says to extract or retype them if they're missing, and that "this slice adapts to the code as built". The slice plan lists 264 as consuming the adoption state and the retroactive marker, not as reshaping the adoption module's API. Modifying another slice's exported types and the callers in the same change is a hidden cross-slice dependency. Recommend feeding these three interface requirements back into the 261 and 263 designs as additions, so 264 only consumes them. If that isn't possible before 264 is implemented, narrow 264's own change to additive helpers, so no 261/263 callers change.

### [NOTE] Module placement and dependency direction

Introspection now imports from `adoption/`, and `adoption/` already imports `introspection/parsers/`. The doc correctly observes that these are different files, so there's no cycle, and the import-boundary rule is explicit. The direction is acceptable: the navigator consumes adoption facts, and adoption consumes only the parsers. A new module keeps the 1049-line `WorkflowNavigator.ts` from growing, which matches the existing `setupCiOffer.ts` pattern.

### [PASS] Alignment with the architecture's navigation and responsibility split

The design matches the arch's "Navigation" section and responsibility row (g).
- **`cf next` is read-only.** D3 leaves the `in_progress` to `complete` transition to the build, so state has a single writer.
- **Retroactive entries aren't treated as reviewed.** The design reuses 263's behavior in which retroactive entries count as complete in `findFirstNotCompleteEntry`.
- **Derived architecture is gated.** D4 runs the `preSlicePlan` gate on it, so adoption can't skip the review gate.
- **Existing-flow fall-through is reused.** D1 and D6 use the existing "pick your first slice" path and add no new selection logic.
- **Boundaries held.** It doesn't touch the guide prompt or add hard-coded guide wording, and the slice gives a concrete performance statement for unaffected projects (one config read).

### [PASS] Scope matches the slice plan entry and NFRs

All three plan outcomes are covered: in-progress, complete, and greenfield. "Navigation for already-planned projects is unchanged" is also covered, including the same-output check against this repo. The `workflow_next` parity requirement from the plan appears as a testable criterion. The parent architecture states no latency or throughput NFR for this path, so none needs restating. The walkthrough exercises each decision end to end.

### Run Digest

- Response length: 8043 chars
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
- Tokens — prompt / cached / cache write / completion / reasoning: 175402 / 89230 / 86166 / 3339 / not computed
- Duration: 30.1 s
- Cost: $0.39 (provider)
- `## Summary` located: yes
- `## Findings` located: yes
- Finding-shaped matches — whole response: 7
- Finding-shaped matches — inside fences: 0
- Finding-shaped matches — in findings section: 7
- Finding-shaped matches — surviving validation: 7
