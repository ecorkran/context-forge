---
slice: artifact-introspection
project: context-forge
lld: user/slices/163-slice.artifact-introspection.md
dependencies: [161-project-schema-standardization]
projectState: Slices 161 (schema standardization) and 162 (config system) complete. 431 tests passing. ProjectData has artifact reference fields (fileHLD, fileArch, fileSlicePlan, fileSpec). Core exports from @context-forge/core (browser-safe types) and @context-forge/core/node (Node.js implementations).
status: in-progress
dateCreated: 20260228
dateUpdated: 20260228
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

- [ ] Create `packages/core/src/introspection/types.ts` with all result types from slice design:
  - [ ] `NormalizedStatus` type union
  - [ ] `SlicePlanEntry`, `SlicePlanResult`
  - [ ] `TaskItem`, `TaskFileResult`
  - [ ] `FrontmatterData`, `FrontmatterResult`
  - [ ] `FutureWorkItem`, `FutureWorkResult`
  - [ ] `DocumentDetectionResult`
  - [ ] `IntrospectionSummary` (with `slicePlan`, `currentTasks`, `artifacts` sub-objects)
- [ ] Create `packages/core/src/introspection/interfaces.ts` with `IArtifactIntrospector` interface
  - [ ] Methods: `parseSlicePlan`, `parseTaskFile`, `parseFrontmatter`, `parseFutureWork`, `detectDocuments`, `summarize`
  - [ ] All methods return `Promise<T>` for consistency (async filesystem access)
- [ ] Create `packages/core/src/introspection/index.ts` barrel — export types and interface only for now
- [ ] Add introspection type exports to `packages/core/src/index.ts` (browser-safe)
- [ ] Verify: `pnpm -r build` succeeds

## Task 2: Status Normalizer

- [ ] Create `packages/core/src/introspection/parsers/statusNormalizer.ts`
  - [ ] `normalizeStatus(raw: string | undefined | null): NormalizedStatus` function
  - [ ] Port `_STATUS` mapping from `parse.py` — all variant spellings map to `complete`, `in-progress`, `not-started`, `deprecated`
  - [ ] Unknown/empty values default to `not-started`
  - [ ] Case-insensitive, trims whitespace
- [ ] Update barrel export in `introspection/index.ts`

## Task 3: Status Normalizer Tests

- [ ] Create `packages/core/tests/introspection/statusNormalizer.test.ts`
  - [ ] Test all known variant spellings: `complete`, `completed`, `done`, `in_progress`, `in-progress`, `in progress`, `active`, `not_started`, `not-started`, `not started`, `ready`, `pending`, `planned`, `deprecated`
  - [ ] Test case insensitivity (`COMPLETE`, `In-Progress`)
  - [ ] Test whitespace trimming (`  complete  `)
  - [ ] Test unknown values return `not-started`
  - [ ] Test `undefined` and `null` return `not-started`
- [ ] Verify: `pnpm --filter @context-forge/core test` passes

## Task 4: Frontmatter Parser

- [ ] Create `packages/core/src/introspection/parsers/frontmatterParser.ts`
  - [ ] `parseFrontmatter(filePath: string): Promise<FrontmatterResult>` function
  - [ ] Read file, check first line is `---`, extract `key: value` pairs until closing `---`
  - [ ] Split on first `:` only (values may contain colons)
  - [ ] Strip surrounding quotes from values (single and double)
  - [ ] Return `{ filePath, found: true, data: {...} }` on success
  - [ ] Return `{ filePath, found: false, data: {} }` if file missing, no frontmatter, or read error
  - [ ] Never throws — all errors caught and returned as empty result
- [ ] Update barrel export

## Task 5: Frontmatter Parser Tests

