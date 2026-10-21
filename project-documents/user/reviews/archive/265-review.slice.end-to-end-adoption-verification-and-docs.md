---
docType: review
layer: project
reviewType: slice
slice: end-to-end-adoption-verification-and-docs
conventionsSource: AGENTS.md
projectRules: []
project: context-forge
verdict: CONCERNS
verdictSource: stated
sourceDocument: project-documents/user/slices/265-slice.end-to-end-adoption-verification-and-docs.md
aiModel: claude-sonnet-5-5
aiProfile: sdk
status: complete
dateCreated: 20261020
dateUpdated: 20261020
reviewedSha: 5870dea2474fd3cf8dc849132012ce3db3c6d6c8
toolsGiven: [read_file, list_files, grep]
toolCallsMade: 3
turns: 4
promptTokens: 208524
cachedTokens: 175229
cacheWriteTokens: 33289
completionTokens: 3003
durationSeconds: 30.8
costUsd: 0.15162
costBasis: provider
runId: run-20261020-slices-plan-a67cc35b
squadronVersion: 0.23.5
findings:
  - id: F001
    severity: pass
    category: architecture-alignment
    summary: "Alignment with architecture and ownership boundaries"
    location: "project-documents/user/slices/265-slice.end-to-end-adoption-verification-and-docs.md#Technical Decisions"
  - id: F002
    severity: concern
    category: proportionality
    summary: "Overweight design: documentation scope exceeds what the plan entry assigns"
    location: "project-documents/user/slices/265-slice.end-to-end-adoption-verification-and-docs.md#D8 — Documentation"
  - id: F003
    severity: concern
    category: proportionality
    summary: "Overweight design: exhaustive 10-item check list repeated per run, plus a tool-parity side-check"
    location: "project-documents/user/slices/265-slice.end-to-end-adoption-verification-and-docs.md#D4 — Pass checks per run"
  - id: F004
    severity: concern
    category: proportionality
    summary: "D3 pre-261 baseline worktree adds a heavy mechanism for a thin regression claim"
    location: "project-documents/user/slices/265-slice.end-to-end-adoption-verification-and-docs.md#D3 — Run order and greenfield baseline"
  - id: F005
    severity: concern
    category: error-handling
    summary: "Failure modes for the live-agent runs are not enumerated"
    location: "project-documents/user/slices/265-slice.end-to-end-adoption-verification-and-docs.md#Risk Assessment"
  - id: F006
    severity: concern
    category: dependency
    summary: "MIN_GUIDE_VERSION bump depends on an unnamed guide release and conflicts with the greenfield claim"
    location: "project-documents/user/slices/265-slice.end-to-end-adoption-verification-and-docs.md#D6 — Raise `MIN_GUIDE_VERSION` to the marker-rule release"
  - id: F007
    severity: concern
    category: under-specification
    summary: "Verification Walkthrough carries hard-coded mechanics that can drift"
    location: "project-documents/user/slices/265-slice.end-to-end-adoption-verification-and-docs.md#Verification Walkthrough"
  - id: F008
    severity: note
    category: dependency
    summary: "Consumes-from-other-slices contract is \"as built,\" not pinned"
    location: "project-documents/user/slices/265-slice.end-to-end-adoption-verification-and-docs.md#Consumes from Other Slices"
  - id: F009
    severity: note
    category: nfr
    summary: "Squadron-path NFRs"
    location: "project-documents/user/slices/265-slice.end-to-end-adoption-verification-and-docs.md#Technical Scope"
---

# Review: slice — slice 265

**Verdict:** CONCERNS
**Model:** claude-sonnet-5-5

## Findings

### [PASS] Alignment with architecture and ownership boundaries

D5 sends guide-prompt defects to ai-project-guide and squadron defects to squadron, and says cf never works around either. This matches "Guide owns content, cf owns logic" and "Use squadron by capability." The squadron run checks `surfaces` instead of naming a surface, as the architecture requires. The greenfield baseline and the retroactive-marker checks (checks 6, 7, 10) follow the arch's retroactive-artifact and gate-skip rules. The slice adds no component and no dependency.

### [CONCERN] Overweight design: documentation scope exceeds what the plan entry assigns

The plan entry asks for docs on the adoption flow, the override, the adoption state and Adoption Facts, "in the README and CLI references". D8 adds four more things:
- A `docs/REVIEW-GATING.md` subsection.
- A `docs/TOOLS.md` change.
- A "Review Gating" sentence in the README.
- A rewrite of the Get Started guide-minimum sentence.

