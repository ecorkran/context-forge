---
docType: review
layer: project
reviewType: code
slice: band-warning-respects-worktree-indexrange
project: context-forge
verdict: PASS
sourceDocument: project-documents/user/slices/919-slice.band-warning-respects-worktree-indexrange.md
aiModel: minimax/minimax-m3
status: complete
dateCreated: 20260801
dateUpdated: 20260801
findings:
  - id: F001
    severity: pass
    category: project-conventions
    summary: "Clean relocation of shared helpers into core"
    location: packages/core/src/utils/worktree-overlay.ts:20-56
  - id: F002
    severity: pass
    category: typing
    summary: "`ResolvedProject` moved to the canonical type home"
    location: packages/core/src/types/project.ts:39-43
  - id: F003
    severity: pass
    category: documentation
    summary: "Tiered band-warning logic with explicit decision contract"
    location: packages/core/src/introspection/WorkflowNavigator.ts:421-456
  - id: F004
    severity: pass
    category: testing
    summary: "Test coverage of every behavior branch"
    location: packages/core/tests/introspection/WorkflowNavigator.test.ts:708-788
  - id: F005
    severity: note
    category: style
    summary: "`project.resolvedWorktree?.id` inside `find` callback is functionally correct but awkward"
    location: packages/core/src/introspection/WorkflowNavigator.ts:434-436
  - id: F006
    severity: note
    category: dead-code
    summary: "`getWorktreeIndexRange` and `getWorktreeRangeOverride` are exported but unused in the diff"
    location: packages/core/src/utils/worktree-overlay.ts:22-48
---

# Review: code — slice 919

**Verdict:** PASS
**Model:** minimax/minimax-m3

## Findings

### [PASS] Clean relocation of shared helpers into core

The three helpers (`getWorktreeIndexRange`, `getWorktreeRangeOverride`, `isInIndexRange`) previously duplicated in `packages/cli/src/utils/worktree-overlay.ts` are now defined in one place and re-exported through both `packages/core/src/index.ts` and `packages/cli/src/utils/worktree-overlay.ts`. This satisfies the DRY rule from CLAUDE.md and preserves the existing CLI re-export surface for backward compatibility.

### [PASS] `ResolvedProject` moved to the canonical type home

`ResolvedProject` is now defined alongside `ProjectData` in `types/project.ts` and re-exported via `types/index.ts`. `projectResolver.ts` re-exports the type from `types/index.js` so existing importers continue to work. `WorkflowNavigator.getNext` now correctly takes `ResolvedProject` instead of `ProjectData`, since it consumes `project.resolvedWorktree`.

### [PASS] Tiered band-warning logic with explicit decision contract

The new `resolveBandWarning` private method has a clear JSDoc that enumerates the three tiers (active worktree / no active worktree / no worktrees) and the `rangeOverride` precedence. The legacy hundred-block comparison is preserved as a third tier, so projects without worktrees keep their existing behavior. The decision explicitly states "at most one warning is ever produced," and the implementation matches that contract.

### [PASS] Test coverage of every behavior branch

Five new tests cover: (1) active worktree + index inside range suppresses warning, (2) active worktree + index outside range warns naming the active worktree even when a sibling covers it, (3) `rangeOverride` suppresses entirely, (4) no active worktree + index inside the union of ranges suppresses, (5) no active worktree + index outside the union warns listing all ranges. The first test name explicitly references issue #48 as the regression repro. The legacy no-worktrees case is correctly noted as already covered by the existing test.

### [NOTE] `project.resolvedWorktree?.id` inside `find` callback is functionally correct but awkward

```ts
const active = project.resolvedWorktree
  ? worktrees.find((w) => w.id === project.resolvedWorktree?.id)
  : undefined;
```

The `?.` is required because TypeScript cannot narrow a discriminant accessed through a closure, but the pattern reads as if the writer wasn't sure whether the check is needed. A cleaner equivalent is to bind the id once:

```ts
const resolvedId = project.resolvedWorktree?.id;
const active = resolvedId ? worktrees.find((w) => w.id === resolvedId) : undefined;
```

No behavior change — purely a readability nit.

### [NOTE] `getWorktreeIndexRange` and `getWorktreeRangeOverride` are exported but unused in the diff

The new `resolveBandWarning` reads `active.rangeOverride` and `active.indexRange` directly off the worktree object rather than going through these helpers, so the helpers have no internal callers in the diff. They are still exported and re-exported from `core/src/index.ts` and `packages/cli/src/utils/worktree-overlay.ts`, which is reasonable if they are part of the public API surface for external consumers, but it's worth confirming they have external callers before keeping them. If not, the CLI re-export and the helpers can be removed in a follow-up.
