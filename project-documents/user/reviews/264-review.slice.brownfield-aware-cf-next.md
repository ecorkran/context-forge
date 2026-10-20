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
reviewedSha: 5f5589b7e3ad2ef0cc3c757df1e021019aaa0c93
toolsGiven: [read_file, list_files, grep]
toolCallsMade: 6
turns: 7
promptTokens: 261239
cachedTokens: 168566
cacheWriteTokens: 92665
completionTokens: 8521
durationSeconds: 67.8
costUsd: 0.473474
costBasis: provider
runId: run-20261020-slices-plan-a67cc35b
squadronVersion: 0.23.5
findings:
  - id: F001
    severity: concern
    category: design-correctness
    summary: "`plan-new-work` ignores the current phase and can repeat indefinitely"
    location: "project-documents/user/slices/264-slice.brownfield-aware-cf-next.md:191"
  - id: F002
    severity: concern
    category: scope
    summary: "Scope statement understates the changes to the 261/263 `adoption/` code"
    location: "project-documents/user/slices/264-slice.brownfield-aware-cf-next.md:53"
  - id: F003
    severity: note
    category: dependency-direction
    summary: "Reverse dependency between `introspection/` and `adoption/` is guarded only by a prose rule"
    location: "project-documents/user/slices/264-slice.brownfield-aware-cf-next.md:337"
  - id: F004
    severity: note
    category: architecture-alignment
    summary: "D2 departs from the architecture's listing of `cf next` as a detection consumer"
    location: "project-documents/user/slices/264-slice.brownfield-aware-cf-next.md:142"
  - id: F005
    severity: pass
    category: architecture-alignment
    summary: "Navigation behavior matches the architecture and the slice plan entry"
    location: "project-documents/user/slices/264-slice.brownfield-aware-cf-next.md#Overview"
  - id: F006
    severity: pass
    category: error-handling
    summary: "Layering, read-only discipline and failure handling are explicit"
    location: "project-documents/user/slices/264-slice.brownfield-aware-cf-next.md#Patterns and Conventions"
---

# Review: slice — slice 264

**Verdict:** CONCERNS
**Model:** claude-sonnet-5-5

## Findings

### [CONCERN] `plan-new-work` ignores the current phase and can repeat indefinitely

D6 row 3 is chosen from the registered plan's contents alone. Its command is `cf set phase 'Phase 3: Slice Planning'`, followed by `cf build`. Unlike D4, it never checks `isConceptInstruction` or the current instruction.

After the user follows the advice and moves to Phase 3, they are still in state `complete` and the plan still has no open entry. The next `cf next` therefore returns `plan-new-work` again and tells them to set the phase they are already in. This continues until they add a new entry. The Success Criteria and walkthrough step 6 test only the first call, so the loop would not be caught.

Make the step phase-aware. Once the instruction is already at slice planning, recommend `cf build` only, with no phase change. Add a fixture for that case. Because the step carries the same `adoptionStep` value in both situations, the `adoptionStep` consumers (265) can't tell them apart unless the phase-aware variant is distinguished by command or by a second step value.

### [CONCERN] Scope statement understates the changes to the 261/263 `adoption/` code

Technical Scope promises "two small changes ... both extractions with no behavior change". Interfaces Required (lines 69–73) and Development Approach step 1 (line 329) list three:
- `isConceptInstruction`
- kinded `findPlanningArtifacts`
- splitting `findExistingStatePlan` out of `completeAdoptionIfPlanRecorded`

The kinded return type is not a pure extraction. It changes a 261 return type from `string[]` to typed entries and requires "updating its callers". That touches the build resolver and 263's completion code.

This slice therefore edits two unbuilt slices' interfaces in addition to the navigator work. The cost is out of line with the plan's Low risk and 2/5 effort. Two options:
- Correct the scope statement to name all three changes and the caller updates.
- Ask 261 and 263 to ship these shapes in their own designs, which would shrink this slice to the navigator work.

The second is cleaner. It removes the "if 261/263 deviate, this slice adapts" hedge in Prerequisites, which is a hidden dependency on code that doesn't exist yet.

### [NOTE] Reverse dependency between `introspection/` and `adoption/` is guarded only by a prose rule

263 already makes `adoption/` import from `introspection/parsers/`. This slice adds `introspection/` importing from `adoption/index.ts`, so the two directories now depend on each other. The slice correctly notes there is no file-level cycle today. The guard is a sentence ("must import only from `adoption/index.ts` and never the other way round"), and the barrel also exports the build resolver and source walk. If any `adoption/` file later imports from the navigator or a sibling in `introspection/`, a real cycle appears.

The slice already requires lint and typecheck to pass. Consider a mechanical import-boundary check, if the repo has an existing mechanism for it. Otherwise a short test is enough.

### [NOTE] D2 departs from the architecture's listing of `cf next` as a detection consumer

The architecture's "One detection, many consumers" principle lists `cf next` among the surfaces that consume detection. D2 has `cf next` read only the persisted state and never run detection. This satisfies the principle's intent, since there is no second heuristic and detection stays owned by core and the build. It also matches 261 D7 and the architecture's rule that onboarding hands off to `cf build`.

The residual gap is stated honestly: an unset brownfield repo that runs `cf next` first gets today's navigation, which points at `cf build`. This is acceptable. It is recorded so the departure is explicit, and so 265's real-repo runs include a "`cf next` before the first `cf build`" case.

### [PASS] Navigation behavior matches the architecture and the slice plan entry

The three behaviors the architecture's Navigation section and the slice plan entry require are all designed:
- **In progress:** points at the next adoption step.
- **Complete:** points at the first new work item rather than Phase 0.
- **Unset or `declined`:** today's behavior, so planned and greenfield projects are unchanged.

`declined` is treated as a fresh project, as 261 requires. The `isConceptInstruction` check keeps the instruction at Phase 0 during adoption, as 261 D4 requires. The phase move that 263 left to this slice is delivered through the `adopted` fall-through and `plan-new-work`, subject to the first finding.

### [PASS] Layering, read-only discipline and failure handling are explicit

- **Layering:** adoption logic gets its own module, split into a pure decision function and an I/O gatherer. `cf next` stays read-only (D3), which avoids a second writer of `adoption.state`. The decision is a discriminated union switched exhaustively. The `adoptionStep` values are defined once as a constant, in line with the project's rule against label-based logic.
- **Failures:** the only I/O is local filesystem and config reads, so there are no hang or timeout paths. Read errors propagate rather than being turned into warnings. A hand-set `complete` with no plan gets an explicit `plan-missing` result instead of a silent fallback.
- **Parity:** `cf next` and `workflow_next` share `getNext`, and a parity test is required.
- **NFRs:** the parent architecture states no latency NFR for `cf next`. The one added config read on the no-active-slice path is noted in Special Considerations.

### Run Digest

- Response length: 6561 chars
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
- Tokens — prompt / cached / cache write / completion / reasoning: 261239 / 168566 / 92665 / 8521 / not computed
- Duration: 67.8 s
- Cost: $0.47 (provider)
- `## Summary` located: yes
- `## Findings` located: yes
- Finding-shaped matches — whole response: 6
- Finding-shaped matches — inside fences: 0
- Finding-shaped matches — in findings section: 6
- Finding-shaped matches — surviving validation: 6