- [ ] Create test fixture: `packages/core/tests/fixtures/introspection/valid-frontmatter.md` — file with standard YAML frontmatter (status, dateCreated, dateUpdated, project, parent)
- [ ] Create test fixture: `packages/core/tests/fixtures/introspection/no-frontmatter.md` — markdown file with no `---` delimiter
- [ ] Create test fixture: `packages/core/tests/fixtures/introspection/quoted-values.md` — frontmatter with single-quoted and double-quoted values
- [ ] Create test fixture: `packages/core/tests/fixtures/introspection/colon-in-value.md` — frontmatter where a value contains `:` (e.g., `description: Phase 4: Slice Design`)
- [ ] Create `packages/core/tests/introspection/frontmatterParser.test.ts`
  - [ ] Test valid frontmatter extracts all key-value pairs
  - [ ] Test no-frontmatter file returns `{ found: false, data: {} }`
  - [ ] Test quoted values have quotes stripped
  - [ ] Test colon-in-value preserves the full value after first colon
  - [ ] Test nonexistent file returns `{ found: false, data: {} }` (no throw)
  - [ ] Test empty file returns `{ found: false, data: {} }`
- [ ] Verify: tests pass

## Task 6: Task File Parser

- [ ] Create `packages/core/src/introspection/parsers/taskFileParser.ts`
  - [ ] `parseTaskItems(filePath: string): Promise<TaskItem[]>` — extract checkbox items from a single file
  - [ ] `parseTaskFile(filePaths: string | string[]): Promise<TaskFileResult>` — parse one or more files, merge items, compute counts and inferred status
  - [ ] Checkbox regex: `^(?:\s*)-\s+\[([ xX])\]\s+(.+)$` (from `parse.py`)
  - [ ] Truncate task names longer than 120 characters (matching `parse.py`)
  - [ ] Status inference: all done → `complete`, some done → `in-progress`, none done → `not-started`
  - [ ] For multiple files (split support): merge items in path order, use first file's path as `filePath`
  - [ ] Missing/unreadable file: return empty result (no throw)
- [ ] Update barrel export

## Task 7: Task File Parser Tests

- [ ] Create test fixture: `packages/core/tests/fixtures/introspection/sample-tasks.md` — task file with mix of checked/unchecked items at various indentation levels (frontmatter + checkboxes)
- [ ] Create test fixture: `packages/core/tests/fixtures/introspection/all-complete-tasks.md` — task file with all items checked
- [ ] Create test fixture: `packages/core/tests/fixtures/introspection/empty-tasks.md` — task file with frontmatter but no checkbox items
- [ ] Create `packages/core/tests/introspection/taskFileParser.test.ts`
  - [ ] Test mixed checked/unchecked: correct total, completed counts, inferred status `in-progress`
  - [ ] Test all-complete: inferred status `complete`
  - [ ] Test empty: zero counts, inferred status `not-started`
  - [ ] Test split file merge: pass two file paths, verify items merge in order with correct combined counts
  - [ ] Test long task name truncation at 120 characters
  - [ ] Test nonexistent file: empty result, no throw
  - [ ] Test `[X]` (capital X) treated as checked
- [ ] Verify: tests pass

## Task 8: Slice Plan Parser

- [ ] Create `packages/core/src/introspection/parsers/slicePlanParser.ts`
  - [ ] `parseSlicePlan(filePath: string): Promise<SlicePlanResult>` function
  - [ ] Slice entry regex: `^\d+\.\s+\[([ xX])\]\s+\*\*\((\d+)\)\s+(.+?)\*\*` (from `parse.py`)
  - [ ] Section-aware: track headings, skip `_NON_SLICE_HEADINGS` (future work, implementation order, notes, parent document)
  - [ ] Extract: index (number), name (string), isChecked (boolean), status (checked → `complete`, unchecked → `not-started`)
  - [ ] Compute `totalSlices` and `completedSlices` from entries
  - [ ] Missing/unreadable file: return empty result with zero counts
- [ ] Update barrel export

## Task 9: Slice Plan Parser Tests

- [ ] Create test fixture: `packages/core/tests/fixtures/introspection/sample-slice-plan.md` — realistic slice plan with Foundation Work, Feature Slices, Future Work, Implementation Order, and Notes sections. Mix of checked and unchecked entries.
- [ ] Create `packages/core/tests/introspection/slicePlanParser.test.ts`
  - [ ] Test extracts correct entries with index, name, isChecked, status
  - [ ] Test skips entries in Future Work, Implementation Order, Notes sections
  - [ ] Test totalSlices and completedSlices are correct
  - [ ] Test nonexistent file returns empty result
  - [ ] Test real-world validation: parse this project's own `160-slices.project-workflow-system.md` and verify known entries (161 complete, 163 not started, etc.)
