---
slice: artifact-introspection
project: context-forge
lld: user/slices/163-slice.artifact-introspection.md
dependencies: [161-project-schema-standardization]
projectState: Slices 161 (schema standardization) and 162 (config system) complete. 431 tests passing. ProjectData has artifact reference fields (fileHLD, fileArch, fileSlicePlan, fileSpec). Core exports from @context-forge/core (browser-safe types) and @context-forge/core/node (Node.js implementations).
status: complete
dateCreated: 20260228
dateUpdated: 20260228
docType: tasks
---

## Context Summary
- Working on slice 163: Artifact Introspection Engine
- Re-implements relevant parsing from context-visualizer `parse.py` as TypeScript in `packages/core/src/introspection/`
- Six parser modules + ArtifactIntrospector orchestrator + enriched `project_get`
- Types export from `@context-forge/core`; implementations from `@context-forge/core/node`
- Test-with pattern: each parser immediately followed by its tests
- Reference: `parse.py` in context-visualizer project (proven regex patterns)
- Next planned slice: 164 (Workflow Navigator), 165, 166 depend on this module's API

---

## Task 1: Types and Interfaces

- [x] Create `packages/core/src/introspection/types.ts` with all result types from slice design:
  - [x] `NormalizedStatus` type union
  - [x] `SlicePlanEntry`, `SlicePlanResult`
  - [x] `TaskItem`, `TaskFileResult`
  - [x] `FrontmatterData`, `FrontmatterResult`
  - [x] `FutureWorkItem`, `FutureWorkResult`
  - [x] `DocumentDetectionResult`
  - [x] `IntrospectionSummary` (with `slicePlan`, `currentTasks`, `artifacts` sub-objects)
- [x] Create `packages/core/src/introspection/interfaces.ts` with `IArtifactIntrospector` interface
  - [x] Methods: `parseSlicePlan`, `parseTaskFile`, `parseFrontmatter`, `parseFutureWork`, `detectDocuments`, `summarize`
  - [x] All methods return `Promise<T>` for consistency (async filesystem access)
- [x] Create `packages/core/src/introspection/index.ts` barrel — export types and interface only for now
- [x] Add introspection type exports to `packages/core/src/index.ts` (browser-safe)
- [x] Verify: `pnpm -r build` succeeds

## Task 2: Status Normalizer

- [x] Create `packages/core/src/introspection/parsers/statusNormalizer.ts`
  - [x] `normalizeStatus(raw: string | undefined | null): NormalizedStatus` function
  - [x] Port `_STATUS` mapping from `parse.py` — all variant spellings map to `complete`, `in-progress`, `not-started`, `deprecated`
  - [x] Unknown/empty values default to `not-started`
  - [x] Case-insensitive, trims whitespace
- [x] Update barrel export in `introspection/index.ts`

## Task 3: Status Normalizer Tests

- [x] Create `packages/core/tests/introspection/statusNormalizer.test.ts`
  - [x] Test all known variant spellings: `complete`, `completed`, `done`, `in_progress`, `in-progress`, `in progress`, `active`, `not_started`, `not-started`, `not started`, `ready`, `pending`, `planned`, `deprecated`
  - [x] Test case insensitivity (`COMPLETE`, `In-Progress`)
  - [x] Test whitespace trimming (`  complete  `)
  - [x] Test unknown values return `not-started`
  - [x] Test `undefined` and `null` return `not-started`
- [x] Verify: `pnpm --filter @context-forge/core test` passes

## Task 4: Frontmatter Parser

- [x] Create `packages/core/src/introspection/parsers/frontmatterParser.ts`
  - [x] `parseFrontmatter(filePath: string): Promise<FrontmatterResult>` function
  - [x] Read file, check first line is `---`, extract `key: value` pairs until closing `---`
  - [x] Split on first `:` only (values may contain colons)
  - [x] Strip surrounding quotes from values (single and double)
  - [x] Return `{ filePath, found: true, data: {...} }` on success
  - [x] Return `{ filePath, found: false, data: {} }` if file missing, no frontmatter, or read error
  - [x] Never throws — all errors caught and returned as empty result
- [x] Update barrel export

## Task 5: Frontmatter Parser Tests

