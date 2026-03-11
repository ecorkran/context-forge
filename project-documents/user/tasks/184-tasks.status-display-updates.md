---
slice: status-display-updates
project: context-forge
lld: user/slices/184-slice.status-display-updates.md
dependencies: [182-worktree-discovery-cwd-resolution, 183-worktree-cli-commands]
projectState: Worktree plumbing complete (181-183). applyWorktreeOverlay duplicated across 8 command files. cf status shows worktree name in parenthetical after project name. No --worktree or --worktrees flags.
dateCreated: 20260311
dateUpdated: 20260311
status: not_started
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

- [ ] Create `packages/cli/src/utils/worktree-overlay.ts`
  - [ ] Move `applyWorktreeOverlay(project: ProjectData, worktreeId: string): ProjectData` from any command file
  - [ ] Export the function
- [ ] Verify: `pnpm --filter @context-forge/cli build` passes

**Commit**: `refactor(cli): extract applyWorktreeOverlay to shared utility`

### 2. Replace inline copies with shared import

- [ ] Update `packages/cli/src/commands/status.ts`: remove local `applyWorktreeOverlay`, import from `../utils/worktree-overlay.js`
- [ ] Update `packages/cli/src/commands/build.ts`: same replacement
- [ ] Update `packages/cli/src/commands/arch.ts`: same replacement
- [ ] Update `packages/cli/src/commands/plan.ts`: same replacement
- [ ] Update `packages/cli/src/commands/slice.ts`: same replacement
- [ ] Update `packages/cli/src/commands/task.ts`: same replacement
- [ ] Update `packages/cli/src/commands/next.ts`: same replacement
- [ ] Update `packages/cli/src/commands/project.ts`: same replacement
- [ ] Verify: `pnpm --filter @context-forge/cli build` passes
- [ ] Verify: all existing tests pass (`pnpm --filter @context-forge/cli test`)
- [ ] Verify: `grep -r "function applyWorktreeOverlay" packages/cli/src/commands/` returns zero results

**Commit**: `refactor(cli): replace 8 inline applyWorktreeOverlay copies with shared import`

### 3. Test extracted `applyWorktreeOverlay` utility

- [ ] Create `packages/cli/tests/utils/worktree-overlay.test.ts`
  - [ ] Test: overlays all worktree-scoped fields when worktree found
  - [ ] Test: returns project unchanged when worktreeId not found in worktrees array
  - [ ] Test: falls back to project values for empty/undefined worktree fields
  - [ ] Test: handles project with no `worktrees` array (undefined/empty)
- [ ] Verify: all tests pass

**Commit**: `test(cli): add unit tests for shared applyWorktreeOverlay`

### 4. Add `Worktree:` line to `cf status` display

- [ ] In `packages/cli/src/commands/status.ts`:
  - [ ] When `worktreeId` is resolved, find the full worktree context object from `rawProject.worktrees`
  - [ ] Add `Worktree:` line after `Project:` showing `{name} [{rangeStart}-{rangeEnd}]`
  - [ ] Remove `(from worktree "...")` suffix from Project line when Worktree line is shown
  - [ ] Keep existing `(from CWD)`, `(--project flag)`, `(default)` labels when no worktree resolved
- [ ] When no worktree resolved: no `Worktree:` line, existing behavior unchanged
- [ ] Verify: `cf status` from project root shows `Worktree: Default [100-499]` line

**Commit**: `feat(cli): add Worktree display line to cf status`

### 5. Test `Worktree:` line display

- [ ] In `packages/cli/tests/commands/worktree-overlay.test.ts` (or a new `status-worktree.test.ts`):
  - [ ] Test: worktree resolved → output contains `Worktree:` line with name and range
  - [ ] Test: worktree resolved → Project line does NOT contain `(from worktree`
  - [ ] Test: no worktree resolved → no `Worktree:` line, source label on Project line
- [ ] Verify: all tests pass

**Commit**: `test(cli): add Worktree line display tests`

### 6. Add `--worktree <name|id>` flag to `cf status`

- [ ] In `packages/cli/src/commands/status.ts`:
  - [ ] Add `.option('--worktree <name>', 'Show status for a specific worktree')` to the command
  - [ ] Update options type to include `worktree?: string`
  - [ ] When `opts.worktree` is provided:
    1. Resolve project via `resolveProjectWorktree` (ignoring worktree from CWD)
    2. Call `findWorktreeByNameOrId(projectId, opts.worktree, store)` to find the worktree
    3. If not found, throw `UserError`: `Worktree '${opts.worktree}' not found. Run cf worktree list to see available worktrees.`
    4. Use found worktree's `id` as `worktreeId` for overlay and display
  - [ ] Import `findWorktreeByNameOrId` from `../utils/project.js`
