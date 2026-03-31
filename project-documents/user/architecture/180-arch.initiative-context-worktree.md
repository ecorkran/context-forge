---
docType: architecture
layer: project
project: context-forge
archIndex: 180
component: initiative-contexts
dateCreated: 20260306
dateUpdated: 20260306
status: in-progress
relatedSlices: []
riskLevel: medium
---

# Architecture: Initiative Contexts (Worktrees)

## Overview

Context Forge currently models each project as a single workflow position: one active phase, one active slice, one task file. This reflects a serial working style — one initiative at a time, one slice at a time. The rise of git worktrees as standard infrastructure for parallel AI agent development breaks this assumption. A developer running three agents in three worktrees, each progressing through a different architectural initiative, needs three independent workflow positions within a single project.

This component introduces **initiative contexts** — lightweight, per-initiative workflow state that allows Context Forge to track multiple concurrent positions within a single project. Each context is optionally associated with a git worktree directory, enabling CWD-based resolution to determine not just *which project* but *which initiative* the developer is working in.

**Scope:** This component covers the data model split (project identity vs. initiative-scoped workflow state), CLI commands for context management, and updates to CWD resolution to be worktree-aware. It is CLI-only; MCP tool updates are deferred to a future initiative. It does not wrap or replace any git commands — git worktree management remains the user's responsibility.

**Motivation:** Git worktrees have moved from an obscure git feature to the primary mechanism for running parallel AI coding agents. Cursor ships parallel agents backed by worktrees. Claude Code users routinely create worktrees to run multiple agents on different branches simultaneously. Anthropic documents the pattern officially.

Context Forge's current model cannot support this workflow:

- **CWD resolution doesn't match worktrees.** A project registered at `~/repos/orchestration` won't be found when running `cf status` from `~/repos/orchestration-api/`, a sibling worktree directory. The `findProjectByCwd` longest-path match only works for subdirectories of the registered path.
- **Workflow state is singular.** Even if CWD resolution were extended to find the project, all worktrees would resolve to the same phase, slice, and tasks. Setting `cf set slice 103` in one terminal would change the state visible in all terminals. This makes `cf status` misleading and `cf build` unreliable when working in parallel.
- **Initiative-level work is the natural unit.** In practice, each worktree runs a coherent stream of work within an architectural initiative — a set of related slices sharing an index range and architecture document. The 100-band slices are API work, the 200-band is UX, the 300-band is data pipeline. Each progresses independently through the methodology. The worktree provides filesystem isolation; the initiative provides logical isolation. This component connects the two.

## Design Goals

- **Independent workflow positions per initiative.** Multiple concurrent streams of work within a single project, each with its own phase, active slice, tasks, and instruction type. Setting the active slice in one context does not affect any other context.

- **Worktree-aware CWD resolution.** Running `cf status` from a worktree directory resolves to both the correct project and the correct initiative context. No flags required for the common case. The resolution chain extends naturally from the existing project resolution (slice 169).

- **Single project identity.** One project, one registration, one set of project-level documents (concept doc, configuration, coding rules). Initiative contexts are children of the project, not independent entities. The unified view is always available from the main worktree.

- **Git observes, cf annotates.** Git worktree creation and management remain git commands. Context Forge discovers worktrees via `git worktree list` and associates them with initiative contexts. No git wrapper commands. If the association workflow proves painful in practice, convenience commands can be added later.

- **Backwards compatibility.** A project with no initiative contexts behaves identically to today — an implicit default context holds the single workflow position. Existing `cf` commands, stored project data, and workflows continue to work unchanged. Initiative contexts are additive.

## Architectural Principles

- **Initiative is the context boundary.** The architectural initiative (identified by its index range) is the natural unit of parallel work. It has its own architecture document, its own slice plan, its own progression through methodology phases. The initiative *is* the context — not a branch, not a directory, not an arbitrary label.

- **Derive what you can, store what you must.** The active initiative is derivable from the active slice's index. The current git branch is observable from the worktree directory via git. The worktree-to-project association is discoverable via `git worktree list`. Store only the stable structural facts: this context owns this index range, this context is associated with this worktree path.

- **Progressive adoption.** A solo developer working serially never needs to create a context. A developer using worktrees creates contexts only for the worktrees they want cf to track. A team running parallel agents gets full per-initiative status. Each level of adoption adds capability without requiring the others.

