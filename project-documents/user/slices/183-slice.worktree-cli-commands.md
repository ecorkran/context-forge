---
docType: slice-design
slice: worktree-cli-commands
project: context-forge
parent: user/architecture/180-slices.initiative-context-worktree.md
dependencies: [181-worktreecontext-data-model-storage, 182-worktree-discovery-cwd-resolution]
interfaces: [184-status-display-updates, 185-worktree-aware-context-assembly, 186-mcp-worktree-tools]
dateCreated: 20260310
dateUpdated: 20260310
status: not_started
---

# Slice 183: Worktree CLI Commands

## Overview

This slice delivers the complete management interface for worktree contexts: the `cf worktree` command group (`init`, `list`, `rm`), the `--worktree <name|id>` explicit override flag integrated into `resolveProjectWorktree`, and worktree-aware `cf set`/`cf get` behavior. After this slice, developers can create, list, and remove worktree contexts from the CLI, and all `cf set`/`cf get` calls automatically target the correct worktree context when run from a worktree directory.

## Value

- Complete CRUD interface for worktree contexts at the CLI layer
- `cf set phase 6` from a worktree directory updates the worktree context, not the project
- `cf get` from a worktree shows worktree-scoped workflow fields
- `--worktree` flag enables explicit worktree override for any worktree-aware command
- Auto-discovery of `archDoc`/`slicePlan` from index range base reduces boilerplate on `cf worktree init`
- All existing `cf set`/`cf get` behavior unchanged for projects without worktree contexts

## Technical Scope

### Included
- `cf worktree init` — create a worktree context
- `cf worktree list` — list all worktree contexts for the resolved project
- `cf worktree rm` — remove a worktree context (with confirmation)
- `--worktree <name|id>` parameter integrated into `resolveProjectWorktree`
- `findWorktreeByNameOrId` utility function
- Worktree-aware `projectSetAction` — routes workflow fields to worktree context
- Worktree-aware `projectGetAction` — displays worktree context fields when resolved
- `--project-level` escape hatch on `cf set`/`cf get`
- Auto-set logic (`arch→plan`, `slice→tasks`, `phase→instruction`) targeting worktree context

### Excluded
- Display/status changes (`cf status` worktree dashboard) — slice 184
- Context assembly changes (`cf build` worktree overlay) — slice 185
- MCP tools for worktree management — slice 186
- Stale worktree path detection — slice 187
- `--worktree` flag on `cf set`/`cf get`/`cf status`/`cf build` — flag is on `resolveProjectWorktree` only; `cf set`/`cf get` become worktree-aware via CWD resolution (no explicit flag). Explicit worktree override for those commands comes in future slices if needed.

## Dependencies

### Prerequisites
- Slice 181: `WorktreeService` (addWorktree, updateWorktree, removeWorktree, findOverlaps), `WorktreeContext`, `CreateWorktreeInput`
- Slice 182: `resolveProjectWorktree`, `ResolvedProjectWorktree`, `GitWorktreeDiscovery`
- Existing CLI plumbing: `FileProjectStore`, `resolveProjectId`, `projectSetAction`, `projectGetAction`, `askConfirmation` pattern

### Interfaces Required
- `WorktreeService` — all CRUD operations + `findOverlaps`
- `resolveProjectWorktree(explicit, worktreeExplicit, store)` — extended signature (new in this slice)
- `GitWorktreeDiscovery.listWorktrees(repoPath)` — for path validation in `cf worktree init`
- `resolveFileByIndex` — for auto-discovery of arch/plan documents by index
- `PROJECT_FIELDS` — for field group classification (workflow vs. non-workflow)

### Interfaces Provided
- `resolveProjectWorktree(explicit, worktreeExplicit, store)` — extended, consumed by slices 184-186
- `findWorktreeByNameOrId(projectId, nameOrId, store)` — utility, consumed within CLI
- `cf worktree` command group — user-facing
- Worktree-aware `projectSetAction` / `projectGetAction` — consumed by `cf set`, `cf get`, `cf project set`, `cf project get`

