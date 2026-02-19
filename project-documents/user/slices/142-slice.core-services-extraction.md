---
docType: slice-design
slice: core-services-extraction
project: context-forge
parent: user/architecture/140-slices.context-forge-restructure.md
dependencies: [core-types-extraction]
interfaces: [core-orchestration-extraction, electron-client-conversion]
status: complete
dateCreated: 20260218
dateUpdated: 20260218
---

# Slice Design: Core Services Extraction

## Overview

Extract five process-agnostic services from `packages/electron/` into `packages/core/src/services/`. These are the logic services that perform template processing, prompt parsing, statement management, section building, and path validation. After this slice, the complete service layer lives in `@context-forge/core` and can be used by the MCP server, Electron main process, or any Node.js consumer without Electron.

This is a relocation slice, not a redesign. Services are moved as-is with minimal modifications — only what's necessary to decouple them from Electron-specific types.

## Value

- **Enables MCP server development**: The MCP server (slices 145-147) needs these services to implement its tools. After this slice, `packages/mcp-server` can import and use the complete service layer from `@context-forge/core`.
- **Unblocks orchestration extraction**: Slice 143 (Core Orchestration) depends on these services being in core — `ContextTemplateEngine` uses `SectionBuilder` and `TemplateProcessor`, `ContextIntegrator` uses `TemplateProcessor`.
- **Establishes service extraction pattern**: Defines how services with Node.js dependencies (fs, path) coexist with pure-logic services in core, and how dependency injection interfaces enable decoupled consumers.
- **Exports domain constants**: `DEFAULT_STATEMENTS`, `STATEMENTS_FILE_RELATIVE_PATH`, and `PROMPT_FILE_RELATIVE_PATH` become importable from `@context-forge/core` — shared knowledge about the project file structure.

## Technical Scope

### Included

- Extract `TemplateProcessor` (renderer service, pure logic)
- Extract `SystemPromptParser` (main-process service, uses `fs`)
- Extract `StatementManager` (main-process service, uses `fs`)
- Extract `SectionBuilder` (renderer service, depends on statement/prompt services)
- Extract `ProjectPathService` (main-process service, uses `fs.promises`)
- Define `IStatementReader` and `IPromptReader` interfaces in core for SectionBuilder's dependency injection
- Export `DEFAULT_STATEMENTS` constant from core
- Export `STATEMENTS_FILE_RELATIVE_PATH` and `PROMPT_FILE_RELATIVE_PATH` constants from core
- Fix `ProjectPathService`'s broken `./types` import (file deleted in slice 141)
- Update all Electron consumers to import services from `@context-forge/core`
- Update barrel re-exports in Electron's `index.ts` files
- Delete original service files from `packages/electron/`

### Excluded

- **IPC wrappers** (`StatementManagerIPC`, `SystemPromptParserIPC`) — stay in Electron; eliminated in a later slice
- **IPC handler code** (`contextServices.ts`, `projectPathHandlers.ts`) — stay in Electron; they are consumers, not extraction targets
- **PromptFileManager** — closely related to `SystemPromptParser` but not listed in the slice plan
- **Orchestration services** (`ContextIntegrator`, `ContextTemplateEngine`, `ContextGenerator`, `ServiceFactory`) — those are slice 143
- **Redesign of any service API or internals** — no functional changes beyond interface decoupling

## Dependencies

### Prerequisites

- **Core Types Extraction (slice 141)**: Complete. All shared types (`ContextData`, `SystemPrompt`, `TemplateStatement`, etc.) are in `@context-forge/core` and importable.
- **Monorepo Scaffolding (slice 140)**: Complete. Workspace structure, package linkage, and build pipeline are working.

### Interfaces Required

- `@context-forge/core` types compile and produce `.d.ts` output (confirmed)
- `packages/electron/` resolves `@context-forge/core` imports via workspace link (confirmed)
- Node.js built-ins (`fs`, `path`) are available in core's compilation target (confirmed: tsconfig targets `ES2023` with `nodenext` module resolution, `lib: ["ES2023"]`)

## Architecture

### File Structure in `packages/core/`