- [ ] Verify: tests pass

**Commit checkpoint: types, normalizer, frontmatter parser, task parser, slice plan parser + all tests**

## Task 10: Future Work Parser

- [ ] Create `packages/core/src/introspection/parsers/futureWorkParser.ts`
  - [ ] `parseFutureWork(filePath: string, nextIndex?: number): Promise<FutureWorkResult>` function
  - [ ] Locate `## Future Work` heading; read numbered items until next heading
  - [ ] Item regex: `^\d+\.\s+\[([ xX])\]\s+(.+)$` (from `parse.py`)
  - [ ] Items with explicit `(NNN)` index use that index; unnumbered items get sequential indices starting at `nextIndex`
  - [ ] Extract short title from item text (text before em-dash or colon)
  - [ ] Missing/unreadable file or no Future Work section: return empty items array
- [ ] Update barrel export

## Task 11: Future Work Parser Tests

- [ ] Use the `sample-slice-plan.md` fixture (from Task 9) which should include a Future Work section
- [ ] Create `packages/core/tests/introspection/futureWorkParser.test.ts`
  - [ ] Test extracts items from Future Work section with correct index, name, done
  - [ ] Test explicit `(NNN)` index items get that index
  - [ ] Test unnumbered items get sequential indices from `nextIndex`
  - [ ] Test title extraction stops at em-dash or colon
  - [ ] Test nonexistent file returns empty result
  - [ ] Test file with no Future Work section returns empty result
- [ ] Verify: tests pass

## Task 12: Document Detector

- [ ] Create `packages/core/src/introspection/parsers/documentDetector.ts`
  - [ ] `detectDocuments(projectPath: string, sliceIndex: number): Promise<DocumentDetectionResult>` function
  - [ ] Check for files matching naming conventions under `project-documents/user/`:
    - [ ] `slices/{index}-slice.*.md` → `sliceDesign`
    - [ ] `tasks/{index}-tasks.*.md` → `taskFile` (array, supports split files like `*-1.md`, `*-2.md`)
    - [ ] `architecture/{index}-arch.*.md` → `architecture`
    - [ ] `architecture/{index}-slices.*.md` → `slicePlan`
  - [ ] `checkFileExists(projectPath: string, relativePath: string): Promise<boolean>` — helper for explicit path checks (fileHLD, fileArch, etc.)
  - [ ] Use `fs.readdir` + filename matching (not external glob library)
  - [ ] Missing directories: return nulls (no throw)
- [ ] Update barrel export

## Task 13: Document Detector Tests

- [ ] Extend the existing test fixture at `packages/core/tests/fixtures/test-project/` or create a dedicated `packages/core/tests/fixtures/introspection/project/` with a minimal `project-documents/user/` structure containing a few slice, task, and architecture files
- [ ] Create `packages/core/tests/introspection/documentDetector.test.ts`
  - [ ] Test detects existing slice design file for a known index
  - [ ] Test detects task file(s) including split files
  - [ ] Test detects architecture and slice plan files
  - [ ] Test returns null for indices with no matching files
  - [ ] Test `checkFileExists` for existing and nonexistent relative paths
  - [ ] Test nonexistent project path returns all nulls (no throw)
- [ ] Verify: tests pass

**Commit checkpoint: future work parser, document detector + tests**

## Task 14: ArtifactIntrospector Orchestrator

- [ ] Create `packages/core/src/introspection/ArtifactIntrospector.ts`
  - [ ] Implements `IArtifactIntrospector`
  - [ ] Each method delegates to the corresponding parser function, resolving file paths from `projectPath` as needed
  - [ ] `summarize(project: ProjectData): Promise<IntrospectionSummary>`:
    1. [ ] If `fileSlicePlan` + `projectPath` set: parse slice plan, populate `slicePlan` summary
    2. [ ] If `fileTasks` + `projectPath` set: locate task file(s) via document detector, parse, populate `currentTasks` summary
    3. [ ] Check existence of `fileHLD`, `fileArch`, `fileSpec`, `fileSlicePlan` references
    4. [ ] Extract slice index from `fileSlice` (parse `NNN-` prefix), check for current slice design
    5. [ ] Assemble `artifacts` presence flags
  - [ ] Each operation is individually try/caught — failure in one doesn't prevent others
  - [ ] Summary strings: `"N of M slices complete"`, `"N of M tasks done"`
