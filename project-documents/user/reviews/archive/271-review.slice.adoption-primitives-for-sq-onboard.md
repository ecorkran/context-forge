---
docType: review
layer: project
reviewType: slice
slice: adoption-primitives-for-sq-onboard
conventionsSource: AGENTS.md
projectRules: []
project: context-forge
verdict: CONCERNS
verdictSource: stated
sourceDocument: project-documents/user/slices/271-slice.adoption-primitives-for-sq-onboard.md
aiModel: claude-sonnet-5-5
aiProfile: sdk
status: complete
dateCreated: 20261025
dateUpdated: 20261025
reviewedSha: e4f5b81b5d61851bfb04c016d440c05a70f3a1de
revision_number: 1
toolsGiven: [read_file, list_files, grep]
toolCallsMade: 6
turns: 7
promptTokens: 447309
cachedTokens: 351895
cacheWriteTokens: 95402
completionTokens: 4167
durationSeconds: 37.2
costUsd: 0.459223
costBasis: provider
runId: run-20261026-p4-a6fa184d
squadronVersion: 0.24.5
findings:
  - id: F001
    severity: pass
    category: architecture-alignment
    summary: "Detection contract matches the architecture"
    location: "project-documents/user/slices/271-slice.adoption-primitives-for-sq-onboard.md#D3"
  - id: F002
    severity: concern
    category: scope-alignment
    summary: "Onboarding stops on `adoption-incomplete`, which the architecture does not ask for"
    location: "project-documents/user/slices/271-slice.adoption-primitives-for-sq-onboard.md#D6"
  - id: F003
    severity: concern
    category: under-specification
    summary: "The `cf init --json` contract is inconsistent for the worktree refusal"
    location: "project-documents/user/slices/271-slice.adoption-primitives-for-sq-onboard.md#D8"
  - id: F004
    severity: concern
    category: error-handling
    summary: "The MCP `path` input has no failure handling for a relative path"
    location: "project-documents/user/slices/271-slice.adoption-primitives-for-sq-onboard.md#API-Contracts"
  - id: F005
    severity: concern
    category: proportionality
    summary: "Proportionality: some surface can be cut or deferred"
    location: "project-documents/user/slices/271-slice.adoption-primitives-for-sq-onboard.md#Technical-Scope"
  - id: F006
    severity: note
    category: enforcement
    summary: "The ban guard is a text scan and can be bypassed"
    location: "project-documents/user/slices/271-slice.adoption-primitives-for-sq-onboard.md#D10"
  - id: F007
    severity: pass
    category: error-handling
    summary: "Failure modes for new I/O paths are mostly enumerated"
    location: "project-documents/user/slices/271-slice.adoption-primitives-for-sq-onboard.md#D4"
---

# Review: slice — slice 271

**Verdict:** CONCERNS
**Model:** claude-sonnet-5-5

## Findings

### [PASS] Detection contract matches the architecture

The report carries the fields the architecture names: `reportVersion`, the five outcomes, `facts` and `artifacts`. Paths are relative to the project root. The report is read-only, works on an unregistered directory, and reports errors as a JSON object with a stable code and a non-zero exit. `outcome` reuses `AdoptionOutcome.kind` from 269, so there is no second list of values. Dependencies run from the surfaces into core. The squadron ban is kept and enforced by the D10 guard test.

### [CONCERN] Onboarding stops on `adoption-incomplete`, which the architecture does not ask for

The architecture's Onboarding section says the recipe stops only when the report says brownfield. D6 also stops on `adoption-incomplete`. It justifies this by matching the navigation line from 269, and that is reasonable. But it is a decision beyond the architecture, and it is presented as settled. Either record it as an amendment to the architecture's Onboarding section, or state that it extends the architecture. Otherwise 272 and later readers will find the two documents disagreeing.

### [CONCERN] The `cf init --json` contract is inconsistent for the worktree refusal

D8 says failures before any step runs use the D5 error object. The worktree refusal is instead reported as the `register` step with status `skipped`, and its exit code is left as it is today. The slice does not say what `ok` is in that case, or what `projectId` holds when nothing was registered. Squadron could read `ok: true` with no project id as success.

Squadron builds `sq onboard` on this shape, so the refusal needs its own explicit handling:
- Either use the D5 error object with a stable code.
- Or define `ok` as false and the id fields as null for this case.

The slice also does not say what the exit code is for the refusal.

### [CONCERN] The MCP `path` input has no failure handling for a relative path

The MCP server's working directory is not the project, so a relative `path` would silently resolve against the wrong directory. The slice says `path` is an "absolute directory". It does not say whether a relative path is rejected, or which D5 code it maps to. Reject a relative path as `path-not-found`, or add a dedicated code, and say so in D5.

### [CONCERN] Proportionality: some surface can be cut or deferred

The slice's effort is 3/5 against the plan's 2/5. The log sinks in D8 are accepted as necessary. These can be cut or deferred:
- **Non-JSON summary of `cf detect`.** The plan's consumers (squadron, onboarding, `cf init`) all use JSON or `outcomeLine`. A human-readable summary is a fourth rendering to format and test. Use a minimal `outcome` plus notices print, or defer the full summary.
- **Separate `ComprehensionPathError`, `DetectionError` and `DETECTION_ERROR_CODES` machinery plus `toDetectionError`.** Consider one error class carrying a code, since the mapping is otherwise a second place that lists every error.
- **The `internal` code.** It is explained as existing so every failure has a code. It is acceptable, but note that it is a catch-all.

The core scope matches the plan entry and nothing assigned appears to be dropped.

### [NOTE] The ban guard is a text scan and can be bypassed

Scanning for `codebase-comprehension` and `'sq'` catches the likely regressions cheaply. It will not catch a command assembled from parts, or a different squadron file name. That is acceptable for a cheap check, but the success criteria should not describe it as proving the ban.

### [PASS] Failure modes for new I/O paths are mostly enumerated

Each failure mode has explicit handling:
- **Source walk:** bounded by `MAX_WALK_ENTRIES`; a failed walk becomes `source-unmeasurable`.
- **Git history:** has a 5-second timeout.
- **Config:** invalid TOML maps to `invalid-config`.
- **Planning directories:** an unreadable one maps to `unreadable-planning`.
- **Comprehension path:** missing, directory, or outside the root (checked by realpath, so symlinks are refused) each give a named error.
- **Guide or profile:** a missing prompt or profile row fails with a named error and no fallback.

The only gap is the relative MCP path above. The architecture states no latency or throughput NFR for these paths, so none needs restating.

### Run Digest

- Response length: 5371 chars
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
- Tokens — prompt / cached / cache write / completion / reasoning: 447309 / 351895 / 95402 / 4167 / not computed
- Duration: 37.2 s
- Cost: $0.46 (provider)
- `## Summary` located: yes
- `## Findings` located: yes
- Finding-shaped matches — whole response: 7
- Finding-shaped matches — inside fences: 0
- Finding-shaped matches — in findings section: 7
- Finding-shaped matches — surviving validation: 7