- **CLI-first, MCP-later.** Worktrees are inherently a terminal workflow — you `cd` between directories, run agents in separate terminals. The CLI is the natural interface. MCP tools operate without CWD, which creates different design challenges (explicit context parameters, session affinity). Deferring MCP avoids premature abstraction.

## Current State

Context Forge's project data model stores workflow state directly on `ProjectData`:

```
ProjectData {
  id, name, projectPath,
  developmentPhase, fileSlice, fileTasks, instruction, workType,
  fileArch, fileSlicePlan, fileHLD, fileSpec,
  template, dateProject,
  customData: { recentEvents, additionalNotes, availableTools },
  createdAt, updatedAt
}
```

CWD resolution (slice 169) matches `process.cwd()` against registered `projectPath` values using longest-path prefix matching. Resolution chain: `--project` flag → CWD match → `default_project` config → error.

Key limitations for parallel work:

- **One workflow position.** `developmentPhase`, `fileSlice`, `fileTasks`, `instruction`, and `workType` are scalar fields on the project. There is no mechanism for multiple concurrent values.
- **Project-level artifact references.** `fileArch` and `fileSlicePlan` are singular fields. In practice, a project has multiple architecture documents and multiple slice plans — one per initiative. The current model can only reference one at a time.
- **Path matching is subtree-only.** `findProjectByCwd` matches directories that are equal to or children of `projectPath`. Sibling directories (where worktrees typically live) don't match.

## Envisioned State

After this component is complete, Context Forge's project model has two layers:

**Project layer** — shared identity, project-level documents, and configuration. Unchanged from today except that initiative-scoped workflow fields move to the context layer.

```
ProjectData {
  id, name, projectPath,                     // identity
  conceptDoc?,                                // phase 1 document — project level
  template, dateProject,                      // configuration
  customData: { recentEvents, additionalNotes, availableTools },
  contexts: InitiativeContext[],              // zero or more
  createdAt, updatedAt
}
```

**Initiative context layer** — per-initiative workflow state, optionally bound to a worktree directory.

```
InitiativeContext {
  id, projectId,
  name,                    // human label: "API Foundation", "UX Layer"
  indexRange,              // [100, 199] — the index band this context owns
  worktreePath?,           // filesystem path where this context resolves via CWD
  archDoc?,                // initiative architecture document reference
  slicePlan?,              // initiative slice plan reference

  // workflow position (moved from ProjectData)
  developmentPhase,
  activeSlice?,
  activeTaskFile?,
  instruction,
  workType
}
```

The split is clean: everything that varies per-initiative moves to `InitiativeContext`. Everything that describes the project as a whole stays on `ProjectData`.

### Resolution Chain

CWD resolution becomes two-phase:

1. **Resolve project.** Extended `findProjectByCwd` checks both registered `projectPath` and all `contexts[].worktreePath` values. Longest match wins. If CWD matches a worktree path, we know both the project *and* the context.
2. **Resolve context.** If step 1 matched via a worktree path, the context is determined. If step 1 matched via the main `projectPath` (the root checkout), the project resolves with no specific context — this is the "project overview" position.

```
--project flag → CWD match (projectPath or worktreePath) → default_project config → error
                     ↓
              if matched via worktreePath → context resolved
              if matched via projectPath  → project-level (no context / default)
```

An explicit `--initiative` or `--context` flag can override context resolution from any directory.

### Worktree Discovery

Context Forge discovers worktrees by shelling out to `git worktree list --porcelain` from the project root. This returns all linked worktrees with their paths and checked-out branches. Discovery is used for:

- **Matching.** When a user runs `cf context init` from a worktree directory, cf confirms the directory is a known worktree of the project.
- **Display.** `cf project overview` can show worktree associations and current branches.
- **Validation.** If a context's `worktreePath` no longer appears in `git worktree list`, cf can warn that the worktree has been removed.

Discovery is read-only — cf never creates, moves, or removes worktrees.

### CLI Interface

**From a linked worktree** (`~/repos/orchestration-api/`):

```
$ cf status

Project:    orchestration
Initiative: API Foundation [100-199]  (from worktree)
Branch:     feature/100-api
Phase:      implementation
Slice:      103-cli-foundation  (in progress, 8/12 tasks)
Next:       104-sdk-client-warm-pool
```

**From the main worktree** (`~/repos/orchestration/`):

