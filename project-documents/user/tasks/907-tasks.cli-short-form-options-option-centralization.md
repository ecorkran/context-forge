---
docType: tasks
slice: 907
component: cli-short-form-options-option-centralization
parent: user/slices/907-slice.cli-short-form-options-option-centralization.md
project: context-forge
dateCreated: 20260402
dateUpdated: 20260402
status: complete
---

# Tasks: CLI Short-Form Options & Option Centralization

## Context

The CLI has 78 option registrations across 16 command files with zero centralization. Common options (`--json`, `--project`, `--yes`, `--fix`, `--all`, `--raw`, `--project-level`) are copy-pasted inline with inconsistent descriptions. This task breakdown creates a shared `options.ts` module, migrates all command files to use it, and adds short-form flags.

**Slice design:** `user/slices/907-slice.cli-short-form-options-option-centralization.md`

## Section 1 — Shared Options Module

### Task 1.1: Create `packages/cli/src/options.ts`

- [x] Create new file `packages/cli/src/options.ts`
- [x] Implement 7 composable helper functions, each taking a `Command` and returning it:
  - [x] `withJsonOption` — `-j, --json`, description: `'Output as JSON'`
  - [x] `withProjectOption` — `-p, --project <id>`, description: `'Project ID or name (overrides default)'`
  - [x] `withYesOption` — `-y, --yes`, description: `'Skip confirmation prompt'`
  - [x] `withFixOption` — `-f, --fix`, description: `'Apply non-destructive corrections (when available)'`
  - [x] `withAllOption` — `-a, --all`, description: `'Show items from all worktrees'`
  - [x] `withRawOption` — `-r, --raw`, description: `'Output raw content without formatting'`
  - [x] `withProjectLevelOption` — `--project-level` (no short form), description: `'Force operation at project level (skip worktree routing)'`
- [x] Each function has a JSDoc comment showing the flag pattern
- [x] Import type is `import type { Command } from 'commander'`
- [x] Build passes: `pnpm --filter @context-forge/cli run build`

**Success criteria:** File compiles, 7 functions exported, build passes.

### Task 1.2: Unit tests for shared option helpers

- [x] Create `packages/cli/tests/options.test.ts`
- [x] Test each helper registers the expected option on a Commander `Command` instance
- [x] Verify short flags: parse `-j` → `opts.json === true`, parse `-p foo` → `opts.project === 'foo'`, etc.
- [x] Verify `withProjectLevelOption` has no short flag
- [x] Tests pass: `pnpm --filter @context-forge/cli run test`

**Success criteria:** All 7 helpers tested, short flags verified via Commander's `.parse()`.

### Task 1.3: Commit

- [x] Commit with message: `feat(cli): add shared option helpers with short-form flags`

## Section 2 — Migrate Command Files (High-Use Options)

For each file below: import the relevant helpers from `../options.js`, replace inline `.option()` calls for common options with helper calls, and leave command-specific options inline. Do not change action handler signatures or logic.

### Task 2.1: Migrate `index.ts` (top-level shortcuts)

- [x] Import helpers: `withJsonOption`, `withProjectOption`, `withProjectLevelOption`
- [x] `get` command: replace `--json`, `--project`, `--project-level` (3 options)
- [x] `set` command: replace `--project`, `--project-level` (2 options)
- [x] `unset` command: replace `--project`, `--project-level` (2 options)
- [x] Build passes

### Task 2.2: Migrate `list.ts`

- [x] Import helpers: `withJsonOption`, `withAllOption`, `withProjectOption`
- [x] `list projects`: replace `--json` (1 option)
- [x] `list initiatives`: replace `--json`, `--all`, `--project` (3 options)
- [x] `list arch`: replace `--json`, `--all`, `--project` (3 options)
- [x] `list plans`: replace `--json`, `--all`, `--project` (3 options)
- [x] `list slices`: replace `--json`, `--project` (2 options)
- [x] `list tasks`: replace `--json`, `--all`, `--project` (3 options)
- [x] `list items`: replace `--json`, `--project` (2 options)
- [x] Build passes

### Task 2.3: Migrate `project.ts`

- [x] Import helpers: `withJsonOption`, `withProjectOption`, `withYesOption`, `withProjectLevelOption`
- [x] `project list`: replace `--json` (1 option)
- [x] `project get`: replace `--json`, `--project`, `--project-level` (3 options)
- [x] `project set`: replace `--project`, `--project-level` (2 options)
- [x] `project unset`: replace `--project`, `--project-level` (2 options)
- [x] `project rm`: replace `--project`, `--yes` (2 options)
- [x] Build passes

### Task 2.4: Migrate `check.ts`

- [x] Import helpers: `withJsonOption`, `withProjectOption`, `withYesOption`, `withFixOption`
- [x] Replace `--json`, `--project`, `--fix`, `--yes` (4 of 5 options)
- [x] `--slice <index>` remains inline
- [x] Build passes

### Task 2.5: Migrate `guides.ts`

