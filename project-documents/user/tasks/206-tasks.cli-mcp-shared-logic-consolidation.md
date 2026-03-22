---
docType: tasks
slice: cli-mcp-shared-logic-consolidation
project: context-forge
parent: user/slices/206-slice.cli-mcp-shared-logic-consolidation.md
dependencies: []
dateCreated: 20260322
dateUpdated: 20260322
status: complete
---

# Tasks: CLI/MCP Shared-Logic Consolidation

## Context

Extract duplicated orchestration logic from `@context-forge/cli` and `@context-forge/mcp-server` into `@context-forge/core`. Three categories of code are duplicated: constants (`WORKTREE_SCOPED_FIELDS`, `PROJECT_TO_WORKTREE_FIELD`), project creation defaults (`dateProject` formatting, default field values), and auto-set rules (`developmentPhase→instruction`, `fileArch→fileSlicePlan`, `fileSlice→fileTasks`). The MCP auto-set is missing the `fileArch→fileSlicePlan` rule entirely — this gets fixed as a side effect of the consolidation.

**Key files:**
- New: `packages/core/src/project-defaults.ts`
- Modify: `packages/core/src/index.ts` (exports)
- Modify: `packages/cli/src/commands/project.ts` (remove local constants + auto-set logic)
- Modify: `packages/cli/src/commands/init.ts` (remove inline creation defaults)
- Modify: `packages/mcp-server/src/tools/projectTools.ts` (remove local constants + auto-set logic)

## Tasks

### 1. Create core module with constants

- [x] **1.1** Create `packages/core/src/project-defaults.ts` with the `WORKTREE_SCOPED_FIELDS` Set and `PROJECT_TO_WORKTREE_FIELD` Record, matching the definitions currently at CLI `project.ts:60-79` and MCP `projectTools.ts:10-29`.
  - Success: File exists, exports both constants, types are correct (`Set<string>` and `Record<string, string>`).

- [x] **1.2** Add export line to `packages/core/src/index.ts` for `WORKTREE_SCOPED_FIELDS` and `PROJECT_TO_WORKTREE_FIELD` from `./project-defaults.js`.
  - Success: `import { WORKTREE_SCOPED_FIELDS, PROJECT_TO_WORKTREE_FIELD } from '@context-forge/core'` compiles.

- [x] **1.3** Update CLI `packages/cli/src/commands/project.ts`: remove local `WORKTREE_SCOPED_FIELDS` and `PROJECT_TO_WORKTREE_FIELD` definitions (lines 60-79), import from `@context-forge/core` instead.
  - Success: Build passes. No local definitions of these constants remain in CLI.

- [x] **1.4** Update MCP `packages/mcp-server/src/tools/projectTools.ts`: remove local `WORKTREE_SCOPED_FIELDS` and `PROJECT_TO_WORKTREE_FIELD` definitions (lines 10-29), import from `@context-forge/core` instead.
  - Success: Build passes. No local definitions of these constants remain in MCP.

- [x] **1.5** Run `pnpm test` — all existing tests pass.
  - Success: Zero test failures.

- [x] **1.6** Commit: `refactor(core): extract worktree field constants into project-defaults module`.

### 2. Add project creation defaults to core module

- [x] **2.1** Add `formatDateProject(date?: Date): string` to `project-defaults.ts`. Returns `YYYYMMDD` string for the given date (defaults to `new Date()`).
  - Success: Function exported, returns correct format.

- [x] **2.2** Add `ProjectCreationOptions` interface and `buildProjectCreationDefaults(opts): Partial<ProjectData>` to `project-defaults.ts`, as specified in slice design §Extraction 2. Import `ProjectData` type from core types.
  - Success: Function exported, returns object with `name`, `projectPath`, `dateProject`, `template`, `fileSlice`, `instruction`, `developmentPhase`.

- [x] **2.3** Export `formatDateProject`, `buildProjectCreationDefaults`, and `ProjectCreationOptions` from `packages/core/src/index.ts`.
  - Success: Imports compile from `@context-forge/core`.

- [x] **2.4** Write unit tests for `formatDateProject` and `buildProjectCreationDefaults` in `packages/core/tests/project-defaults.test.ts`.
  - Tests for `formatDateProject`: known date returns expected YYYYMMDD, single-digit month/day are zero-padded.
  - Tests for `buildProjectCreationDefaults`: default values match current CLI behavior (`template: 'default'`, `developmentPhase: 'Phase 1: Concept'`), optional `developmentPhase` override works, `instruction` matches `developmentPhase`.
  - Success: All new tests pass.

- [x] **2.5** Update CLI `packages/cli/src/commands/init.ts`: replace inline `dateProject` formatting (line 78-80) and project creation object (lines 80-88) with `buildProjectCreationDefaults()` call.
  - Success: Build passes. `grep -n "getMonth.*padStart" packages/cli/src/commands/init.ts` returns no matches.

