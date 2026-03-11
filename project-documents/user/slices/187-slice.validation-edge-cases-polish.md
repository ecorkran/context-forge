---
docType: slice-design
slice: validation-edge-cases-polish
project: context-forge
parent: user/architecture/180-slices.initiative-context-worktree.md
dependencies: [183-worktree-cli-commands, 184-status-display-updates, 186-mcp-worktree-tools]
interfaces: []
dateCreated: 20260311
dateUpdated: 20260311
status: not_started
---

# Slice 187: Validation, Edge Cases & Polish

## Overview

Defensive hardening and UX polish for the worktree feature set. Adds `cf worktree update` CLI command, stale worktree path detection with `cf check` integration, first-run messaging for unrecognized worktrees, and edge case handling across CLI and MCP surfaces.

## Technical Scope

**Included:**
- `cf worktree update` CLI command (rename, change path, modify range)
- `WorktreeService.validateWorktreePaths()` method for stale path detection
- Stale path flagging in `cf worktree list` and `worktree_list` MCP tool
- New `cf check` rule: `stale-worktree-path`
- First-run messaging in `cf status` for unrecognized worktrees
- `worktree_update` MCP tool: overlap warning on range change
- Edge case handling (nested worktrees, no-path worktrees, empty array cleanup)

**Excluded:**
- Automatic worktree context creation (future work)
- Changes to `cf worktree init` or `cf worktree rm` behavior
- New MCP tools beyond extending existing ones

## Technical Decisions

### `cf worktree update` CLI command

New subcommand in `packages/cli/src/commands/worktree.ts`:

```
cf worktree update [nameOrId] --name "New Name" --range 150-249 --path /new/path
```

- `nameOrId` is optional — resolves from CWD if omitted (same pattern as `cf worktree rm`)
- `--range` is a string option parsed by the existing `parseRange()` helper — no quotes needed at shell level since `150-249` contains no special characters
- `--name`, `--range`, `--path` are all optional — at least one must be provided
- Delegates to `WorktreeService.updateWorktree()` — no new service methods needed
- When `--range` is changed, calls `WorktreeService.findOverlaps()` and displays warnings (same as `cf worktree init`)
- When `--path` is changed, validates against `git worktree list` output (same validation as `cf worktree init`)

Options:
```
--name <name>       New display name
--range <start-end> New slice index range (e.g. 150-249)
--path <path>       New worktree directory path
--project <name|id> Project name or ID (overrides default)
```

### Stale worktree path validation

New method on `WorktreeService`:

```typescript
interface WorktreePathStatus {
  worktreeId: string;
  worktreeName: string;
  worktreePath: string | undefined;
  status: 'valid' | 'missing' | 'not-a-worktree' | 'no-path';
}

async validateWorktreePaths(
  projectId: string,
  gitWorktrees: WorktreeInfo[]  // from GitWorktreeDiscovery
): Promise<WorktreePathStatus[]>
```

Design rationale for passing `gitWorktrees` as a parameter rather than calling `GitWorktreeDiscovery` internally:
- `WorktreeService` currently depends only on `IProjectStore` — adding git discovery would introduce a filesystem/process dependency
- The caller (CLI command or MCP handler) already has access to the project path needed for discovery
- Keeps `WorktreeService` testable with pure data inputs

Validation logic per worktree:
1. If `worktreePath` is undefined → status `'no-path'` (valid state — worktree context without dedicated git worktree)
2. If `worktreePath` does not exist on disk → status `'missing'`
3. If `worktreePath` exists but not in `gitWorktrees` list → status `'not-a-worktree'`
4. Otherwise → status `'valid'`

For step 2, the method accepts `gitWorktrees` but needs a filesystem check. To keep the method testable, accept an optional `pathExists` callback defaulting to `fs.existsSync`:

```typescript
async validateWorktreePaths(
  projectId: string,
  gitWorktrees: WorktreeInfo[],
  pathExists?: (p: string) => boolean
): Promise<WorktreePathStatus[]>
```

This method lives in `WorktreeService` (core/node) since it's validation logic tightly coupled to worktree data. The `pathExists` parameter keeps it unit-testable without filesystem mocking.

### Stale path display in `cf worktree list`

Extend the existing list command to show a status indicator:

