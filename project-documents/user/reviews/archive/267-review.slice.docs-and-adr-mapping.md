---
docType: review
layer: project
reviewType: slice
slice: docs-and-adr-mapping
conventionsSource: AGENTS.md
projectRules: []
project: context-forge
verdict: CONCERNS
verdictSource: stated
sourceDocument: project-documents/user/slices/267-slice.docs-and-adr-mapping.md
aiModel: claude-sonnet-5-5
aiProfile: sdk
status: complete
dateCreated: 20261020
dateUpdated: 20261020
reviewedSha: b5564bcb6cb2b66834c27af72e1ba21a7fe50851
toolsGiven: [read_file, list_files, grep]
toolCallsMade: 3
turns: 4
promptTokens: 174168
cachedTokens: 88834
cacheWriteTokens: 85328
completionTokens: 2912
durationSeconds: 27.8
costUsd: 0.380059
costBasis: provider
runId: run-20261021-slices-plan-c34863dc
squadronVersion: 0.23.5
findings:
  - id: F001
    severity: concern
    category: proportionality
    summary: "Design is heavier than the slice plan entry requires"
    location: "project-documents/user/slices/267-slice.docs-and-adr-mapping.md#Technical Decisions (D6, D7)"
  - id: F002
    severity: concern
    category: scope-creep
    summary: "New artifact type and file-naming convention are introduced inside the slice, with the guide convention only pending"
    location: "project-documents/user/slices/267-slice.docs-and-adr-mapping.md#D1, #Integration Points"
  - id: F003
    severity: concern
    category: hidden-dependencies
    summary: "Index 050 placement and reuse of architecture band is asserted but not validated against index-space consumers"
    location: "project-documents/user/slices/267-slice.docs-and-adr-mapping.md#D1"
  - id: F004
    severity: concern
    category: error-handling
    summary: "Failure modes for the write path are only partly enumerated"
    location: "project-documents/user/slices/267-slice.docs-and-adr-mapping.md#D4, #Data Flow"
  - id: F005
    severity: concern
    category: boundaries
    summary: "Symlink and root-escape handling is inconsistent between the walker and the checker"
    location: "project-documents/user/slices/267-slice.docs-and-adr-mapping.md#D2, #D6, #Special Considerations"
  - id: F006
    severity: note
    category: alignment
    summary: "Monorepo scope matches the architecture"
    location: "project-documents/user/slices/267-slice.docs-and-adr-mapping.md#D2"
  - id: F007
    severity: pass
    category: alignment
    summary: "Architectural principles and layer boundaries respected"
    location: "project-documents/user/slices/267-slice.docs-and-adr-mapping.md#Overview"
---

# Review: slice — slice 267

**Verdict:** CONCERNS
**Model:** claude-sonnet-5-5

## Findings

### [CONCERN] Design is heavier than the slice plan entry requires

The plan entry (260-slices) asks for three things: mapped material discoverable from `project-documents/`, no original file moved or modified, and no `cf check` findings for out-of-tree references. Two parts of the design go well past that, and each can be cut or deferred.

- **D6 link validator.** `docs-map-link` is a new checker rule. It has a lenient link parser covering inline links with titles, angle-bracket targets, percent-encoding and reference definitions, plus fenced-code skipping and a duplicate-map error. Neither the plan entry nor the architecture asks for link checking. The architecture only says "Introspection has to tolerate that." The design's own Excluded list drops link checking in every other document. It also adds a `docs-map` frontmatter schema. A lighter version that meets the requirement is the regression test (zero findings for out-of-tree links) plus the existing frontmatter check. Defer `docs-map-link`, or cut it to a plain existence check on the managed block's own generated links. That is a much smaller piece of code.
- **D7 refactor.** `locateManagedBlock` moves into core and cli's `managedState` is rewired to call it. That is a refactor of shipped setup-ide code, and the architecture's "Reconciliation is judgement … coexist with #123" sequencing makes setup-ide a contended area. The change is done to avoid a duplicated classifier. A small private locator inside `docs-map/` would meet the requirement with no change to setup-ide. Extract it later if a third consumer appears.

Both items are worth deferring, and the Development Approach would shrink to steps 2–5 plus the regression fixture.

### [CONCERN] New artifact type and file-naming convention are introduced inside the slice, with the guide convention only pending

