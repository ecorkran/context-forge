---
slice: status-display-updates
project: context-forge
lld: user/slices/184-slice.status-display-updates.md
dependencies: [182-worktree-discovery-cwd-resolution, 183-worktree-cli-commands]
projectState: Worktree plumbing complete (181-183). applyWorktreeOverlay duplicated across 8 command files. cf status shows worktree name in parenthetical after project name. No --worktree or --worktrees flags.
dateCreated: 20260311
dateUpdated: 20260311
status: complete
docType: tasks
---

# Tasks: 184 — Status & Display Updates

## Context Summary

- Working on slice 184: Status & Display Updates
- Slices 181–183 are complete; worktree overlay, CWD resolution, and CLI commands all functional
- `applyWorktreeOverlay` is duplicated identically across 8 files in `packages/cli/src/commands/`
- `cf status` currently shows `(from worktree "Default")` on the Project line; no dedicated Worktree line
- `--json` output includes `worktree: "Default"` (string only, not the full context object)
- No `--worktree <name>` or `--worktrees` flags exist on `cf status`
- Key files: `packages/cli/src/commands/status.ts`, `packages/cli/src/utils/project.ts`
- Existing utilities: `findWorktreeByNameOrId`, `resolveProjectWorktree`, `renderTable`, `parseSlicePlan`

---

## Tasks

### 1. Extract `applyWorktreeOverlay` to shared utility

- [x] Create `packages/cli/src/utils/worktree-overlay.ts`
  - [x] Move `applyWorktreeOverlay(project: ProjectData, worktreeId: string): ProjectData` from any command file
  - [x] Export the function
- [x] Verify: `pnpm --filter @context-forge/cli build` passes

**Commit**: `refactor(cli): extract applyWorktreeOverlay to shared utility`

### 2. Replace inline copies with shared import

- [x] Update `packages/cli/src/commands/status.ts`: remove local `applyWorktreeOverlay`, import from `../utils/worktree-overlay.js`
- [x] Update `packages/cli/src/commands/build.ts`: same replacement
- [x] Update `packages/cli/src/commands/arch.ts`: same replacement
- [x] Update `packages/cli/src/commands/plan.ts`: same replacement
- [x] Update `packages/cli/src/commands/slice.ts`: same replacement
- [x] Update `packages/cli/src/commands/task.ts`: same replacement
- [x] Update `packages/cli/src/commands/next.ts`: same replacement
- [x] Update `packages/cli/src/commands/project.ts`: same replacement
- [x] Verify: `pnpm --filter @context-forge/cli build` passes
- [x] Verify: all existing tests pass (`pnpm --filter @context-forge/cli test`)
- [x] Verify: `grep -r "function applyWorktreeOverlay" packages/cli/src/commands/` returns zero results

**Commit**: `refactor(cli): replace 8 inline applyWorktreeOverlay copies with shared import`

### 3. Test extracted `applyWorktreeOverlay` utility

- [x] Create `packages/cli/tests/utils/worktree-overlay.test.ts`
  - [x] Test: overlays all worktree-scoped fields when worktree found
  - [x] Test: returns project unchanged when worktreeId not found in worktrees array
  - [x] Test: falls back to project values for empty/undefined worktree fields
  - [x] Test: handles project with no `worktrees` array (undefined/empty)
- [x] Verify: all tests pass

**Commit**: `test(cli): add unit tests for shared applyWorktreeOverlay`

### 4. Add `Worktree:` line to `cf status` display

- [x] In `packages/cli/src/commands/status.ts`:
  - [x] When `worktreeId` is resolved, find the full worktree context object from `rawProject.worktrees`
  - [x] Add `Worktree:` line after `Project:` showing `{name} [{rangeStart}-{rangeEnd}]`
  - [x] Remove `(from worktree "...")` suffix from Project line when Worktree line is shown
  - [x] Keep existing `(from CWD)`, `(--project flag)`, `(default)` labels when no worktree resolved
- [x] When no worktree resolved: no `Worktree:` line, existing behavior unchanged
- [x] Verify: `cf status` from project root shows `Worktree: Default [100-499]` line

**Commit**: `feat(cli): add Worktree display line to cf status`

### 5. Test `Worktree:` line display

- [x] In `packages/cli/tests/commands/worktree-overlay.test.ts` (or a new `status-worktree.test.ts`):
  - [x] Test: worktree resolved → output contains `Worktree:` line with name and range
  - [x] Test: worktree resolved → Project line does NOT contain `(from worktree`
  - [x] Test: no worktree resolved → no `Worktree:` line, source label on Project line
- [x] Verify: all tests pass

**Commit**: `test(cli): add Worktree line display tests`

### 6. Add `--worktree <name|id>` flag to `cf status`

