---
docType: review
layer: project
reviewType: slice
slice: carry-codebase-comprehension-into-later-phases
conventionsSource: AGENTS.md
projectRules: []
project: context-forge
verdict: CONCERNS
verdictSource: stated
sourceDocument: project-documents/user/slices/274-slice.carry-codebase-comprehension-into-later-phases.md
aiModel: claude-sonnet-5-5
aiProfile: sdk
status: complete
dateCreated: 20261027
dateUpdated: 20261027
reviewedSha: dc11fb078ab77195a2569fdcec797f4d080311cc
revision_number: 1
toolsGiven: [read_file, list_files, grep]
toolCallsMade: 2
turns: 3
promptTokens: 97839
cachedTokens: 11220
cacheWriteTokens: 86615
completionTokens: 3655
durationSeconds: 38.7
costUsd: 0.38489
costBasis: provider
runId: run-20261027-p4-9cc4f1a6
squadronVersion: 0.24.5
findings:
  - id: F001
    severity: pass
    category: architecture-alignment
    summary: "Squadron boundary and ownership split hold"
    location: "project-documents/user/slices/274-slice.carry-codebase-comprehension-into-later-phases.md#Technical Decisions"
  - id: F002
    severity: concern
    category: integration
    summary: "The `fileComprehension` project field collides with the adoption prompt's \"argument only\" contract"
    location: "project-documents/user/slices/274-slice.carry-codebase-comprehension-into-later-phases.md#D2 and Technical Scope (Excluded: \"Changing 271's `--comprehension` flag\")"
  - id: F003
    severity: concern
    category: boundaries
    summary: "`cf build` now makes an adoption-state judgement, against \"build is pure, no adoption logic\""
    location: "project-documents/user/slices/274-slice.carry-codebase-comprehension-into-later-phases.md#D6 and Data Flow"
  - id: F004
    severity: concern
    category: proportionality
    summary: "The design is heavier than the slice plan requires"
    location: "project-documents/user/slices/274-slice.carry-codebase-comprehension-into-later-phases.md#D3, D5"
  - id: F005
    severity: note
    category: documentation
    summary: "The architecture's squadron responsibility table does not list the new registration channel"
    location: "project-documents/user/architecture/260-arch.brownfield-adoption.md (Responsibility Split, row b)"
  - id: F006
    severity: pass
    category: error-handling
    summary: "Failure modes are enumerated and the build never fails"
    location: "project-documents/user/slices/274-slice.carry-codebase-comprehension-into-later-phases.md#D5"
---

# Review: slice — slice 274

**Verdict:** CONCERNS
**Model:** claude-sonnet-5-5

## Findings

### [PASS] Squadron boundary and ownership split hold

D2, D5 and D7 match the architecture's "Comprehension in later phases" section and the PM ban of 20261025. cf learns the comprehension doc's location from a cf-owned field that squadron sets. It never searches for squadron's files, parses its output or runs it. Comprehension freshness stays with squadron, and cf reports only present or missing. The docs map is cf's own artifact, so a freshness check on it is in scope. Dependencies run the right way: core owns the check, and the CLI and MCP call it. The guide coupling (new profile variables, `MIN_GUIDE_VERSION`) matches the architecture's Dependencies section.

### [CONCERN] The `fileComprehension` project field collides with the adoption prompt's "argument only" contract

The architecture says `fileComprehension` for the adoption prompt "comes only from squadron's argument". With no path given, the prompt "says so plainly" (Technical Considerations, adoption prompt delivery). The slice makes `fileComprehension` a stored project field in the same variable namespace. The `brownfield-adoption` profile already lists that variable (271 D10). The slice does not say what `cf prompt get` does when `--comprehension` is omitted but the field is set. It might silently fill the variable from the stored value. That would break the "no path given" behaviour, and the field could drift from the path squadron passes. The slice needs an explicit decision. Either the adoption prompt path ignores the stored field, or the stored field becomes a documented fallback and the architecture sentence is amended. It also needs a test for whichever is chosen.

### [CONCERN] `cf build` now makes an adoption-state judgement, against "build is pure, no adoption logic"

The 20261025 amendment and the design goal "cf commands keep one meaning each" say `cf build` runs no detection and that adoption logic never hides inside it. D6 gates the "none" lines on `readPlanningFacts(root).derivedArchitectures.length > 0`, "adopted or adoption-incomplete". That is the architecture's adoption classification, evaluated inside the build. It is read-only, but it is the kind of coupling the amendment removed. It also adds a mechanism whose value is small: it only suppresses "none" lines on greenfield projects whose profile lists the variables, and the plan says that case is already empty. Options:
- Drop the adopted gate and show absence lines whenever the profile lists the variable.
- Drop absence lines entirely and emit the section only when a document or a registered path exists.
- Keep the gate, but state in the slice why it does not breach the build-purity rule.

The second option also removes the `readPlanningFacts` dependency.

### [CONCERN] The design is heavier than the slice plan requires

The architecture asks for the two documents to reach later phases and for cf to say plainly when one is missing. The design adds more than that:
- a path-valued schema marker that bypasses stem normalization;
- a docs-map freshness comparison, with a refactor of `writeDocsMap` to share the compare step;
- a four-row degradation table;
- the adopted-project gate above.

Each piece is justified on its own. Together they make a slice that touches the schema, core, the CLI, MCP, the docs-map writer and `SectionBuilder`, which is more than "effort 2/5" suggests. The docs-map freshness check, with its compare-step refactor and its broken-marker and unreadable-tree cases, is the most separable piece. It goes beyond the architecture's "only says plainly when a doc is missing". It could move to a follow-up issue, as the comprehension commit-count fact already did (#138). The slice could then ship presence-only lines for both documents. If the PM wants freshness kept, the design should say that this is a deliberate extension of the architecture's wording.

### [NOTE] The architecture's squadron responsibility table does not list the new registration channel

Row (b) says squadron hands the comprehension path over only through the adoption-prompt fetch. Slice 274 adds a second handoff: `cf set comprehension` or `project_update` after squadron writes the doc. The architecture's 274 paragraph covers it ("a cf-owned field it sets"), so this is not a violation. Row (b) should be updated when the slice lands, so squadron's session sees both channels in one place.

### [PASS] Failure modes are enumerated and the build never fails

The comprehension path may be missing, a directory or unreadable. The docs map may have broken markers or an unreadable tree. Each case degrades to one plain line, and the build still succeeds. The setter's errors (missing path, directory, outside the root) are named. The build is purity-tested, and greenfield and current-guide output stays byte-identical. The architecture states no NFR for this path, and the slice states the build cost it adds.

### Run Digest

- Response length: 5811 chars
- Response is newline-free: no
- Tool calls made: 2
- Tool calls failed: 0
- Stop reason: end_turn
- Output budget: backend default
- System prompt: preset+append
- Settings sources: project
- Reasoning characters: 0
- Effort: backend default
- Turns: 3
- Tokens — prompt / cached / cache write / completion / reasoning: 97839 / 11220 / 86615 / 3655 / not computed
- Duration: 38.7 s
- Cost: $0.38 (provider)
- `## Summary` located: yes
- `## Findings` located: yes
- Finding-shaped matches — whole response: 6
- Finding-shaped matches — inside fences: 0
- Finding-shaped matches — in findings section: 6
- Finding-shaped matches — surviving validation: 6
