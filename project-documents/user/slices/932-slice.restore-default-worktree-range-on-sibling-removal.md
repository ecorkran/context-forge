---
docType: slice-design
slice: restore-default-worktree-range-on-sibling-removal
project: context-forge
parent: user/architecture/900-slices.maintenance-and-refactoring.md
dependencies: []
interfaces: []
dateCreated: 20261007
dateUpdated: 20261007
status: in_progress
---

# Slice Design: Restore Default Worktree Range on Sibling Removal

## Overview

Fixes GitHub #76. When a worktree claims a band that overlaps `default`, `chopDefaultRange()` (`packages/core/src/services/WorktreeService.ts`) narrows the default's `indexRange` in place and keeps no record of the old value. `removeWorktree()` only restores anything when the last worktree goes, so after a sibling is removed the default stays narrowed for a worktree that no longer exists. The fix takes issue option 3: when a worktree is removed and others remain, its range goes back to `default` if the two ranges are adjacent, by extending the default to their union. There is no schema change, and data that is already narrowed heals the next time a sibling is removed.

**Scope fit.** The 900 slice plan already carries issue-driven maintenance fixes to existing behavior (926–931 each close GitHub issues). This is the same kind of item: a defect in shipped worktree code, with no new feature or initiative to own it.

## Rule

On `removeWorktree(target)` with at least one worktree remaining, find the remaining worktree named `default` (case-insensitive, the same match `chopDefaultRange` uses). Extend it to `[min(dStart, tStart), max(dEnd, tEnd)]` only when all of these hold:

- the target is not the default itself;
- the default does not have `rangeOverride` set (the user pinned it);
- the ranges are adjacent: `tStart === dEnd + 1` or `tEnd === dStart - 1`; or the default holds the `[0, 0]` sentinel (fully chopped), in which case it takes the target's range;
- the resulting range overlaps no other remaining worktree.

Non-adjacent bands cannot be expressed as one `[min, max]`, so they are not merged.

**When the range is not restored, say so.** If a `default` remains, the target is not the default, and the range was not restored, the result names why: `range-override`, `not-adjacent`, or `would-overlap`. `cf worktree rm` prints the default's unchanged range, the reason, and the manual fix (`cf worktree update default --range <start>-<end>`). A silently narrowed default is the bug's own symptom, so the skip is never silent.

**Atomicity.** The removal and the range change are one `store.update` call, writing the new `worktrees` array once. A failed write changes nothing; the error propagates as it does today. There is no state where the worktree is gone but the default is still narrowed because of a partial write.

**Define once.** The default-name match, the `[0, 0]` sentinel and the range-overlap test become single helpers in `WorktreeService.ts`, used by `chopDefaultRange`, `findOverlaps` and the restore. The skip reasons are one `as const` object in `types/worktree.ts`.

## API Contracts

`WorktreeService.removeWorktree()` result, additive (existing fields unchanged, new fields optional):

```ts
{
  removed: WorktreeContext;
  migrated: boolean;
  restoredRange?: [number, number];          // default's new range, when restored
  rangeNotRestored?: { reason: RangeRestoreSkipReason; defaultRange: [number, number] };
}
```

- `cf worktree rm`: prints `Note: Its range went back to the 'default' worktree, now <start>-<end>.` when restored, or the unchanged range, the reason and the manual fix when not.
- MCP `worktree_rm`: returns the result as-is, so both fields appear when set. Its description is updated to name them. Existing consumers that ignore unknown fields are unaffected.

## Success Criteria

- Adding a worktree that chops the default, then removing it, returns the default to its pre-chop range.
- Every non-restoring case leaves the default unchanged and reports the reason; removing the default itself, or the last worktree, reports nothing new.
- Reverse migration (last worktree removed) is unchanged.
- One store write per removal.

## Test Plan

Unit (`WorktreeService.test.ts`): round trip add → remove; adjacent above; adjacent below; `[0, 0]` sentinel takes the target's range; `rangeOverride` → unchanged, reason `range-override`; non-adjacent → unchanged, reason `not-adjacent`; union overlapping another worktree → unchanged, reason `would-overlap`; target is the default → no restore, no reason; case-insensitive `Default`; last-worktree reverse migration unchanged; exactly one `store.update` call.
CLI (`worktree.test.ts`): restored note printed; skip note with reason and manual fix printed; nothing printed when neither field is set.
MCP (`worktreeTools.test.ts`): `restoredRange` and `rangeNotRestored` present in the result.

## Verification Walkthrough

Verified on 20261007 with the local build (`cf` = `node packages/cli/dist/index.js`), in an isolated store. `cf worktree init --path` needs an absolute path to a real git worktree; a relative path is rejected as "not a registered git worktree".

```
export CONTEXT_FORGE_DATA_DIR=$(mktemp -d)
git init -q proj && cd proj && git commit -q --allow-empty -m init
cf init --lite --name scratch && cf set phase 4     # workflow fields, so the first init migrates a default
git worktree add -q -b feature ../feature
cf worktree init --name feature --range 500-799 --path "$(cd ../feature && pwd)"
cf worktree list
cf worktree rm feature --yes
cf worktree list
```

Expected: the init prints `Note: Existing workflow fields were migrated to a 'default' worktree context (range 100-799).` and the first list shows `default [100-499]` and `feature [500-799]`. The `rm` prints `Note: Its range went back to the 'default' worktree, now 100-799.` and the second list shows `default [100-799]`.

Skip case (non-adjacent), continuing in the same project:

```
git worktree add -q -b mid ../mid && git worktree add -q -b far ../far
cf worktree init --name mid --range 300-399 --path "$(cd ../mid && pwd)"
cf worktree init --name far --range 500-599 --path "$(cd ../far && pwd)"
cf worktree rm far --yes
```

Expected: after the two inits the default is `[100-299]` (the chop keeps the lower block). The `rm` prints `Note: The 'default' worktree keeps its range 100-299: the removed range does not border it, so they can't merge into one range.` followed by `To widen it by hand: cf worktree update default --range <start>-<end>`.

A project that is already narrowed with no siblings (e.g. this repo's `[100, 499]`) is not touched until a sibling is removed; `cf worktree update default --range 100-799` fixes it by hand.

## Design Review Resolution

Resolves `user/reviews/932-review.slice.restore-default-worktree-range-on-sibling-removal.md` (verdict CONCERNS, left as written).

| Finding | Resolution |
| --- | --- |
| F001 success criteria / tests | Added Success Criteria and Test Plan. |
| F002 silent skip, atomicity | A skipped restore is reported with its reason (`rangeNotRestored`, CLI note with the manual fix). Removal and range change are one store write. |
| F003 interface change | Added API Contracts: the additive result fields, CLI output, MCP description update. |
| F004 scope fit | Added the scope-fit paragraph. |
| F005 define once | Named the shared helpers and the reasons constant. |
| F006 opportunistic healing | No change; stated as intended. |
