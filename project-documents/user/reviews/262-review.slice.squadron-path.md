---
docType: review
layer: project
reviewType: slice
slice: squadron-path
conventionsSource: AGENTS.md
projectRules: []
project: context-forge
verdict: CONCERNS
verdictSource: stated
sourceDocument: project-documents/user/slices/262-slice.squadron-path.md
aiModel: claude-sonnet-5-5
aiProfile: sdk
status: complete
dateCreated: 20261020
dateUpdated: 20261020
reviewedSha: ce627d36245e3202c04b8e2806a8c70cdd808b19
toolsGiven: [read_file, list_files, grep]
toolCallsMade: 3
turns: 4
promptTokens: 177136
cachedTokens: 88715
cacheWriteTokens: 88415
completionTokens: 4194
durationSeconds: 34.4
costUsd: 0.405214
costBasis: provider
runId: run-20261020-slices-plan-a67cc35b
squadronVersion: 0.23.5
findings:
  - id: F001
    severity: pass
    category: architecture-alignment
    summary: "Core carries facts, the prompt judges"
    location: "project-documents/user/slices/262-slice.squadron-path.md#D2 — Classification and the version check"
  - id: F002
    severity: pass
    category: error-handling
    summary: "Failure modes of the new process path are enumerated"
    location: "project-documents/user/slices/262-slice.squadron-path.md#D1 — Running the probe"
  - id: F003
    severity: pass
    category: architecture-alignment
    summary: "`fileComprehension` follows the arch guide-prompt contract"
    location: "project-documents/user/slices/262-slice.squadron-path.md#D5 — Resolving `fileComprehension`"
  - id: F004
    severity: concern
    category: proportionality
    summary: "Mechanism count is heavy for a 2/5 slice"
    location: "project-documents/user/slices/262-slice.squadron-path.md#D3 — Stderr is carried, not parsed"
  - id: F005
    severity: concern
    category: error-handling
    summary: "Process-result mapping leaves two cases undefined"
    location: "project-documents/user/slices/262-slice.squadron-path.md#D1 — Running the probe"
  - id: F006
    severity: note
    category: integration
    summary: "Monorepo-subdirectory scope is not reconciled with the probe's repo-wide resolution"
    location: "project-documents/user/slices/262-slice.squadron-path.md#Interfaces Required"
  - id: F007
    severity: note
    category: dependencies
    summary: "Sequencing differs from the arch's dependency statement"
    location: "project-documents/user/slices/262-slice.squadron-path.md#Prerequisites"
---

# Review: slice — slice 262

**Verdict:** CONCERNS
**Model:** claude-sonnet-5-5

## Findings

### [PASS] Core carries facts, the prompt judges

D2 checks `probe_version` only and passes the rest of the JSON through verbatim. The Excluded list bars interpreting `surfaces`, `graph` and null fields. This matches the arch principles "Facts in core, judgement in the prompt" and "Use squadron by capability". It also matches the arch rule that cf doesn't report the current surface. The slice never names a surface.

### [PASS] Failure modes of the new process path are enumerated

ENOENT, timeout, other spawn errors, non-zero exit, non-JSON output, non-object output and unsupported or missing version each map to a stated "unavailable" reason (D2, D4). Stderr is carried in both outcomes (D3). This meets the arch requirement that an unreadable probe is stated to the user and never silent. D4 keeps probe failure from failing the build.

### [PASS] `fileComprehension` follows the arch guide-prompt contract

It resolves by squadron 362's filename and `docType`, and it is optional. It leaves no placeholder when nothing resolves. It is derived on each build rather than stored. It is gated on the guide's profile listing the variable, so the guide stays the owner of profile content.

### [CONCERN] Mechanism count is heavy for a 2/5 slice

These items can be cut or deferred. None is needed for the slice's success criteria ("every probe outcome yields the right Adoption Facts text; `fileComprehension` resolves or is absent"):
- **`MAX_PROBE_WARNING_LINES` cap and the "… n more lines omitted" line (D3).** The slice itself says the cap is hit only by something unusual, such as a traceback. `maxBuffer` already bounds stderr, so drop the cap and its tests.
- **`ProbeUnavailableReason` as a separate union (API Contracts).** Its first three cases repeat `ProbeRun`'s `not-found`, `timed-out` and `spawn-failed`. Let `classifyProbeRun` return the `ProbeRun` kinds plus three extra cases, or have the renderer take a reason string built in one place.
- **The `comprehension` template alias (D7).** Nothing in the slice or arch consumes it. The prompt receives the value through the Project Context line. Add the alias when a template uses it.
- **The live `sq` test in D8.** The contract test against the vendored fixture already meets the slice-plan criterion. The slice names 265's real-repo runs as the end-to-end check, so the live test duplicates part of that coverage and adds an environment-dependent skip path. Defer it unless the drift risk justifies it.

The fence-length rule in D6 is cheap and defensible, so it can stay.

### [CONCERN] Process-result mapping leaves two cases undefined

Two gaps:
- `ProbeRun.exited` carries `exitCode: number`. A child killed by a signal other than the timeout's own (OOM kill, external SIGTERM) has a null exit code. No `ProbeRun` kind covers it, so the wrapper must either coerce it or throw.
- D1 separates `timed-out` from buffer overflow, which it lists under `spawn-failed`. It does not say how. In Node, both end with the child killed, so a `killed` flag alone can't tell them apart. The wrapper has to key off the error code or the timer, and the design should say which.

Add a signal-terminated case (or fold it into `spawn-failed` with a message) and state the discriminator. Without both, the "every failure is a stated reason" guarantee in D4 has holes.

### [NOTE] Monorepo-subdirectory scope is not reconciled with the probe's repo-wide resolution

The arch scopes detection to the project's own folder, and slice 261 tests a monorepo subdirectory. The slice records that the probe resolves its project via git toplevel from `cwd`. For a CF project in a subdirectory, the graph and baseline facts in Adoption Facts therefore describe the repository root, not the folder. cf passes the JSON through unchanged, so nothing breaks. The slice should say in one line that this is accepted, or leave it to 265's verification. As written it is implicit.

### [NOTE] Sequencing differs from the arch's dependency statement

The arch says squadron's probe and 366 "must land before CF's squadron-path slice". The slice makes the probe optional for build and test by using fakes and a vendored fixture. This is the better dependency direction, since cf's tests don't need squadron. The cost is that the end-to-end squadron path stays unverified until squadron releases the probe. The slice already assigns that check to 265 and the walkthrough, so no change is needed.

### Run Digest

- Response length: 5633 chars
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
- Tokens — prompt / cached / cache write / completion / reasoning: 177136 / 88715 / 88415 / 4194 / not computed
- Duration: 34.4 s
- Cost: $0.41 (provider)
- `## Summary` located: yes
- `## Findings` located: yes
- Finding-shaped matches — whole response: 7
- Finding-shaped matches — inside fences: 0
- Finding-shaped matches — in findings section: 7
- Finding-shaped matches — surviving validation: 7
