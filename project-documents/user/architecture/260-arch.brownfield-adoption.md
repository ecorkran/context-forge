---
docType: architecture
layer: project
project: context-forge
archIndex: 260
component: brownfield-adoption
dateCreated: 20261020
dateUpdated: 20261024
status: complete
relatedSlices: []
riskLevel: medium
---

# Architecture: Brownfield Adoption

## Overview

Context Forge assumes every project starts from an idea. The onboard skill, its Codex variant, the `agent_onboard` MCP recipe and `cf next` first-run guidance all open with "describe what you want to build" and never look at the code, docs, tests, CI or git history already in the repository. Most real adoption is the opposite case: an existing codebase, often years old, that has never had CF planning artifacts.

This initiative gives CF a brownfield path. When onboarding finds an existing codebase, it branches. It builds a planning baseline from what already exists: a concept, an architecture reverse-engineered from the code, and a slice plan that records built work as completed. It leaves the workflow positioned so `cf next` points at the first piece of *new* work. Later in the initiative it reconciles the project's own conventions with the guide's rules and maps existing docs and ADRs. Greenfield behaves as it does today.

**Scope:** onboarding consolidation; detection and adoption state; the squadron path (the normal case) and the CF-only fallback; the baseline artifacts (architecture, existing-state slice plan with a retroactive marker); brownfield-aware navigation; and, last, conventions reconciliation and docs/ADR mapping. Guide content (the brownfield adoption prompt, an adoption guide, a concept guide that does not assume a new idea) belongs to ai-project-guide and is a dependency, not part of this initiative.

**Motivation:** Initiative 200 named "existing-repo adoption as first-class path" as a design goal, but it delivered *setup-level* detection only: git present, project registered, `project-documents/` present. Nothing in CF understands that the repository already contains a working system. A user adopting CF on a real codebase gets a Phase 0 conversation that ignores it all, then an empty slice plan that pretends nothing has been built.

## Design Goals

- **Greenfield behaves the same; brownfield is first-class.** An empty or near-empty repository gets the same flow it gets today: setup, then the concept conversation. An existing codebase gets a path designed for it, not the greenfield path with caveats.
- **The workflow starts where the project is.** After adoption, the artifacts describe the system that exists, and `cf next` recommends the first piece of new work, not Phase 0.
- **Squadron is the normal path; CF alone still works.** When squadron is installed, its graph-based comprehension and concept flows are used by default. Without squadron, the brownfield path still completes on CF and the guide.
- **Never fabricate intent.** Code describes structure, not purpose. Motivation, users and direction come from the repository's own prose or from the PM, or are marked unknown. This is the same rule squadron 360 adopted.
- **Surface conflicts, never merge them silently.** Where the project's existing rules and the guide's rules disagree, the user sees the disagreement and decides.

## Architectural Principles

- **One detection, many consumers.** Whether a repo is greenfield, brownfield or already planned is decided once, in core, and exposed to every surface: the onboard skill, the Codex variant, `agent_onboard` and `cf build`. `cf next` reads the persisted adoption state; it does not run detection. No surface carries its own heuristic.
- **Facts in core, judgement in the prompt.** This follows initiative 200's "skill over server logic". Core reports observable facts (source volume, commit history, docs/ADRs/CI/rule files present, the squadron probe result) and maps them to an outcome. Interpreting the repository (drafting a concept or architecture, judging whether two rules contradict) is agent work driven by guide prompts. Core never parses prose for meaning.
- **Use squadron by capability, never by assumption.** CF learns what squadron can do only from squadron's capability probe. It never inspects squadron's install paths, and it never reimplements squadron's flows: not the knowledge graph, not concept generation, not initiative candidates.
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
- **Squadron side.** The concept flow exists (squadron slice 363, complete) and requires a knowledge graph from the `understand-anything` plugin, the guide installed, and a CF-registered project name. Comprehension (362) is complete. Initiative candidates (364) is partly built, and dispatcher routing (366) is not built. The capability probe does not exist yet.

## Envisioned State

### Onboarding: setup, then hand off (PM decision 20261020)

`/cf:onboard`, its Codex variant and `agent_onboard` stay as entry points, rendered from one cf-owned source. They contain only setup: the registration check, `cf init` or the MCP `project_create`/`guide_install` fallback. Then they say "run `cf build` and follow it", or `context_build` on the MCP-only path. No brownfield logic lives in the onboarding steps. What `cf build` assembles depends on detection. The `/setup-ci` offer moves from onboard to `cf next`, which already knows the project's state.

### Detection and adoption state

Core produces one detection report: source, history, docs, ADRs, CI, rule files, and the squadron probe result. Core maps the report to one outcome, checking in this order:

