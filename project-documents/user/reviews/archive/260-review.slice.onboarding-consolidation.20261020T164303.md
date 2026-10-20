---
docType: review
layer: project
reviewType: slice
slice: onboarding-consolidation
conventionsSource: AGENTS.md
projectRules: []
project: context-forge
verdict: CONCERNS
verdictSource: stated
sourceDocument: project-documents/user/slices/260-slice.onboarding-consolidation.md
aiModel: claude-sonnet-5-5
aiProfile: sdk
status: complete
dateCreated: 20261020
dateUpdated: 20261020
reviewedSha: 4aad831c214e9f7431eb36880b4c6862d25c1802
toolsGiven: [read_file, list_files, grep]
toolCallsMade: 2
turns: 3
promptTokens: 94556
cachedTokens: 8865
cacheWriteTokens: 85687
completionTokens: 6894
durationSeconds: 64.3
costUsd: 0.413314
costBasis: provider
runId: run-20261020-p4-a29a218f
squadronVersion: 0.23.3
findings:
  - id: F001
    severity: pass
    category: architectural-alignment
    summary: "Onboarding scope matches the arch's \"setup, then hand off\" decision"
    location: "project-documents/user/slices/260-slice.onboarding-consolidation.md#D3 — Recipe content: setup, then hand off"
  - id: F002
    severity: concern
    category: interface-contract
    summary: "`recognizeCi` scope conflicts with the arch's project-folder detection rule, and `matches` is ambiguous"
    location: "project-documents/user/slices/260-slice.onboarding-consolidation.md:164-177"
  - id: F003
    severity: concern
    category: interface-contract
    summary: "`recognizeCi` is declared async but the conventions say detection is synchronous, and `getNext`'s signature is not addressed"
    location: "project-documents/user/slices/260-slice.onboarding-consolidation.md:209, 236, 190"
  - id: F004
    severity: concern
    category: error-handling
    summary: "An I/O failure in the optional offer can break `cf next` and `workflow_next`"
    location: "project-documents/user/slices/260-slice.onboarding-consolidation.md:190-197, 209"
  - id: F005
    severity: concern
    category: proportionality
    summary: "Stack gating copies guide knowledge into cf and is heavier than the requirement needs"
    location: "project-documents/user/slices/260-slice.onboarding-consolidation.md:179-185"
  - id: F006
    severity: concern
    category: dependency
    summary: "Greenfield behavior now depends on a guide version, and the slice has no enforcement or consistent minimum"
    location: "project-documents/user/slices/260-slice.onboarding-consolidation.md:66-68, 268"
  - id: F007
    severity: note
    category: scope
    summary: "Smaller consistency points"
    location: "project-documents/user/slices/260-slice.onboarding-consolidation.md:6-9, 226, 263"
---

# Review: slice — slice 260

**Verdict:** CONCERNS
**Model:** claude-sonnet-5-5

## Findings

### [PASS] Onboarding scope matches the arch's "setup, then hand off" decision

The recipe is registration check, then `cf init` or the MCP fallback, then a handoff to `cf build` / `context_build`. It drops the concept opener, the later-phase note and the `/setup-ci` offer. This is the arch's "Onboarding: setup, then hand off" section and the first anticipated slice. The slice does not add detection or adoption state, which stay with 261. The source lives in core, which both the CLI and the MCP server can depend on, so dependency directions are correct. The "Excluded" list is disciplined: it leaves the installer, `cf build` output and other commands alone.

### [CONCERN] `recognizeCi` scope conflicts with the arch's project-folder detection rule, and `matches` is ambiguous

The arch says detection "is scoped to the project's own folder, so a CF project in a monorepo subdirectory is judged on that folder." D4 deliberately checks `projectPath` and the git top-level. That is sensible for CI, but it is a departure from the arch rule. Slice 261 will reuse `recognizeCi` for the detection report's CI fact, and the slice never says whether 261 should take the widened scope. The `matches` contract is also under-specified:
- Paths are "relative to the directory they were found in", but the result does not say which directory that was.
- When both roots contain a match, a consumer cannot tell them apart.
- The doc does not say whether `projectPath` equal to the top-level is checked once.

Fix: state the widening as a deliberate exception to the arch rule. Either return root-qualified matches or add a `root` field per match, so 261 can report accurately.