- [x] In `packages/cli/src/commands/status.ts`:
  - [x] Add `.option('--worktree <name>', 'Show status for a specific worktree')` to the command
  - [x] Update options type to include `worktree?: string`
  - [x] When `opts.worktree` is provided:
    1. Resolve project via `resolveProjectWorktree` (ignoring worktree from CWD)
    2. Call `findWorktreeByNameOrId(projectId, opts.worktree, store)` to find the worktree
    3. If not found, throw `UserError`: `Worktree '${opts.worktree}' not found. Run cf worktree list to see available worktrees.`
    4. Use found worktree's `id` as `worktreeId` for overlay and display
  - [x] Import `findWorktreeByNameOrId` from `../utils/project.js`
- [x] Verify: `cf status --worktree maintenance` shows maintenance worktree status
- [x] Verify: `cf status --worktree nonexistent` shows error message

**Commit**: `feat(cli): add --worktree flag to cf status`

### 7. Test `--worktree` flag

- [x] Add tests:
  - [x] Test: `--worktree` by name resolves correct worktree and shows its overlaid status
  - [x] Test: `--worktree` by id resolves correct worktree
  - [x] Test: `--worktree` with unknown name produces UserError with guidance message
  - [x] Test: `--worktree` combined with `--project` resolves project first, then worktree within it
- [x] Verify: all tests pass

**Commit**: `test(cli): add --worktree flag tests for cf status`

### 8. Add `--worktrees` dashboard flag to `cf status`

- [x] In `packages/cli/src/commands/status.ts`:
  - [x] Add `.option('--worktrees', 'Show summary of all worktrees')` to the command
  - [x] Update options type to include `worktrees?: boolean`
  - [x] Add mutual exclusion check: if both `opts.worktree` and `opts.worktrees`, throw `UserError('--worktree and --worktrees are mutually exclusive.')`
  - [x] When `opts.worktrees` is set:
    1. Resolve project (no worktree overlay needed for the project itself)
    2. If `project.worktrees` is empty/undefined, print `dim('No worktrees configured.')` and return
    3. For each worktree: apply overlay to get effective field values
    4. For each worktree with a `slicePlan` and `projectPath`: call `parseSlicePlan` to get `completed/total`
    5. Render table with columns: Name, Range, Phase, Slice, Progress
    6. Mark active worktree (CWD-matched) with `← active` suffix
  - [x] Import `parseSlicePlan`, `resolveArtifactPath` from `@context-forge/core/node`
  - [x] Import `renderTable` from `../output/tables.js`
- [x] For `--worktrees --json`: output array of worktree summary objects
- [x] Verify: `cf status --worktrees` displays table with all worktrees

**Commit**: `feat(cli): add --worktrees dashboard flag to cf status`

### 9. Test `--worktrees` dashboard

- [x] Add tests:
  - [x] Test: project with multiple worktrees renders table with correct columns
  - [x] Test: project with no worktrees prints "No worktrees configured."
  - [x] Test: active worktree marked with `← active`
  - [x] Test: worktree with no slice/phase shows `—` in those columns
  - [x] Test: `--worktree` and `--worktrees` together produces mutual exclusion error
  - [x] Test: `--worktrees --json` outputs array
- [x] Verify: all tests pass

**Commit**: `test(cli): add --worktrees dashboard tests`

### 10. Enrich `--json` output with full `WorktreeContext` object

- [x] In `packages/cli/src/commands/status.ts`:
  - [x] When `worktreeId` is resolved and `opts.json` is true:
    - Replace `{ ...status, worktree: worktreeName }` with `{ ...status, worktree: worktreeObject }`
    - `worktreeObject` is the full `WorktreeContext` from `rawProject.worktrees`
  - [x] When no worktree resolved: `--json` output unchanged (no `worktree` key)
- [x] Verify: `cf status --json | jq '.worktree'` returns full object with `id`, `name`, `indexRange`, etc.

**Commit**: `feat(cli): enrich cf status --json with full WorktreeContext object`

### 11. Test `--json` enrichment

- [x] Add tests:
  - [x] Test: JSON output with worktree includes full object (id, name, indexRange, worktreePath, etc.)
  - [x] Test: JSON output without worktree has no `worktree` key
  - [x] Test: JSON output with `--worktrees` is array of worktree summaries
- [x] Verify: all tests pass

**Commit**: `test(cli): add JSON enrichment tests for cf status`

### 12. Final verification and cleanup

- [x] Run full test suite: `pnpm test` — all tests pass
- [x] Run full build: `pnpm build` — no errors
- [x] Verify no remaining inline `applyWorktreeOverlay` in command files: `grep -r "function applyWorktreeOverlay" packages/cli/src/commands/` returns empty
- [x] Run verification walkthrough from slice design (section "Verification Walkthrough")
- [x] Update slice design verification walkthrough with actual commands and output
- [x] Update slice design status to `complete`
- [x] Check off slice 184 in slice plan `180-slices.initiative-context-worktree.md`

**Commit**: `docs: mark slice 184 complete with verification walkthrough`
