---
docType: slice
layer: project
project: context-forge
parent: user/architecture/180-arch.initiative-context-worktree.md
slicePlan: user/architecture/180-slices.initiative-context-worktree.md
sliceIndex: 188
status: complete
dateCreated: 20260312
dateUpdated: 20260312
---

# Slice 188: Default Worktree Improvements

## Overview

When a project's first worktree context is created, `WorktreeService.addWorktree` performs forward migration — moving existing workflow fields into an auto-created "Default" worktree. Currently, that default worktree is named `"Default"` (capitalized) and assigned range `[0, 99]`. Both choices are wrong:

- **Name:** Convention across the codebase uses lowercase for programmatic identifiers. The capitalized name stands out in `cf worktree list` and `cf status` output.
- **Range [0, 99]:** This is the system/project-level range (HLD, concept doc, process guides). The default worktree should own the working range where initiative artifacts actually live.
- **Static range:** Once assigned, the default worktree's range never changes. If a user creates a new worktree at `[300, 399]`, default still claims the full range — creating a guaranteed overlap warning on every subsequent worktree creation.

This slice fixes all three: rename to `"default"`, assign working range `[100, 799]`, and implement dynamic range chopping so the default worktree automatically shrinks when new worktrees claim sub-ranges.

## Technical Design

### 1. Rename and Range Change

**In `WorktreeService.addWorktree` (forward migration block):**

```
// Before
name: 'Default',
indexRange: [0, 99],

// After
name: 'default',
indexRange: [100, 799],
```

**In CLI migration message (`packages/cli/src/commands/worktree.ts`):**

```
// Before
`Note: Existing workflow fields were migrated to a 'Default' worktree context (range 0-99).`

// After
`Note: Existing workflow fields were migrated to a 'default' worktree context (range 100-799).`
```

**In MCP tool description (`packages/mcp-server/src/tools/worktreeTools.ts`):**
Update the `worktree_init` description string that references `"Default"`.

### 2. Dynamic Range Chopping

When a new worktree is created with a range that overlaps the default worktree, instead of just warning, the default worktree's range is automatically shrunk.

**Algorithm (in `WorktreeService.addWorktree`, after creating `newWorktree`):**

```
1. Find the "default" worktree (by name, case-insensitive) among existing worktrees
2. If no default worktree exists → skip (no chopping needed)
3. If new worktree's range doesn't overlap default's range → skip
4. Compute chopped range: default shrinks to [default.start, newWorktree.start - 1]
   - This is the "largest contiguous block below the new range's start" rule
5. Artifact collision check:
   a. Scan default worktree's archDoc and slicePlan for index references
   b. If any referenced index falls within the carved-out range → block with error
   c. Also scan all worktree-scoped artifact fields (activeSlice, activeTaskFile)
6. If no collision → update default worktree's indexRange
7. If collision → throw descriptive error listing the conflicting artifacts
```

**Where the chopping happens:** Inside `addWorktree`, after the new worktree is appended to the array but before `store.update` is called. This keeps it atomic — the default range update and the new worktree addition are persisted in a single write.

**Edge cases:**
- New worktree starts at or below default's start (e.g., default is [100, 799], new is [100, 199]): default becomes [200, 799]... No — this violates the "contiguous block below" rule. If new starts at 100, there's no block below. Default range becomes invalid (start > end). In this case, default should shrink to encompass the space *above* the new range: [200, 799]. **Rule refinement:** default shrinks to the largest contiguous unoccupied block within its current range. With only one new worktree carving out [100, 199], the two candidates are [] (below 100, nothing) and [200, 799] (above 199). Largest wins → [200, 799].
- New worktree carves out the middle (e.g., default [100, 799], new [300, 399]): candidates are [100, 299] and [400, 799]. Largest is [400, 799]... but that's counterintuitive — the user's existing work is likely in the lower indices. **Decision:** prefer the lower contiguous block. [100, 299] wins. Rationale: the lower indices are more likely to contain existing work (initiatives start from low indices). The upper space [400, 799] becomes unassigned — no worktree owns it until explicitly claimed.
- Multiple existing worktrees already carved: e.g., default is [100, 299] (already chopped), new is [200, 299]. Default becomes [100, 199].
- New worktree covers default's entire remaining range: default becomes empty (start > end). This is valid — it means all working ranges are explicitly assigned. Default can be removed or kept as a placeholder with no range.

**Invalid range after chopping (start > end):** If the chop results in an empty range, the default worktree is *not* automatically removed (that could lose workflow state). Instead, set range to `[0, 0]` as a sentinel indicating "no range" and emit a warning: `"Default worktree has no remaining index range. Consider removing it or assigning a new range."`

### 3. Artifact Collision Detection

Before shrinking default's range, check whether default holds references to artifacts that would fall outside the new range.

**Fields to check on the default worktree context:**
- `archDoc` — extract index from filename (e.g., `200-arch.event-driven-pipeline.md` → 200)
- `slicePlan` — extract index from filename (e.g., `180-slices.initiative-context-worktree.md` → 180)
- `activeSlice` — extract index from filename (e.g., `187-slice.validation-edge-cases-polish` → 187)
- `activeTaskFile` — extract index (e.g., `187-tasks.validation-edge-cases-polish` → 187)