- [ ] Update barrel export in `introspection/index.ts` — add `ArtifactIntrospector`
- [ ] Add Node.js export in `packages/core/src/node.ts`: `export { ArtifactIntrospector } from './introspection/ArtifactIntrospector.js'`
- [ ] Add type exports in `packages/core/src/index.ts`: export `IArtifactIntrospector` and all result types from `introspection/`
- [ ] Verify: `pnpm -r build` succeeds

## Task 15: ArtifactIntrospector Tests

- [ ] Create or extend fixture project directory at `packages/core/tests/fixtures/introspection/project/` with:
  - [ ] `project-documents/user/architecture/` containing a slice plan file with mixed completion
  - [ ] `project-documents/user/slices/` containing a slice design file
  - [ ] `project-documents/user/tasks/` containing a task file with mixed checkboxes
- [ ] Create `packages/core/tests/introspection/ArtifactIntrospector.test.ts`
  - [ ] Test `parseSlicePlan` delegates correctly and returns typed result
  - [ ] Test `parseTaskFile` with single and multiple paths
  - [ ] Test `parseFrontmatter` delegates correctly
  - [ ] Test `parseFutureWork` delegates correctly
  - [ ] Test `detectDocuments` delegates correctly
  - [ ] Test `summarize` with fully populated project: slicePlan summary, currentTasks summary, all artifact flags
  - [ ] Test `summarize` with minimal project (no projectPath): returns empty introspection (no errors)
  - [ ] Test `summarize` with partial data (projectPath but no fileSlicePlan): partial result, no crash
  - [ ] Test individual operation failure doesn't prevent other operations from completing
- [ ] Verify: all tests pass

**Commit checkpoint: ArtifactIntrospector + tests**

## Task 16: Enrich `project_get` MCP Tool

- [ ] Update `packages/mcp-server/src/tools/projectTools.ts`:
  - [ ] Import `ArtifactIntrospector` from `@context-forge/core/node`
  - [ ] In `project_get` handler, after retrieving project: if `project.projectPath` is set, create `ArtifactIntrospector` and call `summarize(project)`
  - [ ] Return `{ ...project, introspection: summary }` when introspection is available
  - [ ] If introspection fails (any error), return project without `introspection` field (graceful degradation, log to stderr)
  - [ ] Projects without `projectPath` return as before (no enrichment)
- [ ] Verify: `pnpm -r build` succeeds

## Task 17: `project_get` Enrichment Tests

- [ ] Update `packages/mcp-server/tests/projectTools.test.ts`:
  - [ ] Add mock for `ArtifactIntrospector` (vi.mock for `@context-forge/core/node`)
  - [ ] Test `project_get` returns `introspection` field when project has `projectPath` and introspection succeeds
  - [ ] Test `project_get` returns project without `introspection` when project has no `projectPath`
  - [ ] Test `project_get` returns project without `introspection` when introspector throws (graceful degradation)
- [ ] Verify: all MCP server tests pass

**Commit checkpoint: project_get enrichment + tests**

## Task 18: Final Verification and Cleanup

- [ ] Run full test suite: `pnpm -r test`
  - [ ] All core tests pass (existing + new introspection tests)
  - [ ] All MCP server tests pass (existing + enrichment tests)
  - [ ] All electron tests pass (unchanged)
- [ ] Run full build: `pnpm -r build`
- [ ] Verify export surface:
  - [ ] `@context-forge/core` exports: `IArtifactIntrospector`, all result types, `NormalizedStatus`
  - [ ] `@context-forge/core/node` exports: `ArtifactIntrospector` class
- [ ] Verify no new npm dependencies were added
- [ ] Final commit with any cleanup

---

*Effort: 3/5. 18 tasks across 4 commit checkpoints. Test-with pattern throughout.*