The `docs/REVIEW-GATING.md` update is justified, because the arch says the 240 gate rule is amended and that document is the gate's reference. The README paragraph in "Adopting an Existing Codebase" is also a long enumeration that restates the 261–264 designs (the probe contents, the state values, the planned-project rule). Cut it to the user-facing flow, the override and a link. Keep exact values in the config table and the CLI reference.

### [CONCERN] Overweight design: exhaustive 10-item check list repeated per run, plus a tool-parity side-check

The slice has to show that the parts compose. Several D4 checks instead re-verify behavior that slices 261–264 already cover with fixtures:
- Check 4 compares MCP prompt text with `cf build` output.
- Check 7 retests `cf check` rule outputs.
- Check 10 retests the `✓ retroactive` rendering.
- The `workflow_next` parity in check 9 also re-tests earlier slices.

Keep one composed pass per path, which is checks 1, 2, 5, 6, 8 and 9. Treat the rest as spot checks recorded in the report only when they fail. This keeps the report and the verification effort at the Effort 2/5 the plan assigns.

### [CONCERN] D3 pre-261 baseline worktree adds a heavy mechanism for a thin regression claim

The greenfield check builds the entire monorepo at a historical commit in a separate worktree (`pnpm install` and `pnpm -r build`) to diff `cf build` and `cf next --json`. A lighter option meets the requirement. The greenfield selection path is already covered by 261's fixtures, and the run needs only to show no Adoption Facts section, `adoption.state` unset, and the concept prompt selected. Defer the byte-diff against the old build unless a run shows a greenfield difference.

### [CONCERN] Failure modes for the live-agent runs are not enumerated

D2 and Risk Assessment cover agent variance (repeat the run once) and missing prerequisites (`BLOCKED:`). The design does not say what happens when:
- A headless `claude -p` session hangs or stalls without finishing a step.
- The session dies mid-run, for example on a context or token limit.
- The `/understand` step times out or fails partway through.
- The squadron probe exits non-zero. The arch says cf treats that as "squadron unavailable", and the squadron run should record it as a finding, not a silent pass.

Because `adoption.state` persists, a run can resume, but the design should say so and give a bound for how long a run may stall. A line for each case in D2 is enough.

### [CONCERN] MIN_GUIDE_VERSION bump depends on an unnamed guide release and conflicts with the greenfield claim

The arch lists the marker rule as "Still pending", and 263 is meant to hand off its specification. The design correctly refuses to write a version ahead of the release. The slice's plan scope, however, includes a code change (D6) and a README change that cannot be made until an external release exists, and the slice is not in a mergeable state until then. The only recorded handling is a `BLOCKED:` line. Also, D6 says greenfield "runs fine on either version", yet raising the minimum makes every greenfield user on v0.22.2 see a `cf build` warning. The arch's guide-release-coupling paragraph does not endorse that. Say that this warning behavior is accepted, or drop D6 and have 263 or the release own the bump.

### [CONCERN] Verification Walkthrough carries hard-coded mechanics that can drift

The walkthrough hard-codes `npm create vite@latest ... --template react-ts`, `git worktree add /tmp/cf-pre261 <commit>`, and a `sed` range expression for extracting the Adoption Facts section (`/### Adoption Facts/,/^### [^A]/p`). That `sed` range depends on the formatting of the next heading, which is brittle, and `[^A]` would fail to terminate on a following heading that starts with "A". Describe what to extract and leave the extraction to the operator. The commit before slice 261 merged is also left as a placeholder. Name how the operator finds it.

### [NOTE] Consumes-from-other-slices contract is "as built," not pinned

"Where the code differs from a design, the code and the run decide" is reasonable for an integration slice. It does mean the slice's own checks (for example "never 'Advance to Phase 1'" and the exact `register-plan` command) bind to wording defined in 264. Confirm those strings against 264's final design before the task breakdown.

### [NOTE] Squadron-path NFRs

The parent architecture states no latency or throughput NFR for the paths this slice touches. No NFR restatement is needed.

### Run Digest

- Response length: 7156 chars
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
- Tokens — prompt / cached / cache write / completion / reasoning: 208524 / 175229 / 33289 / 3003 / not computed
- Duration: 30.8 s
- Cost: $0.15 (provider)
- `## Summary` located: yes
- `## Findings` located: yes
- Finding-shaped matches — whole response: 9
- Finding-shaped matches — inside fences: 0
- Finding-shaped matches — in findings section: 9
- Finding-shaped matches — surviving validation: 9