```
$ cf status

Project:    orchestration
Phase 1:    complete

Active initiatives:
  [100-199]  API Foundation    → 103-cli-foundation (implementation)
  [200-299]  UX Layer          → 203-component-lib (slice-design)
  [300-399]  Data Pipeline     → 301-schema-design (task-breakdown)
```

**Initiative detail from anywhere:**

```
$ cf status --initiative 200

Initiative: UX Layer [200-299]
Branch:     feature/200-ux
Arch:       200-arch_ux-layer.md
Slice Plan: 200-slices_ux-layer.md (3/8 complete)
Phase:      slice-design
Slice:      203-component-lib
Tasks:      —
Next:       create task breakdown for 203
```

**Listing projects with worktree info:**

```
$ cf project list --trees

  Project        Initiative        Range     Branch           Worktree Path                    Phase
  ─────────────  ────────────────  ────────  ───────────────  ───────────────────────────────  ───────────
  orchestration  (root)            —         main             ~/repos/orchestration/            —
                 API Foundation    100-199   feature/100-api  ~/repos/orchestration-api/        implementation
                 UX Layer          200-299   feature/200-ux   ~/repos/orchestration-ux/         slice-design
                 Data Pipeline     300-399   feature/300-data ~/repos/orchestration-data/       task-breakdown
```

**Context management commands:**

```
# Create a context (from a worktree directory)
$ cd ~/repos/orchestration-api
$ cf context init --name "API Foundation" --range 100-199

# Create a context (from anywhere, specifying worktree path)
$ cf context init --name "API Foundation" --range 100-199 --path ~/repos/orchestration-api

# List contexts for current project
$ cf context list

# Remove a context
$ cf context rm "API Foundation"

# Setting workflow state (scoped to resolved context)
$ cd ~/repos/orchestration-api
$ cf set slice 103
$ cf set phase implementation
```

### Default Context and Backwards Compatibility

A project with zero explicit contexts behaves exactly as it does today. The workflow fields remain on `ProjectData` and are used directly. This is the **implicit default context** — no `InitiativeContext` object exists, and all existing commands work unchanged.

When a project's first explicit context is created, the existing workflow fields on `ProjectData` are migrated into an explicit `InitiativeContext` and cleared from the project level. This one-time migration is simpler than indefinitely maintaining two resolution code paths (context-based vs. direct-on-project). The migration is local to a single project and reversible — removing the last context moves fields back to the project level.

### What Stays Shared vs. Per-Context

**Project-level (shared):**
- Project identity: name, path, registration
- Phase 1 concept document
- Configuration: templates, guide settings, coding rules
- Cross-cutting artifacts: DEVLOG, CLAUDE.md
- The project store entry itself

**Initiative-level (per-context):**
- Architecture document (`nnn-arch.*`)
- Slice plan (`nnn-slices.*`)
- All slice designs and task breakdowns within the index range
- Current methodology phase
- Active slice, active task file
- Instruction type, work type

This reflects how the ai-project-guide methodology actually works: phase 1 happens once at the project level; phases 2-7 repeat independently per architectural initiative.

## Technical Considerations

- **Storage.** Initiative contexts could be stored as nested objects within the existing `ProjectData` JSON, or as separate files in a `contexts/` subdirectory of the project store. Nested storage is simpler; separate files allow independent updates without read-modify-write on the whole project. Decision deferred to slice design.

- **Index range validation.** Ranges should be checked for overlap when creating a new context. Non-overlapping ranges are a convention, not a hard constraint — cf should warn on overlap, not block. Some users may intentionally share ranges (e.g., a context that spans two related initiatives).

- **Worktree path stability.** Worktree directories can be moved or removed outside of cf's knowledge. The `worktreePath` should be validated on use (does this directory still exist? does `git worktree list` still report it?) rather than assumed correct.

- **Branch display.** The current git branch for a worktree is read at display time via `git -C <worktreePath> rev-parse --abbrev-ref HEAD`. This is cheap and always current. No branch storage needed.

- **Artifact reference resolution.** When `archDoc` and `slicePlan` are set on a context, `cf build` should use them to assemble context for that initiative. This extends the existing context assembly pipeline, which already supports `fileArch` and `fileSlicePlan` — the difference is that these references now come from the context rather than the project.

