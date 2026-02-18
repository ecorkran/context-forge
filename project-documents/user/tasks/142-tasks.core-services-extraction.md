---
slice: core-services-extraction
project: context-forge
lld: user/slices/142-slice.core-services-extraction.md
dependencies: [core-types-extraction]
projectState: Slice 141 complete. packages/core has types/ with all shared types exported from @context-forge/core. Electron builds clean. 155/163 tests pass (8 pre-existing failures).
dateCreated: 20260218
dateUpdated: 20260218
status: not started
---

## Context Summary
- Extracts 5 services from `packages/electron/` into `packages/core/src/services/`
- Relocation only — no functional changes, no new abstractions beyond required interface decoupling
- `SectionBuilder` requires `IStatementReader`/`IPromptReader` interfaces because its current constructor types (`StatementManagerIPC`, `SystemPromptParserIPC`) are Electron-specific
- `ProjectPathService` has a broken `./types` import (deleted in slice 141) — fixed during extraction
- `DEFAULT_STATEMENTS` constant moves from `StatementManager.ts` into `services/constants.ts`
- 8 Electron consumer files need import path updates; IPC wrappers are not touched
- Verification target: 155/163 tests pass (same pre-existing failures as after slice 141)

---

## Tasks

### Task 1: Create supporting files in core services
**Objective**: Create the `services/` directory with `constants.ts` and `interfaces.ts` before extracting any services.
**Effort**: 1/5

- [ ] **1.1: Create `packages/core/src/services/constants.ts`**
  - Move `DEFAULT_STATEMENTS` from `packages/electron/src/main/services/context/StatementManager.ts` (do not delete yet — deletion is Task 11)
  - Add `STATEMENTS_FILE_RELATIVE_PATH = 'default-statements.md'` (currently in `StatementManagerIPC.ts`)
  - Add `PROMPT_FILE_RELATIVE_PATH = 'project-documents/ai-project-guide/project-guides/prompt.ai-project.system.md'` (currently in `SystemPromptParserIPC.ts`)
  - Import `TemplateStatement` from `../types/statements.js` (needed by `DEFAULT_STATEMENTS` type)
  - All relative imports use `.js` extensions (nodenext requirement)
  - **Success**: File exports `DEFAULT_STATEMENTS`, `STATEMENTS_FILE_RELATIVE_PATH`, `PROMPT_FILE_RELATIVE_PATH` with no TypeScript errors

- [ ] **1.2: Create `packages/core/src/services/interfaces.ts`**
  - Define `IStatementReader` with method `getStatement(key: string): string`
  - Define `IPromptReader` with methods `getToolUsePrompt(): Promise<SystemPrompt | null>` and `getPromptForInstruction(instruction: string): Promise<SystemPrompt | null>`
  - Import `SystemPrompt` from `../types/prompts.js`
  - **Success**: File exports both interfaces, no TypeScript errors

- [ ] **1.3: Commit — supporting files**
  - Stage `packages/core/src/services/constants.ts` and `interfaces.ts`
  - Commit: `feat(core): add services constants and interfaces for slice 142`
  - **Success**: Clean commit, `git status` is clean

---

### Task 2: Extract TemplateProcessor
**Objective**: Copy `TemplateProcessor` from Electron renderer services into core.
**Effort**: 1/5

- [ ] **2.1: Copy and update `TemplateProcessor.ts`**
  - Source: `packages/electron/src/services/context/TemplateProcessor.ts`
  - Destination: `packages/core/src/services/TemplateProcessor.ts`
  - Change `ContextData` import from `@context-forge/core` to relative `../types/context.js`
  - No other changes needed (pure logic, no Electron dependencies)
  - **Success**: File compiles, imports resolve, no TypeScript errors

---

### Task 3: Extract SystemPromptParser
**Objective**: Copy `SystemPromptParser` from Electron main-process services into core.
**Effort**: 1/5

- [ ] **3.1: Copy and update `SystemPromptParser.ts`**
  - Source: `packages/electron/src/main/services/context/SystemPromptParser.ts`
  - Destination: `packages/core/src/services/SystemPromptParser.ts`
  - Update type imports to relative paths (e.g., `../types/prompts.js`)
  - Remove the unused `path` import (dead import — remove, not a behavioral change)
  - Ensure `.js` extensions on all relative imports
  - **Success**: File compiles with no unused imports and no TypeScript errors

---

### Task 4: Extract StatementManager
**Objective**: Copy `StatementManager` from Electron main-process services into core.
**Effort**: 1/5

- [ ] **4.1: Copy and update `StatementManager.ts`**
  - Source: `packages/electron/src/main/services/context/StatementManager.ts`
  - Destination: `packages/core/src/services/StatementManager.ts`
  - Remove the `DEFAULT_STATEMENTS` constant definition (now in `constants.ts`)
  - Add import: `import { DEFAULT_STATEMENTS } from './constants.js';`
  - Update type imports to relative paths (e.g., `../types/statements.js`)
  - Ensure `.js` extensions on all relative imports
  - **Success**: File compiles, `DEFAULT_STATEMENTS` imported from `./constants.js`, no TypeScript errors

