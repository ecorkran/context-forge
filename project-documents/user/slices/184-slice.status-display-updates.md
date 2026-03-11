---
docType: slice-design
slice: status-display-updates
project: context-forge
parent: user/architecture/180-slices.initiative-context-worktree.md
dependencies: [182-worktree-discovery-cwd-resolution, 183-worktree-cli-commands]
interfaces: [185-worktree-aware-context-assembly, 186-mcp-worktree-tools]
dateCreated: 20260311
dateUpdated: 20260311
status: not_started
---

# Slice 184: Status & Display Updates

## Overview

This slice refines the `cf status` display for worktree-aware projects and adds two new flags: `--worktree <name|id>` (view a specific worktree's status from any directory) and `--worktrees` (show a summary dashboard of all worktrees). It also extracts the duplicated `applyWorktreeOverlay` helper into a shared utility, enriches `--json` output with the full worktree context object, and adds a dedicated `Worktree:` line to status output when resolved from a worktree.

## Value

The core worktree overlay plumbing (slices 181–183) is complete and functional. This slice makes the worktree experience polished by:
- Giving users a dedicated `Worktree:` line instead of burying the info in parenthetical text
- Allowing cross-worktree status checks without changing directories
- Providing a bird's-eye dashboard of all worktrees via `--worktrees`
- Eliminating 8 copies of the same overlay function (maintenance burden)
- Ensuring `--json` consumers get the full worktree context for automation

## Technical Scope

### In Scope
- Add `Worktree:` display line to `cf status` when worktree is resolved
- Add `--worktree <name|id>` flag to `cf status`
- Add `--worktrees` flag to `cf status` (summary dashboard)
- Enrich `--json` output with full `WorktreeContext` object
- Extract `applyWorktreeOverlay` to shared utility (`packages/cli/src/utils/worktree-overlay.ts`)
- Replace all 8 inline copies with the shared import
- Unit tests for new flags and the extracted helper

### Out of Scope
- `cf project list --worktrees` (redundant with `cf worktree list`)
- Branch display via git (avoided to prevent git dependency in display path)
- `Next:` line in status output (`cf next` is a separate command)
- Changes to default status output format (current format is useful and should not be cluttered)
- MCP tool updates (slice 186)

## Dependencies

### Prerequisites
- **Slice 182** (Worktree Discovery & CWD Resolution) — `resolveProjectWorktree`, `findWorktreeByNameOrId`
- **Slice 183** (Worktree CLI Commands) — `cf worktree init/list/rm`, worktree-aware `cf set/get`, `applyWorktreeOverlay` pattern

### Interfaces Provided
- Shared `applyWorktreeOverlay` utility consumed by all CLI commands
- `--worktree` and `--worktrees` flags available on `cf status`

## Architecture

### Extract `applyWorktreeOverlay`

Currently duplicated across 8 command files (`arch.ts`, `build.ts`, `next.ts`, `plan.ts`, `project.ts`, `slice.ts`, `status.ts`, `task.ts`). Extract to:

**`packages/cli/src/utils/worktree-overlay.ts`**
```typescript
export function applyWorktreeOverlay(project: ProjectData, worktreeId: string): ProjectData
```

All 8 command files replace their local copies with:
```typescript
import { applyWorktreeOverlay } from '../utils/worktree-overlay.js';
```

### `cf status` Display Changes

**When resolved from a worktree** (current: shows `(from worktree "Default")` after project name):

```
Project:  context-forge
Worktree: Default [100-499]
Phase:    Phase 6: Implementation
Arch:     180-arch.initiative-context-worktree
Plan:     180-slices.initiative-context-worktree
Slice:    184-slice.status-display-updates
Tasks:    184-tasks.status-display-updates
Progress: 5/12 tasks (in_progress)
Status:   in_progress

Slice Plan
  3/7 slices complete
```

Changes from current output:
- New `Worktree:` line showing name and index range
- Source label `(from worktree "Default")` removed from Project line (redundant with Worktree line)

**When resolved from project root (no worktree)** — no change to current output.

### `--worktree <name|id>` Flag

Allows viewing a specific worktree's status from any directory:

```
cf status --worktree maintenance
cf status --worktree default
```

Implementation: Use `findWorktreeByNameOrId` (already in `packages/cli/src/utils/project.ts`) to resolve the worktree, then apply overlay and display as if CWD-resolved from that worktree.

When combined with `--project`, resolves the project first, then the worktree within it.

Error when worktree not found:
```
Worktree 'foo' not found. Run cf worktree list to see available worktrees.
```

### `--worktrees` Flag

Shows a summary dashboard of all worktrees for the resolved project:

```
cf status --worktrees
```

Output:
```
Project:  context-forge

Worktrees
  Name          Range     Phase                      Slice                          Progress
  ───           ───       ───                        ───                            ───
  Default       100-499   Phase 6: Implementation    184-slice.status-display-upd…  3/7 slices
  maintenance   900-999   —                          —                              —
```

Implementation:
- Resolve project (via CWD, flag, or default — no worktree overlay needed)
- Iterate `project.worktrees`, apply overlay for each to get effective field values
- For each worktree with a `slicePlan`, call `parseSlicePlan` to get progress
- Render using `renderTable`
- Active worktree (if CWD matches one) marked with `*` prefix or `← active` suffix

When project has no worktrees: `dim('No worktrees configured.')`

Mutually exclusive with `--worktree <name>`. Error if both provided.

### `--json` Enrichment

Current JSON output includes `worktree: "Default"` (just the name string). Update to include the full `WorktreeContext` object when a worktree is resolved:

```json
{
  "project": "context-forge",
  "phase": "Phase 6: Implementation",
  "worktree": {
    "id": "wt_abc123",
    "name": "Default",
    "indexRange": [100, 499],
    "worktreePath": "/Users/manta/source/repos/manta/context-forge",
    "developmentPhase": "Phase 6: Implementation",
    "activeSlice": "184-slice.status-display-updates",
    "activeTaskFile": "184-tasks.status-display-updates",
    "archDoc": "180-arch.initiative-context-worktree",
    "slicePlan": "180-slices.initiative-context-worktree"
  },
  ...
}
```

For `--worktrees --json`, output array of all worktree summaries.

## Technical Decisions

1. **No branch display** — Avoids git dependency in status path. Branch info is visible via `git branch` or IDE.
2. **No Next line** — `cf next` exists as a dedicated command. Duplicating it in status adds clutter.
3. **No `cf project list --worktrees`** — `cf worktree list` already provides this view. Redundant.
4. **`--worktrees` is opt-in** — Default status output remains focused on the current worktree context. Dashboard is available on demand.
5. **Extract overlay to utility** — 8 copies is a clear maintenance burden. Single source of truth.
6. **Worktree line replaces parenthetical** — When a `Worktree:` line is shown, the `(from worktree "Default")` suffix on the Project line is removed to avoid redundancy.

## Integration Points

### Provides
- `applyWorktreeOverlay` shared utility for all CLI commands
- `--worktree` flag pattern that could be adopted by other commands in future

### Consumes
- `resolveProjectWorktree` from `packages/cli/src/utils/project.ts`
- `findWorktreeByNameOrId` from `packages/cli/src/utils/project.ts`
- `WorkflowNavigator.getStatus()` from `@context-forge/core/node`
- `parseSlicePlan` from `@context-forge/core/node` (for `--worktrees` progress)
- `renderTable` from `packages/cli/src/output/tables.ts`

## Success Criteria

### Functional
- `cf status` from a worktree directory shows `Worktree:` line with name and range
- `cf status --worktree maintenance` shows that worktree's status from any directory
- `cf status --worktrees` shows dashboard table of all worktrees with phase, slice, progress
- `cf status --worktree foo` errors gracefully when worktree not found
- Using `--worktree` and `--worktrees` together produces an error
- `--json` output includes full `WorktreeContext` object (not just name string)

### Technical
- `applyWorktreeOverlay` exists in one place (`packages/cli/src/utils/worktree-overlay.ts`)
- All 8 command files import from the shared utility (no local copies)
- All existing tests continue to pass after the extraction refactor
- New tests cover: `--worktree` flag resolution, `--worktrees` dashboard rendering, overlay extraction, JSON enrichment

### Edge Cases
- Project with no worktrees: `--worktree` and `--worktrees` produce helpful messages
- Worktree with no slice/phase set: dashboard shows `—` for empty fields
- Worktree with no worktreePath: dashboard omits or shows `—` for path

## Verification Walkthrough

> Draft walkthrough — will be refined during implementation.

### 1. Worktree line in status
```bash
# From project root (Default worktree)
cd ~/source/repos/manta/context-forge
cf status
# Expected: Shows "Worktree: Default [100-499]" line, no "(from worktree)" on Project line
```

### 2. Cross-directory worktree status
```bash
# From any directory
cf status --worktree maintenance
# Expected: Shows maintenance worktree's status (phase, slice, etc.)

cf status --worktree nonexistent
# Expected: Error "Worktree 'nonexistent' not found..."
```

### 3. Worktrees dashboard
```bash
cf status --worktrees
# Expected: Table with Default and maintenance worktrees, showing phase/slice/progress
```

### 4. Mutual exclusion
```bash
cf status --worktree default --worktrees
# Expected: Error about mutually exclusive flags
```

### 5. JSON enrichment
```bash
cf status --json | jq '.worktree'
# Expected: Full WorktreeContext object with id, name, indexRange, etc.

cf status --worktrees --json
# Expected: Array of worktree summaries
```

### 6. No worktrees
```bash
# On a project with no worktrees configured
cf status --worktrees
# Expected: "No worktrees configured."
```

## Implementation Notes

### Development Approach
1. Extract `applyWorktreeOverlay` to shared utility first (pure refactor, all tests should pass)
2. Add `Worktree:` line to status display
3. Add `--worktree <name|id>` flag
4. Add `--worktrees` dashboard flag
5. Enrich `--json` output

### Testing Strategy
- Unit tests for extracted `applyWorktreeOverlay` (field mapping, missing worktree, empty fields)
- Unit tests for `--worktree` flag resolution (by name, by id, not found)
- Unit tests for `--worktrees` dashboard (multiple worktrees, empty, single)
- Unit tests for mutual exclusion error
- Integration: verify existing overlay tests still pass after extraction

### Effort
1/5 — Primarily display logic and a straightforward refactor. No new core services or data model changes.
