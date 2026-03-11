# Development Log

A lightweight, append-only record of development activity. Newest entries first.

Format: `## YYYY-MM-DD` followed by brief notes (1-3 lines per session).
Tags noted as `Tags: @scope/pkg@version` when versions are bumped.

---

## 2026-03-11

### Slice 187: Validation, Edge Cases & Polish — Design Complete
- Created `user/slices/187-slice.validation-edge-cases-polish.md`
- Scope: `cf worktree update` CLI command, stale path detection via `WorktreeService.validateWorktreePaths()`, `cf check` rule `stale-worktree-path`, first-run messaging in `cf status`, overlap detection on MCP `worktree_update`
- Key decisions: validation method on WorktreeService with injected `pathExists` for testability; `--range` option takes unquoted `start-end` string; stricter validation (effort bumped to 3/5)
- Commits:
  - `250e495` docs: add slice 187 design for validation, edge cases & polish

### Slice 186: MCP Worktree Tools — Complete
- 5 new CRUD tools: `worktree_list`, `worktree_get`, `worktree_init`, `worktree_update`, `worktree_rm`
- 4 extended tools with worktree params: `workflow_status`, `workflow_next`, `context_build`, `project_update`
- `applyWorktreeOverlay` moved from CLI to `@context-forge/core` (CLI re-exports)
- `project_update` field routing: worktree-scoped fields → `WorktreeService`, project fields → `store.update()`
- Build: clean, 520 tests pass (34 new MCP tests)
- Commits:
  - `c28b21c` refactor(core): move applyWorktreeOverlay from CLI to core
  - `0e93c90` feat(mcp): add worktree CRUD tools (list, get, init, update, rm)
  - `92fed29` test(mcp): add unit tests for worktree CRUD tools
  - `d51c378` feat(mcp): add worktreeId to workflow_status and workflow_next
  - `ad8d047` feat(mcp): add worktree param to context_build
  - `294612b` feat(mcp): add worktreeId field routing to project_update

### Slice 186: MCP Worktree Tools — Phase 5 (Task Breakdown) ✓
- Created `186-tasks.mcp-worktree-tools.md` — 16 tasks covering CRUD tools, extended tools, overlay extraction, and tests
- Test-with ordering: each implementation task immediately followed by its test task
- `applyWorktreeOverlay` move from CLI→core scoped as task 1 (shared dependency)

### Maintenance: MCP prompt fallback fix
- `prompt_list`/`prompt_get` now fall back to bundled prompts when no `default_project` configured
- Exported `resolvePromptFilePath` from `@context-forge/core/node`; added `resolvePromptFileForTools` helper in MCP
- Commit: `191fde6` fix(mcp): prompt_list and prompt_get fall back to bundled prompts when no project resolved

### Slice 186: MCP Worktree Tools — Phase 4 (Slice Design) ✓
- Designed 5 new CRUD tools (`worktree_init/list/get/update/rm`) wrapping `WorktreeService`
- Extended 4 existing tools with optional `worktreeId`: `workflow_status`, `workflow_next`, `context_build`, `project_update`
- Field routing in `project_update` mirrors CLI `cf set` behavior (workflow fields → worktree, project fields → project)
- `applyWorktreeOverlay` to be moved from CLI to core for shared use
- Commits:
  - `9945d5c` docs: mark slice 185 complete (delivered in 182-184)
  - `9b0b9a7` docs: add slice design for 186 MCP Worktree Tools

### Slice 185: Worktree-Aware Context Assembly — Marked Complete
- Core functionality delivered in slices 182-184 (`applyWorktreeOverlay` in `cf build`)
- MCP `context_build` worktree param deferred to slice 186
- `--worktree` flag on build deferred pending global `--worktree` across all commands

### Slice 184: Status & Display Updates — Phase 6 (Implementation) ✓
- Extracted `applyWorktreeOverlay` to shared utility (`packages/cli/src/utils/worktree-overlay.ts`), replaced 8 inline copies
- `cf status` shows dedicated `Worktree:` line with name and index range when resolved from worktree
- `--worktree <name|id>` flag on `cf status` for cross-directory worktree status
- `--worktrees` flag on `cf status` for dashboard view of all worktrees with phase/slice/progress
- `--json` output includes full `WorktreeContext` object (not just name string)
- `--worktrees --json` outputs array of worktree summaries
- Mutual exclusion check for `--worktree` and `--worktrees`
- 257 CLI tests pass (16 new), full build clean
- Commits:
  - `70b22c9` refactor(cli): extract applyWorktreeOverlay to shared utility
  - `49d80d6` refactor(cli): replace 8 inline applyWorktreeOverlay copies with shared import
  - `1fb7bc8` test(cli): add unit tests for shared applyWorktreeOverlay
  - `84bc7ae` feat(cli): add Worktree display line to cf status
  - `09142a5` test(cli): add Worktree line display tests
  - `e0eacf3` feat(cli): add --worktree flag to cf status
  - `5559bd4` test(cli): add --worktree flag tests for cf status
  - `ee38700` feat(cli): add --worktrees dashboard flag to cf status
  - `d90a0db` test(cli): add --worktrees dashboard tests

### Slice 183: Worktree CLI Commands — Phase 6 (Implementation) ✓
- `cf worktree init/list/rm` command group in `packages/cli/src/commands/worktree.ts`
- `resolveProjectWorktree` refactored to options-object `({ project?, worktree? }, store)` — backwards-compatible via `resolveProjectId` wrapper
- `findWorktreeByNameOrId` utility (exact ID first, then case-insensitive name)
- `askConfirmation` extracted to shared `utils/confirm.ts`
- Worktree-aware `projectSetAction`: `WORKTREE_SCOPED_FIELDS` set routes `fileSlice→activeSlice`, `fileArch→archDoc` etc. to `WorktreeService.updateWorktree`; auto-set logic (phase→instruction, arch→plan, slice→tasks) also targets worktree context
- Worktree-aware `projectGetAction`: worktree header + field overlay from `WorktreeContext`, `--project-level` flag escapes
- `--project-level` flag on `cf set`, `cf get`, `cf project set`, `cf project get`
- `GitWorktreeDiscovery` and `WorktreeService` exported from `@context-forge/core/node`
- 1039 tests pass across all packages (0 regressions); 35 new tests (21 worktree commands + 14 worktree set/get)
- Commits:
  - `48dc80a` refactor(cli): options-object signature for resolveProjectWorktree, add findWorktreeByNameOrId
  - `2aa39c4` refactor(cli): extract askConfirmation to shared utils/confirm.ts
  - `e3ea169` feat(cli): add cf worktree init/list/rm commands and register in CLI
  - `d6a026b` test(cli): add unit tests for cf worktree init/list/rm commands
  - `480b0cb` feat(cli): worktree-aware projectSetAction and projectGetAction with --project-level flag
  - `f7a6b55` test(cli): add worktree-aware projectSetAction and projectGetAction tests

### Slice 181: WorktreeContext Data Model & Storage — Phase 6 (Implementation) ✓
- `WorktreeContext`, `CreateWorktreeInput`, `UpdateWorktreeInput`, `IndexRangeOverlap` types in `worktree.ts`
- `ProjectData.worktrees?: WorktreeContext[]` extension with `UpdateProjectData` support
- `WorktreeService` with CRUD, forward/reverse migration, index range overlap detection
- Forward migration creates "Default" worktree from existing workflow fields on first `addWorktree`
- Reverse migration restores fields to project on last `removeWorktree`, sets `worktrees: undefined`
- Both migrations atomic (single `store.update()` call)
- `migrateProjectFields()` updated to preserve `worktrees` array
- 36 unit tests, 578 total tests pass (0 regressions)
- Commits:
  - `7c1aefd` feat(core): add WorktreeContext types and extend ProjectData
  - `752d4a3` feat(core): add WorktreeService with CRUD operations
  - `02e05b1` test(core): add WorktreeService CRUD tests
  - `33a856a` feat(core): add forward and reverse migration to WorktreeService
  - `ef9969a` test(core): add forward/reverse migration and atomicity tests
  - `7c66e10` feat(core): add index range overlap detection to WorktreeService
  - `4ea224a` feat(core): preserve worktrees field in migrateProjectFields

## 2026-03-10

### Slice 183: Worktree CLI Commands — Phase 4 (Slice Design)
- Created slice design `183-slice.worktree-cli-commands.md`
- Key decisions: options-object signature for `resolveProjectWorktree({ project?, worktree? }, store)`, narrow `--worktree` flag scope (worktree subcommands only), git path validation warns when git unavailable / hard-errors when path not in known list, `--project-level` escape hatch on `cf set`/`cf get`
- `cf worktree list` table format follows `cf project list` exactly (same `renderTable`, `success()`, `'* '` prefix pattern)
- `WORKTREE_SCOPED_FIELDS` set drives routing in `projectSetAction`; auto-set logic targets whichever context is active

