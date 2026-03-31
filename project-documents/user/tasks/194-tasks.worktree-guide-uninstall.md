---
docType: tasks
slice: 194
status: complete
project: context-forge
dateCreated: 20260331
dateUpdated: 20260331
---

# Tasks: Worktree-Scoped Guide Uninstall (194)

Ref: GitHub issue #46

## Problem

`GuideManager.uninstall()` always operates on `this.projectPath`:
- `git submodule deinit -f` against projectPath (deinits globally)
- Removes `.git/modules/<path>` (shared state)
- `git rm -f` (modifies shared index)
- Commits the removal

Running this from a worktree uninstalls guides from the **main repo**, not the worktree. After that, `git worktree remove` still fails because the submodule checkout remains in the worktree.

## Design

When `operationPath` is set and differs from `projectPath`, uninstall should perform **only** a worktree-scoped deinit:

```
git submodule deinit -f project-documents/ai-project-guide
```

Run from `operationPath` (the worktree), not `projectPath`. This removes the submodule checkout from that worktree only. No `.git/modules` removal, no `git rm`, no commit — those affect shared state.

The `operationPath` plumbing already exists (added in slice 190, used by `update()`).

## Tasks

### Section 1: Core Fix

- [x] In `GuideManager.uninstall()`, detect worktree mode: `this.operationPath && this.operationPath !== this.projectPath`
- [x] When in worktree mode, run only `git submodule deinit -f <GUIDE_RELATIVE_PATH>` from `operationPath`
- [x] Return success with method and version (no commit, no index changes)
- [x] When NOT in worktree mode, keep existing full-uninstall behavior unchanged

### Section 2: Tests

- [x] Test: worktree-mode uninstall calls only `submodule deinit` with correct cwd
- [x] Test: worktree-mode uninstall does NOT call `git rm`, does NOT remove `.git/modules/`, does NOT commit
- [x] Test: full uninstall (no operationPath) behavior unchanged
- [x] Test: full uninstall (operationPath === projectPath) behavior unchanged

### Section 3: CLI / MCP Integration

- [x] Verify `cf guides uninstall` passes operationPath when invoked from a worktree
- [x] Verify MCP `guide_uninstall` tool (if exists) passes operationPath correctly
- [x] If either caller doesn't pass operationPath for worktrees, fix the caller

### Section 4: Validation

- [x] Manual test: install guides in main, create worktree, `cf guides uninstall` from worktree, verify main guides untouched
- [x] Manual test: after worktree uninstall, `git worktree remove` succeeds
- [x] Update GitHub issue #46 with fix reference
