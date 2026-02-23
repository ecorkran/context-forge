---
docType: slice-design
slice: integration-core-test
project: context-forge
parent: project-documents/user/architecture/140-slices.context-forge-restructure.md
dependencies: [143-core-orchestration-extraction, 144-storage-migration]
interfaces: [150-mcp-server-integration-testing]
status: complete
dateCreated: 20260222
dateUpdated: 20260222
---

# Slice Design: Core Test Suite

## Overview

Comprehensive unit tests for all services in `packages/core/src/services/`, validating that the extraction from Electron preserved behavior and that the context assembly pipeline works correctly end-to-end without any Electron dependencies.

## Value

- **Developer confidence**: Validates that the core extraction (Slices 141-143) preserved all behavior. Tests serve as a regression safety net for future changes.
- **Architectural enablement**: Provides the foundation for Slice 150 (MCP Server Integration Testing), which depends on core correctness.
- **Documentation by example**: Tests serve as living documentation of how each service is intended to be used.

## Technical Scope

### In Scope

Unit tests for these untested service modules:
- `TemplateProcessor` — Variable substitution, conditionals, slice parsing
- `SystemPromptParser` — Markdown section parsing, caching, instruction lookup
- `StatementManager` — Statement loading from file, defaults fallback, CRUD
- `SectionBuilder` — Section assembly for tools, instructions, project info, monorepo
- `ContextTemplateEngine` — Full template generation orchestration
- `ContextIntegrator` — Project-to-context mapping, legacy/new engine switching
- `ProjectPathService` — Path validation, directory listing, security checks
- `CoreServiceFactory` — Pipeline wiring (`createContextPipeline`)

### Out of Scope

- Storage layer tests (already 54 tests passing — `FileProjectStore`, `FileStorageService`, `backupService`)
- MCP server tests (covered by Slice 150)
- Electron IPC tests (already 106 tests in `packages/electron`)
- Performance benchmarking
- E2E tests requiring a running Electron or MCP server process

### Note on Existing Tests

`TemplateProcessor` (16 tests) and `ProjectPathService` (19 tests) already exist in `packages/electron/tests/`. This slice creates canonical versions in `packages/core/tests/` that test the core implementations directly, not through IPC wrappers. The Electron tests may be retained or deprecated at the project manager's discretion in a future cleanup slice.

## Dependencies

### Prerequisites

- Slices 141-144 complete (core extraction and storage migration) — **Done**
- Existing test fixture at `packages/core/tests/fixtures/test-project/` — **Available**
- Vitest 3.2.1 configured in `packages/core/vitest.config.ts` — **Available**

### Interfaces Required

- `IStatementReader` / `IStatementService` — interfaces for mocking statement access
- `IPromptReader` / `IPromptService` — interfaces for mocking prompt access
- `EnhancedContextData` / `ContextData` types — test data construction
- `ProjectData` type — test project construction
- `DEFAULT_STATEMENTS` from `constants.ts` — expected fallback values

## Architecture

### Test Directory Structure

```
packages/core/tests/
├── fixtures/
│   └── test-project/                 # Existing fixture (expand as needed)
│       ├── default-statements.md
│       └── project-documents/
│           └── ai-project-guide/
│               └── project-guides/
│                   └── prompt.ai-project.system.md
├── helpers/
│   └── testData.ts                   # Shared factory functions for test data
├── services/
│   ├── TemplateProcessor.test.ts
│   ├── SystemPromptParser.test.ts
│   ├── StatementManager.test.ts
│   ├── SectionBuilder.test.ts
│   ├── ContextTemplateEngine.test.ts
│   ├── ContextIntegrator.test.ts
│   ├── ProjectPathService.test.ts
│   └── CoreServiceFactory.test.ts
├── storage/                          # Existing (keep as-is)
│   ├── FileProjectStore.test.ts
│   ├── FileStorageService.test.ts
│   └── backupService.test.ts
└── pipeline-integration.test.ts      # Existing (keep as-is)
```

### Testing Strategy by Service

