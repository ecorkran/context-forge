---
slice: integration-core-test
project: context-forge
lld: user/slices/149-slice.integration-core-test.md
dependencies: [143-core-orchestration-extraction, 144-storage-migration]
projectState: Slices 140-148 complete. Core extraction done, storage migrated, Electron rewired as thin client. 54 core storage tests + 106 Electron tests passing. No existing service-level tests in packages/core.
dateCreated: 20260222
dateUpdated: 20260222
status: complete
docType: tasks
---

## Context Summary

- Working on integration-core-test slice (149)
- All prerequisites complete: core extraction (141-143), storage migration (144), Electron client conversion (148)
- Vitest 3.2.1 configured in `packages/core/vitest.config.ts`; existing test patterns in `tests/storage/` and `tests/pipeline-integration.test.ts`
- Test fixture at `packages/core/tests/fixtures/test-project/` — may need expansion for StatementManager format
- This slice delivers unit tests for all 8 service modules in `packages/core/src/services/`
- Next slice: 150 (MCP Server Integration Testing), which depends on core correctness

---

## Tasks

### Phase 1: Test Infrastructure

- [x] **Task 1: Create shared test helper module** (Effort: 1/5)
  - Create `packages/core/tests/helpers/testData.ts`
  - Implement factory functions referenced in slice design §Shared Test Helpers:
    1. `createTestContextData(overrides?)` — valid `ContextData` with sensible defaults
    2. `createTestEnhancedContextData(overrides?)` — valid `EnhancedContextData`
    3. `createTestProjectData(overrides?)` — valid `ProjectData`
    4. `createMockStatementReader(overrides?)` — mock `IStatementReader` using `vi.fn()`
    5. `createMockPromptReader(overrides?)` — mock `IPromptReader` using `vi.fn()`
  - Import types from `@context-forge/core` and interfaces from `../src/services/interfaces.js`
  - [x] No `any` types
  - [x] Each factory returns a fully valid object (no missing required fields)
  - [x] File compiles with `pnpm build` in `packages/core`

- [x] **Task 2: Expand test fixture for StatementManager format** (Effort: 1/5)
  - The existing `tests/fixtures/test-project/default-statements.md` uses `#####` headers
  - `StatementManager.parseMarkdownStatements()` expects `## headers` with `<!-- key: ..., editable: ... -->` HTML comments
  - Update the fixture to match the production format (see `StatementManager.ts` parser logic)
  - Ensure all 7 default statement keys from `constants.ts` `DEFAULT_STATEMENTS` are present
  - [x] Fixture parses correctly when loaded by `StatementManager`
  - [x] Existing pipeline-integration tests still pass (`pnpm test` in `packages/core`)

- [x] **Task 3: Expand prompt fixture for instruction-matching tests** (Effort: 1/5)
  - The existing `tests/fixtures/test-project/.../prompt.ai-project.system.md` has only 3 sections
  - Add sections needed for testing: `design`, `review`, `monorepo` instruction variants
  - Keep existing sections (`Context Initialization`, `Tool Use`, `implementation`) intact
  - [x] File retains valid YAML frontmatter
  - [x] At least 6 `#####` sections present for comprehensive instruction-matching tests
  - [x] Existing pipeline-integration tests still pass

- [x] **Task 4: Commit — test infrastructure** (Effort: 1/5)
  - Stage and commit: `tests/helpers/testData.ts`, updated fixtures
  - Verify `pnpm test` passes in `packages/core` (existing 54 tests unaffected)
  - [x] Clean commit with descriptive message
  - [x] All existing tests pass

### Phase 2: Pure Logic Service Tests

- [x] **Task 5: TemplateProcessor tests** (Effort: 2/5)
  - Create `packages/core/tests/services/TemplateProcessor.test.ts`
  - Test cases per slice design §1 (TemplateProcessor):
    1. Simple `{{variable}}` substitution
    2. Single-brace `{variable}` substitution
    3. Boolean conditionals `{{#if var}}...{{else}}...{{/if}}`
    4. Slice parsing (`149-slice.integration-core-test` → `sliceindex=149`, `slicename=integration-core-test`)
    5. Alias resolution (`{project}` → `projectName`, `{development-phase}`, `{task-file}`, `{project-date}`)
    6. Missing variable handling
    7. Template validation (`validateTemplate`)
    8. Edge cases: empty template, nested braces, malformed conditionals
  - Use `createTestEnhancedContextData()` from helpers
  - [x] All public methods of `TemplateProcessor` have at least one test
  - [x] Tests pass with `pnpm test` in `packages/core`
  - [x] No `any` types in test code

