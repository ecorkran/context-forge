---
docType: slice-design
slice: 194
status: complete
parent: user/architecture/180-arch.initiative-context-worktree.md
project: context-forge
dateCreated: 20260331
dateUpdated: 20260331
---

# Slice Design: Worktree-Scoped Guide Uninstall (194)

## Problem

`git worktree remove` fails on any worktree that contains the ai-project-guide submodule:

```
fatal: working trees containing submodules cannot be moved or removed
```

The current workaround is a 3-step manual process: `git submodule deinit --all -f` from the worktree, `git worktree remove --force`, then `cf worktree rm`. This is fragile — `cf guides uninstall` from a worktree currently runs the full uninstall against `projectPath`, which deinits the submodule globally and removes it from `.gitmodules` and the index, breaking the main repo's guide installation.

Ref: GitHub issue #46.

## Root Cause

`GuideManager.uninstall()` (packages/core/src/guides/GuideManager.ts:79-116) unconditionally runs all operations against `this.projectPath`:

1. `git submodule deinit -f <path>` — deinits globally (shared git state)
2. `rmSync(.git/modules/<path>)` — removes shared module cache
3. `git rm -f <path>` — removes from index and `.gitmodules`
4. `git commit` — commits the removal

The class already has `this.operationPath` (added in slice 190 for worktree-aware guide updates), and the CLI already passes it correctly (packages/cli/src/commands/guides.ts:133). The `update()` method uses it. The `uninstall()` method ignores it.

## Design

### Worktree-Mode Detection

When `this.operationPath` is set and differs from `this.projectPath`, uninstall is operating on a non-default worktree. In this mode, the goal is different: we are not removing the submodule from the project — we are clearing its checkout from one worktree so that `git worktree remove` can succeed.

### Two Uninstall Paths

**Full uninstall** (main repo / no worktree): existing behavior, unchanged.
- `git submodule deinit -f <path>` from `projectPath`
- Remove `.git/modules/<path>`
- `git rm -f <path>`
- Commit

**Worktree deinit** (non-default worktree): new path.
- `git submodule deinit -f <path>` from `operationPath`
- Nothing else. No `.git/modules` removal (shared), no `git rm` (shared index), no commit (nothing to commit).

This is the minimal change. Running `submodule deinit` from within a worktree directory removes the submodule checkout in that worktree's working tree only, because git worktrees have independent working tree state even though they share `.git` state.

### Code Change

In `GuideManager.uninstall()`, after confirming the guide is installed and method is `'submodule'`:

```typescript
if (method === 'submodule') {
  const { gitExec } = await import('./gitExec.js');
  const isWorktree = this.operationPath && this.operationPath !== this.projectPath;

  // Deinit the submodule — scoped to operationPath (worktree or main)
  await gitExec(
    ['submodule', 'deinit', '-f', GUIDE_RELATIVE_PATH],
    isWorktree ? this.operationPath : this.projectPath
  );

  if (!isWorktree) {
    // Full uninstall: remove shared state and commit
    const modulesPath = join(this.projectPath, '.git', 'modules', GUIDE_RELATIVE_PATH);
    if (existsSync(modulesPath)) {
      rmSync(modulesPath, { recursive: true, force: true });
    }
    await gitExec(['rm', '-f', GUIDE_RELATIVE_PATH], this.projectPath);
    const versionSuffix = version ? ` ${version}` : '';
    await gitExec(
      ['commit', '-m', `docs: uninstall ai-project-guide${versionSuffix}`],
      this.projectPath,
    );
  }
}
```

### Return Value

Both paths return the same `UninstallResult { success, method, version }`. The caller doesn't need to know which path was taken — CLI output is already appropriate ("Guide uninstalled successfully").

### CLI Output Enhancement

After a worktree-mode uninstall, add a hint line:

```
Guide deinited from worktree. You can now run: git worktree remove <path>
```

This requires the CLI handler to know whether it was a worktree uninstall. Options:
- Check `ctx.operationPath !== ctx.projectPath` in the CLI handler (preferred — keeps GuideManager return type unchanged)
- Add a `worktreeDeinit: boolean` field to `UninstallResult`

Prefer the first option — the CLI already has the context.

### No MCP Changes

There is no MCP `guide_uninstall` tool. No MCP changes needed.

## Dependencies

- `operationPath` plumbing from slice 190 — already complete
- CLI worktree resolution via `getGuideContext()` — already passes operationPath correctly

## Success Criteria

- `cf guides uninstall` from a worktree deinits the submodule in that worktree only
- Main repo's guide installation remains intact after worktree deinit
- `git worktree remove` succeeds after worktree-scoped deinit
- `cf guides uninstall` from the main repo performs full uninstall (existing behavior unchanged)
- Existing GuideManager tests continue to pass

## Verification Walkthrough

Prerequisites: project with guides installed as submodule, at least one worktree.

```bash
# 1. Confirm guides are installed in main
cd ~/source/repos/manta/context-forge
cf guides info
# → installed, submodule, version vX.Y.Z

# 2. Create a test worktree (or use an existing one)
git worktree add ../cf-test-worktree main
cd ../cf-test-worktree
cf worktree init --name "test" --range 800-899

# 3. Confirm guides exist in the worktree
ls project-documents/ai-project-guide/
# → files present

# 4. Uninstall guides from the worktree
cf guides uninstall
# → "Guide deinited from worktree. You can now run: git worktree remove ..."

# 5. Confirm main is unaffected
cd ~/source/repos/manta/context-forge
cf guides info
# → still installed, submodule, version vX.Y.Z

# 6. Remove the worktree
cd ~/source/repos/manta
git worktree remove cf-test-worktree
# → succeeds (no "submodules cannot be removed" error)

# 7. Clean up cf metadata
cd ~/source/repos/manta/context-forge
cf worktree rm "test"
```

## Notes

- `git submodule deinit -f` from a worktree removes the working tree content for that worktree but does not modify `.gitmodules`, the index, or `.git/modules/`. This is standard git behavior — worktrees share the `.git` directory but have independent working trees.
- The `-f` flag is needed because the submodule directory contains untracked content (the checkout itself).
- After deinit, the submodule directory becomes an empty directory, which `git worktree remove` can handle.
