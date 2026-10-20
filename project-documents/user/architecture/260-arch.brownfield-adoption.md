---
docType: architecture
layer: project
project: context-forge
archIndex: 260
component: brownfield-adoption
dateCreated: 20261020
dateUpdated: 20261020
status: not_started
relatedSlices: []
riskLevel: medium
---

# Architecture: Brownfield Adoption

## Overview

Context Forge assumes every project starts from an idea. The onboard skill, its Codex variant, the `agent_onboard` MCP recipe and `cf next` first-run guidance all open with "describe what you want to build" and never look at the code, docs, tests, CI or git history already in the repository. Most real adoption is the opposite case: an existing codebase, often years old, that has never had CF planning artifacts.

This initiative gives CF a brownfield path. When onboarding finds an existing codebase, it branches. It builds a planning baseline from what already exists: a concept, an architecture reverse-engineered from the code, and a slice plan that records built work as completed. It reconciles the project's own conventions with the guide's rules, and leaves the workflow positioned so `cf next` points at the first piece of *new* work. The greenfield path is unchanged.

**Scope:** detection and branching across every onboarding surface; an optional handoff to squadron's adoption flows; the baseline artifacts (architecture, existing-state slice plan); conventions reconciliation; mapping existing docs, ADRs and CI; and brownfield-aware workflow navigation. Guide content (a brownfield/adoption guide, a concept guide that does not assume a new idea) belongs to ai-project-guide and is a dependency, not part of this initiative.

**Motivation:** Initiative 200 named "existing-repo adoption as first-class path" as a design goal, but it delivered *setup-level* detection only: git present, project registered, `project-documents/` present. Nothing in CF understands that the repository already contains a working system. A user adopting CF on a real codebase gets a Phase 0 conversation that ignores it all, then an empty slice plan that pretends nothing has been built.

## Design Goals

- **Greenfield unchanged, brownfield first-class.** An empty or near-empty repository gets exactly today's flow. An existing codebase gets a path designed for it, not the greenfield path with caveats.
- **The workflow starts where the project is.** After adoption, the artifacts describe the system that exists, and `cf next` recommends the first piece of new work, not Phase 0.
- **Works on CF and the guide alone; works better with squadron.** Squadron's comprehension and concept flows produce richer input when installed. Without them the brownfield path still completes.
- **Never fabricate intent.** Code describes structure, not purpose. Motivation, users and direction come from the repository's own prose or from the PM, or are marked unknown. This is the same rule squadron 360 adopted.
- **Surface conflicts, never merge them silently.** Where the project's existing rules and the guide's rules disagree, the user sees the disagreement and decides.

## Architectural Principles

- **One detection, many consumers.** Whether a repo is brownfield is decided once, in core, and exposed to every surface: the onboard skill, the Codex variant, `agent_onboard` and `cf next`. No surface carries its own heuristic. The current duplication between the onboard skill text and the `agent_onboard` recipe is not extended into a second, brownfield copy.
- **Facts in core, judgement in the skill.** This follows initiative 200's "skill over server logic". Core reports observable facts: source volume, commit history, presence of docs/ADRs/CI/rule files, squadron availability. Interpreting them (drafting an architecture, judging whether two rules contradict) is agent work driven by guide prompts. Core never parses prose for meaning.
- **Hand off by capability, never by assumption.** CF checks whether squadron's flows are available and offers them. It does not reimplement any part of them: not the knowledge graph, not concept generation, not initiative candidates. The handoff is a seam with a stated contract, not an import.
- **Retroactive artifacts say so.** Anything recording work that predates adoption is marked as retroactive. The consistency checker and review gate can then tell recorded history from work executed under the process. A retroactive marker is never the PM-only review exemption, and adoption never sets that exemption.
- **Additive and reversible.** Adoption writes new planning artifacts and managed blocks. It does not move, rewrite or delete the project's existing docs, rules or CI. Where content is mapped, the original stays where it is.
- **Guide owns content, cf owns logic.** This keeps the docs-only guide boundary from initiative 200. Brownfield prompts and the adoption guide ship in ai-project-guide. cf reads them at run time and hard-codes none of their wording.

## Current State

- **Onboard skill (`packages/cli/commands/cf/onboard.md`), Codex variant, and `agent_onboard` (`packages/mcp-server/src/tools/agentOnboardTool.ts`).** Three copies of one greenfield recipe: detect registration, `cf init`, then the Phase 0 "describe what you want to build" conversation. None inspects the codebase.
- **`cf init`.** Detects git, registration and `project-documents/`. It is safe against an existing CLAUDE.md/AGENTS.md (managed blocks), but appends guide rules without noticing when they contradict the project's own.
- **`cf next` first-run logic (`WorkflowNavigator.detectFirstRunContext`).** Treats sparse planning state as a fresh project. A ten-year-old codebase with no CF artifacts looks identical to an empty directory.
- **Consistency checker and review gate.** A slice plan entry marked complete with no code review is a `review-gate` finding when `workflow.review_enabled` is on. An existing-state plan that records built work as complete would trip it on every entry. The `missing-artifact` rule already tolerates plan entries without a design.
- **`/setup-ci`.** Fires only when `.github/workflows/ci.yml` is absent. A project with CI under another name or another provider is either missed or offered a duplicate.
- **`setup-ide` composition.** CLAUDE.md and AGENTS.md are compiled from the same `alwaysApply` rule set. Issue #123 covers splitting them by audience. Reconciliation here has to work with whatever split that issue lands.
- **Squadron side.** The brownfield concept flow exists (squadron slice 363, complete) and requires a knowledge graph from the `understand-anything` plugin, the guide installed, and a CF-registered project name. Initiative candidates (364) and dispatcher routing (366) are not yet built. Squadron initiatives 400 (adoption baseline) and 440 (brownfield adoption) have no architecture documents yet.

