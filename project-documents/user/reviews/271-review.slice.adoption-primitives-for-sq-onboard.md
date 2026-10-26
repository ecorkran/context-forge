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
reviewedSha: 2a20191c196d55fb2f38ba5c4647d2aa69e00186
revision_number: 2
toolsGiven: [read_file, list_files, grep]
toolCallsMade: 2
turns: 3
promptTokens: 101543
cachedTokens: 11266
cacheWriteTokens: 90273
completionTokens: 5052
durationSeconds: 42.7
costUsd: 0.41348
costBasis: provider
runId: run-20261026-p4-a6fa184d
squadronVersion: 0.24.5
findings:
  - id: F001
    severity: concern
    category: integration
    summary: "Comprehension-path containment check can reject a path squadron legitimately passes"
    location: "project-documents/user/slices/271-slice.adoption-primitives-for-sq-onboard.md#D7 — Prompt delivery"
  - id: F002
    severity: concern
    category: under-specification
    summary: "Project root for `cf prompt get` is unspecified"
    location: "project-documents/user/slices/271-slice.adoption-primitives-for-sq-onboard.md#D7 — Prompt delivery"
  - id: F003
    severity: note
    category: scope
    summary: "Two behaviors extend the architecture and the architecture is not amended"
    location: "project-documents/user/slices/271-slice.adoption-primitives-for-sq-onboard.md#D6 and #D9"
  - id: F004
    severity: note
    category: scope
    summary: "Report carries `notices` beyond the architecture's field list"
    location: "project-documents/user/slices/271-slice.adoption-primitives-for-sq-onboard.md#D3 — Report schema"
  - id: F005
    severity: note
    category: proportionality
    summary: "Proportionality: the work is heavier than its headline but matches the plan entry"
    location: "project-documents/user/slices/271-slice.adoption-primitives-for-sq-onboard.md#D8 and #Success Criteria"
  - id: F006
    severity: pass
    category: architecture-alignment
    summary: "Detection contract, error handling and failure modes align with the architecture"
    location: "project-documents/user/slices/271-slice.adoption-primitives-for-sq-onboard.md#D3–D5"
  - id: F007
    severity: pass
    category: boundaries
    summary: "Squadron ban and layer boundaries hold"
    location: "project-documents/user/slices/271-slice.adoption-primitives-for-sq-onboard.md#D10"
---

# Review: slice — slice 271

**Verdict:** CONCERNS
**Model:** claude-sonnet-5-5

## Findings

### [CONCERN] Comprehension-path containment check can reject a path squadron legitimately passes

The architecture's contract names only one path error: "a path that doesn't exist is a named error" (Technical Considerations, cf ↔ squadron contract). D7 adds a second error: a path outside the project root, checked on real paths. D2 says a project can be a monorepo subdirectory, judged on that folder. Squadron builds its graph and comprehension doc for the repository. If it writes the doc at the repo root or in its own store, which the architecture never rules out, `sq onboard` gets a refusal on a valid handoff. The slice never states where the comprehension doc may live, so the check is an unstated requirement on squadron. The Security note justifies the restriction, but it reaches further than the architecture's contract. D7 is in the set sent to the `sq` session. The design should:
- say explicitly that the doc must sit inside the project folder, as a contract term squadron confirms; or
- widen the check to the repository root, which is the CI exception D2 already makes.

### [CONCERN] Project root for `cf prompt get` is unspecified

`cf detect` has an explicit root rule (D2: the given directory, default cwd, no walk-up). `cf prompt get` does not. D7 says the path "resolves against the project root", and the data flow calls `readAdoptionArtifacts(root)`, but neither says how `root` is chosen. It could be cwd, the registered active project, or a `--path`. `{project}` substitution today implies the active project. If squadron runs `cf detect --path X` and then `cf prompt get` from a different cwd, the Adoption Inputs section could list another project's concept, derived architecture and plan. This is the same kind of cross-surface mismatch the "one detection, many consumers" principle exists to prevent. State the root source for `prompt get`. Also state whether it accepts `--path` like `cf detect`, or is cwd/active-project only and documented that way in the contract sent to squadron.

### [NOTE] Two behaviors extend the architecture and the architecture is not amended

Both extensions are deliberate and disclosed:
- **Onboarding stop on `adoption-incomplete`.** The architecture's Onboarding section names only brownfield, and D6 adds `adoption-incomplete` as well.
- **`cf init` notice.** The architecture says it prints one line "when it finds an existing codebase". D9 also prints the incomplete-adoption line.

Both are consistent with the navigation behavior 269 defines, and I find no conflict with the architecture. Because the slice records the divergence only in its own body, add a one-line amendment to `260-arch.brownfield-adoption.md`. Otherwise a later reader of the architecture will take the narrower behavior as authoritative.

### [NOTE] Report carries `notices` beyond the architecture's field list

The architecture lists `reportVersion`, `outcome`, `facts` and `artifacts`. The slice adds `notices`, which is additive and so non-breaking under its own versioning rule. It is justified because it keeps adoption wording out of the onboarding recipe (D6). It does put prose in a machine contract, and D3 says squadron "may ignore it". That should be documented as non-contractual in 272.

### [NOTE] Proportionality: the work is heavier than its headline but matches the plan entry

The log-sink changes across the guides, setup-ide and commandInstaller (D8) are the largest cost. The slice plan entry assigns them, and the slice states that its 3/5 estimate differs from the plan's 2/5. The design considered and rejected patching `console.log`, which is the right call. The "Technical Requirements" bullets that restate file-size and function-size rules from the project guidelines add nothing and can be cut. I see no deferred scope.

### [PASS] Detection contract, error handling and failure modes align with the architecture

- The outcome set and evaluation order reuse 269's `AdoptionOutcome.kind`, so there is no second list.
- Report fields, relative paths, read-only behavior, the stable-code JSON error object and non-zero exit all match the contract.
- Failure modes are enumerated for each new I/O path:
  - unmeasurable source: bounded walk, `source-unmeasurable` only when the outcome depends on it;
  - git history: 5-second timeout, `known: false` with a reason;
  - bad config, unreadable planning directory and missing path: each has a code;
  - process-boundary `internal`: it is logged, not swallowed;
  - detection error during `cf init`: advisory and never fails registration.

### [PASS] Squadron ban and layer boundaries hold

- The slice deletes `comprehensionAnalysis.ts` and its exports, and adds a guard test for the ban.
- The comprehension path comes only from the caller.
- The prompt key is not hard-coded; `fileComprehension` is gated through the guide's own context profile, so the guide owns content and cf owns logic.
- A missing prompt or profile row is an error with no fallback.
- Dependencies point from the CLI and MCP into a single core `detectProject`, with no duplicated heuristics.

### Run Digest

- Response length: 6389 chars
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
- Tokens — prompt / cached / cache write / completion / reasoning: 101543 / 11266 / 90273 / 5052 / not computed
- Duration: 42.7 s
- Cost: $0.41 (provider)
- `## Summary` located: yes
- `## Findings` located: yes
- Finding-shaped matches — whole response: 7
- Finding-shaped matches — inside fences: 0
- Finding-shaped matches — in findings section: 7
- Finding-shaped matches — surviving validation: 7