D1 invents a `docs-map` docType and the filename `050-docs-map.{project}.md`. It adds a schema entry and a filename-segment scanner (`findDocsMap`). The design admits the convention is "pending" in `file-naming-conventions.md`, which sits in ai-project-guide. The architecture says "Guide owns content, cf owns logic" and "Additive and reversible." It also says a new artifact type needs guide-side coordination. The design treats that coordination as a non-blocking follow-up. cf would therefore ship and write a document type the guide's naming rules do not recognize. That is a hidden dependency. State which side lands first. Say what happens to the map if the guide's naming checks reject or renumber the type. Or drop the new docType and put the content in an existing artifact class.

### [CONCERN] Index 050 placement and reuse of architecture band is asserted but not validated against index-space consumers

D1 verifies several scanners (`discoverAllArchFiles`, `discoverAllSlicePlans`, 261's planning-artifact check, `INDEXED_RE`). It does not cover other consumers of `user/architecture/`. Examples are the squadron pipeline and its provenance and `docType` recognition, which the architecture says it uses ("recognized by existing filename/`docType` conventions"). It also does not cover the `cf check` frontmatter validator across all files in that directory, or the retroactive-marker and index-order logic that slice 264 will add. Squadron-side scanning of `architecture/` is outside what this design checked. The "Writing a map can't make a project already planned" test covers only 261. Name the other readers of that directory and say what they do with an unknown `docType`.

### [CONCERN] Failure modes for the write path are only partly enumerated

The design handles broken blocks, duplicate maps, the entry cap and non-ENOENT read errors. These gaps remain:
- A candidate file that is deleted or becomes unreadable between the walk and the title read (TOCTOU) falls under the 260 ENOENT rule only loosely. It is "not present" in the walk but would be an error in the title read. The handling is not stated.
- A failed temp-file write or rename (permissions, disk full, cross-device) has no stated handling, and neither does cleanup of a left-over temp file.
- A concurrent `cf docs map` run, or an editor save, between the read and the rename can silently lose a hand entry. "Byte for byte" is promised, but nothing detects a mid-run change.
- Unreadable or non-UTF-8 titles. Latin1 round-tripping is stated for the file. Title decoding from candidate files is not.

State the strategy for each. Fail with `DocsMapError` and remove the temp file is probably enough.

### [CONCERN] Symlink and root-escape handling is inconsistent between the walker and the checker

The walker never follows symlinks. A symlinked `docs/` directory, which is common in monorepos, is therefore silently omitted with no report. That conflicts with the design's stance that a silently partial map is a worse failure than an error. The checker follows the map's links with a stat that follows symlinks and checks targets outside the root. "Special Considerations" claims neither reads or writes outside what the walk or map names, and the checker's stat of out-of-root targets contradicts that. Either report skipped symlinks in the command output or make the stance consistent.

### [NOTE] Monorepo scope matches the architecture

Using the checkout-root rule from 261 and mapping only the project's own folder matches the architecture's "Detection is scoped to the project's own folder." The tradeoff is that repository-root docs are left to hand entries. This is stated explicitly.

### [PASS] Architectural principles and layer boundaries respected

The design keeps to the architecture's principles:
- **Facts in core, judgement in the prompt.** Titles only, no ADR status, no summaries.
- **Additive and reversible.** Originals are never moved or modified, and a hash test checks it.
- **One detection, many consumers.** It reuses 261's `DOC_PATHS`, `ADR_DIRS` and `EXCLUDED_DIRS` instead of redefining them.
- **No build-time side effects.** `cf build` never writes the map, and the guide-side prompt change is not hard-coded in cf.

Dependency direction is correct (267 → 261/260, nothing from 262–266). The map is a CLI-first command with logic in core, which matches 266.

### Run Digest

- Response length: 7054 chars
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
- Tokens — prompt / cached / cache write / completion / reasoning: 174168 / 88834 / 85328 / 2912 / not computed
- Duration: 27.8 s
- Cost: $0.38 (provider)
- `## Summary` located: yes
- `## Findings` located: yes
- Finding-shaped matches — whole response: 7
- Finding-shaped matches — inside fences: 0
- Finding-shaped matches — in findings section: 7
- Finding-shaped matches — surviving validation: 7
