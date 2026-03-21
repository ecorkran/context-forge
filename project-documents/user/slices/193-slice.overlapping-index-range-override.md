---
docType: slice-design
slice: overlapping-index-range-override
project: context-forge
parent: user/architecture/180-slices.initiative-context-worktree.md
dependencies: [188-default-worktree-improvements]
interfaces: []
dateCreated: 20260320
dateUpdated: 20260320
status: not_started
---

# Slice Design: Overlapping Index Range Override

## Overview

Add a `rangeOverride` capability to worktree contexts, allowing intentional index range overlap with existing worktrees. Currently, `chopDefaultRange()` in `WorktreeService` automatically shrinks the default worktree's range when a new worktree overlaps it, and throws an error if that would displace active artifacts. This blocks legitimate use cases like temporarily borrowing a slice from another initiative's range for parallel work.

The override flag skips range-chopping of the default worktree and suppresses the overlap block, storing `rangeOverride: true` on the worktree context so display commands can surface the intentional override. It also suppresses the out-of-range warning in `cf set slice` when the worktree has `rangeOverride: true`.

## Value

Unblocks parallel work patterns where a worktree legitimately needs to operate on slices outside its "owned" range — for example, designing a slice from one initiative while implementing slices in another. Without this, users must either restructure their ranges (disruptive) or work without worktree context (losing all worktree-aware features).

## Technical Scope

**In scope:**
- New `rangeOverride?: boolean` field on `WorktreeContext`
- `-o` / `--override` flag on `cf worktree init` and `cf worktree update` CLI commands
- `override` parameter on `worktree_init` and `worktree_update` MCP tools
- Skip `chopDefaultRange()` when override is set
- Suppress out-of-range warning in `cf set slice` when worktree has `rangeOverride: true`
- Visual indicator in `cf worktree list` and `cf status` for overridden worktrees

**Explicitly excluded:**
- Changes to `findOverlaps()` — it already returns advisory overlaps without blocking
- Changes to index-range filtering in file operations (slice 191) — those use the worktree's declared range regardless
- Any changes to the default worktree creation logic itself

## Dependencies

### Prerequisites
- Slice 188 (Default Worktree Improvements) — complete. Provides the `chopDefaultRange()` logic this slice modifies.

### Interfaces Required
- `WorktreeService.addWorktree()` and `updateWorktree()` — will gain override parameter
- `WorktreeContext` type — will gain `rangeOverride` field
- `isInIndexRange()` / out-of-range warning in `projectSetAction` — will check `rangeOverride`

## Architecture

### Data Flow

```
User: cf worktree init --name "Cross" --range 180-199 -o
  │
  ├─► CLI parses -o flag
  │     │
  │     ├─► Passes { override: true } to WorktreeService.addWorktree()
  │     │     │
  │     │     ├─► chopDefaultRange() is SKIPPED (override = true)
  │     │     ├─► newWorktree.rangeOverride = true (stored)
  │     │     └─► findOverlaps() still runs (advisory warnings displayed)
  │     │
  │     └─► CLI displays overlap warnings + "(override)" indicator
  │
  └─► Stored WorktreeContext: { ..., rangeOverride: true }
        │
        ├─► cf worktree list: shows "[override]" tag next to range
        ├─► cf status: shows "(override)" next to range
        └─► cf set slice 180: no out-of-range warning (rangeOverride = true)
```

### Component Changes

**1. `WorktreeContext` type** (`packages/core/src/types/worktree.ts`)
- Add `rangeOverride?: boolean` field

**2. `CreateWorktreeInput` type** (`packages/core/src/types/worktree.ts`)
- Add `override?: boolean` field

**3. `WorktreeService`** (`packages/core/src/services/WorktreeService.ts`)
- `addWorktree()`: accept `override` on input, skip `chopDefaultRange()` when true, set `rangeOverride: true` on created worktree
- `updateWorktree()`: when `updates.indexRange` is provided and `updates.rangeOverride === true` (or existing worktree has `rangeOverride`), skip `chopDefaultRange()`

