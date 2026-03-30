---
docType: review
layer: project
reviewType: slice
slice: worktreecontext-data-model-storage
project: squadron
verdict: CONCERNS
sourceDocument: project-documents/user/slices/181-slice.worktreecontext-data-model-storage.md
aiModel: moonshotai/kimi-k2.5
status: complete
dateCreated: 20260328
dateUpdated: 20260328
---

# Review: slice — slice 181

**Verdict:** CONCERNS
**Model:** moonshotai/kimi-k2.5

## Findings

### [CONCERN] Type naming inconsistent with architectural concept

The architecture defines **InitiativeContext** to represent "initiative contexts — lightweight, per-initiative workflow state" that are "optionally associated with a git worktree directory." The slice implements this as **WorktreeContext**, suggesting a mandatory coupling to git worktrees that contradicts the architecture's explicit design that contexts may exist without worktree associations (`worktreePath?` is optional in both). This naming discrepancy will create confusion across the codebase and documentation, especially given the architecture's emphasis that "This component covers the data model split... It is CLI-only" and that "Initiative contexts are children of the project, not independent entities."

### [CONCERN] Forward migration creates extraneous Default context

The architecture states: "When a project's first explicit context is created, the existing workflow fields on `ProjectData` are migrated into an explicit `InitiativeContext` and cleared from the project level." This implies the user's first explicitly created context receives the migrated workflow state.

The slice design deviates by creating **two contexts** on first `addWorktree()` call: (1) a synthetic "Default" context with range `[0,99]` holding the existing workflow fields, and (2) the user-requested context with empty workflow fields. This causes several issues:
- The user ends up with an unexpected "Default" context not requested via CLI
- The reserved `[0,99]` range is not mentioned in the architecture (which uses explicit user-defined ranges like `[100,199]`)
- The architecture's CLI example shows `cf context init --name "API Foundation" --range 100-199` followed by `cf status` displaying the migrated workflow state ("Slice: 103-cli-foundation"). Under this slice design, the status would show empty workflow fields for API Foundation because the state migrated to "Default" instead.

### [PASS] Storage strategy appropriately deferred

The architecture explicitly deferred the storage decision: "Nested storage is simpler; separate files allow independent updates... Decision deferred to slice design." The slice reasonably chooses nested storage within `ProjectData.worktrees`, which satisfies architectural requirements for atomicity and backwards compatibility.

### [PASS] MCP interface inclusion acceptable

Although the architecture lists "MCP support" as a non-goal to be deferred, the slice only lists `186-mcp-worktree-tools` as a consuming interface in the data model slice. This is appropriate because the data model must provide foundations for future MCP work without implementing the deferred tools themselves.

### [PASS] Field mapping aligns with envisioned state

The slice correctly maps `fileSlice` → `activeSlice`, `fileTasks` → `activeTaskFile`, `fileArch` → `archDoc`, and `fileSlicePlan` → `slicePlan`, matching the architecture's shift from project-level fields to initiative-context fields.

### [PASS] Dependency direction correct

`WorktreeService` depends on `IProjectStore` rather than concrete storage implementations, and the slice correctly excludes CWD resolution, CLI commands, and display logic to subsequent slices as outlined in the architecture's "Anticipated Slices" section.
