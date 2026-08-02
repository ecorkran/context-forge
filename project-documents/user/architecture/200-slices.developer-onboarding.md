---
docType: slice-plan
parent: user/architecture/200-arch.developer-onboarding.md
project: context-forge
dateCreated: 20260314
dateUpdated: 20260802
status: in_progress
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

6. [x] **(206) CLI/MCP Shared-Logic Consolidation** — Extract duplicated logic between CLI and MCP server into `@context-forge/core`. Covers project creation defaults (`dateProject` formatting, `template`/`instruction` sync), worktree field mappings (`WORKTREE_SCOPED_FIELDS`, `PROJECT_TO_WORKTREE_FIELD`), auto-set logic (`fileTasks` from `fileSlice`, `fileSlicePlan` from `fileArch`, `instruction` from `developmentPhase`), and project path resolution. Currently duplicated across `packages/cli/src/commands/init.ts` + `project.ts` and `packages/mcp-server/src/tools/projectTools.ts`.

   **Motivation:** Piecemeal extraction creates a false sense of "fixed" while leaving inconsistency risk. A dedicated slice ensures all duplication sites are addressed together, with tests proving both CLI and MCP paths produce identical results.

   **Scope:**
   - Identify all duplicated logic between CLI commands and MCP tool handlers
   - Extract shared functions/constants into `@context-forge/core`
   - Update CLI and MCP server to import from core
   - Add tests verifying CLI and MCP produce identical outputs for the same inputs

   **Success Criteria:**
   - No duplicated project-creation default logic between CLI and MCP server
   - Shared field mappings and auto-set logic live in `@context-forge/core`
   - CLI and MCP server import from core — no local copies
   - Tests confirm behavioral parity between CLI and MCP paths
   - Existing CLI and MCP behavior unchanged (pure refactor)

   **Dependencies:** None (can proceed independently; all target code is stable post-205)
   **Risk:** Med — touches multiple packages; requires careful behavioral parity testing
   **Effort:** 3/5

7. [x] **(207) Worktree-Resolved Project View** — All project-facing commands and MCP tools should return the resolved view with worktree overlays already applied to top-level fields. Currently consumers must know about the overlay pattern — `cf get` returns raw `fileArch` (project-level) alongside `worktree.archDoc` (overlay-level), and callers must manually prefer the worktree value. This leaks an implementation detail. The fix pushes overlay resolution into the core layer so `getProject` / `project_get` (and all commands that return or consume project state) return a single coherent view. Consumers should never need to check both a top-level field and its worktree override. Affects: `project_get`, `workflow_status`, `workflow_next`, `context_build`, CLI commands (`cf get`, `cf status`, `cf next`, `cf build`, etc.), and any external consumer (e.g., Squadron) that reads project data via MCP or CLI. Dependencies: [206]. Risk: Med — touches the core project resolution path used by every command; requires careful parity testing. Effort: 3/5

8. [x] **(208) Compound Workflow Commands** — Add phase-aware compound CLI commands that combine `cf set` + `cf build` into single invocations aligned with the methodology phases. Commands: `cf concept` (Phase 0 → concept doc), `cf initiatives` (Phase 1 → initiative plan), `cf arch <initiative>` (Phase 2 → architecture doc), `cf plan <initiative>` (Phase 3 → slice plan), `cf slice <slice>` (Phase 4 → slice design), `cf tasks <slice>` (Phase 5 → task breakdown), `cf implement <slice>` (Phase 6 → implementation context). Each command sets the appropriate phase and artifact fields, then runs `cf build`. Warns if the target artifact already exists (e.g., concept doc, slice design). Reduces the multi-command ceremony that currently gates every phase transition. Dependencies: None (builds on existing `cf set` and `cf build` infrastructure). Risk: Low. Effort: 2/5

