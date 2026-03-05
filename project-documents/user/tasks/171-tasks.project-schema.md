---
slice: project-schema
project: context-forge
lld: user/slices/171-slice.project-schema.md
dependencies: [project-model-cleanup-cli]
projectState: Slice 170 complete. CLI has cf init, cf project list/get/set, three-step resolveProjectId. ProjectData has artifact reference fields (fileArch, fileSlicePlan, fileHLD, fileSpec) but cf project get omits them. cf project set requires exact field names and values. No schema introspection. No cf project rm. Electron loads projects once on startup — no external change detection. 632 tests passing.
dateCreated: 20260305
dateUpdated: 20260305
status: not_started
---

## Context Summary

- Adding project schema visibility and smart field setting to Context Forge
- Core schema module in `packages/core/src/schema/` defines field metadata, aliases, phase maps as single source of truth
- CLI gains: `--schema` flag, grouped `project get` output, smart `set` with aliases/resolution, `project rm`
- MCP gains: `project_schema` tool
- Electron gains: `fs.watch` on `projects.json` for live refresh
- All foundation slices (161-170) are complete
- Next planned slice: 172 (Guide Management)

---

## Task 1: Create Schema Definition Module in Core

**Effort: 2/5**

- [ ] **Create `packages/core/src/schema/projectSchema.ts`**
  - [ ] Define `FieldGroup` type: `'identity' | 'artifacts' | 'workflow' | 'metadata'`
  - [ ] Define `FieldDefinition` interface with: `field`, `type`, `required`, `readonly` (boolean), `group`, `description`, `aliases`, `enumValues?`
  - [ ] Define `PROJECT_FIELDS` array of `FieldDefinition` entries for all `ProjectData` fields, grouped as specified in slice design:
    1. Identity: `name` (required), `id` (readonly), `projectPath` (required, alias: `path`), `template`
    2. Artifacts: `fileArch` (alias: `arch`), `fileSlicePlan` (alias: `plan`), `fileHLD` (alias: `hld`), `fileSpec` (alias: `spec`), `fileSlice` (alias: `slice`), `fileTasks` (alias: `tasks`)
    3. Workflow: `developmentPhase` (alias: `phase`, enum), `instruction` (enum), `workType` (enum: `start`/`continue`), `dateProject` (alias: `date`)
    4. Metadata: `createdAt` (readonly), `updatedAt` (readonly)
  - [ ] Define `PHASE_MAP`: maps phase numbers (1-7) and short names to full phase strings (e.g. `'4'` → `'Phase 4: Slice Design'`, `'implementation'` → `'Phase 6: Implementation'`). Include `ad-hoc-tasks` and `custom-instruction`
  - [ ] Define `FIELD_ALIASES` object derived from `PROJECT_FIELDS` (alias → canonical field name)
  - [ ] Export helper functions:
    1. `resolveFieldName(input: string): string | undefined` — case-insensitive alias and canonical field lookup
    2. `resolvePhaseValue(input: string): string | undefined` — number, short name, or full string resolution
    3. `validateFieldValue(field: string, value: string): { valid: boolean; error?: string }` — enum validation with allowed-values error message
    4. `getSchema()` — returns the full schema structure (fields, aliases, groups)
  - [ ] Success: module exports all types, constants, and helpers; `pnpm --filter @context-forge/core typecheck` passes

- [ ] **Export from `packages/core/src/index.ts`**
  - [ ] Add export for schema module (types and functions)
  - [ ] Success: other packages can import from `@context-forge/core`

---

## Task 2: Schema Module Unit Tests

**Effort: 2/5**

- [ ] **Create `packages/core/tests/schema/projectSchema.test.ts`**
  - [ ] Test `resolveFieldName`:
    1. Alias resolution: `'phase'` → `'developmentPhase'`, `'arch'` → `'fileArch'`
    2. Canonical name passthrough: `'developmentPhase'` → `'developmentPhase'`
    3. Case-insensitive: `'Phase'` → `'developmentPhase'`, `'ARCH'` → `'fileArch'`, `'DevelopmentPhase'` → `'developmentPhase'`
    4. Unknown field: `'foobar'` → `undefined`
  - [ ] Test `resolvePhaseValue`:
    1. Number: `'4'` → `'Phase 4: Slice Design'`
    2. Short name: `'implementation'` → `'Phase 6: Implementation'`
    3. Full string passthrough: `'Phase 4: Slice Design'` → `'Phase 4: Slice Design'`
    4. Case-insensitive: `'Implementation'` → `'Phase 6: Implementation'`
    5. Special phases: `'ad-hoc-tasks'` → `'Ad-Hoc Tasks'`
    6. Invalid: `'99'` → `undefined`
  - [ ] Test `validateFieldValue`:
    1. Valid enum: `workType` + `'start'` → `{ valid: true }`
    2. Invalid enum: `workType` + `'foo'` → `{ valid: false, error: '...' }` with allowed values in message
    3. Non-enum field: `name` + `'anything'` → `{ valid: true }`
  - [ ] Test `getSchema`:
    1. Returns object with `fields`, `aliases`, `groups` keys
    2. `fields` array has entries for all `ProjectData` fields
    3. `aliases` object maps all defined aliases
    4. `groups` array is `['identity', 'artifacts', 'workflow', 'metadata']`
  - [ ] Success: `pnpm --filter @context-forge/core test` passes