1. **Adoption in progress:** the persisted adoption state says so. `cf build` resumes the brownfield prompt.
2. **Already planned:** the repo holds a CF/SQ planning artifact (an initiative plan, an architecture doc or a slice plan). A concept on its own does not count. The project is registered and development continues from the artifacts; there is no brownfield path (PM ruling 20261020; this case is expected to be very rare).
3. **Brownfield or greenfield:** decided from the code signals. Brownfield sets the adoption state to in progress and `cf build` selects the brownfield prompt. Greenfield gets the concept prompt as today.

A user override exists in both directions. Detection is scoped to the project's own folder, so a CF project in a monorepo subdirectory is judged on that folder. CI is the one exception: CI configs live at the repository root, so CI recognition also checks the root. Slice 260's `recognizeCi` owns that exception, and the detection report consumes it.

The adoption state is a persisted project value owned by core, readable by `cf build`, `cf next` and the checker. It moves from in progress to complete when the existing-state slice plan is written. Because the state persists, a user can stop after any step and resume with `cf build` or `cf next`.

### The squadron path (normal case)

When the probe reports squadron available, the brownfield prompt (which carries the probe facts) has the agent:

1. Run the `understand-anything` plugin's `/understand` if the knowledge graph is missing or stale. It's a paid multi-agent run, so the agent first says so and asks the PM once to go ahead (PM ruling 20261020: a client repo isn't covered by the project's own pre-authorized spend). This is the only step that asks.
2. Run `/sq:analysis understand` for squadron 362's comprehension analysis (layers, hotspots, dependencies).
3. Run squadron's concept flow (363) to write `000-concept` from the graph and README, unless a concept already exists. The PM confirms or corrects it.
4. Re-run `cf build`. The adoption state resumes the brownfield prompt, now with `fileComprehension` and `fileConcept` resolved. The agent writes the architecture and the existing-state slice plan, using the graph's `layers[]` for retroactive slice boundaries.

Only two squadron steps are *offered*, because they're optional: the 400 adoption baseline (a metrics and tech-debt snapshot in squadron's own store, which CF doesn't consume) and 364 initiative candidates (forward work, after the slice plan exists).

The squadron path runs only on surfaces the probe's `surfaces` list names. CF never names a surface itself: the list is squadron's to maintain, and neither this design nor CF's tests fix its contents. On a surface the list doesn't name, CF takes its own path even when squadron is installed.

The `understand-anything` plugin is needed only to build or refresh the graph. With a current graph, the squadron path runs whatever the plugin's state. When the graph must be built and the plugin is reported missing or unknown (null), the agent stops and tells the PM how to install it, or offers the CF-only path. That's a real choice, so the PM makes it; an unknown state is never treated as "missing" without asking. cf itself doesn't branch on probe fields; these rules live in the guide prompt. If squadron is absent, or the probe can't be read, the agent says so and takes the CF-only path.

### The CF-only path (fallback)

The brownfield prompt drafts the concept from the repository's own prose and filesystem, interviewing the PM only for what no artifact can hold. It then derives the architecture by reading the code, and writes the existing-state slice plan. The artifacts are the same as on the squadron path; only the provenance differs.

### Baseline artifacts

- **Architecture:** an ordinary architecture document, marked as derived. Downstream phases consume it like any other.
- **Existing-state slice plan:** built work is recorded as retroactive completed entries, and new work is planned after them. Retroactive entries come before new work in index order. That relative order is the only thing squadron 364 relies on. A single coarse "existing system" entry is allowed when finer boundaries aren't useful.
- **Retroactive marker:** a property of a slice plan entry, set only by the adoption flow. A retroactive entry counts as complete for every "done" check (CF's and squadron's pipeline gates), and the code-review gate skips it rather than passing it. A retroactive entry with a slice design or task file is a checker error. Real new work always produces those files, so the marker can't be used to bypass the gate. This amends the 240 gate rule.

### Navigation

`cf next` reads the adoption state. While adoption is in progress, it points at the next adoption step. Once it's complete, it points at the first new work item instead of Phase 0.

### Later in the initiative

- **Conventions reconciliation** lists where the project's existing rules disagree with the guide's. The PM resolves each one. Resolutions persist keyed by rule file identity, never heading text, so re-running `setup-ide` doesn't re-introduce them. Sequenced with #123.
- **Docs and ADR mapping** links existing material into the project-documents structure, in place. Nothing is moved.

## Responsibility Split with Squadron (PM approved 20261020)

Agreed in discussion between the CF and squadron agents. Squadron initiative 440 shrinks to the items marked squadron.

