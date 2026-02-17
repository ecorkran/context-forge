---
slice: core-types-extraction
project: context-forge
lld: user/slices/141-slice.core-types-extraction.md
dependencies: [monorepo-scaffolding]
projectState: Monorepo scaffolding complete. packages/core exists with empty src/index.ts. Workspace links confirmed working. Electron builds from packages/electron/.
dateCreated: 20260217
dateUpdated: 20260217
---

## Context Summary
- Working on core-types-extraction slice (slice 2 in the restructure initiative)
- Monorepo scaffolding (slice 140) is complete — `packages/core/`, `packages/mcp-server/`, `packages/electron/` exist with working builds and workspace links
- `@context-forge/core` dependency is already declared in `packages/electron/package.json`
- This slice extracts and consolidates type definitions from two duplicated hierarchies in Electron into a single set in `packages/core/src/types/`
- Delivers: shared types importable from `@context-forge/core` by all packages
- Next planned slices: Core Services Extraction (142) and Storage Migration (144), both depend on this slice

---

## Tasks

### Task 1: Create core type modules
**Objective**: Create the six consolidated type files in `packages/core/src/types/`.
**Effort**: 2/5

Each sub-task creates one type file. Contents are consolidated from the Electron sources as specified in the slice design. Use `.js` extensions on all relative imports within core (required by `nodenext` module resolution).

- [ ] **1.1: Create `packages/core/src/types/context.ts`**
  - Source: `packages/electron/src/services/context/types/ContextData.ts` (renderer — the superset version)
  - Contains: `ContextData`, `EnhancedContextData`, `ContextGenerator`
  - `ContextData` uses the renderer version (includes `taskFile`, `developmentPhase?`, `workType?`, `projectDate?`)
  - `EnhancedContextData` uses the renderer version (includes `customData?` field) — this is the single canonical definition, eliminating the duplicates in `ContextSection.ts`
  - No imports from other type files needed
  - **Success**: File exists, exports all three types, no TypeScript errors

- [ ] **1.2: Create `packages/core/src/types/sections.ts`**
  - Source: `packages/electron/src/services/context/types/ContextSection.ts` (renderer version)
  - Contains: `ContextSection`, `ContextTemplate`, `SectionBuilderConfig`, `SectionKeys` (enum), `SectionValidation`
  - **Remove** the `EnhancedContextData` definition from this file — it now lives only in `context.ts`
  - Import `ContextData` from `./context.js` (needed by `ContextSection.condition` parameter type)
  - **Success**: File exports all five types, no `EnhancedContextData`, imports `ContextData` from `./context.js`

- [ ] **1.3: Create `packages/core/src/types/statements.ts`**
  - Source: either Electron copy (they are identical)
  - Contains: `TemplateStatement`, `StatementConfig`, `StatementFileMetadata`, `ParsedStatement`
  - No imports from other type files needed
  - **Success**: File exports all four types, no TypeScript errors

- [ ] **1.4: Create `packages/core/src/types/prompts.ts`**
  - Source: `packages/electron/src/main/services/context/types/SystemPrompt.ts` (main-process only)
  - Contains: `SystemPrompt`, `ParsedPromptFile`, `PromptCacheEntry`, `SpecialPromptKeys` (enum)
  - No imports from other type files needed
  - **Success**: File exports all four types, no TypeScript errors

- [ ] **1.5: Create `packages/core/src/types/project.ts`**
  - Source: `packages/electron/src/services/storage/types/ProjectData.ts`
  - Contains: `ProjectData`, `CreateProjectData`, `UpdateProjectData`
  - No imports from other type files needed
  - **Success**: File exports all three types, no TypeScript errors

- [ ] **1.6: Create `packages/core/src/types/paths.ts`**
  - Source: `packages/electron/src/main/services/project/types.ts`
  - Contains: `PathValidationResult`, `DirectoryListResult`
  - No imports from other type files needed
  - **Success**: File exports both types, no TypeScript errors

---

### Task 2: Create barrel exports
**Objective**: Wire up the barrel re-exports so all types are importable from `@context-forge/core`.
**Effort**: 1/5

- [ ] **2.1: Create `packages/core/src/types/index.ts`**
  - Re-export all types from the six modules
  - Use `export type { ... }` for interfaces and type aliases
  - Use `export { ... }` (not `export type`) for `SectionKeys` and `SpecialPromptKeys` — they are enums with runtime values
  - All imports use `.js` extensions (e.g., `from './context.js'`)
  - **Success**: File re-exports every type/enum listed in the slice design

