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

- [x] **1.1 Update `ProjectData` interface in `packages/core/src/types/project.ts`**
  - [x] Rename `slice` → `fileSlice`, `taskFile` → `fileTasks`, `projectDate` → `dateProject`
  - [x] Add new optional fields: `fileHLD?: string`, `fileArch?: string`, `fileSlicePlan?: string`, `fileSpec?: string`
  - [x] Update `CreateProjectData` — adjust the `Omit` list and optional field declarations to use new names
  - [x] Update `UpdateProjectData` — adjust the `Pick` list to use new names, add new artifact fields to the pick list
  - [x] SC: No TypeScript errors in `project.ts` itself (downstream files will break — that is expected at this point)

- [x] **1.2 Update `ContextData` and `EnhancedContextData` in `packages/core/src/types/context.ts`**
  - [x] Rename `slice` → `fileSlice`, `taskFile` → `fileTasks`, `projectDate` → `dateProject` in `ContextData`
  - [x] `EnhancedContextData` extends `ContextData` — verify no overrides of renamed fields
  - [x] SC: No TypeScript errors in `context.ts` itself

### 2. Storage Layer

- [x] **2.1 Update `FileProjectStore` in `packages/core/src/storage/FileProjectStore.ts`**
  - [x] Update `migrateProjectFields()` — add old→new fallback logic per slice design (prefer new name, fall back to old name for each renamed field; add new artifact fields defaulting to `undefined`)
  - [x] Update `create()` method — use new field names (`fileSlice`, `fileTasks`, `dateProject`) when constructing `ProjectData`
  - [x] SC: `migrateProjectFields()` handles three scenarios: old-schema-only input, new-schema-only input, mixed input (new takes precedence)
  - [x] SC: `create()` uses exclusively new field names

- [x] **2.2 Unit tests for `FileProjectStore` migration**
  - [x] Update existing tests in `packages/core/tests/storage/FileProjectStore.test.ts` — change all fixture data and assertions to use new field names
  - [x] Add test: old-schema project (only `slice`, `taskFile`, `projectDate`) loads correctly with new field names
  - [x] Add test: new-schema project (only `fileSlice`, `fileTasks`, `dateProject`) loads correctly (idempotent)
  - [x] Add test: mixed-schema project (both old and new names present) — new names take precedence
  - [x] Add test: new artifact fields (`fileHLD`, `fileArch`, `fileSlicePlan`, `fileSpec`) are `undefined` when absent, preserved when present
  - [x] SC: All `FileProjectStore` tests pass
  - [x] Commit: `feat(core): update ProjectData schema and FileProjectStore migration`

### 3. Context Pipeline — Services

- [x] **3.1 Update `TemplateProcessor` in `packages/core/src/services/TemplateProcessor.ts`**
  - [x] Update `createEnhancedData()` — change `data.slice` → `data.fileSlice`, `data.taskFile` → `data.fileTasks`, `data.projectDate` → `data.dateProject`
  - [x] Keep slice parsing logic (`sliceindex`/`slicename` extraction) working against `data.fileSlice`
  - [x] Update kebab-case aliases: `task-file` should alias `fileTasks`, `project-date` should alias `dateProject`
  - [x] SC: Template variables `{{fileSlice}}`, `{{fileTasks}}`, `{{dateProject}}` resolve correctly
  - [x] SC: Slice parsing still extracts `sliceindex` and `slicename` from `fileSlice`

- [x] **3.2 Unit tests for `TemplateProcessor`**
  - [x] Update `packages/core/tests/services/TemplateProcessor.test.ts` — change fixture data and assertions to new field names
  - [x] Verify `{{fileSlice}}` substitution, `{{fileTasks}}` substitution, `{{dateProject}}` substitution
  - [x] Verify slice parsing from `fileSlice` value
  - [x] Verify kebab-case aliases still work
  - [x] SC: All `TemplateProcessor` tests pass

