---
slice: compound-workflow-commands
project: context-forge
lld: user/slices/208-slice.compound-workflow-commands.md
dependencies: []
projectState: Phase migration to v0.14.0 complete. Phases 0-7 with Initiative Plan at Phase 1. All 1332 tests passing (716 core, 334 CLI, 176 MCP, 106 electron). Build clean. Existing artifact commands cf arch/plan/slice/tasks have list subcommands that will be migrated to cf list.
dateCreated: 20260323
dateUpdated: 20260323
status: not_started
---

## Context Summary
- Working on slice 208: Compound Workflow Commands
- Two parts: (A) extract and consolidate listing under `cf list`, (B) create compound workflow commands
- Existing `cf arch list`, `cf plan list`, `cf slice list`, `cf tasks list`, `cf tasks items` move to `cf list <type>`
- Seven new compound commands: `cf concept`, `cf initiatives`, `cf arch <index>`, `cf plan <index>`, `cf slice <index>`, `cf tasks <index>`, `cf implement <index>`
- Each compound command sets fields via `projectSetAction()`, then builds via extracted `buildAndPrint()`
- Refer to slice design for full architecture and data flow

---

## Section 1: Extract Reusable Action Handlers

- [ ] **1.1 Extract `buildAndPrint()` from `build.ts`**
  - File: `packages/cli/src/commands/build.ts`
  - Re-read the file before modifying
  - Extract the core logic from the commander action handler into an exported async function:
    ```typescript
    export async function buildAndPrint(opts: { project?: string; phase?: string; slice?: string }): Promise<void>
    ```
  - The existing commander action calls `buildAndPrint(opts)` — behavior unchanged
  - [ ] `buildAndPrint` is exported and callable from other modules
  - [ ] `cf build` works identically to before
  - [ ] TypeScript compiles (`npx tsc --noEmit` from `packages/cli`)

- [ ] **1.2 Extract list action from `arch.ts`**
  - File: `packages/cli/src/commands/arch.ts`
  - Re-read the file before modifying
  - Extract the `list` subcommand action handler into an exported function:
    ```typescript
    export async function archListAction(opts: { json?: boolean; all?: boolean; project?: string }): Promise<void>
    ```
  - Remove `registerArchCommand` export (no longer registers commands)
  - [ ] `archListAction` is exported
  - [ ] TypeScript compiles

- [ ] **1.3 Extract list action from `plan.ts`**
  - File: `packages/cli/src/commands/plan.ts`
  - Same pattern as 1.2: extract `planListAction`, remove `registerPlanCommand`
  - [ ] `planListAction` is exported
  - [ ] TypeScript compiles

- [ ] **1.4 Extract list action from `slice.ts`**
  - File: `packages/cli/src/commands/slice.ts`
  - Same pattern: extract `sliceListAction`, remove `registerSliceCommand`
  - [ ] `sliceListAction` is exported
  - [ ] TypeScript compiles

- [ ] **1.5 Extract list and items actions from `task.ts`**
  - File: `packages/cli/src/commands/task.ts`
  - Extract two action handlers:
    ```typescript
    export async function taskListAction(opts: { json?: boolean; all?: boolean; project?: string }): Promise<void>
    export async function taskItemsAction(opts: { json?: boolean; project?: string }): Promise<void>
    ```
  - Remove `registerTaskCommand`
  - [ ] Both `taskListAction` and `taskItemsAction` are exported
  - [ ] TypeScript compiles

- [ ] **1.6 Commit extraction**
  - Stage: `packages/cli/src/commands/build.ts`, `arch.ts`, `plan.ts`, `slice.ts`, `task.ts`
  - Commit message: `refactor(cli): extract reusable action handlers from artifact commands`
  - [ ] Commit created, build clean

---

## Section 2: Create `cf list` Command

