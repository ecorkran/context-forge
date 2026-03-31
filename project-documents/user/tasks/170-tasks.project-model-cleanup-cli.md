---
slice: project-model-cleanup-cli
project: context-forge
lld: user/slices/170-slice.project-model-cleanup-cli.md
dependencies: [multi-project-ux-polish]
projectState: Slice 169 complete. CLI has three-step resolveProjectId (flag → CWD → default), findByNameOrId, findProjectByCwd. ProjectData has isMonorepo, isMonorepoEnabled, customData.monorepoNote — dead fields serving old project-artifacts structure. No cf init command. MCP server version not exposed to clients. 80 tests passing across CLI, core, MCP.
dateCreated: 20260305
dateUpdated: 20260305
status: complete
docType: tasks
---

## Context Summary

- Removing monorepo fields (`isMonorepo`, `isMonorepoEnabled`, `customData.monorepoNote`) from the entire stack
- Adding `cf init` command to register CWD as a project
- Adding deprecation warning when `default_project` config is the resolution source
- Adding `server_version` MCP tool
- Monorepo removal is types-first: removing from `ProjectData` breaks the build at every consumer, making them easy to find
- Tests are updated alongside each package's changes (test-with pattern)
- See slice design for full file inventory and behavioral changes
- Next planned slice: 171 (Project Schema Visibility & Smart Field Setting)

---

## Task 1: Remove Monorepo Fields from Core Types

**Effort: 1/5**

- [x] **Remove monorepo fields from `packages/core/src/types/project.ts`**
  - [x] Remove `isMonorepo: boolean` from `ProjectData`
  - [x] Remove `isMonorepoEnabled?: boolean` from `ProjectData`
  - [x] Remove `monorepoNote?: string` from `customData` in `ProjectData`
  - [x] Remove `monorepoNote?: string` from `customData` in `CreateProjectData`
  - [x] Remove `| 'isMonorepo'` and `| 'isMonorepoEnabled'` from `UpdateProjectData` Pick
  - [x] Success: `project.ts` has no monorepo references; `pnpm --filter @context-forge/core typecheck` will report errors in consumers (expected at this stage)

- [x] **Remove monorepo fields from `packages/core/src/types/context.ts`**
  - [x] Remove `isMonorepo: boolean` from `ContextData`/`EnhancedContextData`
  - [x] Remove `monorepoNote?: string` from `customData`
  - [x] Success: `context.ts` has no monorepo references

---

## Task 2: Remove Monorepo Logic from Core Services

**Effort: 2/5**

- [x] **Update `SectionBuilder.ts`**
  - [x] Delete `buildMonorepoSection()` method entirely (lines 90-112)
  - [x] In `buildProjectInfoSection()`: remove `monorepo: ${data.isMonorepo}` line
  - [x] Change template conditional from `if (data.isMonorepo && data.template && data.template !== 'default')` to `if (data.template && data.template !== 'default')`
  - [x] Success: no `isMonorepo` or `monorepo` references in SectionBuilder

- [x] **Update `ContextTemplateEngine.ts`**
  - [x] Remove `data.isMonorepo` argument from `getContextInitializationPrompt()` call
  - [x] Remove the `if (data.isMonorepo)` block that pushes the monorepo section (lines 114-124)
  - [x] Success: no monorepo references in ContextTemplateEngine

- [x] **Update `SystemPromptParser.ts`**
  - [x] Remove `isMonorepo` parameter from `getContextInitializationPrompt` signature
  - [x] Remove the monorepo-specific prompt lookup branch (lines 156-166)
  - [x] Method always returns the standard context initialization prompt
  - [x] Success: `getContextInitializationPrompt()` takes no parameters

