---
docType: slice-plan
parent: user/architecture/180-arch.initiative-context-worktree.md
project: context-forge
dateCreated: 20260309
dateUpdated: 20260309
status: in_progress
---

# Slice Plan: Initiative Contexts (Worktrees)

## Parent Document
`user/architecture/180-arch.initiative-context-worktree.md` — Per-initiative workflow state supporting parallel development via git worktrees. Introduces `WorktreeContext` as a child of `ProjectData`, worktree-aware CWD resolution, CLI worktree management commands, and worktree-scoped workflow operations.

## Naming Convention
This plan uses **worktree** as the user-facing term for the per-initiative workflow binding. The internal type is `WorktreeContext`. CLI commands use `cf worktree ...`, MCP tools use `worktree_...`, and CLI flags use `--worktree`. This avoids overloading "context" (already used for Context Forge and context assembly) and "initiative" (already used for architectural initiatives). The underlying concept remains the same as described in the architecture document's `InitiativeContext`.

## Foundation Work

1. [x] **(181) WorktreeContext Data Model & Storage** — Define the `WorktreeContext` type, implement storage as nested objects within `ProjectData.worktrees[]`, and provide CRUD operations via a `WorktreeService`. Includes the one-time migration that moves workflow fields (`developmentPhase`, `fileSlice`, `fileTasks`, `instruction`, `workType`, `fileArch`, `fileSlicePlan`) from `ProjectData` to an explicit `WorktreeContext` when the first worktree context is created, and the reverse migration when the last one is removed. Uses existing `fileConcept` field for project-level phase 1 reference.

   **Storage decision: nested objects.** Worktree contexts are stored as `worktrees: WorktreeContext[]` within the existing `ProjectData` JSON. Rationale: the `FileProjectStore` already performs read-modify-write on the full project; separate files would add filesystem coordination complexity with no practical benefit at the expected scale (1-10 worktree contexts per project). A `WorktreeService` (in `packages/core/src/services/`) encapsulates CRUD and migration logic, keeping `FileProjectStore` as a pure serialization layer.

   **WorktreeContext type:**
   ```
   WorktreeContext {
     id: string,                    // auto-generated: wt_{timestamp}_{random}
     name: string,                  // human label: "API Foundation"
     indexRange: [number, number],  // [100, 199] — the index band
     worktreePath?: string,         // absolute filesystem path
     archDoc?: string,              // initiative architecture document reference
     slicePlan?: string,            // initiative slice plan reference

     // workflow position (moved from ProjectData)
     developmentPhase?: string,
     activeSlice?: string,          // maps to fileSlice
     activeTaskFile?: string,       // maps to fileTasks
     instruction?: string,
     workType?: string,
   }
   ```

   **Migration behavior:**
   - On first `addWorktree`: if project has workflow fields set, create an additional "default" worktree context holding those values, then clear them from `ProjectData`. The user's explicitly-created worktree context is added separately. This preserves existing workflow state.
   - On last `removeWorktree`: move the remaining worktree context's workflow fields back to `ProjectData`, remove the empty `worktrees` array.
   - Migration is atomic within a single `store.update()` call — no partial state.

   **Backwards compatibility:** A project with `worktrees: []` or `worktrees: undefined` continues to use workflow fields directly on `ProjectData`. All existing code paths that read `project.developmentPhase`, `project.fileSlice`, etc. continue to work for projects without worktree contexts. No existing behavior changes.

   **Value:** The data foundation everything else depends on. Clean type separation between project identity and per-worktree workflow state.
   **Success Criteria:**
   - `WorktreeContext` type defined in `packages/core/src/types/`
   - `ProjectData` extended with optional `worktrees: WorktreeContext[]`
   - `FileProjectStore` exposes worktree CRUD methods
   - Migration correctly moves workflow fields to worktree context on first creation
   - Reverse migration correctly moves fields back on last removal
   - Projects without worktree contexts behave identically to today
   - Index range overlap detection warns but does not block
   - All existing tests pass unchanged (no worktree contexts = no behavior change)
   - Unit tests cover: worktree CRUD, forward migration, reverse migration, overlap detection
   **Dependencies:** None (builds on existing 160-band infrastructure, all complete)
   **Risk:** Medium — migration logic must handle edge cases (empty fields, partially-set workflow state, projects with no workflow fields set)
   **Effort:** 3/5

