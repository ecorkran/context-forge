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

5. [ ] **(165) Workflow Navigator** — MCP tools that compute methodology position and recommend next actions. `workflow_status` returns structured state: current methodology phase, slice plan completion summary, active slice status (needs design / needs tasks / in implementation / complete), and overall project progression. `workflow_next` returns a recommended next action with rationale — implements the state machine: check current slice tasks → check slice plan for next unstarted slice → determine what that slice needs (design? tasks? implementation?) → check for undefined architecture components → report. Output is structured JSON (machine-consumable) with a human-readable `summary` field. Adds workflow-related config keys (e.g., `workflow.auto_advance` — whether completing a slice automatically advances to the next).

   **Value:** The capstone capability. Answers "where am I?" and "what should I do next?" for both humans resuming work after a break and agents that need to self-orient. Directly addresses the cognitive load and stall problems described in the architecture document.
   **Success Criteria:**
   - `workflow_status` returns accurate methodology position for projects at various stages (no slices, partial completion, all complete)
   - `workflow_next` recommends correct next action across the full state machine (needs design → needs tasks → needs implementation → slice complete → next slice → plan complete → check architecture)
   - Output is structured JSON with both machine-readable fields and human-readable summary
   - Handles edge cases: empty projects, projects with no slice plan, partially populated artifact references
   - Works correctly with `default_project` config (no project ID needed if default is set)
   **Dependencies:** [163 — Artifact Introspection Engine]
   **Interfaces:** Consumed by ADP (120-arch in orchestration) when available; consumed by humans/agents via MCP
   **Risk:** Medium — state machine logic must handle the full range of methodology states without false recommendations
   **Effort:** 3/5

6. [ ] **(166) Consistency Checker** — MCP tool (`workflow_check`) that compares related artifact states within a project and flags mismatches. Checks include: task file fully complete but slice not marked complete in plan, slice marked complete but task file has unchecked items, slice design exists but isn't listed in slice plan, frontmatter status doesn't match computed state. Returns a structured list of inconsistencies with severity (info/warning/error), location, and suggested fix. Optional `fix` parameter applies non-destructive corrections (update a checkbox, set a frontmatter status field). Config key `workflow.auto_fix` enables automatic correction on detection. Project-scoped; a `workflow_check_all` variant iterates across all managed projects.

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

7. [ ] **(167) Future Work Collector** — MCP tool (`workflow_future`) that walks all slice plans in a project, extracts "Future Work" sections, and presents them as a consolidated view grouped by source architecture component. Each collected item includes: description, source file, source initiative index, and any dependencies or effort estimates mentioned in the original. Output is structured JSON and also available as a markdown summary suitable for inclusion in planning discussions. Project-scoped; a `workflow_future_all` variant iterates across all managed projects. Pulling items out of future work into real slices remains a manual decision — this tool surfaces what's there, it doesn't reorganize it.

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
