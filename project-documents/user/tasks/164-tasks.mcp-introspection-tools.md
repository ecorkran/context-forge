---
slice: mcp-introspection-tools
project: context-forge
lld: user/slices/164-slice.mcp-introspection-tools.md
dependencies: [163-artifact-introspection-engine, 162-config-system, 161-schema-standardization]
projectState: Slice 163 complete — ArtifactIntrospector, 6 parsers, types, and project_get enrichment all working. 509 tests pass. On branch 164-slice.mcp-instrospection-tools.
status: not-started
dateCreated: 20260301
dateUpdated: 20260301
---

## Context Summary

- Working on slice 164: MCP Introspection Tools
- Slice 163 delivered `ArtifactIntrospector` with `parseSlicePlan`, `parseTaskFile`, `parseFrontmatter`, `parseFutureWork`, `detectDocuments` — all in `packages/core/src/introspection/`
- This slice wraps those parsers as MCP tools and adds a `ProjectModelBuilder` that replicates parse.py's `build_model()` for full project structure aggregation
- Reference specification: `parse.py` in context-visualizer (see LLD for details)
- Next planned slice: 165 (Workflow Navigator)

---

## Tasks

### Phase 1: Types and Fixture Expansion

- [ ] **Task 1: Add ProjectModel types to core introspection types**
  - [ ] Add types to `packages/core/src/introspection/types.ts`: `DocSummary`, `FoundationEntry`, `ArchEntry`, `SliceModelEntry`, `TaskModelEntry`, `Initiative`, `FutureSliceEntry`, `MaintenanceEntry`, `ProjectModel`
  - [ ] Types must match parse.py's `build_model()` output shape (see LLD "Output Shape: Match parse.py" section)
  - [ ] Index values are zero-padded strings (e.g., `"163"`)
  - [ ] Export new types from `packages/core/src/introspection/index.ts` (browser-safe barrel)
  - [ ] Success: types compile, existing tests still pass

- [ ] **Task 2: Expand fixture project for full model building**
  - [ ] Add minimal foundation doc: `packages/core/tests/fixtures/introspection/project/project-documents/user/project-guides/002-spec.test-project.md` (with frontmatter: docType, status, dateCreated)
  - [ ] Add minimal HLD doc: `packages/core/tests/fixtures/introspection/project/project-documents/user/architecture/050-arch.hld-test-project.md` (with frontmatter)
  - [ ] Add minimal maintenance task: `packages/core/tests/fixtures/introspection/project/project-documents/user/maintenance/900-tasks.maintenance-ongoing.md` (with 3 checkbox items)
  - [ ] Add `DEVLOG.md` at fixture project root: `packages/core/tests/fixtures/introspection/project/DEVLOG.md` (minimal content)
  - [ ] Success: fixture files exist with valid frontmatter, no test regressions

<!-- Commit checkpoint: types + fixtures -->

### Phase 2: ProjectModelBuilder Implementation

- [ ] **Task 3: Implement scanDirectory function**
  - [ ] Create `packages/core/src/introspection/ProjectModelBuilder.ts`
  - [ ] Add module-private `INDEXED_RE` and `GUIDE_RE` regex constants matching parse.py's patterns
  - [ ] Add `DocEntry` interface (module-private) with fields: `index`, `docType`, `name`, `filename`, `filepath`, `status`, `dateCreated?`, `dateUpdated?`, `project?`, `parent?`, `description?`, `taskItems`, `splitNum?`
  - [ ] Implement `scanDirectory(userDir: string): Promise<DocEntry[]>` — walks subdirectories (`architecture`, `slices`, `tasks`, `features`, `project-guides`, `reviews`, `analysis`, `maintenance`), matches filenames against regexes, extracts frontmatter, parses task items for task docs
  - [ ] Use existing parsers: `parseFrontmatter()` for metadata, `parseTaskItems()` for checkbox extraction, `normalizeStatus()` for status
  - [ ] Success: function correctly scans the fixture project and returns DocEntry array with expected metadata