### Slice 182: Worktree Discovery & CWD Resolution — Phase 6 (Implementation) ✓
- `GitWorktreeDiscovery` service in `packages/core/src/git/` — parses `git worktree list --porcelain` into `WorktreeInfo[]`
- `WorktreeInfo` type; extended `findProjectByCwd` → `CwdMatch | null` with worktree path matching
- `resolveProjectWorktree()` — worktree-aware resolution returning optional `worktreeId`; `resolveProjectId` refactored as backwards-compatible wrapper
- `ResolutionSource` extended with `'worktree'`; fixed real-world edge case: `prunable <reason>` not just `prunable`
- 996 tests pass across all packages (0 regressions)
- Commits: `1413fcb` feat(core): add GitWorktreeDiscovery service and WorktreeInfo type · `3083fff` feat(cli): extend CWD resolution to be worktree-aware

### Slice 181: WorktreeContext Data Model & Storage — Phase 5 (Task Breakdown)
- Created `181-tasks.worktreecontext-data-model-storage.md` (8 tasks, 264 lines)
- Tasks: types → CRUD → CRUD tests → migration → migration tests → overlap detection → migrateProjectFields update → final verification
- Test-with pattern: test tasks follow implementation tasks (3 after 2, 5 after 4, 6.3 after 6.1-6.2)

### Slice 181: WorktreeContext Data Model & Storage — Phase 4 (Slice Design)
- Created slice design `181-slice.worktreecontext-data-model-storage.md`
- Key decision: `WorktreeService` in `packages/core/src/services/` owns CRUD + migration logic (keeps `FileProjectStore` as pure serialization layer)
- Types: `WorktreeContext`, `CreateWorktreeInput`, `UpdateWorktreeInput`, `IndexRangeOverlap` in `packages/core/src/types/worktree.ts`
- Forward migration creates "default" worktree context from existing workflow fields; reverse migration restores them
- `fileConcept` already covers project-level concept doc reference — no new field needed
- Verification walkthrough covers CRUD, forward/reverse migration, backwards compatibility, overlap detection
- Updated slice plan status to `in_progress`

## 2026-03-09

### Initiative 180: Initiative Contexts (Worktrees) — Phase 3 (Slice Planning)
- Created slice plan `180-slices.initiative-context-worktree.md` (7 slices, 181-187)
- Foundation: WorktreeContext data model & storage (nested on ProjectData)
- Features: worktree discovery & CWD resolution, `cf worktree` CLI commands, status/display updates, worktree-aware context assembly, MCP worktree tools
- Integration: validation, edge cases & polish
- Naming decision: "worktree" as user-facing term (avoids overloading "context" and "initiative")
- MCP included (slice 186) for context-visualizer support, despite architecture doc deferral
- Commits:
  - `bff4d17` docs: add slice plan for initiative contexts (worktrees)

### Slice 178: Consistency Checker All-Slices Mode — Phase 6 (Implementation) ✓
- `checkAll()`/`fixAll()` methods iterate all slice plan entries with `[sliceIndex]` prefix attribution
- Extracted `checkSlice()` shared logic; extracted `applyFixes()` shared by `fix()`/`fixAll()`
- 3 new rules: duplicate-index (R6), plan-status-vs-entries (R7), arch-status-vs-plans (R8)
- CLI: `--slice <index>` narrows, `--yes` skips confirmation, grouped output by slice
- MCP: `sliceIndex` optional param, defaults to all-slices, no confirmation prompt
- 11 new core tests, 1 new CLI confirmation prompt test, 2 new MCP routing tests
- Commits:
  - `3908e21` feat(core): add checkAll() method and extract checkSlice() shared logic
  - `a424a02` feat(core): add rules 6-8 for duplicate index, plan status, arch status
  - `a933941` feat(core): add fixAll() method and extract shared applyFixes() logic
  - `8503d17` feat(cli): add --slice and --yes flags, all-slices default for cf check
  - `928fa2a` feat(mcp): add sliceIndex param to workflow_check, default to all-slices
  - `7300922` test(core): add unit tests for checkAll, fixAll, and rules 6-8
  - `f3749c4` test(cli): add confirmation prompt test for cf check --fix

### Slice 178: Consistency Checker All-Slices Mode — Phase 5 (Task Breakdown)
- Created `178-tasks.consistency-checker-all-slices-mode.md` (8 tasks)
- Tasks: checkAll method + refactor, 3 new rules, fixAll, CLI flags + confirmation, MCP sliceIndex, core tests, CLI tests, verification

### Slice 178: Consistency Checker All-Slices Mode — Phase 4 (Slice Design)
- Designed all-slices iteration for `ConsistencyChecker` (`checkAll`/`fixAll` methods)
- 3 new rules: duplicate index detection, plan status vs entries-complete, arch status vs plans-complete
- Safety: single-pass (no cascading), CLI `y/N` confirmation for fix-all, `--slice` flag to narrow scope
- CLI default switches to all-slices; MCP adds optional `sliceIndex` parameter

### Release v0.4.0
- Minor version bump: @context-forge/core, @context-forge/cli, @context-forge/mcp all → 0.4.0
- Key additions: `cf setup-ide claude`, context-profile-aware assembly, `fileConcept` field, slash command fixes
- Tags: @context-forge/core@0.4.0, @context-forge/cli@0.4.0, @context-forge/mcp@0.4.0

## 2026-03-08

### Slice 177: IDE Setup Command — Phase 6 (Implementation) ✓
- `cf setup-ide claude` command: project resolution, guide detection, CLAUDE.md backup + y/N prompt, script invocation via `execFileSync`
- 6 unit tests covering invalid target, guides not installed, script not found, no CLAUDE.md, --yes backup, non-zero exit
- Smoke tested end-to-end: backup created, script ran successfully
- Commits:
  - `6154b52` feat(cli): add cf setup-ide command
  - `0321b77` test(cli): add unit tests for cf setup-ide command

### Slice 177: IDE Setup Command — Phase 5 (Task Breakdown)
- Created `177-tasks.ide-setup-command.md` (6 tasks, 175 lines)
- Tasks: command skeleton + registration, project/guide resolution, CLAUDE.md safety checks, script invocation, unit tests, build verification

### Slice 177: IDE Setup Command — Phase 4 (Slice Design)
- Designed `cf setup-ide claude` CLI command wrapping ai-project-guide's `setup-ide` script
- Safety guardrails: detects existing `CLAUDE.md`, prompts y/N, creates `.bak` before overwrite
- Added slice plan entry (177) in 160-slices, renumbered future work to 178-179
- Positional target argument (`cf setup-ide claude`) for future IDE extensibility

### Slice 176: Context-Profile-Aware Assembly — Phase 6 (Implementation) ✓
- `fileConcept` field added to `ProjectData`, `ContextData`, `projectSchema`, `ContextIntegrator`, `TemplateProcessor`, and MCP `project_update`
- `ContextProfileParser` new service: parses `yaml type: context-profiles` block from prompt asset; normalises instruction strings (phase names, "Maintenance Task", etc.); falls back to `_default`
- Context profiles YAML block added to `packages/core/assets/prompt.ai-project.system.md` (10 profiles)
- Profile-aware filtering in `ContextIntegrator.mapProjectToEnhancedContext()`: zeros artifact fields not in active profile; skips if profiles absent (safe fallback); injected `readFileFn` preserves browser-safety
- `cf build --instruction-type <type>` / `--it <type>` flag: overrides instruction for profile lookup without persisting
- `context_build` MCP tool: `instructionType` param maps to `instruction` override, takes precedence over `instruction`
- 529 core tests, 157 CLI tests, 122 MCP tests — all passing
- Commits:
  - `4e3628c` feat(core): add fileConcept field to types, schema, integrator, and MCP update tool
  - `dce96a0` feat(core): add context-profiles YAML block and ContextProfileParser service
  - `b6b9456` feat(core): add profile-aware artifact filtering to ContextIntegrator
  - `b37647e` feat(cli): add --instruction-type / --it flag to cf build
  - `5c7aa18` feat(mcp): add instructionType param to context_build and fileConcept to project_update

### Slice 176: Context-Profile-Aware Assembly — Phase 5 (Task Breakdown)
- Created `176-tasks.context-profile-aware-assembly-update.md` (15 tasks, 150 lines)
- Tasks cover: `fileConcept` type/schema/pipeline wiring, `ContextProfileParser` new service + tests, profile filtering in `ContextIntegrator` + tests, `--instruction-type` CLI flag + tests, `instructionType` MCP param + tests, full build/smoke validation

### Slice 176: Context-Profile-Aware Assembly — Phase 4 (Slice Design)
- Created `176-slice.context-profile-aware-assembly-update.md`
- Design: context profiles YAML block in prompt asset; `ContextProfileParser`; `fileConcept` field; profile-filtered variable injection; `--instruction-type` CLI flag; `instructionType` MCP parameter
- Also: schema field ordering (spec→hld→arch→plan→slice→tasks), auto-set fileSlicePlan on fileArch change, cf next arch-not-found check
- Commits: `5d16bdb` docs: add slice 176 design, `f8c12b2` feat: schema ordering + auto-set plan on arch + cf next arch check, `3ba6ef9` fix(core): null-safety in arch file existence check

## 2026-03-07

