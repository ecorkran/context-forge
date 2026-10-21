---
docType: review
layer: project
reviewType: slice
slice: conventions-reconciliation
conventionsSource: AGENTS.md
projectRules: []
project: context-forge
verdict: CONCERNS
verdictSource: stated
sourceDocument: project-documents/user/slices/266-slice.conventions-reconciliation.md
aiModel: claude-sonnet-5-5
aiProfile: sdk
status: complete
dateCreated: 20261020
dateUpdated: 20261020
reviewedSha: 44f43b2e0c0eeeeea104d89b8fda572590f7352a
toolsGiven: [read_file, list_files, grep]
toolCallsMade: 3
turns: 4
promptTokens: 172983
cachedTokens: 85600
cacheWriteTokens: 87377
completionTokens: 2823
durationSeconds: 26.9
costUsd: 0.387041
costBasis: provider
runId: run-20261021-slices-plan-c34863dc
squadronVersion: 0.23.5
findings:
  - id: F001
    severity: pass
    category: architecture-alignment
    summary: "Facts-in-core / judgement-in-prompt split respected"
    location: "project-documents/user/slices/266-slice.conventions-reconciliation.md#Overview"
  - id: F002
    severity: pass
    category: architecture-alignment
    summary: "Identity, additivity and #123 coexistence match the arch"
    location: "project-documents/user/slices/266-slice.conventions-reconciliation.md#D2 — Resolution identity is a file pair, never text"
  - id: F003
    severity: concern
    category: proportionality
    summary: "Overweight design: dismissal, `projectSource` breadth and stale-state handling"
    location: "project-documents/user/slices/266-slice.conventions-reconciliation.md#D3 — Decisions and how they render"
  - id: F004
    severity: concern
    category: scope
    summary: "Per-target rendering scope widened beyond the arch's composite concern"
    location: "project-documents/user/slices/266-slice.conventions-reconciliation.md#Technical Scope"
  - id: F005
    severity: concern
    category: error-handling
    summary: "Failure modes of new I/O paths are only partly enumerated"
    location: "project-documents/user/slices/266-slice.conventions-reconciliation.md#State Management"
  - id: F006
    severity: concern
    category: under-specification
    summary: "Inventory/renderer accept a statement but the composite-block safety claim is under-specified"
    location: "project-documents/user/slices/266-slice.conventions-reconciliation.md#Special Considerations"
  - id: F007
    severity: concern
    category: dependencies
    summary: "Guide prompt dependency and release coupling not stated as a version requirement"
    location: "project-documents/user/slices/266-slice.conventions-reconciliation.md#Dependencies"
  - id: F008
    severity: note
    category: dependencies
    summary: "261 sequencing dependency is correct but only declarative"
    location: "project-documents/user/slices/266-slice.conventions-reconciliation.md#Prerequisites"
  - id: F009
    severity: note
    category: nfr
    summary: "No NFRs apply"
    location: "project-documents/user/slices/266-slice.conventions-reconciliation.md"
---

# Review: slice — slice 266

**Verdict:** CONCERNS
**Model:** claude-sonnet-5-5

## Findings

### [PASS] Facts-in-core / judgement-in-prompt split respected

The cf side inventories files and persists and applies resolutions. The agent, driven by the guide prompt, decides whether two rules contradict. The arch (Architectural Principles; "Reconciliation is judgement") puts the split in the same place. The statement is stored and rendered verbatim and cf never reads it for meaning. A missing guide prompt is an error with no fallback, as the arch requires.

### [PASS] Identity, additivity and #123 coexistence match the arch

Keys are the guide rule basename plus the project source path, never heading text. That meets the arch's "keyed by rule file identity" and the slice plan's "wording change doesn't break a stored resolution". Output stays inside the managed block and project text is untouched ("Additive and reversible"). A single `delivered(rule, target)` predicate is the integration point for #123, which satisfies "sequenced with #123" without a hard dependency.

### [CONCERN] Overweight design: dismissal, `projectSource` breadth and stale-state handling

