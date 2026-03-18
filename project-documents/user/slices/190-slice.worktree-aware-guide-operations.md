---
docType: slice-design
slice: worktree-aware-guide-operations
project: context-forge
parent: user/architecture/180-slices.initiative-context-worktree.md
dependencies: [182, 186]
interfaces: []
dateCreated: 20260318
dateUpdated: 20260318
status: in_progress
---

# Slice Design: Worktree-Aware Guide Operations

## Overview

The AI project guide is installed as a git submodule at `project-documents/ai-project-guide`. Git submodules have per-worktree checkout state — running `git submodule update --remote` in one worktree does not update the submodule files in other worktrees. This means guide updates performed in the default worktree leave non-default worktrees with stale guide files, even though version detection (via `git describe --tags`) reports the correct version in all worktrees.

This slice makes `cf guides info`, `cf guides update`, and the MCP `guide_status`/`guide_update` tools worktree-transparent. The user should not need to know about submodule mechanics or pass worktree identifiers — guide operations detect the current worktree context and do the right thing automatically.

## Value

Users working in non-default worktrees get stale guide content (old prompt templates, outdated phase instructions) with no indication that anything is wrong — version detection says the guide is current. This is a silent correctness bug. Fixing it ensures that all worktrees consistently receive updated guide files after `cf guides update` or `guide_update`.

## Technical Scope

### Included

- CLI `cf guides info` and `cf guides update` become worktree-aware via `resolveProjectWorktree()`
- `GuideManager` and `GuideDetector` accept an optional `operationPath` for worktree-scoped git operations
- `SubmoduleStrategy.update()` supports syncing a worktree's submodule checkout to the committed pointer
- MCP `guide_update` auto-syncs all worktrees with registered paths after a remote update
- MCP `guide_status` reports per-worktree sync state when worktrees exist

### Excluded

- Changes to `guide_install` — installation happens once at the project root, not per-worktree
- Changes to `CloneStrategy` or `TarballStrategy` — these don't use git submodules and don't have the per-worktree checkout problem (the guide directory is a regular directory, shared across worktrees via the same filesystem)
- Changes to prompt files or the ai-project-guide submodule itself
- Worktree-scoped guide *installation* (different guide versions per worktree)

## Dependencies

### Prerequisites

- **Slice 182 (CWD Resolution):** `resolveProjectWorktree()` and `findProjectByCwd()` with worktree matching — complete
- **Slice 186 (MCP Worktree Tools):** `worktree_list` for discovering worktrees with paths — complete

### Interfaces Required

- `resolveProjectWorktree()` from `packages/cli/src/utils/project.ts` — returns `worktreeId` when CWD matches a worktree path
- `ProjectData.worktrees[]` with `worktreePath` fields — for iterating worktrees in MCP layer
- `FileProjectStore.getById()` — for resolving project data from projectId

## Architecture

### The Submodule-Worktree Problem

Git submodules maintain checkout state per-worktree. When a project has worktrees:

```
main worktree:       ~/repos/project/
  └── project-documents/ai-project-guide/  ← submodule checked out at v0.13.17

world-server worktree: ~/repos/project-world-server/
  └── project-documents/ai-project-guide/  ← submodule checked out at v0.13.15 (STALE)
```

The submodule *pointer* (the commit ref stored in the index) is shared — both worktrees reference v0.13.17 in their git index. But the *working tree files* in the non-default worktree are still at v0.13.15 because `git submodule update` was never run there.

Version detection via `git describe --tags --abbrev=0` runs inside the submodule's `.git` directory, which resolves tags from the shared object store — so it reports v0.13.17 in both worktrees even though the files differ.

### Fix Strategy

The fix has two parts:

1. **CLI: operate in the correct directory.** When the user runs `cf guides update` from a worktree, run the submodule update in that worktree's root, not the project's root. This requires resolving the effective operation path from CWD.

2. **MCP: sync all worktrees after update.** When `guide_update` is called via MCP, it updates the submodule remotely (fetches latest), then runs `git submodule update` in every worktree that has a registered `worktreePath`. This ensures all worktrees are synced in one operation.