9. [x] **(209) AI-Agent Consumption Interface** — Make Context Forge easy for AI agents to discover and use programmatically. Addresses two gaps: (1) CLI discoverability — agents hardcode command strings that break on rename (e.g., `cf slice list` → `cf list slices`); (2) error format — agents parse human-readable error strings instead of structured codes. Deliverables: `cf help --json` (machine-readable command catalog with names, args, types, descriptions), `cf version --json` (version + breaking change signals), structured JSON error format (`{ error, code, suggestion }`) on all commands when `--json` is active, and an `agent_quickstart` MCP tool that returns capability schema and getting-started instructions for pure-machine consumers (distinct from `agent_onboard` which targets human-supervised agents). Also: audit all commands for idempotency (repeated `cf set slice 208` should not warn), and document the MCP-first integration pattern for agent authors. Dependencies: [208 — compound commands must be stable first]. Risk: Low. Effort: 3/5

10. [x] **(210) GitHub Copilot / VS Code IDE Support** — Add `copilot` as a second IDE target for `cf setup-ide` and `cf init --ide`, enabling Context Forge projects to deliver their rules, skills, and agent guidance to VS Code Copilot users. Closes the gap for users who cannot or do not use Claude Code but still want the methodology and artifact surface that Context Forge provides. Reference: `project-documents/user/tool-guides/copilot-vscode/setup-ide.md`.

    **File mapping (Claude → Copilot):**
    | Claude-format source | Copilot target | Notes |
    |---|---|---|
    | `CLAUDE.md` (compiled `alwaysApply` rules) | `.github/copilot-instructions.md` + `AGENTS.md` | Always-on project guidance; `AGENTS.md` provides cross-tool compatibility |
    | `.claude/rules/*.md` (non-alwaysApply, `paths`-scoped) | `.github/instructions/*.instructions.md` (`applyTo` glob) | Convert `paths: [...]` → `applyTo: "a,b,c"` comma-separated glob |
    | `.claude/skills/*.md` (task workflows) | `.github/prompts/*.prompt.md` | Slash-command-invoked; frontmatter fields: `name`, `description`, `argument-hint`, `agent`, `model`, `tools` |
    | `.claude/agents/*.md` (sub-agents/personas) | Copilot custom agents | Distinct VS Code concept — document mapping, implement if backend is stable |

    **Scope:**
    - Extend `VALID_TARGETS` in `packages/cli/src/commands/setup-ide.ts` from `['claude']` to `['claude', 'copilot']`
    - Add a `copilot` backend to the guides-side `scripts/setup-ide` script (the actual rule→file compilation lives in the ai-project-guide submodule, not CF core)
    - Managed-marker detection: add an equivalent `[//]: # (context-forge:managed)` marker convention for Copilot target files so re-runs are safe (first-run warns before overwriting unmanaged user content; subsequent runs skip backup)
    - Worktree propagation in `propagateToWorktrees()`: extend the `target === 'claude'` block with a `target === 'copilot'` block that copies `AGENTS.md`, `.github/copilot-instructions.md`, `.github/instructions/`, and `.github/prompts/` to each registered worktree
    - Smart `cf init` integration: `cf init --ide copilot` end-to-end flow — unchanged detection matrix, just routes to the copilot setup path
    - Frontmatter translation: Claude rule files use `paths: [...]` array (defaulting to `**`); Copilot instruction files use `applyTo: "glob1,glob2"` comma-separated string — translator must handle both forms and default to `applyTo: "**"` when source omits paths
    - Ordering caveat: VS Code says multiple instruction files combine with no guaranteed order. Compiled always-on content belongs in a single `.github/copilot-instructions.md` (or `AGENTS.md`), not split across instruction files. Keep split `.instructions.md` files narrowly scoped and non-conflicting.
    - Dual-write compatibility: existing Claude users can keep `CLAUDE.md` + `.claude/` untouched. Copilot target is additive, writing only to `AGENTS.md`, `.github/copilot-instructions.md`, `.github/instructions/`, and `.github/prompts/` — never touching `.claude/` or `CLAUDE.md`.

    **Non-goals for this slice:**
    - Cursor support (remains in Future Work item #1; architecturally similar but its own slice once Copilot is proven)
    - Bidirectional sync (Copilot → Claude or vice versa). One-way source-of-truth → compiled target only.
    - Copilot custom agents translation (scope as a follow-up if the instruction + prompt layer lands cleanly)

    **Value:** Unblocks VS Code Copilot users from adopting Context Forge. Current real-world driver: an external user who cancelled their Claude subscription and is now on Copilot but wants to keep using CF. Establishes the pattern for future IDE targets (Cursor, Windsurf, etc.) — after Copilot ships, adding a new target becomes "add an entry to `VALID_TARGETS`, add a backend to the guides script, add a worktree propagation block."
    **Success Criteria:**
    - `cf setup-ide copilot` generates `.github/copilot-instructions.md`, `AGENTS.md`, `.github/instructions/*.instructions.md` (from non-alwaysApply rules), and `.github/prompts/*.prompt.md` (from skills)
    - `cf init --ide copilot` runs end-to-end on a fresh directory: git init, project create, guide install, setup-ide copilot
    - Re-running `cf setup-ide copilot` on a project with existing managed files does not prompt (idempotent)
    - Re-running on a project with existing unmanaged files prompts before overwriting (same safety as Claude path)
    - `cf worktree` propagation copies Copilot files to all registered worktrees after root setup-ide
    - Path→applyTo translation correctly converts Claude frontmatter to Copilot frontmatter for split rule files
    - Manual verification: an AI agent in VS Code Copilot can read `.github/copilot-instructions.md` + `AGENTS.md` and follow project conventions as well as Claude does with `CLAUDE.md` + `.claude/rules/`
    - Tool guide (`project-documents/user/tool-guides/copilot-vscode/setup-ide.md`) referenced in slice design, promoted to a proper published tool guide if needed
    **Dependencies:** None (composes existing `cf setup-ide` infrastructure and guide-side compilation; no dependency on slices 206/207/208/209)
    **Risk:** Med — involves the guides submodule (ai-project-guide scripts), frontmatter translation correctness, and a file layout VS Code's compatibility story is still evolving on
    **Effort:** 3/5

11. [ ] **(211) OpenAI Codex / AGENTS.md Target & IDE Parity** — Enable the `agents` (alias `openai`, `codex`) and `cursor` IDE targets, and close the non-Claude parity gaps that 210 left open. The guide-side compiler already supports both targets — ai-project-guide v0.16.0 (20260730) shipped the `agents` target and CF's `VALID_TARGETS` was never updated to match — so most of this slice is reconnecting CF to capability that already exists, plus a coupled upstream change to bring the codex surface to parity with Claude's.

    **CF-side work:**
    - Extend `VALID_TARGETS` in `packages/cli/src/commands/setup-ide.ts` from `['claude', 'copilot']` to include `agents` and `cursor`, accepting `openai` and `codex` as aliases normalized at the CF layer (the guide script normalizes too, but CF owns the `--help` text and the invalid-target message)
    - Decompose `isManagedCopilotFiles()` — it already checks `AGENTS.md`, so the `agents` target must not inherit Copilot's `.github/` assumptions. Extract a shared managed-marker check parameterized by the file set each target owns
    - Extend `propagateToWorktrees()` with `agents` and `cursor` branches. Critically, replace the current silent fall-through for unhandled targets: today an unrecognized target matches neither `if` block and propagates nothing with no error, which is the same silent-failure class as the `draft` frontmatter special case removed in 0.10.7
    - `ContextEmbedder` conventions-file resolution: [ContextEmbedder.ts](../../../packages/core/src/services/ContextEmbedder.ts) hardcodes `CLAUDE.md` and swallows the miss silently. Resolve the project's actual conventions file instead, and warn explicitly when none is found — matching the existing warning behavior for missing artifact files
    - Delete `buildAndPrint()` in `packages/cli/src/commands/build.ts` — exported but confirmed to have zero callers across both CF and Squadron; it carries a duplicate, dead `--embed` branch that would otherwise need the same fix twice
    - Docs: README command table and quick-start gain the new targets. Remove the two stale `windsurf` references (the `propagateToWorktrees` comment, and the invalid-target test fixture token — swap for a value that is not a plausible future target). The `windsurf` mention in the README MCP-client config block is accurate and unrelated to `setup-ide`; leave it

    **Coupled upstream work (ai-project-guide):**
    - `agents` target emits skills to `.agents/skills/<name>/SKILL.md` per the open agent skills standard. The existing `.claude/skills/<name>/SKILL.md` source layout is nearly identical, so this is close to a directory copy rather than a translation. Confirm the discovery path at test time before falling back to any `.codex`-specific location
    - `cursor` target: split always-on rules to `AGENTS.md` and scoped rules to `.cursor/rules/*.mdc` (retaining the `paths:`→`globs:` translation), mirroring how `claude` splits to `CLAUDE.md` + `.claude/rules/` and `copilot` splits to `copilot-instructions.md` + `.github/instructions/`. This is a behavior change: the target currently copies every rule to `.cursor/rules/` and lets Cursor honor `alwaysApply` natively. The split is exclusive, so no rule loads from two places
    - Drop `.cursor/agents/` emission — it appears in no current Cursor documentation; `.cursor/rules/` and `AGENTS.md` are the documented surfaces
    - Resolve the latent Copilot duplication: the target writes always-on rules to both `.github/copilot-instructions.md` and `AGENTS.md`. Currently harmless only because VS Code's AGENTS.md support is experimental and off by default (`chat.useAgentsMdFile`); a user who enables it gets always-on rules loaded twice

    **Non-goals for this slice:**
    - MCP `setup_ide` tool — IDE setup stays CLI-only for every target (accepted gap)
    - Codex custom prompts (`.codex/prompts`) — deprecated by OpenAI in favor of skills; do not build
    - A `.claude/agents/` equivalent for non-Claude targets. Neither Codex nor Cursor documents an agent-definition surface, so agent definitions remain Claude-only
    - Consolidating skills emission across targets. VS Code Copilot now supports Agent Skills natively, which may eventually let one emission serve codex, cursor, and copilot in place of the bespoke `.github/prompts/*.prompt.md` translation. Worth investigating during design; not a commitment here

    **Value:** Unblocks OpenAI Codex users, the third major agent surface after Claude Code and Copilot. More immediately, it fixes a live defect: Squadron appends `--embed` automatically for every non-SDK profile (`openrouter`, `openai`, `gemini`, `local`, `openai_oauth`), so any Squadron dispatch to a non-Claude model already depends on this path. Today it is masked because every CF project happens to have a `CLAUDE.md` — the moment a codex-target project exists, those models receive artifacts with no conventions content and no warning. Also retires Future Work item "Cursor IDE support" and clears the windsurf references that outlived upstream dropping the target.
    **Success Criteria:**
    - `cf setup-ide codex` (and `openai`, `agents`) generates `AGENTS.md` plus `.agents/skills/*/SKILL.md`
    - `cf setup-ide cursor` generates `AGENTS.md` (always-on rules) and `.cursor/rules/*.mdc` (scoped, with `globs:`), and writes no `.cursor/agents/`
    - `cf init --ide codex` and `cf init --ide cursor` run end-to-end on a fresh directory
    - Re-running either target is idempotent on managed files and prompts before overwriting unmanaged ones, matching the Claude and Copilot safety behavior
    - `propagateToWorktrees` copies each target's files to all registered worktrees, and an unhandled target raises rather than silently propagating nothing
    - `cf build --embed` inlines the project's actual conventions file for every target, and emits a visible warning when no conventions file is found
    - Verified against real Codex and Cursor sessions that the emitted files are discovered and followed, not merely written to the documented paths
    **Dependencies:** [210 — establishes the multi-target pattern in `setup-ide`, `propagateToWorktrees`, and the managed-marker convention this slice generalizes]
    **Risk:** Med — coupled CF + ai-project-guide release, a behavior change to the existing `cursor` target, and third-party surfaces (Codex skills discovery, Cursor rule loading) that need runtime confirmation rather than documentation alone
    **Effort:** 3/5

## Maintenance Slices

5. [x] **(205) Consistency Checker & Build Template Fixes** — Multi-plan scanning in `checkAll`, MCP `workflow_check` parity with CLI, `/cf:check` slash command, and `cf:build` template section reordering. Dependencies: None. Risk: Low. Effort: 2/5

## Implementation Order

```
Foundation:
  201. project_create MCP Tool
    ↓
Feature (202 and 203 are independent; 204 depends on 201):
  202. Smart cf init ──────────── 203. Enhanced cf next
                                    ↓ (nice-to-have, not blocking)
  204. Onboarding Skill ←──── 201

Refactoring (independent, no blockers):
  206. CLI/MCP Shared-Logic Consolidation

Compound & Agent:
  208. Compound Workflow Commands
    ↓
  209. AI-Agent Consumption Interface
```

202 and 203 can be implemented in parallel — they touch different parts of the codebase (CLI init vs. WorkflowNavigator). 204 depends on 201 (needs `project_create` to exist) and benefits from 203 (enhanced `cf next` improves the post-onboarding experience) but doesn't strictly require it. 206 has no dependencies and can proceed at any time. 209 depends on 208 (compound commands should be stable before exposing the command catalog to agents).

## Notes

- **Composition over new infrastructure.** All four slices compose existing, tested capabilities. No new storage backends, no new protocols, no new package boundaries. The highest-risk slice (202) is a sequencer over existing functions.

- **`cf init` backwards compatibility.** The current `cf init` creates a project entry and nothing else. The enhanced `cf init --lite` preserves this exact behavior. The full `cf init` (no flags) adds steps but the project creation step is identical. Existing scripts calling `cf init` will get additional setup — this is intentional and documented as a behavioral change.

- **Skill as plain text.** The onboarding skill is a markdown file, not executable code. It contains instructions for the AI agent, not logic that CF runs. This means it can reference tools that don't exist yet (with fallbacks) and doesn't need to be version-locked to the MCP server.

- **`project_create` is deliberately thin.** It creates a project entry and nothing else. Guide installation, command installation, and IDE setup are separate operations. This matches the MCP server's design philosophy where each tool does one thing. The onboarding skill handles the composition, just as `cf init` handles composition on the CLI side.

## Future Work

1. [ ] **Project templates** — Pre-configured archetypes that seed directory structure and initial documents. Natural extension of `cf init` once the base flow is solid. E.g., `cf init --template cli-tool`.

2. [ ] **Migration tooling** — Importing from other project management approaches (existing README -> concept doc, existing docs -> architecture references). Valuable for the adoption path but ambitious in scope.

3. [ ] **Onboarding analytics** — Understanding where users get stuck. Could be as simple as tracking which `cf next` recommendations are most common across fresh projects.

4. [ ] **Web-based onboarding** — Self-hostable or hosted web UI for guided project creation. Separate initiative (suggested 240-band). Depends on 220-arch event-driven pipeline for HTTP transport.

5. [ ] **`cf check --fix` Worktree-Aware Writes** — When `cf check --fix` auto-fixes a file that is visible from multiple worktree views (i.e., not overridden by any overlay), the fix creates unexpected dirty state in other worktrees. The fix itself is correct — the problem is that git worktrees share the same working tree files unless overridden, so a write in one view is visible in all others. Needs a solution that doesn't sacrifice the core value of `--fix` (one-command cleanup). Rejecting fixes or requiring manual intervention defeats the purpose. The right approach likely involves understanding the worktree topology at fix time and handling the cross-view consequence smoothly — but the specific UX is TBD.

6. [ ] **CLI & MCP Update Command** — A `cf update` command that checks installed vs. available versions for CLI, MCP server, commands (slash commands), and guides, then presents a summary and prompts to apply updates. `cf update<enter>` checks all, shows what's outdated, prompts Y/n. `cf update --yes` auto-applies. Should handle: npm package version check (CLI + MCP), `cf install-commands` for slash commands, and potentially `cf guides update` for guide sync. The MCP server should also have awareness of update state — either its own `update_check` tool or knowledge of what needs updating that an agent can act on. Guides integration TBD — may bundle `cf guides update` into the flow or keep it separate since guide updates involve git operations with different failure modes.

