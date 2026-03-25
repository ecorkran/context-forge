---
slice: compound-workflow-commands
project: context-forge
lld: user/slices/208-slice.compound-workflow-commands.md
dependencies: []
projectState: Phase migration to v0.14.0 complete. Phases 0-7 with Initiative Plan at Phase 1. All 1332 tests passing (716 core, 334 CLI, 176 MCP, 106 electron). Build clean. Existing artifact commands cf arch/plan/slice/tasks have list subcommands that will be migrated to cf list.
dateCreated: 20260323
dateUpdated: 20260324
status: complete
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

- [x] **1.1 Extract `buildAndPrint()` from `build.ts`**
  - File: `packages/cli/src/commands/build.ts`
  - Re-read the file before modifying
  - Extract the core logic from the commander action handler into an exported async function:
    ```typescript
    export async function buildAndPrint(opts: { project?: string; phase?: string; slice?: string }): Promise<void>
    ```
  - The existing commander action calls `buildAndPrint(opts)` — behavior unchanged
  - [x] `buildAndPrint` is exported and callable from other modules
  - [x] `cf build` works identically to before
  - [x] TypeScript compiles (`npx tsc --noEmit` from `packages/cli`)

- [x] **1.2 Extract project list action from `project.ts`**
  - File: `packages/cli/src/commands/project.ts`
  - Re-read the file before modifying
  - Extract the `cf project list` action handler into an exported function:
    ```typescript
    export async function projectListAction(opts: { json?: boolean }): Promise<void>
    ```
  - Keep the `cf project list` subcommand registration in `registerProjectCommand` — it continues to call `projectListAction` (no breaking change)
  - [x] `projectListAction` is exported
  - [x] `cf project list` works identically to before
  - [x] TypeScript compiles

- [x] **1.3 Extract list action from `arch.ts`**
  - File: `packages/cli/src/commands/arch.ts`
  - Re-read the file before modifying
  - Extract the `list` subcommand action handler into an exported function:
    ```typescript
    export async function archListAction(opts: { json?: boolean; all?: boolean; project?: string }): Promise<void>
    ```
  - Remove `registerArchCommand` export (no longer registers commands)
  - [x] `archListAction` is exported
  - [x] TypeScript compiles

- [x] **1.4 Extract list action from `plan.ts`**
  - File: `packages/cli/src/commands/plan.ts`
  - Same pattern as 1.2: extract `planListAction`, remove `registerPlanCommand`
  - [x] `planListAction` is exported
  - [x] TypeScript compiles

- [x] **1.5 Extract list action from `slice.ts`**
  - File: `packages/cli/src/commands/slice.ts`
  - Same pattern: extract `sliceListAction`, remove `registerSliceCommand`
  - [x] `sliceListAction` is exported
  - [x] TypeScript compiles

- [x] **1.6 Extract list and items actions from `task.ts`**
  - File: `packages/cli/src/commands/task.ts`
  - Extract two action handlers:
    ```typescript
    export async function taskListAction(opts: { json?: boolean; all?: boolean; project?: string }): Promise<void>
    export async function taskItemsAction(opts: { json?: boolean; project?: string }): Promise<void>
    ```
  - Remove `registerTaskCommand`
  - [x] Both `taskListAction` and `taskItemsAction` are exported
  - [x] TypeScript compiles

- [x] **1.7 Commit extraction**
  - Stage: `packages/cli/src/commands/build.ts`, `project.ts`, `arch.ts`, `plan.ts`, `slice.ts`, `task.ts`
  - Commit message: `refactor(cli): extract reusable action handlers from artifact commands`
  - [x] Commit created, build clean

---

## Section 2: Create `cf list` Command

