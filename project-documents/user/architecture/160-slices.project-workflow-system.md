---
docType: slice-plan
parent: user/architecture/160-arch.project-workflow-system.md
project: context-forge
dateCreated: 20260226
dateUpdated: 20260228
---

# Slice Plan: Project Workflow System

## Parent Document
`user/architecture/160-arch.project-workflow-system.md` — Adds methodology-aware workflow state, persistent configuration, artifact introspection, and navigation capabilities to Context Forge.

## Foundation Work

1. [x] **(161) Project Schema Standardization** — Normalize `ProjectData` field naming and add artifact reference fields. Renames: `projectDate` → `dateProject`, `slice`/`taskFile` → `fileSlice`/`fileTasks`. Adds optional fields: `fileHLD`, `fileArch`, `fileSlicePlan`, `fileSpec`. Implements schema migration so existing stored projects (JSON in `~/.config/context-forge/projects/`) are read correctly under the old schema and written in the new schema on any update. Updates MCP tool input schemas (`project_update`) and output schemas (`project_get`, `project_list`) to reflect new field names. Updates context assembly template engine to consume new artifact reference fields — when `fileArch` or `fileHLD` is populated, context_build can include those documents automatically.

   Schema migration must handle all projects managed by Context Forge, not just context-forge's own project entry. Context Forge is the central manager for multiple projects — any standardization it defines, it must be able to apply across all of them. This means migration runs against every stored project on first load (or via an explicit `project_migrate` MCP tool), and the MCP tools accept and return only the new field names going forward.

   **Value:** Clean data model that everything else builds on. Eliminates naming inconsistencies before new fields are added on top. Enables richer context assembly for architectural and design work. All managed projects benefit from the standardization, not just new ones.
   **Success Criteria:**
   - All `ProjectData` fields follow consistent naming conventions
   - Artifact reference fields exist and are settable via `project_update`
   - Existing stored projects for *all* managed projects load without error (migration works)
   - `context_build` includes referenced architecture/HLD documents when populated
   - All existing tests pass with updated field names
   - Migration is idempotent (running it twice produces the same result)
   **Dependencies:** None (builds on existing 140-band infrastructure, all complete)
   **Risk:** Medium — schema migration touches stored data for every managed project
   **Effort:** 3/5

   *Migrated from 140-slices.context-forge-restructure.md Future Work #1, re-scoped and expanded.*

2. [x] **(162) Config System** — Persistent two-tier TOML configuration. User-level config at `~/.config/context-forge/config.toml`, project-level config at `{projectPath}/.context-forge.toml`. New MCP tools: `config_set` (set value at user or project level), `config_get` (get resolved value with source indication), `config_list` (show all keys with values and resolution sources). Resolution precedence: MCP tool parameter → project config → user config → built-in default. Uses `smol-toml` (zero-dependency TOML parser). Initial config keys include `default_project`, `guide.auto_update`, `guide.git_strategy`, `guide.source`, plus placeholders for workflow settings added by later slices. New `packages/core/src/config/` module: `ConfigManager`, `ConfigKeys` (typed key definitions with defaults and validation).

   **Value:** Eliminates repetitive parameter passing across MCP tool calls. Enables preference persistence. Foundation for all subsequent configurable behavior including guide management (780-band) and workflow settings.
   **Success Criteria:**
   - `config_set`, `config_get`, `config_list` MCP tools work correctly
   - Two-tier resolution returns correct value with source indication
   - Config files are human-editable TOML with comments preserved
   - `default_project` config key is consumed by project tools (tools that accept `projectId` fall back to config when not provided)
   - Config keys are typed with defaults and validation
   **Dependencies:** [161 — Schema Standardization] (config keys reference standardized field names; `default_project` resolves against standardized project IDs)
   **Risk:** Low — well-understood pattern, already implemented in orchestration
   **Effort:** 2/5

   *Migrated from 780-slices.future.guide-management.md Slice 780, scoped to config plumbing only. Guide-specific features remain at 780.*

## Feature Slices

