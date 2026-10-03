---
docType: review
layer: project
reviewType: slice
slice: guide-exclude-globs-for-tarball-installs
targetKind: slice
rulesSource: project
project: context-forge
verdict: CONCERNS
verdictSource: stated
sourceDocument: project-documents/user/slices/212-slice.guide-exclude-globs-for-tarball-installs.md
aiModel: claude-sonnet-5-5
status: complete
dateCreated: 20261003
dateUpdated: 20261003
reviewedSha: 1956ec421edf64463b5bad0aaef44e06b8421df0
toolsGiven: [read_file, list_files, grep]
toolCallsMade: 2
durationSeconds: 23.2
squadronVersion: 0.18.3
findings:
  - id: F001
    severity: concern
    category: error-handling
    summary: "Failure modes for the same-version re-extract are not enumerated"
    location: "project-documents/user/slices/212-slice.guide-exclude-globs-for-tarball-installs.md#Data Flow"
  - id: F002
    severity: concern
    category: scope
    summary: "Slice is outside the onboarding architecture's anticipated slices"
    location: "project-documents/user/slices/212-slice.guide-exclude-globs-for-tarball-installs.md#Overview"
  - id: F003
    severity: concern
    category: nfr
    summary: "Parent NFR on the setup path is not restated, and init interaction is under-specified"
    location: "project-documents/user/slices/212-slice.guide-exclude-globs-for-tarball-installs.md#Integration Requirements"
  - id: F004
    severity: note
    category: dependencies
    summary: "Config layer now depends on the guides module"
    location: "project-documents/user/slices/212-slice.guide-exclude-globs-for-tarball-installs.md#Component Structure"
  - id: F005
    severity: note
    category: error-handling
    summary: "Missing record is read as \"nothing excluded\""
    location: "project-documents/user/slices/212-slice.guide-exclude-globs-for-tarball-installs.md#State Management"
  - id: F006
    severity: pass
    category: architecture
    summary: "Layering, composability and non-silent handling follow the architecture"
    location: "project-documents/user/slices/212-slice.guide-exclude-globs-for-tarball-installs.md#Architecture"
---

# Review: slice — slice 212

**Verdict:** CONCERNS
**Model:** claude-sonnet-5-5

## Findings

### [CONCERN] Failure modes for the same-version re-extract are not enumerated

Update step 4 says "remove the guide directory and re-extract the same tag". This is a new I/O path: delete, then download, then extract, then write the marker and record, then commit. The doc does not say what happens in these cases:
- The download fails after the directory is removed. Causes include a network error, a timeout, or the 60/hour GitHub rate limit that Special Considerations mentions. The project is left with no guide, and `cf setup-ide` and the process depend on `scripts/` and `project-guides/`.
- Extraction is interrupted partway.
- The process dies between writing the version marker and writing the exclude record. The next update would read a missing record as "nothing excluded" and could re-extract wrongly or skip a needed re-extract.
- The guide directory has uncommitted local edits that the removal deletes.

The doc needs an explicit strategy. Download and extract to a temp directory and swap it in only on success, or write the record before the marker. Also state what happens when the commit step fails. Most of this is deferred to the existing update path, which the doc does not describe.

### [CONCERN] Slice is outside the onboarding architecture's anticipated slices

The architecture (200) defines four slices: smart `cf init`, `project_create`, the onboarding skill, and first-run `cf next`. It treats guide installation as an existing mechanism that init composes ("Guide install mechanism already exists. Init composes it"). Slice 212 adds a new config key, a parser module, an on-disk record format, re-extract semantics, and new CLI and MCP result fields. That is guide-management feature work, and it mostly serves ongoing `cf guides update` use, not first-run onboarding. The Overview ties it to a PM-approved request from the guide side, not to an architectural goal. Either record it as an accepted extension of the 200 initiative, or move it under the guide-management (160-band) architecture. The justification should be stated, not left implicit.

### [CONCERN] Parent NFR on the setup path is not restated, and init interaction is under-specified

The architecture's goal is "from `npm install` to useful context output in under two minutes". `cf init` composes guide install, which this slice modifies. The slice does not restate that target. It also does not say whether filtering reduces or affects install time. It mentions only that a re-extract costs one more download.

The init detection matrix says init skips guide installation when `project-documents/ai-project-guide/` already exists. The slice's requirement "`cf init` with a pre-set `guide.exclude` installs a filtered guide" holds only for a fresh install. On an existing guide, init skips it, and the changed list takes effect only through `cf guides update`. Document this interaction.

### [NOTE] Config layer now depends on the guides module

`ConfigKeys` imports `guides/guideExclude.ts`. The doc handles the cycle risk by having the module import nothing from `config/`. That works. The dependency direction (config → guides) is unusual, though. A neutral location for the pure parser would keep config free of guide-domain imports. This is not blocking.

### [NOTE] Missing record is read as "nothing excluded"

Reading a missing record as an empty list is a default. The doc justifies it (it is accurate for every pre-slice install), so it is not a silent-fallback violation. A hand-deleted record on a filtered install would be misread, and the next update would re-extract. That outcome is benign and self-correcting.

### [PASS] Layering, composability and non-silent handling follow the architecture

- The `InstallStrategy` interface is unchanged.
- The CLI and MCP layers only render results.
- Additive result fields leave the MCP tools atomic, so the onboarding skill's `guide_status` and `guide_install` flow keeps working. This matches the principle that the MCP server stays atomic and composable.
- Validation runs at config-set time and again when install or update reads the key, so a hand-edited `.context-forge.toml` cannot bypass the protected paths.
- Non-tarball installs and unmatched patterns are reported, not silently ignored.
- No new dependency is added.

### Run Digest

- Response length: 5099 chars
- Response is newline-free: no
- Tool calls made: 2
- Tool calls failed: 0
- Stop reason: end_turn
- Output budget: backend default
- System prompt: preset+append
- Settings sources: project
- Reasoning characters: 0
- Effort: backend default
- Turns: not computed
- Tokens — prompt / cached / completion / reasoning: not computed / not computed / not computed / not computed
- Duration: 23.2 s
- `## Summary` located: yes
- `## Findings` located: yes
- Finding-shaped matches — whole response: 6
- Finding-shaped matches — inside fences: 0
- Finding-shaped matches — in findings section: 6
- Finding-shaped matches — surviving validation: 6
