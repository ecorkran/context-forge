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
reviewedSha: e7eb456ca613f743c86046bde90d1e75298b3951
revision_number: 1
toolsGiven: [read_file, list_files, grep]
toolCallsMade: 3
turns: 4
promptTokens: 175359
cachedTokens: 89303
cacheWriteTokens: 86050
completionTokens: 2692
durationSeconds: 25.3
costUsd: 0.380794
costBasis: provider
runId: run-20261021-slices-plan-c34863dc
squadronVersion: 0.23.5
findings:
  - id: F001
    severity: pass
    category: architecture-alignment
    summary: "Facts-in-core / judgement-in-prompt boundary respected"
    location: "project-documents/user/slices/266-slice.conventions-reconciliation.md#Overview"
  - id: F002
    severity: pass
    category: architecture-alignment
    summary: "Additive and reversible; resolution identity matches arch"
    location: "project-documents/user/slices/266-slice.conventions-reconciliation.md#D2"
  - id: F003
    severity: concern
    category: proportionality
    summary: "Design is heavier than the slice plan's three success criteria require"
    location: "project-documents/user/slices/266-slice.conventions-reconciliation.md#D5"
  - id: F004
    severity: concern
    category: scope
    summary: "Copilot target extends scope beyond the arch's named files"
    location: "project-documents/user/slices/266-slice.conventions-reconciliation.md#Technical Scope"
  - id: F005
    severity: concern
    category: proportionality
    summary: "Inventory command duplicates data the agent already receives from 261 and the prompt can derive"
    location: "project-documents/user/slices/266-slice.conventions-reconciliation.md#D6"
  - id: F006
    severity: concern
    category: dependencies
    summary: "Release coupling to an unpublished guide prompt has no tracked acceptance gate"
    location: "project-documents/user/slices/266-slice.conventions-reconciliation.md#Dependencies"
  - id: F007
    severity: note
    category: error-handling
    summary: "Failure modes for the new I/O paths are enumerated"
    location: "project-documents/user/slices/266-slice.conventions-reconciliation.md#State Management"
  - id: F008
    severity: note
    category: architecture-alignment
    summary: "Dependency direction is correct"
    location: "project-documents/user/slices/266-slice.conventions-reconciliation.md#D7"
---

# Review: slice — slice 266

**Verdict:** CONCERNS
**Model:** claude-sonnet-5-5

## Findings

### [PASS] Facts-in-core / judgement-in-prompt boundary respected

cf enumerates sources, stores the PM's decision, and renders it. The agent decides whether two rules contradict. cf never reads a statement for meaning (D3). This matches the arch principle "Facts in core, judgement in the prompt" and its "Reconciliation is judgement" consideration. The guide owns the prompt wording, and a missing prompt fails with the existing error and has no fallback. That matches "Guide owns content, cf owns logic".

### [PASS] Additive and reversible; resolution identity matches arch

The key is guide rule basename plus project source path, with no heading text or hash. This meets the arch statement "keyed by rule file identity, never heading text". The slice writes only inside the managed block. With no resolutions file the output is byte-identical to today's. D1 handles the #123 coordination with a single `delivered(rule, target)` predicate and a recorded identity constraint. The arch said "Sequenced with #123", and the slice doesn't depend on #123 landing first.

### [CONCERN] Design is heavier than the slice plan's three success criteria require

The plan asks for three things: conflicts listed for PM decision, resolutions that persist across `setup-ide` re-runs, and resilience to guide wording changes. The slice adds mechanism beyond that. Each of these can be cut or deferred:
- **`cf rules remove`.** It adds a command and the id-reuse and duplicate-id-after-merge handling. `remove` is not needed to meet the criteria. The PM can edit the JSON, and the design already treats a hand-edit as the stale-identity remedy in walkthrough step 7.
- **Sequential ids.** A file-pair key plus a statement would do. The ids exist only for `remove` and for output. They bring max+1 reuse, duplicate-id failure after a git merge, and a manual renumbering step, all of which the Concurrency paragraph has to explain.
- **Per-target filtered rendering.** `delivered()` is computed per target, and `--json` lists `targets` per rule. The slice itself says `delivered()` reduces to "alwaysApply reaches every composite" plus scoped-rule exclusion. A simpler first cut renders every non-excluded resolution in every composite.
- **Stale-source warning for a missing `projectSource`.** Its only purpose is to warn about a case that still renders correctly.

I recommend dropping `remove` and the ids (or deferring them to #125 alongside `dismissed`), which also shrinks D5. Keep the rest of the validation, since the marker-injection checks protect `managedState`.

### [CONCERN] Copilot target extends scope beyond the arch's named files

The arch's current-state section frames the problem as CLAUDE.md and AGENTS.md. The slice adds `.github/copilot-instructions.md` as a third composite. The reasoning is sound, because the same always-on rules compile there. It is still a widening of the scope the arch names. The design says it costs no extra code, but it does add a third target to the per-target tests, to the `delivered()` predicate and to the walkthrough. Either note the extension against the arch or record it as a deliberate scope clarification. It should not remain an inline justification only.

### [CONCERN] Inventory command duplicates data the agent already receives from 261 and the prompt can derive

The arch says detection reports "rule files present" once, in core ("One detection, many consumers"). D6 and the Prerequisites section deliberately build a second, independent candidate list (`ruleInventory.ts`) and state that there is no shared constant and no consistency test. Two lists can disagree. The agent could then be routed by 261's facts to reconciliation and be handed an inventory that omits a file 261 reported, or the reverse. The justification that "drift can't break either slice" is true for the code. It is not true for the user-visible result. The cheaper option is for 266 to derive its candidates from 261's list and add only the composite block range. If separate lists are kept, add a single test asserting that every 261 path is in 266's list, which is a one-line check.

### [CONCERN] Release coupling to an unpublished guide prompt has no tracked acceptance gate

The arch's Dependencies section records a minimum guide version for each cf release. Its listing of pending guide work covers only the retroactive-marker rule and does not name the reconciliation prompt. The slice says the minimum version is recorded "once ai-project-guide publishes it". The Integration Requirement "the guide's prompt can drive the whole loop" cannot be verified until that happens. State where this lands in the arch's Dependencies list, and mark that success criterion as verified at integration. The walkthrough already covers the interim path by running `resolve` by hand.

### [NOTE] Failure modes for the new I/O paths are enumerated

Write/rename failure, unreadable candidate, binary files, concurrent writes, malformed JSON, and recorded-but-not-applied are each given explicit handling. The lock-free concurrency is acknowledged as unsupported, with the duplicate-id merge case spelled out. No arch NFR applies to this path, so no restatement is needed.

### [NOTE] Dependency direction is correct

Core owns the persisted format. The cli's `ideInstall` owns inventory and rendering, because that is where manifests and compilers live. Nothing in core depends on cli. The MCP exclusion is stated and left as future work.

### Run Digest

- Response length: 6768 chars
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
- Tokens — prompt / cached / cache write / completion / reasoning: 175359 / 89303 / 86050 / 2692 / not computed
- Duration: 25.3 s
- Cost: $0.38 (provider)
- `## Summary` located: yes
- `## Findings` located: yes
- Finding-shaped matches — whole response: 8
- Finding-shaped matches — inside fences: 0
- Finding-shaped matches — in findings section: 8
- Finding-shaped matches — surviving validation: 8
