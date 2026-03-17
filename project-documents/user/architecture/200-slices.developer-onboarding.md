---
docType: slice-plan
parent: user/architecture/200-arch.developer-onboarding.md
project: context-forge
dateCreated: 20260314
dateUpdated: 20260315
status: complete
---

# Slice Plan: Developer Onboarding & First-Run Experience

## Parent Document
`user/architecture/200-arch.developer-onboarding.md` — Collapses the onboarding path from five sequential commands to a single CLI entry point, adds MCP-driven project creation, provides an onboarding skill for AI-assisted setup, and enhances first-run guidance.

## Foundation Work

1. [x] **(201) project-create MCP Tool** — New atomic MCP tool for creating a Context Forge project via MCP. Wraps the existing `FileProjectStore.create()` with input validation and duplicate-path detection. Returns full project object (same shape as `project_get`). Does not install guides, commands, or configure IDE — those are separate operations, consistent with the MCP server's atomic tool philosophy.

   **Parameters:**
   - `name` (string, required) — project display name
   - `projectPath` (string, required) — absolute path to project root
   - `developmentPhase` (string, optional) — initial phase, defaults to "Phase 1: Concept"

   **Behavior:**
   - Creates project entry in CF storage via `FileProjectStore.create()`
   - Sets `dateProject` to today, `template` to "default", `instruction` to "implementation"
   - Errors if a project is already registered at the given `projectPath` (with suggestion to use `project_get`)
   - Returns full `ProjectData` with introspection (matching `project_get` response shape)

   **Registration:** Added to existing `registerProjectTools()` in `packages/mcp-server/src/tools/projectTools.ts`, following the established pattern.

   **Value:** Fills the "can't create via MCP" gap. Enables AI agents to set up projects conversationally without requiring the user to drop to the CLI. Foundation for the onboarding skill (slice 204).
   **Success Criteria:**
   - `project_create` tool registered and callable via MCP
   - Project created with correct defaults (template, instruction, dateProject, developmentPhase)
   - Duplicate path detection returns clear error message
   - Response matches `project_get` shape (full ProjectData + introspection)
   - Existing `project_list`, `project_get`, `project_update` behavior unchanged
   - Unit tests cover: successful creation, duplicate path rejection, missing required params
   **Dependencies:** None (builds on existing 160-band infrastructure)
   **Risk:** Low — thin wrapper over existing `FileProjectStore.create()`
   **Effort:** 1/5

## Feature Slices

2. [x] **(202) Smart cf init Composition** — Extend `cf init` to detect environment state and compose the full setup sequence: git init, project creation, guide installation, command installation, and IDE configuration. Detection-based defaults with override flags (`--lite`, `--no-ide`, `--ide <target>`, `--name`).

   **Detection matrix:**
   | Condition | Behavior |
   |---|---|
   | No `.git` directory | Initialize git, then proceed |
   | `.git` exists, no CF project at this path | Create project, full setup |
   | `.git` exists, CF project registered here | Print status, suggest `cf status`, exit |
   | `project-documents/ai-project-guide/` exists | Skip guide installation |
   | Git worktree of a registered project | Detect via `git worktree list`, suggest `cf worktree init` instead |

   **Default behavior (no flags):**
   1. Check for git — init if missing
   2. Check for registered CF project at CWD — if found, print status and exit
   3. Check for git worktree of registered project — if found, suggest `cf worktree init` and exit
   4. Create project (name from argument, `--name`, or directory basename)
   5. Install guides (`cf guides install`) — skip if already present
   6. Install commands (`cf install-commands`)
   7. Configure IDE (`cf setup-ide claude`) — skip with `--no-ide`, use `--ide <target>` for non-Claude
   8. Print summary with nudge toward `cf next`

   **Flags:**
   - `--lite` — steps 1-4 only (project entry, no guides/commands/IDE)
   - `--no-ide` — skip IDE configuration step
   - `--ide <target>` — configure non-default IDE (default: `claude`)
   - `--name <name>` — explicit project name (overrides directory basename)

   **Implementation approach:** Compose existing functions — `guidesInstallAction`, `installCommandsAction`, `setupIdeAction` are already implemented and tested. The init command becomes a sequencer that calls them conditionally based on detected state.

   **Value:** The primary CLI onboarding improvement. One command replaces five. Safe to re-run on existing projects.
   **Success Criteria:**
   - `cf init` from empty directory: initializes git, creates project, installs guides, installs commands, configures Claude
   - `cf init` from existing git repo: creates project, installs guides/commands/IDE
   - `cf init` on already-registered project: prints status, exits cleanly (no error)
   - `cf init` from worktree of registered project: suggests `cf worktree init`
   - `cf init --lite`: creates project only, no guides/commands/IDE
   - `cf init --no-ide`: skips IDE configuration
   - `cf init --name "My Project"`: uses provided name
   - Guide installation skipped when `project-documents/ai-project-guide/` already exists
   - Each step prints success/skip status line
   - Final output shows summary and `cf next` nudge
   - All existing `cf init` behavior preserved for `--lite` path (backwards compatible)
   **Dependencies:** None (composes existing commands; `project_create` MCP tool is independent)
   **Risk:** Low — composition of tested components; primary risk is detection edge cases
   **Effort:** 3/5