- [ ] **Commit**: `feat(core): add project schema definition module with field metadata and resolution helpers`

---

## Task 3: Smart `cf project set` with Aliases and Resolution

**Effort: 2/5**

- [ ] **Update `packages/cli/src/commands/project.ts` — `set` subcommand**
  - [ ] Import `resolveFieldName`, `resolvePhaseValue`, `validateFieldValue` from `@context-forge/core`
  - [ ] Replace direct `UPDATABLE_FIELDS.has(field)` check with `resolveFieldName(field)` — resolves aliases and case-insensitive names
  - [ ] If `resolveFieldName` returns `undefined`, print error: `"Unknown field: '{input}'. Run 'cf project --schema' to see available fields."`
  - [ ] If resolved field is `readonly` (`id`, `createdAt`, `updatedAt`), print error: `"Field '{field}' is read-only and cannot be set."`
  - [ ] After resolving field name, if field is `developmentPhase` or `instruction`, apply `resolvePhaseValue(value)` to the value
  - [ ] If `resolvePhaseValue` returns `undefined`, print error with allowed values
  - [ ] Apply `validateFieldValue(resolvedField, resolvedValue)` — print error on invalid
  - [ ] On success, call store update with resolved field name and resolved value
  - [ ] Remove the hardcoded `UPDATABLE_FIELDS` constant (replaced by schema-driven logic)
  - [ ] Success: `cf project set phase 4` resolves and updates; `cf project set ARCH some/path.md` works; invalid values show helpful errors

---

## Task 4: Smart Set Unit Tests

**Effort: 1/5**

- [ ] **Update `packages/cli/tests/commands/project.test.ts` — set tests**
  - [ ] Test alias resolution: `cf project set phase "Phase 4: Slice Design"` → updates `developmentPhase`
  - [ ] Test phase number resolution: `cf project set phase 4` → `Phase 4: Slice Design`
  - [ ] Test phase short name: `cf project set phase implementation` → `Phase 6: Implementation`
  - [ ] Test case-insensitive field: `cf project set DevelopmentPhase "Phase 6: Implementation"` → works
  - [ ] Test artifact alias: `cf project set arch some/path.md` → updates `fileArch`
  - [ ] Test unknown field error: `cf project set foobar value` → error message mentioning `--schema`
  - [ ] Test invalid enum value: `cf project set workType invalid` → error with allowed values
  - [ ] Test readonly field rejection: `cf project set id new-id` → error
  - [ ] Success: `pnpm --filter @context-forge/cli test` passes

- [ ] **Commit**: `feat(cli): smart project set with aliases, phase resolution, and validation`

---

## Task 5: Updated `cf project get` Display

**Effort: 2/5**

- [ ] **Update `packages/cli/src/commands/project.ts` — `get` subcommand**
  - [ ] Import `PROJECT_FIELDS` and `FieldGroup` from `@context-forge/core`
  - [ ] Replace flat key-value output with grouped display
  - [ ] Iterate fields by group (identity → artifacts → workflow → metadata)
  - [ ] For each group, collect fields that have non-empty values in the project data
  - [ ] Skip entire group if no fields have values
  - [ ] Use human-readable labels for field names (e.g. `developmentPhase` → `Phase`, `fileArch` → `Architecture`, `projectPath` → `Path`)
  - [ ] Display group headers with styling consistent with existing CLI output (bold cyan)
  - [ ] Handle `customData` sub-fields: display `recentEvents`, `additionalNotes`, `availableTools` if populated (under workflow or a separate group)
  - [ ] Handle `--json` flag: return full project data as before (no grouping changes for JSON output)
  - [ ] Success: `cf project get` shows all populated fields grouped logically; empty groups omitted; `--json` still works

- [ ] **Update get display tests**
  - [ ] Test grouped output format: project with all fields populated shows all groups
  - [ ] Test artifact fields visible: project with `fileArch` set shows it under Artifacts group
  - [ ] Test empty group omission: project with no artifact fields set omits Artifacts group
  - [ ] Test `--json` unchanged: still returns full project object
  - [ ] Success: `pnpm --filter @context-forge/cli test` passes

- [ ] **Commit**: `feat(cli): grouped project get display with artifact field visibility`

---

## Task 6: `cf project --schema` CLI Command

**Effort: 1/5**

- [ ] **Add `--schema` flag to project command in `packages/cli/src/commands/project.ts`**
  - [ ] Add `--schema` option on the `project` command (before subcommands)
  - [ ] When `--schema` is passed, display formatted schema output and exit
  - [ ] Format: group headers, then indented rows with field name, type, required/readonly indicator, description
  - [ ] Show aliases on a second indented line where applicable (e.g. `Aliases: phase`)
  - [ ] Show enum values on a second indented line where applicable (e.g. `Values: start, continue`)
  - [ ] Use existing CLI styling (bold cyan headers, `─` underline)
  - [ ] Success: `cf project --schema` displays full schema grouped by category

