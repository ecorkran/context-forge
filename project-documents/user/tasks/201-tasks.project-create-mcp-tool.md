---
slice: project-create-mcp-tool
project: context-forge
lld: user/slices/201-slice.project-create-mcp-tool.md
dependencies: []
projectState: MCP server has project_list, project_get, project_update, project_schema tools in projectTools.ts. FileProjectStore.create() exists and is used by CLI cf init. No project creation via MCP currently.
dateCreated: 20260315
dateUpdated: 20260315
status: complete
docType: tasks
---

## Context Summary
- Working on slice 201: project_create MCP Tool
- Adds a new `project_create` tool to the existing `registerProjectTools()` in `packages/mcp-server/src/tools/projectTools.ts`
- Thin wrapper over `FileProjectStore.create()` with input validation and duplicate-path detection
- Response matches `project_get` shape (ProjectData + optional introspection)
- No dependencies on other 200-band slices; this is a foundation slice
- Next planned slice: 202 (Smart cf init) or 203 (Enhanced cf next), which are independent of each other

## Tasks

### 1. Setup

- [x] **1.1 Create slice branch and verify starting state**
  - [x] Verify on `main` branch, working tree clean
  - [x] Create branch: `git checkout -b 201-slice.project-create-mcp-tool`
  - [x] Run `npm run build` from project root — build succeeds
  - [x] Run `npm test` from project root — all tests pass
  - [x] Success: on correct branch, build and tests green

### 2. Implementation

- [x] **2.1 Add `mockCreate` to test mocks**
  - [x] In `packages/mcp-server/tests/projectTools.test.ts`, add `const mockCreate = vi.fn();` alongside the existing mock declarations (`mockGetAll`, `mockGetById`, `mockUpdate`)
  - [x] Add `create: mockCreate` to the `FileProjectStore` mock implementation object (alongside `getAll`, `getById`, `update`)
  - [x] Add `mockCreate` to the `beforeEach` block's `mockReset()` calls
  - [x] Success: file saves, existing tests still pass (`npm test -w packages/mcp-server`)

- [x] **2.2 Implement `project_create` tool handler**
  - [x] In `packages/mcp-server/src/tools/projectTools.ts`, add a new `server.registerTool('project_create', ...)` block inside `registerProjectTools()`
  - [x] Place it after the `project_list` registration and before `project_get` (logical ordering: list → create → get → update → schema)
  - [x] Tool metadata:
    - [x] title: `'Create Project'`
    - [x] description: Explains that this creates a new CF project entry with sensible defaults. Mentions that it returns the same shape as `project_get`. Notes that it does NOT install guides, commands, or configure IDE.
    - [x] annotations: `{ destructiveHint: false, idempotentHint: false, openWorldHint: false }`
  - [x] Input schema (using zod, matching existing tool patterns):
    - [x] `name`: `z.string().describe(...)` — required, project display name
    - [x] `projectPath`: `z.string().optional().describe(...)` — absolute path to project root
    - [x] `developmentPhase`: `z.string().optional().describe(...)` — initial phase, defaults to "Phase 1: Concept"
  - [x] Handler logic (see slice design "Data Flow" section for the sequence):
    1. Validate `name` is non-empty after trim. If empty, return `errorResult('Project name is required.')`
    2. If `projectPath` provided, normalize with `path.resolve()` and trim
    3. If `projectPath` provided, check for duplicates: call `store.getAll()`, find any project where `p.projectPath === normalizedPath`. If found, return `errorResult` with message including existing project name and ID, suggesting `project_get`
    4. Compute `dateProject` as YYYYMMDD string from current date
    5. Call `store.create()` with: `{ name: trimmedName, projectPath, template: 'default', fileSlice: '', instruction: 'implementation', developmentPhase: developmentPhase || 'Phase 1: Concept', dateProject }`
    6. If `projectPath` is set, attempt introspection enrichment (same try/catch pattern as `project_get`): `new ArtifactIntrospector().summarize(project)`, merge into response
    7. Return `jsonResult(...)` with full project object (+ introspection if available)
  - [x] Add `import * as path from 'node:path';` at top of file if not already present
  - [x] Success: file saves, TypeScript compiles (`npm run build -w packages/mcp-server`)