## Feature Slices

2. [x] **(182) Worktree Discovery & CWD Resolution** — Extend CWD-based project resolution to be worktree-aware using a two-phase lookup. Implements `git worktree list --porcelain` parsing for worktree discovery. Extends `findProjectByCwd` (from slice 169) to match against both `projectPath` and all `worktrees[].worktreePath` values. When CWD matches a worktree path, resolution returns both the project and the specific worktree context.

   **Resolution chain (extended):**
   ```
   --project flag → CWD match → default_project config → error
                       ↓
                if matched via worktreePath → project + worktree resolved
                if matched via projectPath  → project resolved (no worktree)
   ```

   **`resolveProjectId` becomes `resolveProjectWorktree`:**
   Returns `ResolvedProject` extended with optional `worktreeId` and updated `ResolutionSource` type to include `'worktree'`. The existing `resolveProjectId` remains as a wrapper for backwards compatibility — callers that don't need worktree information continue to work unchanged. New callers use `resolveProjectWorktree` to get both project and worktree context in one call.

   **Worktree discovery (`GitWorktreeService`):**
   - New service in `packages/core/src/git/` (or `packages/cli/src/utils/`)
   - `listWorktrees(projectPath: string): Promise<WorktreeInfo[]>` — parses `git worktree list --porcelain` output
   - `WorktreeInfo { path: string, head: string, branch?: string, bare: boolean }`
   - Used by `cf worktree init` (validate that CWD is a known git worktree), `cf status` (display), and validation (stale path detection)
   - Read-only — never creates, moves, or removes worktrees

   **`--worktree` flag:**
   An explicit `--worktree <name|id>` CLI flag overrides worktree resolution from any directory. Added to the shared options pattern so all worktree-aware commands inherit it. The flag is optional — CWD resolution is the default.

   **Value:** The UX payoff of the entire initiative. Running `cf status` from a worktree directory automatically resolves to the correct project and worktree context with no flags required.
   **Success Criteria:**
   - `git worktree list --porcelain` output is correctly parsed into `WorktreeInfo[]`
   - `findProjectByCwd` matches worktree paths in addition to project paths
   - Longest-path match wins when worktree paths overlap (e.g., nested worktrees)
   - `resolveProjectWorktree` returns both `projectId` and `worktreeId` when matched via worktree
   - `resolveProjectWorktree` returns `projectId` only when matched via project path
   - `--worktree` flag overrides CWD-based worktree resolution
   - Existing `resolveProjectId` callers continue to work unchanged
   - Unit tests cover: worktree parsing, path matching, two-phase resolution, flag override
   **Dependencies:** [181 — Data Model & Storage]
   **Interfaces:** `resolveProjectWorktree()` consumed by all worktree-aware CLI commands (183-185)
   **Risk:** Medium — git CLI output parsing must handle edge cases (bare repos, detached HEAD, pruned worktrees)
   **Effort:** 3/5