- [x] **Update `ContextIntegrator.ts`**
  - [x] Remove `{{#if isMonorepo}}Monorepo: Yes{{else}}Monorepo: No{{/if}}` from DEFAULT_TEMPLATE
  - [x] Remove `isMonorepo: project.isMonorepo || false` from data mappings (two locations)
  - [x] Remove `Monorepo: ${project.isMonorepo ? 'Yes' : 'No'}` from error fallback
  - [x] Success: no monorepo references in ContextIntegrator

- [x] **Update `ProjectPathService.ts`**
  - [x] Remove `isMonorepo?: boolean` parameter from `listDirectory`
  - [x] Replace conditional base path with: `const basePath = path.join(projectPath, 'project-documents', 'user')`
  - [x] Success: `listDirectory` always uses standard path, no isMonorepo parameter

- [x] **Update `FileProjectStore.ts` migration**
  - [x] Remove `isMonorepo` default logic from `migrateProjectFields()`
  - [x] Add field deletion to strip monorepo fields from legacy data (delete `isMonorepo`, `isMonorepoEnabled`, `customData.monorepoNote`)
  - [x] Remove `isMonorepo: data.isMonorepo` and `isMonorepoEnabled: data.isMonorepoEnabled` from `create()`
  - [x] Success: store strips monorepo fields on read, doesn't write them on create

- [x] **Remove `monorepo-statement` from constants and statements**
  - [x] Remove `'monorepo-statement'` entry from default statements map in `constants.ts`
  - [x] Remove the "Monorepo Statement" section from `default-statements.md`
  - [x] Success: no monorepo-statement references remain

---

## Task 3: Update Core Tests

**Effort: 2/5**

- [x] **Update `packages/core/tests/` — remove monorepo from test fixtures and assertions**
  - [x] Update test helper/fixture data (e.g. `testData.ts`) — remove `isMonorepo`, `isMonorepoEnabled`, `monorepoNote` from project/context objects
  - [x] Update `SectionBuilder.test.ts` — remove `buildMonorepoSection` tests, update `buildProjectInfoSection` tests (template now shown when non-default, monorepo line removed)
  - [x] Update `ContextTemplateEngine.test.ts` — remove monorepo section assertions
  - [x] Update `ContextIntegrator.test.ts` — remove isMonorepo from test data and assertions
  - [x] Update `TemplateProcessor.test.ts` — remove monorepo references from test fixtures
  - [x] Update `ProjectPathService.test.ts` — remove isMonorepo parameter from `listDirectory` test calls
  - [x] Update `FileProjectStore.test.ts` — remove monorepo fields from test project data, add test that legacy data with `isMonorepo: true` loads without error (fields stripped)
  - [x] Update `pipeline-integration.test.ts` — remove monorepo from test data
  - [x] Update `ArtifactIntrospector.test.ts` — remove monorepo from test fixtures
  - [x] Success: `pnpm --filter @context-forge/core test` passes with 0 failures

- [x] **Commit**: `refactor(core): remove monorepo fields from types, services, and tests`

---

## Task 4: Remove Monorepo from MCP Server

**Effort: 1/5**

- [x] **Update `packages/mcp-server/src/tools/projectTools.ts`**
  - [x] Remove `isMonorepo` from `ProjectSummary` interface and `toSummary()` function
  - [x] Remove `isMonorepo` and `isMonorepoEnabled` Zod fields from `project_update` input schema
  - [x] Remove `monorepoNote` from `customData` Zod schema in `project_update`
  - [x] Success: no monorepo references in projectTools.ts

- [x] **Update MCP server tests**
  - [x] Update `projectTools.test.ts` — remove monorepo fields from test fixtures and assertions
  - [x] Update `stateTools.test.ts` — remove monorepo from test data
  - [x] Update `contextTools.test.ts` — remove monorepo from test data
  - [x] Update `workflowTools.test.ts` — remove monorepo from test data
  - [x] Update `introspectionTools.test.ts` — remove monorepo from test data
  - [x] Update test fixture `integration-project/projects.json` — remove monorepo fields
  - [x] Success: `pnpm --filter @context-forge/mcp test` passes with 0 failures