3. [x] **(163) Artifact Introspection Engine** — A core module that reads project methodology artifacts from disk and extracts structured information. Capabilities: slice plan parsing (extract slice entries with checkbox completion states, names, ordering), task file parsing (completion counts, individual task status), document detection (check existence of design files, architecture docs, task files for a given slice index), frontmatter extraction (read YAML frontmatter from methodology documents to get status, dependencies, dates). Exposed through internal API consumed by subsequent slices, and through enriched `project_get` responses that include computed fields (e.g., "7 of 12 slices complete", "current slice: 3 of 15 tasks done"). Requires a project's `projectPath` and artifact reference fields (from schema standardization) to locate files.

   **Value:** Makes methodology artifact state programmatically accessible. Enriches project queries with computed progress information without requiring manual status updates. Provides the "eyes" that the workflow navigator, consistency checker, and future work collector all depend on.
   **Success Criteria:**
   - Slice plan parsing correctly extracts slice names, checkbox states, and ordering from markdown
   - Task file parsing correctly counts completed vs. total tasks
   - Document detection reliably checks for existence of expected methodology files
   - Frontmatter extraction reads status, dependencies, and dates from YAML headers
   - `project_get` response includes computed introspection fields when artifact references are populated
   - Graceful degradation: missing or malformed files produce clear "not found" / "parse error" results, never crashes
   **Dependencies:** [161 — Schema Standardization] (artifact reference fields tell introspection where to look)
   **Interfaces:** Internal API consumed by slices 164, 165, 166
   **Risk:** Medium — markdown parsing heuristics must handle real-world variation in file formatting
   **Effort:** 3/5