- [x] **Task 6: Commit — TemplateProcessor tests** (Effort: 1/5)
  - Stage and commit `tests/services/TemplateProcessor.test.ts`
  - [x] Clean commit, all tests pass

### Phase 3: Filesystem Service Tests

- [x] **Task 7: SystemPromptParser tests** (Effort: 2/5)
  - Create `packages/core/tests/services/SystemPromptParser.test.ts`
  - Test cases per slice design §2 (SystemPromptParser):
    1. Parsing `#####` sections from markdown (use fixture file)
    2. Key generation from headers (lowercased, hyphenated)
    3. Parameter extraction (`{param}` patterns in content)
    4. `getPromptForInstruction()` — known instruction match, unknown fallback
    5. `getContextInitializationPrompt()` — regular and monorepo variants
    6. `getToolUsePrompt()` lookup
    7. `getAllPrompts()` complete enumeration
    8. Caching: second call returns cached; cache invalidation on file change
    9. `setFilePath()` clears cache
    10. Error handling: missing file, `validatePromptFile()`
  - Use real fixture file at `tests/fixtures/test-project/.../prompt.ai-project.system.md`
  - For cache TTL tests, use `vi.useFakeTimers()` if needed
  - [x] All public methods have at least one test
  - [x] Caching behavior verified (second call cached, file change invalidates)
  - [x] Tests pass, no `any` types

- [x] **Task 8: StatementManager tests** (Effort: 2/5)
  - Create `packages/core/tests/services/StatementManager.test.ts`
  - Test cases per slice design §3 (StatementManager):
    1. `loadStatements()` from updated fixture markdown file
    2. Parsing HTML comment metadata (`<!-- key: ..., editable: ... -->`)
    3. Fallback to `DEFAULT_STATEMENTS` when file missing
    4. Fallback to defaults on parse error (corrupted file content)
    5. `getStatement()` returns correct content; throws when not loaded
    6. `updateStatement()` — editable check, empty content rejection
    7. `saveStatements()` — atomic write with `.tmp`, directory creation
    8. `setFilePath()` resets loaded state
    9. `resetToDefaults()` restores default statements
    10. Default backfill: missing keys in file filled from defaults
  - Use temp directories for write tests (matching `pipeline-integration.test.ts` pattern)
  - Use fixture file for read-only tests
  - [x] All public methods have at least one test
  - [x] Default fallback behavior verified (missing file → `DEFAULT_STATEMENTS`)
  - [x] Tests pass, no `any` types

- [x] **Task 9: ProjectPathService tests** (Effort: 2/5)
  - Create `packages/core/tests/services/ProjectPathService.test.ts`
  - Test cases per slice design §7 (ProjectPathService):
    1. `validate()` — valid project structure (project-documents/, user/, subdirs)
    2. Invalid paths: empty string, null characters, `..` traversal, non-directory, non-existent
    3. Partial structures: project-documents exists but no user/; user/ exists but no subdirs
    4. `listDirectory()` — files in subdirectory, standard path resolution
    5. `listDirectory()` — monorepo path resolution (`project-artifacts/` base)
    6. `listDirectory()` security: path traversal in subdirectory parameter
    7. `healthCheck()` delegates to `validate()` (same result)
  - Use temp directories created in `beforeEach`, cleaned in `afterEach`
  - [x] All public methods have at least one test
  - [x] Security checks verified (null chars, `..` traversal rejected)
  - [x] Tests pass, no `any` types

- [x] **Task 10: Commit — filesystem service tests** (Effort: 1/5)
  - Stage and commit: SystemPromptParser, StatementManager, ProjectPathService test files
  - [x] Clean commit, all tests pass

### Phase 4: Mock-Injected Service Tests

- [x] **Task 11: SectionBuilder tests** (Effort: 2/5)
  - Create `packages/core/tests/services/SectionBuilder.test.ts`
  - Inject `createMockStatementReader()` and `createMockPromptReader()` from helpers
  - Test cases per slice design §4 (SectionBuilder):
    1. `buildToolsSection()` — with/without tools, with/without MCP servers, with custom `availableTools`
    2. `buildMonorepoSection()` — template variable substitution, custom monorepo note appending
    3. `buildInstructionSection()` — known instruction match, custom/unknown instruction fallback
    4. `buildProjectInfoSection()` — field presence/absence, monorepo vs non-monorepo, null slices
    5. `buildSection()` — conditional evaluation, empty section handling
    6. `buildCurrentEventsSection()` / `buildAdditionalNotesSection()` — empty and populated
    7. `validateSection()` — missing key, missing order, conditional without condition function
    8. `createSection()` — factory produces valid section objects
    9. Config options: `includeEmptySections`, `includeTitles`
  - [x] All public methods have at least one test
  - [x] Mock injection pattern works cleanly (no module-level `vi.mock()`)
  - [x] Tests pass, no `any` types