- [x] **2.6** Update MCP `packages/mcp-server/src/tools/projectTools.ts`: replace inline `dateProject` formatting and project creation defaults (lines 121-132) with `buildProjectCreationDefaults()` call.
  - Success: Build passes. `grep -n "getMonth.*padStart" packages/mcp-server/src/tools/projectTools.ts` returns no matches.

- [x] **2.7** Run `pnpm test` — all existing tests pass, new unit tests pass.
  - Success: Zero test failures.

- [x] **2.8** Commit: `refactor(core): extract project creation defaults into project-defaults module`.

### 3. Extract auto-set rules to core module

- [x] **3.1** Add `AutoSetResult` interface and `computeAutoSetFields(field, value, projectPath)` function to `project-defaults.ts`, as specified in slice design §Extraction 3. Import `resolveFileByIndex` from core.
  - Implements all three rules: `developmentPhase→instruction`, `fileArch→fileSlicePlan`, `fileSlice→fileTasks`.
  - When `projectPath` is undefined, only `developmentPhase→instruction` fires.
  - Success: Function exported with correct signature.

- [x] **3.2** Export `computeAutoSetFields` and `AutoSetResult` from `packages/core/src/index.ts`.
  - Success: Imports compile from `@context-forge/core`.

- [x] **3.3** Write unit tests for `computeAutoSetFields` in `packages/core/tests/project-defaults.test.ts`.
  - Test each rule in isolation (developmentPhase, fileArch, fileSlice).
  - Test with undefined `projectPath` — only developmentPhase rule fires.
  - Test with non-matching field — returns empty derivedUpdates.
  - Test `fileArch` regex fallback when `resolveFileByIndex` throws.
  - Test `fileSlice` regex fallback when `resolveFileByIndex` throws.
  - Success: All new tests pass.

- [x] **3.4** Update CLI `packages/cli/src/commands/project.ts`: replace inline auto-set if/else chains (worktree path ~lines 247-298, project path ~lines 312-346) with `computeAutoSetFields()` call. Keep CLI-specific console logging using `descriptions` array.
  - Success: Build passes. Auto-set logic in CLI is reduced to calling `computeAutoSetFields` + applying results.

- [x] **3.5** Update MCP `packages/mcp-server/src/tools/projectTools.ts`: replace inline auto-set logic (lines 297-359) with `computeAutoSetFields()` call. Discard `descriptions` array (MCP doesn't log).
  - Success: Build passes. MCP now gains the previously-missing `fileArch→fileSlicePlan` auto-set rule.

- [x] **3.6** Run `pnpm test` — all tests pass.
  - Success: Zero test failures.

- [x] **3.7** Commit: `refactor(core): extract auto-set rules into project-defaults module`.

### 4. Verification

- [x] **4.1** Run duplication verification commands from slice design §Verification Walkthrough step 1:
  - `grep -r "WORKTREE_SCOPED_FIELDS" packages/cli packages/mcp-server --include="*.ts"` — only import statements.
  - `grep -r "PROJECT_TO_WORKTREE_FIELD" packages/cli packages/mcp-server --include="*.ts"` — only import statements.
  - `grep -rn "getMonth.*padStart" packages/cli packages/mcp-server --include="*.ts"` — no results.
  - Success: No local definitions or inline date formatting remain in CLI or MCP.

- [x] **4.2** Run full `pnpm run build && pnpm test` to confirm no regressions.
  - Success: Clean build, zero test failures.

- [x] **4.3** Verify CLI project creation parity: run `cf init --name test-parity /tmp/test-parity` and confirm defaults match expected values (`template: 'default'`, `developmentPhase: 'Phase 1: Concept'`, `dateProject` in YYYYMMDD format). Clean up test project after.
  - Success: CLI project creation produces identical defaults as before extraction.

- [x] **4.4** Verify CLI auto-set rules work:
  - `cf set fileArch 200-arch.developer-onboarding` → should auto-set `fileSlicePlan`.
  - `cf set fileSlice 206-slice.cli-mcp-shared-logic-consolidation` → should auto-set `fileTasks`.
  - `cf set phase "Phase 6: Implementation"` → should also set `instruction`.
  - Success: All three auto-set rules produce expected derived values.

- [x] **4.5** Verify MCP `fileArch→fileSlicePlan` auto-set works (manually or via test): call `project_update` with a `fileArch` value and confirm `fileSlicePlan` is auto-set.
  - Success: `fileSlicePlan` is derived from `fileArch` in MCP (new behavior).

- [x] **4.6** Update slice status to `complete` in `206-slice.cli-mcp-shared-logic-consolidation.md` frontmatter. Check off slice 206 in `200-slices.developer-onboarding.md`. Write DEVLOG entry.
