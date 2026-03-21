---
docType: architecture
layer: project
parent: user/architecture/140-arch.context-forge-restructure.md
project: context-forge
archIndex: 200
component: developer-onboarding
dateCreated: 20260314
dateUpdated: 20260314
status: in-progress
relatedSlices: []
riskLevel: low
---

# Architecture: Developer Onboarding & First-Run Experience

## Overview

Context Forge is powerful once running — worktree-aware context assembly, methodology introspection, workflow navigation — but the path from discovery to first useful output requires too many manual steps and too much prior knowledge. A new user must: install the npm package, initialize git, run `cf init`, install guides, install slash commands, configure their IDE, then figure out what to do next. Each step presupposes knowledge of the system.

This initiative collapses the onboarding path. For CLI users, one command does full setup. For AI-assisted users, the MCP server and an onboarding skill guide the entire flow conversationally. The goal is: **from `npm install` to useful context output in under two minutes, regardless of whether the user starts from an empty directory or an existing repository.**

## Motivation

Context Forge manages 10+ projects today across a single power user's workflow. Expanding adoption — even to a handful of collaborators or open-source contributors — requires an onboarding experience that doesn't depend on oral tradition. The existing setup sequence works but isn't discoverable:

```bash
# Current: 5 commands, each requiring knowledge of CF
mkdir my-project && cd my-project
git init && cf init
cf guides install
cf install-commands
cf setup-ide claude
```

The commands exist. The automation exists. The composition doesn't.

## Design Goals

**Single-command CLI setup.** `cf init` should handle the full setup by default — project creation, guide installation, command installation, IDE configuration. A `--lite` flag provides the minimal path for users who want control. Running `cf init` in an existing repository should be safe and intelligent.

**MCP-driven conversational onboarding.** An AI agent connected via MCP should be able to create a project, install guides, and initiate the Phase 1 (Concept) conversation — essentially becoming the onboarding wizard. This requires a `project_create` MCP tool and an onboarding skill that sequences the flow.

**Existing-repo adoption as first-class path.** Most real adoption will be retrofitting CF into an existing project, not greenfield. `cf init` must detect existing git repos, existing `project-documents/` structures, and registered projects, adapting its behavior accordingly.

**Clear "what's next" guidance.** After init, a new user should never wonder what to do. `cf next` on a fresh Phase 1 project should provide actionable, helpful guidance — not a terse status message.

## Architectural Principles

**Detection over configuration.** `cf init` should infer as much as possible from the environment — directory name as project name, existing git state, presence of project-documents/, whether the path is already registered. Ask the user only when inference fails.

**Full by default, minimal on request.** The default `cf init` does everything needed to start working. `--lite` is the escape hatch for power users who want granular control. This inverts the typical CLI pattern (minimal default, flags to add) because CF's value requires the full stack to be present.

**Composability preserved.** The full init composes the existing atomic operations (`cf guides install`, `cf install-commands`, `cf setup-ide`). These remain independently callable. Init is a composition layer, not a replacement.

**Skill over server logic for conversational flows.** The MCP server stays atomic and composable. The intelligence for sequencing onboarding steps lives in a skill/prompt that any AI client can consume, not in a monolithic server-side `project_onboard` tool.

## Current State

**What exists today:**

- `cf init` — Creates a project entry in CF's storage. Sets `projectPath` to CWD. Requires git to be initialized. Does not install guides, commands, or configure the IDE.
- `cf guides install` — Downloads and installs ai-project-guide into the project. Works reliably.
- `cf install-commands` — Installs/updates slash commands for Claude Code. Idempotent.
- `cf setup-ide claude` — Generates CLAUDE.md and related config. Handles existing files safely (backup + confirmation).
- `project_list`, `project_get`, `project_update` — MCP tools for reading and modifying projects. No creation tool exists.
- Bundled prompt system — CF works out of the box with bundled templates even without ai-project-guide installed (delivered in 160-band).
- Haiku checkbox agent — Installed by `setup-ide claude`. Functions well as a Claude Code sub-agent for mechanical tasks.

**What's missing:**

- `cf init` doesn't compose the setup steps. User must know to run each subsequent command.
- No `project_create` MCP tool. Projects can only be created via CLI.
- No onboarding skill/prompt. AI agents have no recipe for guiding a new user through setup.
- `cf next` on a fresh project could give better first-run guidance.
- No detection of existing repo state during init (already a CF project? has project-documents? no git?).

## Envisioned State

A single `cf init` command handles the full onboarding lifecycle — detecting environment state, composing existing atomic operations, and leaving the project ready to use. An AI agent connected via MCP can replicate the full setup conversationally using the `project_create` tool and an onboarding skill. After setup, `cf next` provides rich first-run guidance tailored to sparse project state, transitioning naturally to its standard concise recommendations as the project matures.

## Technical Considerations