```
  Name              Range       Path                              Arch   Plan
* API Foundation    [100-199]   ~/repos/project-api               ...    ...
  Stale Branch      [200-299]   ~/repos/old-path (removed)        ...    ...
  Design Only       [300-399]   —                                 ...    ...
```

- `(removed)` suffix for `'missing'` status
- `(not a git worktree)` suffix for `'not-a-worktree'` status
- No suffix for `'valid'` or `'no-path'`
- Status suffix rendered in warning color

The `worktree_list` MCP tool returns the validation status as a `pathStatus` field on each worktree in the response, allowing MCP clients to render their own indicators.

### `cf check` rule: `stale-worktree-path`

New aggregate rule in `ConsistencyChecker` (called from `checkAll()`):

```typescript
private ruleStaleWorktreePath(
  project: ProjectData,
  gitWorktrees: WorktreeInfo[]
): ConsistencyFinding[]
```

- Severity: `warning`
- Rule name: `stale-worktree-path`
- Location: project file path
- Description: `Worktree '{name}' path '{path}' no longer exists on disk` or `Worktree '{name}' path '{path}' is not a registered git worktree`
- Suggested fix: `Run 'cf worktree update "{name}" --path <new-path>' or 'cf worktree rm "{name}"'`
- `fixable: false` — cannot auto-fix missing directories

Implementation approach:
- `ConsistencyChecker.checkAll()` already loads the project; pass it to the new rule
- The rule calls `GitWorktreeDiscovery.listWorktrees(projectPath)` to get current git worktrees
- Then calls `WorktreeService.validateWorktreePaths()` with the results
- Filters for non-valid statuses and generates findings

