---
slice: project-model-cleanup-cli
project: context-forge
lld: user/slices/170-slice.project-model-cleanup-cli.md
dependencies: [multi-project-ux-polish]
projectState: Slice 169 complete. CLI has three-step resolveProjectId (flag → CWD → default), findByNameOrId, findProjectByCwd. ProjectData has isMonorepo, isMonorepoEnabled, customData.monorepoNote — dead fields serving old project-artifacts structure. No cf init command. MCP server version not exposed to clients. 80 tests passing across CLI, core, MCP.
dateCreated: 20260305
dateUpdated: 20260305
status: not_started
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

- [ ] **Remove monorepo fields from `packages/core/src/types/project.ts`**
  - [ ] Remove `isMonorepo: boolean` from `ProjectData`
  - [ ] Remove `isMonorepoEnabled?: boolean` from `ProjectData`
  - [ ] Remove `monorepoNote?: string` from `customData` in `ProjectData`
  - [ ] Remove `monorepoNote?: string` from `customData` in `CreateProjectData`
  - [ ] Remove `| 'isMonorepo'` and `| 'isMonorepoEnabled'` from `UpdateProjectData` Pick
  - [ ] Success: `project.ts` has no monorepo references; `pnpm --filter @context-forge/core typecheck` will report errors in consumers (expected at this stage)

- [ ] **Remove monorepo fields from `packages/core/src/types/context.ts`**
  - [ ] Remove `isMonorepo: boolean` from `ContextData`/`EnhancedContextData`
  - [ ] Remove `monorepoNote?: string` from `customData`
  - [ ] Success: `context.ts` has no monorepo references

---

## Task 2: Remove Monorepo Logic from Core Services

**Effort: 2/5**

- [ ] **Update `SectionBuilder.ts`**
  - [ ] Delete `buildMonorepoSection()` method entirely (lines 90-112)
  - [ ] In `buildProjectInfoSection()`: remove `monorepo: ${data.isMonorepo}` line
  - [ ] Change template conditional from `if (data.isMonorepo && data.template && data.template !== 'default')` to `if (data.template && data.template !== 'default')`
  - [ ] Success: no `isMonorepo` or `monorepo` references in SectionBuilder

- [ ] **Update `ContextTemplateEngine.ts`**
  - [ ] Remove `data.isMonorepo` argument from `getContextInitializationPrompt()` call
  - [ ] Remove the `if (data.isMonorepo)` block that pushes the monorepo section (lines 114-124)
  - [ ] Success: no monorepo references in ContextTemplateEngine

- [ ] **Update `SystemPromptParser.ts`**
  - [ ] Remove `isMonorepo` parameter from `getContextInitializationPrompt` signature
  - [ ] Remove the monorepo-specific prompt lookup branch (lines 156-166)
  - [ ] Method always returns the standard context initialization prompt
  - [ ] Success: `getContextInitializationPrompt()` takes no parameters

- [ ] **Update `ContextIntegrator.ts`**
  - [ ] Remove `{{#if isMonorepo}}Monorepo: Yes{{else}}Monorepo: No{{/if}}` from DEFAULT_TEMPLATE
  - [ ] Remove `isMonorepo: project.isMonorepo || false` from data mappings (two locations)
  - [ ] Remove `Monorepo: ${project.isMonorepo ? 'Yes' : 'No'}` from error fallback
  - [ ] Success: no monorepo references in ContextIntegrator

- [ ] **Update `ProjectPathService.ts`**
  - [ ] Remove `isMonorepo?: boolean` parameter from `listDirectory`
  - [ ] Replace conditional base path with: `const basePath = path.join(projectPath, 'project-documents', 'user')`
  - [ ] Success: `listDirectory` always uses standard path, no isMonorepo parameter

- [ ] **Update `FileProjectStore.ts` migration**
  - [ ] Remove `isMonorepo` default logic from `migrateProjectFields()`
  - [ ] Add field deletion to strip monorepo fields from legacy data (delete `isMonorepo`, `isMonorepoEnabled`, `customData.monorepoNote`)
  - [ ] Remove `isMonorepo: data.isMonorepo` and `isMonorepoEnabled: data.isMonorepoEnabled` from `create()`
  - [ ] Success: store strips monorepo fields on read, doesn't write them on create

- [ ] **Remove `monorepo-statement` from constants and statements**
  - [ ] Remove `'monorepo-statement'` entry from default statements map in `constants.ts`
  - [ ] Remove the "Monorepo Statement" section from `default-statements.md`
  - [ ] Success: no monorepo-statement references remain

---

## Task 3: Update Core Tests

**Effort: 2/5**

