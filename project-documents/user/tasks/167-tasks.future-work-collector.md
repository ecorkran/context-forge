---
slice: future-work-collector
project: context-forge
lld: user/slices/167-slice.future-work-collector.md
dependencies: [163-artifact-introspection, 164-mcp-introspection-tools, 162-config-system]
projectState: Slices 161-164 complete. ProjectModelBuilder, buildModel(), parseFutureWork(), and all introspection parsers are live. 536 tests pass. workflowTools.ts does not yet exist.
status: complete
dateCreated: 20260301
dateUpdated: 20260301
---

## Context Summary

- Working on slice 167: Future Work Collector
- Slice 164 delivered `ProjectModelBuilder.buildModel()` which already populates `Initiative.slicePlan.futureWork` for each initiative's `## Future Work` section
- This slice adds a `FutureWorkCollector` service that aggregates future work across all initiatives and standalone `*-slices.future.*` files, and exposes it as the `workflow_future` MCP tool
- **Key implementation detail**: two source patterns require different parsing strategies:
  1. Regular slice plans: future work from `slicePlan.futureWork` (parsed from `## Future Work` section)
  2. Standalone `*-slices.future.*` files: entire main body IS future work — use `slicePlan.entries` instead. Detect by checking if `slicePlan.filepath` contains `slices.future.` in the filename.
- New file: `workflowTools.ts` in mcp-server — will be the home for all 165/166/167 `workflow_*` tools
- Next planned slice: 165 (Workflow Navigator) or 166 (Consistency Checker)

---

## Tasks

### Phase 1: Types and Fixture

- [x] **Task 1: Add FutureWorkCollector types to core**
  - [x] Add to `packages/core/src/introspection/types.ts`:
    - `CollectedFutureWorkItem`: `{ index: string; name: string; done: boolean; sourceFile: string; sourceInitiativeIndex: string; sourceInitiativeName: string; }`
    - `FutureWorkGroup`: `{ initiativeIndex: string; initiativeName: string; sourceFile: string; items: CollectedFutureWorkItem[]; totalItems: number; pendingItems: number; completedItems: number; }`
    - `FutureWorkCollectorResult`: `{ projectPath: string; groups: FutureWorkGroup[]; totalItems: number; pendingItems: number; completedItems: number; markdown: string; }`
  - [x] Export all three types from `packages/core/src/introspection/index.ts`
  - [x] Success: types compile; existing tests pass; `pnpm -r build` succeeds

- [x] **Task 2: Add standalone future-work fixture file**
  - [x] Create `packages/core/tests/fixtures/introspection/project/project-documents/user/architecture/780-slices.future.test-future.md`
  - [x] Include YAML frontmatter: `docType: slice-plan`, `parent: user/architecture/100-arch.test-initiative.md`, `project: test-project`, `status: partial`, `dateCreated: 20260101`, `dateUpdated: 20260101`
  - [x] Include a title and brief intro sentence
  - [x] Main body: 3 numbered checklist entries — one `[x]` (migrated/completed) and two `[ ]` (pending). Use format: `1. [x] **(780) Completed Item** — Implemented as something else. *(migrated)*` and `2. [ ] **(781) Pending Item A** — Description.`
  - [x] Do NOT include a `## Future Work` section — this entire file IS future work
  - [x] Success: file exists with valid frontmatter; fixture project still parseable; no test regressions

<!-- Commit checkpoint: types + fixture -->

### Phase 2: FutureWorkCollector Service

- [x] **Task 3: Implement FutureWorkCollector**
  - [x] Create `packages/core/src/introspection/FutureWorkCollector.ts`
  - [x] Import `buildModel` from `./ProjectModelBuilder.js` and relevant types from `./types.js`
  - [x] Implement `collect(projectPath: string, statusFilter?: 'all' | 'pending' | 'completed'): Promise<FutureWorkCollectorResult>`:
    - Call `buildModel(projectPath)` to get the ProjectModel
    - Walk `model.initiatives` (all entries, keyed by index string)
    - For each initiative with a `slicePlan`:
      - **Standalone detection**: if `slicePlan.filepath` contains `slices.future.` → source items from `slicePlan.entries` (convert `SlicePlanEntry` to `CollectedFutureWorkItem`: `isChecked` → `done`, use initiative index and name for source attribution)
      - **Regular slice plan**: use `slicePlan.futureWork` items directly (convert `FutureWorkItem` to `CollectedFutureWorkItem`)
      - Skip initiatives with zero source items after conversion
    - Apply `statusFilter`: `'pending'` → `done=false` only, `'completed'` → `done=true` only, `'all'` or undefined → all items
    - Build `FutureWorkGroup` for each included initiative; compute `pendingItems`/`completedItems` counts
    - Compute top-level totals across all groups
    - Generate markdown summary (see Task 4)
    - Return `FutureWorkCollectorResult` with `projectPath` set to the input path
  - [x] Edge case: project with no slice plans → return result with `groups: [], totalItems: 0, pendingItems: 0, completedItems: 0, markdown: '## Future Work\n\n*No future work items found.*'`
  - [x] Never throw — wrap `buildModel()` call; on error return empty result
  - [x] Success: service created and compiles