- [x] Create test fixture: `packages/core/tests/fixtures/introspection/valid-frontmatter.md` — file with standard YAML frontmatter (status, dateCreated, dateUpdated, project, parent)
- [x] Create test fixture: `packages/core/tests/fixtures/introspection/no-frontmatter.md` — markdown file with no `---` delimiter
- [x] Create test fixture: `packages/core/tests/fixtures/introspection/quoted-values.md` — frontmatter with single-quoted and double-quoted values
- [x] Create test fixture: `packages/core/tests/fixtures/introspection/colon-in-value.md` — frontmatter where a value contains `:` (e.g., `description: Phase 4: Slice Design`)
- [x] Create `packages/core/tests/introspection/frontmatterParser.test.ts`
  - [x] Test valid frontmatter extracts all key-value pairs
  - [x] Test no-frontmatter file returns `{ found: false, data: {} }`
  - [x] Test quoted values have quotes stripped
  - [x] Test colon-in-value preserves the full value after first colon
  - [x] Test nonexistent file returns `{ found: false, data: {} }` (no throw)
  - [x] Test empty file returns `{ found: false, data: {} }`
- [x] Verify: tests pass

## Task 6: Task File Parser

- [x] Create `packages/core/src/introspection/parsers/taskFileParser.ts`
  - [x] `parseTaskItems(filePath: string): Promise<TaskItem[]>` — extract checkbox items from a single file
  - [x] `parseTaskFile(filePaths: string | string[]): Promise<TaskFileResult>` — parse one or more files, merge items, compute counts and inferred status
  - [x] Checkbox regex: `^(?:\s*)-\s+\[([ xX])\]\s+(.+)$` (from `parse.py`)
  - [x] Truncate task names longer than 120 characters (matching `parse.py`)
  - [x] Status inference: all done → `complete`, some done → `in-progress`, none done → `not-started`
  - [x] For multiple files (split support): merge items in path order, use first file's path as `filePath`
  - [x] Missing/unreadable file: return empty result (no throw)
- [x] Update barrel export

## Task 7: Task File Parser Tests

- [x] Create test fixture: `packages/core/tests/fixtures/introspection/sample-tasks.md` — task file with mix of checked/unchecked items at various indentation levels (frontmatter + checkboxes)
- [x] Create test fixture: `packages/core/tests/fixtures/introspection/all-complete-tasks.md` — task file with all items checked
- [x] Create test fixture: `packages/core/tests/fixtures/introspection/empty-tasks.md` — task file with frontmatter but no checkbox items
- [x] Create `packages/core/tests/introspection/taskFileParser.test.ts`
  - [x] Test mixed checked/unchecked: correct total, completed counts, inferred status `in-progress`
  - [x] Test all-complete: inferred status `complete`
  - [x] Test empty: zero counts, inferred status `not-started`
  - [x] Test split file merge: pass two file paths, verify items merge in order with correct combined counts
  - [x] Test long task name truncation at 120 characters
  - [x] Test nonexistent file: empty result, no throw
  - [x] Test `[X]` (capital X) treated as checked
- [x] Verify: tests pass

## Task 8: Slice Plan Parser

- [x] Create `packages/core/src/introspection/parsers/slicePlanParser.ts`
  - [x] `parseSlicePlan(filePath: string): Promise<SlicePlanResult>` function
  - [x] Slice entry regex: `^\d+\.\s+\[([ xX])\]\s+\*\*\((\d+)\)\s+(.+?)\*\*` (from `parse.py`)
  - [x] Section-aware: track headings, skip `_NON_SLICE_HEADINGS` (future work, implementation order, notes, parent document)
  - [x] Extract: index (number), name (string), isChecked (boolean), status (checked → `complete`, unchecked → `not-started`)
  - [x] Compute `totalSlices` and `completedSlices` from entries
  - [x] Missing/unreadable file: return empty result with zero counts
- [x] Update barrel export

## Task 9: Slice Plan Parser Tests

