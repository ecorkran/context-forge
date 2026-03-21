---
slice: overlapping-index-range-override
project: context-forge
lld: user/slices/193-slice.overlapping-index-range-override.md
dependencies: [188]
projectState: Slice 192 complete. All worktree CRUD, range chopping, display, and file operations working. chopDefaultRange() blocks overlapping ranges or throws when artifacts would be displaced. No override mechanism exists. Build clean, 1281 tests passing (677 core, 324 CLI, 174 MCP, 106 electron).
dateCreated: 20260320
dateUpdated: 20260320
status: not_started
---

## Context Summary
- Working on slice 193: Overlapping Index Range Override
- Adds `rangeOverride` flag so worktrees can intentionally overlap index ranges
- Three layers: core type + service logic, CLI flags + display, MCP tool params
- Key behavior: `-o`/`--override` skips `chopDefaultRange()`, stores `rangeOverride: true` on worktree, suppresses `cf set` out-of-range warning
- Override is clearable: updating range without `-o` clears `rangeOverride` and re-enables chop
- Refer to slice design for full architecture and data flow

---

## Section 1: Core Type & Service Changes

- [ ] **1.1 Add `rangeOverride` to `WorktreeContext` type**
  - File: `packages/core/src/types/worktree.ts`
  - Re-read the file before modifying
  - Add `rangeOverride?: boolean` field to `WorktreeContext` interface (after `workType`)
  - Add JSDoc: `/** When true, this worktree intentionally overlaps other ranges (skips chop logic) */`
  - [ ] Field exists on `WorktreeContext`
  - [ ] TypeScript compiles (`npx tsc --noEmit` from `packages/core`)

- [ ] **1.2 Add `override` to `CreateWorktreeInput` type**
  - File: `packages/core/src/types/worktree.ts`
  - Add `override?: boolean` field to `CreateWorktreeInput` interface
  - Add JSDoc: `/** Skip range-chopping and allow intentional overlap */`
  - [ ] Field exists on `CreateWorktreeInput`
  - [ ] TypeScript compiles

- [ ] **1.3 Update `WorktreeService.addWorktree()` to support override**
  - File: `packages/core/src/services/WorktreeService.ts`
  - Re-read the file before modifying
  - When constructing `newWorktree`, set `rangeOverride: input.override ? true : undefined`
  - In the first-worktree migration branch (around line 174): wrap `this.chopDefaultRange()` call in `if (!input.override)`
  - In the append branch (around line 191): wrap `this.chopDefaultRange()` call in `if (!input.override)`
  - When override is true, set `chopWarning = undefined` (no chop occurred)
  - `findOverlaps()` call at line 196 remains unconditional — overlaps are still advisory
  - [ ] `addWorktree()` with `override: true` creates worktree with `rangeOverride: true`
  - [ ] `addWorktree()` with `override: true` does NOT call `chopDefaultRange()`
  - [ ] `addWorktree()` without override behaves identically to before
  - [ ] `findOverlaps()` still runs regardless of override

- [ ] **1.4 Update `WorktreeService.updateWorktree()` to support override**
  - File: `packages/core/src/services/WorktreeService.ts`
  - Re-read the file before modifying
  - In the `if (updates.indexRange)` block (around line 225):
    1. Determine override state: `const hasOverride = updates.rangeOverride === true || (updates.rangeOverride === undefined && worktrees[index].rangeOverride === true)`
    2. If `hasOverride`: skip `chopDefaultRange()` call
    3. If `!hasOverride` and the existing worktree had `rangeOverride === true`: set `updated.rangeOverride = undefined` to clear it
  - When `updates.rangeOverride` is explicitly provided without `updates.indexRange`, it should still be applied (allows toggling override without changing range)
  - [ ] `updateWorktree()` with `rangeOverride: true` and new `indexRange` skips chop
  - [ ] `updateWorktree()` with new `indexRange` but no `rangeOverride` on a previously-overridden worktree clears `rangeOverride` and runs chop
  - [ ] `updateWorktree()` without `indexRange` change behaves identically to before

