---
docType: slice-design
slice: core-types-extraction
project: context-forge
parent: user/architecture/140-slices.context-forge-restructure.md
dependencies: [monorepo-scaffolding]
interfaces: [core-services-extraction, core-orchestration-extraction, storage-migration, electron-client-conversion]
status: not started
dateCreated: 20260217
dateUpdated: 20260217
---

# Slice Design: Core Types Extraction

## Overview

Extract all shared type definitions from `packages/electron/` into `packages/core/src/types/`. This consolidates the duplicated type hierarchies in the main-process (`src/main/services/context/types/`) and renderer-process (`src/services/context/types/`) into a single canonical set. After this slice, both Electron processes and all future packages import types from `@context-forge/core`.

This is the first extraction slice and the foundation for all subsequent core extraction work (services, orchestration, storage). It is purely a type relocation and consolidation — no logic or service code moves.

## Value

- **Eliminates type duplication**: Two parallel type hierarchies (main vs renderer) are collapsed into one source of truth. This removes the maintenance burden of keeping them in sync and eliminates the subtle divergences that have already appeared (e.g., `ContextData` fields differ between main and renderer).
- **Enables subsequent extraction**: Slices 142 (Core Services), 143 (Core Orchestration), and 144 (Storage Migration) all depend on having shared types in `@context-forge/core`.
- **Establishes the extraction pattern**: This is the simplest extraction slice — types only, no runtime dependencies. It sets the precedent for how imports are structured, how re-exports work, and how consumers are updated.

## Technical Scope

### Included

- Create `packages/core/src/types/` with consolidated type definitions
- Merge the renderer `ContextData` superset with the main-process `ContextData` into a single definition
- Eliminate the duplicate `EnhancedContextData` definition (currently in both `ContextData.ts` and `ContextSection.ts`)
- Move `ProjectData`, `CreateProjectData`, `UpdateProjectData` into core
- Move `PathValidationResult`, `DirectoryListResult` into core
- Export all types from `packages/core/src/index.ts`
- Update all consumers in `packages/electron/` to import from `@context-forge/core`
- Delete the original type files from `packages/electron/`
- Verify build succeeds across all packages

### Excluded

- `AppState`, `WindowBounds`, `DEFAULT_APP_STATE` — these are Electron UI-specific (window bounds, panel sizes). They stay in `packages/electron/` until the Storage Migration slice determines their final home.
- `Window.electronAPI` type declaration — Electron-specific IPC contract, not shared.
- Any service or logic code — that's slices 142-144.
- Any new types not present in the current codebase.

## Dependencies

### Prerequisites

- **Monorepo Scaffolding (slice 140)**: Complete. `packages/core/` exists with package.json, tsconfig.json, and empty `src/index.ts`. The `@context-forge/core` workspace link is established in `packages/electron/package.json`.

### Interfaces Required

- `packages/core/` must compile with `tsc` (confirmed working from slice 140).
- `packages/electron/` must resolve `@context-forge/core` imports (workspace link confirmed working from slice 140).

## Architecture

### Type File Structure in `packages/core/`

```
packages/core/src/
├── index.ts              # Barrel re-export of all types
└── types/
    ├── index.ts          # Types barrel: re-exports all type modules
    ├── context.ts        # ContextData, EnhancedContextData, ContextGenerator
    ├── sections.ts       # ContextSection, ContextTemplate, SectionBuilderConfig, SectionKeys, SectionValidation
    ├── statements.ts     # TemplateStatement, StatementConfig, StatementFileMetadata, ParsedStatement
    ├── prompts.ts        # SystemPrompt, ParsedPromptFile, PromptCacheEntry, SpecialPromptKeys
    ├── project.ts        # ProjectData, CreateProjectData, UpdateProjectData
    └── paths.ts          # PathValidationResult, DirectoryListResult
```

### Consolidation Decisions

**ContextData — merge to renderer superset:**

The main-process `ContextData` has 7 fields. The renderer version adds `taskFile`, `developmentPhase?`, `workType?`, and `projectDate?`. The consolidated type uses the renderer's version because:
- The main process simply won't populate the extra optional fields — no breakage
- `taskFile` is a required field in `ProjectData` and is already used in template processing (renderer services)
- `developmentPhase`, `workType`, `projectDate` are all optional and safely ignorable

