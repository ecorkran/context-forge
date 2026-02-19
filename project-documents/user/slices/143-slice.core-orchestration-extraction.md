---
docType: slice-design
slice: core-orchestration-extraction
project: context-forge
parent: user/architecture/140-slices.context-forge-restructure.md
dependencies: [core-services-extraction]
interfaces: [mcp-server-context-tools, electron-client-conversion, core-test-suite]
status: complete
dateCreated: 20260218
dateUpdated: 20260218
---

# Slice Design: Core Orchestration Extraction

## Overview

Extract the context generation orchestrators from `packages/electron/` into `packages/core/src/services/`: `ContextTemplateEngine`, `ContextIntegrator`, `ContextGenerator`, and a core-equivalent `ServiceFactory`. These orchestrators coordinate the services extracted in slice 142 to assemble complete context prompts. After this slice, the entire context assembly pipeline — from project data to formatted output — lives in `@context-forge/core` and can be invoked by the MCP server, Electron, or any Node.js consumer without Electron.

This is a relocation slice with targeted modifications. The orchestrators are moved as-is except where changes are necessary to decouple them from Electron-specific dependencies (IPC wrappers, renderer-only `ServiceFactory`).

## Value

- **Completes the core extraction**: After slices 141 (types), 142 (services), and this slice, `@context-forge/core` contains the full context assembly pipeline. No Electron dependency is required to generate context prompts.
- **Unblocks MCP Context Tools (slice 147)**: The MCP server's `context_build` tool wraps `ContextIntegrator.generateContextFromProject()`. This slice makes that import possible.
- **Establishes dependency injection pattern**: Orchestrators accept interface-typed dependencies, enabling both direct service use (MCP server, tests) and IPC-wrapped use (Electron renderer) through the same API.
- **Provides convenience factory**: A `createContextPipeline()` function wires up the full pipeline from a project path — the primary entry point for MCP server and test consumers.

## Technical Scope

### Included

- Extract `ContextGenerator` (trivial — zero Electron dependencies)
- Extract `ContextTemplateEngine` (reworked to use interfaces instead of concrete IPC types)
- Extract `ContextIntegrator` (reworked to accept engine via constructor instead of constructing internally)
- Create `CoreServiceFactory` with `createContextPipeline()` convenience function
- Extend `IPromptReader` with `getContextInitializationPrompt()`
- Create `IStatementService` and `IPromptService` extended interfaces for orchestrator use
- Add `setFilePath()` to core `SystemPromptParser` and `StatementManager`
- Update all Electron consumers to import orchestrators from `@context-forge/core`
- Update Electron barrel re-exports
- Delete original orchestrator files from `packages/electron/`

### Excluded

- **IPC wrappers** (`StatementManagerIPC`, `SystemPromptParserIPC`) — stay in Electron; eliminated in slice 148
- **Electron's `ServiceFactory`** — stays in Electron for renderer IPC service creation; may be simplified to only create IPC wrappers
- **Redesign of orchestrator logic** — no algorithmic changes, only dependency injection refactoring
- **Removal of legacy engine path** — `ContextIntegrator`'s `enableNewEngine` flag and legacy `generateWithLegacySystem()` are preserved as-is
- **New tests** — behavior verification via existing test suite; comprehensive testing is slice 149

## Dependencies

### Prerequisites

- **Core Services Extraction (slice 142)**: Complete. `TemplateProcessor`, `SystemPromptParser`, `StatementManager`, `SectionBuilder`, `ProjectPathService` are in `@context-forge/core` with `IStatementReader` and `IPromptReader` interfaces.
- **Core Types Extraction (slice 141)**: Complete. All shared types importable from `@context-forge/core`.

### Interfaces Required

- `@context-forge/core` services compile and produce `.d.ts` (confirmed)
- `SystemPromptParser.getContextInitializationPrompt()` exists in core (confirmed at line 153)
- `StatementManager.loadStatements()` exists in core (confirmed at line 72)
- Both IPC wrappers (`SystemPromptParserIPC`, `StatementManagerIPC`) have `setFilePath()`, `loadStatements()`/`getContextInitializationPrompt()` (confirmed)

## Architecture

### File Structure in `packages/core/` After Extraction