- [ ] **1.5 Unit tests for core override logic**
  - File: `packages/core/tests/services/WorktreeService.test.ts`
  - Re-read the file before modifying
  - Add tests within or adjacent to the existing `chopDefaultRange` describe block:
    1. `addWorktree with override: true skips chopDefaultRange` — create a project with default worktree [100, 799], add overlapping worktree with `override: true`. Assert default range is unchanged, new worktree has `rangeOverride: true`
    2. `addWorktree with override: true still returns overlaps` — same setup, assert `overlaps` array is non-empty
    3. `addWorktree with override: true on first worktree (migration path)` — project with workflow fields, no worktrees. Add with override. Assert migration occurs, default range is NOT chopped, new worktree has `rangeOverride: true`
    4. `updateWorktree with rangeOverride: true skips chop` — update an existing worktree's range with `rangeOverride: true`. Assert default range unchanged
    5. `updateWorktree clears rangeOverride when updating range without override flag` — worktree has `rangeOverride: true`, update with new `indexRange` but no `rangeOverride`. Assert `rangeOverride` is cleared (undefined), chop runs normally
    6. `updateWorktree preserves rangeOverride when not changing range` — worktree has `rangeOverride: true`, update name only. Assert `rangeOverride` is still true
  - Run: `npx vitest run` from `packages/core`
  - [ ] All 6 new tests pass
  - [ ] All existing tests still pass

- [ ] **1.6 Commit core changes**
  - Stage: `packages/core/src/types/worktree.ts`, `packages/core/src/services/WorktreeService.ts`, `packages/core/tests/services/WorktreeService.test.ts`
  - Commit message: `feat(core): add rangeOverride support to WorktreeContext and WorktreeService`
  - [ ] Commit created, build clean

---

## Section 2: CLI Changes

- [ ] **2.1 Add `getWorktreeRangeOverride` helper**
  - File: `packages/cli/src/utils/worktree-overlay.ts`
  - Re-read the file before modifying
  - Add exported function:
    ```typescript
    export function getWorktreeRangeOverride(
      project: ProjectData,
      worktreeId?: string,
    ): boolean {
      if (!worktreeId || !project.worktrees) return false;
      const wt = project.worktrees.find((w) => w.id === worktreeId);
      return wt?.rangeOverride === true;
    }
    ```
  - [ ] Function exported
  - [ ] TypeScript compiles (`npx tsc --noEmit` from `packages/cli`)

- [ ] **2.2 Suppress out-of-range warning in `projectSetAction`**
  - File: `packages/cli/src/commands/project.ts`
  - Re-read the file before modifying (around line 229)
  - Import `getWorktreeRangeOverride` from `../utils/worktree-overlay.js`
  - Before the existing out-of-range warning check, retrieve override status: `const worktreeHasOverride = getWorktreeRangeOverride(existing, worktreeId)`
  - Add `&& !worktreeHasOverride` to the warning condition
  - [ ] Warning is suppressed when worktree has `rangeOverride: true`
  - [ ] Warning still fires for non-override worktrees with out-of-range index

- [ ] **2.3 Unit tests for overlay helper and warning suppression**
  - Files: `packages/cli/tests/utils/worktree-overlay.test.ts`, `packages/cli/tests/commands/project.test.ts`
  - Re-read before modifying
  - `worktree-overlay.test.ts`: add tests for `getWorktreeRangeOverride`:
    1. Returns `false` when no worktreeId
    2. Returns `false` when worktree has no `rangeOverride`
    3. Returns `true` when worktree has `rangeOverride: true`
  - `project.test.ts`: add test adjacent to existing "warns when index is outside worktree range" test:
    1. `does not warn when worktree has rangeOverride: true` — set up worktree with `rangeOverride: true`, set slice outside range, assert `console.warn` not called
  - Run: `npx vitest run` from `packages/cli`
  - [ ] All new tests pass
  - [ ] All existing tests still pass

- [ ] **2.4 Add `-o`/`--override` flag to `cf worktree init`**
  - File: `packages/cli/src/commands/worktree.ts`
  - Re-read the file before modifying
  - Add `.option('-o, --override', 'Allow overlapping index ranges (skip range chopping)')` to the `init` subcommand
  - Add `override?: boolean` to the opts type
  - Pass `override: opts.override` in the `addWorktree()` input object (alongside `name`, `indexRange`, `worktreePath`, `archDoc`, `slicePlan`)
  - [ ] `cf worktree init --name X --range 100-199 -o` passes `override: true` to service
  - [ ] `cf worktree init --name X --range 100-199` (no flag) does not set override

- [ ] **2.5 Add `-o`/`--override` flag to `cf worktree update`**
  - File: `packages/cli/src/commands/worktree.ts`
  - Re-read the file before modifying
  - Add `.option('-o, --override', 'Allow overlapping index ranges (skip range chopping)')` to the `update` subcommand
  - Add `override?: boolean` to the opts type
  - When `opts.override` is true: add `rangeOverride: true` to the updates object
  - [ ] `cf worktree update X --range 100-199 -o` passes `rangeOverride: true` in updates
  - [ ] `cf worktree update X --range 100-199` (no flag) does not set `rangeOverride`