- [ ] Verify: `cf status --worktree maintenance` shows maintenance worktree status
- [ ] Verify: `cf status --worktree nonexistent` shows error message

**Commit**: `feat(cli): add --worktree flag to cf status`

### 7. Test `--worktree` flag

- [ ] Add tests:
  - [ ] Test: `--worktree` by name resolves correct worktree and shows its overlaid status
  - [ ] Test: `--worktree` by id resolves correct worktree
  - [ ] Test: `--worktree` with unknown name produces UserError with guidance message
  - [ ] Test: `--worktree` combined with `--project` resolves project first, then worktree within it
- [ ] Verify: all tests pass

**Commit**: `test(cli): add --worktree flag tests for cf status`

### 8. Add `--worktrees` dashboard flag to `cf status`

- [ ] In `packages/cli/src/commands/status.ts`:
  - [ ] Add `.option('--worktrees', 'Show summary of all worktrees')` to the command
  - [ ] Update options type to include `worktrees?: boolean`
  - [ ] Add mutual exclusion check: if both `opts.worktree` and `opts.worktrees`, throw `UserError('--worktree and --worktrees are mutually exclusive.')`
  - [ ] When `opts.worktrees` is set:
    1. Resolve project (no worktree overlay needed for the project itself)
    2. If `project.worktrees` is empty/undefined, print `dim('No worktrees configured.')` and return
    3. For each worktree: apply overlay to get effective field values
    4. For each worktree with a `slicePlan` and `projectPath`: call `parseSlicePlan` to get `completed/total`
    5. Render table with columns: Name, Range, Phase, Slice, Progress
    6. Mark active worktree (CWD-matched) with `← active` suffix
  - [ ] Import `parseSlicePlan`, `resolveArtifactPath` from `@context-forge/core/node`
  - [ ] Import `renderTable` from `../output/tables.js`
- [ ] For `--worktrees --json`: output array of worktree summary objects
- [ ] Verify: `cf status --worktrees` displays table with all worktrees

**Commit**: `feat(cli): add --worktrees dashboard flag to cf status`

### 9. Test `--worktrees` dashboard

- [ ] Add tests:
  - [ ] Test: project with multiple worktrees renders table with correct columns
  - [ ] Test: project with no worktrees prints "No worktrees configured."
  - [ ] Test: active worktree marked with `← active`
  - [ ] Test: worktree with no slice/phase shows `—` in those columns
  - [ ] Test: `--worktree` and `--worktrees` together produces mutual exclusion error
  - [ ] Test: `--worktrees --json` outputs array
- [ ] Verify: all tests pass

**Commit**: `test(cli): add --worktrees dashboard tests`

### 10. Enrich `--json` output with full `WorktreeContext` object

- [ ] In `packages/cli/src/commands/status.ts`:
  - [ ] When `worktreeId` is resolved and `opts.json` is true:
    - Replace `{ ...status, worktree: worktreeName }` with `{ ...status, worktree: worktreeObject }`
    - `worktreeObject` is the full `WorktreeContext` from `rawProject.worktrees`
  - [ ] When no worktree resolved: `--json` output unchanged (no `worktree` key)
- [ ] Verify: `cf status --json | jq '.worktree'` returns full object with `id`, `name`, `indexRange`, etc.

**Commit**: `feat(cli): enrich cf status --json with full WorktreeContext object`

### 11. Test `--json` enrichment

- [ ] Add tests:
  - [ ] Test: JSON output with worktree includes full object (id, name, indexRange, worktreePath, etc.)
  - [ ] Test: JSON output without worktree has no `worktree` key
  - [ ] Test: JSON output with `--worktrees` is array of worktree summaries
- [ ] Verify: all tests pass

**Commit**: `test(cli): add JSON enrichment tests for cf status`

### 12. Final verification and cleanup

- [ ] Run full test suite: `pnpm test` — all tests pass
- [ ] Run full build: `pnpm build` — no errors
- [ ] Verify no remaining inline `applyWorktreeOverlay` in command files: `grep -r "function applyWorktreeOverlay" packages/cli/src/commands/` returns empty
- [ ] Run verification walkthrough from slice design (section "Verification Walkthrough")
- [ ] Update slice design verification walkthrough with actual commands and output
- [ ] Update slice design status to `complete`
- [ ] Check off slice 184 in slice plan `180-slices.initiative-context-worktree.md`

**Commit**: `docs: mark slice 184 complete with verification walkthrough`