```typescript
export interface ContextData {
  projectName: string;
  template: string;
  slice: string;
  taskFile: string;
  instruction: string;
  developmentPhase?: string;
  workType?: 'start' | 'continue';
  projectDate?: string;
  isMonorepo: boolean;
  recentEvents: string;
  additionalNotes: string;
}
```

**EnhancedContextData — consolidate to single definition:**

Currently defined in three places:
1. `main/.../ContextData.ts` — extends ContextData with `availableTools?`, `mcpServers?`, `templateVersion?`, `customSections?`
2. `renderer/.../ContextData.ts` — same as #1 plus `customData?`
3. `main/.../ContextSection.ts` and `renderer/.../ContextSection.ts` — same as #1 (without `customData`)

The consolidated definition uses the renderer `ContextData.ts` version (the superset) and lives in `context.ts`. The duplicate in `ContextSection.ts` is eliminated entirely.

```typescript
export interface EnhancedContextData extends ContextData {
  availableTools?: string[];
  mcpServers?: string[];
  templateVersion?: string;
  customSections?: Record<string, string>;
  customData?: {
    recentEvents?: string;
    additionalNotes?: string;
    monorepoNote?: string;
    availableTools?: string;
  };
}
```

**SectionKeys and SpecialPromptKeys — union types vs enums:**

The project's CLAUDE.md states "Use optional chaining, union types (no enums)." However, `SectionKeys` and `SpecialPromptKeys` are already implemented as enums and are used as value references in service code (e.g., `SectionKeys.PROJECT_INTRO`). Converting to union types would require updating all value-reference consumers — that's a refactoring concern for the services extraction slice, not this one. This slice extracts the enums as-is to minimize scope and risk.

**ContextSection.condition typing:**

Currently typed as `(data: ContextData | any) => boolean`. The `| any` weakens the type. However, changing the type signature is a behavioral concern, not an extraction concern. Extract as-is; tightening can happen in the services extraction slice if desired.

## Technical Decisions

### Import Path Strategy

**Decision**: Direct `@context-forge/core` imports, no re-export shims in Electron.

After extraction, all Electron consumers change their imports from relative paths to the package import:

```typescript
// Before (various patterns)
import { ProjectData } from '../storage/types/ProjectData';
import { ContextData } from './types/ContextData';
import { TemplateStatement } from '../services/context/types/TemplateStatement';

// After (all consumers)
import { ProjectData } from '@context-forge/core';
import { ContextData } from '@context-forge/core';
import { TemplateStatement } from '@context-forge/core';
```

No re-export shims are needed in `packages/electron/` because:
- Every consumer is updated in this slice (bounded scope)
- Re-exports add maintenance burden with zero value after all consumers are updated
- The codebase guidelines prefer clean breaks over backward-compatibility hacks

### `.js` Extensions in Core Imports

The `packages/core/` tsconfig uses `"module": "nodenext"`, which requires `.js` extensions on relative imports. Within core's type files, any cross-references must use `.js` extensions:

```typescript
// packages/core/src/types/sections.ts
import type { ContextData } from './context.js';
```

Electron consumers importing from `@context-forge/core` (the package specifier) do not need extensions — Node.js resolves package imports via the `main`/`exports` field in package.json.

### Barrel Export Structure

`packages/core/src/index.ts` re-exports everything from `types/index.ts`. This keeps the public API flat:

```typescript
// packages/core/src/index.ts
export * from './types/index.js';
```

```typescript
// packages/core/src/types/index.ts
export type { ContextData, EnhancedContextData, ContextGenerator } from './context.js';
export type { ContextSection, ContextTemplate, SectionBuilderConfig, SectionValidation } from './sections.js';
export { SectionKeys } from './sections.js';
export type { TemplateStatement, StatementConfig, StatementFileMetadata, ParsedStatement } from './statements.js';
export type { SystemPrompt, ParsedPromptFile, PromptCacheEntry } from './prompts.js';
export { SpecialPromptKeys } from './prompts.js';
export type { ProjectData, CreateProjectData, UpdateProjectData } from './project.js';
export type { PathValidationResult, DirectoryListResult } from './paths.js';
```