### v0.3.6 — Maintenance
- Guide install creates user directories (`user/`, `architecture/`, `slices/`, `tasks/`, `project-guides/`)
- `cf next` recommends architecture before slice plan when neither exists
- Electron date picker normalizes YYYYMMDD → YYYY-MM-DD
- Removed obsolete `900-tasks.test-infrastructure-deferred.md`, cleaned up maintenance file
- Tags: @context-forge/core@0.3.6, @context-forge/cli@0.3.6, @context-forge/mcp@0.3.6
- Commits:
  - `3507628` chore: remove obsolete test infrastructure tasks, clean up maintenance file
  - `13abc2b` feat(core): create user artifact directories on guide install
  - `7a472b3` fix(electron): normalize YYYYMMDD dates for HTML date input
  - `50a9dbb` fix(core): cf next recommends architecture before slice plan

### v0.3.5 — Slice 166: Consistency Checker
- `ConsistencyChecker` core service with 5 detection rules (added Rule 5: task-file-status after initial release)
- Rule 5 catches task file frontmatter status drift (e.g., `status: in_progress` when all tasks complete)
- `MarkdownWriter` utility for non-destructive write-back (checkbox toggling + frontmatter field updates)
- Fix mode with `FixLogEntry` before/after tracing for each applied correction
- `workflow.auto_fix` config key, `workflow_check` MCP tool (25 total), `cf check` CLI command
- 506 core tests, 119 MCP tests, 154 CLI tests — all passing
- Commits:
  - `8b748ed` feat(core): add consistency checker types and workflow.auto_fix config key
  - `d66abc9` feat(core): add MarkdownWriter utility for checkbox and frontmatter updates
  - `55335ee` feat(core): add ConsistencyChecker with 4 detection rules
  - `134b1e9` test(core): add fix mode tests for ConsistencyChecker
  - `4ba79b4` feat(mcp): add workflow_check tool for consistency checking
  - `b030219` feat(cli): replace cf check stub with consistency checker implementation
  - `46148fb` feat(core): add Rule 5 — task file frontmatter status vs computed completion
  - `b97156d` style(cli): clarify --project help text accepts name or ID
  - `1b29836` fix(cli): cf:prompt slash command correctly routes get vs list subcommands
- Tags: @context-forge/core@0.3.5, @context-forge/cli@0.3.5, @context-forge/mcp@0.3.5

### Post-165: Workflow fixes, discovery commands, and UX enhancements
- Fix artifact path resolution: added `resolveArtifactPath()` — stems now correctly resolve to full paths with directory prefix and `.md`
- Fixed `slicePlan` being null in `WorkflowNavigator`, `ArtifactIntrospector`, and `cf slice list`
- Smart index resolution: `cf set slice 166` derives filename from slice plan when no file exists on disk (`deriveArtifactStem`)
- Auto-set `fileTasks` derives from slice name even when task file doesn't exist yet (CLI + MCP)
- Discovery commands: `cf arch list`, `cf plan list`, `cf slice list`, `cf task list`, `cf task items`
- `cf status` now shows Date, Arch, and Plan fields
- Slash command optimization: `cf:build` and `cf:prompt get` internalize context instead of echoing (~800 tokens saved)
- READMEs updated with discovery commands, smart index resolution, changelog
- 847 tests (475 core, 151 CLI, 115 MCP, 106 Electron)
- Tags: @context-forge/core@0.3.4, @context-forge/cli@0.3.4, @context-forge/mcp@0.3.4
- Commits:
  - `8d67963` fix: resolve artifact paths correctly, enhance status and task commands
  - `042b364` feat(cli): derive artifact stem from slice plan when file doesn't exist
  - `3772464` feat(cli): restructure task commands, add cf plan list
  - `2f5e276` docs: update READMEs with discovery commands and smart index resolution
  - `d3f2ff5` style(cli): optimize slash command prompts for token efficiency

### Slice 165: Workflow Navigator & Discovery — Implementation Complete
- `WorkflowNavigator` core service: `getStatus()` derives slice status from filesystem, `getNext()` priority-ordered state machine with 7 levels
- Core types: `SliceStatus`, `WorkflowStatus`, `NextAction` in introspection/types.ts
- MCP tools: `workflow_status`, `workflow_next` (24 total MCP tools)
- CLI discovery: `cf slice list` (plan entries with active/next markers), `cf task list` (items with progress), `cf arch list` (initiatives with progress)
- Auto-set `fileTasks` on `fileSlice` change (CLI + MCP, best-effort, one-way)
- `cf status` and `cf next` now use WorkflowNavigator (removed provisional `deriveRecommendation`)
- `cf next` shows `suggestedCommand` when available
- Config key `workflow.auto_advance` registered (behavior deferred)
- 846 tests (475 core, 150 CLI, 115 MCP, 106 Electron)
- Commits:
  - `01248d4` feat(core): add SliceStatus, WorkflowStatus, NextAction types
  - `665f163` feat(core): add WorkflowNavigator.getStatus() with tests
  - `5c2e42c` feat(core): add WorkflowNavigator.getNext() with tests
  - `fa634b9` feat(cli): auto-set fileTasks when fileSlice changes
  - `4126c40` feat(mcp): auto-set fileTasks when fileSlice changes in project_update
  - `8264498` feat(cli): add cf slice list command
  - `a03ddbf` feat(cli): add cf task list command
  - `7dff90a` feat(cli): add cf arch list command
  - `9e1fe35` feat(mcp): add workflow_status and workflow_next MCP tools
  - `f8c370c` refactor(cli): replace provisional deriveRecommendation with WorkflowNavigator

## 2026-03-06

### Slice 175: Context Output Consolidation — Implementation Complete
- Artifact fields (`fileArch`, `fileSlicePlan`, `fileHLD`, `fileSpec`) added to ContextData, mapped through pipeline, with template aliases (`arch`, `plan`, `hld`, `spec`) and index extraction (`archIndex`, `planIndex`, `hldIndex`)
- Consolidated `### Project Context` section with clean key-value format, conditional artifact lines
- Unified opening statement (`project-statement`) — no more start/continue branching
- Phase→instruction auto-set: `cf set phase 6` also updates `instruction` (CLI + MCP)
- Template conditionals: support `{{#if var}}content{{/if}}` without requiring `{{else}}`
- Phase resolution in `cf build --phase`: accepts P1-P7 shorthands, numbers, short names; warns on unrecognized values
- Instruction matcher (`getPromptForInstruction`) handles full phase strings like `Phase 5: Task Breakdown`
- README overhaul: root (screenshots, structure), CLI (git-like model, slash commands section), core, MCP
- Updated ai-project-guide to v0.13.3
- 801 tests (451 core, 135 CLI, 109 MCP, 106 Electron)
- Tags: @context-forge/core@0.3.2, @context-forge/cli@0.3.2, @context-forge/mcp@0.3.2
- Commits:
  - `469d22c` docs: add slice 175 design
  - `61c2ef2` docs: add task breakdown
  - `ec3967c` feat(core): add artifact fields to ContextData and ContextIntegrator
  - `e66b318` feat(core): add artifact variables and index extraction to TemplateProcessor
  - `d3b9261` feat(core): consolidate project info section in SectionBuilder
  - `b7986fe` feat(core): simplify opening statement to unified project-statement
  - `eb3dbe7` feat(cli,mcp): auto-set instruction when developmentPhase changes
  - `c595dc4` fix(cli): update shortcuts test for phase→instruction auto-set
  - `1e57417` docs: update READMEs for slice 175 changes
  - `a4044f3` package: bump core, cli, mcp to 0.3.1; update READMEs and add assets
  - `0111087` docs: update ai-project-guide to v0.13.3
  - `cc059f9` fix(core,cli): phase resolution, instruction matching, and template conditionals

### Slice 174: Claude Code Commands — Implementation Complete
- Seven slash commands: `/cf:status`, `/cf:build`, `/cf:next`, `/cf:prompt`, `/cf:get`, `/cf:set`, `/cf:project`
- `cf install-commands` / `cf uninstall-commands` with `--target` override
- Commands instruct Claude to present output without commentary
- Improved `cf project --schema` readability (unified table, alias column, enum values at bottom)
- 776 tests total (430 core, 133 CLI, 107 MCP, 106 Electron)
- Commits:
  - `bd8b4fd` feat(cli): add Claude Code slash command files for cf wrapper
  - `27b0d8b` feat(cli): add install-commands and uninstall-commands for Claude Code
  - `9c8ecc1` test(cli): add install/uninstall command tests
  - `4c2a517` fix(cli): cf:prompt command routes get/list subcommands correctly
  - `229a30b` style(cli): slash commands present output without commentary
  - `4769202` feat(cli): add cf:get, cf:set, cf:project slash commands
  - `6818eb2` style(cli): improve cf project --schema readability

### Slice 173: Smart Field Setting — Implementation Complete
- customData sub-fields (`events`, `notes`, `tools`) settable via `cf set` with merge semantics
- Schema-driven `Custom` group in `cf get`, `cf set --help`, `cf project --schema`
- Index-based file resolution: `cf set slice 171` scans `project-documents/user/slices/` for matching file
- `resolveFileByIndex` helper in core for all artifact fields (fileSlice, fileTasks, fileArch, fileSlicePlan, fileHLD, fileSpec)
- 767 tests total (430 core, 124 CLI, 107 MCP, 106 Electron)
- Commits:
  - `87eacb3` fix(cli): cf build --phase now overrides instruction prompt
  - `6cebac4` feat(core): add customData sub-fields to project schema
  - `02451f0` feat(cli): settable customData fields via cf set events/notes/tools
  - `ebdb601` feat(core): add resolveFileByIndex for index-based artifact file resolution
  - `871139e` feat(cli): index-based file resolution for cf set artifact fields

