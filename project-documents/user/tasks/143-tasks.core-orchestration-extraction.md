---
slice: core-orchestration-extraction
project: context-forge
lld: user/slices/143-slice.core-orchestration-extraction.md
dependencies: [core-services-extraction]
status: complete
projectState: >
  Slices 140-142 complete. packages/core contains types (6 modules) and services
  (5 services + interfaces + constants). Full workspace builds clean. 155/163 tests
  pass (8 pre-existing failures). Orchestrators (ContextTemplateEngine, ContextIntegrator,
  ContextGenerator, ServiceFactory) remain in packages/electron/src/services/context/.
dateCreated: 20260218
dateUpdated: 20260218
---

## Context Summary
- Working on core-orchestration-extraction slice (slice 143)
- Extracts 3 orchestrators + 1 factory into `packages/core/src/services/`
- Prerequisite slice 142 (Core Services Extraction) is complete
- This slice completes the core extraction — full context assembly pipeline in `@context-forge/core`
- Next planned slice: Storage Migration (slice 144) or MCP Server — Project Tools (slice 145)

---

## Phase 1: Core Infrastructure Changes

### Task 1: Extend interfaces in `packages/core/src/services/interfaces.ts`
- [x] Add `getContextInitializationPrompt(isMonorepo?: boolean): Promise<SystemPrompt | null>` to `IPromptReader`
- [x] Create `IStatementService extends IStatementReader` with `loadStatements(): Promise<void>` and `setFilePath(path: string): void`
- [x] Create `IPromptService extends IPromptReader` with `setFilePath(path: string): void`
- [x] **Success**: `pnpm --filter @context-forge/core build` succeeds; `IStatementReader` unchanged; new interfaces exported from `services/index.ts`

### Task 2: Add `setFilePath()` to core `SystemPromptParser`
- [x] Add `setFilePath(path: string): void` method to `packages/core/src/services/SystemPromptParser.ts`
  1. Set `this.filePath` to the new path
  2. Clear `this.promptsCache` (call `.clear()` on the Map)
- [x] **Success**: Method exists; `SystemPromptParser` structurally satisfies `IPromptService`; core builds clean

### Task 3: Add `setFilePath()` to core `StatementManager`
- [x] Add `setFilePath(path: string): void` method to `packages/core/src/services/StatementManager.ts`
  1. Set `this.filePath` to the new path
  2. Reset `this.isLoaded` to `false`
  3. Reset `this.statements` to `{}`
- [x] **Success**: Method exists; `StatementManager` structurally satisfies `IStatementService`; core builds clean

### Task 4: Build core and commit infrastructure changes
- [x] Run `pnpm --filter @context-forge/core build` — verify success
- [x] Verify `dist/` contains updated `.d.ts` for interfaces, SystemPromptParser, StatementManager
- [x] Git commit: interfaces + setFilePath changes
- [x] **Success**: Core builds clean; commit created

---

## Phase 2: Extract Orchestrators to Core

### Task 5: Extract `ContextGenerator` to core
- [x] Copy `packages/electron/src/services/context/ContextGenerator.ts` to `packages/core/src/services/ContextGenerator.ts`
- [x] Update `ProjectData` import to relative path `../types/project.js`
- [x] No other changes needed — this file has zero Electron dependencies
- [x] **Success**: File exists in core with correct import; no `@context-forge/core` self-import; no Electron imports

### Task 6: Extract `ContextTemplateEngine` to core
- [x] Copy `packages/electron/src/services/context/ContextTemplateEngine.ts` to `packages/core/src/services/ContextTemplateEngine.ts`
- [x] Replace imports:
  1. `SystemPromptParserIPC` → `IPromptService` from `./interfaces.js`
  2. `StatementManagerIPC` → `IStatementService` from `./interfaces.js`
  3. `SectionBuilder` → from `./SectionBuilder.js`
  4. `TemplateProcessor` → from `./TemplateProcessor.js`
  5. Type imports (`EnhancedContextData`, `ContextSection`, `ContextTemplate`) → from `../types/context.js` and `../types/sections.js`
  6. Remove `ServiceFactory` import entirely