- [x] **Task 4: Implement markdown formatter**
  - [x] Add a private `generateMarkdown(groups: FutureWorkGroup[], totals: { total: number; pending: number; completed: number }): string` function in `FutureWorkCollector.ts`
  - [x] Format per the LLD specification:
    - Header: `## Future Work Summary`
    - Per group: `### {initiativeIndex} — {initiativeName}` + `*Source: {sourceFile}*` on next line
    - Per item: `- [ ] ({index}) {name}` or `- [x] ({index}) {name}`
    - If group has zero items after filtering: omit group entirely
    - Footer: `**Total: {total} items ({pending} pending, {completed} completed)**`
  - [x] Success: function produces correctly formatted markdown matching the format in the LLD

- [x] **Task 5: Export FutureWorkCollector from core**
  - [x] Add `export { FutureWorkCollector } from './introspection/FutureWorkCollector.js'` to `packages/core/src/node.ts`
  - [x] Success: `FutureWorkCollector` importable from `@context-forge/core/node`; `pnpm -r build` succeeds

<!-- Commit checkpoint: FutureWorkCollector service + export -->

### Phase 3: FutureWorkCollector Tests

- [x] **Task 6: FutureWorkCollector unit tests**
  - [x] Create `packages/core/tests/introspection/FutureWorkCollector.test.ts`
  - [x] Test **inline future work**: call `collect()` on the fixture project; verify a group exists for the 100-initiative with items from its `## Future Work` section (if fixture has one; if not, verify 100-band group is absent from results)
  - [x] Test **standalone file detection**: verify a group exists for the 780-band (from `780-slices.future.test-future.md`); group contains 3 items; 1 completed, 2 pending
  - [x] Test **source attribution**: group for 780-band has correct `initiativeIndex: '780'`, `sourceFile` ending in `780-slices.future.test-future.md`
  - [x] Test **status filter 'pending'**: `collect(path, 'pending')` returns only items where `done=false`; `completedItems` count is 0
  - [x] Test **status filter 'completed'**: returns only done items; `pendingItems` count is 0
  - [x] Test **empty project**: call `collect()` on a non-existent path → returns empty result with zero totals, not a throw
  - [x] Test **markdown output**: result.markdown contains `## Future Work Summary` header and the 780 initiative section heading
  - [x] Success: all tests pass; `pnpm -r build` succeeds

<!-- Commit checkpoint: FutureWorkCollector tests -->

### Phase 4: MCP Tool

- [x] **Task 7: Create workflowTools.ts and register `workflow_future`**
  - [x] Create `packages/mcp-server/src/tools/workflowTools.ts`
  - [x] Add `registerWorkflowTools(server: McpServer): void` export function
  - [x] Register `workflow_future` tool with:
    - Input schema: `projectId` (string, optional), `status` (enum `['all','pending','completed']`, optional, default `'all'`), `includeMarkdown` (boolean, optional, default `true`)
    - Description: documents the `FutureWorkCollectorResult` response shape and the two source patterns
    - `readOnlyHint: true` annotation
  - [x] Handler: resolve `projectId` via `resolveProjectId()` → `FileProjectStore.getById()` to get `projectPath` → `FutureWorkCollector.collect(projectPath, status)` → if `!includeMarkdown` delete `.markdown` from result → `jsonResult(result)`
  - [x] Reuse `errorResult`/`jsonResult` helpers (import from the same location as `introspectionTools.ts`)
  - [x] Success: file compiles; tool registered with correct schema

- [x] **Task 8: `workflow_future` MCP tests**
  - [x] Create `packages/mcp-server/tests/workflowTools.test.ts`
  - [x] Mock `@context-forge/core/node` (FutureWorkCollector, FileProjectStore) and `./resolveProjectId.js` — follow the mock pattern from `introspectionTools.test.ts`
  - [x] Test: valid `projectId` → resolves project path → calls `collect()` → returns JSON with `groups` and `markdown` fields
  - [x] Test: `includeMarkdown: false` → returned JSON does not contain `markdown` field
  - [x] Test: `status: 'pending'` is passed through to `collect()` as the `statusFilter` argument
  - [x] Test: invalid/non-existent `projectId` → `isError: true` response with descriptive message
  - [x] Test: omitting `projectId` with a `default_project` config falls back correctly (mock `resolveProjectId` returning a default)
  - [x] Success: all tests pass; `pnpm -r build` succeeds

- [x] **Task 9: Wire workflowTools into MCP server**
  - [x] Import `registerWorkflowTools` in `packages/mcp-server/src/index.ts`
  - [x] Call `registerWorkflowTools(server)` alongside existing tool registrations
  - [x] Success: server starts; `workflow_future` appears in `tools/list`; total tool count increases by 1 (18 tools)

<!-- Commit checkpoint: MCP tool + tests + wiring -->

### Phase 5: Final Verification

- [x] **Task 10: Build, test, and update slice artifacts**
  - [x] Run `pnpm -r build` — all packages build clean
  - [x] Run `pnpm -r test` — all tests pass (536+ existing + new tests for this slice)
  - [x] Verify tool count: total registered tools is now 18 (was 17); update lifecycle test assertion if one exists
  - [x] Update slice status in `167-slice.future-work-collector.md` frontmatter to `complete`
  - [x] Check off slice 167 in `160-slices.project-workflow-system.md`
  - [x] Update DEVLOG.md with Phase 7 completion entry
  - [x] Commit with `feat(mcp): add workflow_future tool and FutureWorkCollector`
  - [x] Success: clean build, all tests pass, slice marked complete in plan