- [ ] **2.6 Add `[override]` indicator to `cf worktree list` display**
  - File: `packages/cli/src/commands/worktree.ts`
  - Re-read the file before modifying (the list command, around line 213)
  - In the row-building loop, when `wt.rangeOverride === true`, append ` [override]` to `rangeStr`
  - Use the `warn` style for the indicator: `` rangeStr = `${rangeStr} ${warn('[override]')}` ``
  - JSON output already includes the full worktree object (which will contain `rangeOverride`), so no change needed there
  - [ ] `cf worktree list` shows `[override]` next to range for overridden worktrees
  - [ ] Non-override worktrees show range without indicator
  - [ ] JSON output includes `rangeOverride` field

- [ ] **2.7 CLI unit tests for override flags and display**
  - File: `packages/cli/tests/commands/worktree.test.ts`
  - Re-read before modifying
  - Add tests:
    1. `init with -o flag passes override to addWorktree` — mock `addWorktree`, parse `cf worktree init --name X --range 100-199 -o`, assert mock called with `override: true`
    2. `update with -o flag passes rangeOverride in updates` — mock `updateWorktree`, parse `cf worktree update X --range 100-199 -o`, assert mock called with `rangeOverride: true`
    3. `list shows [override] indicator for overridden worktrees` — mock worktree list with one worktree having `rangeOverride: true`, assert console output contains `[override]`
  - Run: `npx vitest run` from `packages/cli`
  - [ ] All new tests pass
  - [ ] All existing tests still pass

- [ ] **2.8 Commit CLI changes**
  - Stage: `packages/cli/src/utils/worktree-overlay.ts`, `packages/cli/src/commands/project.ts`, `packages/cli/src/commands/worktree.ts`, `packages/cli/tests/utils/worktree-overlay.test.ts`, `packages/cli/tests/commands/project.test.ts`, `packages/cli/tests/commands/worktree.test.ts`
  - Commit message: `feat(cli): add -o/--override flag for worktree range override`
  - [ ] Commit created, build clean

---

## Section 3: MCP Tool Changes

- [ ] **3.1 Add `override` parameter to `worktree_init` MCP tool**
  - File: `packages/mcp-server/src/tools/worktreeTools.ts`
  - Re-read the file before modifying
  - Add `override: z.boolean().optional().describe('Skip range-chopping and allow intentional overlap.')` to `worktree_init` inputSchema
  - Pass `override: args.override` in the `addWorktree()` call input
  - [ ] `worktree_init` accepts `override: true`
  - [ ] Override value is passed through to service

- [ ] **3.2 Add `rangeOverride` parameter to `worktree_update` MCP tool**
  - File: `packages/mcp-server/src/tools/worktreeTools.ts`
  - Re-read the file before modifying
  - Add `rangeOverride: z.boolean().optional().describe('Allow overlapping index ranges (skip range chopping).')` to `worktree_update` inputSchema
  - Add `'rangeOverride'` to the `fieldKeys` array so it gets included in updates
  - [ ] `worktree_update` accepts `rangeOverride: true`
  - [ ] Value is passed through to service

- [ ] **3.3 MCP unit tests for override parameters**
  - File: `packages/mcp-server/tests/worktreeTools.test.ts`
  - Re-read before modifying
  - Add tests:
    1. `worktree_init with override creates worktree with rangeOverride` — call `worktree_init` with `override: true`, assert response includes `rangeOverride: true`
    2. `worktree_update with rangeOverride updates worktree` — call `worktree_update` with `rangeOverride: true`, assert response worktree has `rangeOverride: true`
  - Run: `npx vitest run` from `packages/mcp-server`
  - [ ] All new tests pass
  - [ ] All existing tests still pass

- [ ] **3.4 Commit MCP changes**
  - Stage: `packages/mcp-server/src/tools/worktreeTools.ts`, `packages/mcp-server/tests/worktreeTools.test.ts`
  - Commit message: `feat(mcp): add override parameter to worktree_init and worktree_update tools`
  - [ ] Commit created, build clean

---

## Section 4: Final Validation

- [ ] **4.1 Full build and test verification**
  - Run `npm run build` from project root — verify clean
  - Run `npm test` from project root — verify all tests pass across all packages
  - [ ] Build succeeds with no errors
  - [ ] All tests pass (core, CLI, MCP, electron)

- [ ] **4.2 Update slice design status**
  - File: `project-documents/user/slices/193-slice.overlapping-index-range-override.md`
  - Update frontmatter `status: not_started` → `status: complete`
  - [ ] Status updated

- [ ] **4.3 Final commit and DEVLOG**
  - Update DEVLOG with implementation summary and commit hashes
  - Stage any remaining files
  - Commit message: `docs: mark slice 193 complete, update DEVLOG`
  - [ ] DEVLOG updated
  - [ ] Final commit created
