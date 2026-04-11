---
docType: changelog
scope: project-wide
---

# Changelog

All notable changes to Squadron will be documented in this file.  This file should contain concise entries from user point of view and should answer the following questions:
* What can I do now that I couldn't do before?
* What specific bugs, if any, are fixed?
* Were any features removed?

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- `cf setup-ide copilot` and `cf init --ide copilot` — VS Code Copilot users can now use Context Forge. Compiles project rules and skills into the VS Code Copilot file layout: always-on rules → `.github/copilot-instructions.md` + `AGENTS.md`; scoped rules → `.github/instructions/*.instructions.md` with `applyTo` frontmatter; skills → `.github/prompts/*.prompt.md`. Existing unmanaged files are backed up before overwriting; managed files (from a previous run) are updated silently.

### Fixed
- `cf next` now recommends `cf set phase 'Phase 3: Slice Planning'` instead of `cf build` when a new slice plan file is configured but doesn't exist yet and the project is not already in Phase 3 — previously, running `cf build` from Phase 6 would have generated an implementation prompt rather than a slice planning prompt

## [0.6.42] - 20260406

### Fixed
- `cf check` no longer flags `status: draft` — now treated as alias for `not_started` (work hasn't begun)
- `cf check` auto-fixes missing `dateUpdated` by defaulting to `dateCreated` when present
- `cf check` no longer floods output with "plan entry but no task file" notices for backlog entries — only flagged when a slice design exists (the only state where missing tasks is actually inconsistent)

## [0.6.41] - 20260404

### Fixed
- Context profile filtering was silently disabled — `ContextProfileParser` only handled the expanded multi-line YAML format but the actual prompt file uses compact one-liners; all artifact fields (including `fileTasks`) were included in every phase regardless of profile configuration
- Affects `cf build`, MCP `context_build`, and `/cf:build` slash command

### Changed
- `ProfileMap` type simplified from `Record<string, { variables: string[] }>` to `Record<string, string[]>`
- `parseProfilesYaml` rewritten as format-agnostic state machine — no indent-depth logic

## [0.6.40] - 20260404

### Added
- `cf list arch` / `cf list initiatives` now drives from the initiative plan (`001-initiative-plan.*.md`) when present, showing all entries with index, name, status, and arch file per entry — mirrors `cf list slices` behavior
- Entries without an arch file show `not_started`; entries with an arch file but unchecked show `in_progress`; checked entries show `complete`
- `cf list arch --json` emits structured array with `index`, `name`, `status`, `archFile`, `isActive` fields
- `resolveInitiativePlanPath(projectPath)` exported from `@context-forge/core/node` — shared utility for locating initiative plan files

### Changed
- `cf list arch` falls back to `buildModel()`-based output on projects without a formal initiative plan (no behavior change for those projects)

## [0.6.39] - 20260404

### Added
- `cf check` Rule 13 (`initiative-entry-vs-arch`): flags mismatch between initiative plan entry checkbox and corresponding arch doc `status` — warns and auto-fixes in both directions
- `cf check` Rule 14 (`initiative-plan-status-vs-entries`): flags initiative plan frontmatter `status` vs. all-entries-checked state (mirrors Rule 7 for slice plans)

### Fixed
- `cf check` aggregate rules (stale-worktree-path, frontmatter-schema, initiative plan rules) were silently skipped when no slice plans existed; removed early-return guard that blocked them

## [0.6.38] - 20260403

### Fixed
- `cf setup-ide claude` now propagates generated files (`CLAUDE.md`, `.claude/rules/`, `.claude/agents/`, `.claude/skills/`) to all registered worktrees after updating the project root. Worktrees do not maintain independent IDE config — they receive a copy from root. `.claude/settings.local.json` and `.claude/worktrees/` are intentionally excluded (worktree-specific).

## [0.6.37] - 20260402

### Added
- Short-form flags for common CLI options: `-j` (`--json`), `-p` (`--project`), `-y` (`--yes`), `-f` (`--fix`), `-a` (`--all`), `-r` (`--raw`)
- New `packages/cli/src/options.ts` module with 7 composable helper functions (`withJsonOption`, `withProjectOption`, `withYesOption`, `withFixOption`, `withAllOption`, `withRawOption`, `withProjectLevelOption`)

### Changed
- Migrated all 14 CLI command files to use shared option helpers from `options.ts` (removed ~70 inline option registrations)
- Normalized `--project` option description to "Project ID or name (overrides default)" across all commands

### Fixed
- `cf check --fix` now reports "No fixable findings — nothing to apply." when no findings are auto-fixable, instead of silently showing check-only output
- Version flag changed from `-V` to `-v` (`--version`)

## [0.6.36] - 20260402

### Added
- `cf next` suggests `cf set phase` when current phase doesn't match the recommended phase
- `cf next` warns when active slice is outside the architecture's index band (e.g., slice 904 under arch 100)
- `cf next` recommends creating the architecture document when arch is set but the file is missing, even with an active slice
- `warnings` field on `NextAction` type for non-blocking configuration warnings

## [0.6.35] - 20260401

### Added
- `cf update` command — check npm for newer versions and prompt to install (slice 906)
  - `--yes` flag for non-interactive auto-install
  - `--json` flag for machine-readable version info
  - Detects npm vs pnpm global installs; skips local dev installs

## [0.6.34] - 20260331

### Added
- `cf worktree rm` shows git worktree removal hint when the directory still exists on disk

### Fixed
- `cf guides uninstall` from a worktree now only deinits the submodule in that worktree — no longer breaks the main repo's guide installation (fixes #46)
- Guide directory physically removed from worktree after submodule deinit

## [0.6.31–0.6.33] - 20260331

### Added
- `SlicePlanEntry.description` — overview text from slice plan entries (after bold name)
- `FutureWorkItem.description` — description text from future work entries (after title separator)
- `DocSummary.description` — overview paragraph extracted from `## Overview` section of arch docs

## [0.6.30] - 20260330

### Fixed
- `cf guides update` now fetches before `--remote` and uses `--init` for resilience after worktree removal

## [0.6.29] - 20260330

### Added
- Frontmatter schema registry (`FRONTMATTER_SCHEMAS`) — maps 8 docTypes to required fields with value constraints (slice 905)
- `validateFrontmatter()` pure function exported from `@context-forge/core`
- ConsistencyChecker Rule 12: validates all project documents against per-docType frontmatter schemas
- Status alias normalization: accepts `in-progress`, `not started`, `active`, `completed` as valid
- Auto-fix inference for missing `docType`, `slice`, `component`, `archIndex`, `project` from filename/context

### Fixed
- Slices and tasks outside worktree range now shown when plan is cross-initiative

### Changed
- Removed Rules 9 (missing-plan-status) and 11 (missing-arch-status) — subsumed by generic schema validation

## [0.6.27] - 20260327

### Added
- Derive `fileArch` and `fileSlicePlan` from initiative plan when file is missing

### Fixed
- `cf install-commands` now removes stale slash commands from previous versions

## [0.6.26] - 20260327

### Fixed
- MCP tools resolve project from CWD when `projectId` is omitted

### Changed
- Extracted compound workflow commands into dedicated CLI modules

## [0.6.25] - 20260325

### Added
- 900-band maintenance initiative support: `maintenanceInitiatives` field in project model (same `Initiative` type, separate display bucket for visualization)
- `getFieldNamesByGroup()` schema utility for deriving field lists from `PROJECT_FIELDS`
- `agent_quickstart` MCP tool — structured JSON capability schema for machine consumers (slice 209)
- `cf help --json` — machine-readable command catalog
- `cf version --json` — structured version output
- Structured JSON error format for `--json` mode (code, message, suggestion fields)
- `docs/AGENT-INTEGRATION.md` — agent consumption guide
- 7 new slash commands for compound workflows (`/cf:concept`, `/cf:initiatives`, `/cf:arch`, `/cf:plan`, `/cf:slice`, `/cf:tasks`, `/cf:implement`)

### Fixed
- `cf list tasks` and `cf list plans` no longer error on empty directories — returns empty result instead of `UserError` (blocked Squadron review commands on new projects)
- Compound commands (`cf slice`, `cf tasks`, etc.) now validate numeric index — previously `cf slice banana` silently set invalid values
- `cf set` warns on non-numeric artifact values that don't match expected patterns

### Changed
- Removed `agent_guide` MCP tool (superseded by `agent_quickstart`)
- Replaced hard-coded field arrays (ARTIFACT_FIELDS, WORKFLOW_FIELDS, fieldKeys, MANAGED_FILES) with schema-derived or filesystem-derived sources
- Initiative detection expanded from 100-799 to 100+ (900+ partitioned into `maintenanceInitiatives`)
- Bare `cf build` (no flags) now shows help message instead of raw prompt output

## [0.6.8] - 20260318

### Added
- Worktree-aware guide operations (slice 190):
  - `cf guides info` and `cf guides update` detect worktree context via `resolveProjectWorktree()` and operate on the correct worktree path
  - `SubmoduleStrategy.sync()` reads target commit from main worktree, fetches objects, and checks out in worktree guide directory — handles worktrees on different branches
  - `GuideManager.syncWorktrees()` syncs multiple worktrees in one call with per-path error handling
  - `GuideDetector.checkSyncStatus()` reports per-worktree sync state via `git submodule status`
  - MCP `guide_update` auto-syncs all registered worktrees after primary update
  - MCP `guide_status` includes `worktreeSync` array for submodule-based projects with worktrees
  - New `SyncResult` type exported from `@context-forge/core`

### Fixed
- Guide submodule updates now work in non-default worktrees — previously `cf guides update` from a worktree only updated the main worktree's checkout, leaving stale guide files in other worktrees (#44 cosmetic display issue noted)

## [0.5.2] - 20260314

### Added
- `cf check` Rule 11: `missing-arch-status` — flags architecture files with no `status` frontmatter field; fixable (infers from paired slice plan if present, else `not_started`)
- Renamed `200-arch.event-driven-pipeline.md` → `220-arch.event-driven-pipeline.md` (index reserved for new initiative)

## [0.5.1] - 20260312

### Added
- Default worktree improvements (slice 188):
  - Default worktree renamed from `"Default"` to `"default"` (lowercase)
  - Default range changed from `[0, 99]` to `[100, 799]` (working range instead of system range)
  - Dynamic range chopping: default worktree automatically shrinks when new worktrees claim overlapping sub-ranges
  - Artifact collision detection blocks range shrinking when default holds references outside the new range
  - CLI and MCP surface `chopWarning` on worktree add/update

## [0.5.0] - 20260312

### Added
- **Worktree initiative** (8 slices, 180–188): full git worktree support for parallel multi-initiative development
  - `WorktreeService` core service — CRUD for `WorktreeContext` records on `ProjectData`
  - `applyWorktreeOverlay` moved to `@context-forge/core` (CLI re-exports); shared by CLI and MCP
  - `cf worktree init/list/get/update/rm` CLI command group
  - `cf status` shows dedicated `Worktree:` line; `--worktree` and `--worktrees` flags for cross-directory access
  - `cf set` routes worktree-scoped fields (phase, slice, tasks, arch, plan) to `WorktreeContext`
  - `cf check` runs across all worktree overlays — worktree-scoped fields are visible in all checks
  - `stale-worktree-path` consistency rule detects registered worktrees whose paths no longer exist
  - `cf status` shows first-run hint when CWD is an unregistered git worktree of a known project
  - CWD resolution step 2b: auto-resolves project from git worktree even before `cf worktree init`
  - MCP tools: `worktree_list`, `worktree_get`, `worktree_init`, `worktree_update`, `worktree_rm` (5 new)
  - MCP extended: `workflow_status`, `workflow_next`, `context_build`, `project_update` accept `worktreeId`
  - MCP `worktree_update` overlap detection — rejects duplicate slice ranges across worktrees
- `cf tasks` command (renamed from `cf task`) with `list` and `items` subcommands

### Fixed
- `cf check` was blind to worktree-scoped fields after worktree migration; now checks all views
- `cf worktree init` required `--project` flag from unregistered git worktree directories; resolved automatically

## [0.4.2] - 20260311

### Added
- `cf backup` CLI command — creates versioned timestamped backup of project data (keeps last 10, auto-prunes)
- `storage_backup` MCP tool — same backup functionality accessible to AI agents

## [0.4.1] - 20260310

### Added
- `cf check --slice <index>` — narrow consistency checks to a single slice
- `cf check --yes` — skip confirmation prompt in fix mode
- `cf check` default scope is now all-slices (previously single-slice)
- `workflow_check` MCP tool: `sliceIndex` param to target specific slices
- ConsistencyChecker rules 6–9: architecture-plan linkage, missing-plan-status, all-arch-plan pairs, filesystem discovery
- `updateFrontmatterField` supports inserting new keys (not just updating existing ones)

## [0.4.0] - 20260309

### Added
- `cf setup-ide claude` command — configures Claude Code integration with CLAUDE.md backup safety and y/N confirmation
- Context-profile-aware assembly — `ContextProfileParser` filters artifacts per instruction phase, reducing context bloat
- `cf build --instruction-type` / `--it` flag for profile override without persisting
- `instructionType` param on `context_build` MCP tool
- `fileConcept` field on project schema for concept document tracking
- Rule: avoid overly restrictive regex when creating parsers

### Fixed
- `/cf:prompt` works with or without `get` subcommand (no double-dispatch)
- `cf set architecture` also sets slice plan (like slice → tasks)
- `cf next` suggests creating architecture when arch is specified but nonexistent
- `fileConcept` added to schema; project fields listed in general→specific order

## [0.3.6] - 20260307

### Added
- Guide install (`cf guides install`) now creates user artifact directories (`user/`, `architecture/`, `slices/`, `tasks/`, `project-guides/`)

### Fixed
- `cf next` recommends creating architecture before slice plan when neither exists
- Electron date picker displays correctly for dates set via CLI as YYYYMMDD (normalized to YYYY-MM-DD)
- Slice plan parser supports unindexed entries (`**Name**` without `(NNN)` prefix)
- Slice plan heading exclusion no longer falsely skips sections like "Feature Slices (in implementation order)"

### Changed
- Removed obsolete test infrastructure task file (all 891 tests now pass)
- Cleaned up maintenance file: removed completed items, condensed descriptions

## [0.3.5] - 20260307

### Added
- `ConsistencyChecker` core service with 5 detection rules: task-vs-plan, frontmatter-vs-computed, missing artifacts, plan-vs-frontmatter, task-file-status
- `MarkdownWriter` utility for non-destructive write-back (checkbox toggling + frontmatter field updates)
- Fix mode with `FixLogEntry` before/after tracing for each applied correction
- `workflow.auto_fix` config key for automatic corrections during consistency checks
- `workflow_check` MCP tool (25 total MCP tools)
- `cf check` CLI command replaces stub with full implementation (`--fix`, `--json`, `--project`)

### Fixed
- `/cf:prompt get P5` slash command no longer doubles the `get` subcommand
- `--project` help text across all CLI commands clarifies name or ID accepted

### Changed
- Integration testing slice (168) demoted to maintenance — most deliverables completed incrementally
- Future work item (169) added: all-slices consistency checking mode, duplicate index detection

## [0.3.4] - 20260307

### Added
- `WorkflowNavigator` core service: `getStatus()` derives slice status from filesystem, `getNext()` priority-ordered state machine
- MCP tools: `workflow_status`, `workflow_next`
- CLI discovery commands: `cf arch list`, `cf plan list`, `cf slice list`, `cf task list`, `cf task items`
- Smart index resolution: `cf set slice 166` derives filename from slice plan
- Auto-set `fileTasks` from slice name
- `workflow.auto_advance` config key

### Fixed
- Artifact path resolution: `resolveArtifactPath()` correctly resolves stems to full paths
- `slicePlan` null handling in `WorkflowNavigator`, `ArtifactIntrospector`, `cf slice list`

### Changed
- Slash command prompts optimized for token efficiency (~800 tokens saved)

## [0.3.3] - 20260307

### Added
- Auto-commit after `cf guides install` and `cf guides update` (submodule and clone strategies)

## [0.3.2] - 20260306

### Fixed
- Phase resolution in `cf build --phase`: accepts P1-P7 shorthands, numbers (1-7), and short names (task-breakdown); warns on unrecognized values
- Instruction matcher (`getPromptForInstruction`) handles full phase strings like `Phase 5: Task Breakdown` — extracts name portion for fuzzy matching
- Template conditionals support `{{#if var}}content{{/if}}` without requiring `{{else}}` clause
- Conditional evaluator uses enhanced data (artifact aliases like `fileArch`) instead of raw ContextData only

## [0.3.1] - 20260306

### Added
- README screenshots and assets (context-visualizer, cf-project-list, cf-status)
- CLI README: slash commands section, git-like CWD model explanation, `cf init` workflow

### Changed
- Root README rewritten with screenshots, structured sections, and updated architecture description
- CLI README restructured: npm-focused install, slash commands table, commands reference
- Core and MCP READMEs updated for slice 175 changes

## [0.3.0] - 20260306

### Added
- Artifact fields (`fileArch`, `fileSlicePlan`, `fileHLD`, `fileSpec`) in ContextData, mapped through full pipeline
- Template variable aliases: `{arch}`, `{plan}`, `{hld}`, `{spec}` with index extraction (`{archIndex}`, `{planIndex}`, `{hldIndex}`)
- Phase→instruction auto-set: setting `developmentPhase` via CLI or MCP automatically updates `instruction` to match
- Top-level shortcuts: `cf set` and `cf get` as shortcuts for `cf project set/get`
- Claude Code slash commands: `/cf:status`, `/cf:build`, `/cf:next`, `/cf:prompt`, `/cf:get`, `/cf:set`, `/cf:project`
- `cf install-commands` / `cf uninstall-commands` for Claude Code integration
- Smart field setting: `cf set slice 171` resolves by scanning project files; customData sub-fields settable with merge semantics
- Schema-driven field metadata: `cf project --schema` with aliases, groups, enum values
- `cf guides` command: install, update, and status for ai-project-guide templates
- `cf check` command: consistency checks with `--fix` option
- `cf future` command: consolidated future work across all slice plans

### Changed
- Consolidated `### Project Context` section with clean key-value format (replaces bracket-wrapped `### Current Work Context`)
- Unified opening statement (`project-statement`) regardless of workType (replaces start/continue branching)
- Template field removed from context output
- CWD-based project detection: `cf` auto-detects project from current directory
- Name-based project resolution: `--project orchestration` with project names instead of IDs
- Compact `cf project list` with `*` active indicator and `~` path shortening

## [0.2.0] - 20260228

### Added
- CWD-based project detection
- Name-based resolution with `--project` flag
- Resolution indicators in `cf status` output
- Compact `cf project list` format

### Changed
- Tighter output formatting: consistent label alignment, suppressed empty fields

## [0.1.0] - 20260225

### Added
- Initial release with 8 commands: `status`, `next`, `build`, `config`, `project`, `future`, `check`, `prompt`
- Integration with `@context-forge/core` for context assembly
- Phase shorthands for prompt templates (P1-P7)
- JSON output mode on all applicable commands
- MCP server with project management, context generation, artifact introspection, and workflow tools
- Core context engine: template processing, statement management, prompt parsing, project storage