### Component Changes

**`GuideManager` (core)**
- Constructor gains optional `operationPath?: string`
- When set, `status()` and `update()` pass `operationPath` to detector and strategy instead of `projectPath`
- `install()` always uses `projectPath` (submodule add is a project-root operation)
- New method `syncWorktrees(worktreePaths: string[])` — runs `git submodule update` in each path

**`GuideDetector` (core)**
- `detect()` gains optional `operationPath` parameter
- When set, version detection and method detection use `operationPath` for filesystem checks and git commands
- The `source` resolution and `latestVersion` fetch still use the canonical `projectPath`

**`SubmoduleStrategy` (core)**
- `update()` gains optional `operationPath` parameter
- When `operationPath` differs from `projectPath`: run `git submodule update` (sync to pointer, no `--remote`) in `operationPath`
- When `operationPath` equals `projectPath` (or is not set): existing behavior (`git submodule update --remote`)
- New method `sync(operationPath: string)` — runs `git submodule update project-documents/ai-project-guide` in the given path. This is the per-worktree sync operation.

**CLI `guides.ts`**
- Replace `getProjectPath()` with `getGuideContext()` that returns `{ projectPath, operationPath, project, worktreeId? }`
- Uses `resolveProjectWorktree()` instead of `resolveProjectId()`
- When `worktreeId` is resolved: looks up `worktreePath` from the project's worktrees array, uses it as `operationPath`
- When no worktree: `operationPath` = `projectPath` (existing behavior)
- `cf guides info` and `cf guides update` use `operationPath`
- `cf guides install` continues to use `projectPath`

**MCP `guideTools.ts`**
- `guide_update` handler: after the primary update, checks if the project has worktrees
  - If yes: calls `GuideManager.syncWorktrees()` with all worktree paths
  - Reports sync results in the response
- `guide_status` handler: when the project has worktrees, includes per-worktree sync status in the response
  - For each worktree with a `worktreePath`: check if the submodule checkout matches the committed pointer
  - This is informational — lets the agent know if worktrees are out of sync

### Data Flow

**CLI `cf guides update` from a non-default worktree:**

```
1. resolveProjectWorktree() → { projectId, worktreeId, source: 'worktree' }
2. Lookup project → get projectPath and worktrees[]
3. Find worktree by worktreeId → get worktreePath
4. Create GuideManager(projectPath, configManager, operationPath=worktreePath)
5. manager.update() →
   a. detector.detect(projectPath) → { installed, method: 'submodule', version, ... }
   b. strategy.update(projectPath, targetDir, operationPath=worktreePath) →
      - git submodule update --remote (in projectPath — fetch latest)
      - git submodule update (in worktreePath — sync checkout)
   c. Return result
```

**MCP `guide_update`:**

```
1. resolveProjectPath(projectId) → projectPath
2. Create GuideManager(projectPath, configManager)
3. manager.update() → primary update in projectPath (existing behavior)
4. Lookup project → get worktrees[]
5. For each worktree with worktreePath:
   manager.syncWorktrees([wt1.worktreePath, wt2.worktreePath, ...])
   → git submodule update (in each worktreePath)
6. Return result + sync report
```

## Technical Decisions

### Sync vs. Full Update in Non-Default Worktrees

**Decision:** Non-default worktrees run `git submodule update` (sync to pointer), not `git submodule update --remote` (fetch latest from upstream).

**Rationale:** The `--remote` flag fetches the latest commit from the submodule's remote and advances the pointer. This should only happen once (in the primary update), not in every worktree. The per-worktree operation is purely a checkout sync — "make my working tree files match the committed submodule pointer."

### CLI: Update Current Worktree Only vs. All Worktrees

**Decision:** CLI `cf guides update` updates the submodule remotely (in projectPath), then syncs the current worktree. It does not iterate all worktrees.