**Index extraction:** Parse the leading numeric prefix from the filename string. Already done elsewhere in the codebase (e.g., `ArtifactIntrospector` uses similar patterns). Extract with a simple regex: `/^(\d+)-/`.

**Collision rule:** If any extracted index falls within the range being carved away from default (i.e., within `[newRange.start, newRange.end]` that overlaps default's current range), block with an error:

```
Error: Cannot shrink default worktree range — artifact '200-arch.event-driven-pipeline.md'
(index 200) would fall outside the new range [100, 199].
Move the artifact to another worktree first, or use --force to override.
```

**No `--force` in v1:** The error message mentions `--force` as future escape hatch but this slice does not implement it. The user's recourse is to `cf worktree update default --range <explicit>` or move the artifact reference to the new worktree first.

### 4. Chopping on `worktree_update` (MCP)

The same chopping logic applies when a worktree's range is changed via `cf worktree update` or `worktree_update` MCP tool. If the updated range newly overlaps with default, default should shrink. Extract the chopping logic into a private method `chopDefaultRange` on `WorktreeService` so both `addWorktree` and `updateWorktree` can call it.

### 5. Data Flow

```
User: cf worktree init --name "Event Pipeline" --range 200-299

CLI (worktree.ts)
  → WorktreeService.addWorktree(projectId, { name, indexRange: [200, 299], ... })
    → creates newWorktree object
    → if first worktree: creates default worktree with range [100, 799]
    → chopDefaultRange(worktrees, newWorktree)
      → finds "default" worktree
      → detects overlap: default [100, 799] vs new [200, 299]
      → candidate ranges: [100, 199] (below), [300, 799] (above)
      → selects [100, 199] (prefer lower block)
      → checks default's artifacts: archDoc=180-arch (index 180) → 180 ∈ [100, 199] ✓
      → no collision → shrinks default to [100, 199]
    → store.update(projectId, { worktrees: [default@[100,199], new@[200,299]], ...clearedFields })
    → return { worktree, migrated: true, overlaps: [] }
```

## Change Surface

| File | Change |
|------|--------|
| `packages/core/src/services/WorktreeService.ts` | Rename default to `"default"`, range to `[100, 799]`, add `chopDefaultRange` method, call from `addWorktree` and `updateWorktree` |
| `packages/core/tests/services/WorktreeService.test.ts` | Update existing migration tests (name, range assertions), add chop tests, add collision tests |
| `packages/cli/src/commands/worktree.ts` | Update migration message string |
| `packages/mcp-server/src/tools/worktreeTools.ts` | Update description string referencing "Default" |
| `packages/mcp-server/tests/worktreeTools.test.ts` | Update migration-related test assertions if any |

## Success Criteria

- Default worktree created during forward migration is named `"default"` (lowercase)
- Default worktree range is `[100, 799]` instead of `[0, 99]`
- Creating a new worktree with range `[300, 399]` automatically shrinks default to `[100, 299]`
- Creating a new worktree with range `[100, 199]` shrinks default to `[200, 799]` (largest remaining block)
- If default holds an artifact at index 250 and new worktree claims `[200, 299]`, the operation fails with a descriptive error
- Creating a new worktree that doesn't overlap default's range has no effect on default
- `cf worktree update` range changes also trigger default chopping
- All existing tests updated to match new name/range expectations
- No behavior change for projects without worktree contexts

## Verification Walkthrough

**Setup:** Start with a project that has no worktree contexts.

```bash
# 1. Create first worktree — triggers migration
cd ~/repos/my-project-api
cf worktree init --name "API Layer" --range 200-299

# Verify: default created with lowercase name and chopped range
cf worktree list
# Expected:
#   default        [100-199]  ~/repos/my-project/    ...
#   API Layer      [200-299]  ~/repos/my-project-api/ ...

# 2. Create second worktree — further chops default
cd ~/repos/my-project-data
cf worktree init --name "Data Pipeline" --range 300-399

cf worktree list
# Expected: default is still [100-199] (no overlap with 300-399 after first chop)

# 3. Collision test — set default's arch to index 150, then try to claim [100-199]
cf worktree update default --arch 150-arch.something.md
cd ~/repos/my-project-core
cf worktree init --name "Core" --range 100-199
# Expected: Error — artifact 150-arch.something.md (index 150) would fall outside new range

# 4. After moving artifact, retry succeeds
cf worktree update default --arch ""
cf worktree init --name "Core" --range 100-199
# Expected: default shrinks to [0, 0] sentinel, warning about empty range
```

## Dependencies

- **[181] WorktreeContext Data Model & Storage** — the foundation this modifies (complete)
- No downstream blockers — this is a refinement slice

## Notes

- The `[0, 0]` sentinel for empty default is a pragmatic choice. An alternative is auto-removing default when its range is exhausted, but that risks losing workflow state (phase, instruction, etc.) silently. Better to warn and let the user decide.
- The "prefer lower block" rule for middle-carve scenarios is a convention, not a hard constraint. If this proves unintuitive in practice, it can be changed to "prefer larger block" in a future update.
- Existing data migration: projects that already have a "Default" worktree with range `[0, 99]` from the current code are NOT retroactively updated. This slice changes the *creation* behavior only. A future `cf check` rule could detect the legacy range and suggest updating it.