---

### Task 5: Extract ProjectPathService
**Objective**: Copy `ProjectPathService` from Electron main-process services into core and fix the broken import.
**Effort**: 1/5

- [ ] **5.1: Copy and update `ProjectPathService.ts`**
  - Source: `packages/electron/src/main/services/project/ProjectPathService.ts`
  - Destination: `packages/core/src/services/ProjectPathService.ts`
  - Fix broken import: line 3 imports from `'./types'` (deleted in slice 141) — change to `'../types/paths.js'`
  - Ensure `.js` extensions on all relative imports
  - **Success**: File compiles, `PathValidationResult`/`DirectoryListResult` resolve from `../types/paths.js`, no TypeScript errors

---

### Task 6: Extract SectionBuilder
**Objective**: Copy `SectionBuilder` from Electron renderer services into core with interface decoupling.
**Effort**: 2/5

SectionBuilder is last because it depends on `interfaces.ts` and `TemplateProcessor` (both already in core after Tasks 1-2).

- [ ] **6.1: Copy and update `SectionBuilder.ts`**
  - Source: `packages/electron/src/services/context/SectionBuilder.ts`
  - Destination: `packages/core/src/services/SectionBuilder.ts`
  - Replace `StatementManagerIPC` import with `IStatementReader` from `./interfaces.js`
  - Replace `SystemPromptParserIPC` import with `IPromptReader` from `./interfaces.js`
  - Update constructor parameter types: `statementManager: IStatementReader`, `promptParser: IPromptReader`
  - Update private field types to match the interface types
  - Replace `TemplateProcessor` import with relative `./TemplateProcessor.js`
  - Update all other type imports to relative paths (e.g., `../types/sections.js`)
  - Ensure `.js` extensions on all relative imports
  - **Success**: File compiles, constructor accepts interface types, no Electron-specific imports remain

---

### Task 7: Create barrel exports in core
**Objective**: Wire up services barrel and update core's root index so all services are importable from `@context-forge/core`.
**Effort**: 1/5

- [ ] **7.1: Create `packages/core/src/services/index.ts`**
  - Export interfaces: `export type { IStatementReader, IPromptReader } from './interfaces.js';`
  - Export constants: `export { DEFAULT_STATEMENTS, STATEMENTS_FILE_RELATIVE_PATH, PROMPT_FILE_RELATIVE_PATH } from './constants.js';`
  - Export each service class: `TemplateProcessor`, `SystemPromptParser`, `StatementManager`, `SectionBuilder`, `ProjectPathService`
  - All imports use `.js` extensions
  - **Success**: File re-exports all 5 services, 2 interfaces, and 3 constants

- [ ] **7.2: Update `packages/core/src/index.ts`**
  - Add `export * from './services/index.js';` below the existing types re-export
  - **Success**: Root barrel exports both types and services

- [ ] **7.3: Commit — services extracted, core self-contained**
  - Stage all new files in `packages/core/src/services/` and updated `packages/core/src/index.ts`
  - Commit: `feat(core): extract 5 services into packages/core (slice 142)`
  - **Success**: Clean commit, `git status` is clean

---

### Task 8: Build core package
**Objective**: Verify `packages/core` compiles fully with services before touching any Electron files.
**Effort**: 1/5

- [ ] **8.1: Run `pnpm --filter @context-forge/core build`**
  - Must complete with zero errors
  - **Success**: `packages/core/dist/` contains `.js` and `.d.ts` for all 5 service files plus `constants`, `interfaces`, and `services/index`

- [ ] **8.2: Spot-check dist output**
  - Verify `dist/index.d.ts` re-exports service classes and interfaces
  - Verify `dist/services/SectionBuilder.d.ts` constructor signature uses `IStatementReader`/`IPromptReader`
  - **Success**: Type declarations match expectations, no Electron types present in core dist

- [ ] **8.3: Commit — core build verified**
  - Commit: `chore(core): verify services build clean (slice 142 checkpoint)`
  - **Success**: Clean commit, build artifacts confirmed

---

### Task 9: Update Electron consumers
**Objective**: Update all 8 Electron files that import from the now-extracted services.
**Effort**: 2/5

Pattern for each: change local/relative import to `@context-forge/core`. Merge with existing `@context-forge/core` imports if present.

- [ ] **9.1: Update `src/services/context/ContextIntegrator.ts`**
  - Change `TemplateProcessor` import from local path to `@context-forge/core`
  - **Success**: No local reference to `./TemplateProcessor` remains

- [ ] **9.2: Update `src/services/context/ContextTemplateEngine.ts`**
  - Change `TemplateProcessor` and `SectionBuilder` imports to `@context-forge/core`
  - **Success**: No local references to `./TemplateProcessor` or `./SectionBuilder` remain

