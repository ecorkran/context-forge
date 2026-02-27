---
slice: project-schema-standardization
project: context-forge
lld: user/slices/161-slice.project-schema-standardization.md
dependencies: []
projectState: 140-band complete (storage, MCP tools, context pipeline all functional). Beginning 160-band initiative.
dateCreated: 20260226
dateUpdated: 20260226
---

## Context Summary
- Working on slice 161: Project Schema Standardization
- Foundation slice for the 160-band (Project Workflow System) initiative
- Renames 3 fields (`slice`→`fileSlice`, `taskFile`→`fileTasks`, `projectDate`→`dateProject`) and adds 4 new artifact reference fields
- All changes are mechanical renames + migration logic; no new architectural patterns
- Consumers span both packages: `@context-forge/core` (types, storage, services) and `@context-forge/mcp-server` (tools)
- Next planned slice: 162 (Config System)
- Effort: 3/5

---

## Tasks

### 1. Core Type Definitions

- [ ] **1.1 Update `ProjectData` interface in `packages/core/src/types/project.ts`**
  - [ ] Rename `slice` → `fileSlice`, `taskFile` → `fileTasks`, `projectDate` → `dateProject`
  - [ ] Add new optional fields: `fileHLD?: string`, `fileArch?: string`, `fileSlicePlan?: string`, `fileSpec?: string`
  - [ ] Update `CreateProjectData` — adjust the `Omit` list and optional field declarations to use new names
  - [ ] Update `UpdateProjectData` — adjust the `Pick` list to use new names, add new artifact fields to the pick list
  - [ ] SC: No TypeScript errors in `project.ts` itself (downstream files will break — that is expected at this point)

- [ ] **1.2 Update `ContextData` and `EnhancedContextData` in `packages/core/src/types/context.ts`**
  - [ ] Rename `slice` → `fileSlice`, `taskFile` → `fileTasks`, `projectDate` → `dateProject` in `ContextData`
  - [ ] `EnhancedContextData` extends `ContextData` — verify no overrides of renamed fields
  - [ ] SC: No TypeScript errors in `context.ts` itself

### 2. Storage Layer

- [ ] **2.1 Update `FileProjectStore` in `packages/core/src/storage/FileProjectStore.ts`**
  - [ ] Update `migrateProjectFields()` — add old→new fallback logic per slice design (prefer new name, fall back to old name for each renamed field; add new artifact fields defaulting to `undefined`)
  - [ ] Update `create()` method — use new field names (`fileSlice`, `fileTasks`, `dateProject`) when constructing `ProjectData`
  - [ ] SC: `migrateProjectFields()` handles three scenarios: old-schema-only input, new-schema-only input, mixed input (new takes precedence)
  - [ ] SC: `create()` uses exclusively new field names

- [ ] **2.2 Unit tests for `FileProjectStore` migration**
  - [ ] Update existing tests in `packages/core/tests/storage/FileProjectStore.test.ts` — change all fixture data and assertions to use new field names
  - [ ] Add test: old-schema project (only `slice`, `taskFile`, `projectDate`) loads correctly with new field names
  - [ ] Add test: new-schema project (only `fileSlice`, `fileTasks`, `dateProject`) loads correctly (idempotent)
  - [ ] Add test: mixed-schema project (both old and new names present) — new names take precedence
  - [ ] Add test: new artifact fields (`fileHLD`, `fileArch`, `fileSlicePlan`, `fileSpec`) are `undefined` when absent, preserved when present
  - [ ] SC: All `FileProjectStore` tests pass
  - [ ] Commit: `feat(core): update ProjectData schema and FileProjectStore migration`

### 3. Context Pipeline — Services

- [ ] **3.1 Update `TemplateProcessor` in `packages/core/src/services/TemplateProcessor.ts`**
  - [ ] Update `createEnhancedData()` — change `data.slice` → `data.fileSlice`, `data.taskFile` → `data.fileTasks`, `data.projectDate` → `data.dateProject`
  - [ ] Keep slice parsing logic (`sliceindex`/`slicename` extraction) working against `data.fileSlice`
  - [ ] Update kebab-case aliases: `task-file` should alias `fileTasks`, `project-date` should alias `dateProject`
  - [ ] SC: Template variables `{{fileSlice}}`, `{{fileTasks}}`, `{{dateProject}}` resolve correctly
  - [ ] SC: Slice parsing still extracts `sliceindex` and `slicename` from `fileSlice`