### [CONCERN] `recognizeCi` is declared async but the conventions say detection is synchronous, and `getNext`'s signature is not addressed

"Patterns and Conventions" says detection functions are "synchronous filesystem checks, except for the one `git rev-parse` call". The API contract makes `recognizeCi` return `Promise<CiRecognition>` and `detectStacks` synchronous. The data flow puts both inside `evaluateSetupCiOffer`, which `getNext` calls. D6 turns `getNext` into a wrapper but never says whether it, or its callers (`cf next` and `workflow_next`), become async. If `getNext` is synchronous today, this is a ripple the design hides. The slice should state the sync/async shape of `evaluateSetupCiOffer` and `getNext` explicitly. It should also say whether "existing navigator tests that construct it without config" still compile.

### [CONCERN] An I/O failure in the optional offer can break `cf next` and `workflow_next`

D6 says the offer "must never displace the workflow's next step". The conventions say detection "throw[s] on unexpected I/O errors". `evaluateSetupCiOffer` runs inside `getNext` on every call. An unreadable `.github/` directory, a failing `git rev-parse`, or a git "dubious ownership" error would therefore make the core navigation command fail because of a purely advisory feature. Two things are unspecified:
- How "not a git repository" is told apart from other `rev-parse` failures. The doc calls the non-git case "the correct scope, not a fallback", but a git error is not the same as a non-git directory.
- What happens to `cf next` when offer evaluation throws.

Only the non-boolean config error is intentionally fatal. The design should say which failures abort `cf next` and which drop the offer with a visible diagnostic. An unreadable-directory test case is also missing from the unit-test list.

### [CONCERN] Stack gating copies guide knowledge into cf and is heavier than the requirement needs

The arch asks that the `/setup-ci` offer move to `cf next` and that CI recognition stop keying on one filename. The old offer had no stack gate. D5 adds a `SETUP_CI_STACKS` table and a `detectStacks` module that copy the guide's `setup-ci` detection table. The arch principle is "Guide owns content, cf owns logic". Here cf hard-codes which languages the guide supports, and the only protection against drift is a code comment. When the guide adds a baseline, the offer will silently fail to appear for that stack, with no test or version check to catch it. The stated reason, avoiding a dead end, is weak. For an unsupported stack the skill "says so and stops", and the user already has the decline key.

Cut `stackDetection.ts` and offer when there is no CI and no release skill. If the stack gate stays, say how it is kept in sync with the guide. Also define the message when both stacks are present, because "this {stack} project" has no single value.

### [CONCERN] Greenfield behavior now depends on a guide version, and the slice has no enforcement or consistent minimum

The first design goal is that greenfield behaves as it does today. After this slice, the concept conversation starts only if the installed guide's concept prompt opens it (guide v0.22.0 and later). The slice relies on "the declared minimum guide version, not a runtime check", but no task in scope declares or enforces that minimum. The prerequisite also says ≥ v0.22.0, while the arch and the recent commits set the minimum to v0.22.1. A user who updates cf but keeps an older installed guide would get a silent regression. The agent runs setup and then `cf build`, and no one asks what to build.

Fix: align the version number with the arch. Name the mechanism that declares the minimum, or add a lightweight check, such as a documented note in the onboarding or release notes. Also say how the installed guide gets updated.

### [NOTE] Smaller consistency points

- Frontmatter `interfaces` lists 261 and 265, but "Provides to Other Slices" also names 264. Item 264 is described as "doesn't need it", so the general `offers` channel is speculative. The channel is justified by `setup-ci` alone, so drop the 264 line or the framing.
- D3 and the behavior verification claim that a registered project in a later phase lands in the right phase through `cf build`. Previously the agent suggested `cf next`. The doc does not show that `cf build` with no arguments works for phases that need a slice or task context. Walkthrough step 3 covers only the greenfield case, so add a mid-project run, or soften the claim.

### Run Digest

- Response length: 7069 chars
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
- Tokens — prompt / cached / cache write / completion / reasoning: 94556 / 8865 / 85687 / 6894 / not computed
- Duration: 64.3 s
- Cost: $0.41 (provider)
- `## Summary` located: yes
- `## Findings` located: yes
- Finding-shaped matches — whole response: 7
- Finding-shaped matches — inside fences: 0
- Finding-shaped matches — in findings section: 7
- Finding-shaped matches — surviving validation: 7
