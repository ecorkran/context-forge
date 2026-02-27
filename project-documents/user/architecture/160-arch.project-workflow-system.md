---
docType: architecture
layer: project
project: context-forge
archIndex: 160
component: project-workflow-system
dateCreated: 20260226
dateUpdated: 20260226
status: in_progress
relatedSlices: []
riskLevel: medium
---

# Architecture: Project Workflow System

## Overview

Context Forge currently manages project state (CRUD on project configurations) and assembles context prompts from that state. What it lacks is *workflow awareness* — understanding where a project sits within the ai-project-guide methodology and what the logical next action is. This component adds that understanding through four coordinated capabilities: schema standardization, persistent configuration, enriched workflow state, and a navigation engine that can answer "what's next?"

**Scope:** This component encompasses the data model changes, configuration infrastructure, and introspection logic needed for Context Forge to understand methodology progression. It does not include automation execution (that's the Automated Development Pipeline, 120-arch in orchestration) or guide file management (780-band slices). It provides the *awareness layer* that both humans and automation consume.

**Motivation:** The current project data model was designed for the Electron GUI's context assembly workflow — picking a slice, a task file, an instruction type, and generating a prompt. It treats projects as flat configurations rather than as entities progressing through a structured methodology. This creates two problems:

- **Cognitive load on resume.** After any break from a project, the human must manually reconstruct where things stand: which slices are done, what phase the current slice is in, whether tasks exist, what needs attention next. This reconstruction is tedious and creates a "wall" that turns natural breaks into stalls.
- **Agents can't self-orient.** An AI agent working in a project has no way to ask Context Forge "what should I work on next?" It can get the current slice name, but can't determine whether that slice's tasks are complete, whether the next slice needs design work, or whether the slice plan is fully delivered. All of that requires human interpretation of markdown files.

Both problems share a root cause: Context Forge stores *what you told it* but doesn't understand *what that means* in the context of the methodology.

## Design Goals

- **Methodology-aware project state.** The project data model should reflect where a project actually is in the ai-project-guide methodology — not just which fields a user last set, but what artifacts exist, what's complete, and what phase applies. This is the foundational data model change that everything else builds on.

- **Self-describing project identity.** Every project and its artifacts should unambiguously identify themselves — which project they belong to, what type of document they are, and how they relate to other artifacts. This eliminates the "wait, what project is this from?" problem that occurs during cross-project work and prevents index collisions when artifacts from multiple projects coexist in shared contexts.

- **Low-friction state persistence.** Configuration and workflow preferences should persist across sessions without requiring repetitive parameter passing on every MCP tool call. A developer (or agent) sets their working context once; subsequent operations inherit it. Two tiers: user-level defaults and project-level overrides.

- **Actionable workflow navigation.** Given a project's current state and its on-disk artifacts, Context Forge should be able to determine the next logical action in the methodology. This ranges from simple ("current slice has unfinished tasks → implement next task") to structural ("all slices complete → check for undefined architecture components"). The navigation should *report* what's next; *executing* the next action is the consumer's responsibility.

- **Automation-ready interfaces.** Everything this component provides should be consumable by both humans (via MCP tools in an IDE) and automation systems (via programmatic MCP calls from the Automated Development Pipeline). The interfaces should not assume an interactive human is present, but also should not require automation infrastructure to be useful.

## Architectural Principles

- **Introspection over declaration.** Where possible, derive workflow state from actual project artifacts (files on disk, checkbox states in markdown, existence of design/task documents) rather than requiring the user to manually declare status. Declared state (e.g., `project_update phase implementation`) is a fallback and override, not the primary source of truth.

- **Progressive enrichment.** The system should function at every level of adoption. A project with nothing but a name and path still works with basic context assembly. A project with a populated slice plan gets navigation. A project with full artifact coverage gets precise next-action recommendations. No capability should *require* full adoption to provide value.

- **Schema-first evolution.** Data model changes come before features that consume them. Standardize the schema, then build config on the standardized schema, then build navigation on the enriched state. Each layer trusts the one below it.

- **Read-heavy, write-light.** Workflow state is queried far more often than it's modified. The navigation engine reads artifacts and computes state on demand rather than maintaining a separate synchronized state store. Config writes are infrequent (set once, read many). This simplifies consistency — there's no cache invalidation problem because the source of truth is always the artifacts themselves.

- **Separation of awareness and action.** This component answers "where are you?" and "what's next?" It does not answer "do the next thing." Execution belongs to the consumer — whether that's a human deciding to open a slice design session, or the ADP dispatching an agent. This boundary is critical: crossing it would make the workflow system responsible for the correctness of actions it triggers, which is a different and much larger problem.

## Current State

Context Forge's `ProjectData` schema stores the following per project:

```
id, name, template, slice, taskFile, instruction, developmentPhase,
workType, projectDate, isMonorepo, isMonorepoEnabled, projectPath,
customData: { recentEvents, additionalNotes, monorepoNote, availableTools },
createdAt, updatedAt
```

Key limitations:

- **Inconsistent field naming.** `projectDate` doesn't follow the `dateX` convention used by `dateCreated`/`dateUpdated`. `slice` and `taskFile` are bare strings with no naming pattern. `isMonorepo` and `isMonorepoEnabled` are redundantly similar.
- **No artifact references.** There's no way to record which architecture doc, HLD, slice plan, or spec a project is associated with. Context assembly targets slice + tasks, but architectural and design work needs broader context that currently must be manually specified each time.
- **No structural awareness.** The `slice` field stores a name, not a position in a plan. There's no connection to a slice plan, no understanding of which slices are complete, and no concept of "the current slice's phase" beyond what was last manually set in `developmentPhase`.
- **No configuration persistence.** Every MCP session starts from scratch. Preferences like default project, guide behavior, or workflow settings must be passed as parameters or re-established by the caller.
- **No cross-project self-identification.** The `ProjectData` doesn't include the project name in a way that propagates to generated artifacts. When artifacts from multiple projects appear in the same context (common in this multi-project workflow), it's not always clear which project an artifact belongs to without reading its content.

The MCP tools (`project_list`, `project_get`, `project_update`, `context_build`, `context_summarize`) operate on this schema and expose its limitations directly. `project_update` can set any field, but the fields available don't capture methodology state.

## Envisioned State

After this component is complete, Context Forge's project model captures three layers of information:

**Identity and configuration** — standardized, self-describing fields that unambiguously identify a project and its persistent preferences. Schema is consistent (`dateX` convention, `fileX` for artifact references), and configuration persists in TOML files at user and project levels with clear resolution precedence.

**Artifact awareness** — the project knows which methodology artifacts exist and where they are. Fields like `fileHLD`, `fileArch`, `fileSlicePlan`, `fileSlice`, `fileTasks` reference actual documents. The system can resolve these references to files on disk and determine their presence/absence. This enriches context assembly (the template engine can include referenced architecture docs when they're populated) and provides the data foundation for navigation.

**Workflow position** — given a project's artifacts and their content, the system can compute a workflow status that describes: which methodology phase the current work is in, what the completion state of the current slice plan is, which slice is active and what phase it's in (needs design / needs tasks / in implementation / complete), and what the recommended next action is. This computation is performed on demand by reading artifacts, not by maintaining separate state.

The MCP interface exposes this through enhanced existing tools (richer `project_get` output, `project_update` accepting new fields) and new tools for configuration management and workflow navigation. An agent or human can ask "what's the status of project X?" and receive a structured answer that includes methodology position, not just stored field values.

## Technical Considerations

- **Artifact parsing boundaries.** The navigation engine needs to read and interpret markdown files — slice plans with checkbox lists, task files with completion markers, YAML frontmatter with status fields. The question is how deeply to parse. Checkbox counting (`- [x]` vs `- [ ]`) is straightforward. Interpreting *which* unchecked item is "next" requires understanding document structure (ordered lists, dependency annotations). The design should start with what's cheaply parseable and extend as needed, avoiding a full markdown AST.

- **Schema migration for existing projects.** Renaming fields and adding new ones to `ProjectData` affects every stored project. The `FileProjectStore` reads/writes JSON files in `~/.config/context-forge/projects/`. Migration must handle: reading old-schema files without error, writing new-schema files on any update, and optionally bulk-migrating on first run. This is not complex but must be explicitly designed to avoid data loss.

- **Config resolution precedence.** The config system introduces a multi-tier resolution chain: MCP tool parameter → project-level config (`.context-forge.toml`) → user-level config (`~/.config/context-forge/config.toml`) → built-in default. This is a well-understood pattern but the implementation must be clear about which tier "wins" and must report the resolution source when queried (so a user can debug unexpected behavior).

- **Staleness and cache semantics.** Because the navigation engine reads files on demand, it always reflects current disk state — no cache invalidation problem. However, repeated calls in quick succession (e.g., an agent querying status after each task completion) will re-read and re-parse the same files. If this becomes a performance concern, a short-lived in-memory cache with file-mtime invalidation is the natural solution, but should not be built speculatively.

- **Cross-project scope.** Context Forge manages multiple projects. The workflow navigation must be project-scoped — "what's next for project X?" not "what's next across all projects?" Cross-project prioritization is a human or automation-layer concern, not something the workflow system should attempt. However, a `workflow_status_all` that returns the top-level status of each project (one-liner per project) would be useful for a human trying to remember where everything stands.

- **Methodology version coupling.** The navigation engine encodes assumptions about the ai-project-guide methodology structure (phases 1-7, slice plans contain checkboxes, task files have completion markers). If the methodology evolves, the navigator needs updating. This coupling is acceptable — the methodology is the product, and the navigator is a reflection of it — but the parsing logic should be modular enough that methodology changes don't require a rewrite.

## Anticipated Slices

These are provisional slice concepts, not commitments. Sequencing and boundaries will be refined during slice planning.

- **Project Schema Standardization.** Normalize `ProjectData` field naming, add artifact reference fields (`fileHLD`, `fileArch`, `fileSlicePlan`), implement schema migration for existing stored projects, and update MCP tool input schemas. This is foundation work — everything else builds on the clean schema. Largely specified in 140-slices future work #1; migrates into this initiative.

- **Config System.** Persistent two-tier TOML configuration (user-level, project-level) with MCP tools (`config_set`, `config_get`, `config_list`). Resolution chain with source reporting. Already well-specified in 780-slices; migrates into this initiative with scope limited to config plumbing (guide-related config keys included but guide management features stay at 780).

- **Artifact Introspection Engine.** The layer that reads project artifacts from disk and extracts structured information: slice plan parsing (checkbox states, slice names, ordering), task file parsing (completion counts), design/architecture document detection (existence checks, frontmatter extraction). This is the "eyes" that the navigation engine uses. Separated from navigation because introspection is useful independently (e.g., for richer `project_get` responses that include computed fields like "7 of 12 slices complete").

- **Workflow Navigator.** The capstone. Consumes artifact introspection to compute methodology position and next-action recommendations. Exposed as MCP tool(s) — likely `workflow_status` (where am I?) and `workflow_next` (what should I do?). Implements the state machine logic: check current slice completion → check slice plan → check architecture components → check project-level artifacts → report recommendation. Output is structured (machine-readable) with human-friendly descriptions.

- **Consistency Checker.** Compares related artifact states and flags mismatches — e.g., a task file with all tasks marked complete but the slice still showing "in progress" in the slice plan, or a slice marked complete in the plan but its frontmatter status not updated. Consumes the artifact introspection engine (read side) and optionally writes back corrections (check a box, update a status field). The write-back/"fix" capability is the substantive part — introspection already provides the detection. May support an autofix config setting for non-destructive corrections. Project-scoped; a hypothetical "fix all" applies project-scope checks in a loop across all managed projects.

- **Future Work Collector.** Walks all slice plans in a project, extracts "Future Work" sections, and presents them grouped by source architecture component. Future work items currently accumulate in individual slice plans and are only discovered by manually scanning files. This tool surfaces them in one place, making it easier to answer "what's on the backlog?" at a strategic level. Pulling items out of future work into real slices remains a manual/human decision (as we did with this initiative). Project-scoped; an "all projects" mode iterates across managed projects.

## Related Work

- **140-arch.context-forge-restructure** — The restructure that created the current MCP server architecture. This initiative's future work section (#1: Project Schema Standardization, #2: Command Grammar) directly feeds into this component. Schema standardization migrates here; command grammar may remain independent or attach to this initiative during slice planning.

- **120-arch.automated-dev-pipeline** (orchestration project) — The ADP is the primary automation consumer of workflow navigation. It depends on Context Forge's ability to report project status and next actions. This component provides the awareness layer; ADP provides the execution layer. Note: 120 is an orchestration-project artifact, not context-forge — cross-project dependency.

- **780-slices.future.guide-management** — Guide install, update, and auto-update features. These consume the config system (specifically `guide.*` config keys) but are not part of workflow awareness. They remain at 780 with a dependency on the config slice from this initiative.

- **ai-project-guide process methodology** (guide.ai-project.000-process) — The methodology whose phases and structure the workflow navigator encodes. Changes to the methodology's phase structure or artifact conventions would require corresponding updates to the navigator's parsing and state machine logic.