4. [x] **(164) MCP Introspection Tools** — Expose the introspection engine (slice 163) through dedicated MCP tools so external consumers (e.g., context-visualizer) can access parsed methodology data over MCP without importing the Node.js package. Individual tools for granular access: slice plan parsing, task file parsing, frontmatter extraction, document detection. Plus a `project_structure` tool that returns the full aggregated project model (equivalent to parse.py's `build_model` output). Update `project_get` tool description to document the existing `introspection` summary field.

   **Value:** Makes Context Forge the canonical source of methodology introspection data for any MCP client — Python, browser, or otherwise. Eliminates the need for consumers to maintain their own parsers. Enables context-visualizer to consume live project state rather than static JSON.
   **Success Criteria:**
   - Each introspection parser is accessible as a named MCP tool with typed parameters and documented response schema
   - `project_structure` tool returns complete project model matching parse.py's output shape (foundation, initiatives, slices with tasks, future work, operational sections)
   - `project_get` tool description documents the `introspection` summary field
   - All tools handle missing/malformed files gracefully (error results, never crashes)
   - An MCP client (e.g., Claude Code) can call these tools and receive structured JSON
   **Dependencies:** [163 — Artifact Introspection Engine], [161 — Schema Standardization]
   **Interfaces:** MCP protocol — consumed by context-visualizer and any MCP-compatible tool
   **Risk:** Low — wrapping existing internals, main work is API design and response shaping
   **Effort:** 2/5

5. [x] **(165) Workflow Navigator & Discovery** — Core workflow navigation service with MCP tools and CLI commands for methodology position tracking, next-action recommendation, and artifact discovery.

   **Core service:** `WorkflowNavigator` in `packages/core/src/introspection/` with `getStatus()` and `getNext()` methods. Consumes `ArtifactIntrospector` (slice 163) and `ProjectModelBuilder` (slice 164) for structured introspection.

   **MCP tools:**
   - `workflow_status` — returns structured state: current methodology phase, slice plan completion summary, active slice status (needs design / needs tasks / in implementation / complete), and overall project progression.
   - `workflow_next` — returns a recommended next action with rationale. Implements the state machine: check current slice tasks → check slice plan for next unstarted slice → determine what that slice needs (design? tasks? implementation?) → check for undefined architecture components → report.

   **CLI discovery commands:**
   - `cf slice list` — parse the active `fileSlicePlan`, show slices with index, name, completion status, and file reference. Indicates the active slice and next candidate.
   - `cf task list` — parse the active `fileTasks` (or auto-resolved task file), show tasks with completion checkboxes and progress summary.
   - `cf arch list` — list all architectural initiatives in the project using `ProjectModelBuilder`. Shows initiative index range, architecture doc, slice plan, and completion summary. Project-wide view regardless of active slice.

   **Auto-set tasks on slice change:** When `cf set slice <value>` resolves to a slice file, automatically resolve and set `fileTasks` to the matching `{index}-tasks.*` file in `project-documents/user/tasks/`. Only triggers when a matching task file exists. Does not set slice when tasks are set (one-way).

   **Enhanced existing commands:**
   - `cf status` — when an active slice plan exists, includes slice plan progress summary inline.
   - `cf next` — wires to `WorkflowNavigator.getNext()` instead of the current provisional `ArtifactIntrospector` logic.

   Output is structured JSON (machine-consumable) with a human-readable `summary` field. Adds workflow-related config keys (e.g., `workflow.auto_advance` — whether completing a slice automatically advances to the next).

   **Value:** The capstone capability. Answers "where am I?" and "what should I do next?" for both humans resuming work after a break and agents that need to self-orient. Discovery commands (`cf slice list`, `cf task list`, `cf arch list`) eliminate the need to manually scan project-documents directories. Auto-set tasks removes a repetitive manual step. Directly addresses the cognitive load and stall problems described in the architecture document.
   **Success Criteria:**
   - `workflow_status` returns accurate methodology position for projects at various stages (no slices, partial completion, all complete)
   - `workflow_next` recommends correct next action across the full state machine (needs design → needs tasks → needs implementation → slice complete → next slice → plan complete → check architecture)
   - `cf slice list` shows all slices from active plan with status indicators and file references
   - `cf task list` shows tasks from active task file with completion counts
   - `cf arch list` shows all initiatives with index ranges, arch docs, slice plans, and completion
   - `cf set slice 165` auto-resolves and sets `fileTasks` to matching `165-tasks.*` file
   - Output is structured JSON with both machine-readable fields and human-readable summary
   - Handles edge cases: empty projects, projects with no slice plan, partially populated artifact references
   - Works correctly with `default_project` config (no project ID needed if default is set)
   **Dependencies:** [163 — Artifact Introspection Engine], [164 — MCP Introspection Tools] (for `ProjectModelBuilder` used by `cf arch list`)
   **Interfaces:** Consumed by ADP (120-arch in orchestration) when available; consumed by humans/agents via MCP and CLI
   **Risk:** Medium — state machine logic must handle the full range of methodology states without false recommendations
   **Effort:** 3/5

6. [x] **(166) Consistency Checker** — MCP tool (`workflow_check`) that compares related artifact states within a project and flags mismatches. Checks include: task file fully complete but slice not marked complete in plan, slice marked complete but task file has unchecked items, slice design exists but isn't listed in slice plan, frontmatter status doesn't match computed state. Returns a structured list of inconsistencies with severity (info/warning/error), location, and suggested fix. Optional `fix` parameter applies non-destructive corrections (update a checkbox, set a frontmatter status field). Config key `workflow.auto_fix` enables automatic correction on detection. Project-scoped; a `workflow_check_all` variant iterates across all managed projects.

   **Value:** Catches the drift between what happened and what got recorded. Reduces the "wait, is this actually done?" uncertainty that accumulates over a project's lifetime. Low effort to build since it's a thin consumer of introspection.
   **Success Criteria:**
   - Detects the core mismatch cases: task completion vs. slice status, slice status vs. plan checkbox, frontmatter vs. computed state
   - Returns structured results with severity, location, description, and suggested fix
   - `fix` mode correctly updates markdown checkboxes and YAML frontmatter status fields
   - Does not modify files unless explicitly requested (or auto_fix is enabled)
   - Handles missing artifacts gracefully (missing task file is a finding, not a crash)
   **Dependencies:** [163 — Artifact Introspection Engine]
   **Risk:** Low — detection is straightforward once introspection exists; write-back is the only novel part
   **Effort:** 2/5

7. [x] **(167) Future Work Collector** — MCP tool (`workflow_future`) that walks all slice plans in a project, extracts "Future Work" sections, and presents them as a consolidated view grouped by source architecture component. Each collected item includes: description, source file, source initiative index, and any dependencies or effort estimates mentioned in the original. Output is structured JSON and also available as a markdown summary suitable for inclusion in planning discussions. Project-scoped; a `workflow_future_all` variant iterates across all managed projects. Pulling items out of future work into real slices remains a manual decision — this tool surfaces what's there, it doesn't reorganize it.

   **Value:** Makes the strategic backlog visible. Future work items currently accumulate in individual slice plans and are only discovered by manually scanning files. This tool answers "what's on the backlog?" in one call, supporting both human planning sessions and potential automation that needs to assess remaining work.
   **Success Criteria:**
   - Correctly identifies and extracts "Future Work" sections from slice plan documents
   - Groups results by source architecture component / initiative
   - Preserves original descriptions, dependencies, and effort estimates
   - Returns both structured JSON and formatted markdown
   - Handles projects with zero future work gracefully (empty result, not error)
   **Dependencies:** [163 — Artifact Introspection Engine] (for document discovery and parsing)
   **Risk:** Low — primarily extraction and formatting
   **Effort:** 2/5

8. [x] **(168) CLI Foundation** — Adds a `packages/cli` package to the Context Forge monorepo that provides direct terminal access to context assembly, project management, workflow navigation, and configuration. The CLI wraps the same core functions consumed by the MCP server, giving developers a fast, pipeable, LLM-free interface to Context Forge capabilities.

After this slice, a developer can type `cf status` to see where a project stands, `cf build --phase task-breakdown` to generate a ready-to-use context prompt, and `cf config set default_project orchestration` to persist preferences — all without leaving the terminal or requiring an MCP client.  Additional commands and functions are documented in the slice design.

   **Value:** allows user (and AI, ideally) to easily create and verify contexts and prompts through CLI commands.  Currently the only way for the user to interact is through the MCP.  While this is extremely useful for communication between AIs, it is less natural and efficient for many human users used to terminal style programs.
   **Risk:**: Low - we are providing new access to existing commands.  
   **Effort**: 3/5

9. [x] **(169) Multi-Project & UX Polish** — Extend `packages/cli` with CWD-based project detection, name-based project resolution, output formatting improvements, and version bump to 0.2.0. Three-level resolution chain: `--project` flag → CWD match → `default_project` config. Resolution source tracking shown in `cf status`. Compact table formatting across commands.

   **Value:** Zero-friction multi-project use. Developers can `cd` into any registered project directory and `cf status` resolves automatically. Names replace opaque IDs in config and flags.
   **Success Criteria:**
   - `cd ~/repos/orchestration && cf status` resolves to orchestration with no flags
   - `cf config set default_project orchestration` works with names
   - `cf status` shows resolution source indicator (`from CWD`, `default`, `--project flag`)
   - `cf project list` shows compact format with default indicator
   - All existing 168 tests continue to pass
   **Dependencies:** [168 — CLI Foundation]
   **Risk:** Low — extends existing CLI utilities, no core API changes
   **Effort:** 2/5

10. [x] **(170) Project Model Cleanup & CLI Init** — Three related changes to simplify the project model and improve CLI onboarding:

   **a) Remove monorepo fields** — Remove `isMonorepo`, `isMonorepoEnabled` from `ProjectData` and `ContextData`. Remove `customData.monorepoNote`. Remove monorepo-conditional logic in ContextIntegrator, ContextTemplateEngine, SectionBuilder, SystemPromptParser. Remove from MCP tool schemas (project_update, project_list summary). Remove from CLI display and UPDATABLE_FIELDS. Remove from Electron IPC/preload. Update FileProjectStore migration to strip fields on read. Update all affected tests. These fields supported an earlier multi-project-documents monorepo structure (`project-artifacts/{type}/{project}`) that is no longer used.

   Specifically remove:
   - `buildMonorepoSection()` and its "Monorepo Note" section injection in ContextTemplateEngine
   - `monorepo-statement` from default-statements.md
   - Monorepo-conditional template display in `buildProjectInfoSection` (always show template if non-default instead)
   - `monorepo: {bool}` line from project info output
   - Monorepo-specific prompt selection in `SystemPromptParser.getContextInitializationPrompt()` (always use standard prompt; monorepo prompt variant in the guide file is unchanged here — guide updates happen in ai-project-guide repo)
   - Monorepo checkbox and any `isMonorepoEnabled` toggle from the Electron settings dialog UI

   *Note: A richer monorepo data model (e.g. `packages: [{name, path}]` for projects like context-forge with multiple packages) may be useful in the future. Tracked as GitHub issue #39 rather than a slice plan item to avoid premature design.*

   **b) `cf init` command** — Registers the current directory as a Context Forge project. Derives name from directory basename, accepts `--name` override. Creates project store entry with `name`, `projectPath`, and sensible defaults. Checks for existing registration (same path) and warns. Does not scaffold `project-documents/` directory (future slice).

   **c) Deprecate `default_project` config** — Emit a warning when `default_project` is the actual resolution source in `resolveProjectId`. CWD detection and `--project` flag are the preferred workflows. The config key remains functional but is discouraged.

   **d) MCP version tool** — Add a lightweight MCP tool (or extend server metadata) so clients can query the server version. Currently the version is passed to the McpServer constructor but not exposed to tool callers.

   **Value:** Removes dead complexity from the data model. `cf init` closes the onboarding gap for new projects. Deprecation warning nudges users toward the better CWD workflow. Version tool enables client compatibility checks.
   **Success Criteria:**
   - All monorepo fields removed from types, core logic, MCP schemas, CLI, Electron, and tests
   - Existing stored projects with `isMonorepo: true/false` load without error (migration strips field)
   - `cf init` in an unregistered directory creates a project entry; re-running warns
   - `cf status` from a directory registered via `cf init` resolves via CWD
   - Warning emitted when `default_project` is the resolution source
   - MCP clients can retrieve server version
   - All existing tests pass (updated for removed fields)
   **Dependencies:** [169 — Multi-Project & UX Polish]
   **Risk:** Medium — monorepo field removal touches all packages and many test files
   **Effort:** 3/5

