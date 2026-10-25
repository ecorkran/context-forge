---
docType: architecture
layer: project
project: context-forge
archIndex: 260
component: brownfield-adoption
dateCreated: 20261020
dateUpdated: 20261025
status: in_progress
relatedSlices: []
riskLevel: medium
---

# Architecture: Brownfield Adoption

## Overview

Context Forge assumes every project starts from an idea. The onboard skill, its Codex variant, the `agent_onboard` MCP recipe and `cf next` first-run guidance all open with "describe what you want to build" and never look at the code, docs, tests, CI or git history already in the repository. Most real adoption is the opposite case: an existing codebase, often years old, that has never had CF planning artifacts.

This initiative gives CF a brownfield path. When onboarding (`sq onboard`) finds an existing codebase, it branches. It builds a planning baseline from what already exists: a concept, an architecture reverse-engineered from the code, and a slice plan that records built work as completed. It leaves the workflow positioned so `cf next` points at the first piece of *new* work. Alongside, it reconciles the project's own conventions with the guide's rules and maps existing docs and ADRs; both shipped (266, 267). Greenfield behaves as it does today.

**Scope:** onboarding consolidation; detection, exposed as a read-only report; the primitives `sq onboard` consumes; the baseline artifacts (architecture, existing-state slice plan with a retroactive marker); brownfield-aware navigation; and, last, conventions reconciliation and docs/ADR mapping. Guide content (the brownfield adoption prompt, an adoption guide, a concept guide that does not assume a new idea) belongs to ai-project-guide and is a dependency, not part of this initiative.

> **Amendment 20261025 (PM decision, critical).** The first build of this initiative (slices 261–264) put adoption inside `cf build`. A Phase 0 build ran detection, wrote adoption state as a side effect, swapped in the adoption prompt and later recorded completion. `cf next` gained a per-step adoption guide, and cf ran and parsed squadron's probe. This architecture is amended as follows, and the sections below are rewritten to match:
> - **Adoption is orchestrated by `sq onboard`**, which squadron builds once the cf core is stable. cf orchestrates nothing. `/cf:onboard` stays the entry point for now, with no brownfield path.
> - **cf provides read-only primitives**: a project-state report (greenfield, brownfield or already planned, plus facts) and adoption-prompt delivery. It also keeps understanding the artifacts adoption writes.
> - **`cf build` is pure again**: no detection, no state writes, no prompt swap.
> - **There is no adoption state machine**: the files say whether a project is planned, and only an opt-out is stored.
> - **`cf next` carries no adoption guidance**: one line for an unadopted brownfield repo.
> - **cf never invokes squadron (PM ban)**: squadron calls cf, never the reverse. The probe integration is removed, and cf knows none of squadron's file names. Squadron owns graph building and comprehension, and passes cf the comprehension doc's path.
> - **Squadron is the only adoption path**: the CF-only fallback is dropped, and is low-priority future work.
>
> Until `sq onboard` exists, adoption is parked. The rework is slices 268, 269, 271 and 272 (270 folded into 269), and 273–274 are parked (see the slice plan).

**Motivation:** Initiative 200 named "existing-repo adoption as first-class path" as a design goal, but it delivered *setup-level* detection only: git present, project registered, `project-documents/` present. Nothing in CF understands that the repository already contains a working system. A user adopting CF on a real codebase gets a Phase 0 conversation that ignores it all, then an empty slice plan that pretends nothing has been built.

## Design Goals

- **Greenfield behaves the same; brownfield is first-class.** An empty or near-empty repository gets the same flow it gets today: setup, then the concept conversation. An existing codebase gets a path designed for it, not the greenfield path with caveats.
- **The workflow starts where the project is.** After adoption, the artifacts describe the system that exists, and `cf next` recommends the first piece of new work, not Phase 0.
- **Squadron is the adoption path.** Adoption runs through `sq onboard` and squadron's graph-based comprehension. A project without squadron is told that adoption needs it, or can opt out and be treated as new. A CF-only path is low-priority future work (amended 20261025).
- **cf commands keep one meaning each.** `cf build` assembles context for a phase and writes nothing. `cf next` recommends; it never runs a multi-step flow. Adoption logic never hides inside either (amended 20261025).
- **Never fabricate intent.** Code describes structure, not purpose. Motivation, users and direction come from the repository's own prose or from the PM, or are marked unknown. This is the same rule squadron 360 adopted.
- **Surface conflicts, never merge them silently.** Where the project's existing rules and the guide's rules disagree, the user sees the disagreement and decides.

## Architectural Principles