### CLI: Top-level `cf set` / `cf get` shortcuts
- Added `cf set <field> <value>` as shortcut for `cf project set` — e.g. `cf set phase 4`
- Added `cf get` as shortcut for `cf project get`
- Extracted shared action handlers (`projectSetAction`, `projectGetAction`) from project command
- 5 new tests (115 CLI total)
- Tags: @context-forge/core@0.2.3, @context-forge/mcp@0.2.3, @context-forge/cli@0.2.3

## 2026-03-05

### Slice 172: Guide Management — Implementation Complete
- Core: `GuideDetector`, `GuideManager`, three strategies (SubmoduleStrategy, CloneStrategy, TarballStrategy) in `packages/core/src/guides/`
- Git helper (`gitExec.ts`) with safe `execFile` wrapper, `isGitAvailable`, `isGitRepo`
- MCP: `guide_status`, `guide_install`, `guide_update` tools (22 total)
- CLI: `cf guides` with `info` (default), `install`, `update` subcommands
- 735 tests passing (412 core + 110 CLI + 107 MCP + 106 Electron)
- Implementation commits:
  - `64b47dd` feat(core): add guide management types and strategy interface
  - `1757f1f` feat(core): add git execution helper for guide management
  - `c4991ec` feat(core): add GuideDetector for installation state detection
  - `48b6d3c` feat(core): add SubmoduleStrategy for guide installation
  - `d5ed014` feat(core): add CloneStrategy for guide installation
  - `71a3b7d` feat(core): add TarballStrategy for guide installation
  - `a581add` feat(core): add GuideManager orchestration layer
  - `d6b712f` feat(core): export guide management module
  - `8252fe8` feat(mcp): add guide_status, guide_install, guide_update tools
  - `a66689a` fix(mcp): update server lifecycle test for 22 tools
  - `ce690e0` feat(cli): add cf guides command for guide lifecycle management

### Slice 172: Guide Management — Design & Task Breakdown Complete
- Slice design for guide install/update/status lifecycle management
- Strategy pattern: submodule (default), clone, tarball for installation methods
- MCP tools: `guide_install`, `guide_status`, `guide_update`; CLI: `cf guides`
- Core module: `GuideManager`, `GuideDetector`, strategy implementations in `packages/core/src/guides/`
- Consumes existing config keys (`guide.source`, `guide.git_strategy`) and bundled prompt fallback
- Fixed 780-slices references (was incorrectly pointing to slice 171)
- Task breakdown: 12 tasks, 262 lines, test-with pattern throughout
- Commits:
  - `46ed877` docs: add slice 172 guide management design
  - `24647c3` docs: add task breakdown for slice 172 guide management

### Slice 171: Project Schema Visibility & Smart Field Setting — Implementation Complete
- Core schema module (`packages/core/src/schema/projectSchema.ts`): field metadata, aliases, phase maps, resolution helpers as single source of truth
- CLI: smart `cf project set` with aliases/phase resolution, grouped `cf project get`, `cf project --schema`, `cf project rm`
- MCP: `project_schema` tool (19 total tools)
- Electron: `fs.watch` on `projects.json` with debounced IPC refresh
- 672 tests passing (366 core + 100 CLI + 100 MCP + 106 Electron)
- Commits:
  - `83a196f` feat(core): add project schema definition module with field metadata and resolution helpers
  - `5fe901e` test(core): add unit tests for project schema module
  - `9cc1666` feat(cli): smart project set with aliases, phase resolution, and validation
  - `b929323` test(cli): add tests for smart project set with aliases and phase resolution
  - `5d2f89b` feat(cli): grouped project get display with artifact field visibility
  - `05dfd18` feat(cli): add cf project --schema for schema introspection
  - `aba1f74` feat(mcp): add project_schema tool for schema introspection
  - `1bacf96` feat(cli): add cf project rm command
  - `d306838` feat(electron): auto-refresh project list on external projects.json changes
  - `a24d1ed` fix(mcp): update server lifecycle test for 19 tools
  - `5f7e301` fix(cli): accept positional name/ID argument for cf project rm
  - `c1bfb3f` fix(cli): show help when cf project is run with no arguments
  - `1cbe989` fix(cli): show concise usage hint for cf project, full help via --help

### Slice 170: Project Model Cleanup & CLI Init — Complete
- Removed `isMonorepo`, `isMonorepoEnabled`, `monorepoNote` from entire stack (types, 5 core services, MCP schemas, CLI, 6 Electron files, 21 test files)
- Added `cf init` command (registers CWD as project, derives name from basename, --name override)
- Added `default_project` deprecation warning to stderr when resolution falls through to config
- Added `server_version` MCP tool (returns name + version as JSON)
- Migration strips legacy monorepo fields on read; TypeScript compiler caught all consumers
- 632 tests passing across all packages (346 core + 84 CLI + 97 MCP + 105 Electron)
- Commits:
  - `88d9364` refactor(core): remove monorepo fields from types, services, and tests
  - `2ca41c2` refactor(mcp): remove monorepo fields from schemas and tests
  - `c4264cf` feat(mcp): add server_version tool
  - `770b464` refactor(cli): remove monorepo fields from project command and tests
  - `9c2071d` feat(cli): add cf init command
  - `dde2306` feat(cli): add deprecation warning for default_project config
  - `a9e2512` refactor(electron): remove monorepo fields from UI, IPC, and tests
  - `0b92955` fix: clean up stale monorepo references in fixtures and comments

## 2026-03-04

### Maintenance: Version Tagging & Dynamic Reads
- CLI and MCP server now read version from `package.json` via `createRequire` — no more hardcoded strings
- Fixed MCP server version drift (hardcoded 0.1.0 vs package.json 0.1.1)
- Established git tagging convention: `@scope/pkg@version` (monorepo standard)
- Added `Tags:` line to DEVLOG format
- Tags: `@context-forge/cli@0.2.1`
- Commits:
  - `10be0e5` fix: read version from package.json instead of hardcoded strings
  - `567f292` docs: add git tags and DEVLOG tagging convention
  - `c597a2d` package(cli): bump version to 0.2.1

### Slice 169: Multi-Project & UX Polish — Phase 6 (Implementation) Complete
- 10 tasks, all complete. 80 tests (18 new + 62 original), all passing.
- `findByNameOrId` + `findProjectByCwd` utilities in `packages/cli/src/utils/project.ts`
- Three-step `resolveProjectId` chain: flag → CWD → default, returns `{ id, source: ResolutionSource }`
- `cf status` shows resolution indicator: `(from CWD)`, `(default)`, `(--project flag)`
- `cf project list` compact format: Name/Path/Slice/Default with `●` indicator, `~` path shortening
- Output presentation matching orchestration CLI: borderless tables (bold cyan headers, `─` underline), aligned config list, colored help (yellow commands, cyan options, bold titles)
- Removed `cli-table3` dependency — replaced with custom chalk-based table renderer
- Version bump 0.1.0 → 0.2.0 with changelog in README
- Tags: `@context-forge/cli@0.2.0`, `@context-forge/core@0.1.1`, `@context-forge/mcp@0.1.1`
- Commits:
  - `178bd40` feat(cli): add findByNameOrId and findProjectByCwd utilities
  - `c7fd2eb` feat(cli): three-step project resolution chain with source tracking
  - `6d1fe48` feat(cli): show resolution source in cf status
  - `b20969b` feat(cli): name-based project resolution
  - `b30e2e9` feat(cli): compact cf project list with default indicator
  - `e1f1848` style(cli): tighten output formatting across commands
  - `81bb13f` docs(cli): version 0.2.0 changelog and README updates
  - `55d78bd` fix(cli): update hardcoded version string to 0.2.0
  - `64e18f6` style(cli): match orchestration output style — borderless tables, colored help

### Slice 169: Multi-Project & UX Polish — Phase 5 (Task Breakdown)
- 9 tasks across CWD detection, name-based resolution, resolution indicators, output formatting, and version bump

### Slice 168: CLI Foundation — Phase 6 (Implementation) Complete
- `packages/cli` fully implemented: 8 commands (status, next, build, config, project, future, check stub, prompt)
- 62 tests (58 unit + 4 integration), all passing
- `cf status` and `cf next` use ArtifactIntrospector (provisional — full WorkflowNavigator depends on slice 165)
- `cf build` uses same `createContextPipeline` as MCP server — output parity verified
- `cf prompt get` with runtime phase shorthand parser (P1–P7), variable substitution, `--raw` flag
- `cf check` stubbed pending slice 166 (Consistency Checker)
- Commits:
  - `e5a46e7` feat(cli): scaffold packages/cli with 8 command stubs
  - `9ddb1ed` feat(cli): add shared utilities
  - `54a71ee` feat(cli): implement cf config
  - `508f358` feat(cli): implement cf project
  - `8a16871` feat(cli): implement cf status and cf next
  - `0533dc5` feat(cli): implement cf build, cf future, cf check stub
  - `7af4aaa` feat(cli): implement cf prompt with phase shorthand parser
  - `28ccdc4` feat(cli): polish help text
  - `d5a6dc9` test(cli): integration tests
  - `e9bbf09` docs(cli): README

