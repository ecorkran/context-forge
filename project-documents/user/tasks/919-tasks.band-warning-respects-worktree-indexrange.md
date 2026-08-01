---
docType: tasks
slice: band-warning-respects-worktree-indexrange
project: context-forge
lld: user/slices/919-slice.band-warning-respects-worktree-indexrange.md
dependencies: []
projectState: Slice 918 merged to main; main is green (core 1032, cli 471, mcp-server 190). The band-warning block at WorkflowNavigator.ts:261-269 still uses hundredBlock() exclusively. The range helpers (isInIndexRange, getWorktreeIndexRange, getWorktreeRangeOverride) live in packages/cli/src/utils/worktree-overlay.ts and are not reachable from core. ResolvedProject is declared in services/projectResolver.ts.
dateCreated: 20260801
dateUpdated: 20260801
status: not_started
---

## Context Summary

- Working on slice 919: `cf next`'s index-band warning assumes one architecture
  owns exactly one hundred-block, so a worktree declaring `indexRange: [100, 799]`
  trips a false warning on every slice at 200/300/…/700 (GitHub #48).
- The fix re-points the warning at the declared `indexRange` instead of the
  inferred hundred-block, using a three-tier resolution: active worktree → union
  of all worktrees → legacy hundred-block. See Decision 1 in the LLD.
- Two enabling moves are required first, both pure relocations with no behavior
  change: the range helpers must reach core, and `ResolvedProject` must live in
  `types/` so `introspection/` can read `resolvedWorktree` without importing from
  `services/`.
- `cf set slice` already implements the correct worktree-scoped semantics
  (`packages/cli/src/commands/project.ts:310-316`). This slice makes `cf next`
  agree with it; `cf set slice` itself is not modified.
- An external contributor's PR (#49) implements the union-only form of this fix.
  It is superseded, not merged — see Task 12.
- Dependencies: none.
- Delivers: no band warning in correctly-configured worktree projects; a
  worktree-named warning when the active slice is genuinely outside its
  worktree's range; unchanged behavior for projects with no worktrees.
- Next planned slice: none queued after 919 — 909 remains the last incomplete
  entry in the 900 plan (missing task file, tracked separately).

---

## Tasks

### Part 1 — Enabling moves (pure relocations, no behavior change)

- [ ] 1. Move the three range helpers from the CLI into core
  - [ ] Move `isInIndexRange()`, `getWorktreeIndexRange()`, and
        `getWorktreeRangeOverride()` from
        `packages/cli/src/utils/worktree-overlay.ts` into
        `packages/core/src/utils/worktree-overlay.ts` (the file already exists
        and already holds `applyWorktreeOverlay`).
  - [ ] Move each function body and its doc comment verbatim. Do not change
        signatures, parameter names, null/undefined handling, or the
        "returns true when no range is given" semantics of `isInIndexRange`.
  - [ ] Leave `resolveOperationPath()` and `resolveAllOperationPaths()` in the
        CLI — they concern filesystem path selection, not index ranges, and core
        has no consumer for them.
  - [ ] Export the three functions from `packages/core/src/index.ts`, on the
        same browser-safe export line that already exports
        `applyWorktreeOverlay` (line ~44). The moved functions are pure
        object/array work with no `fs`/`path` usage, so the browser-safe
        classification still holds.
  - [ ] Success: `pnpm --filter @context-forge/core build` succeeds and the
        three symbols are importable from `@context-forge/core`.

- [ ] 2. Convert the CLI module to a re-export shim
  - [ ] In `packages/cli/src/utils/worktree-overlay.ts`, replace the three
        removed function bodies with a re-export from `@context-forge/core`,
        following the pattern already used on line 1-2 of that file for
        `applyWorktreeOverlay`.
  - [ ] Do NOT edit any of the nine importing command files
        (`future.ts`, `arch.ts`, `slice.ts`, `status.ts`, `project.ts`,
        `prompt.ts`, `plan.ts`, `check.ts`, `task.ts`). They import from the
        shim and must compile unchanged — that is the point of the shim.
  - [ ] Success: `pnpm -r build` clean, and
        `packages/cli/tests/utils/worktree-overlay.test.ts` passes **with zero
        edits to the test file**. Its `getWorktreeIndexRange`,
        `getWorktreeRangeOverride`, and `isInIndexRange` describe blocks
        (lines ~197-275) are the regression guard for this move.
  - [ ] If any behavioral diff appears, stop. A pure move that changes behavior
        means there is a hidden coupling that must be understood before
        proceeding — do not work around it.

- [ ] 3. Commit the helper relocation
  - [ ] Commit message: `refactor(core): move worktree index-range helpers into core`
  - [ ] Success: working tree clean, build green, full cli + core suites pass.

- [ ] 4. Relocate the `ResolvedProject` interface to `types/project.ts`
  - [ ] Move the `ResolvedProject` interface declaration (currently
        `packages/core/src/services/projectResolver.ts:6-10`) into
        `packages/core/src/types/project.ts`, next to `ProjectData`. Keep the
        doc comment and the optional `resolvedWorktree?: { id: string; name: string }`
        field exactly as written.
  - [ ] Add `ResolvedProject` to the type export on
        `packages/core/src/types/index.ts` line 16, alongside `ProjectData`.
  - [ ] In `projectResolver.ts`, import the type and re-export it so
        `packages/core/src/services/index.ts:22`
        (`export { resolveProject, type ResolvedProject } from './projectResolver.js'`)
        continues to resolve unchanged.
  - [ ] Do NOT add `resolvedWorktree` to `ProjectData` itself. It is a
        resolution artifact, not persisted state; adding it would leak into the
        storage schema.
  - [ ] Note: `packages/cli/src/utils/project.ts` declares its own unrelated
        local `ResolvedProject` (`{ id, source }`). Different module, no
        collision. Do not merge or rename the two.
  - [ ] Success: `pnpm -r build` clean with zero edits to any consumer of
        `ResolvedProject`.

- [ ] 5. Widen `getNext()`'s parameter type
  - [ ] In `packages/core/src/introspection/WorkflowNavigator.ts`, change
        `async getNext(project: ProjectData)` (line ~132) to accept
        `ResolvedProject`, importing the type from `../types/index.js`.
  - [ ] Because `resolvedWorktree` is optional, plain `ProjectData` remains
        assignable — no call site changes, and no existing test that passes a
        `makeProject()` result needs editing.
  - [ ] Success: `pnpm -r build` clean and `pnpm -r test` green for core, cli,
        and mcp-server, with zero edits outside `WorkflowNavigator.ts` and the
        type/re-export files from Task 4. This is still a no-behavior-change
        checkpoint — no warning logic has been touched yet.

- [ ] 6. Commit the type relocation
  - [ ] Commit message: `refactor(core): move ResolvedProject to types and widen getNext signature`
  - [ ] Success: working tree clean, build green, all three suites pass.

### Part 2 — The band-warning fix

- [ ] 7. Replace the hundred-block band check with tiered resolution
  - [ ] In `WorkflowNavigator.ts`, extract the band-warning logic out of
        `getNext()` into a private method (suggested name `resolveBandWarning`)
        returning `string | null`. `getNext()` is already long; do not inline
        ~25 lines of new branching into it.
  - [ ] Implement the three tiers exactly as specified in LLD Decision 1:
    1. `slice.index === null` → no warning (unchanged from today).
    2. Active worktree known (`project.resolvedWorktree` is set and matches an
       entry in `project.worktrees`) → warn unless the index falls inside that
       worktree's `indexRange`. Suppress entirely when that worktree has
       `rangeOverride === true`.
    3. Worktrees configured but no active worktree resolves → warn unless the
       index falls inside **any** configured worktree's `indexRange`.
    4. No worktrees configured → existing `hundredBlock(index)` vs
       `hundredBlock(archIndex)` comparison, message text byte-identical to
       today's.
  - [ ] Use the core `isInIndexRange()` helper for every containment test. Do
        not re-implement the comparison inline — that is the duplication Task 1
        exists to prevent.
  - [ ] Emit at most one band warning in every tier. The tiers are mutually
        exclusive by construction; do not let two fire.
  - [ ] Message formats (LLD Decision 2), using an ASCII hyphen for ranges to
        match the tool's existing renderings in `project.ts:315` and
        `status.ts:145-146`:
    1. tier 2 outside → `Slice {n} is outside worktree '{name}' range [{start}-{end}].`
    2. tier 3 outside → `Slice {n} is outside all configured worktree ranges ({name} [{start}-{end}], ...).`
    3. tier 4 outside → unchanged existing text.
  - [ ] `hundredBlock()` must survive, used only by the tier-4 branch.
  - [ ] Success: `pnpm -r build` clean. The existing band-warning tests at
        `packages/core/tests/introspection/WorkflowNavigator.test.ts:640-700`
        must still pass without edits — they cover the no-worktrees case, which
        tier 4 preserves. If they fail, tier 4 was not preserved correctly.

- [ ] 8. Add unit tests for the tiered band check
  - [ ] Add to the existing `describe('arch-existence and index band warnings', …)`
        block in `packages/core/tests/introspection/WorkflowNavigator.test.ts`.
        The existing `makeProject()` helper already accepts `worktrees`.
  - [ ] Case 1 (#48 regression): worktree `default [100,799]` active, slice 209,
        arch `100-arch.*` → assert `next.warnings` is undefined. Reference #48
        in a comment so the regression's origin is traceable.
  - [ ] Case 2: worktrees `default [100,199]` and `api [200,299]`, `default`
        active, slice 209 → assert exactly one warning, containing `'default'`
        and `[100-199]`. This is the case the union-only form gets wrong.
  - [ ] Case 3: worktree `default [100,199]` with `rangeOverride: true` active,
        slice 209 → assert no warning.
  - [ ] Case 4: worktree `default [100,799]` configured, no `resolvedWorktree`,
        slice 209 → assert no warning.
  - [ ] Case 5: worktree `default [100,799]` configured, no `resolvedWorktree`,
        slice 850 → assert exactly one warning; assert it contains the range
        listing and contains neither `band` nor `hundred`.
  - [ ] Case 6: no worktrees, slice 209, arch `100-arch.*` → assert the legacy
        `outside the 100-band` warning, text unchanged. (May already be covered
        by the existing test at line ~655; if so, assert that and do not
        duplicate it.)
  - [ ] Do NOT split `WorkflowNavigator.test.ts` as part of this slice. It is
        already 1400 lines and the split is tracked as its own maintenance item.
  - [ ] Success: all six cases pass; full core suite green (expect ~1032 + new
        cases).

- [ ] 9. Commit the fix
  - [ ] Commit message: `fix(core): honor worktree indexRange in cf next band warning (#48)`
  - [ ] Success: working tree clean, build green, all three suites pass.

### Part 3 — Verification and close-out

- [ ] 10. Manual end-to-end verification walkthrough
  - [ ] Run `pnpm -r build`, then execute the Verification Walkthrough section
        of the LLD against a scratch project using the freshly built local CLI
        (`node packages/cli/dist/index.js`).
  - [ ] Confirm each step's stated expectation, specifically:
    1. Step 2 — after `worktree init --name default --range 100-799`, `cf next`
       on slice 209 prints no `Warning:` line at all.
    2. Step 3 — after narrowing to `--range 100-199`, `cf next` prints the
       worktree-named warning, and `cf set slice 209` prints its own equivalent
       warning (the two surfaces now agree — LLD success criterion 6).
    3. Step 4 — the union tier behaves as described when invoked with
       `--project` from outside any worktree path.
    4. Step 5 — with all worktrees removed, the legacy message returns verbatim.
    5. Step 6 — `workflow_next` (MCP) returns a `warnings` array matching what
       the CLI printed for the corresponding state.
  - [ ] Update the LLD's Verification Walkthrough section **in place** with the
        real commands and actual output observed, replacing the draft. This is
        the Phase 6 refinement the LLD calls for.
  - [ ] Success: every step confirmed against real output, walkthrough updated,
        no step left as an untested assertion.

- [ ] 11. Full verification pass
  - [ ] `pnpm -r build` — clean across all packages.
  - [ ] `pnpm -r test` — core, cli, and mcp-server green.
  - [ ] `packages/electron` has a known pre-existing unrelated failure in
        `TemplateProcessor.test.ts`. Confirm it is unchanged from `main`; do not
        fix it in this slice.
  - [ ] Run `cf check` (or `workflow_check`) scoped to slice 919 and confirm
        zero findings for this slice.
  - [ ] Success: all of the above verified, with actual command output read
        rather than assumed.

- [ ] 12. Close out GitHub issues #48 and PR #49
  - [ ] Close #48, referencing the fix commit.
  - [ ] Close PR #49 (`jakez-gh:fix/band-warning-honors-worktree-range`) with an
        explicit acknowledgement of the contribution: the reporter did the
        diagnosis and the three-tier contract implemented here is theirs. Link
        the superseding commit and
        `user/slices/919-slice.band-warning-respects-worktree-indexrange.md`,
        and name the three points on which this implementation differs
        (active-worktree preference, helper relocation, hyphen rendering).
  - [ ] Do not close #48's "adjacent suggestion" about dotted sub-index
        numbering — that is a separate discussion the reporter said they would
        file independently.
  - [ ] Success: both closed with the acknowledgement posted; nothing else in
        the reporter's thread silently dropped.

- [ ] 13. Documentation and status updates
  - [ ] Add a `CHANGELOG.md` entry under `[Unreleased]` describing the #48 fix
        in user-facing terms.
  - [ ] Set this task file's frontmatter `status` to `complete`.
  - [ ] Set the LLD's frontmatter `status` to `complete`.
  - [ ] Check off entry 19 `(919)` in
        `user/architecture/900-slices.maintenance-and-refactoring.md`.
  - [ ] Success: `cf list slices` renders 919 as `✓ complete` (not
        `● tasks done` — that display distinguishes a ticked plan checkbox from
        merely-finished tasks).

- [ ] 14. Final commit
  - [ ] Commit message: `docs: complete slice 919 (band warning respects worktree indexRange)`
  - [ ] Success: working tree clean; branch ready for review and merge to the
        target branch.