- [x] Create test fixture: `packages/core/tests/fixtures/introspection/sample-slice-plan.md` — realistic slice plan with Foundation Work, Feature Slices, Future Work, Implementation Order, and Notes sections. Mix of checked and unchecked entries.
- [x] Create `packages/core/tests/introspection/slicePlanParser.test.ts`
  - [x] Test extracts correct entries with index, name, isChecked, status
  - [x] Test skips entries in Future Work, Implementation Order, Notes sections
  - [x] Test totalSlices and completedSlices are correct
  - [x] Test nonexistent file returns empty result
  - [x] Test real-world validation: parse this project's own `160-slices.project-workflow-system.md` and verify known entries (161 complete, 163 not started, etc.)
- [x] Verify: tests pass

**Commit checkpoint: types, normalizer, frontmatter parser, task parser, slice plan parser + all tests**

## Task 10: Future Work Parser

- [x] Create `packages/core/src/introspection/parsers/futureWorkParser.ts`
  - [x] `parseFutureWork(filePath: string, nextIndex?: number): Promise<FutureWorkResult>` function
  - [x] Locate `## Future Work` heading; read numbered items until next heading
  - [x] Item regex: `^\d+\.\s+\[([ xX])\]\s+(.+)$` (from `parse.py`)
  - [x] Items with explicit `(NNN)` index use that index; unnumbered items get sequential indices starting at `nextIndex`
  - [x] Extract short title from item text (text before em-dash or colon)
  - [x] Missing/unreadable file or no Future Work section: return empty items array
- [x] Update barrel export

## Task 11: Future Work Parser Tests

- [x] Use the `sample-slice-plan.md` fixture (from Task 9) which should include a Future Work section
- [x] Create `packages/core/tests/introspection/futureWorkParser.test.ts`
  - [x] Test extracts items from Future Work section with correct index, name, done
  - [x] Test explicit `(NNN)` index items get that index
  - [x] Test unnumbered items get sequential indices from `nextIndex`
  - [x] Test title extraction stops at em-dash or colon
  - [x] Test nonexistent file returns empty result
  - [x] Test file with no Future Work section returns empty result
- [x] Verify: tests pass

## Task 12: Document Detector

- [x] Create `packages/core/src/introspection/parsers/documentDetector.ts`
  - [x] `detectDocuments(projectPath: string, sliceIndex: number): Promise<DocumentDetectionResult>` function
  - [x] Check for files matching naming conventions under `project-documents/user/`:
    - [x] `slices/{index}-slice.*.md` → `sliceDesign`
    - [x] `tasks/{index}-tasks.*.md` → `taskFile` (array, supports split files like `*-1.md`, `*-2.md`)
    - [x] `architecture/{index}-arch.*.md` → `architecture`
    - [x] `architecture/{index}-slices.*.md` → `slicePlan`
  - [x] `checkFileExists(projectPath: string, relativePath: string): Promise<boolean>` — helper for explicit path checks (fileHLD, fileArch, etc.)
  - [x] Use `fs.readdir` + filename matching (not external glob library)
  - [x] Missing directories: return nulls (no throw)
- [x] Update barrel export

## Task 13: Document Detector Tests

- [x] Extend the existing test fixture at `packages/core/tests/fixtures/test-project/` or create a dedicated `packages/core/tests/fixtures/introspection/project/` with a minimal `project-documents/user/` structure containing a few slice, task, and architecture files
- [x] Create `packages/core/tests/introspection/documentDetector.test.ts`
  - [x] Test detects existing slice design file for a known index
  - [x] Test detects task file(s) including split files
  - [x] Test detects architecture and slice plan files
  - [x] Test returns null for indices with no matching files
  - [x] Test `checkFileExists` for existing and nonexistent relative paths
  - [x] Test nonexistent project path returns all nulls (no throw)
- [x] Verify: tests pass

**Commit checkpoint: future work parser, document detector + tests**

## Task 14: ArtifactIntrospector Orchestrator