## Envisioned State

Adoption is a branch inside onboarding, not a separate product.

1. **Setup** runs as today (`cf init` or its MCP equivalent), so the guide is installed and the project registered. Squadron's flows need both.
2. **Detection** reports whether the repository holds an existing system and what it holds: source, history, docs, ADRs, CI, rule files, squadron availability. Every onboarding surface reads the same report.
3. **Baseline.** With squadron available, the user is offered squadron's comprehension and concept flows, and their output lands as standard CF artifacts. Without squadron, the guide's brownfield prompts drive the agent to draft a concept from the repository's own prose and filesystem, interviewing the PM only for what no artifact can hold.
4. **Architecture** is reverse-engineered from the code into an ordinary architecture document. Downstream phases consume it like any other; it differs only in provenance.
5. **Existing-state slice plan** records what is built as completed, retroactive slices, with new work planned after them. The checker and review gate recognize retroactive entries and don't demand reviews that never happened.
6. **Conventions reconciliation** lists where the project's existing rules disagree with the guide's. The PM resolves each one, and the resolution persists, so re-running `setup-ide` doesn't re-introduce it.
7. **Mapping** links existing docs, ADRs and CI into the project-documents structure and the CI baseline. Nothing is moved.
8. **Navigation.** `cf next` knows the project was adopted and points at the first new work item instead of Phase 0.

Each step leaves standard artifacts behind, so a user can stop after any of them and resume with `cf next`.

## Technical Considerations

- **What counts as brownfield.** The threshold must not misfire on a repo that is only scaffolding (a framework starter, a README and a license). The costs are lopsided: a false greenfield wastes a conversation, a false brownfield writes wrong artifacts. The user needs an explicit override in both directions.
- **Retroactive slices and the review gate.** The gate exists to block unreviewed work from advancing. Retroactive entries were never under the process, so the gate has nothing to say about them. They still must not become a loophole that new work can use. The marker's semantics, and who may set it, need a decision before the slice plan slice is designed.
- **Granularity of recorded history.** Code that was never sliced has no natural slice boundaries. Too fine, and the plan is noise; too coarse, and later slices can't reference what they build on. Index allocation for retroactive entries has to leave room for new work without colliding with it.
- **Squadron's graph dependency.** Squadron's path needs the `understand-anything` plugin and its knowledge graph. CF's path cannot depend on either. Both paths must produce artifacts the rest of CF treats identically.
- **Unsettled cross-repo contract.** Squadron 400 and 440 are not yet designed, so the handoff interface (how CF detects availability, invokes the flow and recognizes its output) is a negotiation with squadron, not a given. Slice 363's stated boundary with `/cf:onboard` is the starting point: onboard owns setup and the conversational path, squadron owns the artifact-derived path.
- **Reconciliation is judgement.** Deciding that two rules contradict is semantic. Core can enumerate rule sources and the guide rules that apply; the comparison itself is agent work. It also has to coexist with #123's CLAUDE.md/AGENTS.md split and with existing managed blocks.
- **Mapping without moving.** Existing docs have inbound links, tooling and owners. Referencing them in place keeps those intact, but leaves CF artifacts pointing outside `project-documents/`. Introspection has to tolerate that.
- **Guide release coupling.** Brownfield prompts and the adoption guide ship in ai-project-guide. cf surfaces that reference them can't ship ahead of the guide release that contains them, which is the same ordering rule as the docs-only boundary.
- **Duplicated onboarding recipes.** Three copies of the greenfield recipe exist today. Adding a brownfield branch to each multiplies drift. Whether they converge on one source is a decision for the first slice.

## Anticipated Slices

- **Brownfield detection and onboard branching:** a core detection report, consumed by the onboard skill, its Codex variant and `agent_onboard`. Greenfield output stays byte-identical.
- **Squadron handoff:** detect squadron's adoption flows, offer them, and accept their output as standard CF artifacts. Agreed with squadron as the CF half of 440.
- **Reverse-engineered architecture:** drive the agent from code to an architecture document, with provenance marking it as derived.
- **Existing-state slice plan:** record built work as retroactive completed slices, with checker and review-gate awareness of the retroactive marker.
- **Conventions reconciliation:** enumerate conflicts between the project's rules and the guide's, record resolutions, and make `setup-ide` honor them. Sequenced with #123.
- **Docs, ADR and CI mapping:** link existing material into project-documents in place, and make `/setup-ci` recognize CI it doesn't own.
- **Brownfield-aware `cf next`:** distinguish an adopted project from a fresh one and resume at the first new work item.

## Related Work

- [200-arch.developer-onboarding.md](200-arch.developer-onboarding.md): parent onboarding flow (`cf init`, onboard skill, `project_create`, first-run `cf next`) that this initiative branches.
- [160-arch.project-workflow-system.md](160-arch.project-workflow-system.md): workflow navigator and consistency checker that brownfield-aware navigation and the retroactive marker extend.
- [240-arch.review-aware-workflow-gating.md](240-arch.review-aware-workflow-gating.md): the review gate that retroactive slices must coexist with.
- Issue #123: splitting CLAUDE.md and AGENTS.md by audience in `setup-ide`. It shares the ground with conventions reconciliation.
- Squadron `360-arch.document-intelligence.md`, slice 363 (concept generation, complete) and slice 364 (initiative candidates): the squadron flows the handoff targets. Squadron initiatives 400 and 440 are the paired adoption work.
- ai-project-guide: brownfield/adoption guide, a concept guide that doesn't assume a new idea, and removal of the stale `analyze-codebase` profile. These are guide-side dependencies.