- [ ] **Update `packages/core/tests/` — remove monorepo from test fixtures and assertions**
  - [ ] Update test helper/fixture data (e.g. `testData.ts`) — remove `isMonorepo`, `isMonorepoEnabled`, `monorepoNote` from project/context objects
  - [ ] Update `SectionBuilder.test.ts` — remove `buildMonorepoSection` tests, update `buildProjectInfoSection` tests (template now shown when non-default, monorepo line removed)
  - [ ] Update `ContextTemplateEngine.test.ts` — remove monorepo section assertions
  - [ ] Update `ContextIntegrator.test.ts` — remove isMonorepo from test data and assertions
  - [ ] Update `TemplateProcessor.test.ts` — remove monorepo references from test fixtures
  - [ ] Update `ProjectPathService.test.ts` — remove isMonorepo parameter from `listDirectory` test calls
  - [ ] Update `FileProjectStore.test.ts` — remove monorepo fields from test project data, add test that legacy data with `isMonorepo: true` loads without error (fields stripped)
  - [ ] Update `pipeline-integration.test.ts` — remove monorepo from test data
  - [ ] Update `ArtifactIntrospector.test.ts` — remove monorepo from test fixtures
  - [ ] Success: `pnpm --filter @context-forge/core test` passes with 0 failures

- [ ] **Commit**: `refactor(core): remove monorepo fields from types, services, and tests`

---

## Task 4: Remove Monorepo from MCP Server

**Effort: 1/5**

- [ ] **Update `packages/mcp-server/src/tools/projectTools.ts`**
  - [ ] Remove `isMonorepo` from `ProjectSummary` interface and `toSummary()` function
  - [ ] Remove `isMonorepo` and `isMonorepoEnabled` Zod fields from `project_update` input schema
  - [ ] Remove `monorepoNote` from `customData` Zod schema in `project_update`
  - [ ] Success: no monorepo references in projectTools.ts

- [ ] **Update MCP server tests**
  - [ ] Update `projectTools.test.ts` — remove monorepo fields from test fixtures and assertions
  - [ ] Update `stateTools.test.ts` — remove monorepo from test data
  - [ ] Update `contextTools.test.ts` — remove monorepo from test data
  - [ ] Update `workflowTools.test.ts` — remove monorepo from test data
  - [ ] Update `introspectionTools.test.ts` — remove monorepo from test data
  - [ ] Update test fixture `integration-project/projects.json` — remove monorepo fields
  - [ ] Success: `pnpm --filter @context-forge/mcp test` passes with 0 failures

- [ ] **Commit**: `refactor(mcp): remove monorepo fields from schemas and tests`

---

## Task 5: Add MCP `server_version` Tool + Tests

**Effort: 1/5**

- [ ] **Create `packages/mcp-server/src/tools/versionTool.ts`**
  - [ ] Export `registerVersionTool(server, name, version)` function
  - [ ] Register `server_version` tool with no input parameters
  - [ ] Return `{ name, version }` as JSON text content
  - [ ] Annotations: `readOnlyHint: true`, `openWorldHint: false`
  - [ ] Success: tool registered, returns correct shape

- [ ] **Register in `packages/mcp-server/src/index.ts`**
  - [ ] Import `registerVersionTool`
  - [ ] Call `registerVersionTool(server, SERVER_NAME, SERVER_VERSION)` alongside existing registrations
  - [ ] Success: server_version tool available when MCP server starts

- [ ] **Add test for `server_version` tool**
  - [ ] Test that tool returns JSON with `name` and `version` fields
  - [ ] Test that returned version matches package.json
  - [ ] Success: test passes via `pnpm --filter @context-forge/mcp test`

- [ ] **Commit**: `feat(mcp): add server_version tool`

---

## Task 6: Remove Monorepo from CLI

**Effort: 1/5**

- [ ] **Update `packages/cli/src/commands/project.ts`**
  - [ ] Remove `'isMonorepo'` and `'isMonorepoEnabled'` from `UPDATABLE_FIELDS`
  - [ ] Remove `['Monorepo', project.isMonorepo ? 'true' : '']` from `project get` display fields
  - [ ] Success: no monorepo references in project.ts

- [ ] **Update CLI tests**
  - [ ] Update `commands/project.test.ts` — remove monorepo from test fixtures and assertions
  - [ ] Update `integration/build.integration.test.ts` — remove monorepo from test data
  - [ ] Success: `pnpm --filter @context-forge/cli test` passes with 0 failures

- [ ] **Commit**: `refactor(cli): remove monorepo fields from project command and tests`

---

## Task 7: Add `cf init` Command + Tests

**Effort: 2/5**

- [ ] **Create `packages/cli/src/commands/init.ts`**
  - [ ] Export `registerInitCommand(program: Command)` function
  - [ ] Register top-level `cf init` command (not under `cf project`)
  - [ ] Accept `--name <name>` option to override derived project name
  - [ ] Resolve CWD as absolute path via `process.cwd()`
  - [ ] Check if a project with matching `projectPath` already exists (use `store.getAll()`)
  - [ ] If exists: print warning message and exit (no error code)
  - [ ] Derive name from `path.basename(cwd)`, use `--name` override if provided
  - [ ] Create project via `store.create()` with: `name`, `projectPath: cwd`, `template: 'default'`, `fileSlice: ''`, `instruction: 'implementation'`
  - [ ] Print success message: `"Initialized project '{name}' at {path}"`
  - [ ] Success: command creates a project entry that `findProjectByCwd` can resolve

