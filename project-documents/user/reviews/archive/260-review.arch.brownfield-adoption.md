---
docType: review
layer: project
reviewType: arch
slice: brownfield-adoption
targetKind: arch
rulesSource: project
conventionsSource: AGENTS.md
projectRules: []
project: context-forge
verdict: CONCERNS
verdictSource: stated
sourceDocument: project-documents/user/architecture/260-arch.brownfield-adoption.md
aiModel: claude-sonnet-5-5
aiProfile: sdk
status: complete
dateCreated: 20261020
dateUpdated: 20261020
reviewedSha: b906a07b6949f1e5db7a9f54a2a1c507d6997a70
toolsGiven: [read_file, list_files, grep]
toolCallsMade: 1
turns: 2
promptTokens: 83799
cachedTokens: 12780
cacheWriteTokens: 71015
completionTokens: 4855
durationSeconds: 44.0
costUsd: 0.334629
costBasis: provider
squadronVersion: 0.23.3
findings:
  - id: F001
    severity: concern
    category: completeness
    summary: "Retroactive marker is the load-bearing mechanism and is left undefined"
    location: "project-documents/user/architecture/260-arch.brownfield-adoption.md#Technical Considerations"
  - id: F002
    severity: concern
    category: consistency
    summary: "\"Already planned\" outcome breaks the resume-after-any-step guarantee"
    location: "project-documents/user/architecture/260-arch.brownfield-adoption.md#Envisioned State"
  - id: F003
    severity: concern
    category: completeness
    summary: "Where \"adopted\" state lives is never stated"
    location: "project-documents/user/architecture/260-arch.brownfield-adoption.md#Envisioned State"
  - id: F004
    severity: concern
    category: completeness
    summary: "Brownfield threshold and override are deferred, though both are load-bearing"
    location: "project-documents/user/architecture/260-arch.brownfield-adoption.md#Technical Considerations"
  - id: F005
    severity: concern
    category: consistency
    summary: "Consolidation decision is not reflected in the slices, and it conflicts with \"byte-identical greenfield\""
    location: "project-documents/user/architecture/260-arch.brownfield-adoption.md#Anticipated Slices"
  - id: F006
    severity: concern
    category: consistency
    summary: "Stale open item contradicts the approved split"
    location: "project-documents/user/architecture/260-arch.brownfield-adoption.md#Technical Considerations"
  - id: F007
    severity: concern
    category: dependencies
    summary: "Handoff sequencing is unclear, and it depends on unbuilt squadron work"
    location: "project-documents/user/architecture/260-arch.brownfield-adoption.md#Responsibility Split with Squadron (PM approved 20261020)"
  - id: F008
    severity: concern
    category: abstraction
    summary: "Conventions reconciliation persistence is underspecified and invites label-based identity"
    location: "project-documents/user/architecture/260-arch.brownfield-adoption.md#Envisioned State"
  - id: F009
    severity: concern
    category: completeness
    summary: "Index allocation and granularity for retroactive slices are unresolved but affect the squadron contract"
    location: "project-documents/user/architecture/260-arch.brownfield-adoption.md#Technical Considerations"
  - id: F010
    severity: concern
    category: antipattern
    summary: "Seven slices plus a shared-state marker is heavy for the stated need; mapping and reconciliation can be deferred"
    location: "project-documents/user/architecture/260-arch.brownfield-adoption.md#Anticipated Slices"
  - id: F011
    severity: note
    category: dependencies
    summary: "Guide-release coupling spans several unshipped guide artifacts"
    location: "project-documents/user/architecture/260-arch.brownfield-adoption.md#Technical Considerations"
---

# Review: arch — initiative 260

**Verdict:** CONCERNS
**Model:** claude-sonnet-5-5

## Findings

### [CONCERN] Retroactive marker is the load-bearing mechanism and is left undefined

