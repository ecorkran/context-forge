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
reviewedSha: 65630546a631e51cbc48115c666d357729cb5ecc
revision_number: 1
toolsGiven: [read_file, list_files, grep]
toolCallsMade: 6
turns: 7
promptTokens: 335408
cachedTokens: 246426
cacheWriteTokens: 88972
completionTokens: 5927
durationSeconds: 59.6
costUsd: 0.440552
costBasis: provider
runId: run-20261020-p4-a29a218f
squadronVersion: 0.23.3
findings:
  - id: F001
    severity: pass
    category: architecture-alignment
    summary: "Onboarding reduced to setup plus handoff; no methodology left in the recipe"
    location: "project-documents/user/slices/260-slice.onboarding-consolidation.md#D3 — Recipe content: setup, then hand off"
  - id: F002
    severity: pass
    category: dependency-direction
    summary: "Dependency directions and single-source placement are correct"
    location: "project-documents/user/slices/260-slice.onboarding-consolidation.md#D1 — The single source is a TypeScript module in core with a typed surface table"
  - id: F003
    severity: concern
    category: proportionality
    summary: "Design is heavier than a Low-risk, 2/5-effort slice plan entry"
    location: "project-documents/user/slices/260-slice.onboarding-consolidation.md#D6 — The offer is an additive `offers` field on NextAction with a stable id"
  - id: F004
    severity: concern
    category: architecture-alignment
    summary: "CI repository-root exception conflicts with the arch's project-folder scoping and is not reconciled upstream"
    location: "project-documents/user/slices/260-slice.onboarding-consolidation.md#D4 — CI recognition covers several providers and any GitHub workflow filename"
  - id: F005
    severity: concern
    category: hidden-dependencies
    summary: "\"Stack detected\" is defined here by a manifest list that slice 261's detection report may define differently"
    location: "project-documents/user/slices/260-slice.onboarding-consolidation.md#D5 — \"A stack is detected\" means any build manifest exists"
  - id: F006
    severity: note
    category: consistency
    summary: "Slice plan lists guide minimum v0.22.0; the arch and this design use v0.22.1"
    location: "project-documents/user/slices/260-slice.onboarding-consolidation.md#Prerequisites"
  - id: F007
    severity: pass
    category: error-handling
    summary: "Failure modes for new I/O paths are enumerated"
    location: "project-documents/user/slices/260-slice.onboarding-consolidation.md#D6 — The offer is an additive `offers` field on NextAction with a stable id"
  - id: F008
    severity: pass
    category: architecture-alignment
    summary: "Guide boundary and greenfield behavior preserved"
    location: "project-documents/user/slices/260-slice.onboarding-consolidation.md#Dependencies"
---

# Review: slice — slice 260

**Verdict:** CONCERNS
**Model:** claude-sonnet-5-5

## Findings

### [PASS] Onboarding reduced to setup plus handoff; no methodology left in the recipe

D3 matches the arch's Envisioned State. Registration check, `cf init` or the MCP fallback, then `cf build` / `context_build`. The concept opener, the "later phase" note and the `/setup-ci` offer are dropped. Brownfield routing therefore stays inside `cf build`, which is what slice 261 expects. Excluded scope (detection, adoption state, `cf build` output) respects the 261 boundary.

### [PASS] Dependency directions and single-source placement are correct

Core owns the recipe. The CLI and MCP server both depend on core, and neither depends on the other. Navigator → `detection/` → `ConfigManager` flows downward. The offer logic is kept out of the over-1000-line `WorkflowNavigator.ts`. The migration table shows consumer changes limited to `agentOnboardTool.ts`, `next.ts` and the `workflow_next` description. A grep of `packages/` finds `setup-ci`, `ONBOARD_GUIDE` and `cf-onboard` only in the three files being replaced, so there are no hidden copies.

### [CONCERN] Design is heavier than a Low-risk, 2/5-effort slice plan entry