---
## 2026-03-03

### Slice 168: CLI Foundation — Phase 5 (Task Breakdown) Complete
- Task files created: `168-tasks.cli-foundation-1.md` (Tasks 1–4: scaffolding, utilities, config, project) and `168-tasks.cli-foundation-2.md` (Tasks 5–13: status, next, build, future, check stub, prompt, polish, integration tests, docs)
- Split into two files per 350-line guideline; combined 314 lines
- `cf check` documented as stub pending slice 166 (Consistency Checker)
- Phase shorthand parser (P1–P7) specified as runtime-derived from prompt asset, never hardcoded
- Next: Phase 6 implementation of `packages/cli`

### Maintenance: Tasks 11–14 Triaged; Task 14 Implemented
- Reviewed open maintenance tasks (11–14); all four remain relevant
- Logged GitHub issues: #35 (path validation P1), #36 (CSP tightening P2), #37 (external URL allowlist P3), #38 (empty state for missing projectPath)
- Task 14 implemented: `useContextGeneration.ts` clears stale `contextString` on error; `ContextBuilderApp.tsx` detects missing-projectPath error and shows user-friendly message
- Manually verified: new project without directory shows correct message; switching between configured/unconfigured projects shows correct state; closed #38
- Commits: `0a3fcb9`

---

## 2026-03-02

### Slice 168: CLI Foundation — Phase 4 (Slice Design) Complete
- Design created at `project-documents/user/slices/168-slice.cli-foundation.md`
- Covers: `packages/cli/` structure, 8 commands (`cf status`, `next`, `build`, `config`, `project`, `future`, `check`, `prompt`), commander.js, chalk, cli-table3
- Key design decision: `cf prompt` (singular) replaces `cf prompts`; adds `cf prompt get <phase>` with variable substitution — lightweight mid-session phase-pivot alternative to full `cf build`
- Phase shorthand mapping (P1–P7, P2.5, P3.5) auto-built from `(Phase n)` / `(Phase n.m)` headings in prompt asset file; case-insensitive, hyphen/space interchangeable
- Unresolvable variables preserved as-is (no silent blanking)
- Testing spec includes: variable substitution with full/partial project data, `--raw` mode
- Commits: `f71d870` (initial overview + slice design)
- Next: Phase 5 task breakdown for slice 168

---

## 2026-03-01

### Slice 167: Future Work Collector — Phase 7 (Implementation) Complete
- `FutureWorkCollector` service in `packages/core/src/introspection/` — aggregates future work across all initiatives; detects standalone `*-slices.future.*` files via filename; groups by initiative with source attribution
- Added `filepath` and `entries` fields to `SlicePlanBlock` type; populated in `buildModel()`
- New types: `CollectedFutureWorkItem`, `FutureWorkGroup`, `FutureWorkCollectorResult` in `types.ts`
- `workflow_future` MCP tool in new `workflowTools.ts`; input: `projectId`, `status` (all/pending/completed), `includeMarkdown`
- 42 total test files pass (core: 22, mcp-server: 9, electron: 11); 18 MCP tools total
- Commits: `bf7c94c` types+fixture, `421caf8` FutureWorkCollector+tests, `029db41` MCP tool+tests+wiring

### Fix: buildModel() now surfaces undesigned slices from slice plan main body
- Bug: planned-but-undesigned slices (e.g., 165-168) were invisible in MCP output; parse.py showed them correctly
- Root cause: builder iterated `futureWork` items for planned-slice fill instead of calling `parseSlicePlan()`
- Fix: added `parseSlicePlan()` call alongside `parseFutureWork()`; replaced buggy fill loop; added fixture entry + test
- 537 tests pass (was 536); commit: `a5669d9`

### Slice 167: Future Work Collector — Phase 5 (Task Breakdown) Complete
- 10 tasks across 5 phases; test-with pattern throughout
- Phase 1: types + standalone future-work fixture (Tasks 1-2)
- Phase 2: FutureWorkCollector service + markdown formatter + core export (Tasks 3-5)
- Phase 3: unit tests (Task 6); Phase 4: workflowTools.ts + tests + wiring (Tasks 7-9)
- Key design: standalone `*-slices.future.*` files use slicePlan.entries; regular plans use slicePlan.futureWork
- Commit: `6de2bfc`

### Slice 167: Future Work Collector — Phase 4 (Slice Design) Complete
- `workflow_future` MCP tool design: walks all slice plans, extracts future work, returns grouped view with source attribution
- Resolved architectural decisions: hybrid storage convention (inline `## Future Work` + standalone `*-slices.future.*` files), per-project scope only, checkbox convention for completed/migrated items
- Updated `780-slices.future.guide-management.md` to new checkbox convention
- Fixed slice numbering in 160-slices implementation order diagram
- Commit: `fe2288f`

### Slice 164: MCP Introspection Tools — Phase 7 (Implementation) Complete
- `ProjectModelBuilder` in `packages/core/src/introspection/` — `scanDirectory()` + `buildModel()` replicating parse.py
- 6 new MCP tools in `packages/mcp-server/src/tools/introspectionTools.ts`: `introspection_slice_plan`, `introspection_tasks`, `introspection_frontmatter`, `introspection_documents`, `introspection_future_work`, `project_structure`
- ProjectModel types: `DocSummary`, `FoundationEntry`, `ArchEntry`, `Initiative`, `SliceModelEntry`, `TaskModelEntry`, `MaintenanceEntry`, etc.
- Expanded fixture project with foundation doc, HLD, maintenance task, DEVLOG
- Updated `project_get` description to document `introspection` field
- 536 tests pass (core: 341, mcp-server: 89, electron: 106); full build clean; 17 MCP tools total
- Commits: `ceb3655` types+fixtures, `b637d88` ProjectModelBuilder, `d3fa530` MCP tools+tests+wiring

### Slice 164: MCP Introspection Tools — Phase 4 (Slice Design) Complete
- Six MCP tools: 5 granular parsers (`introspection_slice_plan`, `introspection_tasks`, `introspection_frontmatter`, `introspection_documents`, `introspection_future_work`) + aggregate `project_structure`
- New `ProjectModelBuilder` in core replicates parse.py's `build_model()` — directory scanning, filename regex, initiative band grouping
- Granular tools accept `projectId`+relative path or direct `filePath`; `project_structure` requires `projectId`
- Updates `project_get` description to document the `introspection` enrichment field
- Commit: `da9289e`

### Slice 164: MCP Introspection Tools — Phase 5 (Task Breakdown) Complete
- 18 tasks across 6 phases, test-with pattern throughout
- Phase 1: Types + fixture expansion (Tasks 1-2)
- Phase 2: ProjectModelBuilder — scanDirectory, buildModel + tests (Tasks 3-6)
- Phase 3: Path resolution helper (Task 7)
- Phase 4: 5 granular MCP tools + tests (Tasks 8-13)
- Phase 5: project_structure aggregate tool + wiring + project_get update (Tasks 14-17)
- Phase 6: Final verification (Task 18)
- Commit: `60f0c67`

## 2026-02-28

### Slice 163: Artifact Introspection Engine — Phase 7 (Implementation) Complete
- `packages/core/src/introspection/`: 6 parser modules + `ArtifactIntrospector` orchestrator
- Parsers: statusNormalizer, frontmatterParser, taskFileParser, slicePlanParser, futureWorkParser, documentDetector
- Types/interfaces export from `@context-forge/core`; implementations from `@context-forge/core/node`
- Enriched `project_get` MCP tool with computed `introspection` field
- 509 tests pass (core: 327, mcp-server: 76, electron: 106); full build clean; no new deps
- Commits: `c88e8e4` types, `3cc2088` status normalizer, `8858036` frontmatter, `8fdd071` task parser, `422e07c` slice plan, `8ff9bb1` future work, `f8976b8` document detector, `930a294` orchestrator, `d72f095` project_get enrichment

### Slice 163: Artifact Introspection Engine — Phase 5 (Task Breakdown) Complete
- 18 tasks across 4 commit checkpoints, test-with pattern throughout
- Tasks 1–3: types, interfaces, status normalizer + tests
- Tasks 4–9: frontmatter parser, task file parser, slice plan parser + tests for each
- Tasks 10–13: future work parser, document detector + tests
- Tasks 14–15: ArtifactIntrospector orchestrator + tests
- Tasks 16–17: `project_get` enrichment in MCP server + tests
- Task 18: final verification and cleanup

### Slice 163: Artifact Introspection Engine — Phase 4 (Slice Design) Complete
- Re-implements relevant parsing from context-visualizer `parse.py` in TypeScript as `packages/core/src/introspection/`
- Six parser modules: frontmatter, slice plan, task file, future work, document detector, status normalizer
- `ArtifactIntrospector` orchestrator with `IArtifactIntrospector` interface consumed by slices 164–166
- Enriched `project_get` with computed `introspection` summary (slice plan completion, task progress, artifact presence)
- No new npm dependencies; regex-based line parsing (no markdown AST); Node.js-only exports from `@context-forge/core/node`

