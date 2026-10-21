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
reviewedSha: 9316dcec2d7739feaa39a5b7766f3ab10cfe4b70
revision_number: 1
toolsGiven: [read_file, list_files, grep]
toolCallsMade: 3
turns: 4
promptTokens: 176136
cachedTokens: 89194
cacheWriteTokens: 86936
completionTokens: 3691
durationSeconds: 33.4
costUsd: 0.394317
costBasis: provider
runId: run-20261021-slices-plan-c34863dc
squadronVersion: 0.23.5
findings:
  - id: F001
    severity: concern
    category: proportionality
    summary: "Design is heavier than a 3/5, Medium-risk mapping slice needs"
    location: "project-documents/user/slices/267-slice.docs-and-adr-mapping.md#D4 — Managed block; everything else is the project's"
  - id: F002
    severity: concern
    category: duplication
    summary: "Duplicated managed-block locator knowingly violates DRY"
    location: "project-documents/user/slices/267-slice.docs-and-adr-mapping.md#D4 — Managed block; everything else is the project's"
  - id: F003
    severity: concern
    category: dependencies
    summary: "New guide-owned filename convention adds a release-blocking cross-repo dependency"
    location: "project-documents/user/slices/267-slice.docs-and-adr-mapping.md#D1 — One generated index file in an existing docType"
  - id: F004
    severity: note
    category: integration
    summary: "Delivery of the map to an adoption run depends on a guide-side follow-up"
    location: "project-documents/user/slices/267-slice.docs-and-adr-mapping.md#D5 — Mapping is an explicit command, CLI-only for now"
  - id: F005
    severity: note
    category: scope
    summary: "Scope matches the architecture's boundaries for scanning and tolerance"
    location: "project-documents/user/slices/267-slice.docs-and-adr-mapping.md#D2 — What gets mapped"
  - id: F006
    severity: pass
    category: error-handling
    summary: "Failure modes and out-of-tree tolerance are explicit"
    location: "project-documents/user/slices/267-slice.docs-and-adr-mapping.md#D6 — `cf check` tolerates out-of-tree links"
---

# Review: slice — slice 267

**Verdict:** CONCERNS
**Model:** claude-sonnet-5-5

## Findings

### [CONCERN] Design is heavier than a 3/5, Medium-risk mapping slice needs

The slice plan entry asks for three things. Mapped material must be discoverable from project-documents. No original file may be moved or modified. `cf check` must raise nothing for out-of-tree references. A generated index with a managed block meets all three. The design adds machinery beyond that, and each piece can be cut or deferred:
- **Concurrent-edit detection (D4, data-flow step 6).** It re-reads the map and compares it with the step-2 baseline, then reports a "map changed during the run" error. The design admits it still leaves a race window, and the command is run by hand. Drop it. Write via temp file and rename, and let the last writer win.
- **Temp-file failure handling.** The slice spells out how to handle a failed temp write, a failed rename, a failed temp cleanup (both errors reported) and a leftover temp file from a crash. Direct write, or temp plus rename with a plain error, is enough. A crash-recovery story for a regenerable index file is not needed.
- **Entry cap and its error (`MAX_DOCS_MAP_ENTRIES`, D2).** Nothing in the slice plan or the architecture asks for a cap. It adds a constant, an error path and tests. Defer it until 265's real-repo runs show a need. The Risk section already treats this as tuning.
- **Symlink skip-and-report (D2, `skippedSymlinks`, CLI output line, walkthrough step 5).** Skipping symlinks without following them is cheap. The separate result field, output line, tests and walkthrough step are not required by any criterion. Skip them silently or with a single warning.
- **File layout.** Six files plus constants and a custom `DocsMapError` is a lot of surface for one index writer. `discover`, `render` and `write` in roughly three files would do.

Removing the first four items cuts about half of the listed failure-mode tests without losing any requirement the slice plan assigns.

### [CONCERN] Duplicated managed-block locator knowingly violates DRY

D4 adds a private `locateBlock` in `docs-map/managedBlock.ts`. It states that setup-ide's `managedState` "does a similar check" and defers sharing to #128. The project's Core Principles say "Do not duplicate logic. Respect DRY." The architecture's "Additive and reversible" principle relies on managed blocks as a shared mechanism, and reconciliation (slice 266) will extend that same mechanism. Deferring #128 means two divergent implementations of the same marker-pairing rules, each with its own broken-state semantics. Either reuse or lightly generalize the setup-ide locator in this slice, or justify why the semantics differ. "Out of scope" is not a sufficient reason.

### [CONCERN] New guide-owned filename convention adds a release-blocking cross-repo dependency

The architecture's Dependencies section lists the guide items cf depends on: the profile, the prompt, the opener, the adoption guide and the retroactive-marker rule. A new `050-docs-map.{project}.md` filename is not among them. D1 makes the cf release wait on a guide change to `file-naming-conventions.md` and adds a documented guide minimum bump. The architecture's "Guide owns content, cf owns logic" and "Guide release coupling" principles do allow this kind of coupling. But the slice picks the heaviest option, a new convention in another repo, where a lighter one would meet the requirement. For example, it could reuse an existing indexed naming pattern, or record the new filename in the architecture's dependency list so the coupling is visible at the parent level. At minimum, the architecture's Dependencies section and the slice plan entry should name this guide dependency. Currently only the slice doc does.

### [NOTE] Delivery of the map to an adoption run depends on a guide-side follow-up

D5 keeps `cf build` free of writes and relies on a non-blocking guide prompt change for adoption runs to invoke `cf docs map`. This fits "Facts in core, judgement in the prompt" and the single-write rule. The consequence is that, until the guide ships that prompt change, the architecture's goal of mapping docs during adoption happens only if the PM runs the command by hand. This is acknowledged in the slice and is acceptable.

### [NOTE] Scope matches the architecture's boundaries for scanning and tolerance

The slice maps only the checkout root (consistent with 261's folder-scoped detection) and reuses 261's `DOC_PATHS`, `ADR_DIRS` and `EXCLUDED_DIRS`. Docs at the repository root, outside a monorepo project folder, are left to hand entries. Docs and ADRs are never read for meaning. This matches the architecture's "Facts in core, judgement in the prompt" and "Mapping without moving" principles. The dependency direction (267 consumes 261, nothing flows back) is correct.

### [PASS] Failure modes and out-of-tree tolerance are explicit

Every I/O path (walk, title read, map read, write) has a named handling strategy. ENOENT is treated as "not present" and any other error becomes `DocsMapError`, following 260's rule. A broken or missing block fails with nothing written. D6 enumerates every reader of `user/architecture/` (cf and squadron) and fixes the `cf check` out-of-tree behavior with a regression fixture. That satisfies the architecture's requirement that introspection tolerate artifacts pointing outside `project-documents/`. No NFR in the parent architecture applies to this path.

### Run Digest

- Response length: 6275 chars
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
- Tokens — prompt / cached / cache write / completion / reasoning: 176136 / 89194 / 86936 / 3691 / not computed
- Duration: 33.4 s
- Cost: $0.39 (provider)
- `## Summary` located: yes
- `## Findings` located: yes
- Finding-shaped matches — whole response: 6
- Finding-shaped matches — inside fences: 0
- Finding-shaped matches — in findings section: 6
- Finding-shaped matches — surviving validation: 6