| Capability | Owner | Notes |
|---|---|---|
| (a) Detection and onboard branching | CF | Squadron drops its 440 detection item. |
| (b) Handoff | Shared | CF reads squadron's **capability probe**: one `sq` command printing versioned JSON for sq installed, analysis skill installed, `understand-anything` plugin present, graph present and how stale. CF reads only the probe and never inspects squadron's install paths. Squadron provides the entry point (`/sq:analysis understand`, squadron slice 366). Output is recognized by existing filename/`docType` conventions plus squadron 361's provenance block. |
| (c) Architecture from code | CF | CF writes the architecture doc on both paths. With squadron present, squadron 362's comprehension analysis is an input the prompt reads. One writer. |
| (d) Existing-state slice plan and retroactive marker | CF | Squadron 364 supplies the graph's `layers[]` as an optional signal for retroactive slice boundaries. A retroactive entry **counts as complete** for every "done" check (squadron's pipeline gates read slice status) and is **never treated as reviewed**. |
| (e) Conventions reconciliation | CF | Squadron has nothing here. |
| (f) Docs, ADR and CI mapping | CF | |
| (g) Brownfield-aware `cf next` / `agent_onboard` | CF | |
| Concept (`000-concept`) | Shared | Squadron 363 writes it from the graph; CF's fallback writes it from repo prose. Exactly one writer per run, and neither overwrites an existing concept without the PM saying so. |
| Initiative candidates | Squadron | On brownfield, squadron 364 proposes forward work only (complexity clusters). Layer-boundary candidates describe existing components, so they feed (c) and (d) instead. Candidates are indexed after retroactive entries. Squadron 364's "candidates adopt" writes CF's initiative-plan format and never sets the retroactive marker. It is frozen until the handoff contract settles. |
| Adoption baseline (squadron 400) | Squadron | Offered on the squadron path. CF doesn't consume its output. |

Consequences: the graph is optional by construction. With no graph, the probe says so and CF's own path runs. Squadron drops its planned non-graph analysis path (360 future-work item 4) because CF's fallback covers it.

## Technical Considerations

- **Brownfield thresholds.** The mapping from detection facts to an outcome lives in core, in one place. It must not misfire on a repo that is only scaffolding (a framework starter, a README and a license), nor on a shallow clone, or a repo squashed or imported with little history. The costs are lopsided: a false greenfield wastes a conversation, while a false brownfield writes wrong artifacts. Signals and thresholds are set in slice design; the override is the safety valve.
- **Retroactive slice granularity and numbering.** Code that was never sliced has no natural slice boundaries. Too fine, and the plan is noise; too coarse, and later slices can't reference what they build on. The graph's `layers[]` answer this when squadron runs. The absolute index scheme is a slice-design decision, constrained by the relative-order rule above.
- **Squadron contract stability.** The probe contract is locked at `probe_version` 1 in squadron's `project-documents/user/reference/capability-probe-contract.md` (squadron commit 32b3c609): `sq probe --json`, fields `probe_version`, `sq_version`, `surfaces` (an object keyed by surface, maintained by squadron, where adding a surface is non-breaking; each entry is `{analysis_skill_installed, entry, understand_plugin_installed, graph_build, concept}`, because commands differ by surface: `entry` runs analysis against an existing graph, `graph_build` builds or refreshes it, `concept` runs the 363 concept step). The probe ships only after squadron 366, so it never reports an entry that doesn't route, `graph{present, path, commit, commits_behind}`, `baseline{available}`. Null means unknown. A non-zero exit means the probe itself broke. Neither the probe nor squadron 366 is built yet. CF tests check the field names as a cross-repo contract, and CF treats an unknown version or unreadable output as "squadron unavailable", stated to the user, never silently.
- **Guide prompt contract (agreed with ai-project-guide 20261020; prompt content pending PM approval).** One context profile, `brownfield-adoption: [fileConcept, fileArch, fileSlicePlan, fileComprehension]`. It drives concept → architecture → existing-state slice plan, and a re-run resumes from whatever artifacts exist. `fileComprehension` is a new cf variable meaning squadron 362's `{n}-analysis.codebase-comprehension.md`, resolved by that filename and `docType`. It is optional: when nothing resolves, cf passes nothing (never a placeholder) and the prompt works from the repo alone. Squadron 363's concept is just `fileConcept`. The prompt detects 363's provenance block and has the PM confirm or correct a machine-derived concept before building on it. The detection and probe facts reach the prompt as an "Adoption Facts" section that `cf build` appends after the instruction prompt, outside the template, like the permissiveness fragment. It carries the probe JSON verbatim, or a plain statement that squadron is unavailable. cf doesn't report the current surface: the agent checks itself against `surfaces`. Graph staleness has no cf threshold. `commits_behind` 0 uses the graph with no ask. An absent graph, a non-zero count or an unknown count goes into the single `/understand` ask (rebuild, use as is, or CF-only path).
- **Guide release coupling.** The `brownfield-adoption` profile, the concept-prompt opener (the prompt must open the conversation itself, since onboard no longer does) and removal of the stale `analyze-codebase` profile ship in ai-project-guide before the cf release that depends on them. If cf selects the brownfield profile and the installed guide lacks it, `cf build` fails with a named error. It never falls back to the greenfield prompt.
- **Reconciliation is judgement.** Deciding that two rules contradict is semantic, so it's agent work. Core enumerates project rule sources (the composites CLAUDE.md, AGENTS.md and `.github/copilot-instructions.md`, plus the standalone rule directories) and applies stored resolutions deterministically inside `setup-ide`; the cli passes in the installed manifest paths and checks guide-rule delivery (slice 266 D7). It has to coexist with #123's CLAUDE.md/AGENTS.md split and existing managed blocks.
- **Mapping without moving.** Existing docs have inbound links, tooling and owners. Referencing them in place keeps those intact, but leaves CF artifacts pointing outside `project-documents/`. Introspection has to tolerate that.

