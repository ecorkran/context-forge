---
docType: tasks
slice: 907
component: cli-short-form-options-option-centralization
parent: user/slices/907-slice.cli-short-form-options-option-centralization.md
project: context-forge
dateCreated: 20260402
dateUpdated: 20260402
status: not_started
---

# Tasks: CLI Short-Form Options & Option Centralization

## Context

The CLI has 78 option registrations across 16 command files with zero centralization. Common options (`--json`, `--project`, `--yes`, `--fix`, `--all`, `--raw`, `--project-level`) are copy-pasted inline with inconsistent descriptions. This task breakdown creates a shared `options.ts` module, migrates all command files to use it, and adds short-form flags.

**Slice design:** `user/slices/907-slice.cli-short-form-options-option-centralization.md`

## Section 1 — Shared Options Module

### Task 1.1: Create `packages/cli/src/options.ts`

- [ ] Create new file `packages/cli/src/options.ts`
- [ ] Implement 7 composable helper functions, each taking a `Command` and returning it:
  - [ ] `withJsonOption` — `-j, --json`, description: `'Output as JSON'`
  - [ ] `withProjectOption` — `-p, --project <id>`, description: `'Project ID or name (overrides default)'`
  - [ ] `withYesOption` — `-y, --yes`, description: `'Skip confirmation prompt'`
  - [ ] `withFixOption` — `-f, --fix`, description: `'Apply non-destructive corrections (when available)'`
  - [ ] `withAllOption` — `-a, --all`, description: `'Show items from all worktrees'`
  - [ ] `withRawOption` — `-r, --raw`, description: `'Output raw content without formatting'`
  - [ ] `withProjectLevelOption` — `--project-level` (no short form), description: `'Force operation at project level (skip worktree routing)'`
- [ ] Each function has a JSDoc comment showing the flag pattern
- [ ] Import type is `import type { Command } from 'commander'`
- [ ] Build passes: `pnpm --filter @context-forge/cli run build`

**Success criteria:** File compiles, 7 functions exported, build passes.

### Task 1.2: Unit tests for shared option helpers

- [ ] Create `packages/cli/tests/options.test.ts`
- [ ] Test each helper registers the expected option on a Commander `Command` instance
- [ ] Verify short flags: parse `-j` → `opts.json === true`, parse `-p foo` → `opts.project === 'foo'`, etc.
- [ ] Verify `withProjectLevelOption` has no short flag
- [ ] Tests pass: `pnpm --filter @context-forge/cli run test`

**Success criteria:** All 7 helpers tested, short flags verified via Commander's `.parse()`.

### Task 1.3: Commit

- [ ] Commit with message: `feat(cli): add shared option helpers with short-form flags`

## Section 2 — Migrate Command Files (High-Use Options)

For each file below: import the relevant helpers from `../options.js`, replace inline `.option()` calls for common options with helper calls, and leave command-specific options inline. Do not change action handler signatures or logic.

### Task 2.1: Migrate `index.ts` (top-level shortcuts)

- [ ] Import helpers: `withJsonOption`, `withProjectOption`, `withProjectLevelOption`
- [ ] `get` command: replace `--json`, `--project`, `--project-level` (3 options)
- [ ] `set` command: replace `--project`, `--project-level` (2 options)
- [ ] `unset` command: replace `--project`, `--project-level` (2 options)
- [ ] Build passes

### Task 2.2: Migrate `list.ts`

- [ ] Import helpers: `withJsonOption`, `withAllOption`, `withProjectOption`
- [ ] `list projects`: replace `--json` (1 option)
- [ ] `list initiatives`: replace `--json`, `--all`, `--project` (3 options)
- [ ] `list arch`: replace `--json`, `--all`, `--project` (3 options)
- [ ] `list plans`: replace `--json`, `--all`, `--project` (3 options)
- [ ] `list slices`: replace `--json`, `--project` (2 options)
- [ ] `list tasks`: replace `--json`, `--all`, `--project` (3 options)
- [ ] `list items`: replace `--json`, `--project` (2 options)
- [ ] Build passes

### Task 2.3: Migrate `project.ts`

- [ ] Import helpers: `withJsonOption`, `withProjectOption`, `withYesOption`, `withProjectLevelOption`
- [ ] `project list`: replace `--json` (1 option)
- [ ] `project get`: replace `--json`, `--project`, `--project-level` (3 options)
- [ ] `project set`: replace `--project`, `--project-level` (2 options)
- [ ] `project unset`: replace `--project`, `--project-level` (2 options)
- [ ] `project rm`: replace `--project`, `--yes` (2 options)
- [ ] Build passes

### Task 2.4: Migrate `check.ts`

- [ ] Import helpers: `withJsonOption`, `withProjectOption`, `withYesOption`, `withFixOption`
- [ ] Replace `--json`, `--project`, `--fix`, `--yes` (4 of 5 options)
- [ ] `--slice <index>` remains inline
- [ ] Build passes

### Task 2.5: Migrate `guides.ts`

