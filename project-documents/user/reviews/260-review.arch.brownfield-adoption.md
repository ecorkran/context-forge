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
dateCreated: 20261025
dateUpdated: 20261025
reviewedSha: 1e93572d06f7dcf3895a6fb91a0b5bb9cd747622
toolsGiven: [read_file, list_files, grep]
toolCallsMade: 1
turns: 2
promptTokens: 89972
cachedTokens: 9622
cacheWriteTokens: 80346
completionTokens: 5680
durationSeconds: 47.7
costUsd: 0.379888
costBasis: provider
squadronVersion: 0.24.1
findings:
  - id: F001
    severity: concern
    category: consistency
    summary: "Superseded design is kept inline and contradicts the amended sections"
    location: "project-documents/user/architecture/260-arch.brownfield-adoption.md#technical-considerations"
  - id: F002
    severity: concern
    category: completeness
    summary: "Partial adoption is misclassified as \"already planned\", and nothing detects it"
    location: "project-documents/user/architecture/260-arch.brownfield-adoption.md#detection-a-read-only-report-amended-20261025"
  - id: F003
    severity: concern
    category: completeness
    summary: "cf's handling of an unadopted brownfield repo is undefined at the primary entry point"
    location: "project-documents/user/architecture/260-arch.brownfield-adoption.md#onboarding-amended-20261025"
  - id: F004
    severity: concern
    category: dependencies
    summary: "The cf↔squadron contract is only named, not specified"
    location: "project-documents/user/architecture/260-arch.brownfield-adoption.md#adoption-flow-under-sq-onboard-amended-20261025"
  - id: F005
    severity: concern
    category: feasibility
    summary: "The retroactive marker can bypass the gate, and its representation is unspecified"
    location: "project-documents/user/architecture/260-arch.brownfield-adoption.md#baseline-artifacts"
  - id: F006
    severity: concern
    category: feasibility
    summary: "Core goal depends on an unbuilt external component; the initiative has no end-to-end deliverable"
    location: "project-documents/user/architecture/260-arch.brownfield-adoption.md#overview"
  - id: F007
    severity: concern
    category: antipattern
    summary: "Reconciliation and docs/ADR mapping are scope beyond the stated core goal"
    location: "project-documents/user/architecture/260-arch.brownfield-adoption.md#later-in-the-initiative"
  - id: F008
    severity: note
    category: completeness
    summary: "Detection thresholds, opt-out mechanism and monorepo history are deferred"
    location: "project-documents/user/architecture/260-arch.brownfield-adoption.md#technical-considerations"
  - id: F009
    severity: note
    category: abstraction
    summary: "Concept ownership is \"shared\" without an enforcement mechanism"
    location: "project-documents/user/architecture/260-arch.brownfield-adoption.md#responsibility-split-with-squadron-pm-approved-20261020-amended-20261025"
---

# Review: arch — initiative 260

**Verdict:** CONCERNS
**Model:** claude-sonnet-5-5

## Findings

### [CONCERN] Superseded design is kept inline and contradicts the amended sections

The amendment says the sections below "are rewritten to match". Several are not.
- "Squadron contract stability" and "Guide prompt contract" keep the full probe contract and the "Adoption Facts" appended by `cf build`. They are labelled "for history", but they still read as live requirements, such as "CF tests check the field names as a cross-repo contract".
- Dependencies still says cf releases "that select the brownfield profile" require guide v0.22.2. cf no longer selects a profile.
- The Responsibility table still cites "squadron 361's provenance block".
- "Current State, Squadron side" still treats the probe as a pending dependency.
- The Anticipated Slices heading says "In expected order", but the paragraph above calls the list a shipped, superseded plan. That list still contains "persisted adoption state", "squadron path: reading the probe" and "adoption steps while in progress". Those are exactly what the amendment removed.

An implementer of slices 273/274 cannot tell which text is authoritative. Move the history to a changelog or the review file, and keep only live contracts in the body.

### [CONCERN] Partial adoption is misclassified as "already planned", and nothing detects it

The outcome is derived from files only, with no adoption state. "Already planned" is triggered by any architecture doc, initiative plan or slice plan. A concept alone does not count.

The adoption flow (step 5) writes the concept, then the architecture, then the slice plan. If it stops after the architecture, the repo is "already planned". Adoption will not resume, and `cf next` navigates a project with no retroactive entries. The original prompt's "re-run resumes from whatever artifacts exist" no longer has a trigger. The same thing happens if a brownfield repo already has a stray architecture doc.

The report should distinguish "planned, adoption complete" from "has planning artifacts but no retroactive baseline". It could do this by checking for a retroactive-marked entry, or by using a derived-architecture marker with no slice plan.

### [CONCERN] cf's handling of an unadopted brownfield repo is undefined at the primary entry point

