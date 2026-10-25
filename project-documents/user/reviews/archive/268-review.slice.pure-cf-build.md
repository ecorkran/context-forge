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
reviewedSha: a6c561ff855a7ee9bdf6c61c43345179dc8062e3
revision_number: 1
toolsGiven: [read_file, list_files, grep]
toolCallsMade: 4
turns: 5
promptTokens: 261174
cachedTokens: 169891
cacheWriteTokens: 91275
completionTokens: 6448
durationSeconds: 55.7
costUsd: 0.447317
costBasis: provider
runId: run-20261025-p4-084178d9
squadronVersion: 0.24.1
findings:
  - id: F001
    severity: concern
    category: under-specification
    summary: "\"No orphaned exports\" criterion contradicts D4 and the kept-modules list"
    location: "project-documents/user/slices/268-slice.pure-cf-build.md#Success Criteria"
  - id: F002
    severity: concern
    category: integration-points
    summary: "Frontmatter `interfaces` lists things this slice excludes"
    location: "project-documents/user/slices/268-slice.pure-cf-build.md:7-10"
  - id: F003
    severity: note
    category: scope
    summary: "Probe deletion moves from 271 to 268 (D3)"
    location: "project-documents/user/slices/268-slice.pure-cf-build.md#D3"
  - id: F004
    severity: note
    category: failure-modes
    summary: "Explicit `--it brownfield-adoption` behaviour (D2)"
    location: "project-documents/user/slices/268-slice.pure-cf-build.md#D2"
  - id: F005
    severity: note
    category: risk
    summary: "Interim broken advice window is mitigated by process only"
    location: "project-documents/user/slices/268-slice.pure-cf-build.md#Risk Assessment"
  - id: F006
    severity: note
    category: proportionality
    summary: "Verification walkthrough partly duplicates D5"
    location: "project-documents/user/slices/268-slice.pure-cf-build.md#Verification Walkthrough"
  - id: F007
    severity: pass
    category: architecture-alignment
    summary: "Alignment with the architecture and slice plan"
    location: "project-documents/user/slices/268-slice.pure-cf-build.md#Technical Scope"
---

# Review: slice — slice 268

**Verdict:** CONCERNS
**Model:** claude-sonnet-5-5

## Findings

### [CONCERN] "No orphaned exports" criterion contradicts D4 and the kept-modules list

Technical Requirements say "No exported symbol remains that only the deleted code used". D4 keeps `findComprehensionAnalysis` and `COMPREHENSION_PROFILE_VARIABLE` "for 271". The Interfaces Required list also keeps modules that "are inputs to 271" (`comprehensionAnalysis`, possibly `pathPresent` and `buildManifest`). Per D4, their only producer was the resolver, so after deletion they have no remaining consumer. A reviewer or implementer cannot tell whether to delete them or keep them. The architecture (Anticipated Slices 271, and the cf↔squadron contract) needs the comprehension-doc lookup in 271. Keeping those symbols is correct, so the criterion is what has to change. Name the allowed exceptions in the criterion, for example "except the detection exports listed under Interfaces Required". The criterion is otherwise unverifiable. Verification step 6 greps only four symbols.

### [CONCERN] Frontmatter `interfaces` lists things this slice excludes

The `interfaces` field lists `collapse-adoption-state`, `remove-adoption-navigation-from-cf-next` and `adoption-primitives-for-sq-onboard`. Technical Scope (Excluded) assigns these to 269, 270 and 271, and "Provides to Other Slices" says only that 268 leaves a clean base. A consuming slice or tool that reads this field would expect 268 to deliver them. Replace the field with what 268 actually provides, for example a pure build pipeline and a `createContextPipeline(projectPath)` signature, or clear it.

### [NOTE] Probe deletion moves from 271 to 268 (D3)

The architecture's Anticipated Slices list gives probe-integration removal to 271 ("Removes the probe integration"). D3 pulls it into 268, justified by the code having a single consumer, the resolver. This is consistent with the architecture's intent. The slice plan's 268 entry covers "code only build-time adoption used". The slice says a note was added to 271's plan entry, but I couldn't verify that. The architecture's 271 bullet still reads as owning the removal. Align that bullet, or confirm the note, so the 271 design doesn't re-plan deleted code.

### [NOTE] Explicit `--it brownfield-adoption` behaviour (D2)

D2 says the build "raises no missing-profile error". The architecture rule is that a missing guide prompt is a named error, never a fallback to another prompt. Read as written, D2 could be taken to allow a silent fallback when the key is absent from the guide. State that an unknown or absent instruction key fails through the ordinary instruction-lookup error. D2's claim that the agent "stops rather than acting on missing facts" depends on the guide's prompt wording, which the guide owns and 272 changes. That is explanatory text, so no design change is needed. The D5 assertion on that output should use fixture-controlled prompt text, not the live guide.

### [NOTE] Interim broken advice window is mitigated by process only

Between 268 and 270, `cf next` and the `adoption.state` key description give advice that is no longer true. The mitigation is "no release is cut between 268 and 270", with a release-skill pre-flight "should be checked". Nothing enforces that, and a `fix:` patch release from the target branch would ship the mismatch. This follows from the architecture's slice ordering and is acceptable. Either name where the check lives or reorder the 269/270 text edits to land first if the window matters.

### [NOTE] Verification walkthrough partly duplicates D5

Steps 3 and 4 manually repeat the D5 automated checks, the fake `sq` marker and CLI/MCP parity. The overall design is proportionate to an effort of 2/5. The golden-file test and the purity test are the minimum that proves the plan's "byte-identical" and "writes nothing" criteria. The walkthrough could point to the D5 test for those two steps instead of restating them.

### [PASS] Alignment with the architecture and slice plan

The scope covers every item in the slice plan's 268 entry: the integrator hook, the Adoption Facts section, the profile swap, both state writes and `MIN_GUIDE_VERSION` kept. It adds the planned test, with no config writes in a brownfield build, and byte-identical greenfield output. The 269, 270 and 271 boundaries are drawn cleanly. Build-pipeline modules import nothing from `adoption/` or `detection/`. No new I/O paths are added, so no new failure modes need enumerating. The slice touches no stated architecture NFR.

### Run Digest

- Response length: 5601 chars
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
- Tokens — prompt / cached / cache write / completion / reasoning: 261174 / 169891 / 91275 / 6448 / not computed
- Duration: 55.7 s
- Cost: $0.45 (provider)
- `## Summary` located: yes
- `## Findings` located: yes
- Finding-shaped matches — whole response: 7
- Finding-shaped matches — inside fences: 0
- Finding-shaped matches — in findings section: 7
- Finding-shaped matches — surviving validation: 7
