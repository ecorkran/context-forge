---
docType: tasks
slice: restore-default-worktree-range-on-sibling-removal
project: context-forge
lld: user/slices/932-slice.restore-default-worktree-range-on-sibling-removal.md
dependencies: []
projectState: main at 0.19.2 (slice 931 shipped). removeWorktree() never restores a range chopDefaultRange() took from the default worktree unless no worktrees remain.
dateCreated: 20261007
dateUpdated: 20261007
status: not_started
---

## Context Summary

- Slice 932 fixes GitHub #76: give a removed worktree's range back to `default` when adjacent. The rule is in the slice design; do not widen it.
- Key file: `packages/core/src/services/WorktreeService.ts` (`removeWorktree`, `chopDefaultRange`). Tests: `packages/core/tests/services/WorktreeService.test.ts`, CLI `worktree` command and MCP `worktreeTools` tests.

## Tasks

- [ ] **Task 0: Create the slice branch** (effort: 1)
  - [ ] Confirm `cf config get git.integration_branch` is empty, then `git checkout -b 932-slice.restore-default-worktree-range-on-sibling-removal main`.

- [ ] **Task 1: Restore the range on removal** (effort: 2)
  - [ ] In `removeWorktree`, when worktrees remain, apply the design's Rule to the remaining `default` worktree; return `restoredRange` when it changed.
  - [ ] Reuse the existing default-name match and overlap test rather than restating them.
  - [ ] Success: builds; existing worktree tests pass.

- [ ] **Task 1T: Tests** (effort: 2)
  - [ ] Adjacent above and below → union restored; non-adjacent → unchanged; `[0, 0]` sentinel → takes the target's range; default with `rangeOverride` → unchanged; union overlapping another worktree → unchanged; removing the default itself → no restore; last-worktree reverse migration unchanged.
  - [ ] Add → remove round trip returns the default to its pre-chop range.
  - [ ] Success: all pass.

- [ ] **Task 2: Report it in CLI and MCP** (effort: 1)
  - [ ] `cf worktree rm` prints the restored default range when present; MCP `worktree_rm` includes `restoredRange`.
  - [ ] Tests for both.

- [ ] **Task 2C: Commit** — `fix(core): restore default worktree range when a sibling is removed`

- [ ] **Task 3: Docs and validation** (effort: 1)
  - [ ] CHANGELOG entry under Unreleased (#76).
  - [ ] Build, typecheck, lint, full tests once each; run the design's Verification Walkthrough in a scratch project.
  - [ ] **Commit**: `chore: finalize slice 932`
