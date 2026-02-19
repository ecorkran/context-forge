# Development Log

A lightweight, append-only record of development activity. Newest entries first.

Format: `## YYYY-MM-DD` followed by brief notes (1-3 lines per session).

---

## 2026-02-18

### Slice 143: Core Orchestration Extraction — Complete
- Implementation complete: 4 commits (aaa9f7a → 121841d), all 15 tasks done
- Extracted ContextGenerator, ContextTemplateEngine, ContextIntegrator + CoreServiceFactory to `packages/core/src/services/`
- Extended IPromptReader with `getContextInitializationPrompt()`; added IStatementService/IPromptService; added setFilePath() to SystemPromptParser and StatementManager
- Constructor injection pattern: ContextTemplateEngine takes IPromptService/IStatementService; ContextIntegrator takes ContextTemplateEngine
- `createContextPipeline(projectPath)` in CoreServiceFactory wires the full pipeline for MCP/CLI consumers
- Removed obsolete ContextGenerator interface from types (replaced by class); fixed IPCIntegration.test.ts dynamic imports
- Full workspace builds clean; 155/163 tests pass (same 8 pre-existing failures)

### Slice 143: Core Orchestration Extraction — Design Complete
- Slice design: `143-slice.core-orchestration-extraction.md` — extracts ContextTemplateEngine, ContextIntegrator, ContextGenerator, and CoreServiceFactory to `packages/core/src/services/`
- Key decisions: extend IPromptReader with `getContextInitializationPrompt()`; new `IStatementService`/`IPromptService` interfaces; constructor injection (no default ServiceFactory in core); `createContextPipeline()` convenience factory
- Scope: ~580 lines of orchestration code, 5 Electron consumer files to update, ServiceFactory stays in Electron for IPC wrapper creation
- Also marked slice 142 complete in 140-slices plan
- Commits: 67f600e

### Slice 142: Core Services Extraction — Complete
- Implementation complete: 4 commits (7c52150 → 0d26f0b), all 12 tasks done
- Extracted 5 services to `packages/core/src/services/`: TemplateProcessor, SystemPromptParser, StatementManager, SectionBuilder, ProjectPathService
- Added `services/constants.ts` (DEFAULT_STATEMENTS, file path constants) and `services/interfaces.ts` (IStatementReader, IPromptReader)
- Updated 8 Electron consumer files to import from `@context-forge/core`; deleted 5 original service files from Electron
- Required infrastructure fix: added `@types/node` + `types:["node"]` to core tsconfig (services use `fs`/`path`, lib was ES2023 only)
- Fixed `EnhancedContextData` import location (context.ts not sections.ts); removed unused `path` import from SystemPromptParser
- Fixed `ProjectPathService` broken `./types` import (file deleted in slice 141) — resolved to `../types/paths.js`
- Full workspace builds clean (`pnpm -r build`), 155/163 tests pass (same 8 pre-existing failures)

### Slice 142: Core Services Extraction — Design Complete
- Slice design: `142-slice.core-services-extraction.md` — extracts 5 services (TemplateProcessor, SystemPromptParser, StatementManager, SectionBuilder, ProjectPathService) to `packages/core/src/services/`
- Key decisions: keep Node.js `fs` as-is (core is a Node.js package, not browser), define minimal interfaces (`IStatementReader`, `IPromptReader`) for SectionBuilder's dependency injection
- Scope: relocation not redesign, ~1315 lines of service code, ~8 consumer files to update
- Found broken import in `ProjectPathService` (`./types` deleted in slice 141) — will fix during extraction
- Domain constants (`DEFAULT_STATEMENTS`, file path constants) exported from core