- **One detection, many consumers.** Whether a repo is greenfield, brownfield or already planned is decided once, in core. It is exposed as a read-only report (CLI and MCP) that `sq onboard`, `cf init` and `cf next` consume. Nothing persists the outcome: it is derived from the files every time. No surface carries its own heuristic.
- **Facts in core, judgement in the prompt.** This follows initiative 200's "skill over server logic". Core reports observable facts (source volume, commit history, docs/ADRs/CI/rule files present) and maps them to an outcome. Interpreting the repository (drafting a concept or architecture, judging whether two rules contradict) is agent work driven by guide prompts. Core never parses prose for meaning.
- **cf never invokes squadron (PM ban 20261025).** Squadron calls cf's primitives, never the reverse. cf runs no squadron command, parses no squadron output, inspects no squadron install path and hard-codes none of squadron's file names. It never reimplements squadron's flows: not the knowledge graph, not comprehension, not concept generation, not initiative candidates. When cf needs a squadron artifact, squadron passes its path in. This replaces "use squadron by capability", the probe, and cf's filename lookup for the comprehension doc.
- **Retroactive artifacts say so.** Anything recording work that predates adoption is marked as retroactive. The consistency checker and review gate can then tell recorded history from work executed under the process. The retroactive marker is never the PM-only review exemption, and adoption never sets that exemption.
- **Additive and reversible.** Adoption writes new planning artifacts and managed blocks. It does not move, rewrite or delete the project's existing docs, rules or CI. Where content is mapped, the original stays where it is.
- **Guide owns content, cf owns logic.** This keeps the docs-only guide boundary from initiative 200. The brownfield prompt and the adoption guide ship in ai-project-guide. cf reads them at run time and hard-codes none of their wording. A missing guide prompt is an error, never a reason to fall back to another prompt.

## Current State

- **Onboard skill (`packages/cli/commands/cf/onboard.md`), Codex variant, and `agent_onboard` (`packages/mcp-server/src/tools/agentOnboardTool.ts`).** Three hand-written copies of one greenfield recipe: detect registration, `cf init`, then the Phase 0 "describe what you want to build" conversation. They already drift in wording. None inspects the codebase.
- **`cf init`.** Detects git, registration and `project-documents/`. It is safe against an existing CLAUDE.md/AGENTS.md (managed blocks), but appends guide rules without noticing when they contradict the project's own.
- **`cf next` first-run logic (`WorkflowNavigator.detectFirstRunContext`).** Treats sparse planning state as a fresh project. A ten-year-old codebase with no CF artifacts looks identical to an empty directory.
- **Consistency checker and review gate.** A slice plan entry marked complete with no code review is a `review-gate` finding when `workflow.review_enabled` is on. An existing-state plan that records built work as complete would trip it on every entry. The `missing-artifact` rule already tolerates plan entries without a design.
- **`/setup-ci`.** Offered by onboard, and fires only when `.github/workflows/ci.yml` is absent. A project with CI under another name or another provider is either missed or offered a duplicate.
- **`setup-ide` composition.** CLAUDE.md and AGENTS.md are compiled from the same `alwaysApply` rule set. Issue #123 covers splitting them by audience. Reconciliation has to work with whatever split that issue lands.
- **Squadron side.** The concept flow (363) and comprehension (362) exist. The capability probe shipped (`probe_version` 1), and cf's first build consumed it; 268 removed that integration. cf still holds a now-unused filename lookup for the comprehension doc (`detection/comprehensionAnalysis.ts`), which 271 deletes. `sq onboard` does not exist yet, and adoption waits on it.

## Envisioned State

### Onboarding (amended 20261025)

`/cf:onboard`, its Codex variant and `agent_onboard` stay as entry points, rendered from one cf-owned source (slice 260). They contain only setup: the registration check, `cf init` or the MCP `project_create`/`guide_install` fallback, then the concept conversation for greenfield. They have no adoption path. When the detection report says brownfield, they stop before the concept conversation and say so in one message: adoption needs `sq onboard`, which is not available yet, and the user can opt out to treat the project as new. They never start the greenfield conversation on an existing codebase silently. Adoption is orchestrated by `sq onboard` once squadron builds it; until then it is parked. The `/setup-ci` offer lives in `cf next`.

### Detection: a read-only report (amended 20261025)

Core produces one detection report: source volume (a floor, because counting stops at the threshold), history, docs, ADRs, CI and rule files. It maps the report to one outcome, checking in this order:

1. **Opted out:** the user said to treat the project as new. It is greenfield.
2. **Adoption incomplete:** a derived architecture (`provenance: derived`) exists, but no slice plan has a retroactive entry. Adoption stopped partway and resumes through `sq onboard`. This is what a stored "in progress" state used to record; the files record it now.
3. **Already planned:** the repo holds a CF/SQ planning artifact (an initiative plan, an architecture doc or a slice plan) and case 2 does not apply. A concept on its own does not count. Development continues from the artifacts. A finished adoption lands here, because its slice plan has a retroactive entry. A stray non-derived architecture doc in a brownfield repo also lands here. That is the PM's 20261020 ruling on already-planned repos, and it is expected to be rare.
4. **Brownfield or greenfield:** decided from the code signals. Brownfield needs at least `BROWNFIELD_MIN_SOURCE_LINES` (2000, in `adoption/adoptionOutcome.ts`) non-blank source lines in the project folder. Counting stops at the threshold, so the reported figure is a floor.

The outcome is derived from the files every time and never stored. The only stored value is the opt-out, a project config value whose key and command slice 269 names. Detection is scoped to the project's own folder, so a CF project in a monorepo subdirectory is judged on that folder. CI is the one exception: CI configs live at the repository root, so CI recognition also checks the root (slice 260's `recognizeCi`). History counts only commits that touch the project folder, and the report says when a shallow clone truncates it.

The report is exposed as one CLI command and one MCP tool returning JSON (slice 271). It writes nothing. `cf init` uses the same core function to print one line when it finds an existing codebase. `cf build` does not run detection.

### Adoption flow, under sq onboard (amended 20261025)

`sq onboard` orchestrates. In outline, so squadron and the guide can design against it:

1. Register the project (`cf init` or the MCP equivalent).
2. Read cf's detection report. If the project is greenfield or already planned, adoption doesn't apply.
3. On brownfield, squadron builds or refreshes the knowledge graph and writes the comprehension doc. It asks the PM once before a paid graph build (PM ruling 20261020: a client repo isn't covered by pre-authorized spend). This step is squadron's alone; cf has no part in it.
4. Fetch the adoption prompt from cf (slice 271), passing the comprehension doc's path, and hand it to the agent. The graph and the analysis are finished before this step, so the prompt never asks the agent to run squadron.
5. Squadron's concept flow (363) writes the concept from the comprehension doc and the repo's prose, and the PM confirms or corrects it (PM 20261025: squadron owns the concept). The agent, driven by cf's adoption prompt, then writes the derived architecture and the existing-state slice plan. The prompt starts from the confirmed concept, which cf finds by its own file name.

When the PM declines adoption during `sq onboard`, squadron runs `cf config set adoption.state declined`.
6. `cf next` then points at the first new slice, and the normal phases continue with `cf build` as everywhere else.

Squadron decides its own surfaces, graph freshness and plugin requirements. cf neither knows nor tests those.

### Baseline artifacts

- **Architecture:** an ordinary architecture document, marked as derived. Downstream phases consume it like any other.
- **Existing-state slice plan:** built work is recorded as retroactive completed entries, and new work is planned after them. Retroactive entries come before new work in index order. That relative order is the only thing squadron 364 relies on. A single coarse "existing system" entry is allowed when finer boundaries aren't useful.
- **Retroactive marker:** a property of a slice plan entry, specified in slice 263 and in the guide's `guide.ai-project.brownfield-adoption` (Marker section). It is a backticked `retroactive` token after the entry's title, on a checked entry with an explicit index. Squadron reads the same marker. A retroactive entry counts as complete for every "done" check (CF's and squadron's pipeline gates), and the code-review gate skips it rather than passing it. A retroactive entry with a slice design or task file is a checker error, which stops new work from being relabelled once it has started. It does not stop an unbuilt entry being marked retroactive before any design exists, because the agent writes the plan file directly. Tying a retroactive entry's validity to a derived architecture is possible future work. The rework leaves the marker unchanged. This amends the 240 gate rule.

### Navigation

`cf next` has no adoption steps (amended 20261025). An unadopted brownfield repo gets one line: adoption arrives with `sq onboard`, plus how to opt out and treat the project as new. An adopted project is navigated like any planned project. Retroactive entries count as complete, so `cf next` points at the first unbuilt slice.

### Delivered alongside (266, 267)

- **Conventions reconciliation (shipped, 266)** lists where the project's existing rules disagree with the guide's. The PM resolves each one. Resolutions persist keyed by rule file identity, never heading text, so re-running `setup-ide` doesn't re-introduce them. #123 shipped in 935.
- **Docs and ADR mapping (shipped, 267)** links existing material into the project-documents structure, in place. Nothing is moved.

Both stand on their own and work without adoption. The rework leaves them unchanged.

### Comprehension in later phases (274, parked)

Today the comprehension doc reaches only the adoption prompt. Architecture, slice planning and slice design builds never see it, and neither does the docs map (#135). Adoption is worth doing only if later design work benefits from it. Slice 274 makes both available to those phases and decides how they stay current. Squadron owns the graph's freshness and tells cf where the doc is, through a cf-owned field it sets; cf never searches for squadron's files. cf only says plainly when a doc is missing.

## Responsibility Split with Squadron (PM approved 20261020, amended 20261025)

Agreed in discussion between the CF and squadron agents. Squadron initiative 440 shrinks to the items marked squadron. The 20261025 amendment moves onboarding orchestration to squadron (`sq onboard`) and removes cf's probe integration. Rows (a), (b) and (g) changed.

| Capability | Owner | Notes |
|---|---|---|
| (a) Detection | CF | A read-only report (CLI and MCP) that squadron consumes. Squadron drops its 440 detection item. |
| (a′) Onboard orchestration | Squadron | `sq onboard` runs the adoption flow and calls cf's primitives. cf onboarding has no brownfield path. |
| (b) Handoff | Squadron → CF | Squadron writes the comprehension doc and passes its path to cf when it fetches the adoption prompt. cf knows nothing of squadron's file naming and never searches for the doc. cf no longer reads squadron's capability probe. |
| (c) Architecture from code | CF | CF writes the architecture doc on both paths. With squadron present, squadron 362's comprehension analysis is an input the prompt reads. One writer. |
| (d) Existing-state slice plan and retroactive marker | CF | Squadron 364 supplies the graph's `layers[]` as an optional signal for retroactive slice boundaries. A retroactive entry **counts as complete** for every "done" check (squadron's pipeline gates read slice status) and is **never treated as reviewed**. |
| (e) Conventions reconciliation | CF | Squadron has nothing here. |
| (f) Docs, ADR and CI mapping | CF | |
| (g) `cf next` | CF | One line for an unadopted brownfield repo pointing at `sq onboard`, then normal navigation. No adoption steps. |
| Concept (`000-concept`) | Squadron | Written by squadron's concept flow (363) during `sq onboard`, from the comprehension doc and repo prose (PM 20261025). The adoption prompt never drafts it; it starts from the confirmed concept. Nothing overwrites an existing concept without the PM saying so. |
| Initiative candidates | Squadron | On brownfield, squadron 364 proposes forward work only (complexity clusters). Layer-boundary candidates describe existing components, so they feed (c) and (d) instead. Candidates are indexed after retroactive entries. Squadron 364's "candidates adopt" writes CF's initiative-plan format and never sets the retroactive marker. It is frozen until the handoff contract settles. |
| Adoption baseline (squadron 400) | Squadron | Offered on the squadron path. CF doesn't consume its output. |

Consequences (amended 20261025): adoption requires squadron. There is no CF-only fallback for now. Squadron's planned non-graph analysis path (360 future-work item 4) is not covered by cf either; a non-squadron path is low-priority future work.

## Technical Considerations

- **Brownfield thresholds.** The mapping from detection facts to an outcome lives in core, in one place. It must not misfire on a repo that is only scaffolding (a framework starter, a README and a license), nor on a shallow clone, or a repo squashed or imported with little history. The costs are lopsided: a false greenfield wastes a conversation, while a false brownfield writes wrong artifacts. Signals and thresholds are set in slice design; the override is the safety valve.
- **Retroactive slice granularity and numbering.** Code that was never sliced has no natural slice boundaries. Too fine, and the plan is noise; too coarse, and later slices can't reference what they build on. The graph's `layers[]` answer this when squadron runs. The absolute index scheme is a slice-design decision, constrained by the relative-order rule above.
- **cf ↔ squadron contract (20261025).** Squadron calls cf; cf never calls squadron. Slice 271 names the commands and fixes the details. This architecture fixes the shape:
  - **Detection report:** one CLI command (`--json`) and one MCP tool, with identical JSON. Fields: `reportVersion` (integer, starting at 1, raised on any breaking change; squadron refuses a version it doesn't know), `outcome` (`opted-out`, `adoption-incomplete`, `already-planned`, `brownfield`, `greenfield`), `facts` (source-line floor and file count, commit count with a shallow flag, docs, ADRs, CI and rule-file paths), and `artifacts` (paths of the concept, derived architectures and existing-state slice plan that exist, so squadron can resume without knowing cf's file names). All paths are relative to the project root. It is read-only and works on an unregistered directory. Errors are a JSON error object with a stable code and a non-zero exit (PM 20261025).
  - **Adoption prompt delivery:** the guide's adoption prompt by key, rendered with the project's variables plus the comprehension doc's path as squadron passes it. With no path given, the prompt says so plainly. A path that doesn't exist is a named error. A guide missing the prompt is a named error, never a fallback. `cf prompt get` already renders a prompt by key with project variables; 271 checks whether accepting the path there is all this needs.
  - **Comprehension freshness** is squadron's responsibility. cf does not judge staleness.
- **Guide prompt contract (20261025).** `cf build` does not select the `brownfield-adoption` profile or append Adoption Facts. The prompt is delivered by the slice 271 primitive. cf decides nothing about squadron's state, so the prompt's raw-probe branching goes away. The guide drops its `cf build` steps when 272 lands. Slice 271 settles how the profile's variables (fileConcept, fileArch, fileSlicePlan, fileComprehension) reach the prompt; fileComprehension comes only from squadron's argument. The guide's prompt also drops its squadron step list, since squadron finishes the analysis before handing the prompt over.
- **Guide release coupling.** cf raises `MIN_GUIDE_VERSION` to the guide release that drops the `cf build` adoption steps (272). That cf release and that guide release ship together.
- **Reconciliation is judgement.** Deciding that two rules contradict is semantic, so it's agent work. Core enumerates project rule sources (the composites CLAUDE.md, AGENTS.md and `.github/copilot-instructions.md`, plus the standalone rule directories) and applies stored resolutions deterministically inside `setup-ide`; the cli passes in the installed manifest paths and checks guide-rule delivery (slice 266 D7). It has to coexist with #123's CLAUDE.md/AGENTS.md split and existing managed blocks.
- **Mapping without moving.** Existing docs have inbound links, tooling and owners. Referencing them in place keeps those intact, but leaves CF artifacts pointing outside `project-documents/`. Introspection has to tolerate that.

## Anticipated Slices

The original slices 260–267 have shipped. Rework, in order:

- **268 Pure `cf build`:** no detection, no state writes, no prompt swap.
- **269 Collapse adoption state:** outcomes derived from files; the opt-out is the only stored value. `cf next` loses its adoption steps: one line for unadopted brownfield or incomplete adoption, normal navigation otherwise (270 folded in).
- **271 Primitives for `sq onboard`:** the detection report and prompt delivery (contract above). Removes the probe integration (done in 268, D3) and cf's comprehension filename lookup.
- **272 Docs and guide alignment:** nothing points at `cf build` for adoption. Guide minimum raised.

Parked until `sq onboard` exists: **273** a real adoption run with the PM answering live, and **274** comprehension in later phases (an umbrella).

**Exit criterion:** the initiative is complete when 273 passes: a real repository adopted through `sq onboard`, through to a first new slice design built on the derived architecture. Until then the initiative stays in progress, and cf's part ends at 272.

## Dependencies

- **Initiatives 160 and 200 (complete):** the workflow navigator, consistency checker, config system and onboarding flow this initiative extends.
- **Initiative 240 (complete):** the review gate, amended for retroactive entries.
- **ai-project-guide:** the adoption prompt, the adoption guide and the retroactive-marker rule (shipped through v0.22.7). 272 needs a guide release that drops the `cf build` adoption steps, the raw-probe branching and the squadron step list. 274 needs new context-profile variables.
- **Squadron (initiative 440):** `sq onboard`, which orchestrates adoption and consumes cf's primitives (slice 271), and graph building plus the comprehension doc. Adoption is parked until `sq onboard` exists (amended 20261025; the probe dependency is gone).

## Related Work

- [200-arch.developer-onboarding.md](200-arch.developer-onboarding.md): parent onboarding flow (`cf init`, onboard skill, `project_create`, first-run `cf next`) that this initiative reworks.
- [160-arch.project-workflow-system.md](160-arch.project-workflow-system.md): workflow navigator and consistency checker that brownfield-aware navigation and the retroactive marker extend.
- [240-arch.review-aware-workflow-gating.md](240-arch.review-aware-workflow-gating.md): the review gate that the retroactive marker amends.
- Issue #123: splitting CLAUDE.md and AGENTS.md by audience in `setup-ide`. It shares the ground with conventions reconciliation.
- Squadron `360-arch.document-intelligence.md`, slices 362 (comprehension), 363 (concept generation) and 364 (initiative candidates): the squadron flows the normal path runs. Squadron initiatives 400 and 440 are the paired adoption work.
- Review: [260-review.arch.brownfield-adoption.md](../reviews/260-review.arch.brownfield-adoption.md) (CONCERNS, 11 findings). All findings are addressed in this revision. F009 is resolved by fixing only the relative order of retroactive entries here; the absolute index scheme is left to slice design.