11. [ ] **(171) Project Schema Visibility & Smart Field Setting** — Expose the project data model to users, ensure all fields are visible in CLI/MCP output, and make `cf project set` ergonomic with aliases, validation, and value resolution. Also adds `cf project rm`, fixes Electron project list refresh, and provides top-level `cf set`/`cf get` shortcuts with discoverable field help.

   **a) `cf project --schema`** — Display the full project schema: field names, types, required/optional, allowed values (e.g. `workType: 'start' | 'continue'`), and brief descriptions. Derived from a single source of truth (the `ProjectData` type and Zod schemas in MCP). Also available as `project_schema` MCP tool returning structured JSON.

   **b) Update `cf project get` display** — Show all populated fields, including the artifact reference fields (`fileArch`, `fileSlicePlan`, `fileHLD`, `fileSpec`) that are currently omitted from formatted output. Group fields logically: identity (name, id, path), workflow (phase, instruction, workType, slice, tasks), artifacts (fileArch, fileSlicePlan, fileHLD, fileSpec), metadata (template, date, timestamps).

   **c) Smart `cf project set`** — Ergonomic field setting with aliases, value resolution, and validation:
   - **Field aliases**: short names map to actual field names. `phase` → `developmentPhase`, `date` → `dateProject`, `arch` → `fileArch`, `slice` → `fileSlice`, `tasks` → `fileTasks`, `plan` → `fileSlicePlan`, `hld` → `fileHLD`, `spec` → `fileSpec`. Aliases are case-insensitive.
   - **Phase resolution**: `cf project set phase 4` → `Phase 4: Slice Design`. Accepts phase numbers (1-7), short names (`slice-design`, `implementation`, `task-breakdown`, etc.), or full phase strings. Case-insensitive.
   - **Instruction resolution**: similar short-name resolution for instruction values.
   - **Case-insensitive field names**: `cf project set developmentPhase X` and `cf project set developmentphase X` both work.
   - **Field grouping in schema display**: identity fields first (name, template), then artifacts in document-order (fileArch, fileSlicePlan, fileHLD, fileSpec, fileSlice, fileTasks), then workflow (phase, instruction, workType, date), then other (projectPath, customData).
   - **Validation**: known enum fields (`workType`, `instruction`, `developmentPhase`) reject invalid values with a helpful message listing allowed values.
   - Phase and instruction maps defined as a single source of truth in `packages/core` (or `packages/cli/src/utils/`) — same maps used by schema display, validation, and resolution.

   **d) `cf project rm`** — Remove a project from the store by name or ID. Accepts `--project <name|id>` or resolves via CWD. Requires confirmation (prints project name/path, asks for y/n) unless `--yes` flag is passed. Does not delete project files on disk — only removes the store entry. Complements `cf init` by providing the inverse operation.

   **e) Electron project list refresh** — Projects created via `cf init` (or any CLI/MCP mutation) do not appear in the Electron project list until the app is restarted. The Electron app loads projects once on startup and does not detect external changes to `projects.json`. Add a refresh mechanism — either a "Refresh" button in the project selector, or file-watch on `projects.json` with debounced reload, or both.

   **Value:** Discoverability — users and agents can inspect what fields exist without reading source code. Complete `project get` output means nothing is hidden. Smart setting eliminates friction: no need to remember exact field names or phase strings. Schema tool enables intelligent field-setting in `cf init` and agent workflows. Project removal closes the lifecycle gap (init → use → remove). Electron refresh ensures all clients see consistent project state.
   **Success Criteria:**
   - `cf project --schema` displays all fields with types and descriptions
   - `project_schema` MCP tool returns equivalent structured JSON
   - `cf project get` displays all populated fields including artifact references
   - Fields are grouped logically in formatted output
   - `cf project set phase 4` resolves to `Phase 4: Slice Design`
   - `cf project set phase implementation` resolves to `Phase 6: Implementation`
   - `cf project set date 2026-03-04` sets `dateProject`
   - Field names and aliases are case-insensitive
   - Invalid enum values produce helpful error with allowed values listed
   - Schema definition is single-source (no duplication between CLI and MCP)
   - `cf project rm` removes project from store with confirmation prompt
   - `cf project rm --yes` skips confirmation
   - Projects created via CLI appear in Electron without restart
   - `cf set phase 4` works as shortcut for `cf project set phase 4`
   - `cf get` works as shortcut for `cf project get`
   - `cf set --help` shows available fields and aliases
   - `cf get` shows all fields including unset ones (with placeholder)
   **Dependencies:** [170 — Project Model Cleanup] (schema changes must land first so we document the clean model)
   **Risk:** Low — display, aliases, and validation; no data model changes. Electron refresh is low-risk (file watch or manual button).
   **Effort:** 3/5