The Motivation says the problem is that onboarding "ignores it all". The amended design leaves `/cf:onboard`, its Codex variant and `agent_onboard` with "no brownfield path". They keep the greenfield "describe what you want to build" conversation. The doc does not say what these entry points do when detection reports brownfield. The options are to proceed with the greenfield conversation, stop, or print the one-line message. In the first case the original defect remains for every user who does not use `sq onboard`. Until `sq onboard` exists, only `cf init` and `cf next` print one line each. State the behavior explicitly. It should probably be a hard stop with the opt-out instructions, not a silent greenfield flow.

### [CONCERN] The cf↔squadron contract is only named, not specified

Squadron is now the sole consumer of cf's report and prompt delivery (slice 271). The architecture gives neither interface:
- It does not name the CLI command or the MCP tool.
- It does not give the JSON schema of the report.
- It has no version field. The probe contract carried `probe_version`, and its replacement has none, so schema drift between cf and `sq onboard` will fail silently.
- It does not say how the comprehension path is passed or what the prompt-delivery output looks like.
- It does not say what cf does when the comprehension doc is missing, or when several exist.

The doc also claims "cf no longer talks to squadron" while cf still resolves squadron's comprehension doc "by filename and docType" and fills its path into the prompt. That is a coupling to squadron's artifact naming. Staleness is also lost: the old design used `commits_behind`, and now a stale comprehension doc silently feeds the prompt, with only squadron's side responsible for freshness. Put the report schema and a `version` field in this document, since it is the cross-repo contract.

### [CONCERN] The retroactive marker can bypass the gate, and its representation is unspecified

The document claims "the marker can't be used to bypass the gate" because a retroactive entry with a design or task file is a checker error. The opposite attack works. Mark an unbuilt or in-progress entry as retroactive before any design exists. The `missing-artifact` rule already tolerates plan entries without designs. The entry then counts as complete for CF's navigator and for squadron's pipeline gates, and the review gate skips it. "Set only by the adoption flow" is not enforceable, because the agent writes the slice plan file directly. The doc does not say what verifies it.

The representation is also undefined: a frontmatter field, an inline tag, or a heading suffix. The project rule against using user-accessible labels as logical structure makes a text label a hazard. The rule that defines the marker is listed as "still pending" in the guide. Squadron must read the same marker for its "done" checks, so the shared field name and semantics need to be fixed here. Consider also tying the marker to the derived architecture's provenance, so that a retroactive entry is only valid when a derived-architecture doc exists.

### [CONCERN] Core goal depends on an unbuilt external component; the initiative has no end-to-end deliverable

After the rework, cf ships primitives only. The adoption flow, graph building, comprehension and orchestration are all in `sq onboard`, which does not exist ("adoption is parked"). Slice 273 (real adoption run) is parked, so nothing validates that the primitives compose. The cf-side design for steps 4–6 is therefore untested speculation. The first build already had to be reworked because it was built ahead of its integration. Nothing in the doc sets the exit criterion or the acceptance test for the parked slices.

### [CONCERN] Reconciliation and docs/ADR mapping are scope beyond the stated core goal

The doc itself says conventions reconciliation and docs mapping "aren't needed for the core goal". They add:
- persistent per-rule-file resolutions inside `setup-ide`;
- a coupling to issue #123;
- artifacts that point outside `project-documents/`, which introspection must tolerate;
- a new docs-map file type that needs a naming-convention entry.

That is a large mechanism set for a flow that cannot run yet. Either cut them from this initiative into their own architecture, or mark them as already delivered. "Later in the initiative" in Envisioned State contradicts "all shipped (260–267)" in Anticipated Slices. The doc also gives no description of slice 274 ("carry codebase comprehension into later phases"), which is the only live pending scope.

### [NOTE] Detection thresholds, opt-out mechanism and monorepo history are deferred

- Brownfield thresholds are "set in slice design". The slices have shipped, so the architecture should now record the signals and values or point at where they live. The doc itself says a false brownfield writes wrong artifacts.
- The opt-out is the only stored state. Its file, location and command are never named, and "how to opt out" is only referenced in the `cf next` line.
- Detection is "scoped to the project's own folder", but commit history is repo-wide in a monorepo. The doc does not say whether history signals are path-filtered, and the shallow-clone caveat applies to both.
- The absolute index scheme for retroactive entries is deferred (F009). A project with an existing numbering scheme could collide with it.

### [NOTE] Concept ownership is "shared" without an enforcement mechanism

The Concept row says "exactly one writer per run, and nothing overwrites an existing concept without the PM saying so". Two prompts can write it: squadron 363 and the guide's adoption prompt. Both are agent-driven, with no cf-side check. The architecture and slice plan have a single writer by construction. The concept has none, and relies on prompt wording alone.

### Run Digest

- Response length: 9315 chars
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
- Tokens — prompt / cached / cache write / completion / reasoning: 89972 / 9622 / 80346 / 5680 / not computed
- Duration: 47.7 s
- Cost: $0.38 (provider)
- `## Summary` located: yes
- `## Findings` located: yes
- Finding-shaped matches — whole response: 9
- Finding-shaped matches — inside fences: 0
- Finding-shaped matches — in findings section: 9
- Finding-shaped matches — surviving validation: 9