- [ ] **3.2 Unit tests for `TemplateProcessor`**
  - [ ] Update `packages/core/tests/services/TemplateProcessor.test.ts` — change fixture data and assertions to new field names
  - [ ] Verify `{{fileSlice}}` substitution, `{{fileTasks}}` substitution, `{{dateProject}}` substitution
  - [ ] Verify slice parsing from `fileSlice` value
  - [ ] Verify kebab-case aliases still work
  - [ ] SC: All `TemplateProcessor` tests pass

- [ ] **3.3 Update `ContextIntegrator` in `packages/core/src/services/ContextIntegrator.ts`**
  - [ ] Update `mapProjectToEnhancedContext()` — map `project.fileSlice`, `project.fileTasks`, `project.dateProject`
  - [ ] Update `mapProjectToContext()` (legacy) — same renames
  - [ ] Update `getErrorContext()` — change `project.slice` → `project.fileSlice`
  - [ ] Update `validateProject()` — validate `project.fileSlice` instead of `project.slice`
  - [ ] Update `DEFAULT_TEMPLATE` constant — change `{{slice}}` → `{{fileSlice}}`
  - [ ] SC: Both mapping methods produce `EnhancedContextData`/`ContextData` with new field names

- [ ] **3.4 Unit tests for `ContextIntegrator`**
  - [ ] Update `packages/core/tests/services/ContextIntegrator.test.ts` — change fixture data and assertions to new field names
  - [ ] Verify `mapProjectToEnhancedContext()` output uses new names
  - [ ] Verify `validateProject()` checks `fileSlice` (not `slice`)
  - [ ] SC: All `ContextIntegrator` tests pass

- [ ] **3.5 Update `ContextTemplateEngine` in `packages/core/src/services/ContextTemplateEngine.ts`**
  - [ ] Update `validateInputData()` — change required field `'slice'` → `'fileSlice'` in the validation array
  - [ ] Update `getErrorContext()` — change `data.slice` → `data.fileSlice`
  - [ ] SC: Validation checks for `fileSlice` not `slice`

- [ ] **3.6 Update `SectionBuilder` in `packages/core/src/services/SectionBuilder.ts`**
  - [ ] Search for any direct references to `data.slice`, `data.taskFile`, `data.projectDate` and update to new names
  - [ ] SC: No references to old field names remain in `SectionBuilder.ts`

- [ ] **3.7 Unit tests for `ContextTemplateEngine` and `SectionBuilder`**
  - [ ] Update `packages/core/tests/services/ContextTemplateEngine.test.ts` — change fixture data and assertions to new field names
  - [ ] Update `packages/core/tests/services/SectionBuilder.test.ts` — change fixture data and assertions to new field names
  - [ ] SC: All `ContextTemplateEngine` and `SectionBuilder` tests pass

- [ ] **3.8 Update test helpers in `packages/core/tests/helpers/testData.ts`**
  - [ ] Update `createTestContextData()` — use `fileSlice`, `fileTasks`, `dateProject`
  - [ ] Update `createTestEnhancedContextData()` — same renames
  - [ ] Update `createTestProjectData()` — use new field names plus add artifact fields (default `undefined`)
  - [ ] SC: All helper functions produce data with new field names
  - [ ] Commit: `refactor(core): rename fields across context pipeline and tests`

### 4. MCP Server Tools

- [ ] **4.1 Update `projectTools.ts` in `packages/mcp-server/src/tools/projectTools.ts`**
  - [ ] Update `ProjectSummary` interface — rename `slice` → `fileSlice`
  - [ ] Update `toSummary()` — map `project.fileSlice`
  - [ ] Update `project_update` Zod input schema:
    - Remove `slice`, `taskFile`, `projectDate` parameters
    - Add `fileSlice`, `fileTasks`, `dateProject` parameters
    - Add `fileHLD`, `fileArch`, `fileSlicePlan`, `fileSpec` parameters
  - [ ] Update tool descriptions to reflect new parameter names
  - [ ] SC: `project_update` accepts new field names only; `project_list` returns `fileSlice` in summary

- [ ] **4.2 Unit tests for MCP project tools**
  - [ ] Update `packages/mcp-server/tests/projectTools.test.ts` — change mock data and assertions to new field names
  - [ ] Verify `project_list` returns `fileSlice` (not `slice`) in summary
  - [ ] Verify `project_update` accepts `fileSlice`, `fileTasks`, `dateProject`, and artifact fields
  - [ ] Verify `project_get` returns full project with new field names
  - [ ] SC: All `projectTools` tests pass