12. [x] **(172) Guide Management** — Bundled prompt file, guide install/update tools with CLI parity. Consolidates 780-slices items 781 and 782 (minus auto-update on startup).

   **a) Bundled prompt file** — Copy `prompt.ai-project.system.md` into `packages/core/assets/`. SystemPromptParser resolves with fallback chain: project-local `project-documents/ai-project-guide/` → bundled asset. After this, `npx @context-forge/mcp` generates useful context immediately with no bootstrap step.

   **b) MCP tools** —
   - `guide_install`: downloads ai-project-guide from GitHub (tarball by default), extracts to `{projectPath}/project-documents/ai-project-guide/`. Respects `guide.git_strategy` config (`submodule`, `clone`, `manual`). Respects `guide.source` config for fork support.
   - `guide_status`: reports installed state, location, install method, version/date, whether using bundled or local prompt file.
   - `guide_update`: downloads latest version from source, replaces existing installation. No-op with message if already current.

   **c) `cf guides` CLI command** — Full parity with MCP tools:
   - `cf guides` / `cf guides info` — installed state, version, install method, location
   - `cf guides install` — installs latest version
   - `cf guides update` — updates to latest if not current
   - `cf guides --version` — short version output

   **Not in scope:** Auto-update on startup (`guide.auto_update` config key remains defined but unused). Can be added later if there's demand. The `guide.auto_update` key is already in ConfigKeys — we leave it as-is rather than removing it.

   **Value:** Eliminates the #1 adoption barrier — needing to set up ai-project-guide before Context Forge does anything useful. Zero-config first run via bundled prompt. Progressive adoption: experience context assembly value first, opt into full methodology when ready. CLI parity ensures both human and agent workflows are supported.
   **Success Criteria:**
   - `cf build` works in a project with no ai-project-guide installed (uses bundled prompt)
   - `cf guides install` downloads and installs ai-project-guide into the project directory
   - `cf guides` shows installed state, version, and method
   - `cf guides update` updates to latest version; no-op if current
   - MCP tools `guide_install`, `guide_status`, `guide_update` provide equivalent functionality
   - `guide.git_strategy` config is respected (submodule vs clone vs manual/tarball)
   - `guide.source` config is respected for fork support
   - All existing tests pass
   **Dependencies:** [162 — Config System] (complete), [170 — Project Model Cleanup & CLI Init]
   **Risk:** Medium — download/extraction logic, git strategy branching, version detection
   **Effort:** 3/5

   *Supersedes 780-slices items 781 and 782. The 780-slices.future document should be updated to reference this slice.*

