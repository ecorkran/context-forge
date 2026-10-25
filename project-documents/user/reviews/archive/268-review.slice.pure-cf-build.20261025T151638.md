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
reviewedSha: 6ddda3f8742f00cf873239c864a2e55019e4b67c
toolsGiven: [read_file, list_files, grep]
toolCallsMade: 7
turns: 8
promptTokens: 419092
cachedTokens: 325470
cacheWriteTokens: 93610
completionTokens: 4063
durationSeconds: 35.6
costUsd: 0.448373
costBasis: provider
runId: run-20261025-p4-084178d9
squadronVersion: 0.24.1
findings:
  - id: F001
    severity: concern
    category: error-handling
    summary: "Explicit `--it brownfield-adoption` behavior is under-specified after `fileComprehension` is removed"
    location: "project-documents/user/slices/268-slice.pure-cf-build.md#D2 — Explicit `brownfield-adoption` instruction gets no special handling"
  - id: F002
    severity: concern
    category: proportionality
    summary: "Test matrix is heavier than the slice requires; name what to cut"
    location: "project-documents/user/slices/268-slice.pure-cf-build.md#D5 — Purity is proven by behavior, on all three surfaces"
  - id: F003
    severity: note
    category: scope
    summary: "Probe deletion shifts scope from 271 without editing the 271 entry"
    location: "project-documents/user/slices/268-slice.pure-cf-build.md#D3 — Delete the squadron probe here, not in 271"
  - id: F004
    severity: note
    category: risk
    summary: "Interim `cf next` inconsistency relies on a release-timing mitigation"
    location: "project-documents/user/slices/268-slice.pure-cf-build.md#Risk Assessment"
  - id: F005
    severity: pass
    category: architecture-alignment
    summary: "Alignment with the amended architecture"
    location: "project-documents/user/slices/268-slice.pure-cf-build.md#Technical Scope"
---

# Review: slice — slice 268

**Verdict:** CONCERNS
**Model:** claude-sonnet-5-5

## Findings

### [CONCERN] Explicit `--it brownfield-adoption` behavior is under-specified after `fileComprehension` is removed

D2 says an explicit `--it brownfield-adoption` resolves "the guide prompt and profile by key" like any other instruction, with no error. D4 deletes `fileComprehension` from `EnhancedContextData` and the `SectionBuilder` line. The guide's `brownfield-adoption` profile still declares `fileComprehension` (the arch lists fileConcept, fileArch, fileSlicePlan, fileComprehension). In the current code, `COMPREHENSION_PROFILE_VARIABLE = 'fileComprehension'` is a profile variable name.

The slice never says what the engine does with a profile variable that nothing populates. It could render blank, render a placeholder, or throw. This is an unspecified failure mode on a path the slice deliberately leaves reachable. The core principle is no silent fallback values.

The fix is to state the observed behavior, test it once in D5, and pick one outcome:
- an explicit named error, or
- a documented plain "missing" rendering.

Also reconcile D2's "resolves the profile" with the arch statement that `cf build` "does not select the `brownfield-adoption` profile". The slice should say the build performs no selection and only honors an explicit user key.

### [CONCERN] Test matrix is heavier than the slice requires; name what to cut

D5 builds 3 fixture states (no config, `in_progress`, `complete`) and runs each through 3 surfaces. That is 9 runs, each checking tree and bytes, prompt content, the `sq` marker and CLI/MCP parity. D6 adds golden capture with an ambiguous scope: "one planned project in a later phase (Phase 4 and Phase 6)" could mean one project or two.

The slice plan's success criterion is a single test that a brownfield build writes nothing to config, plus byte-identical greenfield output and CLI/MCP match. The cut is worth the saving at effort 2/5:
- Keep one fake-`sq` brownfield fixture.
- Vary only the state on the CLI path, since all three surfaces share `createContextPipeline`.
- Run MCP `context_build` and `template_preview` once each, on the `in_progress` state.
- State the golden set explicitly, for example greenfield Phase 0 plus one planned project at one named later phase.

### [NOTE] Probe deletion shifts scope from 271 without editing the 271 entry

D3 deletes `detection/squadronProbe.ts`, its tests and its fixtures. The slice plan assigns "Delete cf's squadron probe code (262)" to 271, and the arch says 271 "removes the probe integration". The reasoning is sound: the resolver was the only consumer, and the 268 rule is to delete code only build-time adoption used. The slice also records the shift.

The slice plan will still read 271 as owning the deletion. 271's design should be told this is done, or its success criterion "No cf code runs or parses `sq probe`" will be checked against already-deleted code. No change is needed to 268.

### [NOTE] Interim `cf next` inconsistency relies on a release-timing mitigation

The slice states that between 268 and 270, navigation and the `adoption.state` key description give wrong advice. The mitigation is "no release between 268 and 270". This matches the arch rework ordering (268→272, shipped together with the guide release coupling), and the slice acknowledges the guide's prompt still points at `cf build`. This is acceptable as written. The release-skill pre-flight check it mentions would make the constraint enforceable.

### [PASS] Alignment with the amended architecture

The scope matches the arch's "`cf build` is pure again" rule and the slice plan's 268 entry:
- It removes the resolver hook, the Adoption Facts section, the prompt swap and both state writes.
- It keeps `MIN_GUIDE_VERSION` and its warning.
- It leaves `adoption.state` semantics to 269, navigation to 270, and the report and prompt delivery to 271.
- Dependency direction is correct: services no longer import `adoption/` or `detection/`.
- The kept detection modules are exactly what 271 needs.
- D1 rejects leaving a no-op seam.

The slice plan's criteria are all covered by D5, D6 and the walkthrough:
- no read or write of adoption state
- no probing
- a test that a brownfield build writes nothing
- byte-identical greenfield output
- CLI/MCP parity

### Run Digest

- Response length: 5122 chars
- Response is newline-free: no
- Tool calls made: 7
- Tool calls failed: 0
- Stop reason: end_turn
- Output budget: backend default
- System prompt: preset+append
- Settings sources: project
- Reasoning characters: 0
- Effort: backend default
- Turns: 8
- Tokens — prompt / cached / cache write / completion / reasoning: 419092 / 325470 / 93610 / 4063 / not computed
- Duration: 35.6 s
- Cost: $0.45 (provider)
- `## Summary` located: yes
- `## Findings` located: yes
- Finding-shaped matches — whole response: 5
- Finding-shaped matches — inside fences: 0
- Finding-shaped matches — in findings section: 5
- Finding-shaped matches — surviving validation: 5