The slice plan entry is Risk Low and Effort 2/5. Its stated deliverables are one source, a drift test, an offer on `cf next` once a stack is detected, and recognition of CI under another name. The design adds mechanisms that go past those deliverables or serve no consumer yet:
- **Filesystem-error-to-warning path.** `evaluateSetupCiOffer` catches any error carrying a Node `code` except `ENOENT`/`ENOTDIR`, returns `{ offer: null, warning }`, and the navigator appends it to `warnings`. Together with the `SetupCiOfferResult` wrapper, a typed catch and its own test, this is a new failure channel for an advisory hint. Cut it and let the check treat "cannot read" as "not recognized", or let the error propagate as the design already does for "any other error". Either way, one rule would cover all I/O errors instead of two.
- **Throw on a non-boolean `workflow.setup_ci_offer`.** This lets an advisory feature fail the primary navigation command. `ConfigKeys` already declares the key as boolean, so check whether `cf config set` rejects other types. If it does, the throw path guards only hand-edited config and its test can be dropped.
- **`CiMatch { root, path }` reporting.** Slice 261 does not require this yet, and the design itself says 261 "can report each match". Return `{ recognized }` plus the matched path, and extend it when 261 needs the location.
- **`NextOfferId` as a union with one member, a `declineCommand` field, and a three-profile `OnboardSurfaceProfile` table.** The surface table is justified by three real surfaces. The one-member union and the per-offer `declineCommand` could be a constant until a second offer exists.
- **Three README edits plus a CHANGELOG entry.** One onboarding section and one config-key line would meet the requirement.

None of these is wrong on its own. Together they exceed what the plan entry sizes, so the effort estimate or the scope should be revisited.

### [CONCERN] CI repository-root exception conflicts with the arch's project-folder scoping and is not reconciled upstream

The arch states "Detection is scoped to the project's own folder, so a CF project in a monorepo subdirectory is judged on that folder." D4 deliberately overrides this for CI by walking up to the nearest `.git` ancestor. The reasoning is sound: CI configs live at the repository root. But the exception exists only in this slice doc. The arch and slice 261's design inputs still say project-folder scope for every signal. Slice 261's own success criteria call for "a monorepo subdirectory" case. Without a note in the arch or the slice plan, 261 can reasonably reimplement CI detection folder-scoped. Add the CI exception to the arch's detection description, or record it in the 261 interface notes. The slice design also needs to say who owns the exception once 261's report consumes `recognizeCi`.

### [CONCERN] "Stack detected" is defined here by a manifest list that slice 261's detection report may define differently

`BUILD_MANIFESTS` is private to `setupCiOffer.ts`. The arch's principle is "One detection, many consumers," with no surface carrying its own heuristic. The 261 report will have a source-volume signal that also answers "does this project have code". Two definitions of "has code" will then coexist in core, and the arch's single-decision principle is stretched. The slice plan phrase "once a stack is detected" supports a local definition for this slice. The design should still state that 261 either reuses or replaces `hasBuildManifest`, so it doesn't become a second heuristic. A one-line ownership note in Integration Points would suffice.

### [NOTE] Slice plan lists guide minimum v0.22.0; the arch and this design use v0.22.1

The slice plan entry for this slice says "Guide ≥ v0.22.0 for the concept-prompt opener". The arch Dependencies section and this design say v0.22.1. Recent commit history shows the minimum was raised to v0.22.1. The design is consistent with the arch. The plan entry's wording is stale and should be aligned.

### [PASS] Failure modes for new I/O paths are enumerated

Each new path has an explicit handling rule:
- Missing files mean "not present".
- Unreadable CI directories are covered by the warning path.
- Config errors are covered by the throw rule.
- Missing `ConfigManager` or `projectPath` skips the offer.
- Rendered-file drift is caught by the byte-for-byte test, which names the file and the regenerate command.
- Rejecting `git rev-parse` in favor of a `.git` entry check avoids the process-spawn failure modes.

The design states no NFR for `cf next` latency. The parent arch has none for this path, so none is required.

### [PASS] Guide boundary and greenfield behavior preserved

Prompt content stays in the guide. The opener now comes from the concept prompt, and the slice does not add a runtime guide check or any fallback to another prompt. The CHANGELOG and README state the minimum plus `cf guides update`. The arch calls for greenfield flow to be unchanged, and the Behavior verification section confirms setup then concept question in the same order. It also names the one behavior change: a registered project in a later phase now runs `cf build` instead of being told to suggest `cf next`.

### Run Digest

- Response length: 7963 chars
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
- Tokens — prompt / cached / cache write / completion / reasoning: 335408 / 246426 / 88972 / 5927 / not computed
- Duration: 59.6 s
- Cost: $0.44 (provider)
- `## Summary` located: yes
- `## Findings` located: yes
- Finding-shaped matches — whole response: 8
- Finding-shaped matches — inside fences: 0
- Finding-shaped matches — in findings section: 8
- Finding-shaped matches — surviving validation: 8
