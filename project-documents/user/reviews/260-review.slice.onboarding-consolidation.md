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
reviewedSha: 81bd9ed80e8c3fa8f06d670a1030e31e06216f6f
revision_number: 2
toolsGiven: [read_file, list_files, grep]
toolCallsMade: 5
turns: 6
promptTokens: 176993
cachedTokens: 88784
cacheWriteTokens: 88203
completionTokens: 6194
durationSeconds: 53.7
costUsd: 0.424374
costBasis: provider
runId: run-20261020-p4-a29a218f
squadronVersion: 0.23.3
findings:
  - id: F001
    severity: concern
    category: error-handling
    summary: "An optional CI offer can take down `cf next` and `workflow_next`"
    location: "project-documents/user/slices/260-slice.onboarding-consolidation.md#D6 — The offer is an additive `offers` field on NextAction with a stable id"
  - id: F002
    severity: concern
    category: architecture-alignment
    summary: "A second \"has code\" heuristic arrives ahead of slice 261, with only a prose promise to remove it"
    location: "project-documents/user/slices/260-slice.onboarding-consolidation.md#D5 — \"A stack is detected\" means any build manifest exists"
  - id: F003
    severity: concern
    category: architecture-alignment
    summary: "Greenfield behavior silently depends on the installed guide version, and the document accepts the regression"
    location: "project-documents/user/slices/260-slice.onboarding-consolidation.md#Prerequisites"
  - id: F004
    severity: note
    category: architecture-alignment
    summary: "`setupCiOffer.ts` is offer policy placed in the `detection/` module"
    location: "project-documents/user/slices/260-slice.onboarding-consolidation.md#Component Structure"
  - id: F005
    severity: note
    category: scope
    summary: "Scope is proportionate; the config key and `offers` field are justified additions"
    location: "project-documents/user/slices/260-slice.onboarding-consolidation.md#D7 — A shared config key records \"don't ask again\""
  - id: F006
    severity: pass
    category: architecture-alignment
    summary: "Boundaries, dependencies and integration points match the architecture"
    location: "project-documents/user/slices/260-slice.onboarding-consolidation.md#Integration Points"
---

# Review: slice — slice 260

**Verdict:** CONCERNS
**Model:** claude-sonnet-5-5

## Findings

### [CONCERN] An optional CI offer can take down `cf next` and `workflow_next`

D6 says any I/O error other than "file missing" propagates, with no separate failure channel. D6 also rejects letting the offer displace the recommendation, because "CI is optional, and it must never displace the workflow's next step." The two rules conflict.

The failure rule is justified as matching "the files `cf next` already reads." But `recognizeCi` reads outside the project folder: it walks ancestors looking for `.git` and scans the repository root's CI paths. Those are new I/O paths with new error classes:
- permission errors on an ancestor directory
- `.github/workflows` existing as a file, which gives `ENOTDIR`
- a broken symlink
- an unreadable `.git` entry

Each of these would make `getNext` throw. `cf next` would fail, and so would the MCP `workflow_next` tool, over an advisory message.

The design should either:
- (a) state that this blast radius is intended, or
- (b) surface the error explicitly without failing the call, for example as a `warnings` entry naming the path and error. That is still explicit and not a silent fallback.

Option (b) fits better with the "never displace the next step" rationale. The failure cases to enumerate are the ancestor walk, the root scan and the manifest check. The unit-test list covers none of them.

### [CONCERN] A second "has code" heuristic arrives ahead of slice 261, with only a prose promise to remove it

The architecture's principle is "One detection, many consumers... No surface carries its own heuristic," and it assigns source detection to the detection report in slice 261. D5 adds `BUILD_MANIFESTS` and a private `hasBuildManifest` as cf's own "has code" signal. D5 puts it in the `detection/` module that 261 is meant to own.

