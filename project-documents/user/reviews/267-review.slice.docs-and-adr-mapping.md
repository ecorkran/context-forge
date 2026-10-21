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
reviewedSha: 348dd2c50dc415a07cfeeed873af8bdc9ffb902c
revision_number: 2
toolsGiven: [read_file, list_files, grep]
toolCallsMade: 3
turns: 4
promptTokens: 174945
cachedTokens: 88882
cacheWriteTokens: 86057
completionTokens: 3432
durationSeconds: 30.3
costUsd: 0.38818
costBasis: provider
runId: run-20261021-slices-plan-c34863dc
squadronVersion: 0.23.5
findings:
  - id: F001
    severity: pass
    category: architecture-alignment
    summary: "Alignment with the arch's docs and ADR mapping goals"
    location: "project-documents/user/slices/267-slice.docs-and-adr-mapping.md#Overview"
  - id: F002
    severity: concern
    category: proportionality
    summary: "Design is heavier than the slice requires"
    location: "project-documents/user/slices/267-slice.docs-and-adr-mapping.md#D2, D3, D4"
  - id: F003
    severity: concern
    category: scope-boundaries
    summary: "D7 pulls a setup-ide refactor into this slice and leaves the coupling to 266 and #123 implicit"
    location: "project-documents/user/slices/267-slice.docs-and-adr-mapping.md#D7"
  - id: F004
    severity: note
    category: architecture-alignment
    summary: "Core reads document prose for the title"
    location: "project-documents/user/slices/267-slice.docs-and-adr-mapping.md#D3"
  - id: F005
    severity: note
    category: error-handling
    summary: "`dateUpdated` edit is under-specified for an existing map"
    location: "project-documents/user/slices/267-slice.docs-and-adr-mapping.md#D4"
  - id: F006
    severity: note
    category: integration
    summary: "Frontmatter `interfaces: []` understates what the slice provides"
    location: "project-documents/user/slices/267-slice.docs-and-adr-mapping.md:8"
---

# Review: slice — slice 267

**Verdict:** CONCERNS
**Model:** claude-sonnet-5-5

## Findings

### [PASS] Alignment with the arch's docs and ADR mapping goals

The design links existing material in place and never moves or rewrites it. This matches "Additive and reversible" and "Mapping without moving" in the arch. Core reports only structure (paths, titles, grouping), and ADR status and meaning are left to agents, which fits "facts in core, judgement in the prompt". The filename is specified by cf, then the guide documents it afterwards. This matches the arch's Dependencies note that the docs map entry does not block a cf release. The slice plan's three success criteria are covered: discoverability, originals untouched, and no `cf check` findings for out-of-tree links (D6 plus the regression fixture). The dependency on 261 and the checkout-root rule match the arch's scoping.

### [CONCERN] Design is heavier than the slice requires

The slice must deliver a discoverable index of docs and ADRs, with originals untouched and no `cf check` findings. Several mechanisms go beyond that, each with its own test matrix:
- **Symlink handling (D2):** the design collects skipped symlinks, prints a dedicated stderr warning, and returns `skippedSymlinks` in the result. Silently not following symlinks and listing them in the CLI summary would meet the "no silent omission" intent with less machinery.
- **Title extraction (D3):** it has a three-step fallback, a 64 KiB read limit and UTF-8 replacement semantics. It also has two separate error paths: ENOENT drops the entry, and any other error aborts the write. Falling back to the filename, or to the first H1 only, would deliver discoverability. The frontmatter `title:` step and the byte limit can be cut or deferred.
- **Atomic write (D4):** the temp file plus rename is justified in the doc only by "last writer wins" on a hand-run, regenerable file. A plain write plus an explicit write-failure error is enough.
- **`findDocsMap` (D1):** it matches any index and requires `docType: reference`, with a duplicate-map error. Looking up the single canonical filename would remove this. The renumbering case is speculative.

The finding is to cut or defer these, or to record why each is needed. Effort is rated 3/5, and these items are most of what drives it.

### [CONCERN] D7 pulls a setup-ide refactor into this slice and leaves the coupling to 266 and #123 implicit

D7 extracts `locateManagedBlock` into core and rewires cli's `managedState`. That is a change to setup-ide code the arch names as shared ground with #123 and conventions reconciliation (266). The slice plan assigns none of this to 267. Dependencies and "Consumes from Other Slices" say "Nothing from 262–266", yet Provides says 266's reconciliation will reuse the locator. If 266 or #123 is in flight, 267 can conflict with them in merge or behavior. The design records no sequencing or ownership. It also closes #128 as part of this slice. Two ways to fix this:
- Keep the locator private to `docs-map/` and let #128 (or 266) do the shared extraction.
- Keep D7, but state the ordering relative to 266 and #123 in Prerequisites and confirm that `managedState`'s tests cover the unpaired, duplicated and out-of-order cases the new locator will rule on.

### [NOTE] Core reads document prose for the title

The arch says core never parses prose for meaning. D3 argues that the title is display-only, and the exact path is printed beside it. That is a reasonable reading, but it is the one place core reads file contents. Keeping the title step minimal (see the proportionality finding) keeps this consistent with the principle.

### [NOTE] `dateUpdated` edit is under-specified for an existing map

D4 and the State Management section say cf sets frontmatter `dateUpdated` when the block changes, and that bytes outside the block are otherwise preserved byte for byte. The design doesn't say what happens when a hand-edited map has no `dateUpdated`, or has malformed frontmatter. It should be either a named `DocsMapError` or an explicit skip, consistent with the "never guess" rule used for a broken block. Dropping the `dateUpdated` rewrite would also remove the case.

### [NOTE] Frontmatter `interfaces: []` understates what the slice provides

Provides lists `findDocsMap` and `locateManagedBlock`, but the frontmatter lists no interfaces. This is minor, but the field should match the section.

### Run Digest

- Response length: 5002 chars
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
- Tokens — prompt / cached / cache write / completion / reasoning: 174945 / 88882 / 86057 / 3432 / not computed
- Duration: 30.3 s
- Cost: $0.39 (provider)
- `## Summary` located: yes
- `## Findings` located: yes
- Finding-shaped matches — whole response: 6
- Finding-shaped matches — inside fences: 0
- Finding-shaped matches — in findings section: 6
- Finding-shaped matches — surviving validation: 6