3. [x] **(183) Worktree CLI Commands** — The `cf worktree` command group for managing worktree contexts, plus worktree-aware `cf set` behavior. **Note:** Also includes the `--worktree <name|id>` shared CLI flag for explicit worktree override (deferred from slice 182 to keep resolution and CLI concerns separate).

   **`cf worktree init`** — Creates a new worktree context for the current project.
   - From a worktree directory: `cf worktree init --name "API Foundation" --range 100-199` (worktree path derived from CWD, project resolved via git worktree list)
   - From anywhere: `cf worktree init --name "API Foundation" --range 100-199 --path ~/repos/project-api --project myproject`
   - Validates: CWD or `--path` is a known git worktree of the project, range format is valid (two integers, start < end), range doesn't overlap existing worktree contexts (warn, not block)
   - Auto-discovers `archDoc` and `slicePlan` from the index range base (e.g., range 100-199 → looks for `100-arch.*` and `100-slices.*` in project documents)
   - Triggers forward migration if this is the project's first worktree context

   **`cf worktree list`** — Lists all worktree contexts for the resolved project.
   - Shows: name, index range, worktree path, current branch (via `git rev-parse`), phase, active slice
   - Indicates which worktree context is currently resolved (if running from a worktree)
   - Table format consistent with `cf project list` and `cf slice list`

   **`cf worktree rm`** — Removes a worktree context by name or ID.
   - Requires confirmation (prints worktree context details, asks y/N) unless `--yes` flag
   - Triggers reverse migration if this is the last worktree context
   - Does not delete the git worktree or any files — only removes the cf worktree context association

   **Worktree-aware `cf set`:**
   - When `resolveProjectWorktree` returns a worktree context, `projectSetAction` updates workflow fields on the worktree context, not the project
   - Workflow fields: `developmentPhase`, `fileSlice`/`activeSlice`, `fileTasks`/`activeTaskFile`, `instruction`, `workType`, `fileArch`/`archDoc`, `fileSlicePlan`/`slicePlan`
   - Project-level fields (name, template, customData, etc.) always update on the project regardless of worktree context
   - Auto-set logic (arch→plan, slice→tasks, phase→instruction) works identically but targets the worktree context
   - `cf set --project-level` flag forces updates to the project even when a worktree context is resolved (escape hatch)

   **Worktree-aware `cf get`:**
   - When a worktree context is resolved, displays worktree context workflow fields instead of project-level fields
   - Shows worktree context name and resolution source
   - `cf get --project-level` shows project-level fields regardless

   **Value:** Complete management interface for worktree contexts. Users can create, inspect, and remove them, and all existing `cf set`/`cf get` workflows become worktree-aware automatically.
   **Success Criteria:**
   - `cf worktree init` creates a worktree context with correct worktree association and index range
   - Auto-discovery of archDoc/slicePlan from index range works
   - Index range overlap produces warning but proceeds
   - Forward migration triggers on first worktree context creation
   - `cf worktree list` shows all worktree contexts with current branch and active slice
   - `cf worktree rm` removes worktree context with confirmation, triggers reverse migration on last removal
   - `cf set slice 103` from a worktree updates the worktree context's activeSlice, not the project's fileSlice
   - `cf set name "newname"` from a worktree updates the project (project-level field)
   - `cf set --project-level phase 3` forces project-level update even from a worktree
   - All existing `cf set` behavior unchanged for projects without worktree contexts
   **Dependencies:** [181 — Data Model & Storage], [182 — CWD Resolution]
   **Risk:** Medium — field routing (worktree context vs. project) must be correct for every field; migration trigger points must be tested thoroughly
   **Effort:** 3/5