### Slice 162: Config System — Phase 7 (Implementation) Complete
- `packages/core/src/config/`: `ConfigManager`, `ConfigKeys`, `configPaths`, `index` — two-tier TOML config (user + project)
- `packages/mcp-server/src/tools/`: `configTools.ts` (3 new tools), `resolveProjectId.ts` — 7 existing tools gain optional `projectId`
- 431 tests pass (core: 252, mcp-server: 73, electron: 106); full build clean
- Commits: `07ed46d` smol-toml dep, `d7abe49` core config module, `46771e7` core tests, `74c9c33` MCP config tools, `0b68c5e` MCP tests, `20018e1` default_project integration, `d8892e5` integration tests

### Slice 162: Config System — Phase 5 (Task Breakdown) Complete
- 13 task groups: setup → configPaths → ConfigKeys → ConfigManager → exports → unit tests → MCP tools → MCP tests → resolveProjectId → projectTools integration → context/state tools integration → integration tests → final verification
- Test-with pattern: ConfigManager tests follow implementation (task 6), MCP tool tests follow tool creation (task 8), integration tests follow default_project wiring (task 12)

### Slice 162: Config System — Phase 4 (Slice Design) Complete
- Two-tier TOML config: user-level (`~/.config/context-forge/config.toml`) + project-level (`{projectPath}/.context-forge.toml`)
- Three new MCP tools: `config_set`, `config_get`, `config_list` with scope and source reporting
- `ConfigManager` in `packages/core/src/config/` — resolution chain: project → user → default
- `default_project` integration: all project-accepting MCP tools gain optional `projectId` with config fallback
- Initial keys: `default_project`, `guide.auto_update`, `guide.source`, `guide.git_strategy`
- Uses `smol-toml` (zero-dep TOML parser); effort 2/5

### Slice 161: Project Schema Standardization — Phase 7 (Implementation) Complete
- Renamed `slice`→`fileSlice`, `taskFile`→`fileTasks`, `projectDate`→`dateProject` across all packages
- Added four artifact reference fields: `fileHLD`, `fileArch`, `fileSlicePlan`, `fileSpec`
- `migrateProjectFields()` handles old/new/mixed schema with new-name precedence (idempotent)
- Updated MCP tool schemas (`project_update`, `context_build`, `template_preview`) to new field names
- Updated Electron UI components (ContextBuilderApp, ProjectConfigForm, contextHandlers)
- All 392 tests pass (core: 230, mcp-server: 56, electron: 106), build succeeds
- Commits: `6e8389d` — types + storage, `3029d8c` — context pipeline, `94a98ca` — MCP tools + fixtures, `7373827` — integration tests + docs, `60cfcc8` — electron tests, `a6db65a` — electron UI, `1ba7bc8` — remaining electron tests

## 2026-02-26

### Slice 161: Project Schema Standardization — Phase 4 (Slice Design) Complete
- Designed schema migration for `ProjectData` field renames: `slice`→`fileSlice`, `taskFile`→`fileTasks`, `projectDate`→`dateProject`
- Defined four new artifact reference fields: `fileHLD`, `fileArch`, `fileSlicePlan`, `fileSpec`
- Mapped full consumer surface (7+ source files across types, storage, MCP tools, context pipeline)
- Migration strategy: read-normalize with old→new fallback, write-new exclusively, idempotent
- Documented integration points with Slices 162 (Config System) and 163 (Artifact Introspection)

### Slice 161: Project Schema Standardization — Phase 5 (Task Breakdown) Complete
- 7 task groups, 18 sub-tasks covering types, storage, context pipeline, MCP tools, templates, fixtures, verification
- Test-with pattern: unit tests immediately follow each implementation task
- 5 commit checkpoints distributed across task sequence
- Commits: `efa602d` — slice design, `277c182` — task breakdown

## 2026-02-23

### Slice 151: Documentation and Packaging — Complete
- `docs/TOOLS.md`: full parameter reference for all 8 MCP tools
- `packages/mcp-server/README.md`: installation, Claude Code/Cursor config, tool overview
- `packages/core/README.md`: export paths, key services, monorepo role
- Root `README.md` updated: MCP server functional, quick start for CLI users
- Both package.json files: removed `private:true`, added publishing metadata (description, keywords, repository, engines, files)
- Commits:
  - `5c78dd6` — docs: add MCP tool reference (docs/TOOLS.md)
  - `b4c3668` — docs: add MCP server README
  - `8704afe` — docs: add core package README
  - `1579585` — docs: update root README
  - `76350a9` — chore: add npm publishing metadata

### Slice 150: MCP Server Integration Testing — Phase 7 (Implementation) Complete
- 25 integration tests added across all 8 MCP tools using real `@context-forge/core` services
- Fixture project: `packages/mcp-server/tests/fixtures/integration-project/` (self-contained)
- Helper module: `tests/helpers/integrationSetup.ts` (createIntegrationClient, setupFixtureEnv, resetFixtureData)
- All 56 tests pass (31 unit + 25 integration); workspace builds clean
- Commits: `125838d` — test(mcp-server): add integration test suite with fixture project (slice 150)

### Slice 150: MCP Server Integration Testing — Phase 5 (Task Breakdown) Complete
- Task file: `150-tasks.mcp-integration-test.md` — 17 tasks across 5 phases
- Phase 1: Test infrastructure (fixture project, helper module, smoke test) — Tasks 1-4
- Phase 2: Project tool integration tests (list, get, update) — Tasks 5-8
- Phase 3: Context tool integration tests (build, preview, prompt_list, prompt_get) — Tasks 9-13
- Phase 4: State tool integration tests (context_summarize) — Tasks 14-15
- Phase 5: Validation and finalization — Tasks 16-17

## 2026-02-22

### Slice 150: MCP Server Integration Testing — Phase 4 (Slice Design) Complete
- Slice design: `150-slice.integration-core-test.md` — integration tests for all 8 MCP tools against real core services
- Fixture project with known configuration; `CONTEXT_FORGE_DATA_DIR` env override for isolation
- Tests use `InMemoryTransport` with all tool groups registered (no `vi.mock()` on core)
- Estimated 20-28 integration tests covering project CRUD, context generation, prompt listing, state updates
- Effort 2/5

### Slice 149: Core Test Suite — Implementation Complete
- 170 new tests across 8 test files + 1 helper module; 224 total core tests passing
- TemplateProcessor (28), SystemPromptParser (24), StatementManager (25), ProjectPathService (18), SectionBuilder (38), ContextTemplateEngine (18), ContextIntegrator (16), CoreServiceFactory (3)
- Shared `testData.ts` helper with 5 factory functions; fixture expansion for StatementManager format + prompt instruction variants
- Commits: cac74ba, cf7ae19, a9b6609, a44ecd7, dee6498

### Slice 149: Core Test Suite — Phase 5 (Task Breakdown) Complete
- Task file: `149-tasks.integration-core-test.md` — 18 tasks across 6 phases
- Phase 1: Test infrastructure (helpers, fixture expansion) — Tasks 1-4
- Phase 2: Pure logic tests (TemplateProcessor) — Tasks 5-6
- Phase 3: Filesystem service tests (SystemPromptParser, StatementManager, ProjectPathService) — Tasks 7-10
- Phase 4: Mock-injected tests (SectionBuilder) — Tasks 11-12
- Phase 5: Integration tests (ContextTemplateEngine, ContextIntegrator, CoreServiceFactory) — Tasks 13-16
- Phase 6: Final validation and DEVLOG — Tasks 17-18
- Commit checkpoints at Tasks 4, 6, 10, 12, 16, 18

### Slice 149: Core Test Suite — Phase 4 (Slice Design) Complete
- Slice design: `149-slice.integration-core-test.md` — comprehensive unit tests for all `packages/core/src/services/` modules
- 8 test files covering: TemplateProcessor, SystemPromptParser, StatementManager, SectionBuilder, ContextTemplateEngine, ContextIntegrator, ProjectPathService, CoreServiceFactory
- Shared test helper module (`testData.ts`) with factory functions for mock data construction
- Testing strategy: real temp directories for filesystem tests (matching existing patterns), interface mocks for dependency injection, fixture project for integration tests
- Estimated 40-60 test cases, effort 2/5

### Slice 148: Electron Client Conversion — Implementation Complete
- 4-phase migration executed; Electron is now a thin UI client over `@context-forge/core`
- **Deleted:** `StorageClient`, `ElectronStorageService`, `PersistentProjectStore`, `ProjectManager`, `StatementManagerIPC`, `SystemPromptParserIPC`, `ServiceFactory`, `contextServices.ts` (legacy IPC wrappers)
- **Created:** `projectHandlers.ts`, `contextHandlers.ts`, `appStateHandlers.ts` (main-process domain handlers), `services/api.ts` (renderer API), `globals.d.ts` (Window type declarations)
- **Updated:** `main.ts`, `preload.ts`, `useContextGeneration.ts`, `ContextBuilderApp.tsx`
- Tests: 106/106 passing (24 new handler tests + 5 hook tests); bundle sizes: main.js -35%, preload.cjs -44%
- Commits: 1d864ad (Phase 1), 4069507 (Phase 2), f13f088 (Phase 3), 35430a3 (Phase 4)