```
packages/core/src/
├── index.ts                    # Updated barrel: re-exports types + services
├── types/                      # Existing from slice 141 (unchanged)
│   ├── index.ts
│   ├── context.ts
│   ├── sections.ts
│   ├── statements.ts
│   ├── prompts.ts
│   ├── project.ts
│   └── paths.ts
└── services/
    ├── index.ts                # Services barrel
    ├── interfaces.ts           # IStatementReader, IPromptReader
    ├── constants.ts            # File path constants, DEFAULT_STATEMENTS
    ├── TemplateProcessor.ts    # Pure logic (170 lines)
    ├── SystemPromptParser.ts   # fs-based prompt parsing (321 lines)
    ├── StatementManager.ts     # fs-based statement management (301 lines)
    ├── SectionBuilder.ts       # Section assembly (379 lines)
    └── ProjectPathService.ts   # Path validation (144 lines)
```

### Dependency Graph (Post-Extraction)

```
@context-forge/core
├── types/ (no runtime deps)
└── services/
    ├── TemplateProcessor      → types only (ContextData)
    ├── SystemPromptParser     → types + Node.js fs
    ├── StatementManager       → types + Node.js fs, path + constants
    ├── SectionBuilder         → types + interfaces + TemplateProcessor
    └── ProjectPathService     → types + Node.js fs, path

@context-forge/electron (consumers)
├── main/ipc/contextServices.ts     → imports StatementManager, SystemPromptParser from core
├── main/ipc/projectPathHandlers.ts → imports ProjectPathService from core
├── services/context/index.ts       → re-exports from core + local IPC wrappers
├── services/context/ContextIntegrator.ts  → imports TemplateProcessor from core
├── services/context/ContextTemplateEngine.ts → imports SectionBuilder, TemplateProcessor from core
└── services/context/*IPC.ts        → NOT changed (stay local, eliminated later)
```

## Technical Decisions

### Node.js `fs` Usage: Keep As-Is

**Decision**: Do not abstract `fs` behind an interface. Keep direct `fs` imports in the extracted services.

**Rationale**:
- `packages/core` is a Node.js package (tsconfig: `module: "nodenext"`, `target: "ES2023"`). It will never run in a browser.
- Both primary consumers — the MCP server and Electron's main process — run on Node.js.
- The architecture doc describes core as "Pure TypeScript, no Electron dependency" — not "no Node.js." The constraint is no Electron APIs, not no platform APIs.
- Adding an `IFileSystem` abstraction for services that will only ever run on Node.js is over-engineering and contradicts the "relocation, not redesign" goal.
- The slice plan explicitly states: "These services are extracted as-is with minimal modification."

**Consequence**: `@context-forge/core` will have an implicit Node.js runtime requirement. This is already the case (the tsconfig targets Node.js). If a browser-compatible core subset is ever needed, it can be split into `@context-forge/core/browser` in a future slice.

**Note**: Core's `package.json` currently has zero runtime dependencies, and this remains true — `fs` and `path` are Node.js built-ins, not npm packages.

### Service Interfaces for SectionBuilder

**Decision**: Define minimal interfaces (`IStatementReader`, `IPromptReader`) that capture only the methods SectionBuilder actually calls.

**Rationale**: SectionBuilder's constructor currently types its dependencies as `StatementManagerIPC` and `SystemPromptParserIPC` — Electron-specific IPC wrappers that reference `window.electronAPI`. These types cannot be imported into core. Interfaces are the minimum change needed to decouple the type reference.