- **Workflow navigator integration.** The workflow navigator (160-band, slice 165) will need to operate per-context: "what's next for this initiative?" rather than "what's next for this project?" This is a natural fit — the navigator already works from a slice plan and active slice, which are per-context fields. The integration is: pass context's `slicePlan` and `activeSlice` instead of project-level equivalents.

- **MCP deferral.** MCP tools currently operate on `ProjectData` directly. Adding initiative context support to MCP requires deciding how a stateless tool call identifies which context to operate on. Options include an explicit `context` parameter, session-level context binding, or deriving context from the `fileSlice` value. This design space is deferred; CLI proves the model first.

## Anticipated Slices

At a high level, this initiative decomposes into the following areas. These are exploratory — exact boundaries will be determined during slice planning.

- **InitiativeContext data model and storage.** Define the `InitiativeContext` type, decide storage strategy (nested in project JSON vs. separate files), implement CRUD operations. Includes the migration logic for moving workflow fields from `ProjectData` to a context on first context creation. This is the foundation everything else depends on.

- **Worktree-aware CWD resolution.** Extend `findProjectByCwd` to match against context `worktreePath` values in addition to project `projectPath`. Two-phase resolution: project first, then context. Includes `git worktree list --porcelain` parsing for discovery and validation. Extends the resolution chain from slice 169.

- **`cf context` CLI commands.** The `init`, `list`, `rm` subcommands for managing initiative contexts. `init` associates a worktree path and index range with a named context. Includes index range overlap detection (warn, not block). The `cf set` command becomes context-aware — when resolved to a context, workflow field updates target the context, not the project.

- **Status and display updates.** Update `cf status` to show initiative-scoped output from worktrees and project-level dashboard from the main checkout. Update `cf project list --trees` to show worktree/initiative associations. Branch display via `git rev-parse`. This is the user-facing payoff — the previous slices are plumbing, this one makes it visible.

- **Context-aware context assembly.** Update `cf build` to source `archDoc`, `slicePlan`, `activeSlice`, and `activeTaskFile` from the resolved context rather than from project-level fields. When building from a worktree, the assembled context reflects the initiative's documents, not the project's last-set values.

- **Validation and edge cases.** Worktree path validation (does the directory still exist? does git still know about it?), stale context detection, graceful behavior when a worktree is removed without cleaning up the context. First-run experience: helpful messaging when `cf status` runs from an unrecognized worktree of a known project.

## Related Work

- **160-arch: Project Workflow System** (`user/architecture/160-arch_project-workflow-system.md`) — This initiative builds directly on the 160-band's schema standardization (161), config system (162), and artifact introspection (163). The workflow navigator (165) will need per-context awareness but is not a hard prerequisite — it can be adapted after this initiative lands.

- **169: Multi-Project & UX Polish** (`user/slices/169-slice_multi-project-ux-polish.md`) — CWD resolution chain, `findProjectByCwd`, `findByNameOrId`, and `resolveProjectId`. This initiative extends that resolution from project-level to project+context-level.

- **170: Project Model Cleanup & CLI Init** (`160-slices_project-workflow-system.md`, item 10) — Clean project model with monorepo fields removed, `cf init` command. The initiative context model builds on the cleaned schema.

- **120-arch: Automated Development Pipeline** (orchestration project) — ADP's pipeline executor is a future consumer of per-context workflow state. This initiative provides the state model; ADP provides the automation. No direct dependency, but the `InitiativeContext` structure should be consumable by pipeline definitions.

- **Git worktree ecosystem** — Cursor parallel agents, Claude Code worktree patterns, `@johnlindquist/worktree` CLI. This initiative responds to the broader shift toward worktree-based parallel development in AI-augmented workflows.

## Non-Goals

- **MCP support.** Deferred. CLI proves the model; MCP adapts later.
- **Git command wrapping.** No `cf worktree add`. Users manage worktrees with git.
- **Parallel agent orchestration.** This component provides per-initiative state tracking, not agent lifecycle management. Agent orchestration belongs to the orchestration project's ADP (120-arch).
- **Inter-initiative dependency tracking.** Initiatives are independent workflow streams. Cross-initiative dependencies exist (e.g., "UX initiative slice 203 depends on API initiative slice 101") but tracking them is a separate concern.
- **Automatic context creation.** Running `cf status` from an unrecognized worktree shows a helpful message, not an auto-created context. Contexts require explicit `cf context init`.