- [ ] **Add schema display tests**
  - [ ] Test output contains all group headers (Identity, Artifacts, Workflow, Metadata)
  - [ ] Test output contains alias information for aliased fields
  - [ ] Test output contains enum values for enum fields
  - [ ] Success: `pnpm --filter @context-forge/cli test` passes

- [ ] **Commit**: `feat(cli): add cf project --schema for schema introspection`

---

## Task 7: `project_schema` MCP Tool

**Effort: 1/5**

- [ ] **Add `project_schema` tool in `packages/mcp-server/src/tools/projectTools.ts`**
  - [ ] Import `getSchema` from `@context-forge/core`
  - [ ] Register `project_schema` tool with no input parameters
  - [ ] Return `getSchema()` result as JSON text content
  - [ ] Annotations: `readOnlyHint: true`, `openWorldHint: false`
  - [ ] Success: tool registered and returns structured schema JSON

- [ ] **Add MCP tool tests**
  - [ ] Test that `project_schema` returns JSON with `fields`, `aliases`, `groups` keys
  - [ ] Test that `fields` array contains expected field definitions
  - [ ] Test that `aliases` object maps correctly
  - [ ] Success: `pnpm --filter @context-forge/mcp test` passes

- [ ] **Commit**: `feat(mcp): add project_schema tool for schema introspection`

---

## Task 8: `cf project rm` Command

**Effort: 2/5**

- [ ] **Add `rm` subcommand to `packages/cli/src/commands/project.ts`**
  - [ ] Register `project rm` subcommand with `--yes` option
  - [ ] Resolve project via `resolveProjectId` (uses `--project` flag or CWD)
  - [ ] Look up project from store by resolved ID
  - [ ] Print confirmation message: `"Remove project '{name}' at {path} from Context Forge? (files on disk will not be deleted) [y/N]"`
  - [ ] If `--yes` flag is passed, skip confirmation prompt
  - [ ] Read stdin for y/n confirmation (use `readline` from Node.js)
  - [ ] On confirm: call `store.delete(id)`, print `"Project '{name}' removed."`
  - [ ] On decline: print `"Cancelled."` and exit
  - [ ] Success: `cf project rm` removes project entry from store; files on disk untouched

- [ ] **Add rm command tests**
  - [ ] Test: `--yes` flag — deletes without prompt
  - [ ] Test: project not found — prints error
  - [ ] Test: confirmation declined — does not delete (mock stdin or use `--yes` absence with mock)
  - [ ] Success: `pnpm --filter @context-forge/cli test` passes

- [ ] **Commit**: `feat(cli): add cf project rm command`

---

## Task 9: Electron Project List Refresh

**Effort: 2/5**

- [ ] **Add file watcher in `packages/electron/src/main/ipc/projectHandlers.ts`**
  - [ ] Import `fs` and `getStoragePath` (or equivalent to resolve `projects.json` path)
  - [ ] After initial IPC handler registration, set up `fs.watch` on `projects.json`
  - [ ] Debounce change events (300ms) to avoid rapid-fire reloads
  - [ ] On change: re-read projects from `FileProjectStore`, send IPC event `project:list-changed` to all renderer windows
  - [ ] Handle watcher errors gracefully (log warning, don't crash)
  - [ ] Clean up watcher on app quit (`app.on('will-quit', ...)`)
  - [ ] Success: watcher starts when app starts, emits events on file change

- [ ] **Add IPC listener in renderer**
  - [ ] Update `packages/electron/src/preload/preload.ts` — expose `onProjectListChanged(callback)` via contextBridge
  - [ ] Update `packages/electron/src/globals.d.ts` — add type for `onProjectListChanged`
  - [ ] In `packages/electron/src/components/ContextBuilderApp.tsx` (or `ProjectSelector.tsx`):
    1. On mount, register listener for `project:list-changed`
    2. On event: re-fetch project list via existing IPC call and update state
    3. Clean up listener on unmount
  - [ ] Success: projects created via `cf init` or MCP appear in Electron dropdown without restart

- [ ] **Add Electron refresh tests**
  - [ ] Test that IPC event `project:list-changed` triggers project list reload in component
  - [ ] Test that watcher cleanup runs on app quit (mock `fs.watch` and verify `close()` called)
  - [ ] Success: `pnpm --filter @context-forge/electron test` passes

- [ ] **Commit**: `feat(electron): auto-refresh project list on external projects.json changes`

---

## Task 10: Full Build & Test Verification

**Effort: 1/5**

- [ ] **Run full build from project root**
  - [ ] `pnpm build` — all packages compile without errors
  - [ ] Success: exit code 0, no type errors

- [ ] **Run full test suite from project root**
  - [ ] `pnpm test` — all tests pass across all packages
  - [ ] Success: exit code 0, no test failures

- [ ] **Verify schema single-source-of-truth**
  - [ ] Confirm CLI `--schema`, MCP `project_schema`, and CLI `set` alias resolution all derive from the same `packages/core/src/schema/projectSchema.ts` module
  - [ ] No duplicated alias maps or phase maps exist elsewhere
  - [ ] Success: grep confirms no duplicate definitions