- [ ] **Register in `packages/cli/src/index.ts`**
  - [ ] Import `registerInitCommand`
  - [ ] Call `registerInitCommand(program)` alongside existing registrations
  - [ ] Success: `cf init --help` works

- [ ] **Add tests for `cf init`**
  - [ ] Mock `FileProjectStore` (getAll, create)
  - [ ] Test: success path — creates project with correct name and path
  - [ ] Test: `--name` override — uses provided name instead of directory basename
  - [ ] Test: already-registered — warns without creating duplicate
  - [ ] Success: all tests pass via `pnpm --filter @context-forge/cli test`

- [ ] **Commit**: `feat(cli): add cf init command`

---

## Task 8: Add `default_project` Deprecation Warning + Tests

**Effort: 1/5**

- [ ] **Update `packages/cli/src/utils/project.ts`**
  - [ ] After step 3 resolves via `default_project` (before returning `{ id, source: 'default' }`), emit a warning to stderr
  - [ ] Warning text: `"Warning: Resolved via default_project config. Consider using --project or running from within a registered project directory."`
  - [ ] Include guidance lines for `cf init` and `cf project list`
  - [ ] Use `console.error()` so it goes to stderr (doesn't interfere with piped stdout)
  - [ ] Success: warning appears on stderr when default_project is the resolution source

- [ ] **Add test for deprecation warning**
  - [ ] Mock ConfigManager to return a default_project value
  - [ ] Mock store with matching project
  - [ ] Mock CWD to not match any project (so CWD step doesn't resolve first)
  - [ ] Verify stderr output contains "Warning" and "default_project"
  - [ ] Verify resolution still succeeds (returns correct project ID)
  - [ ] Success: test passes

- [ ] **Commit**: `feat(cli): add deprecation warning for default_project config`

---

## Task 9: Remove Monorepo from Electron

**Effort: 2/5**

- [ ] **Update `packages/electron/src/components/ContextBuilderApp.tsx`**
  - [ ] Remove `isMonorepo: false` from default state objects
  - [ ] Remove `isMonorepo` and `isMonorepoEnabled` from project-to-form data mapping
  - [ ] Success: no monorepo references in ContextBuilderApp

- [ ] **Update `packages/electron/src/components/forms/ProjectConfigForm.tsx`**
  - [ ] Remove `isMonorepo` and `isMonorepoEnabled` from form state initialization
  - [ ] Remove monorepo checkbox UI
  - [ ] Remove conditional template/note fields that depend on `formData.isMonorepo`
  - [ ] Enable template field unconditionally (remove `disabled` and related styling)
  - [ ] Remove `isMonorepo` from state-reset comparison
  - [ ] Success: template field always visible and enabled, no monorepo UI

- [ ] **Update `packages/electron/src/components/settings/SettingsDialog.tsx`**
  - [ ] Remove `handleMonorepoModeChange` function
  - [ ] Remove the monorepo features checkbox block
  - [ ] Success: no monorepo references in SettingsDialog

- [ ] **Update Electron IPC layer**
  - [ ] `preload/preload.ts` — remove `isMonorepo?: boolean` from `listDirectory` call
  - [ ] `globals.d.ts` — remove `isMonorepo?: boolean` from `listDirectory` type
  - [ ] `main/ipc/projectPathHandlers.ts` — remove `isMonorepo` from handler args and `listDirectory` call
  - [ ] Success: IPC layer has no monorepo references

- [ ] **Update Electron tests**
  - [ ] Update `tests/unit/services/context/ContextIntegrator.test.ts`
  - [ ] Update `tests/unit/services/context/TemplateProcessor.test.ts`
  - [ ] Update `tests/unit/main/ipc/projectHandlers.test.ts`
  - [ ] Update `tests/unit/services/context/ContextGenerator.test.ts`
  - [ ] Update `tests/integration/components/forms/ProjectConfigForm.integration.test.ts`
  - [ ] Update `tests/unit/main/ipc/contextHandlers.test.ts`
  - [ ] Update `tests/unit/main/services/project/ProjectPathService.test.ts`
  - [ ] Success: `pnpm --filter @context-forge/electron test` passes with 0 failures

- [ ] **Commit**: `refactor(electron): remove monorepo fields from UI, IPC, and tests`

---

## Task 10: Full Build & Test Verification

**Effort: 1/5**

- [ ] **Run full build from project root**
  - [ ] `pnpm build` — all packages compile without errors
  - [ ] Success: exit code 0, no type errors

- [ ] **Run full test suite from project root**
  - [ ] `pnpm test` — all tests pass across all packages
  - [ ] Success: exit code 0, no test failures

- [ ] **Verify no stale monorepo references remain**
  - [ ] Grep for `isMonorepo`, `isMonorepoEnabled`, `monorepoNote`, `buildMonorepoSection`, `monorepo-statement` across `packages/` source (excluding `node_modules`)
  - [ ] Success: no matches in source files (test fixtures may have migration test references)

- [ ] **Commit any final fixes if needed, then final commit/tag**
