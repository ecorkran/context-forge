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
reviewedSha: 4dda8deae1ff122d10fc7e1b03a4a218569fbe58
toolsGiven: [read_file, list_files, grep]
toolCallsMade: 2
turns: 3
promptTokens: 100995
cachedTokens: 8865
cacheWriteTokens: 92126
completionTokens: 4792
durationSeconds: 39.9
costUsd: 0.418051
costBasis: provider
runId: run-20261026-p4-a6fa184d
squadronVersion: 0.24.5
findings:
  - id: F001
    severity: pass
    category: alignment
    summary: "Detection report matches the architecture's contract"
    location: "project-documents/user/slices/271-slice.adoption-primitives-for-sq-onboard.md#D3 — Report schema, version 1"
  - id: F002
    severity: pass
    category: boundaries
    summary: "The squadron ban and dependency direction are respected and enforced"
    location: "project-documents/user/slices/271-slice.adoption-primitives-for-sq-onboard.md#D10 — Delete the comprehension lookup and guard the ban"
  - id: F003
    severity: pass
    category: error-handling
    summary: "Failure modes for the new I/O paths are enumerated"
    location: "project-documents/user/slices/271-slice.adoption-primitives-for-sq-onboard.md#D4, D5"
  - id: F004
    severity: concern
    category: scope
    summary: "`cf init --json`, the exit-code rework and the log sinks are outside the slice's architectural scope"
    location: "project-documents/user/slices/271-slice.adoption-primitives-for-sq-onboard.md:221-241"
  - id: F005
    severity: concern
    category: scope
    summary: "Dropped or added scope should be reconciled with the slice plan entry"
    location: "project-documents/user/slices/271-slice.adoption-primitives-for-sq-onboard.md:405"
  - id: F006
    severity: note
    category: proportionality
    summary: "`artifacts.planning` is not in the architecture contract and nothing consumes it"
    location: "project-documents/user/slices/271-slice.adoption-primitives-for-sq-onboard.md:177"
  - id: F007
    severity: note
    category: security
    summary: "Path containment for `--comprehension` doesn't say how symlinks are handled"
    location: "project-documents/user/slices/271-slice.adoption-primitives-for-sq-onboard.md:215"
  - id: F008
    severity: note
    category: alignment
    summary: "Onboarding also stops on `adoption-incomplete`"
    location: "project-documents/user/slices/271-slice.adoption-primitives-for-sq-onboard.md:204"
---

# Review: slice — slice 271

**Verdict:** CONCERNS
**Model:** claude-sonnet-5-5

## Findings

### [PASS] Detection report matches the architecture's contract

The report carries `reportVersion`, the five outcome values, `facts`, and `artifacts` (concept, derived architectures, existing-state plan), as the architecture's contract section requires. Paths are relative to the project root. The report is read-only and works on an unregistered directory. Outcomes are mapped straight from `AdoptionOutcome.kind`, so there is no second list. D2 keeps the monorepo scoping and the CI root exception from the architecture's Detection section.

### [PASS] The squadron ban and dependency direction are respected and enforced

`comprehensionAnalysis.ts` is deleted, as the architecture's Current State section says 271 must do. cf only receives the comprehension path as an argument and never searches for it. The guard test makes the ban mechanical, and it is cheap. The only guide-coupled name, `fileComprehension`, is kept in one constant and justified as the guide's contract.

### [PASS] Failure modes for the new I/O paths are enumerated

The source walk is bounded by `MAX_WALK_ENTRIES` and the threshold. The history call has a 5-second git timeout. A failed walk gives `source-unmeasurable` only when the outcome truly depends on it. Every error has a stable code and a non-zero exit, and the `internal` code is explicitly not a swallow. A missing guide prompt or a dropped profile variable is a named error with no fallback, which matches the "guide owns content" principle.

### [CONCERN] `cf init --json`, the exit-code rework and the log sinks are outside the slice's architectural scope

The architecture assigns 271 two things: the detection report and adoption-prompt delivery. `cf init` is only required to print one line for an existing codebase. D8 adds much more:
- a new JSON output mode for `cf init`;
- per-step result tracking across six steps;
- a stderr log sink threaded through `guides.ts`, `setup-ide.ts` and `commandInstaller.ts`;
- piped stdio for `git init`;
- a breaking change from exit 0 to exit 1 on a failed step;
- a changed exit code for the worktree refusal.

The design itself says this raised effort from 2/5 to 3/5. The architecture's adoption flow step 1 only says "Register the project (`cf init` or the MCP equivalent)". It names no requirement that `cf init` emit a project id or step results. Squadron can call `cf init` and then `cf detect --json`, and neither needs the project id from init. Under the proportionality criterion, cut or defer:
- `cf init --json` and the log-sink plumbing, until squadron (440) names a concrete need for them;
- the worktree-refusal exit change, which fixes a behavior unrelated to this slice.

If a failed step must still be visible, the exit-code change alone is a smaller fix. It still breaks existing scripts and belongs in its own fix or slice, not in this one.

### [CONCERN] Dropped or added scope should be reconciled with the slice plan entry

The design says the slice plan estimated 2/5 and the design now estimates 3/5, with the extra effort coming from the D8 work above. The parent slice plan (`260-slices.brownfield-adoption.md`) is not among the documents I was given, so I can't verify that it assigns `cf init --json` to 271. If it does not, the added scope should move to a separate slice or be dropped. If it does, the design should cite that entry, so the architecture–plan gap is visible.

### [NOTE] `artifacts.planning` is not in the architecture contract and nothing consumes it

The architecture lists `concept`, derived architectures and the existing-state plan as the `artifacts` fields. The slice adds `planning`, the list of artifacts that decided `already-planned`. Adding a field is non-breaking under D3's own versioning rule, but squadron's resume use case doesn't need it. Consider removing it until a consumer asks for it.

### [NOTE] Path containment for `--comprehension` doesn't say how symlinks are handled

D7 requires that the path "resolves against the project root" and stays inside it. The Security note says the prompt must never name arbitrary files on the machine. A symlink inside the project that points outside the root would defeat a lexical check. The design should say the check compares real (symlink-resolved) paths.

### [NOTE] Onboarding also stops on `adoption-incomplete`

The architecture's Onboarding section says to stop on a brownfield report. D6 also stops on `adoption-incomplete`. This is consistent with the navigation line 269 defines, and silently starting a greenfield concept conversation there would be worse. It is a small extension of the architecture text, and it is reasonable to keep.

### Run Digest

- Response length: 5916 chars
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
- Tokens — prompt / cached / cache write / completion / reasoning: 100995 / 8865 / 92126 / 4792 / not computed
- Duration: 39.9 s
- Cost: $0.42 (provider)
- `## Summary` located: yes
- `## Findings` located: yes
- Finding-shaped matches — whole response: 8
- Finding-shaped matches — inside fences: 0
- Finding-shaped matches — in findings section: 8
- Finding-shaped matches — surviving validation: 8