## 2026-02-17
### Slice 141: Core Types Extraction — Complete
- Implementation complete: 8 commits (a4537a7 → 8e7ba18), all 10 tasks done
- Created 6 type modules in `packages/core/src/types/` (context, sections, statements, prompts, project, paths)
- Updated 21 consumer files in Electron to import from `@context-forge/core`
- Deleted 11 original type files, removed 2 empty `types/` directories
- Found and fixed 3 additional inline `import()` type references in `StorageClient.ts`
- Full workspace builds clean, 155/163 tests pass (8 pre-existing failures unchanged)
- Zero stale imports remain — all types now sourced from `@context-forge/core`

### Slice 141: Core Types Extraction — Design & Tasks Created
- Slice design complete: `141-slice.core-types-extraction.md` — consolidates duplicated type hierarchies (main-process vs renderer-process) into `packages/core/src/types/`
- Key design decisions: renderer `ContextData` superset as canonical definition, `EnhancedContextData` deduplicated from 3 definitions to 1, enums preserved as-is, no re-export shims
- Task breakdown complete: `141-tasks.core-types-extraction.md` — 10 tasks covering 6 type modules, barrel exports, ~26 consumer import updates across ~20 files, deletion of 11 original type files
- `AppState`/`WindowBounds` intentionally kept in Electron (UI-specific, deferred to storage migration)
- Scope: types only, zero runtime behavior change, verified by compiler + existing test suite

### Slice 140: Monorepo Scaffolding — Complete
- 8 commits on main (d18e39d → 08e7d2c), foundation slice checked off in 140-slices
- Created pnpm workspace with 3 packages: `@context-forge/core`, `context-forge-mcp`, `@context-forge/electron`
- All packages build in topological order (core → mcp-server → electron), workspace symlinks working
- `.npmrc` with `public-hoist-pattern[]=electron` required — pnpm strict mode prevents electron-vite from resolving the electron binary; hoisting fixes this without affecting published packages
- `electron.vite.config.ts` needed two path fixes after move: vite-plugin-content import (`../../lib/vite/...`) and content alias (`../../content`)
- Root tsconfig.json converted to project-references; root package.json stripped to workspace orchestrator
- 157/163 tests pass (6 pre-existing failures logged to 999-tasks.maintenance-ongoing.md — stale IPC test mocks and prompt path expectations)
- Dependency isolation confirmed: core has zero runtime deps, mcp-server depends only on core — no electron/UI leakage to MCP consumers
- Pending: manual verification of Electron launch + core app functionality
- Next: Slice 2 (Core Types Extraction)

## 2026-02-07

- Reorganized slice 125 for macOS-only focus; deferred Linux (126) and Windows (127)
- Reduced packaging tasks from 64 to ~20 focused items across 5 phases
- Resolved unchecked tasks: deferred 101.10.4, checked 105 criteria, deferred 110 loading states
- Logged 6 test failures (all infrastructure/mocking, no code bugs) to 900-tasks.test-infrastructure-deferred.md
- Increased character limits: Project State, Additional Instructions, Monorepo Structure from 8K → 32K
- Established hybrid PR strategy: batch small changes into tasks, create PRs for feature-complete slices
- Ready to begin Phase 1: unsigned macOS DMG build

## 2025-01-16

- Resumed project after ~2 month hiatus
- Evaluated context-forge vs context-forge-pro state with AI assistance
- Decision: continue in Pro repo, Mac-only packaging initially
- Added DEVLOG.md for better project continuity

## 2025-11-18 (reconstructed from git)

- Last active development before hiatus
- Updated window title to 'Context Forge Pro'
- Initialized ai-project-guide submodule
- Established Pro/Free sync infrastructure

## 2025-11-17 (reconstructed from git)

- Completed maintenance slice (900-tasks.maintenance.md)
- Fixed undo/redo in textarea fields (Issue #21)
- Added development-phase field for context output
- Task file auto-population from slice names

---

*Entries below this line are reconstructed from git history and task files.*

## 2025-10 (summary)

- MVP feature completion
- Multi-project support finalized
- Context generation engine stable
- Monorepo mode settings added

## 2025-09 (summary)

- Initial maintenance infrastructure
- Application menu implementation
- Core slice completion (100-115)