- [x] **3.3 Update `ContextIntegrator` in `packages/core/src/services/ContextIntegrator.ts`**
  - [x] Update `mapProjectToEnhancedContext()` — map `project.fileSlice`, `project.fileTasks`, `project.dateProject`
  - [x] Update `mapProjectToContext()` (legacy) — same renames
  - [x] Update `getErrorContext()` — change `project.slice` → `project.fileSlice`
  - [x] Update `validateProject()` — validate `project.fileSlice` instead of `project.slice`
  - [x] Update `DEFAULT_TEMPLATE` constant — change `{{slice}}` → `{{fileSlice}}`
  - [x] SC: Both mapping methods produce `EnhancedContextData`/`ContextData` with new field names

- [x] **3.4 Unit tests for `ContextIntegrator`**
  - [x] Update `packages/core/tests/services/ContextIntegrator.test.ts` — change fixture data and assertions to new field names
  - [x] Verify `mapProjectToEnhancedContext()` output uses new names
  - [x] Verify `validateProject()` checks `fileSlice` (not `slice`)
  - [x] SC: All `ContextIntegrator` tests pass

- [x] **3.5 Update `ContextTemplateEngine` in `packages/core/src/services/ContextTemplateEngine.ts`**
  - [x] Update `validateInputData()` — change required field `'slice'` → `'fileSlice'` in the validation array
  - [x] Update `getErrorContext()` — change `data.slice` → `data.fileSlice`
  - [x] SC: Validation checks for `fileSlice` not `slice`

- [x] **3.6 Update `SectionBuilder` in `packages/core/src/services/SectionBuilder.ts`**
  - [x] Search for any direct references to `data.slice`, `data.taskFile`, `data.projectDate` and update to new names
  - [x] SC: No references to old field names remain in `SectionBuilder.ts`

- [x] **3.7 Unit tests for `ContextTemplateEngine` and `SectionBuilder`**
  - [x] Update `packages/core/tests/services/ContextTemplateEngine.test.ts` — change fixture data and assertions to new field names
  - [x] Update `packages/core/tests/services/SectionBuilder.test.ts` — change fixture data and assertions to new field names
  - [x] SC: All `ContextTemplateEngine` and `SectionBuilder` tests pass

- [x] **3.8 Update test helpers in `packages/core/tests/helpers/testData.ts`**
  - [x] Update `createTestContextData()` — use `fileSlice`, `fileTasks`, `dateProject`
  - [x] Update `createTestEnhancedContextData()` — same renames
  - [x] Update `createTestProjectData()` — use new field names plus add artifact fields (default `undefined`)
  - [x] SC: All helper functions produce data with new field names
  - [x] Commit: `refactor(core): rename fields across context pipeline and tests`

### 4. MCP Server Tools

- [x] **4.1 Update `projectTools.ts` in `packages/mcp-server/src/tools/projectTools.ts`**
  - [x] Update `ProjectSummary` interface — rename `slice` → `fileSlice`
  - [x] Update `toSummary()` — map `project.fileSlice`
  - [x] Update `project_update` Zod input schema:
    - [x] Remove `slice`, `taskFile`, `projectDate` parameters
    - [x] Add `fileSlice`, `fileTasks`, `dateProject` parameters
    - [x] Add `fileHLD`, `fileArch`, `fileSlicePlan`, `fileSpec` parameters
  - [x] Update tool descriptions to reflect new parameter names
  - [x] SC: `project_update` accepts new field names only; `project_list` returns `fileSlice` in summary

- [x] **4.2 Unit tests for MCP project tools**
  - [x] Update `packages/mcp-server/tests/projectTools.test.ts` — change mock data and assertions to new field names
  - [x] Verify `project_list` returns `fileSlice` (not `slice`) in summary
  - [x] Verify `project_update` accepts `fileSlice`, `fileTasks`, `dateProject`, and artifact fields
  - [x] Verify `project_get` returns full project with new field names
  - [x] SC: All `projectTools` tests pass