#### 1. TemplateProcessor (Unit — Pure Logic)
No filesystem dependencies. Tests exercise:
- Simple `{{variable}}` substitution
- Single-brace `{variable}` substitution
- Boolean conditionals `{{#if var}}...{{else}}...{{/if}}`
- Slice parsing (`149-slice.integration-core-test` → `sliceindex=149`, `slicename=integration-core-test`)
- Alias resolution (`{project}` → `projectName`, `{development-phase}`, `{task-file}`, `{project-date}`)
- Missing variable handling (warn, return empty or expression)
- Template validation (`validateTemplate`)
- Edge cases: empty template, nested braces, malformed conditionals

#### 2. SystemPromptParser (Unit + Filesystem)
Requires real fixture files. Tests exercise:
- Parsing `#####` sections from markdown
- Key generation from headers (lowercased, hyphenated)
- Parameter extraction (`{param}` patterns in content)
- `getPromptForInstruction()` fuzzy matching
- `getContextInitializationPrompt()` — regular and monorepo variants
- `getToolUsePrompt()` lookup
- `getAllPrompts()` complete enumeration
- Caching behavior: second call returns cached; cache invalidation on file change; TTL expiry
- `setFilePath()` clears cache
- Error handling: missing file throws, validates structure
- `validatePromptFile()` — frontmatter check, section count

#### 3. StatementManager (Unit + Filesystem)
Tests exercise:
- `loadStatements()` from fixture markdown file
- Parsing HTML comment metadata (`<!-- key: ..., editable: ... -->`)
- Fallback to `DEFAULT_STATEMENTS` when file missing
- Fallback to defaults on parse error (corrupted file)
- `getStatement()` returns correct content; throws when not loaded
- `updateStatement()` — editable check, empty content rejection
- `saveStatements()` — atomic write with `.tmp`, directory creation
- `setFilePath()` resets loaded state
- `resetToDefaults()` restores default statements
- Default backfill: missing keys in file are filled from defaults

#### 4. SectionBuilder (Unit — Mocked Dependencies)
Inject mock `IStatementReader` and `IPromptReader`. Tests exercise:
- `buildToolsSection()` — with/without tools, with/without MCP servers, with custom `availableTools`
- `buildMonorepoSection()` — template variable substitution, custom monorepo note appending
- `buildInstructionSection()` — known instruction match, custom/unknown instruction fallback
- `buildProjectInfoSection()` — field presence/absence, monorepo vs non-monorepo, null slices
- `buildSection()` — conditional evaluation, empty section handling based on config
- `buildCurrentEventsSection()` / `buildAdditionalNotesSection()` — empty and populated cases
- `validateSection()` — missing key, missing order, conditional without condition function
- `createSection()` — factory method produces valid section objects
- Config options: `includeEmptySections`, `includeTitles`

#### 5. ContextTemplateEngine (Integration — Mocked Services)
Inject mock `IPromptService` and `IStatementService`. Tests exercise:
- `generateContext()` full pipeline: validates input → builds template → assembles sections → formats output
- `buildTemplate()` section ordering (1 through 7)
- Conditional section inclusion: monorepo section only when `isMonorepo=true`, recentEvents only when non-empty, additionalNotes only when non-empty
- `validateInputData()` — missing required fields (projectName, template, slice, instruction)
- `formatOutput()` — collapses multiple newlines, normalizes line endings, trims
- Error fallback: `getErrorContext()` when generation fails
- `updateServicePaths()` delegates to parser/manager `setFilePath`
- `setEnabled()` / `isEnabled()` toggle

#### 6. ContextIntegrator (Integration — Mocked Engine)
Tests exercise:
- `generateContextFromProject()` delegates to template engine when enabled
- Legacy fallback: `generateWithLegacySystem()` using `DEFAULT_TEMPLATE`
- `mapProjectToEnhancedContext()` — field mapping, defaults for missing fields
- `mapProjectToContext()` — legacy field mapping with defaults
- `validateProject()` — null, undefined, missing required fields
- `setNewEngineEnabled()` toggling between new and legacy
- Error handling: engine throws → returns error context
- `updateServicePaths()` called with correct absolute paths from `projectPath`