- [x] Update constructor: require `promptParser: IPromptService` and `statementManager: IStatementService` (no optional/defaults from ServiceFactory)
  1. `sectionBuilder?: SectionBuilder` remains optional (auto-created from provided services)
- [x] Update private field types: `promptParser: IPromptService`, `statementManager: IStatementService`
- [x] Verify `updateServicePaths()` calls `this.promptParser.setFilePath()` and `this.statementManager.setFilePath()` — works via interface types
- [x] Ensure all relative imports use `.js` extensions
- [x] **Success**: File compiles with no Electron imports; constructor requires explicit deps; `updateServicePaths()` preserved

### Task 7: Extract `ContextIntegrator` to core
- [x] Copy `packages/electron/src/services/context/ContextIntegrator.ts` to `packages/core/src/services/ContextIntegrator.ts`
- [x] Replace imports:
  1. `ContextTemplateEngine` → from `./ContextTemplateEngine.js`
  2. `TemplateProcessor` → from `./TemplateProcessor.js`
  3. Type imports (`ProjectData`, `ContextData`, `EnhancedContextData`) → from relative type paths
  4. `PROMPT_FILE_RELATIVE_PATH` → from `./constants.js` (fixing stale IPC wrapper import)
  5. `STATEMENTS_FILE_RELATIVE_PATH` → from `./constants.js` (fixing stale IPC wrapper import)
  6. Remove `ServiceFactory` import entirely
- [x] Change constructor to: `constructor(engine: ContextTemplateEngine, enableNewEngine: boolean = true)`
  1. Store `engine` as `this.templateEngine`
  2. Create `this.templateProcessor = new TemplateProcessor()` internally (for legacy path)
  3. Store `this.enableNewEngine`
- [x] Verify `generateWithTemplateEngine()` uses `this.templateEngine.updateServicePaths()` as before
- [x] Retain: `DEFAULT_TEMPLATE`, legacy path, `mapProjectToContext`, `mapProjectToEnhancedContext`, `validateProject`, error handling, placeholder `detectAvailableTools`/`detectMCPServers`
- [x] Ensure all relative imports use `.js` extensions
- [x] **Success**: File compiles with no Electron imports; constructor requires `ContextTemplateEngine`; path resolution unchanged

### Task 8: Create `CoreServiceFactory`
- [x] Create `packages/core/src/services/CoreServiceFactory.ts`
- [x] Implement `createContextPipeline(projectPath: string)` as specified in slice design
  1. Import `SystemPromptParser`, `StatementManager`, `ContextTemplateEngine`, `ContextIntegrator`
  2. Import `PROMPT_FILE_RELATIVE_PATH`, `STATEMENTS_FILE_RELATIVE_PATH` from `./constants.js`
  3. Resolve absolute paths, construct services, wire pipeline, return `{ engine, integrator }`
- [x] Ensure all relative imports use `.js` extensions
- [x] **Success**: Function exported; builds clean; returns typed `{ engine: ContextTemplateEngine; integrator: ContextIntegrator }`

### Task 9: Update barrel exports and build core
- [x] Update `packages/core/src/services/index.ts`:
  1. Add `IStatementService`, `IPromptService` to interface exports
  2. Add `ContextGenerator`, `ContextTemplateEngine`, `ContextIntegrator` exports
  3. Add `createContextPipeline` export from `./CoreServiceFactory.js`
- [x] `packages/core/src/index.ts` needs no change (already re-exports `services/index.js`)
- [x] Run `pnpm --filter @context-forge/core build`
- [x] Verify `dist/` contains `.js` and `.d.ts` for all 4 new files
- [x] Git commit: orchestration extraction to core
- [x] **Success**: Core builds; all new files in `dist/`; commit created

---

## Phase 3: Update Electron Consumers