**Interface definitions** (based on SectionBuilder's actual usage):

```typescript
// IStatementReader — methods SectionBuilder calls on its statement dependency
export interface IStatementReader {
  getStatement(key: string): string;
}

// IPromptReader — methods SectionBuilder calls on its prompt dependency
export interface IPromptReader {
  getToolUsePrompt(): Promise<SystemPrompt | null>;
  getPromptForInstruction(instruction: string): Promise<SystemPrompt | null>;
}
```

**Consumers**:
- `StatementManager` in core satisfies `IStatementReader` naturally (has `getStatement(key: string): string`)
- `SystemPromptParser` in core satisfies `IPromptReader` naturally (has both async methods)
- `StatementManagerIPC` in Electron satisfies `IStatementReader` (same method signature)
- `SystemPromptParserIPC` in Electron satisfies `IPromptReader` (same method signatures, uses local `SystemPrompt` type — needs alignment, see Special Considerations)

**SectionBuilder modification**: Change constructor parameter types from concrete classes to interfaces. No other changes.

```typescript
// Before (in Electron)
constructor(
  statementManager: StatementManagerIPC,
  promptParser: SystemPromptParserIPC,
  config?: SectionBuilderConfig
)

// After (in core)
constructor(
  statementManager: IStatementReader,
  promptParser: IPromptReader,
  config?: SectionBuilderConfig
)
```

### Constants Extraction

**Decision**: Extract domain constants to `services/constants.ts` in core.

Constants to extract:
- `DEFAULT_STATEMENTS` (currently in `StatementManager.ts`) — the 9 default statement definitions. This is domain knowledge shared between the StatementManager and any consumer that needs to display or reset defaults.
- `STATEMENTS_FILE_RELATIVE_PATH` (currently in `StatementManagerIPC.ts`) — `'default-statements.md'`
- `PROMPT_FILE_RELATIVE_PATH` (currently in `SystemPromptParserIPC.ts`) — `'project-documents/ai-project-guide/project-guides/prompt.ai-project.system.md'`

`StatementManager.ts` imports `DEFAULT_STATEMENTS` from `./constants.js`. The IPC wrappers in Electron can either import these constants from `@context-forge/core` or keep their own copies — implementation choice, not a design constraint.

### Unused Import Cleanup

`SystemPromptParser` imports `path` but never uses it. Remove the unused import during extraction rather than carrying dead code into core. This is not a behavioral change.

## Implementation Details

### Migration Plan

**Step 1: Create `services/constants.ts`**

Move `DEFAULT_STATEMENTS` from `StatementManager.ts` into its own file. Add `STATEMENTS_FILE_RELATIVE_PATH` and `PROMPT_FILE_RELATIVE_PATH` constants.

**Step 2: Create `services/interfaces.ts`**

Define `IStatementReader` and `IPromptReader` as described in the Technical Decisions section.

**Step 3: Extract `TemplateProcessor`**

Copy `packages/electron/src/services/context/TemplateProcessor.ts` to `packages/core/src/services/TemplateProcessor.ts`. Update the import path for `ContextData` (already `@context-forge/core` — change to relative `../types/context.js`). No other changes needed.

**Step 4: Extract `SystemPromptParser`**

Copy `packages/electron/src/main/services/context/SystemPromptParser.ts` to `packages/core/src/services/SystemPromptParser.ts`. Changes:
- Update type imports to relative paths (`../types/prompts.js`)
- Remove unused `path` import
- Ensure `.js` extensions on all relative imports

**Step 5: Extract `StatementManager`**

Copy `packages/electron/src/main/services/context/StatementManager.ts` to `packages/core/src/services/StatementManager.ts`. Changes:
- Move `DEFAULT_STATEMENTS` out; import from `./constants.js`
- Update type imports to relative paths
- Ensure `.js` extensions on all relative imports

**Step 6: Extract `SectionBuilder`**

Copy `packages/electron/src/services/context/SectionBuilder.ts` to `packages/core/src/services/SectionBuilder.ts`. Changes:
- Replace `StatementManagerIPC` / `SystemPromptParserIPC` imports with `IStatementReader` / `IPromptReader` from `./interfaces.js`
- Replace `TemplateProcessor` import with relative `./TemplateProcessor.js`
- Update type imports to relative paths
- Update private field types to use interfaces

**Step 7: Extract `ProjectPathService`**

Copy `packages/electron/src/main/services/project/ProjectPathService.ts` to `packages/core/src/services/ProjectPathService.ts`. Changes:
- Fix broken `./types` import to relative `../types/paths.js`
- Ensure `.js` extensions on all relative imports

**Step 8: Create barrel exports**

Create `packages/core/src/services/index.ts`:
```typescript
// Interfaces
export type { IStatementReader, IPromptReader } from './interfaces.js';

// Constants
export { DEFAULT_STATEMENTS, STATEMENTS_FILE_RELATIVE_PATH, PROMPT_FILE_RELATIVE_PATH } from './constants.js';

// Services
export { TemplateProcessor } from './TemplateProcessor.js';
export { SystemPromptParser } from './SystemPromptParser.js';
export { StatementManager } from './StatementManager.js';
export { SectionBuilder } from './SectionBuilder.js';
export { ProjectPathService } from './ProjectPathService.js';
```

Update `packages/core/src/index.ts`:
```typescript
export * from './types/index.js';
export * from './services/index.js';
```

**Step 9: Build core**

Run `pnpm --filter @context-forge/core build`. Verify all services compile and `dist/` contains `.js` and `.d.ts` for every file.

**Step 10: Update Electron consumers**

Update import statements in all consumer files. Complete consumer map:

| Consumer file | Currently imports | Change to |
|---|---|---|
| `src/services/context/ContextIntegrator.ts` | `TemplateProcessor` from `./TemplateProcessor` | from `@context-forge/core` |
| `src/services/context/ContextTemplateEngine.ts` | `TemplateProcessor`, `SectionBuilder` from local | from `@context-forge/core` |
| `src/services/context/__tests__/TemplateProcessor.test.ts` | `TemplateProcessor` from `../TemplateProcessor` | from `@context-forge/core` |
| `src/main/ipc/contextServices.ts` | `StatementManager`, `SystemPromptParser` from `../services/context` | from `@context-forge/core` |
| `src/main/ipc/projectPathHandlers.ts` | `ProjectPathService` from `../services/project/ProjectPathService` | from `@context-forge/core` |
| `src/main/services/project/__tests__/ProjectPathService.test.ts` | `ProjectPathService` from `../ProjectPathService` | from `@context-forge/core` |
| `src/services/context/index.ts` | Re-exports `TemplateProcessor`, `SectionBuilder` from local | Re-export from `@context-forge/core` |
| `src/main/services/context/index.ts` | Re-exports `StatementManager`, `SystemPromptParser` from local | Re-export from `@context-forge/core` |

**Note**: `SectionBuilder`'s consumer (`ContextTemplateEngine`) currently passes `StatementManagerIPC` and `SystemPromptParserIPC` instances. After extraction, these still work because the IPC classes satisfy `IStatementReader` and `IPromptReader`. No consumer code changes are needed beyond import paths.

**Step 11: Delete original service files from Electron**

Remove:
- `src/services/context/TemplateProcessor.ts`
- `src/services/context/SectionBuilder.ts`
- `src/main/services/context/SystemPromptParser.ts`
- `src/main/services/context/StatementManager.ts`
- `src/main/services/project/ProjectPathService.ts`

Check whether `src/main/services/project/` becomes empty after deletion. If `types.ts` was already deleted in slice 141 and only `ProjectPathService.ts` remains, the directory may need cleanup. Verify the `__tests__/` subdirectory still has content.

**Step 12: Build and verify**

1. `pnpm --filter @context-forge/core build` — core compiles with services
2. `pnpm --filter @context-forge/electron build` — Electron builds with updated imports
3. `pnpm --filter @context-forge/electron test` — existing tests pass
4. `pnpm -r build` — full workspace builds in correct order

### Behavior Verification

This slice changes zero runtime behavior. Verification is:
- All existing tests pass (they exercise the services through the same public APIs)
- Both packages build without errors
- TypeScript reports no type errors across the workspace
- The Electron app launches and functions normally (manual check)

## Integration Points

### Provides to Other Slices

- **Core Orchestration Extraction (slice 143)**: `TemplateProcessor`, `SectionBuilder`, and their types/interfaces are importable from `@context-forge/core`. The orchestration services (`ContextTemplateEngine`, `ContextIntegrator`) already use these — their extraction will only need import path changes.
- **MCP Server slices (145-147)**: The MCP server can create `SystemPromptParser`, `StatementManager`, `ProjectPathService` instances directly from `@context-forge/core` — the full service layer for implementing MCP tools.
- **Electron Client Conversion (slice 148)**: Services are already in core. The conversion slice can focus on eliminating IPC wrappers and simplifying the renderer, knowing the service layer is stable.
- **Core Test Suite (slice 149)**: Services are testable without Electron. The test suite can import from `@context-forge/core` and test against filesystem fixtures.

### Consumes from Other Slices

- **Core Types Extraction (slice 141)**: All type imports within the extracted services reference types from `packages/core/src/types/`. These are now relative imports within the same package.
- **Monorepo Scaffolding (slice 140)**: Workspace structure, TypeScript project references, build pipeline.

## Success Criteria

### Functional Requirements

- [x] All 5 services are present in `packages/core/src/services/`
- [x] `IStatementReader` and `IPromptReader` interfaces are defined and exported from core
- [x] `DEFAULT_STATEMENTS`, `STATEMENTS_FILE_RELATIVE_PATH`, `PROMPT_FILE_RELATIVE_PATH` are exported from core
- [x] All Electron consumers import services from `@context-forge/core`
- [x] No service files remain in the old Electron locations
- [x] Electron app builds and runs identically to pre-extraction
- [x] IPC wrappers (`StatementManagerIPC`, `SystemPromptParserIPC`) remain in Electron and function unchanged

### Technical Requirements

- [x] `pnpm --filter @context-forge/core build` succeeds, producing `.js` and `.d.ts` in `dist/`
- [x] `pnpm --filter @context-forge/electron build` succeeds with zero type errors
- [x] `pnpm -r build` succeeds (full workspace)
- [x] All existing tests pass (`pnpm --filter @context-forge/electron test`) — 155/163 (same 8 pre-existing failures)
- [x] `.js` extensions used on all relative imports within `packages/core/`
- [x] No unused imports carried from Electron (e.g., `path` in SystemPromptParser)

### Integration Requirements

- [x] Services are importable from `packages/mcp-server/` (workspace link works — mcp-server builds clean in `pnpm -r build`)
- [x] `SectionBuilder` accepts both core `StatementManager`/`SystemPromptParser` and Electron IPC wrappers through the interface types

## Risk Assessment

### ProjectPathService Broken Import

**Risk**: `ProjectPathService` currently imports from `./types` which was deleted in slice 141. If this file is used before the import is fixed, the build will fail.

**Mitigation**: This is fixed as part of extraction (step 7). The import changes to a relative path within core. However, if the Electron build is run between slices (before this slice starts), the broken import will cause a build failure. Verify current build status before starting implementation.

## Implementation Notes

### Development Approach

**Suggested order**: Constants and interfaces first (steps 1-2), then services in dependency order (steps 3-7), then barrel exports and build (steps 8-9), then consumer updates and cleanup (steps 10-12).

Within the services, the recommended extraction order is:
1. `TemplateProcessor` — zero friction, validates the extraction pattern
2. `SystemPromptParser` — fs-using but no inter-service dependencies
3. `StatementManager` — similar to SystemPromptParser, depends on constants
4. `ProjectPathService` — independent, fixes broken import
5. `SectionBuilder` — depends on interfaces and TemplateProcessor (both already in core)

**Testing strategy**: Services are verified by the TypeScript compiler (type correctness) and the existing test suite (runtime behavior). No new tests are added in this slice — comprehensive testing is slice 149 (Core Test Suite).

### Special Considerations

- **`nodenext` module resolution**: All relative imports within `packages/core/src/` must use `.js` extensions. Same constraint as slice 141.
- **`SystemPromptParserIPC` local type**: The IPC wrapper defines its own local `SystemPrompt` type instead of importing from `@context-forge/core`. For `IPromptReader` to work across both the real service and the IPC wrapper, the return type `SystemPrompt | null` must be compatible. Since the local type has the same shape, TypeScript's structural typing handles this — no explicit `implements` clause needed. However, this should be noted for cleanup in a future slice (eliminate the duplicate type in `SystemPromptParserIPC`).
- **`ContextTemplateEngine` constructor**: Currently creates `SectionBuilder` with `StatementManagerIPC` and `SystemPromptParserIPC`. After this slice, the types widen to `IStatementReader` and `IPromptReader`. The IPC instances are structurally compatible. No consumer changes needed beyond import paths.
- **Barrel file strategy**: Electron's barrel files (`src/services/context/index.ts`, `src/main/services/context/index.ts`) currently re-export extracted services. After extraction, they should re-export from `@context-forge/core` so that any internal consumers using the barrel continue to work. Alternatively, if all consumers are updated to import from core directly, the re-exports can be removed. Check actual usage during implementation.