- **Detection edge cases in `cf init`.** Unusual directory states (git worktree of unregistered project, partially-initialized CF project, monorepo subdirectory) require conservative detection with clear messaging when ambiguous. Never destructive — if unsure, ask or skip.
- **Skill maintenance burden.** The onboarding skill references specific MCP tool names and parameters. Skills are plain text files, easy to update alongside tool changes, but there's no automated verification that the skill matches current tool signatures.
- **IDE assumption.** Defaulting to `claude` as the `--ide` target won't suit Cursor-primary users. The `--ide` flag and `--no-ide` escape hatch address this; Cursor support is the planned second target.
- **`cf next` state detection scope.** Enhanced first-run guidance requires the workflow navigator to identify "sparse" project state — few artifacts, early phases, no active slice. This detection logic must remain lightweight and not slow the hot path for established projects.

## Design

### Smart `cf init` — CLI Entry Point

`cf init` becomes the single CLI entry point for all onboarding scenarios. It detects the current state of the working directory and adapts.

**Detection matrix:**

| Condition | Behavior |
|---|---|
| No `.git` directory | Initialize git, then proceed with full setup |
| `.git` exists, no CF project at this path | Create project, full setup |
| `.git` exists, CF project already registered here | Print status, suggest `cf status`. No-op (safe to re-run). |
| `project-documents/` exists | Detect existing structure, skip guide install if guides present, register project if not registered |
| `project-documents/ai-project-guide/` exists | Skip guide installation, proceed with other setup |
| Slash commands already installed | `cf install-commands` is idempotent — runs anyway, updates if needed |
| `CLAUDE.md` or IDE config exists | `cf setup-ide` handles this (backup + skip logic already implemented) |

**Command interface:**

```bash
# Greenfield — full setup, name from argument or directory name
cf init my-project

# Existing repo — detects state, fills gaps
cd ~/repos/existing-project
cf init

# Explicit name for existing repo
cd ~/repos/existing-project
cf init --name "My Cool Project"

# Minimal setup — project entry only, no guides/commands/IDE
cf init --lite

# Skip IDE configuration specifically
cf init --no-ide

# Use Cursor instead of Claude (Claude is default)
cf init --ide cursor
```

**IDE strategy:** Claude Code is the default `--ide` target. This reflects the current user base and the deepest integration (haiku checkbox agent, slash commands, CLAUDE.md). Cursor support is the next priority. Additional IDEs can be added as `setup-ide` gains support for them.

**Default behavior (no flags):**

1. Check for git — init if missing
2. Check for registered CF project at CWD — if found, print status and exit
3. Create project: name from argument, or directory name, or prompt. Set `dateProject` to today, `developmentPhase` to "Phase 1: Concept"
4. Install guides (`cf guides install`) — skip if already present
5. Install commands (`cf install-commands`)
6. Configure IDE (`cf setup-ide claude`) — Claude is the default target; `--ide cursor` for Cursor, `--no-ide` to skip entirely
7. Print summary: what was set up, current status, and a nudge toward `cf next`

**Output after successful init:**

```
✓ Git repository initialized
✓ Context Forge project created: my-project
✓ AI Project Guide installed
✓ Slash commands installed
✓ Claude Code configured (CLAUDE.md)

Project ready. Run 'cf next' to get started.
```

**The `--lite` path:**

Steps 1-3 only. Creates the project entry and nothing else. For users who want to compose their own setup, or who are using CF in a non-standard configuration.

### `project_create` MCP Tool

A new atomic MCP tool that fills the "can't create via MCP" gap. Thin and composable — does project creation only, not the full init sequence.

**Parameters:**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `name` | string | yes | Project display name |
| `projectPath` | string | no | Absolute path to project root. Defaults to CWD if detectable, otherwise required. |
| `developmentPhase` | string | no | Initial phase. Defaults to "Phase 1: Concept". |

Concept description is deliberately excluded — that's the job of the Phase 1 conversation, not project creation. A project needs a name and a location to exist; everything else comes from the methodology workflow.

**Behavior:**

- Creates project entry in CF storage
- Sets `dateProject` to today
- Returns full project object (same shape as `project_get`)
- Errors if a project is already registered at the given path (with suggestion to use `project_get`)
- Does NOT install guides, commands, or configure IDE — those are separate MCP tools or CLI operations

**Rationale for keeping it thin:** The MCP server's tools are atomic operations. The onboarding skill handles sequencing. This mirrors the CLI design where `cf init` composes atomic steps by default.

### Onboarding Skill

A prompt/skill that teaches AI agents how to guide users through project creation and the first phase of work. Installable via `cf install-commands` alongside existing slash commands.

**The skill knows:**

1. How to create a project (`project_create` or suggest `cf init`)
2. How to check and install guides (`guide_status`, `guide_install`)
3. How to build the Phase 1 (Concept) prompt (`prompt_get` with `concept-phase-1`)
4. How to transition the user into a concept discussion naturally

**Conversation flow the skill enables:**

```
User: "I want to start a new project for a database migration CLI tool"
Agent: [calls project_create with name and path]
Agent: [calls guide_status, guide_install if needed]
Agent: [calls prompt_get for concept-phase-1]
Agent: "Great, I've set up your project. Let's talk about what you're building..."
       [begins Phase 1 concept discussion using the assembled prompt]
```