### Task 10: Update `useContextGeneration.ts` hook
- [x] In `packages/electron/src/hooks/useContextGeneration.ts`:
  1. Import `ContextIntegrator`, `ContextTemplateEngine` from `@context-forge/core`
  2. Import `createSystemPromptParser`, `createStatementManager` from `../services/context/ServiceFactory`
  3. Update `useMemo` to construct engine with IPC services, then pass to `ContextIntegrator`
- [x] **Success**: Hook constructs orchestrators explicitly with IPC services; no direct local orchestrator imports

### Task 11: Update `services/context/index.ts` barrel
- [x] In `packages/electron/src/services/context/index.ts`:
  1. Replace local `ContextIntegrator`, `ContextTemplateEngine` exports with re-exports from `@context-forge/core`
  2. Add `ContextGenerator` re-export from `@context-forge/core`
  3. Keep IPC wrapper exports and `ServiceFactory` exports as-is
- [x] **Success**: Barrel re-exports orchestrators from core; IPC wrappers remain local

### Task 12: Update Electron test files
- [x] Update `packages/electron/src/services/context/__tests__/ContextGenerator.test.ts`:
  1. Change `ContextGenerator` import to `@context-forge/core`
- [x] Update `packages/electron/src/services/context/__tests__/ContextIntegrator.test.ts`:
  1. Change `ContextIntegrator` import to `@context-forge/core`
  2. Update test setup to construct `ContextTemplateEngine` with mock/IPC services, then pass to `ContextIntegrator` constructor
  3. Ensure both legacy and new-engine test paths still exercise the same behavior
  4. The fact that tests construct `ContextTemplateEngine` with IPC wrappers and compile confirms structural compatibility with `IPromptService`/`IStatementService`
- [x] **Success**: Both test files compile; import paths point to `@context-forge/core`; structural interface compatibility confirmed by compiler

### Task 13: Build and test Electron, then commit consumer updates
- [x] Run `pnpm --filter @context-forge/electron build` — verify success
- [x] Run `pnpm --filter @context-forge/electron test` — verify same pass/fail as pre-extraction (155/163)
- [x] Git commit: Electron consumer updates for orchestration extraction
- [x] **Success**: Electron builds clean; test results unchanged; commit created

---

## Phase 4: Cleanup and Final Verification

### Task 14: Delete original orchestrator files from Electron
- [x] Delete `packages/electron/src/services/context/ContextGenerator.ts`
- [x] Delete `packages/electron/src/services/context/ContextTemplateEngine.ts`
- [x] Delete `packages/electron/src/services/context/ContextIntegrator.ts`
- [x] Verify `ServiceFactory.ts` remains in Electron (still needed for IPC wrapper creation)
- [x] Verify IPC wrappers (`SystemPromptParserIPC.ts`, `StatementManagerIPC.ts`) are unmodified (`git diff` shows no changes)
- [x] **Success**: 3 files deleted; `ServiceFactory.ts` and IPC wrappers still present and unchanged; no dangling imports

### Task 15: Full workspace build, test, and final commit
- [x] Run `pnpm --filter @context-forge/core build` — verify success
- [x] Run `pnpm --filter @context-forge/electron build` — verify success
- [x] Run `pnpm -r build` — full workspace builds in correct order
- [x] Run `pnpm --filter @context-forge/electron test` — verify same pass/fail (155/163)
- [x] Grep `packages/core/src/` for any Electron-specific imports (`window.electronAPI`, `SystemPromptParserIPC`, `StatementManagerIPC`) — must find zero
- [x] Verify `createContextPipeline` is importable from `packages/mcp-server/` (workspace link resolution)
- [x] Git commit: delete old orchestrator files, final verification
- [x] Update slice design success criteria checkboxes
- [x] Update DEVLOG with implementation summary and commit hashes
- [x] **Note**: Manual verification recommended — launch Electron app, generate context for a test project, verify output matches pre-extraction behavior
- [x] **Success**: Full workspace builds; tests unchanged; no Electron imports in core; DEVLOG updated