- [x] **4.3 Update remaining MCP test files**
  - [x] Update `packages/mcp-server/tests/contextTools.test.ts` — change mock project data to new field names
  - [x] Update `packages/mcp-server/tests/stateTools.test.ts` — change mock project data to new field names
  - [x] SC: All MCP unit tests pass
  - [x] Commit: `feat(mcp-server): update MCP tool schemas to new field names`

### 5. Prompt Templates and Fixtures

- [x] **5.1 Update prompt template files**
  - [x] Update `packages/core/assets/prompt.ai-project.system.md` — change `{slice}` → `{fileSlice}`, `{task-file}` → `{fileTasks}` (note: single-brace variables use the TemplateProcessor alias system; verify which references are template variables vs. literal text meant for human reading)
  - [x] Update `packages/core/assets/default-statements.md` (if it exists) and `packages/electron/default-statements.md` — change `{{slice}}` → `{{fileSlice}}`
  - [x] SC: Template variables in prompt files match new field names
  - [x] SC: Literal/instructional references to "slice" (e.g., "the current slice is...") remain readable — only template variable syntax changes

- [x] **5.2 Update test fixture files**
  - [x] Update `packages/core/tests/fixtures/test-project/default-statements.md` — `{{slice}}` → `{{fileSlice}}`
  - [x] Update `packages/core/tests/fixtures/test-project/project-documents/ai-project-guide/project-guides/prompt.ai-project.system.md` — `{{slice}}` → `{{fileSlice}}`
  - [x] Update `packages/mcp-server/tests/fixtures/integration-project/integration-project/default-statements.md` — same
  - [x] Update `packages/mcp-server/tests/fixtures/integration-project/integration-project/project-documents/.../prompt.ai-project.system.md` — same
  - [x] Update `packages/mcp-server/tests/fixtures/integration-project/projects.json` — rename `slice`→`fileSlice`, `taskFile`→`fileTasks`, `projectDate`→`dateProject`
  - [x] SC: All fixture files use new field names consistently

- [x] **5.3 Update MCP integration test helpers and tests**
  - [x] Update `packages/mcp-server/tests/helpers/integrationSetup.ts` — change any field name references
  - [x] Update `packages/mcp-server/tests/integration/mcpIntegration.test.ts` — change fixture constants and assertions to new field names
  - [x] SC: All integration tests pass
  - [x] Commit: `refactor: update prompt templates and test fixtures to new field names`

### 6. Core Integration Test and Pipeline Verification

- [x] **6.1 Update core pipeline integration test**
  - [x] Update `packages/core/tests/pipeline-integration.test.ts` — change project data and assertions to new field names
  - [x] SC: Pipeline integration test passes end-to-end

- [x] **6.2 Update `CoreServiceFactory` test**
  - [x] Update `packages/core/tests/services/CoreServiceFactory.test.ts` — change project data to new field names
  - [x] SC: Factory test passes

- [x] **6.3 Update `packages/core/README.md`**
  - [x] Update the template variable reference from `{{slice}}` to `{{fileSlice}}`
  - [x] SC: README reflects new variable names
  - [x] Commit: `test: update integration tests and docs for schema standardization`

### 7. Final Verification

- [x] **7.1 Full build and test pass**
  - [x] Run `npm run build` from workspace root — no TypeScript errors
  - [x] Run `npm test` from workspace root — all tests pass
  - [x] Grep codebase for old field names in source code (exclude `migrateProjectFields` and DEVLOG/slice docs) — no remaining references
  - [x] SC: Build succeeds with zero errors
  - [x] SC: All tests pass (unit + integration)
  - [x] SC: No stale references to old field names in source or test code

- [x] **7.2 Manual migration verification**
  - [x] Create a temporary `projects.json` with old-schema data, load via `FileProjectStore.getAll()`, verify new field names in output
  - [x] Update a project, re-read, verify JSON on disk uses new field names
  - [x] Re-read same file — verify idempotent (no changes on second read)
  - [x] SC: Round-trip migration works correctly
  - [x] Commit: `feat: complete slice 161 — project schema standardization`