- [ ] **2.1 Create `list.ts` with all subcommands**
  - New file: `packages/cli/src/commands/list.ts`
  - Create `registerListCommand(program: Command)` that registers:
    - `cf list initiatives` — calls `archListAction(opts)` with `--json`, `--all`, `--project` options
    - `cf list arch` — alias for `cf list initiatives` (use Commander's `.alias()`)
    - `cf list plans` — calls `planListAction(opts)`
    - `cf list slices` — calls `sliceListAction(opts)`
    - `cf list tasks` — calls `taskListAction(opts)`
    - `cf list items` — calls `taskItemsAction(opts)` with `--json`, `--project` options
  - [ ] All six subcommands are registered
  - [ ] TypeScript compiles

- [ ] **2.2 Update `index.ts` — replace old registrations with `registerListCommand`**
  - File: `packages/cli/src/index.ts`
  - Remove imports and calls for `registerArchCommand`, `registerPlanCommand`, `registerSliceCommand`, `registerTaskCommand`
  - Add import and call for `registerListCommand`
  - Keep `registerWorktreeCommand` — it's not affected
  - [ ] Old artifact commands no longer registered
  - [ ] `cf list initiatives` works
  - [ ] TypeScript compiles

- [ ] **2.3 Update existing list tests**
  - Files: `packages/cli/tests/commands/arch.test.ts`, `slice.test.ts`, `task.test.ts`
  - Rename/move test files to `packages/cli/tests/commands/list.test.ts`
  - Update test descriptions and imports to reflect the new `cf list` command paths
  - Ensure all existing test assertions are preserved — only the command invocation path changes
  - Run: `npx vitest run` from `packages/cli`
  - [ ] All migrated tests pass
  - [ ] All other existing tests still pass

- [ ] **2.4 Commit `cf list` command**
  - Stage: `packages/cli/src/commands/list.ts`, `packages/cli/src/index.ts`, test files
  - Commit message: `feat(cli): add cf list command consolidating artifact listings`
  - [ ] Commit created, build clean

---

## Section 3: Create Compound Workflow Commands

- [ ] **3.1 Create `workflow.ts` with `cf concept` and `cf initiatives`**
  - New file: `packages/cli/src/commands/workflow.ts`
  - Create `registerWorkflowCommands(program: Command)`
  - Implement `cf concept`:
    1. Resolve project (using `--project` option if provided)
    2. Check if concept doc exists → warn to stderr if so
    3. Call `projectSetAction('developmentPhase', 'Phase 0: Concept', opts)`
    4. Call `buildAndPrint(opts)`
  - Implement `cf initiatives`:
    1. Resolve project
    2. Call `projectSetAction('developmentPhase', 'Phase 1: Initiative Plan', opts)`
    3. Call `buildAndPrint(opts)`
  - Both commands accept `--project` and `--project-level` options
  - [ ] `cf concept` sets phase and outputs concept prompt
  - [ ] `cf initiatives` sets phase and outputs initiative plan prompt
  - [ ] TypeScript compiles

- [ ] **3.2 Add `cf arch <index>` and `cf plan <index>`**
  - File: `packages/cli/src/commands/workflow.ts`
  - Implement `cf arch <index>`:
    1. Call `projectSetAction('fileArch', index, opts)` — this auto-sets fileSlicePlan
    2. Call `projectSetAction('developmentPhase', 'Phase 2: Architecture', opts)`
    3. Check if arch doc exists via `detectDocuments()` → warn to stderr if so
    4. Call `buildAndPrint(opts)`
  - Implement `cf plan <index>`:
    1. Call `projectSetAction('fileSlicePlan', index, opts)`
    2. Call `projectSetAction('developmentPhase', 'Phase 3: Slice Planning', opts)`
    3. Check if slice plan exists → warn if so
    4. Call `buildAndPrint(opts)`
  - [ ] `cf arch 220` sets fileArch, auto-sets fileSlicePlan, sets phase, outputs prompt
  - [ ] `cf plan 220` sets fileSlicePlan, sets phase, outputs prompt
  - [ ] Warnings fire when artifacts exist
  - [ ] TypeScript compiles

- [ ] **3.3 Add `cf slice <index>` and `cf tasks <index>`**
  - File: `packages/cli/src/commands/workflow.ts`
  - Implement `cf slice <index>`:
    1. Call `projectSetAction('fileSlice', index, opts)` — auto-sets fileTasks
    2. Call `projectSetAction('developmentPhase', 'Phase 4: Slice Design', opts)`
    3. Check if slice design exists → warn if so
    4. Call `buildAndPrint(opts)`
  - Implement `cf tasks <index>`:
    1. Call `projectSetAction('fileTasks', index, opts)`
    2. Call `projectSetAction('developmentPhase', 'Phase 5: Task Breakdown', opts)`
    3. Check if task file exists → warn if so
    4. Call `buildAndPrint(opts)`
  - [ ] `cf slice 208` sets fileSlice, auto-sets fileTasks, sets phase, outputs prompt
  - [ ] `cf tasks 208` sets fileTasks, sets phase, outputs prompt
  - [ ] TypeScript compiles

- [ ] **3.4 Add `cf implement <index>`**
  - File: `packages/cli/src/commands/workflow.ts`
  - Implement `cf implement <index>`:
    1. Call `projectSetAction('fileSlice', index, opts)` — auto-sets fileTasks
    2. Call `projectSetAction('developmentPhase', 'Phase 6: Implementation', opts)`
    3. No artifact warning (implementation is always continuation)
    4. Call `buildAndPrint(opts)`
  - [ ] `cf implement 208` sets fileSlice, sets phase to Phase 6, outputs prompt
  - [ ] No warning emitted
  - [ ] TypeScript compiles

- [ ] **3.5 Register workflow commands in `index.ts`**
  - File: `packages/cli/src/index.ts`
  - Add import and call for `registerWorkflowCommands`
  - Place in the command group section (after workflow commands like build/check, before worktree)
  - [ ] All seven compound commands are accessible
  - [ ] Build clean

- [ ] **3.6 Commit compound commands**
  - Stage: `packages/cli/src/commands/workflow.ts`, `packages/cli/src/index.ts`
  - Commit message: `feat(cli): add compound workflow commands (concept, arch, slice, etc.)`
  - [ ] Commit created, build clean

---

## Section 4: Tests for Compound Commands

- [ ] **4.1 Unit tests for compound workflow commands**
  - New file: `packages/cli/tests/commands/workflow.test.ts`
  - Mock `projectSetAction` and `buildAndPrint` to verify call sequences
  - Tests:
    1. `cf concept` — calls set with Phase 0, calls buildAndPrint
    2. `cf initiatives` — calls set with Phase 1, calls buildAndPrint
    3. `cf arch 220` — calls set for fileArch with '220', calls set for phase, calls buildAndPrint
    4. `cf plan 220` — calls set for fileSlicePlan, calls set for phase, calls buildAndPrint
    5. `cf slice 208` — calls set for fileSlice, calls set for phase, calls buildAndPrint
    6. `cf tasks 208` — calls set for fileTasks, calls set for phase, calls buildAndPrint
    7. `cf implement 208` — calls set for fileSlice, calls set for Phase 6, calls buildAndPrint
    8. Artifact warning fires when document exists (mock `detectDocuments`)
    9. `cf implement` does not warn
  - Run: `npx vitest run` from `packages/cli`
  - [ ] All new tests pass
  - [ ] All existing tests still pass

- [ ] **4.2 Commit tests**
  - Stage: `packages/cli/tests/commands/workflow.test.ts`
  - Commit message: `test(cli): add unit tests for compound workflow commands`
  - [ ] Commit created, build clean

---

## Section 5: Final Validation

- [ ] **5.1 Full build and test verification**
  - Run `npm run build` from project root — verify clean
  - Run `npm test` from project root — verify all tests pass across all packages
  - [ ] Build succeeds with no errors
  - [ ] All tests pass (core, CLI, MCP, electron)

- [ ] **5.2 Update slice design status**
  - File: `user/slices/208-slice.compound-workflow-commands.md`
  - Update frontmatter `status: not_started` → `status: complete`
  - [ ] Status updated

- [ ] **5.3 Final commit and DEVLOG**
  - Update DEVLOG with implementation summary and commit hashes
  - Stage any remaining files
  - Commit message: `docs: mark slice 208 complete, update DEVLOG`
  - [ ] DEVLOG updated
  - [ ] Final commit created