### Slice 148: Electron Client Conversion — Task Breakdown Complete
- Task breakdown: `148-tasks.electron-client-conversion.md` — 20 tasks across 4 phases (215 lines)
- Phase 1: Main-process handlers (projectHandlers, contextHandlers, appStateHandlers) + unit tests + wiring (Tasks 1-8)
- Phase 2: Preload updates + renderer API module (Tasks 9-11)
- Phase 3: Consumer migration — only 2 files: `ContextBuilderApp.tsx` and `useContextGeneration.ts` (Tasks 12-16)
- Phase 4: Cleanup — delete 8 obsolete service files, 5 obsolete test files, old IPC handlers (Tasks 17-20)
- Test-with approach: unit tests immediately follow each handler implementation; hook test follows hook migration

### Slice 148: Electron Client Conversion — Design Complete
- Slice design: `148-slice.electron-client-conversion.md` — rewire Electron as thin client over `@context-forge/core`
- Replaces renderer's multi-layer storage stack (StorageClient → ElectronStorageService → PersistentProjectStore → ProjectManager) with domain-level IPC handlers delegating to `FileProjectStore`
- Eliminates `StatementManagerIPC`, `SystemPromptParserIPC`, renderer `ServiceFactory` — context generation moves entirely to main process via `createContextPipeline`
- New IPC channels: `project:list/get/create/update/delete`, `context:generate`, `app-state:get/update`
- 4-phase migration: (1) main-process handlers, (2) preload + renderer API, (3) consumer migration, (4) cleanup — each phase leaves app working
- Testing integrated per-phase: handler unit tests, IPC round-trip tests, behavioral parity verification, context output snapshot comparison

---

## 2026-02-20

### Maintenance: Migrate Tests to Centralized `tests/` Directories
- Moved all test files from colocated `__tests__/` dirs to centralized `tests/` at package level per updated CLAUDE.md guidelines
- core: 4 test files (54 tests) → `tests/` and `tests/storage/`, fixtures → `tests/fixtures/`
- mcp-server: 4 test files (31 tests) → `tests/`
- electron: 11 test files → `tests/unit/` and `tests/integration/`, updated to use `@/` alias imports
- Added `vitest.config.ts` for core and mcp-server; `tsconfig.test.json` for type-checking
- Updated electron `vitest.config.ts` (removed `src/` pattern) and `tsconfig.json` (added `tests` to include)
- All core and mcp-server tests pass; electron has pre-existing failures (already documented in maintenance-tasks)
- Commits: 93233e6

### Slice 147: MCP Server — State Update Tools — Implementation Complete
- Implementation complete: all 7 tasks done across 3 phases
- Created `packages/mcp-server/src/tools/stateTools.ts` with `registerStateTools(server)` — registers `context_summarize`
- `context_summarize`: persists session summary to `customData.recentEvents`, preserves other customData fields via spread merge, optionally updates `additionalNotes`
- Tests: 7 unit tests (InMemoryTransport + Client) + lifecycle test updated to assert 8 tools
- All 31 MCP tests pass; full workspace builds clean
- Commits: d1c58ff (task breakdown), f54e59f (implementation)

### Slice 147: MCP Server — State Update Tools — Task Breakdown Complete
- Task breakdown: `147-tasks.mcp-server-state-tools.md` — 7 tasks across 3 phases
- Phase 1: Create `stateTools.ts` with `context_summarize` tool; Phase 2: Unit tests; Phase 3: Integration wiring + lifecycle test update
- Simpler than Slice 146 (1 tool vs 4) — single commit checkpoint at Task 7

### Slice 147: MCP Server — State Update Tools — Design Complete
- Slice design: `147-slice.mcp-server-state-tools.md` — adds `context_summarize` tool
- `context_summarize`: persists session state summary to `customData.recentEvents`, preserves other customData fields
- New file `stateTools.ts` with `registerStateTools(server)` — reuses helpers from `contextTools.ts`
- Completes MCP server tool surface (8 tools total) per architecture spec

### Slice 146: MCP Server — Context Tools — Implementation Complete
- Implementation complete: 4 commits (7d618f4 → 47be7c0), all 15 tasks done across 4 phases
- Created `packages/mcp-server/src/tools/contextTools.ts` with `registerContextTools(server)` — registers 4 MCP tools
- `context_build`: generates complete context prompt via `createContextPipeline` → `generateContextFromProject`, supports parameter overrides (plain text output)
- `template_preview`: identical logic to `context_build` with `readOnlyHint: true` annotations
- `prompt_list`: enumerates templates via `SystemPromptParser.getAllPrompts()`, returns JSON with name/key/parameterCount
- `prompt_get`: retrieves specific template by name (case-insensitive) or key (exact), returns plain text with metadata header
- Shared `generateContext` helper loads project, applies overrides, appends additionalInstructions
- Tests: 16 unit tests (InMemoryTransport + Client) + lifecycle test updated to assert 7 tools
- All 24 MCP tests pass; full workspace builds clean
- Commits: 7d618f4, 3a64aa6, 0d02d83, 47be7c0

### Slice 146: MCP Server — Context Tools — Task Breakdown Complete
- Task breakdown: `146-tasks.mcp-server-context-tools.md` — 15 tasks across 4 phases (240 lines)
- Phase 1: Core API inspection + shared `generateContext` helper; Phase 2: `context_build` + `template_preview` + tests; Phase 3: `prompt_list` + `prompt_get` + tests; Phase 4: Integration wiring + lifecycle test update
- Key API path: `createContextPipeline(projectPath)` → `integrator.generateContextFromProject(project)` for context generation
- Templates are sections within a single prompt file (parsed by `#####` headers) — `SystemPromptParser.getAllPrompts()` enumerates them
- Commit checkpoints at Tasks 3, 7, 11, 15

### Slice 146: MCP Server — Context Tools — Design Complete
- Slice design: `146-slice.mcp-context-tools.md` — 4 tools wrapping core orchestration layer
- `context_build`: primary context generation with optional parameter overrides (plain text output)
- `template_preview`: read-only preview sharing `context_build` logic (different annotations for future-proofing)
- `prompt_list`: enumerate templates from project's prompt file (JSON output)
- `prompt_get`: retrieve specific template content by name/key (plain text output)

---

## 2026-02-19

### Slice 145: MCP Server — Project Tools — Implementation Complete
- Implementation complete: 4 commits (3166a02 → ec43baa), all 12 tasks done across 4 phases
- SDK: `@modelcontextprotocol/sdk` v1.26.0 (v2 `@modelcontextprotocol/server` not yet on npm); zod v4.1.5
- Created `packages/mcp-server/src/tools/projectTools.ts` with `registerProjectTools(server)` — registers 3 MCP tools
- `project_list`: returns summary fields (id, name, slice, template, instruction, isMonorepo, projectPath, updatedAt) with count
- `project_get`: returns full `ProjectData` by ID, or `isError` with helpful "use project_list" message
- `project_update`: validates at least one update field provided, checks existence, applies via `FileProjectStore.update()`, returns read-back
- `src/index.ts`: shebang, `McpServer` + `StdioServerTransport`, stderr-only logging, async main with error handling
- Tests: 7 unit tests (InMemoryTransport + Client for protocol-level verification) + 1 lifecycle test (child process spawn, JSON-RPC handshake, tools/list assertion)
- All 8 MCP tests pass; 54 core tests pass; full workspace builds clean
- Commits: 3166a02, 7b6b5f0, ca86917, ec43baa

### Slice 145: MCP Server — Project Tools — Task Breakdown Complete
- Task breakdown: `145-tasks.mcp-server-project-tools.md` — 12 tasks across 4 phases
- Phase 1: Deps + scaffold (install SDK, create index.ts); Phase 2: Tool implementations (list/get/update); Phase 3: Unit tests; Phase 4: Lifecycle test + verification
- Commit checkpoints at Tasks 3, 7, 9, 12

### Slice 145: MCP Server — Project Tools — Design Complete
- Slice design: `145-slice.mcp-server-project-tools.md` — first MCP feature slice, implements `project_list`, `project_get`, `project_update` wrapping `FileProjectStore` from core
- SDK: `@modelcontextprotocol/server` v2 with `zod/v4` for input schemas; v1 fallback documented
- Transport: stdio only; file structure: `src/index.ts` (server lifecycle) + `src/tools/projectTools.ts` (tool implementations)
- Tool annotations: read-only hints for list/get, idempotent+non-destructive for update
- Fresh `FileProjectStore` per call (avoids stale state vs Electron); error messages guide users to correct tools

### Slice 144: Storage Migration — Implementation Complete
- Implementation complete: 6 commits (549111f → 7c8597e), all 18 tasks done
- Created `packages/core/src/storage/` with 5 modules: `interfaces.ts`, `storagePaths.ts`, `backupService.ts`, `FileStorageService.ts`, `FileProjectStore.ts`
- `IProjectStore` interface for project CRUD; `IStorageService` for low-level atomic file operations
- `env-paths` resolves cross-platform storage (`~/Library/Preferences/context-forge/` on macOS); `CONTEXT_FORGE_DATA_DIR` override for testing
- Backup service extracted from Electron (already had no Electron deps); `FileStorageService` implements atomic write (temp+rename), backup on write, recovery from corruption
- `FileProjectStore` provides full CRUD with field migration, lazy init, and one-time legacy data migration from `~/Library/Application Support/context-forge/context-forge/`
- Electron `main.ts` IPC handlers delegate to core: 153 lines removed, 32 added; storage behavior preserved
- Fixed `ProjectPathService.test.ts` mock to use `importOriginal` (needed after expanded core/node exports)
- Exported from `@context-forge/core/node` (implementations) and `@context-forge/core` (type-only interfaces)
- Pipeline integration test validates: project CRUD, context generation from storage, backup recovery — all without Electron
- 54 core tests passing; 155/163 Electron tests (same 8 pre-existing failures)
- Commits: 549111f, ed402c8, 0241f65, 9f46826, fb012b8, 7c8597e