- [x] **2.3 Test: successful creation with all parameters**
  - [x] Add a `describe('project_create', ...)` block in `projectTools.test.ts`
  - [x] Test: calls `project_create` with `{ name: 'Test Project', projectPath: '/tmp/test-project', developmentPhase: 'Phase 2: Specification' }`
  - [x] Mock `mockGetAll` to return empty array (no duplicates)
  - [x] Mock `mockCreate` to return a full `ProjectData` object with the provided values
  - [x] Assert: result is not an error
  - [x] Assert: `mockCreate` was called once with object containing `name: 'Test Project'`, `projectPath: '/tmp/test-project'`, `developmentPhase: 'Phase 2: Specification'`, `template: 'default'`, `instruction: 'implementation'`, `fileSlice: ''`
  - [x] Assert: `mockCreate` call includes `dateProject` matching YYYYMMDD pattern
  - [x] Assert: response JSON includes the project fields from the mock return
  - [x] Success: test passes

- [x] **2.4 Test: creation with defaults only (name-only)**
  - [x] Test: calls `project_create` with `{ name: 'Minimal Project' }` (no projectPath, no developmentPhase)
  - [x] Mock `mockGetAll` to return empty array
  - [x] Mock `mockCreate` to return appropriate ProjectData
  - [x] Assert: `mockCreate` called with `developmentPhase: 'Phase 1: Concept'` (default applied)
  - [x] Assert: `projectPath` is undefined in the create call
  - [x] Assert: no introspection attempted (since no projectPath)
  - [x] Success: test passes

- [x] **2.5 Test: duplicate path detection**
  - [x] Test: calls `project_create` with `{ name: 'Dup Project', projectPath: '/existing/path' }`
  - [x] Mock `mockGetAll` to return array containing a project with `projectPath: '/existing/path'`, `name: 'Original Project'`, `id: 'project_existing'`
  - [x] Assert: result `isError` is true
  - [x] Assert: error message contains `'Original Project'` and `'project_existing'`
  - [x] Assert: `mockCreate` was NOT called
  - [x] Success: test passes

- [x] **2.6 Test: missing name validation**
  - [x] Test: calls `project_create` with `{ name: '' }` (empty string)
  - [x] Assert: result `isError` is true
  - [x] Assert: error message indicates name is required
  - [x] Assert: `mockCreate` was NOT called
  - [x] Success: test passes

- [x] **2.7 Test: introspection enrichment**
  - [x] Test: calls `project_create` with `{ name: 'Intro Project', projectPath: '/tmp/intro' }`
  - [x] Mock `mockGetAll` returns empty array, `mockCreate` returns project with projectPath
  - [x] Mock `mockSummarize` to return `{ slicePlan: { totalSlices: 0 } }`
  - [x] Assert: response includes `introspection` field from the mock
  - [x] Success: test passes

- [x] **2.8 Test: introspection failure graceful degradation**
  - [x] Test: calls `project_create` with projectPath set
  - [x] Mock `mockSummarize` to throw an error
  - [x] Assert: result is NOT an error (creation still succeeds)
  - [x] Assert: response contains the project data without `introspection`
  - [x] Success: test passes

### 3. Integration Verification

- [x] **3.1 Update server lifecycle test if needed**
  - [x] Check `packages/mcp-server/tests/serverLifecycle.test.ts` — if it asserts a specific tool count or tool name list, update to include `project_create`
  - [x] Success: lifecycle test passes

- [x] **3.2 Full build and test verification**
  - [x] Run `npm run build` from project root — all packages build
  - [x] Run `npm test` from project root — all tests pass (not just mcp-server)
  - [x] Success: clean build, all tests green

### 4. Commit and Wrap-up

- [x] **4.1 Commit implementation**
  - [x] Stage changed files: `projectTools.ts`, `projectTools.test.ts`, and `serverLifecycle.test.ts` (if changed)
  - [x] Commit with message: `feat(mcp-server): add project_create MCP tool`
  - [x] Success: commit created on slice branch

- [x] **4.2 Update slice design status**
  - [x] In `user/slices/201-slice.project-create-mcp-tool.md`, update frontmatter `status: not_started` → `status: complete`
  - [x] Success: status updated

- [x] **4.3 Update DEVLOG**
  - [x] Add entry to DEVLOG for slice 201 completion, listing commit hashes
  - [x] Success: DEVLOG updated

- [x] **4.4 Final commit for docs**
  - [x] Stage and commit doc updates: `docs: complete slice 201 project_create MCP tool`
  - [x] Success: docs commit created