**4. CLI `cf worktree init`** (`packages/cli/src/commands/worktree.ts`)
- Add `-o, --override` flag
- Pass `override: true` to `addWorktree()` input when flag is set

**5. CLI `cf worktree update`** (`packages/cli/src/commands/worktree.ts`)
- Add `-o, --override` flag
- When flag is set and `--range` is provided: pass `rangeOverride: true` in updates

**6. CLI `cf set` out-of-range warning** (`packages/cli/src/commands/project.ts`)
- Retrieve the resolved worktree's `rangeOverride` field
- Skip the out-of-range warning when `rangeOverride === true`

**7. CLI display** (`packages/cli/src/commands/worktree.ts` list, status display)
- Show `[override]` tag next to range in `cf worktree list` when `rangeOverride` is true

**8. MCP `worktree_init`** (`packages/mcp-server/src/tools/worktreeTools.ts`)
- Add optional `override: z.boolean()` parameter
- Pass through to `addWorktree()` input

**9. MCP `worktree_update`** (`packages/mcp-server/src/tools/worktreeTools.ts`)
- Add optional `rangeOverride: z.boolean()` parameter
- Pass through in updates

## Technical Decisions

### Override is per-worktree, not per-operation
The `rangeOverride` flag is stored on the `WorktreeContext`, not passed transiently per operation. This means:
- Once a worktree is created with `--override`, all subsequent range operations respect it
- Display commands can show the override status without re-checking
- `cf set slice` can check the stored flag without a separate override parameter

### Override skips chop but not overlap detection
`chopDefaultRange()` is skipped entirely when override is set — no range mutation occurs. `findOverlaps()` still runs and overlap warnings are still displayed. This gives the user visibility into what overlaps exist while not blocking the operation.

### Clearing override
`cf worktree update <name> --range 300-399` (without `-o`) on a worktree that has `rangeOverride: true` will re-run `chopDefaultRange()` normally and clear `rangeOverride`. This allows users to "un-override" by providing a non-overlapping range without the flag. Explicitly: when `updateWorktree` receives a new `indexRange` without `rangeOverride: true`, and the existing worktree had `rangeOverride: true`, the update clears `rangeOverride` and runs chop normally.

## Implementation Details

### Type changes

```typescript
// In WorktreeContext
rangeOverride?: boolean;

// In CreateWorktreeInput
override?: boolean;
```

### WorktreeService.addWorktree changes

```typescript
// Pseudocode — not production code
async addWorktree(projectId, input) {
  // ... existing validation ...

  const newWorktree = {
    ...existingFields,
    rangeOverride: input.override ? true : undefined,
  };

  if (isFirstWorktree && hasWorkflowFields(project)) {
    const worktrees = [defaultWorktree, newWorktree];
    if (!input.override) {
      chopResult = this.chopDefaultRange(worktrees, input.indexRange, newWorktree.id);
    }
    // ... rest of migration ...
  } else {
    const worktrees = [...(project.worktrees ?? []), newWorktree];
    if (!input.override) {
      chopResult = this.chopDefaultRange(worktrees, input.indexRange, newWorktree.id);
    }
    // ... rest of append ...
  }
  // findOverlaps still runs regardless
}
```

### WorktreeService.updateWorktree changes

```typescript
// Pseudocode
async updateWorktree(projectId, worktreeId, updates) {
  // ... existing validation, build updated worktree ...

  if (updates.indexRange) {
    const hasOverride = updates.rangeOverride === true ||
      (updates.rangeOverride === undefined && worktrees[index].rangeOverride === true);

    if (!hasOverride) {
      chopResult = this.chopDefaultRange(worktrees, updates.indexRange, worktreeId);
      // Clear rangeOverride if it was previously set
      updated.rangeOverride = undefined;
    }
  }
}
```

### Out-of-range warning suppression

In `projectSetAction` (`packages/cli/src/commands/project.ts`, around line 229):

```typescript
// Current:
if (indexRange && !isNaN(numericIndex) && !isInIndexRange(numericIndex, indexRange)) {
  console.warn(`Warning: index ${numericIndex} is outside this worktree's range [...]`);
}