## Architecture

### Component Structure

```
packages/cli/src/
  commands/
    worktree.ts         — NEW: cf worktree init / list / rm
  utils/
    project.ts          — MODIFIED: resolveProjectWorktree signature, findWorktreeByNameOrId
  index.ts              — MODIFIED: register cf worktree command
  commands/project.ts   — MODIFIED: worktree-aware projectSetAction / projectGetAction
```

No new packages or core changes in this slice. All changes are in `packages/cli`.

### `resolveProjectWorktree` — Signature Extension

The existing function gains an optional second parameter:

```typescript
export async function resolveProjectWorktree(
  explicit: string | undefined,
  worktreeExplicit: string | undefined,
  store: FileProjectStore,
): Promise<ResolvedProjectWorktree>
```

Resolution chain:

1. **explicit `--project` flag** → `findByNameOrId` → project resolved
   - If `worktreeExplicit` provided → `findWorktreeByNameOrId(projectId, worktreeExplicit, store)` → attach `worktreeId`, source `'worktree'`
   - Otherwise → `{ id, source: 'flag' }`
2. **CWD detection** → `findProjectByCwd(store)` (existing, unchanged)
   - If matched via worktree path → `{ id, worktreeId, source: 'worktree' }` (existing behavior)
   - If `worktreeExplicit` provided after CWD project match → override worktreeId
   - Otherwise → `{ id, source: 'cwd' }`
3. **default_project config** → same as today, with optional worktree lookup if `worktreeExplicit` provided
4. **throw UserError** — unchanged

**Backwards compatibility:** Existing callers pass 2 args (`explicit, store`). To avoid breaking them, the store must be the 3rd parameter. All existing call sites must be updated to pass `undefined` as the second argument, OR the signature is restructured as an options object.

**Recommendation: options object** to avoid breaking all callers:

```typescript
export interface ResolveProjectWorktreeOptions {
  project?: string;
  worktree?: string;
}

export async function resolveProjectWorktree(
  opts: ResolveProjectWorktreeOptions,
  store: FileProjectStore,
): Promise<ResolvedProjectWorktree>
```

This is a single-call-site change for all existing callers: `resolveProjectWorktree(opts.project, store)` → `resolveProjectWorktree({ project: opts.project }, store)`. The `resolveProjectId` wrapper updates identically. Cleaner than adding `undefined` as a middle arg to every caller.

### `findWorktreeByNameOrId` Utility

```typescript
/**
 * Find a worktree context by exact ID or case-insensitive name.
 * Returns undefined if not found.
 */
export async function findWorktreeByNameOrId(
  projectId: string,
  nameOrId: string,
  store: FileProjectStore,
): Promise<WorktreeContext | undefined>
```

Precedence: exact ID match first, then case-insensitive name match. Same pattern as `findByNameOrId`.

### New File: `packages/cli/src/commands/worktree.ts`

Registers `cf worktree` as a Commander subcommand group.

#### `cf worktree init`

```
cf worktree init --name <name> --range <start>-<end> [--path <path>] [--project <name|id>]
```

**Options:**
- `--name <name>` (required) — human label for the worktree context
- `--range <start-end>` (required) — index range, e.g. `100-199`
- `--path <path>` (optional) — absolute path to the worktree directory; defaults to CWD
- `--project <name|id>` (optional) — project to add worktree context to; defaults to CWD resolution

**Steps:**
1. Parse `--range` → validate format (`/^\d+-\d+$/`), parse integers, validate `start <= end`
2. Resolve project via `resolveProjectWorktree({ project: opts.project }, store)` — no worktree
3. Load project from store to get `projectPath`
4. Determine worktree path: `opts.path ?? process.cwd()`
5. Validate path is a known git worktree:
   - Call `GitWorktreeDiscovery.listWorktrees(project.projectPath)`
   - Check that the resolved path matches one of the returned `WorktreeInfo.path` values (exact string match)
   - If git returns empty array (not a git repo or git not available): **warn but proceed** — `console.error('Warning: could not verify path is a git worktree (git not available or not a git repo). Proceeding anyway.')`
   - If git returns results but path is not in the list: **throw UserError** — `'Path <X> is not a known git worktree of project <name>. Run git worktree list to see registered worktrees.'`