13. [x] **(173) Smart Field Setting — customData fields, index-based file resolution, no-args usage hints** — Extends the schema-driven `cf set` with three capabilities:

   **a) customData sub-fields settable via CLI** — `cf set events "..."`, `cf set notes "..."`, `cf set tools "..."`. These map to `customData.recentEvents`, `customData.additionalNotes`, `customData.availableTools`. The schema module gains a new field group `custom` with these three fields. `projectSetAction` handles the nested write (`store.update(id, { customData: { ...existing.customData, [subField]: value } })`). `cf get` already displays customData — it continues to work as-is.

   **b) Index-based file resolution** — `cf set slice 171` resolves to the matching `171-slice.*.md` file in `project-documents/user/slices/`. Same for `cf set tasks 171`, `cf set arch 160`, `cf set plan 160`. Scans the project's document directories for files matching `{index}-{doctype}.*.md`. If exactly one match, uses it. If zero matches, error with hint. If multiple matches (unlikely), error listing options. Only triggers when the value looks like a bare number (regex `/^\d+$/`).

   **c) No-args usage hint** — `cf set` with no arguments shows a one-liner usage hint instead of Commander's error. `cf set --help` shows the full help with settable fields list. Already implemented.

   **Value:** Users can set all project fields from CLI without switching to Electron. Index-based resolution eliminates typing long filenames — `cf set slice 171` instead of `cf set slice 171-slice.project-schema`.
   **Success Criteria:**
   - `cf set events "state summary here"` updates `customData.recentEvents`
   - `cf set notes "on phase complete..."` updates `customData.additionalNotes`
   - `cf set tools "electron, mcp"` updates `customData.availableTools`
   - `cf set slice 171` resolves to `171-slice.project-schema` (or whatever the match is)
   - `cf set arch 160` resolves to `160-arch.project-workflow-system`
   - Index resolution only triggers for bare numeric values
   - `cf set` (no args) shows usage hint, `cf set --help` shows full help
   - All customData fields appear in `cf get` and `cf set --help`
   **Dependencies:** [171 — Project Schema] (complete, provides schema module and set/get infrastructure)
   **Risk:** Low — extends existing schema pattern, file scanning is straightforward
   **Effort:** 2/5