- [x] **2.1 Create `list.ts` with all subcommands**
  - New file: `packages/cli/src/commands/list.ts`
  - Create `registerListCommand(program: Command)` that registers:
    - `cf list projects` — calls `projectListAction(opts)` with `--json` option
    - `cf list initiatives` — calls `archListAction(opts)` with `--json`, `--all`, `--project` options
    - `cf list arch` — alias for `cf list initiatives` (use Commander's `.alias()`)
    - `cf list plans` — calls `planListAction(opts)`
    - `cf list slices` — calls `sliceListAction(opts)`
    - `cf list tasks` — calls `taskListAction(opts)`
    - `cf list items` — calls `taskItemsAction(opts)` with `--json`, `--project` options
  - `cf project list` remains as-is (calls same `projectListAction`) — no breaking change
  - [x] All seven subcommands are registered
  - [x] TypeScript compiles

- [x] **2.2 Update `index.ts` — replace old registrations with `registerListCommand`**
  - File: `packages/cli/src/index.ts`
  - Remove imports and calls for `registerArchCommand`, `registerPlanCommand`, `registerSliceCommand`, `registerTaskCommand`
  - Add import and call for `registerListCommand`
  - Keep `registerWorktreeCommand` — it's not affected
  - [x] Old artifact commands no longer registered
  - [x] `cf list initiatives` works
  - [x] TypeScript compiles

- [x] **2.3 Update and expand list tests**
  - Files: `packages/cli/tests/commands/arch.test.ts`, `slice.test.ts`, `task.test.ts`
  - Rename/move test files to `packages/cli/tests/commands/list.test.ts`
  - Update test descriptions and imports to reflect the new `cf list` command paths
  - Preserve all existing test assertions — verify output parity between old and new commands
  - Add tests for:
    1. `cf list projects` — produces same output as `cf project list`
    2. `cf list arch` alias — produces identical output to `cf list initiatives`
    3. `--json` flag produces valid JSON output for each subcommand
    4. `--all` flag on applicable subcommands shows items from all worktrees
    5. Old commands (`cf arch list`, `cf plan list`, `cf slice list`, `cf tasks list`, `cf tasks items`) are no longer registered — verify they error or are unrecognized
  - Run: `npx vitest run` from `packages/cli`
  - [x] All migrated tests pass with output parity verified
  - [x] Alias test passes
  - [x] `--json` and `--all` flags tested
  - [x] Old commands confirmed removed
  - [x] All other existing tests still pass

- [x] **2.4 Commit `cf list` command**
  - Stage: `packages/cli/src/commands/list.ts`, `packages/cli/src/index.ts`, test files
  - Commit message: `feat(cli): add cf list command consolidating artifact listings`
  - [x] Commit created, build clean

---

## Section 3: Create Compound Workflow Commands

- [x] **3.1 Create `workflow.ts` with `cf concept` and `cf initiatives`**
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
  - [x] `cf concept` sets phase and outputs concept prompt
  - [x] `cf initiatives` sets phase and outputs initiative plan prompt
  - [x] TypeScript compiles

- [x] **3.2 Add `cf arch <index>` and `cf plan <index>`**
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
  - [x] `cf arch 220` sets fileArch, auto-sets fileSlicePlan, sets phase, outputs prompt
  - [x] `cf plan 220` sets fileSlicePlan, sets phase, outputs prompt
  - [x] Warnings fire when artifacts exist
  - [x] TypeScript compiles

- [x] **3.3 Add `cf slice <index>` and `cf tasks <index>`**
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
  - [x] `cf slice 208` sets fileSlice, auto-sets fileTasks, sets phase, outputs prompt
  - [x] `cf tasks 208` sets fileTasks, sets phase, outputs prompt
  - [x] TypeScript compiles

- [x] **3.4 Add `cf implement <index>`**
  - File: `packages/cli/src/commands/workflow.ts`
  - Implement `cf implement <index>`:
    1. Call `projectSetAction('fileSlice', index, opts)` — auto-sets fileTasks
    2. Call `projectSetAction('developmentPhase', 'Phase 6: Implementation', opts)`
    3. No artifact warning (implementation is always continuation)
    4. Call `buildAndPrint(opts)`
  - [x] `cf implement 208` sets fileSlice, sets phase to Phase 6, outputs prompt
  - [x] No warning emitted
  - [x] TypeScript compiles

- [x] **3.5 Register workflow commands in `index.ts`**
  - File: `packages/cli/src/index.ts`
  - Add import and call for `registerWorkflowCommands`
  - Place in the command group section (after workflow commands like build/check, before worktree)
  - [x] All seven compound commands are accessible
  - [x] Build clean

- [x] **3.6 Commit compound commands**
  - Stage: `packages/cli/src/commands/workflow.ts`, `packages/cli/src/index.ts`
  - Commit message: `feat(cli): add compound workflow commands (concept, arch, slice, etc.)`
  - [x] Commit created, build clean

---

## Section 4: Tests for Compound Commands

- [x] **4.1 Unit tests for compound workflow commands**
  - New file: `packages/cli/tests/commands/workflow.test.ts`
  - Mock `projectSetAction` and `buildAndPrint` to verify call sequences
  - **Command sequence tests** (mock projectSetAction and buildAndPrint):
    1. [x] `cf concept` — calls set with Phase 0, calls buildAndPrint
    2. [x] `cf initiatives` — calls set with Phase 1, calls buildAndPrint
    3. [x] `cf arch 220` — calls set for fileArch with '220', calls set for phase, calls buildAndPrint
    4. [x] `cf plan 220` — calls set for fileSlicePlan, calls set for phase, calls buildAndPrint
    5. [x] `cf slice 208` — calls set for fileSlice, calls set for phase, calls buildAndPrint
    6. [x] `cf tasks 208` — calls set for fileTasks, calls set for phase, calls buildAndPrint
    7. [x] `cf implement 208` — calls set for fileSlice, calls set for Phase 6, calls buildAndPrint
  - **Warning behavior tests** (mock `detectDocuments`):
    8. [x] Artifact warning fires when document exists — verify warning written to stderr
    9. [x] `cf implement` does not warn even when slice design exists
  - **Auto-set verification** (verify projectSetAction called with correct field so auto-set triggers):
    10. [x] `cf arch 220` — verify `projectSetAction('fileArch', ...)` is called (auto-sets fileSlicePlan)
    11. [x] `cf slice 208` — verify `projectSetAction('fileSlice', ...)` is called (auto-sets fileTasks)
  - **Stdout/stderr routing**:
    12. [x] Verify `buildAndPrint` output goes to stdout (capture stdout)
    13. [x] Verify set confirmations and warnings go to stderr (capture stderr)
  - **Worktree correctness**:
    14. [x] Verify `--project-level` option is passed through to `projectSetAction`
    15. [x] Verify default behavior passes worktree-aware opts (no `--project-level` flag)
  - Note: auto-set rules are tested in core (`project-autoset.test.ts`). These tests verify the compound commands call `projectSetAction` with the correct field names that trigger auto-set, not that auto-set itself works.
  - Run: `npx vitest run` from `packages/cli`
  - [x] All new tests pass
  - [x] All existing tests still pass

- [x] **4.2 Commit tests**
  - Stage: `packages/cli/tests/commands/workflow.test.ts`
  - Commit message: `test(cli): add unit tests for compound workflow commands`
  - [x] Commit created, build clean

---

## Section 5: Final Validation

- [x] **5.1 Full build and test verification**
  - Run `npm run build` from project root — verify clean
  - Run `npm test` from project root — verify all tests pass across all packages
  - [x] Build succeeds with no errors
  - [x] All tests pass (core, CLI, MCP, electron)

- [x] **5.2 Update slice design status**
  - File: `user/slices/208-slice.compound-workflow-commands.md`
  - Update frontmatter `status: not_started` → `status: complete`
  - [x] Status updated (reopened in Section 6 for slash commands + TTY output)

- [x] **5.3 Final commit and DEVLOG**
  - Update DEVLOG with implementation summary and commit hashes
  - Stage any remaining files
  - Commit message: `docs: mark slice 208 complete, update DEVLOG`
  - [x] DEVLOG updated
  - [x] Final commit created

---

## Section 6: Slash Commands & TTY-Aware Output

- [x] **6.1 Bare CLI help message for `buildAndPrint()`**
  - File: `packages/cli/src/commands/build.ts`
  - Modify `buildAndPrint()`: instead of outputting raw prompt to stdout, write a help message to stderr:
    ```
    Context built for {project} ({phase}, {slice}).

    To use this context:
      /cf:build            — load as working context in Claude Code
      cf build --json      — output as JSON for pipelines
    ```
  - No raw prompt output to stdout in any case (breaking change: `cf build | pbcopy` no longer works)
  - For compound commands, the help message adapts to show the relevant command (e.g., `/cf:slice 208`)
  - `buildAndPrint()` needs a way to know the originating command name for the help message (parameter or option)
  - [x] Bare CLI shows help message to stderr, nothing to stdout
  - [x] TypeScript compiles

- [x] **6.2 `--json` flag for compound commands and `cf build`**
  - Files: `packages/cli/src/commands/workflow.ts`, `packages/cli/src/commands/build.ts`
  - Add `--json` option to all compound commands and `cf build`
  - When `--json` is passed, output JSON to stdout:
    ```json
    { "project": "context-forge", "phase": "Phase 4: Slice Design", "context": "..." }
    ```
  - `--json` always outputs regardless of TTY (explicit flag overrides TTY detection)
  - [x] `cf build --json` outputs JSON
  - [x] `cf slice 208 --json` outputs JSON
  - [x] TypeScript compiles

- [x] **6.3 Create slash command files**
  - Directory: `packages/cli/commands/cf/`
  - Create 7 new files following the `/cf:build` pattern:
    - `concept.md` — `/cf:concept`
    - `initiatives.md` — `/cf:initiatives`
    - `arch.md` — `/cf:arch <index>`
    - `plan.md` — `/cf:plan <index>`
    - `slice.md` — `/cf:slice <index>`
    - `tasks.md` — `/cf:tasks <index>`
    - `implement.md` — `/cf:implement <index>`
  - Each file uses the same framing as `build.md`:
    ```markdown
    ---
    description: {description}
    argument-hint: {hint}
    allowed-tools: Bash(cf:*)
    ---

    Use the following as your working context. Confirm receipt...

    !`cf {command} $ARGUMENTS`
    ```
  - [x] All 7 files created
  - [x] Files follow established pattern

- [x] **6.4 Register slash commands in `commandInstaller.ts`**
  - File: `packages/cli/src/commands/commandInstaller.ts`
  - Add new files to `MANAGED_FILES` array
  - [x] `cf install-commands` installs all new slash commands
  - [x] `cf uninstall-commands` removes all new slash commands

- [x] **6.5 Tests for TTY-aware output and --json**
  - File: `packages/cli/tests/commands/workflow.test.ts` (extend existing)
  - Add tests:
    1. [x] `cf slice 208` — help message to stderr, no raw prompt to stdout
    2. [x] `cf slice 208 --json` — JSON output to stdout
    3. [x] `cf build` — help message to stderr, no raw prompt to stdout
    4. [x] `cf build --json` — JSON output to stdout
  - [x] All new tests pass
  - [x] All existing tests still pass

**Commit**: `feat(cli): add slash commands, TTY-aware output, and --json for compound commands`

- [x] **6.6 Update verification walkthrough**
  - File: `user/slices/208-slice.compound-workflow-commands.md`
  - Add verification steps for TTY behavior, --json output, and slash command installation

---

## Section 7: Final Validation (Phase 2)

- [x] **7.1 Full build and test verification**
  - Run `pnpm build` from project root — verify clean
  - Run `pnpm test` from project root — verify all tests pass
  - [x] Build succeeds with no errors
  - [x] All tests pass

- [x] **7.2 Install and verify slash commands**
  - Run `cf install-commands`
  - Verify new commands appear in `~/.claude/commands/cf/`
  - [x] All 7 new slash command files installed

- [x] **7.3 Update slice design and DEVLOG**
  - Update slice design status back to `complete`
  - Update DEVLOG with Phase 2 summary
  - [x] Status updated
  - [x] DEVLOG updated
  - [x] Final commit created