The slice is large for what it must deliver: persisted resolutions that survive `setup-ide` re-runs, plus a way to record them. Three things could be cut or deferred:
- The `dismissed` decision, with its own optional-statement rules and a "never rendered" path. It serves only the prompt's "don't raise it again" behavior. The prompt could instead skip any pair that already has a resolution. If kept, say which success criterion needs it.
- Three severities of staleness handling in D5 (missing guide rule, missing source, not-delivered info line). The "not delivered" info line has no consumer and could be dropped.
- The human-readable table output for `inventory`, alongside `--json`. The agent uses JSON, so the table could wait.

Name which of these the slice plan entry requires, and cut the rest. The plan's success criteria are: conflicts listed, resolutions persist across `setup-ide`, and wording changes don't break them.

### [CONCERN] Per-target rendering scope widened beyond the arch's composite concern

The slice renders into CLAUDE.md, AGENTS.md and `.github/copilot-instructions.md`, covers worktrees, and covers dry runs. It also adds `trailing` to `compileClaudeRules`, a compiler change. The arch names only CLAUDE.md/AGENTS.md composition as the ground that #123 shares ("Current State"). Copilot may be justified by the existing compilers. If so, state that. Otherwise defer it and avoid touching a third emitter in a High-risk slice. The slice does not say why the compiler change is needed, as opposed to appending the section in the emitter.

### [CONCERN] Failure modes of new I/O paths are only partly enumerated

D5 covers malformed files and stale identities on read. The write path of `resolve` and `remove` is less complete:
- Two concurrent `resolve` calls (for example agent and PM, or two worktrees sharing a path) read-modify-write `nextId`. The temp-and-rename write is atomic, but a lost update would reuse an id and break "ids are never reused". The slice does not say whether this is accepted or guarded.
- It does not say what happens if the rename fails or the `.context-forge/` directory is missing.
- `inventory` behavior for an unreadable or binary candidate file is unspecified.
- A crash between `resolve` and `setup-ide` leaves recorded but unapplied state. This is probably fine, but say so.

State the strategy for each, even if it is "fail with `UserError`, no retry".

### [CONCERN] Inventory/renderer accept a statement but the composite-block safety claim is under-specified

The slice says rejecting newlines stops a statement from breaking out of the block's markers. A single line could still contain the literal END marker text (`MANAGED_END_MARKER`) or the `GENERATED_MARKER`. That would corrupt `managedState` detection or cause the file to be mis-classified in the inventory and in D6's exclusion test. Validation should also reject marker strings. It should also say how `projectSource` and `guideRule` values containing backticks are escaped in the rendered bullet. The validation list in D5 and the Success Criteria do not include either.

### [CONCERN] Guide prompt dependency and release coupling not stated as a version requirement

The arch's Dependencies section pins the guide versions that cf releases require (≥ v0.22.2 for brownfield). 266 requires a `conventions-reconciliation` prompt and profile plus a routing step in the brownfield prompt. It gives no minimum guide version and does not say what `cf build` or `cf next` does when the profile is absent. Neither does the "cf side builds and tests without them" line cover the user-facing result of shipping cf first. The arch's guide-release-coupling principle suggests naming the guide version and the failure the user sees when the guide lacks the prompt. The current text covers only the explicit `cf prompt get` case.

### [NOTE] 261 sequencing dependency is correct but only declarative

The slice plan lists 261 as a dependency, and the design reads no 261 API at run time. That is a clean, one-way dependency, and the arch's "one detection, many consumers" is respected. The design also notes, in D6, that 261's `RULE_FILE_PATHS` and 266's candidate list are deliberately separate. That is acceptable. A short consistency test, or a shared constant if the lists ever converge, would guard against drift.

### [NOTE] No NFRs apply

The arch states no latency or throughput targets for the `setup-ide` or `cf rules` paths. No restatement is needed.

### Run Digest

- Response length: 7019 chars
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
- Tokens — prompt / cached / cache write / completion / reasoning: 172983 / 85600 / 87377 / 2823 / not computed
- Duration: 26.9 s
- Cost: $0.39 (provider)
- `## Summary` located: yes
- `## Findings` located: yes
- Finding-shaped matches — whole response: 9
- Finding-shaped matches — inside fences: 0
- Finding-shaped matches — in findings section: 9
- Finding-shaped matches — surviving validation: 9