```
packages/core/src/
├── index.ts                          # Updated: also exports orchestration
├── types/                            # Unchanged from slice 141
└── services/
    ├── index.ts                      # Updated: exports orchestration + extended interfaces
    ├── interfaces.ts                 # Updated: IPromptReader extended, new IStatementService/IPromptService
    ├── constants.ts                  # Unchanged
    ├── TemplateProcessor.ts          # Unchanged
    ├── SystemPromptParser.ts         # Updated: +setFilePath()
    ├── StatementManager.ts           # Updated: +setFilePath()
    ├── SectionBuilder.ts             # Unchanged
    ├── ProjectPathService.ts         # Unchanged
    ├── ContextGenerator.ts           # NEW — trivial extraction
    ├── ContextTemplateEngine.ts      # NEW — reworked: interfaces instead of IPC types
    ├── ContextIntegrator.ts          # NEW — reworked: engine via constructor
    └── CoreServiceFactory.ts         # NEW — createContextPipeline() convenience
```

### Dependency Graph (Post-Extraction)

```
@context-forge/core (orchestration layer)
├── ContextGenerator          → types only (ProjectData)
├── ContextTemplateEngine     → IPromptService, IStatementService, SectionBuilder, TemplateProcessor
├── ContextIntegrator         → ContextTemplateEngine, TemplateProcessor, types
└── CoreServiceFactory        → SystemPromptParser, StatementManager, ContextTemplateEngine,
                                ContextIntegrator, constants

@context-forge/electron (consumers — after this slice)
├── hooks/useContextGeneration.ts     → ContextIntegrator from @context-forge/core
│                                       + ServiceFactory (local, creates IPC services)
│                                       + ContextTemplateEngine from @context-forge/core
├── services/context/index.ts         → re-exports from @context-forge/core + local IPC wrappers
├── services/context/ServiceFactory   → creates IPC services, constructs core orchestrators
└── services/context/*IPC.ts          → unchanged (stay local)
```

## Technical Decisions

### Interface Extension Strategy

**Decision**: Extend `IPromptReader` directly and create new `IStatementService`/`IPromptService` interfaces that extend the base interfaces.

**Rationale**: `ContextTemplateEngine` needs methods beyond what `SectionBuilder` requires:
- `getContextInitializationPrompt()` on the prompt reader (called in `buildTemplate()`)
- `loadStatements()` on the statement reader (called in `ensureStatementManagerInitialized()`)
- `setFilePath()` on both (called via `updateServicePaths()`)

Rather than bloat the minimal interfaces that `SectionBuilder` uses, we extend them:

```typescript
// Extended IPromptReader — add getContextInitializationPrompt (all implementors have it)
export interface IPromptReader {
  getToolUsePrompt(): Promise<SystemPrompt | null>;
  getPromptForInstruction(instruction: string): Promise<SystemPrompt | null>;
  getContextInitializationPrompt(isMonorepo?: boolean): Promise<SystemPrompt | null>;
}

// New: service-level interfaces for orchestrator use
export interface IStatementService extends IStatementReader {
  loadStatements(): Promise<void>;
  setFilePath(path: string): void;
}

export interface IPromptService extends IPromptReader {
  setFilePath(path: string): void;
}
```

**Impact on `SectionBuilder`**: None. `SectionBuilder` uses `IStatementReader` and `IPromptReader`. Adding `getContextInitializationPrompt` to `IPromptReader` is backward-compatible — `SectionBuilder` doesn't call it, but all existing implementors (`SystemPromptParser`, `SystemPromptParserIPC`) already provide it. `IStatementReader` is unchanged.

**Impact on IPC wrappers**: `SystemPromptParserIPC` satisfies `IPromptService` (has `setFilePath()` at line 144, `getContextInitializationPrompt()` at line 32). `StatementManagerIPC` satisfies `IStatementService` (has `loadStatements()` at line 22, `setFilePath()` at line 138). Structural typing handles this — no `implements` clause needed.

### Constructor Injection for Orchestrators

**Decision**: `ContextTemplateEngine` and `ContextIntegrator` require all dependencies via constructor. No default construction, no internal `ServiceFactory`.

**Rationale**: The Electron `ServiceFactory` creates IPC wrappers that reference `window.electronAPI` — fundamentally incompatible with core. Rather than abstracting the factory, we simply require callers to provide concrete instances. This is cleaner and more testable.

**ContextTemplateEngine constructor** (core):
```typescript
constructor(
  promptParser: IPromptService,
  statementManager: IStatementService,
  sectionBuilder?: SectionBuilder  // optional: auto-created from the provided services
)
```