6. Auto-discover `archDoc` and `slicePlan` from range base:
   - Extract base index from `start` (e.g., `100`)
   - Call `resolveFileByIndex(project.projectPath, 'fileArch', String(base))` — catches errors (no match → undefined)
   - Call `resolveFileByIndex(project.projectPath, 'fileSlicePlan', String(base))` — catches errors
7. Call `WorktreeService.addWorktree(projectId, { name, indexRange, worktreePath, archDoc, slicePlan })`
8. Handle result:
   - If `migrated`: print migration notice — `'Note: existing workflow fields migrated to a Default worktree context.'`
   - If `overlaps.length > 0`: print overlap warning for each overlap — `'Warning: index range [x-y] overlaps with existing worktree "Name" [a-b].'`
   - Print success: `'Created worktree context "Name" [start-end] on project <name>.'`

#### `cf worktree list`

```
cf worktree list [--project <name|id>] [--json]
```

**Output format** — follows the `cf project list` pattern exactly:
- `renderTable(['Name', 'Range', 'Path', 'Arch', 'Plan'], rows, prefixes)` — bold cyan headers, dim underline separator, 2-space indent, 2-space column padding
- Active worktree row: all cells wrapped in `success()` (green)
- Active prefix: `success('* ')` — non-active prefix: `'  '` (two spaces, matching `renderTable`'s indent)
- Path shortened via `shortenPath()`
- Range formatted as `[start-end]` string

Example output:
```
  Name              Range     Path                    Arch                Plan
  ────────────────  ────────  ──────────────────────  ──────────────────  ──────────────────
* API Foundation    [100-199] ~/repos/project-api      100-arch.api.md     100-slices.api.md
  UX Layer          [200-299] ~/repos/project-ux       —                   —
```

**Steps:**
1. Resolve project via `resolveProjectWorktree({ project: opts.project }, store)`
2. Load project from store; extract `project.worktrees ?? []`
3. Determine active worktree ID from `resolvedProject.worktreeId` (set when CWD matched a worktree path)
4. Build `rows` and `prefixes` arrays in parallel, same pattern as `project list`:
   - Active row: `[success(name), success(range), success(path), success(arch), success(plan)]`
   - Inactive row: `[name, range, path, arch || '—', plan || '—']`
   - Active prefix: `success('* ')`, inactive: `'  '`
5. `console.log(renderTable(['Name', 'Range', 'Path', 'Arch', 'Plan'], rows, prefixes))`
6. If no worktree contexts: `console.log('  No worktree contexts registered for project <name>. Run cf worktree init to create one.')`

#### `cf worktree rm`

```
cf worktree rm [<name|id>] [--project <name|id>] [--yes]
```

**Steps:**
1. Resolve project via `resolveProjectWorktree({ project: opts.project }, store)`
2. If `nameOrId` not provided: if `resolvedProject.worktreeId`, use that; else throw UserError prompting explicit name/id
3. Look up worktree via `findWorktreeByNameOrId(projectId, nameOrId, store)`
4. If not found: throw UserError `'Worktree context "<nameOrId>" not found on project <name>. Run cf worktree list to see available contexts.'`
5. If `!opts.yes`: print details and ask confirmation:
   ```
   Remove worktree context 'API Foundation' [100-199] at ~/repos/project-api from project 'orchestration'?
   This removes the context association only — no files or git worktrees are deleted.
   [y/N]
   ```
6. Call `WorktreeService.removeWorktree(projectId, worktreeId)`
7. If `migrated`: print `'Note: workflow fields restored to project level (last worktree context removed).'`
8. Print success: `'Removed worktree context "Name" from project <name>.'`

### Worktree-Aware `projectSetAction`

The key design principle: **field routing based on group + resolution context**.

**Field classification:**
- **Worktree-scoped fields** (update worktree context when resolved): `developmentPhase`, `instruction`, `workType`, `fileArch`, `fileSlicePlan`, `fileSlice`, `fileTasks`
- **Project-scoped fields** (always update project): everything else (`name`, `template`, `projectPath`, `dateProject`, `customData.*`, etc.)

```
cf set <field> <value> [--project <name|id>] [--project-level]
```

New `--project-level` flag forces all updates to project even when a worktree context is resolved.

**Modified `projectSetAction` signature:**
```typescript
export async function projectSetAction(
  field: string,
  val: string,
  opts: { project?: string; projectLevel?: boolean },
): Promise<void>
```

**Routing logic:**

```
resolveProjectWorktree({ project: opts.project }, store)
  → { id, source, worktreeId? }

if worktreeId && isWorktreeField(resolvedField) && !opts.projectLevel:
  → update via WorktreeService.updateWorktree(projectId, worktreeId, { [worktreeField]: value })
else:
  → existing store.update(id, ...) logic (unchanged)
```

**Field mapping** (project field name → worktree context field name):

| Project field | WorktreeContext field |
|---|---|
| `fileSlice` | `activeSlice` |
| `fileTasks` | `activeTaskFile` |
| `fileArch` | `archDoc` |
| `fileSlicePlan` | `slicePlan` |
| `developmentPhase` | `developmentPhase` |
| `instruction` | `instruction` |
| `workType` | `workType` |

**Auto-set logic in worktree context:**
- Setting `fileArch` (→ `archDoc`) on worktree: auto-set `slicePlan` using the same arch-index→plan logic
- Setting `fileSlice` (→ `activeSlice`) on worktree: auto-set `activeTaskFile` using the same slice-index→tasks logic
- Setting `developmentPhase` on worktree: auto-set `instruction` to match

All auto-set logic uses `resolveFileByIndex` against `project.projectPath` (unchanged) — the project path is the doc root regardless of which worktree context is active.

**Index-based resolution** (`cf set slice 103`): The existing `resolveFileByIndex` call uses `existing.projectPath` which is unchanged. After resolution, the resulting path goes to the worktree context's `activeSlice` instead of the project's `fileSlice`.

### Worktree-Aware `projectGetAction`

```
cf get [--json] [--project <name|id>] [--project-level]
```

When a worktree context is resolved, the output section for worktree-scoped fields reads from the worktree context instead of the project:

```typescript
export async function projectGetAction(
  opts: { json?: boolean; project?: string; projectLevel?: boolean },
): Promise<void>
```

**Display changes:**
- Add a "Worktree" section at the top when `worktreeId` is resolved (shows worktree name, range, path)
- For worktree-scoped fields in the Workflow and Artifacts groups: read from worktree context if available, fall back to project
- `--project-level` bypasses worktree overlay and shows raw project fields
- JSON output: includes worktree context object when resolved

### Caller Updates for `resolveProjectWorktree` Signature Change

All existing callers of `resolveProjectWorktree` must change from:
```typescript
resolveProjectWorktree(opts.project, store)
```
to:
```typescript
resolveProjectWorktree({ project: opts.project }, store)
```

`resolveProjectId` wrapper updates similarly:
```typescript
export async function resolveProjectId(
  explicit: string | undefined,
  store: FileProjectStore,
): Promise<ResolvedProject> {
  const result = await resolveProjectWorktree({ project: explicit }, store);
  return { id: result.id, source: result.source };
}
```

Existing callers of `resolveProjectId` are unchanged — it remains a 2-arg function.

**Known callers of `resolveProjectWorktree` (currently none — it was just added in 182, with the same signature as before):**
All current CLI commands use `resolveProjectId`, not `resolveProjectWorktree`. The worktree-aware commands in this slice are the first to use `resolveProjectWorktree` directly. The signature change only affects `resolveProjectId`'s internal call.

## Data Flow

### `cf worktree init` from a worktree directory

```
User: cf worktree init --name "API Foundation" --range 100-199
CWD: ~/repos/project-api/

1. resolveProjectWorktree({ project: undefined }, store)
   → findProjectByCwd → matches project via worktreePath
   → { id: 'project_001', source: 'worktree', worktreeId: 'wt_existing' }
   → use id: 'project_001'

2. path = process.cwd() = '/Users/dev/repos/project-api'

3. GitWorktreeDiscovery.listWorktrees('/Users/dev/repos/project')
   → [{ path: '/Users/dev/repos/project', ... }, { path: '/Users/dev/repos/project-api', ... }]
   → '/Users/dev/repos/project-api' found ✓

4. resolveFileByIndex(projectPath, 'fileArch', '100') → '100-arch.api-foundation.md'
   resolveFileByIndex(projectPath, 'fileSlicePlan', '100') → '100-slices.api-foundation.md'

5. WorktreeService.addWorktree('project_001', {
     name: 'API Foundation',
     indexRange: [100, 199],
     worktreePath: '/Users/dev/repos/project-api',
     archDoc: '100-arch.api-foundation.md',
     slicePlan: '100-slices.api-foundation.md',
   })
   → { worktree: { id: 'wt_002', ... }, migrated: false, overlaps: [] }

Output: 'Created worktree context "API Foundation" [100-199] on project orchestration.'
```

### `cf set slice 103` from a worktree directory

```
CWD: ~/repos/project-api/

1. projectSetAction('slice', '103', {})
   → resolveFieldName('slice') → 'fileSlice'
   → resolveProjectWorktree({ project: undefined }, store)
   → { id: 'project_001', source: 'worktree', worktreeId: 'wt_002' }

2. isWorktreeField('fileSlice') → true
   opts.projectLevel → false

3. resolveFileByIndex(project.projectPath, 'fileSlice', '103')
   → '103-slice.api-cli-foundation.md'

4. WorktreeService.updateWorktree('project_001', 'wt_002', {
     activeSlice: '103-slice.api-cli-foundation.md',
   })

5. Auto-set tasks:
   resolveFileByIndex(project.projectPath, 'fileTasks', '103')
   → '103-tasks.api-cli-foundation.md'
   WorktreeService.updateWorktree('project_001', 'wt_002', {
     activeTaskFile: '103-tasks.api-cli-foundation.md',
   })

Output: 'Updated slice = 103-slice.api-cli-foundation.md on worktree context "API Foundation"'
        'Updated tasks = 103-tasks.api-cli-foundation.md (auto-set from slice)'
```

## Success Criteria

1. `cf worktree init --name "API" --range 100-199` creates a worktree context on the resolved project
2. `cf worktree init` path validation: warns (doesn't fail) when git unavailable; fails with clear error when path is not in git's known worktrees
3. `cf worktree init` auto-discovers `archDoc`/`slicePlan` from index range base when matching files exist
4. `cf worktree init` prints migration notice when first worktree context triggers forward migration
5. Index range overlap produces warning but creation proceeds
6. `cf worktree list` shows all worktree contexts with name, range, path (shortened), arch, plan
7. `cf worktree list` marks currently-resolved worktree with `*`
8. `cf worktree rm <name>` removes worktree context after confirmation; `--yes` skips confirmation
9. `cf worktree rm` prints reverse migration notice when last worktree context is removed
10. `cf set slice 103` from a worktree directory updates `activeSlice` on the worktree context
11. `cf set name "new"` from a worktree directory updates project name (project-scoped field)
12. `cf set --project-level slice 103` from a worktree directory updates project `fileSlice`
13. Auto-set (`arch→plan`, `slice→tasks`, `phase→instruction`) works within worktree context
14. `cf get` from a worktree shows worktree-scoped fields from worktree context
15. `cf get --project-level` shows raw project fields regardless of worktree resolution
16. All existing `cf set`/`cf get` behavior unchanged for projects without worktree contexts
17. `resolveProjectWorktree({ project, worktree }, store)` resolves explicit worktree by name or ID

## Verification Walkthrough

_Draft — to be updated with actual commands and output during Phase 6 implementation._

### Setup

```bash
# Start from a project with a worktree registered
cd ~/repos/orchestration
git worktree add ../orchestration-api feature/100-api

cf init  # registers orchestration at current directory if not already registered
```

### Create a worktree context

```bash
cd ~/repos/orchestration-api
cf worktree init --name "API Foundation" --range 100-199
# Expected: 'Created worktree context "API Foundation" [100-199] on project orchestration.'
# If 100-arch.*.md exists: 'Auto-discovered archDoc: 100-arch.api-foundation.md'
```

### List worktree contexts

```bash
cd ~/repos/orchestration-api
cf worktree list
# Expected: table with "API Foundation" marked with * (currently resolved)
```

### Worktree-aware set

```bash
cd ~/repos/orchestration-api
cf set phase 6
# Expected: 'Updated phase = 6 on worktree context "API Foundation"'

cf set --project-level phase 3
# Expected: 'Updated phase = 3 on project orchestration'

cd ~/repos/orchestration
cf set phase 5
# Expected: 'Updated phase = 5 on project orchestration' (no worktree resolved)
```

### Worktree-aware get

```bash
cd ~/repos/orchestration-api
cf get
# Expected: shows worktree context header and worktree-scoped fields

cf get --project-level
# Expected: shows project-level fields
```

### Remove worktree context

```bash
cd ~/repos/orchestration
cf worktree rm "API Foundation"
# Expected: confirmation prompt, then 'Removed worktree context "API Foundation" from project orchestration.'
# If last worktree: 'Note: workflow fields restored to project level.'

cf worktree rm "API Foundation" --yes
# Expected: no prompt, immediate removal
```

## Implementation Notes

### File Organization

`packages/cli/src/commands/worktree.ts` follows the same pattern as `project.ts` — a single `registerWorktreeCommand(program)` export. Registration in `index.ts` follows the existing pattern.

### Confirmation Dialog

Reuse the `askConfirmation` helper defined in `project.ts` (currently local to that file — may need to extract to `utils/` if it isn't already shared). If it's local, extract to `packages/cli/src/utils/confirm.ts` in this slice.

### `isWorktreeField` Helper

A small utility inside `project.ts`:

```typescript
const WORKTREE_SCOPED_FIELDS = new Set([
  'developmentPhase', 'instruction', 'workType',
  'fileArch', 'fileSlicePlan', 'fileSlice', 'fileTasks',
]);

function isWorktreeField(field: string): boolean {
  return WORKTREE_SCOPED_FIELDS.has(field);
}
```

### WorktreeService Access in CLI

`WorktreeService` requires an `IProjectStore`. In CLI commands, pass the `FileProjectStore` instance directly: `new WorktreeService(store)`. No new abstraction needed.

### Error Messages

Consistent style with existing CLI errors:
- Not found: include the unrecognized name and suggest `cf worktree list`
- Invalid range: include the provided value and the expected format
- No worktree resolved when required: suggest `--project` + `--worktree` or `cd` into the worktree directory

## Risks

### Risk: `projectSetAction` complexity growth
**Likelihood:** Medium — the function already handles auto-set, index resolution, and customData. Adding worktree routing adds another branch.
**Impact:** Hard to read; edge cases at the intersection of features (e.g., `customData.x` set from a worktree — goes to project).
**Mitigation:** Extract worktree routing into a clearly-named helper `applyFieldUpdate(resolvedField, value, projectId, worktreeId, opts, store)` that handles the routing decision. Keep auto-set logic as a post-update pass.

### Risk: `resolveProjectWorktree` signature change touches all callers
**Likelihood:** Certain — deliberate change.
**Impact:** TypeScript compile errors at all call sites.
**Mitigation:** Options-object pattern limits breakage to internal calls. `resolveProjectId` wrapper shields all existing callers. The compiler catches every missed update.

## Effort

3/5 — Three new commands with moderate validation logic, plus routing changes to `projectSetAction` and `projectGetAction`. The `resolveProjectWorktree` signature change is mechanical but touches multiple files.