- [x] **Task 12: Commit — SectionBuilder tests** (Effort: 1/5)
  - Stage and commit `tests/services/SectionBuilder.test.ts`
  - [x] Clean commit, all tests pass

### Phase 5: Integration Service Tests

- [x] **Task 13: ContextTemplateEngine tests** (Effort: 2/5)
  - Create `packages/core/tests/services/ContextTemplateEngine.test.ts`
  - Inject mock `IPromptService` and `IStatementService`
  - Test cases per slice design §5 (ContextTemplateEngine):
    1. `generateContext()` full pipeline: validates → builds template → assembles → formats
    2. `buildTemplate()` section ordering (1 through 7)
    3. Conditional section inclusion: monorepo only when `isMonorepo=true`, recentEvents/additionalNotes only when non-empty
    4. `validateInputData()` — missing required fields (projectName, template, slice, instruction)
    5. `formatOutput()` — collapses multiple newlines, normalizes line endings, trims
    6. Error fallback: `getErrorContext()` when generation fails
    7. `updateServicePaths()` delegates to parser/manager `setFilePath`
    8. `setEnabled()` / `isEnabled()` toggle
  - [x] All public methods have at least one test
  - [x] Conditional section inclusion verified
  - [x] Tests pass, no `any` types

- [x] **Task 14: ContextIntegrator tests** (Effort: 2/5)
  - Create `packages/core/tests/services/ContextIntegrator.test.ts`
  - Inject mock `ContextTemplateEngine` (or use `vi.fn()` to mock its methods)
  - Test cases per slice design §6 (ContextIntegrator):
    1. `generateContextFromProject()` delegates to engine when enabled
    2. Legacy fallback: `generateWithLegacySystem()` using `DEFAULT_TEMPLATE`
    3. `mapProjectToEnhancedContext()` — field mapping, defaults for missing fields
    4. `mapProjectToContext()` — legacy field mapping with defaults
    5. `validateProject()` — null, undefined, missing required fields
    6. `setNewEngineEnabled()` toggling between new and legacy
    7. Error handling: engine throws → returns error context
    8. `updateServicePaths()` called with correct absolute paths from `projectPath`
  - [x] All public methods have at least one test
  - [x] Legacy fallback behavior verified
  - [x] Tests pass, no `any` types

- [x] **Task 15: CoreServiceFactory tests** (Effort: 1/5)
  - Create `packages/core/tests/services/CoreServiceFactory.test.ts`
  - Test cases per slice design §8 (CoreServiceFactory):
    1. `createContextPipeline()` returns `{ engine, integrator }` with correct types
    2. Pipeline wires correct file paths from `projectPath` + constants
    3. Generated context from fixture project is non-empty and contains expected content
  - Use real fixture project at `tests/fixtures/test-project/`
  - [x] Pipeline creation succeeds with fixture project path
  - [x] Generated context contains expected project name and structure
  - [x] Tests pass, no `any` types

- [x] **Task 16: Commit — integration service tests** (Effort: 1/5)
  - Stage and commit: ContextTemplateEngine, ContextIntegrator, CoreServiceFactory test files
  - [x] Clean commit, all tests pass

### Phase 6: Final Validation

- [x] **Task 17: Full test suite verification** (Effort: 1/5)
  - Run `pnpm test` in `packages/core` — all tests must pass (existing 54 + new service tests)
  - Verify no test depends on Electron APIs or browser globals
  - Verify no `any` types in any test file (grep for `: any` and `as any`)
  - Run `pnpm build` in workspace root — clean build
  - [x] All tests pass
  - [x] No Electron dependencies in test imports
  - [x] No `any` types in test code
  - [x] Workspace builds clean

- [x] **Task 18: Final commit and DEVLOG update** (Effort: 1/5)
  - If any uncommitted changes remain, stage and commit
  - Update `DEVLOG.md` with Slice 149 implementation entry (list commit hashes)
  - [x] DEVLOG updated with implementation summary
  - [x] All work committed
