---
docType: slice-design
slice: cli-mcp-shared-logic-consolidation
project: context-forge
parent: user/architecture/200-slices.developer-onboarding.md
dependencies: []
interfaces: []
dateCreated: 20260320
dateUpdated: 20260320
status: not_started
---

# Slice Design: CLI/MCP Shared-Logic Consolidation

## Overview

Extract duplicated orchestration logic between `@context-forge/cli` and `@context-forge/mcp-server` into `@context-forge/core`. Both packages already depend on core for storage, services, and utilities — the duplication exists only in command/tool-level logic that should have been shared from the start.

This is a pure refactoring slice. No user-facing behavior changes.

## Value

- **Consistency:** Eliminates the risk of CLI and MCP diverging when auto-set rules or defaults change. Today they are mostly identical but already have one behavioral gap (fileArch→fileSlicePlan auto-set is missing from MCP entirely).
- **Maintainability:** Future changes to project creation defaults, field mappings, or auto-set logic happen in one place.
- **Correctness:** The missing MCP auto-set (fileArch→fileSlicePlan) gets fixed as a side effect of extraction — both paths consume the same shared function.

## Technical Scope

### Included

1. **Constants extraction** — `WORKTREE_SCOPED_FIELDS` and `PROJECT_TO_WORKTREE_FIELD`
2. **Project creation defaults** — `dateProject` formatting, default `template`, `instruction`, `developmentPhase` values
3. **Auto-set logic** — `developmentPhase→instruction`, `fileSlice→fileTasks`, `fileArch→fileSlicePlan`
4. **Shared types** for the auto-set and defaults functions

### Excluded

- Path resolution utilities (`resolveFileByIndex`, `resolveArtifactPath`) — already in core
- `WorktreeService` — already in core
- CLI-specific concerns (console logging, interactive prompts)
- MCP-specific concerns (tool registration, MCP protocol formatting)
- Any changes to the CLI or MCP public interfaces

## Dependencies

### Prerequisites

None. All target code is stable post-205. Core package infrastructure (exports, build, tests) is established.

### Interfaces Required

- `@context-forge/core` already exports `resolveFileByIndex` used by the auto-set logic
- `FileProjectStore` and `WorktreeService` are already in core

## Architecture

### Component Structure

New module in core: `packages/core/src/project-defaults.ts`

This module provides:

```
project-defaults.ts
├── WORKTREE_SCOPED_FIELDS          (Set<string>)
├── PROJECT_TO_WORKTREE_FIELD       (Record<string, string>)
├── buildProjectCreationDefaults()  (name, path, opts?) → Partial<ProjectData>
├── computeAutoSetFields()             (field, value, projectPath) → Record<string, string>
└── formatDateProject()             (Date?) → string (YYYYMMDD)
```

### Data Flow

**Project creation (before):**
```
CLI init.ts  ──→ inline dateProject + defaults ──→ FileProjectStore.create()
MCP projectTools.ts ──→ inline dateProject + defaults ──→ FileProjectStore.create()
```

**Project creation (after):**
```
CLI init.ts  ──→ buildProjectCreationDefaults() ──→ FileProjectStore.create()
MCP projectTools.ts ──→ buildProjectCreationDefaults() ──→ FileProjectStore.create()
                              ↑
                     @context-forge/core
```

**Field update auto-set (before):**
```
CLI project.ts  ──→ inline if/else chains ──→ store.update() + store.updateWorktree()
MCP projectTools.ts ──→ inline if/else chains (incomplete) ──→ store.update() + store.updateWorktree()
```

**Field update auto-set (after):**
```
CLI project.ts  ──→ computeAutoSetFields() ──→ store.update() + store.updateWorktree()
MCP projectTools.ts ──→ computeAutoSetFields() ──→ store.update() + store.updateWorktree()
                              ↑
                     @context-forge/core
```

## Implementation Details

### Migration Plan

#### Extraction 1: Constants

**Source (CLI):** `packages/cli/src/commands/project.ts` lines 57-77
**Source (MCP):** `packages/mcp-server/src/tools/projectTools.ts` lines 9-29
**Destination:** `packages/core/src/project-defaults.ts`

Both copies are byte-identical. Move to core, update imports in both consumers.

```typescript
// packages/core/src/project-defaults.ts
export const WORKTREE_SCOPED_FIELDS = new Set([
  'developmentPhase', 'instruction', 'workType',
  'fileArch', 'fileSlicePlan', 'fileSlice', 'fileTasks',
]);

export const PROJECT_TO_WORKTREE_FIELD: Record<string, string> = {
  fileSlice: 'activeSlice',
  fileTasks: 'activeTaskFile',
  fileArch: 'archDoc',
  fileSlicePlan: 'slicePlan',
  developmentPhase: 'developmentPhase',
  instruction: 'instruction',
  workType: 'workType',
};
```

**Consumers to update:**
- `packages/cli/src/commands/project.ts` — remove local definitions, import from core
- `packages/mcp-server/src/tools/projectTools.ts` — remove local definitions, import from core

#### Extraction 2: Project Creation Defaults