14. [x] **(174) Claude Code Commands — cf Wrappers** — Markdown command files for ~/.claude/commands/ that expose Context Forge CLI capabilities as Claude Code slash commands. Commands: /cf:status, /cf:build, /cf:next, /cf:prompt. Commands shell out to the globally-installed `cf` CLI using ! prefix execution, passing $ARGUMENTS or positional $1/$2 parameters. `cf` is already CWD-aware, so commands work correctly in any project directory. YAML frontmatter with description fields for Claude Code auto-discovery. Includes an install mechanism: `cf install-commands [--target ~/.claude/commands/]` that copies command markdown files from the package's bundled commands/ directory into place. Uninstall via `cf uninstall-commands`. Command files maintained in the context-forge repo under packages/cli/commands/ as the source of truth.

   **Value:** Claude Code users get slash-command access to Context Forge without remembering CLI syntax. Auto-discovery means Claude can suggest commands contextually.
   **Success Criteria:**
   - /cf:status, /cf:build, /cf:next, /cf:prompt all work from Claude Code via slash command
   - `cf install-commands` copies command files to ~/.claude/commands/
   - `cf uninstall-commands` removes them cleanly
   - YAML frontmatter enables Claude Code auto-discovery
   - Commands work correctly regardless of CWD
   **Dependencies:** [168 — CLI Foundation] (complete)
   **Risk:** Low — command files are markdown, no compilation or complex logic
   **Effort:** 1/5



15. [x] **(175) Context Output Consolidation & Template Variable Completion** — Streamline the generated context prompt by eliminating redundancy across the three introductory sections (project-info block, context-init prompt, resource-structure section), using canonical schema field names throughout, and ensuring all project fields — including `fileArch` and `fileSlicePlan` — are available as template variables in prompt rendering.

   Currently the context output repeats project/slice/task information three times with inconsistent field names (`currentDate` vs `dateProject`, `slice` vs `fileSlice`, `taskFile` vs `fileTasks`). The `template` field is included despite being rarely meaningful (e.g., "templates/react" for a Python project). The `fileArch` and `fileSlicePlan` fields exist in `ProjectData` and the schema but are absent from both `ContextData`/`EnhancedContextData` and the template variable map — so system prompts that reference `{fileArch}` or `{fileSlicePlan}` get no substitution. The start/continue distinction in the opening statement adds no value.

   This slice consolidates the three sections into a single clean project context block in core, adds the missing artifact fields to `ContextData`/`EnhancedContextData` and the `TemplateProcessor` variable map, and specifies (but does not implement) required changes to the system prompt file maintained in the ai-project-guide repository.

   **Value:** Cleaner, non-redundant context output that includes all relevant project artifacts. System prompts can reference `{fileArch}`, `{fileSlicePlan}`, `{fileHLD}`, `{fileSpec}` and get correct substitution. Reduces token waste from repeated information. Simpler opening statement.
   **Success Criteria:**
   - Generated context contains project information exactly once (no triple repetition)
   - All `ProjectData` artifact fields (`fileArch`, `fileSlicePlan`, `fileHLD`, `fileSpec`) available as template variables
   - System prompts using `{fileArch}`, `{fileSlicePlan}` etc. get correct substitution
   - `template` field omitted from context output (or included only when explicitly non-default and meaningful)
   - Opening statement simplified: no start/continue distinction
   - Schema field names used consistently (not aliases like `currentDate`, `taskFile`)
   - Changes to system prompt file documented as a spec for the ai-project-guide maintainer (not implemented in this slice)
   - All existing tests pass (updated as needed)
   **Dependencies:** [161 — Schema Standardization] (complete), [171 — Project Schema] (complete)
   **Risk:** Medium — touches the primary output pipeline; prompt file changes require coordination with ai-project-guide
   **Effort:** 2/5