The design admits this overlap. Integration Points says 261 "takes over `BUILD_MANIFESTS`... or replaces it," and that `hasBuildManifest` "is deleted." That cleanup is a commitment on another slice, and 261's scope is not visible from this document. If 261 skips it, core ends up with two divergent definitions of "has code", one for the offer and one for brownfield detection. A greenfield scaffold with a `package.json` could then be a "no code" project to 261 and a "has stack" project to the offer.

Pick one of these:
- record the removal as an explicit item in 261's scope, or
- make `hasBuildManifest` an exported, documented function with one named owner so 261 reuses it, as it does `recognizeCi`.

The second is the lighter option.

### [CONCERN] Greenfield behavior silently depends on the installed guide version, and the document accepts the regression

The architecture's first design goal is "Greenfield behaves the same," and its release-coupling section says the concept-prompt opener must exist because "onboard no longer does" open the conversation. This slice removes the opener from all three recipes. It adds no check that the installed guide has the new opener. It handles the gap with a README note, and says that with an older guide "nobody asks the opening question until the user speaks."

The failure is silent, which the project's own principle ("fail explicitly") discourages. An existing project that upgrades cf but not its guide loses the first prompt with no warning. The affected case is narrow: `cf init` installs the current guide, and registered projects skip to `cf build`. Still, the design should say why a silent regression is acceptable, or spell out what the agent does in that case. One option is a one-line instruction in step 3 telling the agent to ask what the user wants to build if the returned prompt has no opening question. That would restore greenfield parity without a runtime version check. At minimum, give a reason for accepting the regression that goes beyond "README documents it."

### [NOTE] `setupCiOffer.ts` is offer policy placed in the `detection/` module

The architecture says core reports facts and maps them to an outcome. `ciDetection.ts` is a fact and belongs in `detection/`. `evaluateSetupCiOffer` combines a config flag, facts and a release-skill check into a navigation message. It sits next to what 261 will treat as the home of the detection report. Moving it next to `WorkflowNavigator` (for example `introspection/`) would keep `detection/` limited to facts and match 261's expectations of that module. No action is required to proceed.

### [NOTE] Scope is proportionate; the config key and `offers` field are justified additions

The architecture only says the `/setup-ci` offer moves to `cf next`. The design adds a new `offers` field and a new config key. Both are justified: `cf next` runs constantly, and agents keep no memory across sessions. The rejected alternatives in D2, D4 and D6 show the lighter options were considered. The eight CI signatures and ten build manifests are plain constants and are cheap. I see nothing that has to be cut.

### [PASS] Boundaries, dependencies and integration points match the architecture

- **Shared source:** the single source lives in core. The CLI and the MCP server both consume it, and neither depends on the other.
- **No methodology in onboarding:** the recipe contains no brownfield or phase logic. That leaves 261 free to route inside `cf build`.
- **CI exception:** the repository-root exception for CI is recorded explicitly. It also appears in the architecture's detection section, where `recognizeCi` is named as its owner.
- **`getNext` wrapper:** the `getNext` to `computeNext` wrapper leaves the later brownfield-aware navigation slice a clean place to extend.
- **Installer and prune logic:** left unchanged, so no stale-entry removals.
- **NFRs:** the architecture states none for these paths, so none need restating.

### Run Digest

- Response length: 7330 chars
- Response is newline-free: no
- Tool calls made: 5
- Tool calls failed: 0
- Stop reason: end_turn
- Output budget: backend default
- System prompt: preset+append
- Settings sources: project
- Reasoning characters: 0
- Effort: backend default
- Turns: 6
- Tokens — prompt / cached / cache write / completion / reasoning: 176993 / 88784 / 88203 / 6194 / not computed
- Duration: 53.7 s
- Cost: $0.42 (provider)
- `## Summary` located: yes
- `## Findings` located: yes
- Finding-shaped matches — whole response: 6
- Finding-shaped matches — inside fences: 0
- Finding-shaped matches — in findings section: 6
- Finding-shaped matches — surviving validation: 6