**Rationale:** The CLI operates from a specific CWD. The user ran the command in their current worktree and expects that worktree to be updated. Silently modifying files in other worktrees (which may have uncommitted changes, or where another agent is actively working) would violate the principle of least surprise. If the user wants all worktrees synced, they can run the command from each worktree, or use the MCP tool which has different expectations (system-level operation, not user-in-a-terminal).

### MCP: Auto-Sync All Worktrees

**Decision:** MCP `guide_update` syncs all registered worktrees after the primary update.

**Rationale:** MCP is called by agents, not directly by a user in a terminal. The agent's intent is "update the guide for this project." From the agent's perspective, all worktrees should have current guide content. There's no concept of "the agent's current worktree" in MCP — it operates at the project level.

### GuideManager API Surface

**Decision:** `GuideManager` accepts `operationPath` as a constructor parameter rather than a per-method argument.

**Rationale:** The operation path is contextual to the entire guide operation session, not per-call. A `GuideManager` instance represents "guide operations for this project, from this directory." The constructor pattern matches existing usage — callers already create a new `GuideManager` per operation.

### Detecting Stale Submodule Checkout

**Decision:** Compare the submodule's `HEAD` in the worktree against the committed submodule pointer, not against tags.

**Rationale:** Tags can resolve to the same version even when the checkout is stale (the exact bug we're fixing). The correct check is: does the submodule's checked-out commit (in this worktree) match the commit recorded in the parent repo's index? This is what `git submodule status` reports — a leading `+` indicates the checkout differs from the index.

Implementation: run `git submodule status project-documents/ai-project-guide` in the worktree path. Parse the output: `+` prefix means out of sync, ` ` prefix means in sync, `-` prefix means not initialized.

## Implementation Details

### GuideManager Changes

```typescript
// Constructor signature change
constructor(projectPath: string, configManager?: ConfigManager, operationPath?: string)

// New method
async syncWorktrees(worktreePaths: string[]): Promise<SyncResult[]>
```

`syncWorktrees` iterates paths, runs `git submodule update project-documents/ai-project-guide` in each, and collects results. Failures in one worktree do not block others — results include per-path success/failure with error messages.

```typescript
interface SyncResult {
  worktreePath: string;
  success: boolean;
  error?: string;
}
```

### SubmoduleStrategy Changes

```typescript
// Existing method gains optional operationPath
async update(projectPath: string, targetDir: string, operationPath?: string): Promise<UpdateResult>

// New method for per-worktree sync
async sync(worktreePath: string): Promise<void>
```

The `sync` method runs:
```
git -C <worktreePath> submodule update project-documents/ai-project-guide
```

This is a single git command that checks out the submodule files to match the committed pointer in that worktree.

### CLI getGuideContext

```typescript
interface GuideContext {
  projectPath: string;
  operationPath: string;  // equals projectPath when not in a worktree
  project: ProjectData;
  worktreeId?: string;
}

async function getGuideContext(projectOpt?: string): Promise<GuideContext>
```

Resolution logic:
1. `resolveProjectWorktree({ project: projectOpt }, store)` → get `{ id, worktreeId? }`
2. Fetch project by id → get `projectPath`
3. If `worktreeId`: find worktree in `project.worktrees[]`, use `worktreePath` as `operationPath`
4. If no `worktreeId` or no `worktreePath`: `operationPath = projectPath`

### MCP guide_update Enhancement

After the existing `manager.update()` call:

```typescript
// Sync all worktrees with registered paths
const project = await store.getById(resolvedId);
if (project?.worktrees?.length) {
  const worktreePaths = project.worktrees
    .map(wt => wt.worktreePath)
    .filter((p): p is string => !!p);

  if (worktreePaths.length > 0) {
    const syncResults = await manager.syncWorktrees(worktreePaths);
    // Include in response
  }
}
```

### MCP guide_status Enhancement

When the project has worktrees, add a `worktreeSync` field to the response:

```typescript
interface WorktreeSyncStatus {
  name: string;
  path: string;
  inSync: boolean;  // submodule checkout matches committed pointer
}
```

Detection via `git submodule status` in each worktree path. This is informational — it tells the agent whether worktrees need syncing without requiring a separate check.

## Integration Points

### Provides to Other Slices

- No new interfaces. This slice fixes existing operations to work correctly in worktree contexts.

### Consumes from Other Slices

- **Slice 182:** `resolveProjectWorktree()` for CWD-based worktree detection in CLI
- **Slice 186:** `ProjectData.worktrees[]` for iterating registered worktrees in MCP
- **Slice 181:** `WorktreeContext.worktreePath` field

## Success Criteria

### Functional Requirements

- `cf guides update` from a non-default worktree syncs the guide files in that worktree
- `cf guides update` from the default worktree / project root behaves as before (fetch remote + sync)
- `cf guides info` from a non-default worktree reports accurate sync status for that worktree
- MCP `guide_update` syncs all registered worktrees after a remote update
- MCP `guide_status` includes per-worktree sync status when worktrees exist
- Projects without worktrees: all behavior unchanged

### Technical Requirements

- `SubmoduleStrategy.sync()` handles: missing worktree path (skip with error), submodule not initialized (run init first), already in sync (no-op)
- `syncWorktrees()` is resilient: one worktree failure does not block others
- No changes to `CloneStrategy` or `TarballStrategy`
- No changes to `guide_install` or `cf guides install`
- Unit tests for: sync operation, CLI context resolution, MCP multi-worktree sync, stale detection

### Verification Walkthrough

**Setup:** A project `migratory` with two worktrees — `default` (project root) and `world-server` (non-default). Guide installed as submodule.

**1. Verify the bug exists (before fix):**
```bash
cd ~/repos/migratory-world-server
cf guides info
# Shows version v0.13.17 but guide files are stale
# After fix: should show sync status indicating out-of-sync
```

**2. CLI update from non-default worktree:**
```bash
cd ~/repos/migratory-world-server
cf guides update
# Expected: "Guide synced successfully" or "Guide is already at the latest version"
# Verify: prompt file content matches the latest version
cat project-documents/ai-project-guide/project-guides/prompt.ai-project.system.md | head -20
# Should show the Handlebars {{#if worktreeName}} block, not the old static text
```

**3. CLI update from default worktree:**
```bash
cd ~/repos/migratory
cf guides update
# Expected: existing behavior — fetches remote, updates submodule pointer, commits if changed
```

**4. MCP guide_update (via agent):**
```
Call guide_update for project "migratory"
# Expected: updates guide remotely, then syncs both worktrees
# Response includes sync results for each worktree path
```

**5. MCP guide_status with worktrees:**
```
Call guide_status for project "migratory"
# Expected: standard guide info + worktreeSync array showing sync state per worktree
```

**6. Projects without worktrees:**
```bash
cd ~/repos/some-single-worktree-project
cf guides update
# Expected: identical to current behavior, no regressions
```

## Implementation Notes

### Development Approach

Suggested implementation order:

1. **SubmoduleStrategy.sync()** — the core git operation, testable in isolation
2. **GuideManager changes** — constructor `operationPath`, `syncWorktrees()` method
3. **GuideDetector changes** — `operationPath` support for accurate status in worktrees
4. **CLI `getGuideContext()`** — worktree-aware resolution replacing `getProjectPath()`
5. **MCP `guide_update` enhancement** — auto-sync after update
6. **MCP `guide_status` enhancement** — per-worktree sync status
7. **Tests** — unit tests for each layer, integration test for end-to-end workflow

### Special Considerations

- **Submodule initialization:** A worktree created *after* the submodule was added may not have the submodule initialized. The sync operation should handle this by running `git submodule init` before `git submodule update` if needed. The `git submodule update --init` flag handles this in one command.
- **Non-submodule strategies:** Clone and manual strategies store guide files as regular files in the working tree. Since git worktrees share the same working tree for tracked files (with the exception of submodules), these strategies don't have the per-worktree problem. The `syncWorktrees` method should only operate when the detected method is `submodule`.