- [ ] **2.2: Update `packages/core/src/index.ts`**
  - Replace the empty `export {}` with `export * from './types/index.js';`
  - **Success**: File contains the single re-export line

---

### Task 3: Build and verify core package
**Objective**: Confirm `packages/core` compiles and produces correct output.
**Effort**: 1/5

- [ ] **3.1: Run `pnpm --filter @context-forge/core build`**
  - Must complete with zero errors
  - **Success**: `packages/core/dist/` contains `.js` and `.d.ts` files for all type modules, `index.js`, and `types/index.js`

- [ ] **3.2: Spot-check the generated `.d.ts` files**
  - Verify `dist/index.d.ts` re-exports all types
  - Verify `dist/types/context.d.ts` contains `ContextData`, `EnhancedContextData`, `ContextGenerator`
  - Verify enums (`SectionKeys`, `SpecialPromptKeys`) appear in both `.js` and `.d.ts` output (confirming they weren't stripped as type-only)
  - **Success**: All type declarations are present and enums have runtime JS output

---

### Task 4: Update ProjectData consumers in Electron
**Objective**: Change all `ProjectData`/`CreateProjectData`/`UpdateProjectData` imports to `@context-forge/core`.
**Effort**: 2/5

Update each file's import statement. The pattern for each:
```
// Before: import { ProjectData } from '../storage/types/ProjectData';
// After:  import { ProjectData } from '@context-forge/core';
```

If a file already imports other types from `@context-forge/core`, merge into the existing import statement.

- [ ] **4.1**: `src/services/project/ProjectValidator.ts` — `ProjectData`, `CreateProjectData`
- [ ] **4.2**: `src/services/project/ProjectManager.ts` — `ProjectData`
- [ ] **4.3**: `src/services/project/__tests__/ProjectManager.test.ts` — `ProjectData`
- [ ] **4.4**: `src/services/context/ContextIntegrator.ts` — `ProjectData` (also imports context types — handle in Task 5)
- [ ] **4.5**: `src/services/context/ContextGenerator.ts` — `ProjectData`
- [ ] **4.6**: `src/services/context/__tests__/ContextIntegrator.test.ts` — `ProjectData`
- [ ] **4.7**: `src/services/context/__tests__/ContextGenerator.test.ts` — `ProjectData`
- [ ] **4.8**: `src/hooks/useContextGeneration.ts` — `ProjectData`
- [ ] **4.9**: `src/components/settings/SettingsButton.tsx` — `ProjectData`
- [ ] **4.10**: `src/components/settings/SettingsDialog.tsx` — `ProjectData`
- [ ] **4.11**: `src/components/project/ProjectSelector.tsx` — `ProjectData`
- [ ] **4.12**: `src/components/ContextBuilderApp.tsx` — `CreateProjectData`, `ProjectData`
- [ ] **4.13**: `src/components/forms/ProjectConfigForm.tsx` — `CreateProjectData`, `ProjectData`
- [ ] **4.14**: `src/components/forms/__tests__/ProjectConfigForm.integration.test.ts` — `ProjectData`, `CreateProjectData`, `UpdateProjectData`

**Success**: No file in `packages/electron/` imports from `storage/types/ProjectData`. All ProjectData-related types come from `@context-forge/core`.

---

### Task 5: Update context type consumers in Electron
**Objective**: Change all context-related type imports (`ContextData`, `EnhancedContextData`, `ContextSection`, `ContextTemplate`, `TemplateStatement`, `SectionBuilderConfig`, `ContextGenerator`) to `@context-forge/core`.
**Effort**: 2/5

- [ ] **5.1**: `src/services/context/ContextIntegrator.ts` — `ContextData`, `EnhancedContextData` (merge with ProjectData import from Task 4.4)
- [ ] **5.2**: `src/services/context/ContextTemplateEngine.ts` — `EnhancedContextData`, `ContextSection`, `ContextTemplate`
- [ ] **5.3**: `src/services/context/TemplateProcessor.ts` — `ContextData`
- [ ] **5.4**: `src/services/context/SectionBuilder.ts` — `ContextSection`, `EnhancedContextData`, `SectionBuilderConfig`
- [ ] **5.5**: `src/services/context/StatementManagerIPC.ts` — `TemplateStatement`
- [ ] **5.6**: `src/services/context/__tests__/TemplateProcessor.test.ts` — `ContextData`

**Success**: No file in `packages/electron/src/services/context/` imports types from local `./types/` subdirectory. All context types come from `@context-forge/core`.

---

### Task 6: Update main-process type consumers in Electron
**Objective**: Change main-process imports for context types, prompt types, and path types to `@context-forge/core`.
**Effort**: 1/5

- [ ] **6.1**: `src/main/services/context/SystemPromptParser.ts` — `SystemPrompt`, `ParsedPromptFile`, `PromptCacheEntry`, `SpecialPromptKeys`
- [ ] **6.2**: `src/main/services/context/StatementManager.ts` — `TemplateStatement`, `ParsedStatement`
- [ ] **6.3**: `src/main/ipc/contextServices.ts` — `TemplateStatement`
- [ ] **6.4**: `src/components/settings/ProjectPathSection.tsx` — `PathValidationResult`

**Success**: No main-process file imports types from local `./types/` paths. All types come from `@context-forge/core`.

---

### Task 7: Update barrel re-exports in Electron
**Objective**: Update or clean up the barrel `index.ts` files that previously re-exported from local type directories.
**Effort**: 1/5

- [ ] **7.1: Update `src/services/context/index.ts`**
  - Currently re-exports `ContextData`, `ContextGenerator`, `EnhancedContextData`, `TemplateStatement`, `ContextSection` from local `./types/` files
  - Change these re-exports to source from `@context-forge/core`
  - Preserve any non-type exports (service classes, etc.) unchanged
  - **Success**: File re-exports types from `@context-forge/core`, no references to `./types/`

- [ ] **7.2: Update `src/main/services/context/index.ts`**
  - Currently re-exports from local `./types/TemplateStatement`, `./types/SystemPrompt`, `./types/ContextSection`
  - Change these re-exports to source from `@context-forge/core`
  - Preserve any non-type exports (service classes, etc.) unchanged
  - **Success**: File re-exports types from `@context-forge/core`, no references to `./types/`

---

### Task 8: Delete original type files from Electron
**Objective**: Remove the now-redundant type files from `packages/electron/`.
**Effort**: 1/5

Delete each file. Use `git rm` to preserve history tracking.

- [ ] **8.1: Delete renderer context type files**
  - `src/services/context/types/ContextData.ts`
  - `src/services/context/types/ContextSection.ts`
  - `src/services/context/types/TemplateStatement.ts`
  - `src/services/context/types/index.ts`
  - Remove `src/services/context/types/` directory if now empty

- [ ] **8.2: Delete main-process context type files**
  - `src/main/services/context/types/ContextData.ts`
  - `src/main/services/context/types/ContextSection.ts`
  - `src/main/services/context/types/TemplateStatement.ts`
  - `src/main/services/context/types/SystemPrompt.ts`
  - `src/main/services/context/types/index.ts`
  - Remove `src/main/services/context/types/` directory if now empty

- [ ] **8.3: Delete project/storage type files**
  - `src/services/storage/types/ProjectData.ts`
  - `src/main/services/project/types.ts`
  - Note: `src/services/storage/types/` directory stays — it still contains `AppState.ts`

**Success**: All listed files are deleted. No dangling references. `git status` shows clean deletions.

---

### Task 9: Full build and test verification
**Objective**: Confirm the entire workspace builds and all tests pass.
**Effort**: 1/5

- [ ] **9.1: Run `pnpm --filter @context-forge/core build`**
  - Must succeed with zero errors
  - **Success**: Clean build, `dist/` output present

- [ ] **9.2: Run `pnpm --filter @context-forge/electron build`**
  - Must succeed with zero type errors
  - **Success**: Electron app builds, `out/` directory produced

- [ ] **9.3: Run `pnpm --filter @context-forge/electron test:run`**
  - All existing tests must pass (157 pass / 6 pre-existing failures from slice 140)
  - No new test failures introduced
  - **Success**: Test count matches or exceeds pre-extraction baseline

- [ ] **9.4: Run `pnpm -r build`**
  - Full workspace build in topological order (core → mcp-server → electron)
  - **Success**: All three packages build without errors

- [ ] **9.5: Verify no stale imports remain**
  - Search for any remaining imports from the deleted type file paths
  - Grep for `services/context/types/` and `storage/types/ProjectData` and `project/types` across `packages/electron/src/`
  - **Success**: Zero matches — all consumers point to `@context-forge/core`

---

### Task 10: Git commit
**Objective**: Commit the completed extraction with a descriptive message.
**Effort**: 1/5

- [ ] **10.1: Stage and commit all changes**
  - Stage new files in `packages/core/src/types/`
  - Stage updated `packages/core/src/index.ts`
  - Stage all updated consumer files in `packages/electron/`
  - Stage deleted type files
  - Commit message referencing slice 141 and the core types extraction
  - **Success**: Clean commit on main, `git status` shows no uncommitted changes related to this slice
