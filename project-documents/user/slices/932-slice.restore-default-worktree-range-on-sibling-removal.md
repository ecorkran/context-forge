---
docType: slice-design
slice: restore-default-worktree-range-on-sibling-removal
project: context-forge
parent: user/architecture/900-slices.maintenance-and-refactoring.md
dependencies: []
interfaces: []
dateCreated: 20261007
dateUpdated: 20261007
status: not_started
---

# Slice Design: Restore Default Worktree Range on Sibling Removal

## Overview

Fixes GitHub #76. When a worktree claims a band that overlaps `default`, `chopDefaultRange()` (`packages/core/src/services/WorktreeService.ts`) narrows the default's `indexRange` in place and keeps no record of the old value. `removeWorktree()` only restores anything when the last worktree goes, so after a sibling is removed the default stays narrowed for a worktree that no longer exists. The fix takes issue option 3: when a worktree is removed and others remain, its range goes back to `default` if the two ranges are adjacent, by extending the default to their union. There is no schema change, and data that is already narrowed heals the next time a sibling is removed.

## Rule

On `removeWorktree(target)` with at least one worktree remaining, find the remaining worktree named `default` (case-insensitive, the same match `chopDefaultRange` uses). Extend it to `[min(dStart, tStart), max(dEnd, tEnd)]` only when all of these hold:

- the target is not the default itself;
- the default does not have `rangeOverride` set (the user pinned it);
- the ranges are adjacent: `tStart === dEnd + 1` or `tEnd === dStart - 1`; or the default holds the `[0, 0]` sentinel (fully chopped), in which case it takes the target's range;
- the resulting range overlaps no other remaining worktree.

Otherwise the default is left unchanged. Non-adjacent bands cannot be expressed as one `[min, max]`, so they are not merged. `removeWorktree` returns the new range as `restoredRange` when it changed it, and `cf worktree rm` and MCP `worktree_rm` report it.

## Verification Walkthrough

```
cf worktree add feature --range 500-799     # default chopped from [100, 799] to [100, 499]
cf worktree rm feature
cf worktree list                            # default back at [100, 799]; rm output names the restored range
```

A project that is already narrowed with no siblings (e.g. this repo's `[100, 499]`) is not touched until a sibling is removed; `cf worktree update default --range 100-799` fixes it by hand.