**ContextIntegrator constructor** (core):
```typescript
constructor(
  engine: ContextTemplateEngine,
  enableNewEngine: boolean = true
)
```

**Consequence**: `useContextGeneration.ts` in Electron changes from `new ContextIntegrator()` to constructing the engine with IPC services first, then passing it to the integrator. This is slightly more verbose but makes the dependency chain explicit.

### Keeping `updateServicePaths()`

**Decision**: Keep `updateServicePaths()` on `ContextTemplateEngine`. Add `setFilePath()` to core `SystemPromptParser` and `StatementManager`.

**Rationale**: Both the Electron renderer (IPC wrappers with mutable paths) and core consumers may reuse a single engine instance across multiple projects. The `setFilePath()` method is trivial to add (set internal field, clear cache) and enables the reuse pattern without requiring new instance construction per project.

**Core service additions**:
- `SystemPromptParser.setFilePath(path: string)`: Sets `this.filePath`, clears `this.promptsCache`
- `StatementManager.setFilePath(path: string)`: Sets `this.filePath`, resets `this.isLoaded` and `this.statements`

### Core `ServiceFactory` (`CoreServiceFactory`)

**Decision**: Create a `CoreServiceFactory` module with a `createContextPipeline()` convenience function. This is the core equivalent of Electron's `ServiceFactory`.

```typescript
export function createContextPipeline(projectPath: string): {
  engine: ContextTemplateEngine;
  integrator: ContextIntegrator;
} {
  const base = projectPath.replace(/\/+$/, '');
  const promptParser = new SystemPromptParser(
    `${base}/${PROMPT_FILE_RELATIVE_PATH}`
  );
  const statementManager = new StatementManager(
    `${base}/${STATEMENTS_FILE_RELATIVE_PATH}`
  );
  const engine = new ContextTemplateEngine(promptParser, statementManager);
  const integrator = new ContextIntegrator(engine);
  return { engine, integrator };
}
```

**Rationale**: The MCP server's primary use case is "generate context for project X." This function encapsulates the entire wiring. Without it, every consumer must know about `SystemPromptParser`, `StatementManager`, file path constants, and the constructor chain.

### Stale Import Cleanup in `ContextIntegrator`

**Decision**: Update `ContextIntegrator`'s imports of `PROMPT_FILE_RELATIVE_PATH` and `STATEMENTS_FILE_RELATIVE_PATH` from IPC wrappers to core constants.

**Rationale**: These constants were extracted to `@context-forge/core` in slice 142. The IPC wrapper imports are stale. In core, they become relative imports from `./constants.js`.

## Implementation Details

### Migration Plan

**Step 1: Extend interfaces in `services/interfaces.ts`**

Add `getContextInitializationPrompt()` to `IPromptReader`. Create `IStatementService` and `IPromptService` extended interfaces.

**Step 2: Add `setFilePath()` to core services**

Add `setFilePath(path: string): void` to `SystemPromptParser` and `StatementManager`:
- `SystemPromptParser`: Set `this.filePath`, clear `this.promptsCache`
- `StatementManager`: Set `this.filePath`, reset `this.isLoaded` to false, clear `this.statements`

**Step 3: Extract `ContextGenerator`**

Copy `packages/electron/src/services/context/ContextGenerator.ts` to `packages/core/src/services/ContextGenerator.ts`. Only change: update `ProjectData` import to relative path (`../types/project.js`). Zero other modifications — this file has no Electron dependencies.

**Step 4: Extract `ContextTemplateEngine`**

Copy to `packages/core/src/services/ContextTemplateEngine.ts`. Changes:
- Replace `SystemPromptParserIPC` / `StatementManagerIPC` imports with `IPromptService` / `IStatementService` from `./interfaces.js`
- Replace `SectionBuilder`, `TemplateProcessor` imports with relative paths (`./SectionBuilder.js`, `./TemplateProcessor.js`)
- Replace type imports (`EnhancedContextData`, `ContextSection`, `ContextTemplate`) with relative paths
- Remove `ServiceFactory` import and default construction — constructor requires all deps
- Update private field types: `promptParser: IPromptService`, `statementManager: IStatementService`
- `updateServicePaths()` calls `this.promptParser.setFilePath()` and `this.statementManager.setFilePath()` — works via interfaces

**Step 5: Extract `ContextIntegrator`**