- [ ] **4.3 Update remaining MCP test files**
  - [ ] Update `packages/mcp-server/tests/contextTools.test.ts` — change mock project data to new field names
  - [ ] Update `packages/mcp-server/tests/stateTools.test.ts` — change mock project data to new field names
  - [ ] SC: All MCP unit tests pass
  - [ ] Commit: `feat(mcp-server): update MCP tool schemas to new field names`

### 5. Prompt Templates and Fixtures

- [ ] **5.1 Update prompt template files**
  - [ ] Update `packages/core/assets/prompt.ai-project.system.md` — change `{slice}` → `{fileSlice}`, `{task-file}` → `{fileTasks}` (note: single-brace variables use the TemplateProcessor alias system; verify which references are template variables vs. literal text meant for human reading)
  - [ ] Update `packages/core/assets/default-statements.md` (if it exists) and `packages/electron/default-statements.md` — change `{{slice}}` → `{{fileSlice}}`
  - [ ] SC: Template variables in prompt files match new field names
  - [ ] SC: Literal/instructional references to "slice" (e.g., "the current slice is...") remain readable — only template variable syntax changes

- [ ] **5.2 Update test fixture files**
  - [ ] Update `packages/core/tests/fixtures/test-project/default-statements.md` — `{{slice}}` → `{{fileSlice}}`
  - [ ] Update `packages/core/tests/fixtures/test-project/project-documents/ai-project-guide/project-guides/prompt.ai-project.system.md` — `{{slice}}` → `{{fileSlice}}`
  - [ ] Update `packages/mcp-server/tests/fixtures/integration-project/integration-project/default-statements.md` — same
  - [ ] Update `packages/mcp-server/tests/fixtures/integration-project/integration-project/project-documents/.../prompt.ai-project.system.md` — same
  - [ ] Update `packages/mcp-server/tests/fixtures/integration-project/projects.json` — rename `slice`→`fileSlice`, `taskFile`→`fileTasks`, `projectDate`→`dateProject`
  - [ ] SC: All fixture files use new field names consistently

- [ ] **5.3 Update MCP integration test helpers and tests**
  - [ ] Update `packages/mcp-server/tests/helpers/integrationSetup.ts` — change any field name references
  - [ ] Update `packages/mcp-server/tests/integration/mcpIntegration.test.ts` — change fixture constants and assertions to new field names
  - [ ] SC: All integration tests pass
  - [ ] Commit: `refactor: update prompt templates and test fixtures to new field names`

### 6. Core Integration Test and Pipeline Verification

- [ ] **6.1 Update core pipeline integration test**
  - [ ] Update `packages/core/tests/pipeline-integration.test.ts` — change project data and assertions to new field names
  - [ ] SC: Pipeline integration test passes end-to-end

- [ ] **6.2 Update `CoreServiceFactory` test**
  - [ ] Update `packages/core/tests/services/CoreServiceFactory.test.ts` — change project data to new field names
  - [ ] SC: Factory test passes

- [ ] **6.3 Update `packages/core/README.md`**
  - [ ] Update the template variable reference from `{{slice}}` to `{{fileSlice}}`
  - [ ] SC: README reflects new variable names
  - [ ] Commit: `test: update integration tests and docs for schema standardization`

### 7. Final Verification

- [ ] **7.1 Full build and test pass**
  - [ ] Run `npm run build` from workspace root — no TypeScript errors
  - [ ] Run `npm test` from workspace root — all tests pass
  - [ ] Grep codebase for old field names in source code (exclude `migrateProjectFields` and DEVLOG/slice docs) — no remaining references
  - [ ] SC: Build succeeds with zero errors
  - [ ] SC: All tests pass (unit + integration)
  - [ ] SC: No stale references to old field names in source or test code

- [ ] **7.2 Manual migration verification**
  - [ ] Create a temporary `projects.json` with old-schema data, load via `FileProjectStore.getAll()`, verify new field names in output
  - [ ] Update a project, re-read, verify JSON on disk uses new field names
  - [ ] Re-read same file — verify idempotent (no changes on second read)
  - [ ] SC: Round-trip migration works correctly
  - [ ] Commit: `feat: complete slice 161 — project schema standardization`