- [x] **Commit**: `refactor(mcp): remove monorepo fields from schemas and tests`

---

## Task 5: Add MCP `server_version` Tool + Tests

**Effort: 1/5**

- [x] **Create `packages/mcp-server/src/tools/versionTool.ts`**
  - [x] Export `registerVersionTool(server, name, version)` function
  - [x] Register `server_version` tool with no input parameters
  - [x] Return `{ name, version }` as JSON text content
  - [x] Annotations: `readOnlyHint: true`, `openWorldHint: false`
  - [x] Success: tool registered, returns correct shape

- [x] **Register in `packages/mcp-server/src/index.ts`**
  - [x] Import `registerVersionTool`
  - [x] Call `registerVersionTool(server, SERVER_NAME, SERVER_VERSION)` alongside existing registrations
  - [x] Success: server_version tool available when MCP server starts

- [x] **Add test for `server_version` tool**
  - [x] Test that tool returns JSON with `name` and `version` fields
  - [x] Test that returned version matches package.json
  - [x] Success: test passes via `pnpm --filter @context-forge/mcp test`

- [x] **Commit**: `feat(mcp): add server_version tool`

---

## Task 6: Remove Monorepo from CLI

**Effort: 1/5**

- [x] **Update `packages/cli/src/commands/project.ts`**
  - [x] Remove `'isMonorepo'` and `'isMonorepoEnabled'` from `UPDATABLE_FIELDS`
  - [x] Remove `['Monorepo', project.isMonorepo ? 'true' : '']` from `project get` display fields
  - [x] Success: no monorepo references in project.ts

- [x] **Update CLI tests**
  - [x] Update `commands/project.test.ts` — remove monorepo from test fixtures and assertions
  - [x] Update `integration/build.integration.test.ts` — remove monorepo from test data
  - [x] Success: `pnpm --filter @context-forge/cli test` passes with 0 failures

- [x] **Commit**: `refactor(cli): remove monorepo fields from project command and tests`

---

## Task 7: Add `cf init` Command + Tests

**Effort: 2/5**

- [x] **Create `packages/cli/src/commands/init.ts`**
  - [x] Export `registerInitCommand(program: Command)` function
  - [x] Register top-level `cf init` command (not under `cf project`)
  - [x] Accept `--name <name>` option to override derived project name
  - [x] Resolve CWD as absolute path via `process.cwd()`
  - [x] Check if a project with matching `projectPath` already exists (use `store.getAll()`)
  - [x] If exists: print warning message and exit (no error code)
  - [x] Derive name from `path.basename(cwd)`, use `--name` override if provided
  - [x] Create project via `store.create()` with: `name`, `projectPath: cwd`, `template: 'default'`, `fileSlice: ''`, `instruction: 'implementation'`
  - [x] Print success message: `"Initialized project '{name}' at {path}"`
  - [x] Success: command creates a project entry that `findProjectByCwd` can resolve

- [x] **Register in `packages/cli/src/index.ts`**
  - [x] Import `registerInitCommand`
  - [x] Call `registerInitCommand(program)` alongside existing registrations
  - [x] Success: `cf init --help` works

- [x] **Add tests for `cf init`**
  - [x] Mock `FileProjectStore` (getAll, create)
  - [x] Test: success path — creates project with correct name and path
  - [x] Test: `--name` override — uses provided name instead of directory basename
  - [x] Test: already-registered — warns without creating duplicate
  - [x] Success: all tests pass via `pnpm --filter @context-forge/cli test`

- [x] **Commit**: `feat(cli): add cf init command`

---

## Task 8: Add `default_project` Deprecation Warning + Tests

**Effort: 1/5**