3. [x] **(203) Enhanced cf next First-Run Guidance** — Extend the WorkflowNavigator to detect sparse project state and provide richer, actionable first-run recommendations. Targets the gap between "project created" and "user knows what to do."

   **Current state:** `WorkflowNavigator.getNext()` returns recommendations based on a priority-ordered state machine. The existing conditions work well for in-progress projects but give generic guidance for fresh projects (e.g., "Set active slice" when the user doesn't yet have a slice plan).

   **Enhanced first-run conditions:**

   | State | Current behavior | Enhanced behavior |
   |---|---|---|
   | Phase 1, no concept doc, no fileArch | "Set active slice" | "Your project is in Phase 1 (Concept). Start by discussing what you want to build. Use `cf build --phase concept` to generate a concept prompt, or begin a conversation with your AI agent about the project idea." |
   | Phase 2, no fileArch | "Create architecture document" | Same, plus: "If this is a small project, you can skip architecture and go straight to a slice plan: `cf set phase 'Phase 3: Slice Planning'`." |
   | Phase 3, no fileSlicePlan | Generic | "Create a slice plan from your architecture document. Use `cf build --phase slice-planning` to generate a planning prompt." |
   | Has slice plan, no active slice | "Set active slice" | "You have a slice plan but no active slice. Pick your first slice: `cf set slice <filename>` — usually the first foundation slice in your plan." |
   | Fresh project, no phase set | Generic | "Welcome! Your project is set up. Start with Phase 1 (Concept) — use `cf next` after setting a phase to get specific guidance." |

   **Implementation:** Add a `detectFirstRunState()` private method to WorkflowNavigator that checks for sparse state indicators (no fileArch, no fileSlicePlan, no fileSlice, early phase). When first-run state is detected, return enhanced recommendations with concrete commands and explanations. Standard recommendations take over once the project has accumulated artifacts.

   **Value:** Closes the "now what?" gap after init. New users get actionable guidance instead of terse status messages.
   **Success Criteria:**
   - Phase 1 project with no artifacts gets concept-phase guidance with `cf build --phase concept` suggestion
   - Phase 2 project with no arch doc gets architecture guidance with small-project shortcut
   - Project with slice plan but no active slice gets specific "pick your first slice" guidance
   - Fresh project with no phase gets welcome message
   - All enhanced recommendations include a concrete `cf` command the user can run
   - Existing recommendations unchanged for projects with established artifacts
   - Unit tests cover each first-run condition and verify enhanced vs. standard recommendation selection
   **Dependencies:** None (extends existing WorkflowNavigator)
   **Interfaces:** `WorkflowNavigator.getNext()` return shape unchanged — `NextAction` type already supports `suggestedCommand`
   **Risk:** Low — additive logic in existing service; no changes to core recommendation engine
   **Effort:** 2/5

4. [x] **(204) Onboarding Skill** — A prompt/skill that teaches AI agents how to guide users through project creation and the first phase of work. Delivered via `cf install-commands` alongside existing slash commands.

   **The skill provides a recipe for:**
   1. Detecting whether a CF project exists at CWD (`project_list`, check paths)
   2. Creating a project if needed (`project_create` MCP tool or suggest `cf init`)
   3. Checking and installing guides (`guide_status`, `guide_install`)
   4. Building the Phase 1 (Concept) prompt (`prompt_get` or `cf build`)
   5. Transitioning into a concept discussion naturally

   **Conversation flow example:**
   ```
   User: "I want to start a new project for a database migration CLI tool"
   Agent: [calls project_create with name and path]
   Agent: [calls guide_status, guide_install if needed]
   Agent: [calls prompt_get for concept-phase-1]
   Agent: "Your project is set up. Let's talk about what you're building..."
   ```

   **Delivery:** New `.md` file in `packages/cli/commands/cf/` (e.g., `onboard.md`). Added to the managed files list in `commandInstaller.ts`. Installed by `cf install-commands` alongside existing slash commands.

   **Scope boundary:** The skill is a text recipe, not application logic. It references existing MCP tools and CLI commands. If a tool doesn't exist (e.g., running without MCP), the skill suggests CLI equivalents. This keeps it lightweight and version-tolerant.

   **Value:** Enables fully conversational onboarding — an AI agent can take a new user from zero to "discussing their project concept" without the user needing to know any CF commands.
   **Success Criteria:**
   - Skill file created and installable via `cf install-commands`
   - Skill references correct MCP tool names and parameters
   - Skill handles both cases: project exists (skip creation) and project doesn't exist (create)
   - Skill suggests CLI fallbacks when MCP tools aren't available
   - Skill transitions naturally into Phase 1 concept discussion
   - `cf install-commands` updated to include the new skill in managed files
   - Manual verification: AI agent can follow the skill to set up a new project end-to-end
   **Dependencies:** [201 — project_create MCP Tool]
   **Risk:** Low — plain text skill file; no runtime code changes beyond adding to managed files list
   **Effort:** 1/5

## Implementation Order

```
Foundation:
  201. project_create MCP Tool
    ↓
Feature (202 and 203 are independent; 204 depends on 201):
  202. Smart cf init ──────────── 203. Enhanced cf next
                                    ↓ (nice-to-have, not blocking)
  204. Onboarding Skill ←──── 201
```

202 and 203 can be implemented in parallel — they touch different parts of the codebase (CLI init vs. WorkflowNavigator). 204 depends on 201 (needs `project_create` to exist) and benefits from 203 (enhanced `cf next` improves the post-onboarding experience) but doesn't strictly require it.

## Notes

- **Composition over new infrastructure.** All four slices compose existing, tested capabilities. No new storage backends, no new protocols, no new package boundaries. The highest-risk slice (202) is a sequencer over existing functions.

- **`cf init` backwards compatibility.** The current `cf init` creates a project entry and nothing else. The enhanced `cf init --lite` preserves this exact behavior. The full `cf init` (no flags) adds steps but the project creation step is identical. Existing scripts calling `cf init` will get additional setup — this is intentional and documented as a behavioral change.

- **Skill as plain text.** The onboarding skill is a markdown file, not executable code. It contains instructions for the AI agent, not logic that CF runs. This means it can reference tools that don't exist yet (with fallbacks) and doesn't need to be version-locked to the MCP server.

- **`project_create` is deliberately thin.** It creates a project entry and nothing else. Guide installation, command installation, and IDE setup are separate operations. This matches the MCP server's design philosophy where each tool does one thing. The onboarding skill handles the composition, just as `cf init` handles composition on the CLI side.

## Future Work

1. [ ] **Cursor IDE support** — `cf setup-ide cursor` and `--ide cursor` flag for `cf init`. Second priority after Claude Code. Requires understanding Cursor's configuration surface (rules files, MCP settings).

2. [ ] **Project templates** — Pre-configured archetypes that seed directory structure and initial documents. Natural extension of `cf init` once the base flow is solid. E.g., `cf init --template cli-tool`.

3. [ ] **Migration tooling** — Importing from other project management approaches (existing README -> concept doc, existing docs -> architecture references). Valuable for the adoption path but ambitious in scope.

4. [ ] **Onboarding analytics** — Understanding where users get stuck. Could be as simple as tracking which `cf next` recommendations are most common across fresh projects.

5. [ ] **Web-based onboarding** — Self-hostable or hosted web UI for guided project creation. Separate initiative (suggested 240-band). Depends on 220-arch event-driven pipeline for HTTP transport.

6. [ ] **CLI/MCP duplication extraction** — Extract shared logic duplicated between CLI and MCP server into `@context-forge/core`. Covers: project creation defaults (`dateProject` formatting, `template`, `instruction` sync), worktree field mappings (`WORKTREE_SCOPED_FIELDS`, `PROJECT_TO_WORKTREE_FIELD`), auto-set logic (`fileTasks` from `fileSlice`, `fileSlicePlan` from `fileArch`, `instruction` from `developmentPhase`), and project path resolution. Currently duplicated in `packages/cli/src/commands/init.ts` + `project.ts` and `packages/mcp-server/src/tools/projectTools.ts`. Dedicated slice recommended — extracting piecemeal creates false sense of "fixed" while leaving inconsistency risk.