4. [x] **(184) Status & Display Updates** — Update `cf status`, `cf project list`, and related display commands to show worktree context information.

   **`cf status` from a worktree:**
   ```
   Project:    orchestration
   Worktree:   API Foundation [100-199]  (from worktree)
   Branch:     feature/100-api
   Phase:      implementation
   Slice:      103-cli-foundation  (in progress, 8/12 tasks)
   Next:       104-sdk-client-warm-pool
   ```
   Shows the resolved worktree context's workflow state, current git branch (via `git -C <path> rev-parse --abbrev-ref HEAD`), and task progress from the introspection engine.

   **`cf status` from the main worktree (project root):**
   ```
   Project:    orchestration
   Phase 1:    complete

   Active worktrees:
     [100-199]  API Foundation    → 103-cli-foundation (implementation)
     [200-299]  UX Layer          → 203-component-lib (slice-design)
     [300-399]  Data Pipeline     → 301-schema-design (task-breakdown)
   ```
   Shows project-level info plus a dashboard of all worktree contexts with their current position. No worktree context is "active" — this is the overview position.

   **`cf status --worktree <index|name>`:**
   Shows detailed status for a specific worktree context from any directory.

   **`cf project list --worktrees`:**
   Extended table showing worktree associations:
   ```
   Project        Worktree          Range     Branch           Worktree Path                    Phase
   orchestration  (root)            —         main             ~/repos/orchestration/            —
                  API Foundation    100-199   feature/100-api  ~/repos/orchestration-api/        implementation
   ```

   **JSON output:** All display updates include `--json` support. JSON output includes the full worktree context object when resolved.

   **WorkflowNavigator integration:** `getStatus()` and `getNext()` accept an optional worktree context parameter. When provided, they use the worktree context's archDoc/slicePlan/activeSlice instead of project-level equivalents. The navigator doesn't need to know about worktrees — it just receives the right artifact references.

   **Value:** The visible payoff of all the plumbing work. Users see per-worktree status automatically, and the project dashboard gives a bird's-eye view across all active worktree contexts.
   **Success Criteria:**
   - `cf status` from a worktree shows worktree context name, range, branch, and worktree-scoped workflow state
   - `cf status` from project root shows worktree dashboard with all worktree contexts
   - `cf status --worktree 100` shows detailed worktree context status from any directory
   - `cf project list --worktrees` shows worktree associations
   - Branch display is live (read at display time via git, not stored)
   - `--json` output includes full worktree context object
   - WorkflowNavigator correctly uses worktree context's artifact references
   - Display gracefully handles: worktree contexts with no worktree path, worktree contexts with stale worktree path, projects with zero worktree contexts
   **Dependencies:** [182 — CWD Resolution], [183 — Worktree CLI Commands]
   **Interfaces:** Consumes `WorkflowNavigator` (slice 165), `ArtifactIntrospector` (slice 163)
   **Risk:** Low — primarily display logic; WorkflowNavigator integration is a natural extension
   **Effort:** 2/5

5. [ ] **(185) Worktree-Aware Context Assembly** — Update `cf build` and `context_build` MCP tool to source artifact references from the resolved worktree context when building from a worktree.

   **Current behavior:** `cf build` creates a working copy of `ProjectData` and passes it to `integrator.generateContextFromProject()`. The integrator reads `fileArch`, `fileSlicePlan`, `fileSlice`, `fileTasks` from the project.

   **New behavior:** When a worktree context is resolved (via CWD worktree match or `--worktree` flag), the build command creates a working copy where worktree-level fields override project-level fields:
   - `archDoc` → `fileArch`
   - `slicePlan` → `fileSlicePlan`
   - `activeSlice` → `fileSlice`
   - `activeTaskFile` → `fileTasks`
   - `developmentPhase`, `instruction`, `workType` from worktree context

   The core pipeline (`ContextIntegrator`, `ContextTemplateEngine`, `SectionBuilder`) does not change — it still receives a `ProjectData`-shaped object. The worktree context overlay happens in the CLI command and MCP tool handler before the pipeline is invoked. This keeps the change surface small and avoids deep refactoring of the assembly pipeline.

   **Context profile integration:** The context profiles system (slice 176) determines which artifact variables are populated based on the active instruction type. This continues to work — the instruction type now comes from the worktree context, and the profile filtering applies to the worktree-sourced artifact references.

   **CLI overrides still win:** `cf build --slice 105 --phase implementation` overrides the worktree context values, matching existing behavior where CLI flags override stored values.

   **Value:** The assembled context prompt reflects the initiative being worked on, not the last-set project values. An agent in a worktree gets architecture docs, slice plans, and tasks relevant to that worktree's initiative.
   **Success Criteria:**
   - `cf build` from a worktree uses the worktree context's archDoc, slicePlan, activeSlice, activeTaskFile
   - `cf build` from the project root uses project-level fields (existing behavior)
   - `cf build --worktree "API Foundation"` from any directory uses the specified worktree context's fields
   - CLI `--slice`, `--phase`, `--instruction` flags override worktree context values
   - Context profile filtering works with worktree-sourced instruction type
   - `context_build` MCP tool gains optional `worktree` parameter for explicit worktree context selection
   - Projects without worktree contexts behave identically to today
   - Generated context includes worktree identification (name, range) when building from a worktree context
   **Dependencies:** [183 — Worktree CLI Commands], [182 — CWD Resolution]
   **Interfaces:** Extends `context_build` MCP tool input schema
   **Risk:** Low — overlay pattern is simple; no changes to the core assembly pipeline
   **Effort:** 2/5

