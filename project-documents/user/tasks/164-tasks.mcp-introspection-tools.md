---
slice: mcp-introspection-tools
project: context-forge
lld: user/slices/164-slice.mcp-introspection-tools.md
dependencies: [163-artifact-introspection-engine, 162-config-system, 161-schema-standardization]
projectState: Slice 163 complete — ArtifactIntrospector, 6 parsers, types, and project_get enrichment all working. 509 tests pass. On branch 164-slice.mcp-instrospection-tools.
status: complete
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

- [x] **Task 1: Add ProjectModel types to core introspection types**
  - [x] Add types to `packages/core/src/introspection/types.ts`: `DocSummary`, `FoundationEntry`, `ArchEntry`, `SliceModelEntry`, `TaskModelEntry`, `Initiative`, `FutureSliceEntry`, `MaintenanceEntry`, `ProjectModel`
  - [x] Types must match parse.py's `build_model()` output shape (see LLD "Output Shape: Match parse.py" section)
  - [x] Index values are zero-padded strings (e.g., `"163"`)
  - [x] Export new types from `packages/core/src/introspection/index.ts` (browser-safe barrel)
  - [x] Success: types compile, existing tests still pass

- [x] **Task 2: Expand fixture project for full model building**
  - [x] Add minimal foundation doc: `packages/core/tests/fixtures/introspection/project/project-documents/user/project-guides/002-spec.test-project.md` (with frontmatter: docType, status, dateCreated)
  - [x] Add minimal HLD doc: `packages/core/tests/fixtures/introspection/project/project-documents/user/architecture/050-arch.hld-test-project.md` (with frontmatter)
  - [x] Add minimal maintenance task: `packages/core/tests/fixtures/introspection/project/project-documents/user/maintenance/900-tasks.maintenance-ongoing.md` (with 3 checkbox items)
  - [x] Add `DEVLOG.md` at fixture project root: `packages/core/tests/fixtures/introspection/project/DEVLOG.md` (minimal content)
  - [x] Success: fixture files exist with valid frontmatter, no test regressions

<!-- Commit checkpoint: types + fixtures -->

### Phase 2: ProjectModelBuilder Implementation

- [x] **Task 3: Implement scanDirectory function**
  - [x] Create `packages/core/src/introspection/ProjectModelBuilder.ts`
  - [x] Add module-private `INDEXED_RE` and `GUIDE_RE` regex constants matching parse.py's patterns
  - [x] Add `DocEntry` interface (module-private) with fields: `index`, `docType`, `name`, `filename`, `filepath`, `status`, `dateCreated?`, `dateUpdated?`, `project?`, `parent?`, `description?`, `taskItems`, `splitNum?`
  - [x] Implement `scanDirectory(userDir: string): Promise<DocEntry[]>` — walks subdirectories (`architecture`, `slices`, `tasks`, `features`, `project-guides`, `reviews`, `analysis`, `maintenance`), matches filenames against regexes, extracts frontmatter, parses task items for task docs
  - [x] Use existing parsers: `parseFrontmatter()` for metadata, `parseTaskItems()` for checkbox extraction, `normalizeStatus()` for status
  - [x] Success: function correctly scans the fixture project and returns DocEntry array with expected metadata