- [ ] **Task 4: Implement buildModel function**
  - [ ] Add `buildModel(projectPath: string, options?: { name?: string; description?: string }): Promise<ProjectModel>` as the public API
  - [ ] Locate `project-documents/user/` from projectPath (matching parse.py's `find_user_dir` logic)
  - [ ] Foundation band (000-009): collect concept, spec, hld, slices docs
  - [ ] Project architecture band (050-099): collect arch and hld docs
  - [ ] Initiative bands (100-799): identify base indices from arch/slices docs, group actual slices into bands, merge task docs into slices, fill planned-but-unwritten slices from slice plan, extract future work per initiative
  - [ ] Operational band (900+): quality (reviews), investigation (analysis), maintenance (tasks with counts)
  - [ ] DEVLOG detection: check `DEVLOG.md` exists at project root
  - [ ] Project name inference: from frontmatter `project` field, falling back to directory name
  - [ ] Export `buildModel` from the module
  - [ ] Success: `buildModel()` on the fixture project returns a well-formed `ProjectModel`

- [ ] **Task 5: Export ProjectModelBuilder from core**
  - [ ] Add `export { buildModel } from './introspection/ProjectModelBuilder.js'` to `packages/core/src/node.ts`
  - [ ] Success: `buildModel` is importable from `@context-forge/core/node`, build succeeds

- [ ] **Task 6: ProjectModelBuilder unit tests**
  - [ ] Create `packages/core/tests/introspection/ProjectModelBuilder.test.ts`
  - [ ] Test `scanDirectory`: returns correct number of docs from fixture, each DocEntry has expected fields (index, docType, name, status), task docs have taskItems populated
  - [ ] Test `buildModel` foundation band: fixture's spec doc (002) appears in `foundation[]` with correct type and index
  - [ ] Test `buildModel` project architecture band: fixture's HLD (050) appears in `projectArchitecture[]`
  - [ ] Test `buildModel` initiative band: initiative "100" exists with arch doc, slice plan, actual slice with tasks, planned slices from plan
  - [ ] Test `buildModel` task merging: split task files (100-tasks.test-feature.md + 100-tasks.test-feature-1.md) merge into single task entry with correct counts
  - [ ] Test `buildModel` operational band: maintenance task (900) appears in `maintenance[]` with task counts
  - [ ] Test `buildModel` devlog: `devlog` field is `true` for fixture project
  - [ ] Test `buildModel` empty project: returns valid ProjectModel with empty arrays when `project-documents/user/` doesn't exist
  - [ ] Test `buildModel` name override: `options.name` overrides inferred project name
  - [ ] Success: all tests pass, `pnpm -r build` succeeds

<!-- Commit checkpoint: ProjectModelBuilder + tests -->

### Phase 3: Path Resolution Helper

- [ ] **Task 7: Create resolveFilePath helper for introspection tools**
  - [ ] Add `resolveIntrospectionPath` function in `packages/mcp-server/src/tools/introspectionTools.ts` (module-private helper)
  - [ ] Logic: if `filePath` is provided (absolute path), use it directly. Otherwise, resolve `projectId` via `resolveProjectId()`, look up project via `FileProjectStore.getById()`, join `project.projectPath` + `path`. Return resolved absolute path or throw descriptive error.
  - [ ] Handle edge cases: no filePath and no projectId+path → error, project not found → error with "use project_list" guidance, project has no projectPath → error
  - [ ] Success: helper correctly resolves both input patterns

### Phase 4: Granular MCP Tools

- [ ] **Task 8: Register `introspection_slice_plan` tool**
  - [ ] In `introspectionTools.ts`, create `registerIntrospectionTools(server: McpServer)` function
  - [ ] Register `introspection_slice_plan` with zod input schema (`projectId?`, `path?`, `filePath?`), tool description documenting the response shape (per LLD API contract), and `readOnlyHint: true` annotation
  - [ ] Handler: resolve path via helper → call `ArtifactIntrospector.parseSlicePlan()` → return `jsonResult()`
  - [ ] Reuse `errorResult`/`jsonResult` helpers (import from shared location or inline — match existing pattern)
  - [ ] Success: tool registered, handles valid input and error cases

- [ ] **Task 9: Register `introspection_tasks` tool**
  - [ ] Register with input schema (`projectId?`, `path?`, `filePath?`)
  - [ ] Handler: resolve path → `ArtifactIntrospector.parseTaskFile()` → `jsonResult()`
  - [ ] Success: tool registered, handles valid input and error cases

- [ ] **Task 10: Register `introspection_frontmatter` tool**
  - [ ] Register with input schema (`projectId?`, `path?`, `filePath?`)
  - [ ] Handler: resolve path → `ArtifactIntrospector.parseFrontmatter()` → `jsonResult()`
  - [ ] Success: tool registered, handles valid input and error cases

- [ ] **Task 11: Register `introspection_documents` tool**
  - [ ] Register with input schema (`projectId?`, `projectPath?`, `sliceIndex` required)
  - [ ] Note: this tool uses `projectPath` (absolute directory) instead of `filePath` — it needs a project root, not a single file
  - [ ] Handler: resolve projectPath from `projectId` or use provided `projectPath` → `ArtifactIntrospector.detectDocuments()` → `jsonResult()`
  - [ ] Success: tool registered, handles valid input and error cases

- [ ] **Task 12: Register `introspection_future_work` tool**
  - [ ] Register with input schema (`projectId?`, `path?`, `filePath?`, `nextIndex?`)
  - [ ] Handler: resolve path → `ArtifactIntrospector.parseFutureWork(path, nextIndex)` → `jsonResult()`
  - [ ] Success: tool registered, handles valid input and error cases

- [ ] **Task 13: Granular MCP tool tests**
  - [ ] Create `packages/mcp-server/tests/introspectionTools.test.ts`
  - [ ] Mock `@context-forge/core/node` (ArtifactIntrospector, FileProjectStore, buildModel) — follow pattern from `projectTools.test.ts`
  - [ ] Test `introspection_slice_plan`: valid filePath returns SlicePlanResult; missing path returns error
  - [ ] Test `introspection_tasks`: valid filePath returns TaskFileResult; projectId+path resolution works
  - [ ] Test `introspection_frontmatter`: valid filePath returns FrontmatterResult
  - [ ] Test `introspection_documents`: valid projectId+sliceIndex returns DocumentDetectionResult; missing sliceIndex returns error
  - [ ] Test `introspection_future_work`: valid filePath returns FutureWorkResult; nextIndex parameter is passed through
  - [ ] Success: all tests pass, `pnpm -r build` succeeds

<!-- Commit checkpoint: granular tools + tests -->

### Phase 5: Aggregate Tool and Wiring

- [ ] **Task 14: Register `project_structure` tool**
  - [ ] Register `project_structure` in `introspectionTools.ts` with input schema (`projectId?`, `name?`, `description?`)
  - [ ] Handler: resolve projectId → get project.projectPath → call `buildModel(projectPath, { name, description })` → `jsonResult()`
  - [ ] Tool description documents the full ProjectModel response shape (see LLD API contract)
  - [ ] `readOnlyHint: true` annotation
  - [ ] Success: tool registered, returns valid ProjectModel for known project

- [ ] **Task 15: `project_structure` MCP tests**
  - [ ] Test: valid projectId returns ProjectModel JSON with expected top-level fields (name, foundation, initiatives, etc.)
  - [ ] Test: non-existent projectId returns isError with helpful message
  - [ ] Test: name/description overrides are passed through to buildModel
  - [ ] Success: all tests pass

- [ ] **Task 16: Wire introspection tools into MCP server**
  - [ ] Import `registerIntrospectionTools` in `packages/mcp-server/src/index.ts`
  - [ ] Call `registerIntrospectionTools(server)` alongside existing registrations
  - [ ] Success: server starts, all tools appear in `tools/list`

- [ ] **Task 17: Update `project_get` description**
  - [ ] In `packages/mcp-server/src/tools/projectTools.ts`, update the `project_get` tool description to document the `introspection` summary field (see LLD "project_get Description Update" section)
  - [ ] Success: updated description visible in tool metadata

<!-- Commit checkpoint: aggregate tool + wiring + project_get update -->

### Phase 6: Final Verification

- [ ] **Task 18: Full build and test verification**
  - [ ] Run `pnpm -r build` — all packages build clean
  - [ ] Run `pnpm -r test` — all tests pass (509+ existing + new tests)
  - [ ] Verify tool count: lifecycle test or manual check shows correct total tool count (was 11, now 17 with 6 new introspection tools)
  - [ ] Update lifecycle test tool count assertion if one exists
  - [ ] Update DEVLOG.md with Phase 7 completion entry (commits and summary)
  - [ ] Update slice status in `164-slice.mcp-introspection-tools.md` frontmatter to `complete`
  - [ ] Check off slice 164 in `160-slices.project-workflow-system.md`
  - [ ] Success: clean build, all tests pass, documentation updated