Skip the rule entirely if:
- Project has no worktrees (nothing to validate)
- Project has no `projectPath` (can't run git discovery)

### First-run messaging in `cf status`

When `cf status` runs and:
1. CWD is not a registered project path
2. CWD is not a registered worktree path
3. `git worktree list --porcelain` from CWD succeeds and reveals a main worktree path that IS a registered project path
4. That project has worktree support (either has existing worktrees or has workflow fields)

Then display:

```
This directory appears to be a git worktree of project '{name}'.
Create a worktree context: cf worktree init --name '<suggested>' --range <start>-<end>
```

Name suggestion: derive from current git branch name (strip common prefixes like `feature/`, `bugfix/`).
Range suggestion: next available 100-block based on existing worktree ranges.

This check runs only when normal resolution fails — it does not add latency to the happy path. The git worktree list call is already fast (<50ms typically).

Implementation location: `packages/cli/src/commands/status.ts`, in the error/fallback path when project resolution returns no match.

### Edge case handling

These are not new features but defensive checks woven into existing code:

1. **Nested worktrees (longest path wins):** Already handled by `findProjectByCwd` in slice 182. Verify with a test case.

2. **Worktree context without worktree path:** Valid state. `validateWorktreePaths` returns `'no-path'`. Display shows `—` for path (already handled). `cf check` does not flag this.

3. **Empty worktrees array after removal:** Already handled — `removeWorktree` triggers reverse migration on last removal, setting `worktrees: undefined`. Verify with a test case that covers the transition from `worktrees: []` state.

4. **Range change overlap detection on `worktree_update` MCP tool:** The existing `worktree_update` MCP tool does not currently check for overlaps when `indexRange` is changed. Add overlap detection: after `updateWorktree()`, call `findOverlaps()` with the new range (excluding self), include overlaps in the response.

5. **`cf worktree update` path validation:** When `--path` is provided, validate it against `git worktree list` output (same as `cf worktree init`). Warn but proceed if git is unavailable.

## Data Flow

### Stale path detection flow

```
cf worktree list
  → WorktreeService.listWorktrees(projectId) → worktrees[]
  → GitWorktreeDiscovery.listWorktrees(projectPath) → gitWorktrees[]
  → WorktreeService.validateWorktreePaths(projectId, gitWorktrees) → statuses[]
  → Merge statuses into display output
```

### cf check flow (new rule)

```
ConsistencyChecker.checkAll()
  → Load project
  → If project.worktrees exists:
    → GitWorktreeDiscovery.listWorktrees(projectPath) → gitWorktrees[]
    → WorktreeService.validateWorktreePaths(projectId, gitWorktrees) → statuses[]
    → Filter non-valid → ConsistencyFinding[]
```

### First-run messaging flow

```
cf status (project resolution fails)
  → git worktree list --porcelain (from CWD)
  → Parse main worktree path
  → Check if main path matches any registered project
  → If match: suggest cf worktree init
  → If no match: show standard "no project found" error
```

## Integration Points

**Provides:**
- `WorktreeService.validateWorktreePaths()` — reusable validation for CLI, MCP, and consistency checker
- `cf worktree update` CLI command — user-facing worktree modification
- `stale-worktree-path` consistency rule — integrated into existing `cf check` system

**Consumes:**
- `WorktreeService` (slice 181) — CRUD operations, `findOverlaps()`
- `GitWorktreeDiscovery` (slice 182) — `listWorktrees()` for path validation
- `ConsistencyChecker` (existing) — rule registration pattern
- `resolveProjectWorktree` (slice 182) — CWD resolution for update command
- `findWorktreeByNameOrId` (slice 183) — worktree lookup for update command

## Success Criteria

- `cf worktree update "Name" --name "New Name"` renames a worktree context
- `cf worktree update --range 150-249` changes index range with overlap warning (no quotes needed)
- `cf worktree update --path /new/path` changes path with git worktree validation
- `cf worktree update` from a worktree directory resolves target from CWD
- `cf worktree list` shows `(removed)` for worktrees with missing paths
- `worktree_list` MCP response includes `pathStatus` field per worktree
- `cf check` reports stale worktree paths as warnings
- `cf status` from an unrecognized worktree of a known project suggests `cf worktree init`
- `worktree_update` MCP tool returns overlap warnings when `indexRange` changes
- All edge cases pass without errors: no-path worktrees, nested worktrees, empty array cleanup
- All existing tests continue to pass

## Verification Walkthrough

### 1. `cf worktree update` — rename

```bash
# Setup: ensure a worktree context exists
cf worktree list
# Expected: shows existing worktrees

# Rename by name
cf worktree update "Feature Branch" --name "API Layer"
# Expected: "Worktree context 'API Layer' updated."

cf worktree list
# Expected: shows "API Layer" instead of "Feature Branch"
```

### 2. `cf worktree update` — range change with overlap warning

```bash
# Change range to overlap with another worktree
cf worktree update "API Layer" --range 150-249
# Expected: Warning about overlap with existing worktree, then "updated" message

cf worktree list
# Expected: shows updated range [150-249]
```

### 3. `cf worktree update` — CWD resolution

```bash
cd ~/repos/project-worktree
cf worktree update --name "Renamed From CWD"
# Expected: resolves worktree from CWD, updates name
```

### 4. Stale path detection in list

```bash
# Remove git worktree but keep cf context
git worktree remove ../stale-worktree

cf worktree list
# Expected: stale entry shows "(removed)" suffix in Path column

cf check
# Expected: warning finding for stale-worktree-path rule
```

### 5. First-run messaging

```bash
# From a git worktree with no cf worktree context
cd ~/repos/project-new-worktree
cf status
# Expected: "This directory appears to be a git worktree of project '...'"
# Expected: suggests cf worktree init command with name/range hints
```

### 6. MCP overlap detection on update

```bash
# Via MCP client: call worktree_update with indexRange that overlaps
# Expected: response includes overlaps[] array with overlap details
```

## Implementation Notes

**Files to create:**
- None (all changes are extensions of existing files)

**Files to modify:**
- `packages/core/src/services/WorktreeService.ts` — add `validateWorktreePaths()` method
- `packages/core/src/types/worktree.ts` — add `WorktreePathStatus` type
- `packages/core/src/introspection/ConsistencyChecker.ts` — add `ruleStaleWorktreePath()` rule
- `packages/cli/src/commands/worktree.ts` — add `update` subcommand
- `packages/cli/src/commands/status.ts` — add first-run worktree suggestion
- `packages/mcp-server/src/tools/worktreeTools.ts` — add overlap detection to `worktree_update`, add `pathStatus` to `worktree_list`

**Files for tests:**
- `packages/core/tests/services/WorktreeService.test.ts` — validateWorktreePaths tests
- `packages/core/tests/introspection/ConsistencyChecker.test.ts` — stale-worktree-path rule tests
- `packages/cli/tests/commands/worktree.test.ts` — update subcommand tests
- `packages/mcp-server/tests/worktreeTools.test.ts` — overlap detection and pathStatus tests

**Effort estimate:** 3/5 (expanded from original 2/5 to include stricter validation)