**Delivery mechanism:** Installed by `cf install-commands` alongside existing slash commands. This makes it available in Claude Code, the Claude VS Code extension, and any environment that supports custom commands or skills. For Claude Desktop, it can also be added as project knowledge. The `cf install-commands` path is already idempotent (updates if already installed), so the skill gets delivered and updated through the existing mechanism.

**Scope boundary:** The skill is a recipe, not application logic. It references existing MCP tools and CLI commands. If a tool doesn't exist, the skill suggests the CLI equivalent. This keeps the skill lightweight and version-tolerant.

### Enhanced `cf next` for First-Run

`cf next` (via the workflow navigator) should recognize first-run states and provide richer guidance than the standard workflow recommendation.

**First-run conditions and responses:**

| State | Current `cf next` behavior | Enhanced behavior |
|---|---|---|
| Phase 1, no concept doc | Generic recommendation | "Your project is in Phase 1 (Concept). Discuss what you want to build, then create a concept document at `user/project-guides/001-concept.{name}.md`. Use `cf build --phase concept` to generate a concept prompt for your AI agent." |
| Phase 2, no arch doc | "Create architecture document" | Same, plus: "If this is a small project, you can skip straight to a slice plan. Use `cf set phase 'Phase 3: Slice Planning'`." |
| No active slice set, has slice plan | Generic | "You have a slice plan but no active slice. Pick your first slice with `cf set slice <filename>` — usually the first foundation slice." |

The enhanced guidance is triggered by detecting sparse project state (few or no artifacts, early phases, no active slice) and front-loads actionable instructions. As the project accumulates state, `cf next` naturally transitions to its standard concise recommendations.

## Non-Goals

**Interactive CLI wizard.** `cf init` should not launch a multi-step interactive prompt session. Detection-based defaults with override flags is the right UX for a developer tool. If someone wants guided interaction, that's what the MCP/skill path provides.

**Web-based onboarding.** A self-hostable or hosted web interface for project creation is a valid future direction but is a separate initiative (estimated at 240-band). This initiative focuses on CLI and MCP paths.

**Project templates.** Pre-configured project archetypes ("CLI tool", "web app", "library") are a natural extension but not in scope here. Templates would build on top of `cf init` once the foundation is solid.

**Automated concept generation.** The onboarding skill guides the conversation but doesn't auto-generate concept documents. Phase 1 is a human-driven design conversation, not a scaffolding step.

## Dependencies

- **160-band (complete):** Config system, guide management, CLI foundation, workflow navigator, consistency checker, context profiles. All provide infrastructure this initiative consumes.
- **180-band (complete):** Worktree support. `cf init` must be worktree-aware (don't re-register a project when running from a worktree of an already-registered project).
- **ai-project-guide:** Guide install mechanism already exists. Init composes it.

## Anticipated Slices

- **Smart `cf init` composition** — Extend `cf init` to detect environment state and compose the full setup sequence. Includes git detection, existing-project detection, and the `--lite`/`--no-ide`/`--ide` flag surface.
- **`project_create` MCP tool** — New atomic MCP tool for project creation. Thin and composable — project entry only, no guide/command/IDE side effects.
- **Onboarding skill** — A prompt/skill that sequences setup conversationally via MCP. Delivered by `cf install-commands` alongside existing slash commands.
- **Enhanced `cf next` first-run guidance** — Extend the workflow navigator to detect sparse project state and provide richer, actionable recommendations for new users.

## Related Work

- [140-arch.context-forge-restructure.md](140-arch.context-forge-restructure.md) — Parent initiative. Established the monorepo, CLI foundation, MCP server, and core engine that this initiative composes.
- [160-arch.project-workflow-system.md](160-arch.project-workflow-system.md) — Delivered config system, guide management, workflow navigator (`cf next`), and consistency checker. All consumed directly by this initiative.
- [180-arch.initiative-context-worktree.md](180-arch.initiative-context-worktree.md) — Worktree support. `cf init` must be worktree-aware (don't re-register when running from a worktree of an already-registered project).

## Future Work

Items identified during design that are out of scope for this initiative:

1. **Web-based onboarding interface** — Self-hostable or hosted web UI for guided project creation. Separate initiative (suggested 240-band). Requires API key management, session handling, and a fundamentally different architecture.

2. **Project templates** — Pre-configured archetypes that seed directory structure, initial documents, and recommended settings. Natural extension of `cf init` once the base flow is solid.

3. **Migration tooling** — Importing from other project management approaches (existing README → concept doc, existing docs → architecture references). Ambitious but valuable for the adoption path.

4. **Cursor IDE support** — `cf setup-ide cursor` and `--ide cursor` flag for `cf init`. Second priority after Claude Code. Further IDE targets (Windsurf, etc.) follow based on demand.

5. **Onboarding analytics** — Understanding where users get stuck. Could be as simple as tracking which `cf next` recommendations are most common across fresh projects.