- [x] Import helpers: `withJsonOption`, `withProjectOption`
- [x] `guides` / `guides info`: replace `--json`, `--project` (2 options)
- [x] `guides install`: replace `--project` (1 option; `--strategy`, `--source` remain inline)
- [x] `guides uninstall`: replace `--project` (1 option)
- [x] `guides update`: replace `--project` (1 option)
- [x] Build passes

### Task 2.6: Commit

- [x] Commit with message: `refactor(cli): migrate high-use commands to shared option helpers`

## Section 3 — Migrate Remaining Command Files

### Task 3.1: Migrate `build.ts`

- [x] Import helpers: `withJsonOption`, `withProjectOption`
- [x] Replace `--json`, `--project` (2 of 9 options; all others remain inline)
- [x] Build passes

### Task 3.2: Migrate `config.ts`

- [x] Import helpers: `withJsonOption`, `withProjectOption`
- [x] `config get`: replace `--json`, `--project`
- [x] `config set`: replace `--project`
- [x] Build passes

### Task 3.3: Migrate `future.ts`

- [x] Import helpers: `withJsonOption`, `withAllOption`, `withProjectOption`
- [x] Replace `--json`, `--all`, `--project` (3 of 4 options; `--status` remains inline)
- [x] Build passes

### Task 3.4: Migrate `next.ts`

- [x] Import helpers: `withJsonOption`, `withProjectOption`
- [x] Replace `--json`, `--project` (2 options)
- [x] Build passes

### Task 3.5: Migrate `prompt.ts`

- [x] Import helpers: `withJsonOption`, `withProjectOption`, `withRawOption`
- [x] `prompt list`: replace `--json`, `--project`
- [x] `prompt get`: replace `--project`, `--raw`
- [x] Build passes

### Task 3.6: Migrate `status.ts`

- [x] Import helpers: `withJsonOption`, `withProjectOption`
- [x] Replace `--json`, `--project` (2 of 4 options; `--worktree`, `--worktrees` remain inline)
- [x] Build passes

### Task 3.7: Migrate `setup-ide.ts`

- [x] Import helpers: `withProjectOption`, `withYesOption`
- [x] Replace `--project`, `--yes` (2 options)
- [x] Build passes

### Task 3.8: Migrate `update.ts`

- [x] Import helpers: `withJsonOption`, `withYesOption`
- [x] Replace `--json`, `--yes` (2 options)
- [x] Build passes

### Task 3.9: Migrate `worktree.ts`

- [x] Import helpers: `withProjectOption`, `withYesOption`, `withJsonOption`
- [x] `worktree init`: replace `--project` (1 option; `--name`, `--range`, `--path`, `-o` remain inline)
- [x] `worktree list`: replace `--project`, `--json` (2 options)
- [x] `worktree update`: replace `--project` (1 option; `--name`, `--range`, `--path`, `-o` remain inline)
- [x] `worktree rm`: replace `--project`, `--yes` (2 options)
- [x] Build passes

### Task 3.10: Commit

- [x] Commit with message: `refactor(cli): migrate remaining commands to shared option helpers`

## Section 4 — Verification & Cleanup

### Task 4.1: Run full test suite

- [x] `pnpm --filter @context-forge/cli run test` — all tests pass
- [x] `pnpm --filter @context-forge/core run test` — all tests pass
- [x] `pnpm --filter @context-forge/mcp run test` — all tests pass

### Task 4.2: Verify no inline common options remain

- [x] `grep -rn "\.option('--json'" packages/cli/src/` returns 0 results (only definition in options.ts)
- [x] `grep -rn "\.option('--project " packages/cli/src/` returns 0 results
- [x] `grep -rn "\.option('--yes'" packages/cli/src/` returns 0 results
- [x] `grep -rn "\.option('--fix'" packages/cli/src/` returns 0 results
- [x] `grep -rn "\.option('--all'" packages/cli/src/` returns 0 results
- [x] `grep -rn "\.option('--raw'" packages/cli/src/` returns 0 results
- [x] `grep -rn "\.option('--project-level'" packages/cli/src/` returns only options.ts (canonical definition)

### Task 4.3: Verify help output shows short forms

- [x] `node packages/cli/dist/index.js status --help` shows `-j, --json` and `-p, --project <id>`
- [x] `node packages/cli/dist/index.js check --help` shows `-f, --fix` and `-y, --yes`
- [x] `node packages/cli/dist/index.js list tasks --help` shows `-a, --all`
- [x] `node packages/cli/dist/index.js prompt get --help` shows `-r, --raw`

### Task 4.4: Update slice and plan status

- [x] Update `907-slice` frontmatter status to `complete`
- [x] Update `907-tasks` frontmatter status to `complete`
- [x] Check off slice 907 in `900-slices.maintenance-and-refactoring.md`
- [x] Update DEVLOG with completion entry
- [x] Update CHANGELOG `[Unreleased]` section

### Task 4.5: Final commit

- [x] Commit with message: `docs: complete slice 907 CLI short-form options`