**Source (CLI):** `packages/cli/src/commands/init.ts` lines 78-88
**Source (MCP):** `packages/mcp-server/src/tools/projectTools.ts` lines 121-132
**Destination:** `packages/core/src/project-defaults.ts`

```typescript
export function formatDateProject(date?: Date): string {
  const d = date ?? new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
}

export interface ProjectCreationOptions {
  name: string;
  projectPath: string;
  developmentPhase?: string;
  template?: string;
}

export function buildProjectCreationDefaults(opts: ProjectCreationOptions): Partial<ProjectData> {
  const phase = opts.developmentPhase || 'Phase 1: Concept';
  return {
    name: opts.name,
    projectPath: opts.projectPath,
    dateProject: formatDateProject(),
    template: opts.template || 'default',
    fileSlice: '',
    instruction: phase,
    developmentPhase: phase,
  };
}
```

**Behavioral note:** MCP currently accepts an optional `developmentPhase` parameter; CLI hardcodes `'Phase 1: Concept'`. The shared function supports both via the optional parameter — no behavior change for either consumer.

**Consumers to update:**
- `packages/cli/src/commands/init.ts` — replace inline defaults with `buildProjectCreationDefaults()`
- `packages/mcp-server/src/tools/projectTools.ts` — replace inline defaults with `buildProjectCreationDefaults()`

#### Extraction 3: Auto-Set Rules

**Source (CLI):** `packages/cli/src/commands/project.ts` lines 247-343
**Source (MCP):** `packages/mcp-server/src/tools/projectTools.ts` lines 289-351
**Destination:** `packages/core/src/project-defaults.ts`

This is the most complex extraction. The auto-set logic has three rules:

| Trigger | Derived Field | Mechanism |
|---------|--------------|-----------|
| `developmentPhase` set | `instruction` | Copy value directly |
| `fileSlice` set | `fileTasks` | `resolveFileByIndex()` with regex fallback |
| `fileArch` set | `fileSlicePlan` | `resolveFileByIndex()` with regex fallback |

**Critical finding:** The `fileArch→fileSlicePlan` rule is **missing from MCP**. The shared function fixes this automatically.

```typescript
export interface AutoSetResult {
  /** Additional fields to set alongside the original update */
  derivedUpdates: Record<string, string>;
  /** Human-readable descriptions of what was derived (for CLI logging) */
  descriptions: string[];
}

/**
 * Given a field being set and its value, compute any additional fields
 * that should be auto-set. Caller is responsible for applying the updates.
 *
 * @param field - The field name being set (project-level name, e.g. 'fileSlice')
 * @param value - The value being set
 * @param projectPath - Absolute path to project root (for file resolution)
 */
export function computeAutoSetFields(
  field: string,
  value: string,
  projectPath: string | undefined,
): AutoSetResult {
  const derivedUpdates: Record<string, string> = {};
  const descriptions: string[] = [];

  // Rule 1: developmentPhase → instruction
  if (field === 'developmentPhase') {
    derivedUpdates.instruction = value;
    descriptions.push(`instruction = ${value} (auto-set from developmentPhase)`);
  }

  // Rule 2: fileArch → fileSlicePlan
  if (field === 'fileArch' && projectPath) {
    const archIndex = /^(\d+)-/.exec(value);
    if (archIndex) {
      let resolved: string | null = null;
      try {
        resolved = resolveFileByIndex(projectPath, 'fileSlicePlan', archIndex[1]);
      } catch {
        const derived = value.replace(/^(\d+)-arch\./, '$1-slices.');
        if (derived !== value) resolved = derived;
      }
      if (resolved !== null) {
        derivedUpdates.fileSlicePlan = resolved;
        descriptions.push(`fileSlicePlan = ${resolved} (auto-set from fileArch)`);
      }
    }
  }

  // Rule 3: fileSlice → fileTasks
  if (field === 'fileSlice' && projectPath) {
    const sliceIndex = /^(\d+)-/.exec(value);
    if (sliceIndex) {
      let resolved: string | null = null;
      try {
        resolved = resolveFileByIndex(projectPath, 'fileTasks', sliceIndex[1]);
      } catch {
        const derived = value.replace(/^(\d+)-slice\./, '$1-tasks.');
        if (derived !== value) resolved = derived;
      }
      if (resolved !== null) {
        derivedUpdates.fileTasks = resolved;
        descriptions.push(`fileTasks = ${resolved} (auto-set from fileSlice)`);
      }
    }
  }

  return { derivedUpdates, descriptions };
}
```

**Design decisions:**
- The function returns data, not side effects. CLI uses `descriptions` for console output; MCP ignores them. This avoids coupling the shared logic to any I/O mechanism.
- Field names use project-level naming (`fileSlice`, not `activeSlice`). The caller maps to worktree field names using `PROJECT_TO_WORKTREE_FIELD` when updating worktree context.
- `projectPath` is optional — if undefined, file-resolution rules are skipped (only `developmentPhase→instruction` fires). This handles edge cases where path isn't available.

**Consumer update pattern (both CLI and MCP):**
```typescript
// Before: 60+ lines of inline if/else chains
// After:
const autoSet = computeAutoSetFields(field, value, projectPath);
const allUpdates = { [field]: value, ...autoSet.derivedUpdates };
// CLI additionally: autoSet.descriptions.forEach(d => console.log(success(d)));
```