Copy to `packages/core/src/services/ContextIntegrator.ts`. Changes:
- Replace `ContextTemplateEngine` import with relative `./ContextTemplateEngine.js`
- Replace `TemplateProcessor` import with relative `./TemplateProcessor.js`
- Replace type imports with relative paths
- Remove `ServiceFactory` import — constructor takes `ContextTemplateEngine` as required parameter
- Import `PROMPT_FILE_RELATIVE_PATH` and `STATEMENTS_FILE_RELATIVE_PATH` from `./constants.js` (fixing stale IPC wrapper imports)
- Constructor: `constructor(engine: ContextTemplateEngine, enableNewEngine: boolean = true)`
- `generateWithTemplateEngine()`: uses `this.templateEngine.updateServicePaths()` as before — path resolution logic unchanged
- Retain `DEFAULT_TEMPLATE` constant, legacy path, validation, error handling, placeholder tool/MCP detection

**Step 6: Create `CoreServiceFactory`**

Create `packages/core/src/services/CoreServiceFactory.ts` with `createContextPipeline()` function as described in Technical Decisions.

**Step 7: Update barrel exports**

Update `packages/core/src/services/index.ts`:
```typescript
// Interfaces (updated)
export type { IStatementReader, IPromptReader, IStatementService, IPromptService } from './interfaces.js';

// Constants (unchanged)
export { DEFAULT_STATEMENTS, STATEMENTS_FILE_RELATIVE_PATH, PROMPT_FILE_RELATIVE_PATH } from './constants.js';

// Services (unchanged)
export { TemplateProcessor } from './TemplateProcessor.js';
export { SystemPromptParser } from './SystemPromptParser.js';
export { StatementManager } from './StatementManager.js';
export { SectionBuilder } from './SectionBuilder.js';
export { ProjectPathService } from './ProjectPathService.js';

// Orchestration (new)
export { ContextGenerator } from './ContextGenerator.js';
export { ContextTemplateEngine } from './ContextTemplateEngine.js';
export { ContextIntegrator } from './ContextIntegrator.js';
export { createContextPipeline } from './CoreServiceFactory.js';
```

**Step 8: Build core**

Run `pnpm --filter @context-forge/core build`. Verify all files compile and `dist/` contains `.js` and `.d.ts` for every new file.

**Step 9: Update Electron consumers**

| Consumer file | Current import | Change to |
|---|---|---|
| `src/hooks/useContextGeneration.ts` | `ContextIntegrator` from `../services/context/ContextIntegrator` | `ContextIntegrator`, `ContextTemplateEngine` from `@context-forge/core`; construct with IPC services |
| `src/services/context/index.ts` | `ContextIntegrator`, `ContextTemplateEngine` from local | Re-export from `@context-forge/core` |
| `src/services/context/ServiceFactory.ts` | Creates IPC services only | May optionally wrap with `ContextTemplateEngine` construction |
| `src/services/context/__tests__/ContextIntegrator.test.ts` | `ContextIntegrator` from `../ContextIntegrator` | from `@context-forge/core` |
| `src/services/context/__tests__/ContextGenerator.test.ts` | `ContextGenerator` from `../ContextGenerator` | from `@context-forge/core` |

**Hook update detail** (`useContextGeneration.ts`):
```typescript
// Before:
const contextIntegrator = useMemo(() => new ContextIntegrator(), []);

// After:
const contextIntegrator = useMemo(() => {
  const promptParser = createSystemPromptParser();
  const statementManager = createStatementManager();
  const engine = new ContextTemplateEngine(promptParser, statementManager);
  return new ContextIntegrator(engine);
}, []);
```

This is slightly more verbose but makes the dependency chain explicit. `createSystemPromptParser` and `createStatementManager` remain in Electron's `ServiceFactory` — they create IPC wrappers.

**Step 10: Delete original files from Electron**

Remove:
- `src/services/context/ContextGenerator.ts`
- `src/services/context/ContextTemplateEngine.ts`
- `src/services/context/ContextIntegrator.ts`

`ServiceFactory.ts` **stays in Electron** — it creates IPC wrappers for the renderer.

**Step 11: Build and verify**

1. `pnpm --filter @context-forge/core build` — core compiles with orchestration
2. `pnpm --filter @context-forge/electron build` — Electron builds with updated imports
3. `pnpm --filter @context-forge/electron test` — existing tests pass
4. `pnpm -r build` — full workspace builds in correct order

### Behavior Verification

This slice changes zero runtime behavior. Verification:
- All existing tests pass (they exercise orchestrators through the same public APIs)
- Both packages build without errors
- TypeScript reports no type errors across the workspace
- The Electron app launches and generates context identically (manual check)