Note: `SectionKeys` and `SpecialPromptKeys` use `export` (not `export type`) because they are enums with runtime values.

## Implementation Details

### Migration Plan

**Step 1: Create type files in `packages/core/src/types/`**

Create the six type module files plus the barrel `index.ts`. Contents are the consolidated versions of the existing types. No logic, no runtime code (except the two enums which have runtime representations).

File-by-file source mapping:

| Core file | Primary source | Secondary source (eliminated) |
|---|---|---|
| `context.ts` | `renderer/.../types/ContextData.ts` | `main/.../types/ContextData.ts` |
| `sections.ts` | `renderer/.../types/ContextSection.ts` (minus `EnhancedContextData`) | `main/.../types/ContextSection.ts` |
| `statements.ts` | Either copy (identical) | — |
| `prompts.ts` | `main/.../types/SystemPrompt.ts` | — (main-only) |
| `project.ts` | `renderer/services/storage/types/ProjectData.ts` | — |
| `paths.ts` | `main/services/project/types.ts` | — |

**Step 2: Update `packages/core/src/index.ts`**

Replace the empty export with the barrel re-export.

**Step 3: Build `packages/core`**

Run `pnpm --filter @context-forge/core build` to verify the types compile and `dist/` produces correct `.js` and `.d.ts` output.

**Step 4: Update consumers in `packages/electron/`**

Update every import statement that references the old type locations. The complete consumer list (26 import sites across ~20 files):

**ProjectData consumers (14 import sites):**
- `src/services/project/ProjectValidator.ts`
- `src/services/project/ProjectManager.ts`
- `src/services/project/__tests__/ProjectManager.test.ts`
- `src/services/context/ContextIntegrator.ts`
- `src/services/context/__tests__/ContextIntegrator.test.ts`
- `src/services/context/__tests__/ContextGenerator.test.ts`
- `src/services/context/ContextGenerator.ts`
- `src/hooks/useContextGeneration.ts`
- `src/components/settings/SettingsButton.tsx`
- `src/components/settings/SettingsDialog.tsx`
- `src/components/project/ProjectSelector.tsx`
- `src/components/ContextBuilderApp.tsx`
- `src/components/forms/ProjectConfigForm.tsx`
- `src/components/forms/__tests__/ProjectConfigForm.integration.test.ts`

**Context type consumers (9 import sites):**
- `src/services/context/ContextIntegrator.ts` (ContextData, EnhancedContextData)
- `src/services/context/ContextTemplateEngine.ts` (EnhancedContextData, ContextSection, ContextTemplate)
- `src/services/context/TemplateProcessor.ts` (ContextData)
- `src/services/context/SectionBuilder.ts` (ContextSection, EnhancedContextData, SectionBuilderConfig)
- `src/services/context/StatementManagerIPC.ts` (TemplateStatement)
- `src/services/context/index.ts` (re-exports)
- `src/services/context/__tests__/TemplateProcessor.test.ts` (ContextData)
- `src/main/ipc/contextServices.ts` (TemplateStatement)
- `src/main/services/context/SystemPromptParser.ts` (SystemPrompt, ParsedPromptFile, PromptCacheEntry, SpecialPromptKeys)
- `src/main/services/context/StatementManager.ts` (TemplateStatement, ParsedStatement)

**Main-process barrel re-exports (update or remove):**
- `src/main/services/context/index.ts` — currently re-exports from local type files; update to re-export from `@context-forge/core` or remove if consumers import directly
- `src/services/context/index.ts` — same treatment

**Path type consumer (1 import site):**
- `src/components/settings/ProjectPathSection.tsx` (PathValidationResult)

**Step 5: Delete original type files from Electron**

Remove:
- `src/main/services/context/types/ContextData.ts`
- `src/main/services/context/types/ContextSection.ts`
- `src/main/services/context/types/TemplateStatement.ts`
- `src/main/services/context/types/SystemPrompt.ts`
- `src/main/services/context/types/index.ts`
- `src/services/context/types/ContextData.ts`
- `src/services/context/types/ContextSection.ts`
- `src/services/context/types/TemplateStatement.ts`
- `src/services/context/types/index.ts`
- `src/services/storage/types/ProjectData.ts`
- `src/main/services/project/types.ts`