6. [ ] **(186) MCP Worktree Tools** — Expose worktree context management and worktree information via MCP tools. Enables the context-visualizer to display per-worktree state and associations.

   **New MCP tools:**
   - `worktree_init` — Create a worktree context. Parameters: `projectId`, `name`, `indexRange` (e.g., "100-199"), `worktreePath?`. Returns the created worktree context. Triggers forward migration on first creation.
   - `worktree_list` — List all worktree contexts for a project. Parameters: `projectId`. Returns worktree contexts with current branch info (via git rev-parse).
   - `worktree_get` — Get a specific worktree context by ID or name. Parameters: `projectId`, `worktreeId` or `worktreeName`. Returns full worktree context object with computed fields (branch, task progress).
   - `worktree_update` — Update workflow fields on a worktree context. Parameters: `projectId`, `worktreeId`, field updates. Same field routing as CLI `cf set` (workflow fields → worktree context, project fields → project).
   - `worktree_rm` — Remove a worktree context. Parameters: `projectId`, `worktreeId`. Triggers reverse migration on last removal.

   **Extended existing tools:**
   - `project_get` — Response includes `worktrees` array when worktree contexts exist. Each entry includes computed fields: current branch, slice progress, task progress.
   - `project_structure` — Includes per-worktree initiative breakdown with status when worktree contexts exist.
   - `workflow_status` — Accepts optional `worktreeId` parameter. When provided, returns worktree-scoped status. Without it, returns project-level status (or dashboard if worktree contexts exist).
   - `workflow_next` — Accepts optional `worktreeId`. Next action is scoped to the worktree's initiative.
   - `context_build` — Accepts optional `worktree` parameter (name or ID). When provided, overlays worktree context fields before assembly.

   **Visualizer support:** The primary consumer is context-visualizer, which needs:
   - List of worktree contexts with their index ranges, paths, and current branches
   - Per-worktree workflow state (phase, active slice, task progress)
   - Ability to set workflow fields on a specific worktree context
   - Project dashboard view (all worktree contexts at a glance)

   All new tools follow the existing registration pattern (`registerWorktreeTools(server)` in a new `worktreeTools.ts` module). Error handling, JSON response format, and annotation patterns match existing MCP tools.

   **Value:** Enables the context-visualizer to display and manage per-worktree state. MCP clients gain full worktree context management capability without requiring CLI access.
   **Success Criteria:**
   - `worktree_init`, `worktree_list`, `worktree_get`, `worktree_update`, `worktree_rm` all work correctly
   - `project_get` response includes worktrees with computed fields when worktree contexts exist
   - `workflow_status` with `worktreeId` returns worktree-scoped status
   - `context_build` with `worktree` parameter builds from the specified worktree context's artifacts
   - All tools handle: missing project, missing worktree context, projects without worktree contexts (graceful errors)
   - Response schemas are documented (tool descriptions include response shape)
   - Context-visualizer can display worktree dashboard from `project_get` + `worktree_list` responses
   **Dependencies:** [181 — Data Model & Storage], [182 — CWD Resolution] (for git worktree info)
   **Interfaces:** MCP protocol — consumed by context-visualizer and any MCP client
   **Risk:** Low — wrapping existing core operations in MCP tool handlers; follows established patterns
   **Effort:** 3/5

## Integration Work