- [ ] Import helpers: `withJsonOption`, `withProjectOption`
- [ ] `guides` / `guides info`: replace `--json`, `--project` (2 options)
- [ ] `guides install`: replace `--project` (1 option; `--strategy`, `--source` remain inline)
- [ ] `guides uninstall`: replace `--project` (1 option)
- [ ] `guides update`: replace `--project` (1 option)
- [ ] Build passes

### Task 2.6: Commit

- [ ] Commit with message: `refactor(cli): migrate high-use commands to shared option helpers`

## Section 3 — Migrate Remaining Command Files

### Task 3.1: Migrate `build.ts`

- [ ] Import helpers: `withJsonOption`, `withProjectOption`
- [ ] Replace `--json`, `--project` (2 of 9 options; all others remain inline)
- [ ] Build passes

### Task 3.2: Migrate `config.ts`

- [ ] Import helpers: `withJsonOption`, `withProjectOption`
- [ ] `config get`: replace `--json`, `--project`
- [ ] `config set`: replace `--project`
- [ ] Build passes

### Task 3.3: Migrate `future.ts`

- [ ] Import helpers: `withJsonOption`, `withAllOption`, `withProjectOption`
- [ ] Replace `--json`, `--all`, `--project` (3 of 4 options; `--status` remains inline)
- [ ] Build passes

### Task 3.4: Migrate `next.ts`

- [ ] Import helpers: `withJsonOption`, `withProjectOption`
- [ ] Replace `--json`, `--project` (2 options)
- [ ] Build passes

### Task 3.5: Migrate `prompt.ts`

- [ ] Import helpers: `withJsonOption`, `withProjectOption`, `withRawOption`
- [ ] `prompt list`: replace `--json`, `--project`
- [ ] `prompt get`: replace `--project`, `--raw`
- [ ] Build passes

### Task 3.6: Migrate `status.ts`

- [ ] Import helpers: `withJsonOption`, `withProjectOption`
- [ ] Replace `--json`, `--project` (2 of 4 options; `--worktree`, `--worktrees` remain inline)
- [ ] Build passes

### Task 3.7: Migrate `setup-ide.ts`

- [ ] Import helpers: `withProjectOption`, `withYesOption`
- [ ] Replace `--project`, `--yes` (2 options)
- [ ] Build passes

### Task 3.8: Migrate `update.ts`

- [ ] Import helpers: `withJsonOption`, `withYesOption`
- [ ] Replace `--json`, `--yes` (2 options)
- [ ] Build passes

### Task 3.9: Migrate `worktree.ts`

- [ ] Import helpers: `withProjectOption`, `withYesOption`, `withJsonOption`
- [ ] `worktree init`: replace `--project` (1 option; `--name`, `--range`, `--path`, `-o` remain inline)
- [ ] `worktree list`: replace `--project`, `--json` (2 options)
- [ ] `worktree update`: replace `--project` (1 option; `--name`, `--range`, `--path`, `-o` remain inline)
- [ ] `worktree rm`: replace `--project`, `--yes` (2 options)
- [ ] Build passes

### Task 3.10: Commit

- [ ] Commit with message: `refactor(cli): migrate remaining commands to shared option helpers`

## Section 4 — Verification & Cleanup

### Task 4.1: Run full test suite

- [ ] `pnpm --filter @context-forge/cli run test` — all tests pass
- [ ] `pnpm --filter @context-forge/core run test` — all tests pass
- [ ] `pnpm --filter @context-forge/mcp run test` — all tests pass

### Task 4.2: Verify no inline common options remain

- [ ] `grep -rn "\.option('--json'" packages/cli/src/` returns 0 results
- [ ] `grep -rn "\.option('--project " packages/cli/src/` returns 0 results
- [ ] `grep -rn "\.option('--yes'" packages/cli/src/` returns 0 results
- [ ] `grep -rn "\.option('--fix'" packages/cli/src/` returns 0 results
- [ ] `grep -rn "\.option('--all'" packages/cli/src/` returns 0 results
- [ ] `grep -rn "\.option('--raw'" packages/cli/src/` returns 0 results
- [ ] `grep -rn "\.option('--project-level'" packages/cli/src/` returns 0 results

### Task 4.3: Verify help output shows short forms

- [ ] `node packages/cli/dist/index.js status --help` shows `-j, --json` and `-p, --project <id>`
- [ ] `node packages/cli/dist/index.js check --help` shows `-f, --fix` and `-y, --yes`
- [ ] `node packages/cli/dist/index.js list slices --help` shows `-a, --all`
- [ ] `node packages/cli/dist/index.js prompt get --help` shows `-r, --raw`

### Task 4.4: Update slice and plan status

- [ ] Update `907-slice` frontmatter status to `complete`
- [ ] Update `907-tasks` frontmatter status to `complete`
- [ ] Check off slice 907 in `900-slices.maintenance-and-refactoring.md`
- [ ] Update DEVLOG with completion entry
- [ ] Update CHANGELOG `[Unreleased]` section

### Task 4.5: Final commit

- [ ] Commit with message: `docs: complete slice 907 CLI short-form options`