#### 7. ProjectPathService (Unit + Filesystem)
Uses temp directories. Tests exercise:
- `validate()` — valid project structure (with project-documents/, user/, subdirs)
- Invalid paths: empty string, null characters, `..` traversal, non-directory, non-existent
- Partial structures: project-documents exists but no user/, user/ exists but no subdirs
- `listDirectory()` — files in subdirectory, monorepo vs standard path resolution
- `listDirectory()` security: path traversal in subdirectory parameter
- Permission errors (where feasible on the platform)
- `healthCheck()` delegates to `validate()`

#### 8. CoreServiceFactory (Integration — Real Services)
Uses fixture project. Tests exercise:
- `createContextPipeline()` returns `{ engine, integrator }` with correct types
- Pipeline wires correct file paths from `projectPath` + constants
- Generated context from fixture project is non-empty and contains expected content

### Shared Test Helpers (`tests/helpers/testData.ts`)

Factory functions to reduce boilerplate:
- `createTestContextData(overrides?)` — returns a valid `ContextData` with sensible defaults
- `createTestEnhancedContextData(overrides?)` — returns a valid `EnhancedContextData`
- `createTestProjectData(overrides?)` — returns a valid `ProjectData`
- `createMockStatementReader(overrides?)` — returns a mock `IStatementReader`
- `createMockPromptReader(overrides?)` — returns a mock `IPromptReader`

## Technical Decisions

### Patterns and Conventions

- **Mocking strategy**: Use `vi.fn()` for interface mocks (not `vi.mock()` for module substitution) when testing services that accept dependency injection via constructor. Reserve `vi.mock()` for `fs` module in `SystemPromptParser` and `StatementManager` only if temp-file approach proves insufficient.
- **Filesystem tests**: Prefer real temp directories (matching existing pipeline-integration.test.ts pattern) over mocking `fs`. This gives higher confidence and matches established project convention.
- **Test isolation**: Each test gets its own temp directory via `beforeEach`/`afterEach`, using `CONTEXT_FORGE_DATA_DIR` env override where needed.
- **Assertion style**: Use Vitest's `expect()` with specific matchers (`toContain`, `toMatch`, `toThrow`) rather than generic truthiness.

### Fixture Expansion

The existing fixture at `tests/fixtures/test-project/` has minimal content. It may need:
- A `default-statements.md` with all statement keys (currently uses `#####` headers instead of `##` + HTML comments — verify against `StatementManager.parseMarkdownStatements()` format)
- Additional prompt sections in `prompt.ai-project.system.md` for instruction-matching tests (e.g., `design`, `review`, `monorepo` variants)

If the existing fixture format conflicts with `StatementManager`'s parser (which expects `## headers` with `<!-- key: ... -->` comments), create a second fixture or update the existing one to match the actual production format.

## Success Criteria

### Functional Requirements

- [ ] Every public method of each service module has at least one test
- [ ] Happy path and primary error paths covered for each service
- [ ] Context generation from fixture project produces expected output structure (sections in correct order, variables substituted)
- [ ] Template conditionals correctly include/exclude sections based on data
- [ ] Cache behavior verified (SystemPromptParser returns cached on second call, invalidates on file change)
- [ ] Default fallback behavior verified (StatementManager falls back to DEFAULT_STATEMENTS when file missing)

### Technical Requirements

- [ ] All tests pass with `pnpm test` in `packages/core`
- [ ] No test depends on Electron APIs or browser globals
- [ ] Test helper module provides reusable factories (no duplicated test data construction)
- [ ] Tests follow existing patterns from `storage/` and `pipeline-integration.test.ts`
- [ ] No `any` types in test code

## Implementation Notes

### Development Approach

Suggested implementation order (dependency-driven):

1. **Test helpers** (`testData.ts`) — shared factories used by all tests
2. **TemplateProcessor** — pure logic, no dependencies, fastest to write
3. **SystemPromptParser** — filesystem tests, may need fixture updates
4. **StatementManager** — filesystem tests, validates fixture format
5. **SectionBuilder** — depends on understanding statement/prompt mocks
6. **ContextTemplateEngine** — integration of above services
7. **ContextIntegrator** — integration of engine + project mapping
8. **ProjectPathService** — independent, can be done in any order
9. **CoreServiceFactory** — quick integration test using fixture project

### Effort Estimate

Relative effort: **2/5** (as per slice plan)

- ~8 test files + 1 helper module
- Estimated 40-60 test cases total
- Leverages existing patterns and fixture infrastructure
