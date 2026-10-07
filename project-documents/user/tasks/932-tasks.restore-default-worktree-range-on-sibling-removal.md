---
docType: tasks
slice: restore-default-worktree-range-on-sibling-removal
project: context-forge
lld: user/slices/932-slice.restore-default-worktree-range-on-sibling-removal.md
dependencies: []
projectState: main at 0.19.2 (slice 931 shipped). removeWorktree() never restores a range chopDefaultRange() took from the default worktree unless no worktrees remain. Design reviewed (CONCERNS, resolved in the design). Tasks reviewed (PASS).
dateCreated: 20261007
dateUpdated: 20261007
status: not_started
---

## Context Summary

- Slice 932 fixes GitHub #76. The Rule, API Contracts, Success Criteria and Test Plan are in the slice design; do not widen them.
- Key file: `packages/core/src/services/WorktreeService.ts` (`removeWorktree`, `chopDefaultRange`, `findOverlaps`) and `packages/core/src/types/worktree.ts`.
- Tests: `packages/core/tests/services/WorktreeService.test.ts`, `packages/cli/tests/commands/worktree.test.ts`, `packages/mcp-server/tests/worktreeTools.test.ts`.
- Use the local build (`node packages/cli/dist/index.js`); the global `cf` is the published package.

## Tasks

- [ ] **Task 0: Slice branch** (effort: 1)
  - [ ] Confirm `cf config get git.integration_branch` is empty. The branch `932-slice.restore-default-worktree-range-on-sibling-removal` exists at the planning commit; `git checkout` it.

- [ ] **Task 1: Shared helpers** (effort: 1)
  - [ ] In `WorktreeService.ts`, add one definition each of the default-worktree name, the `[0, 0]` empty-range sentinel, the default-name match and the inclusive range-overlap test. Use them in `addWorktree`'s forward migration, `chopDefaultRange` and `findOverlaps` (no behavior change).
  - [ ] In `types/worktree.ts`, add the skip reasons as one `as const` object (`range-override`, `not-adjacent`, `would-overlap`) and its type.
  - [ ] Success: build passes; existing worktree tests pass unchanged.

- [ ] **Task 1C: Commit** — `refactor(core): extract shared worktree range helpers`

- [ ] **Task 2: Restore or report on removal** (effort: 2)
  - [ ] In `removeWorktree`, when worktrees remain, apply the design's Rule to the remaining default. Return `restoredRange` when restored, or `rangeNotRestored { reason, defaultRange }` when a default remains, the target is not the default, and nothing was restored.
  - [ ] Keep the removal and the range change in the single existing `store.update` call; do not mutate objects the store returned.
  - [ ] Success: build passes.

- [ ] **Task 2T: Service tests** (effort: 2)
  - [ ] Every case in the design's Test Plan "Unit" line, including the reason for each skip and exactly one `store.update` call.
  - [ ] Success: all pass.

- [ ] **Task 3: CLI and MCP** (effort: 1)
  - [ ] `cf worktree rm`: print the restored note, or the unchanged range, reason and `cf worktree update default --range <start>-<end>` hint (reason text keyed off the reasons constant).
  - [ ] MCP `worktree_rm`: update the description to name `restoredRange` and `rangeNotRestored`.
  - [ ] Tests per the design's Test Plan CLI and MCP lines.
  - [ ] Success: all pass.

- [ ] **Task 3C: Commit** — `fix(core): restore default worktree range when a sibling is removed`

- [ ] **Task 4: Docs and validation** (effort: 1)
  - [ ] CHANGELOG entry under Unreleased (#76).
  - [ ] Build, typecheck, lint and full tests once each.
  - [ ] Run the design's Verification Walkthrough; update it with actual output.
  - [ ] **Commit**: `chore: finalize slice 932`
  - [ ] Stop. Code review and merge are Phase 7.