- [x] **Task 4: Implement buildModel function**
  - [x] Add `buildModel(projectPath: string, options?: { name?: string; description?: string }): Promise<ProjectModel>` as the public API
  - [x] Locate `project-documents/user/` from projectPath (matching parse.py's `find_user_dir` logic)
  - [x] Foundation band (000-009): collect concept, spec, hld, slices docs
  - [x] Project architecture band (050-099): collect arch and hld docs
  - [x] Initiative bands (100-799): identify base indices from arch/slices docs, group actual slices into bands, merge task docs into slices, fill planned-but-unwritten slices from slice plan, extract future work per initiative
  - [x] Operational band (900+): quality (reviews), investigation (analysis), maintenance (tasks with counts)
  - [x] DEVLOG detection: check `DEVLOG.md` exists at project root
  - [x] Project name inference: from frontmatter `project` field, falling back to directory name
  - [x] Export `buildModel` from the module
  - [x] Success: `buildModel()` on the fixture project returns a well-formed `ProjectModel`

- [x] **Task 5: Export ProjectModelBuilder from core**
  - [x] Add `export { buildModel } from './introspection/ProjectModelBuilder.js'` to `packages/core/src/node.ts`
  - [x] Success: `buildModel` is importable from `@context-forge/core/node`, build succeeds

- [x] **Task 6: ProjectModelBuilder unit tests**
  - [x] Create `packages/core/tests/introspection/ProjectModelBuilder.test.ts`
  - [x] Test `scanDirectory`: returns correct number of docs from fixture, each DocEntry has expected fields (index, docType, name, status), task docs have taskItems populated
  - [x] Test `buildModel` foundation band: fixture's spec doc (002) appears in `foundation[]` with correct type and index
  - [x] Test `buildModel` project architecture band: fixture's HLD (050) appears in `projectArchitecture[]`
  - [x] Test `buildModel` initiative band: initiative "100" exists with arch doc, slice plan, actual slice with tasks, planned slices from plan
  - [x] Test `buildModel` task merging: split task files (100-tasks.test-feature.md + 100-tasks.test-feature-1.md) merge into single task entry with correct counts
  - [x] Test `buildModel` operational band: maintenance task (900) appears in `maintenance[]` with task counts
  - [x] Test `buildModel` devlog: `devlog` field is `true` for fixture project
  - [x] Test `buildModel` empty project: returns valid ProjectModel with empty arrays when `project-documents/user/` doesn't exist
  - [x] Test `buildModel` name override: `options.name` overrides inferred project name
  - [x] Success: all tests pass, `pnpm -r build` succeeds

<!-- Commit checkpoint: ProjectModelBuilder + tests -->

### Phase 3: Path Resolution Helper

- [x] **Task 7: Create resolveFilePath helper for introspection tools**
  - [x] Add `resolveIntrospectionPath` function in `packages/mcp-server/src/tools/introspectionTools.ts` (module-private helper)
  - [x] Logic: if `filePath` is provided (absolute path), use it directly. Otherwise, resolve `projectId` via `resolveProjectId()`, look up project via `FileProjectStore.getById()`, join `project.projectPath` + `path`. Return resolved absolute path or throw descriptive error.
  - [x] Handle edge cases: no filePath and no projectId+path → error, project not found → error with "use project_list" guidance, project has no projectPath → error
  - [x] Success: helper correctly resolves both input patterns

### Phase 4: Granular MCP Tools

- [x] **Task 8: Register `introspection_slice_plan` tool**
  - [x] In `introspectionTools.ts`, create `registerIntrospectionTools(server: McpServer)` function
  - [x] Register `introspection_slice_plan` with zod input schema (`projectId?`, `path?`, `filePath?`), tool description documenting the response shape (per LLD API contract), and `readOnlyHint: true` annotation
  - [x] Handler: resolve path via helper → call `ArtifactIntrospector.parseSlicePlan()` → return `jsonResult()`
  - [x] Reuse `errorResult`/`jsonResult` helpers (import from shared location or inline — match existing pattern)
  - [x] Success: tool registered, handles valid input and error cases

- [x] **Task 9: Register `introspection_tasks` tool**
  - [x] Register with input schema (`projectId?`, `path?`, `filePath?`)
  - [x] Handler: resolve path → `ArtifactIntrospector.parseTaskFile()` → `jsonResult()`
  - [x] Success: tool registered, handles valid input and error cases

- [x] **Task 10: Register `introspection_frontmatter` tool**
  - [x] Register with input schema (`projectId?`, `path?`, `filePath?`)
  - [x] Handler: resolve path → `ArtifactIntrospector.parseFrontmatter()` → `jsonResult()`
  - [x] Success: tool registered, handles valid input and error cases

- [x] **Task 11: Register `introspection_documents` tool**
  - [x] Register with input schema (`projectId?`, `projectPath?`, `sliceIndex` required)
  - [x] Note: this tool uses `projectPath` (absolute directory) instead of `filePath` — it needs a project root, not a single file
  - [x] Handler: resolve projectPath from `projectId` or use provided `projectPath` → `ArtifactIntrospector.detectDocuments()` → `jsonResult()`
  - [x] Success: tool registered, handles valid input and error cases

- [x] **Task 12: Register `introspection_future_work` tool**
  - [x] Register with input schema (`projectId?`, `path?`, `filePath?`, `nextIndex?`)
  - [x] Handler: resolve path → `ArtifactIntrospector.parseFutureWork(path, nextIndex)` → `jsonResult()`
  - [x] Success: tool registered, handles valid input and error cases

- [x] **Task 13: Granular MCP tool tests**
  - [x] Create `packages/mcp-server/tests/introspectionTools.test.ts`
  - [x] Mock `@context-forge/core/node` (ArtifactIntrospector, FileProjectStore, buildModel) — follow pattern from `projectTools.test.ts`
  - [x] Test `introspection_slice_plan`: valid filePath returns SlicePlanResult; missing path returns error
  - [x] Test `introspection_tasks`: valid filePath returns TaskFileResult; projectId+path resolution works
  - [x] Test `introspection_frontmatter`: valid filePath returns FrontmatterResult
  - [x] Test `introspection_documents`: valid projectId+sliceIndex returns DocumentDetectionResult; missing sliceIndex returns error
  - [x] Test `introspection_future_work`: valid filePath returns FutureWorkResult; nextIndex parameter is passed through
  - [x] Success: all tests pass, `pnpm -r build` succeeds

<!-- Commit checkpoint: granular tools + tests -->

### Phase 5: Aggregate Tool and Wiring

- [x] **Task 14: Register `project_structure` tool**
  - [x] Register `project_structure` in `introspectionTools.ts` with input schema (`projectId?`, `name?`, `description?`)
  - [x] Handler: resolve projectId → get project.projectPath → call `buildModel(projectPath, { name, description })` → `jsonResult()`
  - [x] Tool description documents the full ProjectModel response shape (see LLD API contract)
  - [x] `readOnlyHint: true` annotation
  - [x] Success: tool registered, returns valid ProjectModel for known project

- [x] **Task 15: `project_structure` MCP tests**
  - [x] Test: valid projectId returns ProjectModel JSON with expected top-level fields (name, foundation, initiatives, etc.)
  - [x] Test: non-existent projectId returns isError with helpful message
  - [x] Test: name/description overrides are passed through to buildModel
  - [x] Success: all tests pass

- [x] **Task 16: Wire introspection tools into MCP server**
  - [x] Import `registerIntrospectionTools` in `packages/mcp-server/src/index.ts`
  - [x] Call `registerIntrospectionTools(server)` alongside existing registrations
  - [x] Success: server starts, all tools appear in `tools/list`

- [x] **Task 17: Update `project_get` description**
  - [x] In `packages/mcp-server/src/tools/projectTools.ts`, update the `project_get` tool description to document the `introspection` summary field (see LLD "project_get Description Update" section)
  - [x] Success: updated description visible in tool metadata

<!-- Commit checkpoint: aggregate tool + wiring + project_get update -->

### Phase 6: Final Verification

- [x] **Task 18: Full build and test verification**
  - [x] Run `pnpm -r build` — all packages build clean
  - [x] Run `pnpm -r test` — all tests pass (509+ existing + new tests)
  - [x] Verify tool count: lifecycle test or manual check shows correct total tool count (was 11, now 17 with 6 new introspection tools)
  - [x] Update lifecycle test tool count assertion if one exists
  - [x] Update DEVLOG.md with Phase 7 completion entry (commits and summary)
  - [x] Update slice status in `164-slice.mcp-introspection-tools.md` frontmatter to `complete`
  - [x] Check off slice 164 in `160-slices.project-workflow-system.md`
  - [x] Success: clean build, all tests pass, documentation updated