### Slice 144: Storage Migration — Task Breakdown Complete
- Task breakdown: `144-tasks.storage-migration.md` — 18 tasks across 6 phases
- Phase 1: Setup (env-paths, interfaces); Phase 2: Backup service extraction; Phase 3: FileStorageService; Phase 4: FileProjectStore; Phase 5: Electron integration; Phase 6: Pipeline integration test
- Test-with pattern: unit tests immediately follow each component (Tasks 5, 8, 11 after Tasks 4, 7, 10)
- Commit checkpoints at Tasks 3, 6, 9, 12, 15, 18

### Slice 144: Storage Migration — Design Complete
- Slice design: `144-slice.storage-migration.md` — replaces Electron-specific storage with filesystem-based layer in `packages/core/src/storage/`
- Key decisions: `IProjectStore` interface for CRUD, `FileStorageService` for atomic read/write/backup, `env-paths` for cross-platform storage path (`~/Library/Preferences/context-forge/` on macOS)
- Migration: automated copy of `projects.json` + `.backup` from legacy Electron location; versioned backups copied manually by PM
- Includes pipeline integration test design: validates full context generation (storage → pipeline → output) without Electron
- Scope: backup service extracted from Electron (already has no Electron deps), main.ts IPC handlers delegate to core; renderer-side storage classes stay until slice 149

## 2026-02-18

### Slice 143: Core Orchestration Extraction — Complete
- Implementation complete: 4 commits (aaa9f7a → 121841d), all 15 tasks done
- Extracted ContextGenerator, ContextTemplateEngine, ContextIntegrator + CoreServiceFactory to `packages/core/src/services/`
- Extended IPromptReader with `getContextInitializationPrompt()`; added IStatementService/IPromptService; added setFilePath() to SystemPromptParser and StatementManager
- Constructor injection pattern: ContextTemplateEngine takes IPromptService/IStatementService; ContextIntegrator takes ContextTemplateEngine
- `createContextPipeline(projectPath)` in CoreServiceFactory wires the full pipeline for MCP/CLI consumers
- Removed obsolete ContextGenerator interface from types (replaced by class); fixed IPCIntegration.test.ts dynamic imports
- Full workspace builds clean; 155/163 tests pass (same 8 pre-existing failures)

### Slice 143: Core Orchestration Extraction — Design Complete
- Slice design: `143-slice.core-orchestration-extraction.md` — extracts ContextTemplateEngine, ContextIntegrator, ContextGenerator, and CoreServiceFactory to `packages/core/src/services/`
- Key decisions: extend IPromptReader with `getContextInitializationPrompt()`; new `IStatementService`/`IPromptService` interfaces; constructor injection (no default ServiceFactory in core); `createContextPipeline()` convenience factory
- Scope: ~580 lines of orchestration code, 5 Electron consumer files to update, ServiceFactory stays in Electron for IPC wrapper creation
- Also marked slice 142 complete in 140-slices plan
- Commits: 67f600e

### Slice 142: Core Services Extraction — Complete
- Implementation complete: 4 commits (7c52150 → 0d26f0b), all 12 tasks done
- Extracted 5 services to `packages/core/src/services/`: TemplateProcessor, SystemPromptParser, StatementManager, SectionBuilder, ProjectPathService
- Added `services/constants.ts` (DEFAULT_STATEMENTS, file path constants) and `services/interfaces.ts` (IStatementReader, IPromptReader)
- Updated 8 Electron consumer files to import from `@context-forge/core`; deleted 5 original service files from Electron
- Required infrastructure fix: added `@types/node` + `types:["node"]` to core tsconfig (services use `fs`/`path`, lib was ES2023 only)
- Fixed `EnhancedContextData` import location (context.ts not sections.ts); removed unused `path` import from SystemPromptParser
- Fixed `ProjectPathService` broken `./types` import (file deleted in slice 141) — resolved to `../types/paths.js`
- Full workspace builds clean (`pnpm -r build`), 155/163 tests pass (same 8 pre-existing failures)

### Slice 142: Core Services Extraction — Design Complete
- Slice design: `142-slice.core-services-extraction.md` — extracts 5 services (TemplateProcessor, SystemPromptParser, StatementManager, SectionBuilder, ProjectPathService) to `packages/core/src/services/`
- Key decisions: keep Node.js `fs` as-is (core is a Node.js package, not browser), define minimal interfaces (`IStatementReader`, `IPromptReader`) for SectionBuilder's dependency injection
- Scope: relocation not redesign, ~1315 lines of service code, ~8 consumer files to update
- Found broken import in `ProjectPathService` (`./types` deleted in slice 141) — will fix during extraction
- Domain constants (`DEFAULT_STATEMENTS`, file path constants) exported from core

## 2026-02-17
### Slice 141: Core Types Extraction — Complete
- Implementation complete: 8 commits (a4537a7 → 8e7ba18), all 10 tasks done
- Created 6 type modules in `packages/core/src/types/` (context, sections, statements, prompts, project, paths)
- Updated 21 consumer files in Electron to import from `@context-forge/core`
- Deleted 11 original type files, removed 2 empty `types/` directories
- Found and fixed 3 additional inline `import()` type references in `StorageClient.ts`
- Full workspace builds clean, 155/163 tests pass (8 pre-existing failures unchanged)
- Zero stale imports remain — all types now sourced from `@context-forge/core`

### Slice 141: Core Types Extraction — Design & Tasks Created
- Slice design complete: `141-slice.core-types-extraction.md` — consolidates duplicated type hierarchies (main-process vs renderer-process) into `packages/core/src/types/`
- Key design decisions: renderer `ContextData` superset as canonical definition, `EnhancedContextData` deduplicated from 3 definitions to 1, enums preserved as-is, no re-export shims
- Task breakdown complete: `141-tasks.core-types-extraction.md` — 10 tasks covering 6 type modules, barrel exports, ~26 consumer import updates across ~20 files, deletion of 11 original type files
- `AppState`/`WindowBounds` intentionally kept in Electron (UI-specific, deferred to storage migration)
- Scope: types only, zero runtime behavior change, verified by compiler + existing test suite

### Slice 140: Monorepo Scaffolding — Complete
- 8 commits on main (d18e39d → 08e7d2c), foundation slice checked off in 140-slices
- Created pnpm workspace with 3 packages: `@context-forge/core`, `context-forge-mcp`, `@context-forge/electron`
- All packages build in topological order (core → mcp-server → electron), workspace symlinks working
- `.npmrc` with `public-hoist-pattern[]=electron` required — pnpm strict mode prevents electron-vite from resolving the electron binary; hoisting fixes this without affecting published packages
- `electron.vite.config.ts` needed two path fixes after move: vite-plugin-content import (`../../lib/vite/...`) and content alias (`../../content`)
- Root tsconfig.json converted to project-references; root package.json stripped to workspace orchestrator
- 157/163 tests pass (6 pre-existing failures logged to 999-tasks.maintenance-ongoing.md — stale IPC test mocks and prompt path expectations)
- Dependency isolation confirmed: core has zero runtime deps, mcp-server depends only on core — no electron/UI leakage to MCP consumers
- Pending: manual verification of Electron launch + core app functionality
- Next: Slice 2 (Core Types Extraction)

## 2026-02-07

- Reorganized slice 125 for macOS-only focus; deferred Linux (126) and Windows (127)
- Reduced packaging tasks from 64 to ~20 focused items across 5 phases
- Resolved unchecked tasks: deferred 101.10.4, checked 105 criteria, deferred 110 loading states
- Logged 6 test failures (all infrastructure/mocking, no code bugs) to 900-tasks.test-infrastructure-deferred.md
- Increased character limits: Project State, Additional Instructions, Monorepo Structure from 8K → 32K
- Established hybrid PR strategy: batch small changes into tasks, create PRs for feature-complete slices
- Ready to begin Phase 1: unsigned macOS DMG build

## 2025-01-16

- Resumed project after ~2 month hiatus
- Evaluated context-forge vs context-forge-pro state with AI assistance
- Decision: continue in Pro repo, Mac-only packaging initially
- Added DEVLOG.md for better project continuity

## 2025-11-18 (reconstructed from git)

- Last active development before hiatus
- Updated window title to 'Context Forge Pro'
- Initialized ai-project-guide submodule
- Established Pro/Free sync infrastructure

## 2025-11-17 (reconstructed from git)

- Completed maintenance slice (900-tasks.maintenance.md)
- Fixed undo/redo in textarea fields (Issue #21)
- Added development-phase field for context output
- Task file auto-population from slice names

---

*Entries below this line are reconstructed from git history and task files.*

## 2025-10 (summary)

- MVP feature completion
- Multi-project support finalized
- Context generation engine stable
- Monorepo mode settings added

## 2025-09 (summary)

- Initial maintenance infrastructure
- Application menu implementation
- Core slice completion (100-115)