The marker carries three requirements: it counts as complete for every "done" check, it is never treated as reviewed, and it is not the PM-only review exemption. The document gives it no representation (frontmatter field, plan-entry syntax, or both), says nothing about who may set it, and names no validation. Its own text says semantics and authority "need a decision before the slice plan slice is designed." Four things depend on it: the review gate (Current State), squadron's pipeline gates (split table, row d), squadron 364's "never sets the marker", and `cf next`. Nothing stops a new-work slice from being labelled retroactive to bypass the gate. The document names this risk ("must not become a loophole") but offers no mechanism against it. "Counts as complete but never reviewed" also contradicts the existing gate, which treats complete without review as a finding. Specify how the gate and checker distinguish the two, or say which arch (240 or 160) is amended.

### [CONCERN] "Already planned" outcome breaks the resume-after-any-step guarantee

Detection defines already planned as "the repo carries CF/SQ planning artifacts" and sends it to normal development with no brownfield path. The final line says a user "can stop after any of them and resume." After step 3, a repo holds a concept and nothing else. Re-running detection would classify it as already planned, so adoption never resumes. The guide profile claims "a re-run resumes from whatever artifacts exist", yet detection would route that re-run away from the brownfield profile. The document needs a persisted adoption state, or a rule such as "retroactive entries absent, so adoption is incomplete". It must also say what counts as a planning artifact. A lone squadron-generated concept is one case that needs a ruling.

### [CONCERN] Where "adopted" state lives is never stated

Step 8 says `cf next` "knows the project was adopted." Nothing says how. It could be a config key, a frontmatter flag on the slice plan, or the presence of retroactive entries. Ownership of this mutable state is a core design decision, and `WorkflowNavigator.detectFirstRunContext` has to read it. Adding persisted state also makes this a "changed file or state format", which the project conventions classify as a feature needing its own slice. It does not appear in the slice list.

### [CONCERN] Brownfield threshold and override are deferred, though both are load-bearing

"What counts as brownfield" states the problem and the asymmetric cost but gives no signals, thresholds, or override mechanism (flag, config key, or prompt). The detection report is "facts" (source volume, commit history, and so on). Something still has to map those facts to a three-way outcome, and the document never says where. It also does not consider shallow clones, repositories freshly squashed or imported with little history, or monorepos where the CF project is a subdirectory. The first slice cannot be designed without this.

### [CONCERN] Consolidation decision is not reflected in the slices, and it conflicts with "byte-identical greenfield"

The decided onboarding redesign has four parts:
- Render the three entry points from one source.
- Reduce them to setup plus "run `cf build`".
- Move the `/setup-ci` offer to `cf next`.
- Change the guide's concept prompt so it opens the conversation.

None of these is an anticipated slice. The first slice instead promises "Greenfield output stays byte-identical." Greenfield onboarding output necessarily changes under this redesign, because the Phase 0 text moves out of onboard and `/setup-ci` moves elsewhere. The Design Goals ("exactly today's flow") and the slice claim need restating as behavioral equivalence. The shared-source rendering and the `/setup-ci` move need slices of their own. Whether `cf build` is reachable from the MCP-only `agent_onboard` path is also unstated. That path is the reason the `project_create`/`guide_install` fallback exists.

### [CONCERN] Stale open item contradicts the approved split

The last Technical Considerations bullet says the CF/SQ split "has to be agreed before slice planning." The Responsibility Split section, marked PM approved 20261020, resolves that. The Unsettled cross-repo contract bullet also still describes the handoff as an open negotiation, while the table fixes the probe and entry point. A reader cannot tell which parts are settled. Delete or update both bullets.

### [CONCERN] Handoff sequencing is unclear, and it depends on unbuilt squadron work