- [x] **Update `packages/cli/src/utils/project.ts`**
  - [x] After step 3 resolves via `default_project` (before returning `{ id, source: 'default' }`), emit a warning to stderr
  - [x] Warning text: `"Warning: Resolved via default_project config. Consider using --project or running from within a registered project directory."`
  - [x] Include guidance lines for `cf init` and `cf project list`
  - [x] Use `console.error()` so it goes to stderr (doesn't interfere with piped stdout)
  - [x] Success: warning appears on stderr when default_project is the resolution source

- [x] **Add test for deprecation warning**
  - [x] Mock ConfigManager to return a default_project value
  - [x] Mock store with matching project
  - [x] Mock CWD to not match any project (so CWD step doesn't resolve first)
  - [x] Verify stderr output contains "Warning" and "default_project"
  - [x] Verify resolution still succeeds (returns correct project ID)
  - [x] Success: test passes

- [x] **Commit**: `feat(cli): add deprecation warning for default_project config`

---

## Task 9: Remove Monorepo from Electron

**Effort: 2/5**

- [x] **Update `packages/electron/src/components/ContextBuilderApp.tsx`**
  - [x] Remove `isMonorepo: false` from default state objects
  - [x] Remove `isMonorepo` and `isMonorepoEnabled` from project-to-form data mapping
  - [x] Success: no monorepo references in ContextBuilderApp

- [x] **Update `packages/electron/src/components/forms/ProjectConfigForm.tsx`**
  - [x] Remove `isMonorepo` and `isMonorepoEnabled` from form state initialization
  - [x] Remove monorepo checkbox UI
  - [x] Remove conditional template/note fields that depend on `formData.isMonorepo`
  - [x] Enable template field unconditionally (remove `disabled` and related styling)
  - [x] Remove `isMonorepo` from state-reset comparison
  - [x] Success: template field always visible and enabled, no monorepo UI

- [x] **Update `packages/electron/src/components/settings/SettingsDialog.tsx`**
  - [x] Remove `handleMonorepoModeChange` function
  - [x] Remove the monorepo features checkbox block
  - [x] Success: no monorepo references in SettingsDialog

- [x] **Update Electron IPC layer**
  - [x] `preload/preload.ts` — remove `isMonorepo?: boolean` from `listDirectory` call
  - [x] `globals.d.ts` — remove `isMonorepo?: boolean` from `listDirectory` type
  - [x] `main/ipc/projectPathHandlers.ts` — remove `isMonorepo` from handler args and `listDirectory` call
  - [x] Success: IPC layer has no monorepo references

- [x] **Update Electron tests**
  - [x] Update `tests/unit/services/context/ContextIntegrator.test.ts`
  - [x] Update `tests/unit/services/context/TemplateProcessor.test.ts`
  - [x] Update `tests/unit/main/ipc/projectHandlers.test.ts`
  - [x] Update `tests/unit/services/context/ContextGenerator.test.ts`
  - [x] Update `tests/integration/components/forms/ProjectConfigForm.integration.test.ts`
  - [x] Update `tests/unit/main/ipc/contextHandlers.test.ts`
  - [x] Update `tests/unit/main/services/project/ProjectPathService.test.ts`
  - [x] Success: `pnpm --filter @context-forge/electron test` passes with 0 failures

- [x] **Commit**: `refactor(electron): remove monorepo fields from UI, IPC, and tests`

---

## Task 10: Full Build & Test Verification

**Effort: 1/5**

- [x] **Run full build from project root**
  - [x] `pnpm build` — all packages compile without errors
  - [x] Success: exit code 0, no type errors

- [x] **Run full test suite from project root**
  - [x] `pnpm test` — all tests pass across all packages
  - [x] Success: exit code 0, no test failures

- [x] **Verify no stale monorepo references remain**
  - [x] Grep for `isMonorepo`, `isMonorepoEnabled`, `monorepoNote`, `buildMonorepoSection`, `monorepo-statement` across `packages/` source (excluding `node_modules`)
  - [x] Success: no matches in source files (test fixtures may have migration test references)

- [x] **Commit any final fixes if needed, then final commit/tag**
