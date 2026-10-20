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
reviewedSha: 7301d784f17bc2cf5a7cf3baa65dc2141dd9b78f
revision_number: 1
toolsGiven: [read_file, list_files, grep]
toolCallsMade: 2
turns: 3
promptTokens: 95608
cachedTokens: 11266
cacheWriteTokens: 84338
completionTokens: 3624
durationSeconds: 30.8
costUsd: 0.375457
costBasis: provider
runId: run-20261020-slices-plan-a67cc35b
squadronVersion: 0.23.5
findings:
  - id: F001
    severity: pass
    category: architecture-alignment
    summary: "Facts-in-core boundary and probe handling match the architecture"
    location: "project-documents/user/slices/262-slice.squadron-path.md#Technical Decisions"
  - id: F002
    severity: pass
    category: architecture-alignment
    summary: "`fileComprehension` follows the guide prompt contract"
    location: "project-documents/user/slices/262-slice.squadron-path.md#D5"
  - id: F003
    severity: pass
    category: error-handling
    summary: "Failure modes for the new process-spawn path are enumerated"
    location: "project-documents/user/slices/262-slice.squadron-path.md#D1"
  - id: F004
    severity: concern
    category: proportionality
    summary: "Failure taxonomy is heavier than the single behavior it feeds"
    location: "project-documents/user/slices/262-slice.squadron-path.md#D1"
  - id: F005
    severity: concern
    category: proportionality
    summary: "Sections restate other documents or cover cases cf does not act on"
    location: "project-documents/user/slices/262-slice.squadron-path.md#Dependencies"
  - id: F006
    severity: note
    category: error-handling
    summary: "Timeout may not bound a hang caused by orphaned grandchildren"
    location: "project-documents/user/slices/262-slice.squadron-path.md#D1"
  - id: F007
    severity: note
    category: dependencies
    summary: "Prerequisite ordering deviates from the architecture's dependency statement, with adequate mitigation"
    location: "project-documents/user/slices/262-slice.squadron-path.md#Prerequisites"
  - id: F008
    severity: note
    category: architecture-alignment
    summary: "Parity with the architecture on monorepo scoping is accepted but weakens one stated principle"
    location: "project-documents/user/slices/262-slice.squadron-path.md#Interfaces Required"
---

# Review: slice — slice 262

**Verdict:** CONCERNS
**Model:** claude-sonnet-5-5

## Findings

### [PASS] Facts-in-core boundary and probe handling match the architecture

cf reads only `probe_version` (D2), passes the probe JSON through verbatim (D6), and never interprets `surfaces`, `graph`, or null fields. The architecture's "Facts in core, judgement in the prompt" and "Use squadron by capability" principles require this. Neither the surface nor the graph staleness is decided in cf, as the guide-prompt contract in the architecture specifies. An unknown version or unreadable output becomes a stated "Squadron: unavailable" with a reason, never a silent skip or a build failure (D4). That satisfies the architecture's Squadron contract stability item.

### [PASS] `fileComprehension` follows the guide prompt contract

The variable is resolved by filename and `docType`, gated on the guide profile listing it, and left undefined with no placeholder when nothing matches. It is derived on each build and never stored. This matches the architecture's statement that `fileComprehension` is optional and that cf "passes nothing (never a placeholder)". It also keeps the guide as the owner of profile content.

### [PASS] Failure modes for the new process-spawn path are enumerated

Not-found, timeout (10 s), buffer overflow, external signal kill, spawn errors, non-zero exit, non-JSON or non-object output, and unsupported version each have a classification and a rendered reason. The timeout and buffer limits are single constants.

### [CONCERN] Failure taxonomy is heavier than the single behavior it feeds

Five `ProbeRun` kinds and seven `ProbeUnavailableReason` kinds all lead to the same behavior: a one-line "unavailable" statement. `spawn-failed` (which also covers buffer overflow), `signaled`, and `timed-out` could collapse into one "could not run: {message}" kind. `timed-out` could stay separate if the reason text needs the limit. That would remove the ordered `execFile` error-field decision tree, which depends on Node internals (`killed` vs `ERR_CHILD_PROCESS_STDIO_MAXBUFFER`). It would also remove the fake-executable tests for signal kill and buffer overflow, which are platform-sensitive and the most expensive tests in the slice. Keep `not-found`, because it carries the PATH message, and keep the non-zero-exit and unsupported-version cases. Fold the rest into the generic kind.

### [CONCERN] Sections restate other documents or cover cases cf does not act on

"Interfaces Required" lists four readings from squadron 366's design (`graph.path` null rules, `analysis_skill_installed` semantics, "installed, not enabled", exit-code behavior). The slice itself says "cf doesn't act on any of them". These belong in the probe contract and the walkthrough fixture notes, not in this design. Cut them, or reduce them to a pointer to the contract. The monorepo-root caveat is the only item here that affects cf's behavior (the `cwd` choice), so keep that one. The same applies to the "Risk Assessment" restatement of contract-drift handling, which duplicates D8.

### [NOTE] Timeout may not bound a hang caused by orphaned grandchildren

`execFile` with `timeout` sends SIGTERM to `sq` only. Its callback fires when the stdio pipes close, so a git subprocess that `sq probe` has spawned and that still holds the pipe could delay the callback past 10 s. This is unlikely for a read-only probe. If it needs a guarantee, the wrapper could add its own hard deadline, but that would add mechanism. The risk is probably acceptable as stated, but the "at most 10 s" claim in Special Considerations is slightly stronger than the mechanism supports.

### [NOTE] Prerequisite ordering deviates from the architecture's dependency statement, with adequate mitigation

The architecture says the probe and squadron 366 "must land before CF's squadron-path slice". This design builds against an unreleased probe. It uses a vendored contract fixture and an injectable probe (D8, D9), so builds and tests don't need squadron. Users without it get a stated "unavailable". The deviation is reasonable and explicitly justified. Only the end-to-end walkthrough, steps 2–4, depends on the branch install.

### [NOTE] Parity with the architecture on monorepo scoping is accepted but weakens one stated principle

The architecture scopes detection to the project's own folder. The probe necessarily resolves to the git toplevel, so in a monorepo the graph facts describe the repository root. The slice acknowledges this and defers verification to 265. That is a reasonable boundary because the graph is squadron's, but 265 should confirm the prompt copes with it.

### Run Digest

- Response length: 5659 chars
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
- Tokens — prompt / cached / cache write / completion / reasoning: 95608 / 11266 / 84338 / 3624 / not computed
- Duration: 30.8 s
- Cost: $0.38 (provider)
- `## Summary` located: yes
- `## Findings` located: yes
- Finding-shaped matches — whole response: 8
- Finding-shaped matches — inside fences: 0
- Finding-shaped matches — in findings section: 8
- Finding-shaped matches — surviving validation: 8