Onboarding is now "setup, then `cf build` and follow it." The squadron flows (`/sq:analysis understand`, then concept 363) must run before the brownfield-adoption prompt for `fileComprehension` and `fileConcept` to resolve. The document does not say who offers squadron: the `cf build` prompt text, which would make the prompt hold handoff logic and conflict with "guide owns content", or core. It also does not say what happens when the user accepts, since the squadron flow runs in a different command and the adoption prompt must be re-entered afterward. The probe command and entry point (366) do not exist, and there is no fallback if the probe schema changes or `sq` is absent. "Squadron 366 should land before CF's handoff slice" creates a cross-repo ordering constraint that is not tracked as a dependency. Add a stated minimal contract (probe JSON schema, version field, behavior on unknown fields) and a decision on who offers.

### [CONCERN] Conventions reconciliation persistence is underspecified and invites label-based identity

"The resolution persists, so re-running `setup-ide` doesn't re-introduce it" needs three things pinned down:
- A durable storage location.
- A format.
- A stable identity for a rule or conflict pair.

The document specifies none of them, and `setup-ide` compiles rules by `alwaysApply`. Rule text and headings are user-accessible labels. The project's own conventions forbid using such labels as logical structure. Keying a resolution by heading text breaks when the guide edits that wording. There is also a boundary problem. Core "enumerates rule sources" while the semantic comparison is agent work, yet core must still enforce the stored resolution deterministically inside `setup-ide`. This is a new persisted format, and it is coupled to issue #123's split with no ordering committed. This is the heaviest slice and the least specified.

### [CONCERN] Index allocation and granularity for retroactive slices are unresolved but affect the squadron contract

"Index allocation … has to leave room for new work without colliding with it." Squadron 364 is already told that "Candidates are indexed after retroactive entries", so the index scheme is a cross-repo commitment with no CF-side rule. The document does not say whether retroactive slices take a reserved band or a count-derived range. The slice-plan slice cannot be designed without that rule, and neither can the handoff slice, since it shares the squadron contract. Granularity is acknowledged as a risk, but nothing sets a cap or an escape hatch such as a single coarse "existing system" entry.

### [CONCERN] Seven slices plus a shared-state marker is heavy for the stated need; mapping and reconciliation can be deferred

The goal is that `cf next` points at the first new work item after adoption. That needs detection and branching, the architecture and slice-plan baseline with the marker, and navigation. Conventions reconciliation (new persisted format, #123 coupling) and docs/ADR/CI mapping (links outside `project-documents/`, which the checker must tolerate, plus a `/setup-ci` rework) add the most risk and are not on that critical path. Mapping also bundles three unrelated things: docs, ADRs, and CI recognition. I recommend deferring reconciliation and mapping to a follow-on initiative, or at least splitting CI recognition from doc mapping. Ship them after the baseline works.

### [NOTE] Guide-release coupling spans several unshipped guide artifacts

The profile `brownfield-adoption`, the new `fileComprehension` variable, the concept-prompt opener change and removal of the stale `analyze-codebase` profile must all ship in ai-project-guide before the cf release that selects them. The profile prompt content is "pending PM approval." No fail-fast behavior is stated for a cf release that finds the profile missing. Per project rules it should raise an explicit error and not fall back to the greenfield prompt. State that explicitly. Separately, `fileComprehension` is resolved by filename convention (`{n}-analysis.codebase-comprehension.md`), which is a cross-repo naming dependency on squadron 362.

### Run Digest

- Response length: 10139 chars
- Response is newline-free: no
- Tool calls made: 1
- Tool calls failed: 0
- Stop reason: end_turn
- Output budget: backend default
- System prompt: preset+append
- Settings sources: project
- Reasoning characters: 0
- Effort: backend default
- Turns: 2
- Tokens — prompt / cached / cache write / completion / reasoning: 83799 / 12780 / 71015 / 4855 / not computed
- Duration: 44.0 s
- Cost: $0.33 (provider)
- `## Summary` located: yes
- `## Findings` located: yes
- Finding-shaped matches — whole response: 11
- Finding-shaped matches — inside fences: 0
- Finding-shaped matches — in findings section: 11
- Finding-shaped matches — surviving validation: 11