Check whether any `types/` directories become empty after deletion and remove them if so. The `src/services/storage/types/` directory still contains `AppState.ts`, so it stays.

**Step 6: Build and verify**

1. `pnpm --filter @context-forge/core build` — core compiles
2. `pnpm --filter @context-forge/electron build` — electron builds with new imports
3. `pnpm --filter @context-forge/electron test` — existing tests pass
4. `pnpm -r build` — full workspace builds in correct order

### Behavior Verification

This slice changes zero runtime behavior. Verification is:
- All existing tests pass (they exercise the types through service code)
- Both packages build without errors
- TypeScript reports no type errors across the workspace
- The Electron app launches and functions normally (manual check)

## Integration Points

### Provides to Other Slices

- **All extraction slices (142, 143, 144)**: Shared types importable from `@context-forge/core`. Services being extracted in those slices will already have their type imports pointing at core, so they can be moved without changing import paths.
- **MCP Server slices (145-147)**: The MCP server will use `ProjectData`, `ContextData`, `SystemPrompt`, and related types directly from `@context-forge/core`.
- **Electron Client Conversion (148)**: Type imports are already migrated — one less concern for that slice.

### Consumes from Other Slices

- **Monorepo Scaffolding (140)**: Workspace structure, package linkage, build pipeline. All confirmed working.

## Success Criteria

### Functional Requirements

- [ ] All types listed in the slice plan are present in `packages/core/src/types/`
- [ ] `ContextData` is a single consolidated interface (renderer superset)
- [ ] `EnhancedContextData` exists in exactly one location (`context.ts`)
- [ ] All Electron consumers import types from `@context-forge/core`
- [ ] No type files remain in the old Electron locations (except `AppState.ts`)
- [ ] Electron app builds and runs identically to pre-extraction

### Technical Requirements

- [ ] `pnpm --filter @context-forge/core build` succeeds, producing `.js` and `.d.ts` in `dist/`
- [ ] `pnpm --filter @context-forge/electron build` succeeds with zero type errors
- [ ] `pnpm -r build` succeeds (full workspace)
- [ ] All existing tests pass (`pnpm --filter @context-forge/electron test`)
- [ ] Core package has zero runtime dependencies (types-only, no npm packages needed)
- [ ] `.js` extensions used on all relative imports within `packages/core/`

### Integration Requirements

- [ ] `@context-forge/core` types are importable from `packages/mcp-server/` (workspace link works)
- [ ] TypeScript IntelliSense resolves `@context-forge/core` types in the IDE

## Implementation Notes

### Development Approach

**Suggested order**: Steps 1-2-3 (create types, update barrel, build core), then Steps 4-5-6 (update consumers, delete originals, verify). Build core first to confirm the types compile before touching Electron imports.

**Testing strategy**: The type extraction is verified by the TypeScript compiler — if it builds, the types are correct. Runtime behavior is verified by the existing test suite. No new tests are needed for this slice (types have no logic to test).

### Special Considerations

- **`nodenext` module resolution**: All relative imports within `packages/core/src/` must use `.js` extensions (e.g., `import type { ContextData } from './context.js'`). This is required by the tsconfig's `"module": "nodenext"` setting. Electron consumers using the package specifier (`@context-forge/core`) do not need extensions.
- **Enum export syntax**: `SectionKeys` and `SpecialPromptKeys` are enums with runtime values. They must use `export { ... }` not `export type { ... }` in barrel files, or TypeScript will strip them from the JS output.
- **Git operations**: Use `git mv` where practical to preserve file history, though the consolidation (merging two files into one) means some files will be new creations rather than moves.
- **Renderer barrel files**: `src/services/context/index.ts` currently re-exports types from local type files. After extraction, these re-exports should either be updated to re-export from `@context-forge/core` (if other files import from the barrel) or removed (if all consumers import from core directly). Check actual usage during implementation.