- [ ] **9.3: Update `src/services/context/__tests__/TemplateProcessor.test.ts`**
  - Change `TemplateProcessor` import from `../TemplateProcessor` to `@context-forge/core`
  - **Success**: Import resolves from core

- [ ] **9.4: Update `src/main/ipc/contextServices.ts`**
  - Change `StatementManager` and `SystemPromptParser` imports to `@context-forge/core`
  - **Success**: No local references to `../services/context/StatementManager` or `../services/context/SystemPromptParser`

- [ ] **9.5: Update `src/main/ipc/projectPathHandlers.ts`**
  - Change `ProjectPathService` import to `@context-forge/core`
  - **Success**: No local reference to `../services/project/ProjectPathService`

- [ ] **9.6: Update `src/main/services/project/__tests__/ProjectPathService.test.ts`**
  - Change `ProjectPathService` import from `../ProjectPathService` to `@context-forge/core`
  - **Success**: Import resolves from core

- [ ] **9.7: Update `src/services/context/index.ts`**
  - Change `TemplateProcessor` and `SectionBuilder` re-exports to source from `@context-forge/core`
  - Preserve any other exports in the file unchanged
  - **Success**: No references to local `./TemplateProcessor` or `./SectionBuilder`

- [ ] **9.8: Update `src/main/services/context/index.ts`**
  - Change `StatementManager` and `SystemPromptParser` re-exports to source from `@context-forge/core`
  - Preserve any other exports in the file unchanged
  - **Success**: No references to local `./StatementManager` or `./SystemPromptParser`

- [ ] **9.9: Commit — consumers updated**
  - Stage all updated consumer files in `packages/electron/`
  - Commit: `refactor(electron): update service imports to @context-forge/core (slice 142)`
  - **Success**: Clean commit, `git status` is clean

---

### Task 10: Build verification before deletion
**Objective**: Confirm the workspace builds cleanly with new import paths while original files still exist as a safety net.
**Effort**: 1/5

If any import was missed in Task 9, the build will fail here — and the old files are still present to diagnose and fix without data loss. Do not proceed to Task 11 if this step fails.

- [ ] **10.1: Run `pnpm -r build`**
  - Full workspace build in topological order (core → mcp-server → electron)
  - **Success**: All packages build with zero errors and zero type errors

- [ ] **10.2: Verify no stale imports remain**
  - Grep `packages/electron/src/` for references to the soon-to-be-deleted paths:
    - `services/context/TemplateProcessor`
    - `services/context/SectionBuilder`
    - `services/context/StatementManager`
    - `services/context/SystemPromptParser`
    - `services/project/ProjectPathService`
  - Exclude the original source files themselves from grep results
  - **Success**: Zero matches in non-source (consumer) files

---

### Task 11: Delete original service files from Electron
**Objective**: Remove the now-redundant service files from `packages/electron/`.
**Effort**: 1/5

Use `git rm` to preserve history.

- [ ] **11.1: Delete renderer service files**
  - `src/services/context/TemplateProcessor.ts`
  - `src/services/context/SectionBuilder.ts`
  - **Success**: Files deleted, no dangling imports

- [ ] **11.2: Delete main-process service files**
  - `src/main/services/context/SystemPromptParser.ts`
  - `src/main/services/context/StatementManager.ts`
  - `src/main/services/project/ProjectPathService.ts`
  - **Success**: Files deleted, no dangling imports

- [ ] **11.3: Check for empty directories**
  - Verify `src/main/services/project/` — if only `__tests__/` remains, directory is fine; if empty, remove it
  - **Success**: No orphaned empty directories

---

### Task 12: Final build and test verification
**Objective**: Confirm entire workspace builds and all tests pass after deletion.
**Effort**: 1/5

- [ ] **12.1: Run `pnpm --filter @context-forge/core build`**
  - **Success**: Zero errors, dist output present

- [ ] **12.2: Run `pnpm --filter @context-forge/electron build`**
  - **Success**: Zero type errors, Electron app builds

- [ ] **12.3: Run `pnpm --filter @context-forge/electron test:run`**
  - Expected: 155/163 pass (same 8 pre-existing failures — no new failures)
  - **Success**: Test count matches baseline

- [ ] **12.4: Run `pnpm -r build`**
  - **Success**: All three packages build without errors

- [ ] **12.5: Commit — deletion and verification complete**
  - Stage deleted files and any post-deletion cleanup
  - Commit: `chore(electron): remove extracted service files after core migration (slice 142)`
  - **Success**: Clean commit, slice 142 complete

---

### Task 13: Optional — squash and clean up
**Objective**: Optionally squash the 5 slice commits into a single logical commit for a cleaner history.
**Effort**: 1/5

This task is optional. Perform only if the team prefers a single commit per slice in the main branch history.

- [ ] **13.1: Interactive rebase to squash slice 142 commits**
  - Squash commits from Tasks 1.3, 7.3, 8.3, 9.9, and 12.5 into one
  - Combined message: `feat: extract core services into @context-forge/core (slice 142)`
  - **Success**: Single clean commit representing the completed slice, tests still pass