7. [ ] **(187) Validation, Edge Cases & Polish** — Worktree path validation, stale worktree context detection, helpful first-run messaging, and cross-cutting quality concerns.

   **Worktree path validation:**
   - On worktree context read/display: check that `worktreePath` still exists on disk
   - On worktree context read/display: check that `worktreePath` still appears in `git worktree list` output
   - If path is missing from disk: show warning "(worktree removed)" in status/list output
   - If path exists but not in git worktree list: show warning "(not a git worktree)" — user may have moved it
   - Validation is lazy (on access), not proactive (no background scanning)

   **Stale worktree context detection:**
   - `cf worktree list` and `worktree_list` MCP tool flag stale worktree contexts (worktree path invalid)
   - `cf check` (consistency checker) gains a new rule: "worktree context has path that no longer exists"
   - Suggested fix: `cf worktree rm "stale context"` or `cf worktree update --path <new-path>`

   **First-run messaging:**
   - When `cf status` runs from a directory that is a git worktree of a known project but has no associated worktree context: display a helpful message suggesting `cf worktree init`
   - Detection: CWD is not a registered project path, but `git worktree list --porcelain` from CWD reveals a main worktree path that IS a registered project path
   - Message: "This directory is a worktree of project '{name}'. Create a worktree context with: cf worktree init --name '<name>' --range <start>-<end>"

   **`cf worktree update`:**
   - Rename: `cf worktree update "API Foundation" --name "API Layer"`
   - Change path: `cf worktree update "API Foundation" --path ~/repos/new-path`
   - Modify index range: `cf worktree update "API Foundation" --range 100-149` (with overlap warning)
   - Useful for worktree path corrections without remove/recreate

   **Edge case handling:**
   - Multiple git worktrees resolving to the same project but no worktree contexts: project resolves, no worktree context (existing behavior)
   - Nested worktrees (worktree within a worktree path): longest path match wins
   - Worktree context with no worktree path: valid (user manages initiative without a dedicated git worktree)
   - Empty worktrees array after all worktree contexts removed: reverse migration fires, array removed from stored data

   **Value:** Ensures the feature degrades gracefully when the real world doesn't match stored state. Helpful messaging reduces confusion during adoption. Update command prevents remove/recreate churn.
   **Success Criteria:**
   - Stale worktree paths are detected and flagged in status/list output
   - Consistency checker reports stale worktree paths as findings
   - Running from an unrecognized worktree of a known project shows helpful init suggestion
   - `cf worktree update` can rename, change path, and modify range
   - All edge cases listed above are handled without errors or crashes
   - Integration test: full lifecycle (init → set → status → build → rm) works end-to-end
   **Dependencies:** [183 — Worktree CLI Commands], [184 — Status & Display], [186 — MCP Tools]
   **Risk:** Low — primarily defensive coding and UX messaging
   **Effort:** 2/5

## Implementation Order

```
Foundation (must be first):
  181. WorktreeContext Data Model & Storage
    ↓
Feature (182 first, then 183-186 have partial parallelism):
  182. Worktree Discovery & CWD Resolution
    ↓
  183. Worktree CLI Commands ──────────┐
    ↓                                  │
  184. Status & Display Updates        │ 186. MCP Worktree Tools
  185. Worktree-Aware Assembly         │      (depends on 181, 182; parallel with 183-185)
    ↓                                  │
Integration (after all features):     │
  187. Validation, Edge Cases ←────────┘
```

184 and 185 depend on 183 (worktree-aware `cf set` is needed before status and build can display/use worktree context state). 186 (MCP) depends on 181 and 182 but is otherwise parallel with the CLI feature slices 183-185 — it wraps the same core operations. 187 is integration work that refines all preceding slices.

## Notes

- **Storage decision rationale.** Nested storage (`worktrees[]` on `ProjectData`) was chosen over separate files. At 1-10 worktree contexts per project, the read-modify-write pattern is not a bottleneck. Separate files would add directory management, cross-file consistency concerns, and complicate backup/restore. If a project ever reaches dozens of worktree contexts (unlikely), the storage can be extracted without changing the type interface.