## Integration Work

8. [ ] **(168) Integration Testing and Documentation** — MCP-level integration tests that exercise the new tools end-to-end via protocol, covering cross-slice interactions that unit tests within individual slices cannot reach. Fixture projects representing realistic multi-state scenarios: a project mid-way through a slice plan, a project with inconsistencies across artifact layers, a project with no methodology artifacts at all. Update `context-forge-mcp` README with new tool documentation. Update root monorepo README. If npm packages are published, version bump for new capabilities.

   *Note: Unit tests for each module (ConfigManager, ArtifactIntrospector, WorkflowNavigator, ConsistencyChecker, FutureWorkCollector) are created during their respective slices, not deferred to this slice. This slice covers integration-level and end-to-end testing only.*

   **Value:** Confidence that the workflow system behaves correctly as an integrated whole, and that the MCP protocol layer correctly exposes all new capabilities. Documentation enables adoption.
   **Success Criteria:**
   - MCP integration tests exercise each new tool via protocol (not just internal API)
   - Cross-slice scenarios tested: workflow_status reflects introspection results, consistency checker findings align with workflow_next recommendations, config defaults flow through to all tools
   - Fixture projects cover realistic edge cases that span multiple slices
   - README documents all new MCP tools with usage examples
   - All tests pass in CI
   **Dependencies:** [164, 165, 166 — all feature slices complete]
   **Effort:** 2/5

## Implementation Order

```
Foundation (sequential):
  161. Project Schema Standardization
    ↓
  162. Config System

Feature (163 first, then 164-166 can parallelize):
  163. Artifact Introspection Engine
    ↓
  165. Workflow Navigator  ─┐
  166. Consistency Checker  ├─ parallel after 163
  167. Future Work Collector┘

Integration (after all features):
  168. Testing and Documentation
```

## Notes

- **Migrated work.** Slices 161 and 162 are migrated from existing future work plans (140-slices Future Work #1 and 780-slices Slice 780 respectively). Their original locations should be updated to reference this slice plan. Guide management features (781, 782) remain at 780 with a dependency on slice 162.
- **Test-with, not test-after.** Each slice (161-166) creates unit tests alongside its implementation — the "test-with" pattern. Slice 167 exists only for integration/e2e tests that span multiple slices and for documentation. No unit test creation should be deferred to 167.
- **Cross-project responsibility.** Context Forge manages multiple projects. Schema standardization (161), consistency checking (165), and future work collection (166) all operate across all managed projects, not just context-forge itself. The migration, checking, and collection logic must be project-agnostic — it works on any project Context Forge knows about.
- **Introspection parsing depth.** Slice 163 should start with the cheapest reliable parsing: checkbox regex for slice plans, YAML frontmatter parsing, file existence checks. If more sophisticated markdown parsing is needed (e.g., understanding nested list structure in future work sections), it can be added incrementally. Avoid pulling in a full markdown AST library unless clearly justified.
- **Parallel execution of 164-166.** These three slices are independent consumers of the introspection API. They can be worked in any order or in parallel. The listed order (navigator → checker → collector) reflects value priority, not dependency.
- **ADP compatibility.** The workflow navigator (164) is designed to be consumable by the Automated Development Pipeline (120-arch, orchestration project). The structured JSON output and state machine model should align with ADP's pipeline executor expectations. However, ADP integration is not in scope for this initiative — it's a consumer, not a dependency.

## Future Work

- [ ] (169) Consistency Checker: All-Slices Mode (priority) — The current checker only inspects the active slice, which requires manually switching slices to scan the project. This must iterate across all slices in the plan so `cf check` and `workflow_check` report the full picture without requiring slice switching. Also includes: slice plan frontmatter status vs. all-entries-complete, architecture file status vs. all-plans-complete. Depends on 166.