## Anticipated Slices

In expected order. The last two aren't needed for the core goal (`cf next` pointing at new work after adoption) and come after the baseline works.

- **Onboarding consolidation:** one source rendered to the three entry points. Setup then hand off to `cf build` / `context_build`. The `/setup-ci` offer moves to `cf next`, and CI recognition stops keying on one filename. Greenfield behavior unchanged.
- **Detection and adoption state:** the core detection report, the three-way outcome with override, the persisted adoption state, and `cf build` selecting the `brownfield-adoption` profile (fail-fast when the guide lacks it).
- **Squadron path:** reading the probe, resolving `fileComprehension`, and the probe facts the brownfield prompt consumes. Depends on squadron's probe and 366.
- **Retroactive marker and existing-state slice plan:** the marker, the checker rule against designs or task files on retroactive entries, the 240 gate amendment, and provenance for the derived architecture.
- **Brownfield-aware `cf next`:** adoption steps while in progress, first new work item once complete.
- **Conventions reconciliation (later):** enumerate conflicts, record resolutions keyed by rule file, make `setup-ide` honor them. Sequenced with #123.
- **Docs and ADR mapping (later):** link existing material into project-documents in place.

## Dependencies

- **Initiatives 160 and 200 (complete):** the workflow navigator, consistency checker, config system and onboarding flow this initiative extends.
- **Initiative 240 (complete):** the review gate, amended for retroactive entries.
- **ai-project-guide:** the `brownfield-adoption` profile and prompt, the concept-prompt opener, the adoption guide, the reworded concept guide and removal of the `analyze-codebase` profile all shipped in v0.22.0. v0.22.1 added the concept step from the probe's `surfaces.<s>.concept`. cf releases that select the brownfield profile require at least **v0.22.2** (v0.22.2 fixed the squadron-path gate in the brownfield prompt). Still pending, both written after cf specifies them in slice design: the retroactive-marker rule, and the naming-conventions entry for the docs map file (`050-docs-map.{project}.md`, slice 267). The docs map entry does not block a cf release.
- **Squadron (initiative 440):** the capability probe and slice 366 must land before CF's squadron-path slice. The CF-only path doesn't depend on them.

## Related Work

- [200-arch.developer-onboarding.md](200-arch.developer-onboarding.md): parent onboarding flow (`cf init`, onboard skill, `project_create`, first-run `cf next`) that this initiative reworks.
- [160-arch.project-workflow-system.md](160-arch.project-workflow-system.md): workflow navigator and consistency checker that brownfield-aware navigation and the retroactive marker extend.
- [240-arch.review-aware-workflow-gating.md](240-arch.review-aware-workflow-gating.md): the review gate that the retroactive marker amends.
- Issue #123: splitting CLAUDE.md and AGENTS.md by audience in `setup-ide`. It shares the ground with conventions reconciliation.
- Squadron `360-arch.document-intelligence.md`, slices 362 (comprehension), 363 (concept generation) and 364 (initiative candidates): the squadron flows the normal path runs. Squadron initiatives 400 and 440 are the paired adoption work.
- Review: [260-review.arch.brownfield-adoption.md](../reviews/260-review.arch.brownfield-adoption.md) (CONCERNS, 11 findings). All findings are addressed in this revision. F009 is resolved by fixing only the relative order of retroactive entries here; the absolute index scheme is left to slice design.