- **Field naming alignment.** The `WorktreeContext` type uses `activeSlice`/`activeTaskFile`/`archDoc`/`slicePlan` rather than `fileSlice`/`fileTasks`/`fileArch`/`fileSlicePlan`. This is intentional — the worktree context fields describe the initiative's current position, while the project fields were named for their role as file references. The overlay in `cf build` maps between them. This avoids awkward field names like `worktreeContext.fileSlice` when the worktree context IS the scope, not a file reference.

- **Migration is conservative.** Forward migration (project → worktree context) only triggers on explicit `cf worktree init`, never automatically. Reverse migration only triggers when the last worktree context is removed. This ensures no surprise data movement. The migration preserves all field values — nothing is lost or defaulted.

- **MCP inclusion rationale.** The architecture document deferred MCP, but the context-visualizer's need to display per-worktree state makes MCP support a requirement for this initiative. Slice 186 follows the existing MCP tool patterns and is a thin wrapper over core operations — the risk of premature abstraction flagged in the architecture doc is mitigated by implementing CLI first (slices 181-185) to prove the model, then wrapping for MCP.

- **Naming rationale.** "Worktree" was chosen over "context" (overloaded — Context Forge builds contexts) and "initiative" (already means architectural initiative in the methodology). The feature exists specifically to support the git worktree parallel development pattern, so "worktree" is both accurate and intuitive. The type is `WorktreeContext` (internal clarity), but all user-facing surfaces use just "worktree": `cf worktree init`, `--worktree` flag, `worktree_list` MCP tool.

- **Verification walkthrough — happy path.** A developer with project `orchestration` registered at `~/repos/orchestration`:
  1. Creates git worktree: `git worktree add ../orchestration-api feature/100-api`
  2. Creates worktree context: `cd ~/repos/orchestration-api && cf worktree init --name "API Foundation" --range 100-199`
     - cf detects CWD is a worktree of `orchestration` (via `git worktree list`)
     - First worktree context triggers forward migration: existing workflow fields move to a "default" worktree context
     - New "API Foundation" worktree context created with worktree path and index range
     - Auto-discovers `100-arch.*` and `100-slices.*` if present
  3. Sets workflow state: `cf set slice 103` → updates "API Foundation" worktree context's `activeSlice`
  4. Checks status: `cf status` → shows worktree-scoped status with branch name
  5. Builds context: `cf build` → assembles using API Foundation's arch doc, slice plan, active slice
  6. From main worktree: `cd ~/repos/orchestration && cf status` → shows project dashboard with all worktree contexts
  7. Visualizer: calls `worktree_list` → shows all worktree contexts with branches and progress

- **Verification walkthrough — edge cases.**
  - Developer removes git worktree (`git worktree remove ../orchestration-api`) without running `cf worktree rm`: next `cf status` or `cf worktree list` shows "(worktree removed)" warning. Consistency checker flags it.
  - Developer runs `cf status` from `~/repos/orchestration-api` before creating a worktree context: helpful message suggests `cf worktree init`.
  - Developer creates overlapping ranges (100-199 and 150-249): warning displayed but worktree context created.
  - Developer runs `cf set slice 103` from project root (no worktree context): updates project-level `fileSlice` as today (backwards compatible).

## Future Work

1. [ ] **Automatic Worktree Context Creation** — Optional `cf.auto_worktree` config that creates a worktree context automatically when `cf status` detects an unrecognized worktree, based on the checked-out branch name or directory naming convention. Currently deferred in favor of explicit `cf worktree init`.

2. [ ] **Inter-Initiative Dependency Tracking** — Cross-initiative dependency declarations (e.g., "UX initiative slice 203 depends on API initiative slice 101"). Visualizable in context-visualizer as a dependency graph. Not in scope per architecture non-goals, but natural extension once worktree contexts exist.

3. [ ] **Worktree Context Templates** — Pre-defined worktree context configurations for common patterns (e.g., "API initiative: range 100-199, convention: feature/{index}-branch"). Reduces boilerplate when creating worktree contexts for projects that follow consistent conventions.