// New: also check rangeOverride
const worktreeHasOverride = getWorktreeRangeOverride(existing, worktreeId);
if (indexRange && !isNaN(numericIndex) && !isInIndexRange(numericIndex, indexRange) && !worktreeHasOverride) {
  console.warn(`Warning: index ${numericIndex} is outside this worktree's range [...]`);
}
```

Add `getWorktreeRangeOverride()` helper to `worktree-overlay.ts`:

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

## Success Criteria

### Functional Requirements
- `cf worktree init --name "Cross" --range 180-199 -o` creates the worktree without chopping the default worktree's range, even when ranges overlap
- `cf worktree init --name "Cross" --range 180-199 -o` stores `rangeOverride: true` on the created worktree
- `cf worktree update "Cross" --range 150-199 -o` updates range without triggering chop
- `cf worktree update "Cross" --range 500-599` (no `-o`) clears `rangeOverride` and runs chop normally
- `cf set slice 180` from an overridden worktree does not produce an out-of-range warning
- `cf worktree list` shows `[override]` indicator for worktrees with `rangeOverride: true`
- Overlap warnings from `findOverlaps()` are still displayed even with override
- `worktree_init` MCP tool accepts `override: true` and creates an overridden worktree
- `worktree_update` MCP tool accepts `rangeOverride: true` and updates accordingly

### Technical Requirements
- `WorktreeContext` type includes `rangeOverride?: boolean`
- Existing tests continue to pass (no behavior change without the flag)
- Unit tests cover: override init, override update, override clearing, out-of-range suppression
- `rangeOverride: undefined` (or absent) is treated identically to `false` — no special handling needed

### Verification Walkthrough

**Setup:** A project with an existing default worktree at [100, 799] and a worktree "API" at [300, 399].

**1. Create overlapping worktree without override (current behavior — should still work):**
```bash
cf worktree init --name "Overlap" --range 350-450
# Expected: Error from chopDefaultRange about artifacts, or chop occurs + overlap warning
```

**2. Create overlapping worktree with override:**
```bash
cf worktree init --name "Cross" --range 180-199 -o
# Expected:
#   - No chop of default worktree range
#   - Overlap warning displayed (advisory)
#   - "Worktree context 'Cross' created (180-199) on project '...'"
```

**3. Verify stored state:**
```bash
cf worktree list
# Expected: "Cross" row shows [override] next to range [180-199]
```

**4. Verify out-of-range suppression:**
```bash
# From Cross worktree directory:
cf set slice 180
# Expected: No "outside this worktree's range" warning
```

**5. Clear override by updating without flag:**
```bash
cf worktree update "Cross" --range 500-599
# Expected: rangeOverride cleared, chopDefaultRange runs normally
cf worktree list
# Expected: "Cross" at [500-599], no [override] indicator
```

**6. MCP equivalent:**
```
worktree_init { name: "MCP-Cross", indexRange: "180-199", override: true }
# Expected: worktree created with rangeOverride: true in response
```

## Implementation Notes

### Development Approach
1. Add `rangeOverride` to `WorktreeContext` and `override` to `CreateWorktreeInput` types
2. Update `WorktreeService.addWorktree()` to skip chop when override is set
3. Update `WorktreeService.updateWorktree()` to skip chop when override applies, clear when not
4. Add `getWorktreeRangeOverride()` to worktree-overlay utilities
5. Suppress out-of-range warning in `projectSetAction`
6. Add `-o`/`--override` to CLI `init` and `update` commands
7. Add `override`/`rangeOverride` to MCP tools
8. Add `[override]` display indicator in `cf worktree list`
9. Write unit tests for all new paths

### Testing Strategy
- `WorktreeService.test.ts`: test addWorktree with override (no chop), updateWorktree with override (no chop), clearing override on update without flag
- `worktree.test.ts` (CLI): test `-o` flag passes through correctly, display shows `[override]`
- `project.test.ts` (CLI): test out-of-range warning suppression when `rangeOverride` is true
- `worktreeTools.test.ts` (MCP): test override parameter on init and update tools