The caller still handles:
- Deciding whether to route to worktree vs project update
- Field name mapping via `PROJECT_TO_WORKTREE_FIELD`
- Console logging (CLI only)
- MCP response formatting (MCP only)

### Core Package Export Updates

Add to `packages/core/src/index.ts` (or the Node entry point):

```typescript
export {
  WORKTREE_SCOPED_FIELDS,
  PROJECT_TO_WORKTREE_FIELD,
  formatDateProject,
  buildProjectCreationDefaults,
  computeAutoSetFields,
  type ProjectCreationOptions,
  type AutoSetResult,
} from './project-defaults.js';
```

## Integration Points

### Provides to Other Slices

- Any future CLI command or MCP tool that creates projects or updates fields can use `buildProjectCreationDefaults()` and `computeAutoSetFields()` instead of reimplementing the logic.
- The `PROJECT_TO_WORKTREE_FIELD` mapping is the canonical source for field name translation.

### Consumes from Other Slices

- `resolveFileByIndex()` from core (already exists)
- `ProjectData` type from core (already exists)

## Success Criteria

### Functional Requirements

- `cf init` creates projects with identical defaults as before
- `cf set` field auto-set behavior unchanged (same fields derived, same values)
- MCP `project_create` produces identical project data as before
- MCP `project_update` auto-set behavior unchanged — **plus** now correctly auto-sets `fileSlicePlan` from `fileArch` (bug fix)
- All existing tests pass without modification (beyond import path changes)

### Technical Requirements

- No duplicated constants or logic in CLI or MCP — all shared code lives in core
- New core functions have unit tests covering:
  - `formatDateProject()` — returns YYYYMMDD for given date
  - `buildProjectCreationDefaults()` — default values, optional overrides
  - `computeAutoSetFields()` — each rule in isolation, combined rules, missing projectPath
- CLI and MCP integration tests (existing) continue to pass

### Verification Walkthrough

**1. Confirm no duplication remains:**
```bash
# These should return zero matches outside of core:
grep -r "WORKTREE_SCOPED_FIELDS" packages/cli packages/mcp-server --include="*.ts" -l
# Expected: no results (only import statements)

grep -r "PROJECT_TO_WORKTREE_FIELD" packages/cli packages/mcp-server --include="*.ts" -l
# Expected: no results (only import statements)

grep -rn "getMonth.*padStart" packages/cli packages/mcp-server --include="*.ts"
# Expected: no results
```

**2. Confirm behavioral parity — project creation:**
```bash
# CLI: create a test project
cf init --name test-parity-cli /tmp/test-cli
cf project get test-parity-cli --json > /tmp/cli-output.json

# MCP: create equivalent project (via MCP tool call or test)
# Compare dateProject format, template, instruction, developmentPhase defaults
```

**3. Confirm auto-set rules work via CLI:**
```bash
cf set fileArch 200-arch.developer-onboarding
# Should print: "Updated fileSlicePlan = 200-slices.developer-onboarding (auto-set from fileArch)"

cf set fileSlice 206-slice.cli-mcp-shared-logic-consolidation
# Should print: "Updated fileTasks = 206-tasks.cli-mcp-shared-logic-consolidation (auto-set from fileSlice)"

cf set phase "Phase 6: Implementation"
# Should also set instruction to "Phase 6: Implementation"
```

**4. Confirm auto-set rules work via MCP:**
```
# Call project_update with fileArch field
# Verify fileSlicePlan is auto-set (this was previously MISSING from MCP)
```

**5. Run test suite:**
```bash
pnpm test
# All existing tests pass; new unit tests for project-defaults.ts pass
```

## Risk Assessment

### Technical Risks

- **Import path changes across packages:** Both CLI and MCP must update imports. If a consumer is missed, it would still compile (using a stale local copy) but defeat the purpose. Mitigation: the extraction deletes local definitions — missed imports cause compile errors, not silent duplication.

### Mitigation Strategies

- Delete local definitions in the same commit as adding core imports — compiler catches any missed consumers
- Run full test suite after each extraction step
- Verify `fileArch→fileSlicePlan` auto-set works in MCP for the first time (new behavior)

## Implementation Notes

### Development Approach

Suggested order within this slice:

1. **Extract constants** (`WORKTREE_SCOPED_FIELDS`, `PROJECT_TO_WORKTREE_FIELD`) — lowest risk, immediate compile-time verification
2. **Extract project creation defaults** (`formatDateProject`, `buildProjectCreationDefaults`) — isolated from update logic
3. **Extract auto-set rules** (`computeAutoSetFields`) — most complex, benefits from constants already being in core
4. **Update CLI consumers** — replace inline logic with core imports
5. **Update MCP consumers** — replace inline logic with core imports (gains `fileArch→fileSlicePlan` auto-set)
6. **Add unit tests** for the new core module
7. **Run full test suite** and verify no regressions

Each step should leave the build passing. Steps 1-3 are additive (new exports); steps 4-5 are the consumer migration.