- [x] Create `packages/core/src/introspection/ArtifactIntrospector.ts`
  - [x] Implements `IArtifactIntrospector`
  - [x] Each method delegates to the corresponding parser function, resolving file paths from `projectPath` as needed
  - [x] `summarize(project: ProjectData): Promise<IntrospectionSummary>`:
    1. [x] If `fileSlicePlan` + `projectPath` set: parse slice plan, populate `slicePlan` summary
    2. [x] If `fileTasks` + `projectPath` set: locate task file(s) via document detector, parse, populate `currentTasks` summary
    3. [x] Check existence of `fileHLD`, `fileArch`, `fileSpec`, `fileSlicePlan` references
    4. [x] Extract slice index from `fileSlice` (parse `NNN-` prefix), check for current slice design
    5. [x] Assemble `artifacts` presence flags
  - [x] Each operation is individually try/caught — failure in one doesn't prevent others
  - [x] Summary strings: `"N of M slices complete"`, `"N of M tasks done"`
- [x] Update barrel export in `introspection/index.ts` — add `ArtifactIntrospector`
- [x] Add Node.js export in `packages/core/src/node.ts`: `export { ArtifactIntrospector } from './introspection/ArtifactIntrospector.js'`
- [x] Add type exports in `packages/core/src/index.ts`: export `IArtifactIntrospector` and all result types from `introspection/`
- [x] Verify: `pnpm -r build` succeeds

## Task 15: ArtifactIntrospector Tests

- [x] Create or extend fixture project directory at `packages/core/tests/fixtures/introspection/project/` with:
  - [x] `project-documents/user/architecture/` containing a slice plan file with mixed completion
  - [x] `project-documents/user/slices/` containing a slice design file
  - [x] `project-documents/user/tasks/` containing a task file with mixed checkboxes
- [x] Create `packages/core/tests/introspection/ArtifactIntrospector.test.ts`
  - [x] Test `parseSlicePlan` delegates correctly and returns typed result
  - [x] Test `parseTaskFile` with single and multiple paths
  - [x] Test `parseFrontmatter` delegates correctly
  - [x] Test `parseFutureWork` delegates correctly
  - [x] Test `detectDocuments` delegates correctly
  - [x] Test `summarize` with fully populated project: slicePlan summary, currentTasks summary, all artifact flags
  - [x] Test `summarize` with minimal project (no projectPath): returns empty introspection (no errors)
  - [x] Test `summarize` with partial data (projectPath but no fileSlicePlan): partial result, no crash
  - [x] Test individual operation failure doesn't prevent other operations from completing
- [x] Verify: all tests pass

**Commit checkpoint: ArtifactIntrospector + tests**

## Task 16: Enrich `project_get` MCP Tool

- [x] Update `packages/mcp-server/src/tools/projectTools.ts`:
  - [x] Import `ArtifactIntrospector` from `@context-forge/core/node`
  - [x] In `project_get` handler, after retrieving project: if `project.projectPath` is set, create `ArtifactIntrospector` and call `summarize(project)`
  - [x] Return `{ ...project, introspection: summary }` when introspection is available
  - [x] If introspection fails (any error), return project without `introspection` field (graceful degradation, log to stderr)
  - [x] Projects without `projectPath` return as before (no enrichment)
- [x] Verify: `pnpm -r build` succeeds

## Task 17: `project_get` Enrichment Tests

- [x] Update `packages/mcp-server/tests/projectTools.test.ts`:
  - [x] Add mock for `ArtifactIntrospector` (vi.mock for `@context-forge/core/node`)
  - [x] Test `project_get` returns `introspection` field when project has `projectPath` and introspection succeeds
  - [x] Test `project_get` returns project without `introspection` when project has no `projectPath`
  - [x] Test `project_get` returns project without `introspection` when introspector throws (graceful degradation)
- [x] Verify: all MCP server tests pass

**Commit checkpoint: project_get enrichment + tests**

## Task 18: Final Verification and Cleanup

- [x] Run full test suite: `pnpm -r test`
  - [x] All core tests pass (existing + new introspection tests)
  - [x] All MCP server tests pass (existing + enrichment tests)
  - [x] All electron tests pass (unchanged)
- [x] Run full build: `pnpm -r build`
- [x] Verify export surface:
  - [x] `@context-forge/core` exports: `IArtifactIntrospector`, all result types, `NormalizedStatus`
  - [x] `@context-forge/core/node` exports: `ArtifactIntrospector` class
- [x] Verify no new npm dependencies were added
- [x] Final commit with any cleanup

---

*Effort: 3/5. 18 tasks across 4 commit checkpoints. Test-with pattern throughout.*