## Integration Points

### Provides to Other Slices

- **MCP Server — Context Tools (slice 147)**: `createContextPipeline(projectPath)` is the primary entry point. The MCP server calls it to get an `integrator`, then calls `integrator.generateContextFromProject(project)`. Full context assembly without Electron.
- **Electron Client Conversion (slice 148)**: Orchestrators are in core. The conversion slice can eliminate remaining IPC complexity, knowing the orchestration layer is stable and tested.
- **Core Test Suite (slice 149)**: Orchestrators are testable without Electron. Tests can use `createContextPipeline()` with fixture projects, or construct `ContextTemplateEngine` with mock implementations of `IPromptService`/`IStatementService`.

### Consumes from Other Slices

- **Core Services Extraction (slice 142)**: `TemplateProcessor`, `SectionBuilder`, `SystemPromptParser`, `StatementManager`, interfaces, constants — all from `packages/core/src/services/`.
- **Core Types Extraction (slice 141)**: `ProjectData`, `ContextData`, `EnhancedContextData`, `ContextSection`, `ContextTemplate`, `SystemPrompt` — all from `packages/core/src/types/`.

## Success Criteria

### Functional Requirements

- [x] `ContextGenerator`, `ContextTemplateEngine`, `ContextIntegrator` are in `packages/core/src/services/`
- [x] `CoreServiceFactory` with `createContextPipeline()` exists and is exported
- [x] `IPromptReader` extended with `getContextInitializationPrompt()`
- [x] `IStatementService` and `IPromptService` interfaces defined and exported
- [x] `setFilePath()` added to core `SystemPromptParser` and `StatementManager`
- [x] All Electron consumers import orchestrators from `@context-forge/core`
- [x] No orchestrator files remain in old Electron locations (except `ServiceFactory.ts`)
- [x] Electron app builds and runs identically to pre-extraction
- [x] `useContextGeneration.ts` constructs orchestrators with IPC services explicitly

### Technical Requirements

- [x] `pnpm --filter @context-forge/core build` succeeds, producing `.js` and `.d.ts` for all new files
- [x] `pnpm --filter @context-forge/electron build` succeeds with zero type errors
- [x] `pnpm -r build` succeeds (full workspace)
- [x] All existing tests pass (`pnpm --filter @context-forge/electron test`) — same pass/fail as pre-extraction
- [x] `.js` extensions used on all relative imports within `packages/core/`
- [x] No Electron-specific imports (`window.electronAPI`, IPC wrappers) in any core file

### Integration Requirements

- [x] `createContextPipeline()` is callable from `packages/mcp-server/` (workspace link works)
- [x] Core orchestrators accept both core services and Electron IPC wrappers through interface types (structural compatibility)

## Risk Assessment

### IPromptReader Interface Extension

**Risk**: Adding `getContextInitializationPrompt()` to `IPromptReader` is a breaking change for any external implementor of the interface.

**Mitigation**: There are no external implementors. The only implementations are `SystemPromptParser` (core) and `SystemPromptParserIPC` (Electron), both of which already have this method. The change is backward-compatible in practice.

### Constructor Change in ContextIntegrator

**Risk**: Changing `ContextIntegrator` from zero-arg construction to requiring a `ContextTemplateEngine` instance changes the Electron hook's construction pattern. If any other Electron code calls `new ContextIntegrator()` without arguments, it will break.

**Mitigation**: Grep all consumers before implementation. The exploration found only `useContextGeneration.ts` and tests. All are updated in this slice. The barrel file `services/context/index.ts` re-exports the class — consumers importing through it get the core version.

## Implementation Notes

### Development Approach

**Suggested order**: Interface extensions first (steps 1-2), then services in dependency order (steps 3-6), then barrel exports and build (steps 7-8), then consumer updates and cleanup (steps 9-11).

Within the orchestrators, the recommended extraction order is:
1. `ContextGenerator` — zero friction, validates pattern
2. `ContextTemplateEngine` — depends on extended interfaces (must be done after step 1-2)
3. `ContextIntegrator` — depends on `ContextTemplateEngine`
4. `CoreServiceFactory` — depends on everything above

**Testing strategy**: Verified by TypeScript compiler (type correctness) and existing test suite (runtime behavior). Tests that construct `ContextIntegrator()` with no args will need updating to the new constructor signature — this is expected and validates the migration.
