---
docType: slice-design
slice: worktree-discovery-cwd-resolution
project: context-forge
parent: user/architecture/180-slices.initiative-context-worktree.md
dependencies: [181-worktreecontext-data-model-storage]
interfaces: [183-worktree-cli-commands, 184-status-display-updates, 185-worktree-aware-context-assembly, 186-mcp-worktree-tools]
dateCreated: 20260311
dateUpdated: 20260310
status: complete
---

# Slice 182: Worktree Discovery & CWD Resolution

## Overview

This slice extends CWD-based project resolution to be worktree-aware using a two-phase lookup, and implements `git worktree list --porcelain` parsing for worktree discovery. After this slice, running any `cf` command from a git worktree directory automatically resolves to both the correct project and the specific worktree context — the UX payoff of the entire 180-band initiative.

## Value

- Enables automatic worktree context resolution from any git worktree directory — no flags required for the common case
- Provides `GitWorktreeDiscovery` service reusable by CLI (this slice), MCP tools (slice 186), and validation (slice 187)
- Extends the existing resolution chain cleanly — `resolveProjectId` callers continue to work unchanged
- New `resolveProjectWorktree` gives callers both project and worktree context in one call

## Technical Scope

### Included
- `GitWorktreeDiscovery` service: parses `git worktree list --porcelain` output into `WorktreeInfo[]`
- `WorktreeInfo` type definition
- Extended `findProjectByCwd` to match `worktrees[].worktreePath` in addition to `projectPath`
- `resolveProjectWorktree()` function returning `ResolvedProjectWorktree` (project + optional worktree)
- `ResolutionSource` extended with `'worktree'` value
- Existing `resolveProjectId` preserved as backwards-compatible wrapper
- Unit tests for porcelain parsing, path matching, and two-phase resolution

### Excluded
- `--worktree <name|id>` CLI flag (deferred to slice 183 — noted in slice plan)
- CLI commands (`cf worktree init/list/rm`) — slice 183
- Display/status changes — slice 184
- Context assembly changes — slice 185
- MCP tools — slice 186
- Stale worktree detection and first-run messaging — slice 187

## Dependencies

### Prerequisites
- Slice 181 complete: `WorktreeContext` type with `worktreePath` field, `WorktreeService` with CRUD operations
- Existing `gitExec` utility in `packages/core/src/guides/gitExec.ts`
- Existing `findProjectByCwd` and `resolveProjectId` in `packages/cli/src/utils/project.ts`

### Interfaces Required
- `WorktreeContext` type (from slice 181) — `worktreePath` field used for path matching
- `IProjectStore` — `getAll()` for scanning all projects and their worktrees
- `gitExec()` — for executing `git worktree list --porcelain`

### Interfaces Provided
- `GitWorktreeDiscovery.listWorktrees(projectPath)` — consumed by slice 183 (init validation), 184 (branch display), 186 (MCP), 187 (stale detection)
- `resolveProjectWorktree()` — consumed by all worktree-aware CLI commands (183-185)
- `ResolvedProjectWorktree` type — consumed by slices 183-186

## Architecture

### Component Structure

```
packages/core/src/git/
  GitWorktreeDiscovery.ts  — NEW: git worktree list parser + discovery service
  index.ts                 — NEW: re-exports

packages/core/src/types/
  git.ts                   — NEW: WorktreeInfo type

packages/cli/src/utils/
  project.ts               — MODIFIED: extended findProjectByCwd, new resolveProjectWorktree
```

**Why `GitWorktreeDiscovery` in core, not CLI:** The worktree discovery service is pure data — it parses git output and returns structured results. MCP tools (slice 186) need the same parsing without depending on the CLI package. The existing `gitExec` utility is already in core. The discovery service belongs with it.

**Why resolution stays in CLI:** The resolution chain (`findProjectByCwd`, `resolveProjectId`, `resolveProjectWorktree`) uses `process.cwd()`, which is inherently CLI-specific. The MCP server has its own simpler resolution (explicit IDs, no CWD). Keeping resolution in CLI avoids premature refactoring. A `// TODO: Consider extracting core resolution logic to packages/core if MCP needs CWD-like resolution (see slice 186)` comment marks the potential future extraction point.

### Data Flow

```
User runs `cf status` from ~/repos/project-api/

  1. resolveProjectWorktree(opts.project, store)
     │
     ├─ explicit --project flag? → findByNameOrId → { project, source: 'flag' }
     │
     ├─ findProjectByCwd(store)  [EXTENDED]
     │   │
     │   ├─ match against project.projectPath (existing)
     │   │   → { project, worktreeId: undefined, source: 'cwd' }
     │   │
     │   └─ match against project.worktrees[].worktreePath (NEW)
     │       → { project, worktreeId: 'wt_xxx', source: 'worktree' }
     │
     ├─ default_project config? → { project, source: 'default' }
     │
     └─ throw UserError
```

### Type Definitions

#### `WorktreeInfo` (in `packages/core/src/types/git.ts`)

```typescript
/** Parsed entry from `git worktree list --porcelain`. */
export interface WorktreeInfo {
  /** Absolute path to the worktree directory. */
  path: string;
  /** HEAD commit hash. */
  head: string;
  /** Branch ref (e.g., 'refs/heads/feature/100-api'), undefined if detached. */
  branch?: string;
  /** Whether this is a bare repository entry. */
  bare: boolean;
}
```

#### `ResolvedProjectWorktree` (in `packages/cli/src/utils/project.ts`)

```typescript
export interface ResolvedProjectWorktree {
  id: string;
  source: ResolutionSource;
  /** Set when CWD matched a worktree's worktreePath. */
  worktreeId?: string;
}
```

#### Extended `ResolutionSource`

```typescript
export type ResolutionSource = 'flag' | 'cwd' | 'worktree' | 'default' | 'none';
```

The `'worktree'` value indicates resolution via `worktrees[].worktreePath` match. The existing `'cwd'` value continues to indicate resolution via `projectPath` match. This distinction matters for display: `(from CWD)` vs. `(from worktree)`.

### `GitWorktreeDiscovery` Service

Located at `packages/core/src/git/GitWorktreeDiscovery.ts`.

```typescript
export class GitWorktreeDiscovery {
  /**
   * List all worktrees for the git repository at the given path.
   * Parses `git worktree list --porcelain` output.
   * Returns empty array if git is not available or path is not a git repo.
   */
  async listWorktrees(repoPath: string): Promise<WorktreeInfo[]>;
}
```

**Porcelain format parsing:**

```
worktree /Users/dev/repos/project
HEAD abc123def456
branch refs/heads/main

worktree /Users/dev/repos/project-api
HEAD def789abc012
branch refs/heads/feature/100-api

worktree /Users/dev/repos/project-data
HEAD 111222333444
detached

```

Each entry is separated by a blank line. Fields:
- `worktree <path>` — absolute path (always present)
- `HEAD <hash>` — commit hash (always present)
- `branch <ref>` — full ref, absent if detached HEAD
- `bare` — present (no value) if bare repo entry
- `detached` — present (no value) if HEAD is detached
- `prunable` — present if worktree can be pruned (we skip these)

**Parsing rules:**
1. Split output on blank lines to get entries
2. For each entry, parse key-value lines
3. Skip entries marked `bare` (the bare repo entry itself, not worktrees of bare repos)
4. Map `branch` ref to short form if needed (callers can do this; store full ref)
5. Gracefully handle: no git, not a repo, empty output

### Extended `findProjectByCwd`

The current implementation matches CWD against `project.projectPath` only. The extension adds a second pass: for each project, check all `project.worktrees[].worktreePath` values. Longest path match wins across both project paths and worktree paths.

```typescript
export interface CwdMatch {
  project: ProjectData;
  worktreeId?: string;  // set when matched via worktreePath
}

export async function findProjectByCwd(
  store: FileProjectStore,
): Promise<CwdMatch | null> {
  const projects = await store.getAll();
  const cwd = process.cwd();

  interface PathCandidate {
    project: ProjectData;
    path: string;
    worktreeId?: string;
  }

  const candidates: PathCandidate[] = [];

  for (const p of projects) {
    // Existing: project root path
    if (p.projectPath) {
      candidates.push({ project: p, path: p.projectPath });
    }
    // New: worktree paths
    for (const wt of p.worktrees ?? []) {
      if (wt.worktreePath) {
        candidates.push({ project: p, path: wt.worktreePath, worktreeId: wt.id });
      }
    }
  }

  const matches = candidates
    .filter((c) => {
      const path = c.path.endsWith('/') ? c.path.slice(0, -1) : c.path;
      return cwd === path || cwd.startsWith(path + '/');
    })
    .sort((a, b) => b.path.length - a.path.length);

  if (matches.length === 0) return null;
  return { project: matches[0].project, worktreeId: matches[0].worktreeId };
}
```

**Key behavior: longest path wins.** When a worktree path is more specific than a project path (the typical case — worktrees are sibling directories, not subdirectories), the worktree path is the only match. When CWD is a subdirectory of both the project root and a worktree path, the longest match wins. This handles nested worktrees correctly.

**Return type change:** `findProjectByCwd` currently returns `ProjectData | null`. It changes to `CwdMatch | null` where `CwdMatch` includes an optional `worktreeId`. This is a breaking change for existing callers — all callers in the CLI package must be updated to extract `.project` from the result. There are a small number of call sites (the `resolveProjectId` function being the primary one).

### `resolveProjectWorktree` Function

New function that extends the resolution chain with worktree awareness:

```typescript
export async function resolveProjectWorktree(
  explicit: string | undefined,
  store: FileProjectStore,
): Promise<ResolvedProjectWorktree> {
  // Step 1: explicit --project flag
  if (explicit) {
    const project = await findByNameOrId(explicit, store);
    if (!project) { throw new UserError(...); }
    return { id: project.id, source: 'flag' };
    // Note: --worktree flag handled by slice 183
  }

  // Step 2: CWD detection (worktree-aware)
  const cwdMatch = await findProjectByCwd(store);
  if (cwdMatch) {
    if (cwdMatch.worktreeId) {
      return { id: cwdMatch.project.id, worktreeId: cwdMatch.worktreeId, source: 'worktree' };
    }
    return { id: cwdMatch.project.id, source: 'cwd' };
  }

  // Step 3: default_project config
  // ... (identical to existing resolveProjectId)

  // Step 4: no resolution
  // ... (identical to existing resolveProjectId)
}
```

**Backwards compatibility:** The existing `resolveProjectId` function is preserved as a thin wrapper that calls `resolveProjectWorktree` and drops the `worktreeId`:

```typescript
export async function resolveProjectId(
  explicit: string | undefined,
  store: FileProjectStore,
): Promise<ResolvedProject> {
  const result = await resolveProjectWorktree(explicit, store);
  return { id: result.id, source: result.source };
}
```

Callers that don't need worktree information continue to use `resolveProjectId` unchanged. New callers (slices 183-185) use `resolveProjectWorktree`.

## Success Criteria

1. `git worktree list --porcelain` output is correctly parsed into `WorktreeInfo[]`
2. Parsing handles: normal worktree, detached HEAD, bare entry (skipped), prunable entry (skipped), no worktrees (single main entry)
3. Parsing gracefully handles: git not available (empty array), not a git repo (empty array)
4. `findProjectByCwd` matches worktree paths in addition to project paths
5. Longest-path match wins when worktree paths overlap (e.g., nested worktrees)
6. `resolveProjectWorktree` returns both `projectId` and `worktreeId` when matched via worktree
7. `resolveProjectWorktree` returns `projectId` only (no `worktreeId`) when matched via project path
8. Existing `resolveProjectId` callers continue to work unchanged
9. `ResolutionSource` includes `'worktree'` value
10. `GitWorktreeDiscovery` is exported from `packages/core` for reuse by MCP (slice 186)
11. Unit tests cover: porcelain parsing (all formats), path matching (project path, worktree path, longest match), two-phase resolution, backwards compatibility

### Verification Walkthrough

**Implementation status: COMPLETE** — All items verified via unit tests in:
- `packages/core/tests/git/GitWorktreeDiscovery.test.ts` (10 tests)
- `packages/cli/tests/utils/project.test.ts` (29 tests)

Run to verify:
```
npm test  # all 996 tests pass across all packages
```

**1. Porcelain parsing** — verified by `GitWorktreeDiscovery.test.ts`:
- Multi-worktree output (normal + detached + bare) → 3 `WorktreeInfo[]` entries (bare skipped) ✓
- Single worktree (main only) → 1 entry ✓
- Bare entry skipped ✓
- Prunable entry skipped (handles both `prunable` and `prunable <reason>` line formats) ✓
- Empty string → empty array ✓
- Git throws → empty array ✓

**2. CWD resolution — worktree path match** — verified by `project.test.ts`:
- CWD `/repos/project-api/src`, worktree registered at `/repos/project-api` → resolves `{ project, worktreeId: 'wt_001' }` ✓
- CWD `/repos/project/src`, project registered at `/repos/project` → resolves `{ project, worktreeId: undefined }` ✓

**3. CWD resolution — longest match** — verified by `project.test.ts`:
- Two worktrees: `/repos/project-api` and `/repos/project-api/nested`
- CWD `/repos/project-api/nested/src` → resolves to `wt_002` (nested worktree, longer path) ✓

**4. Backwards compatibility** — verified by `project.test.ts`:
- `resolveProjectId` wrapper drops `worktreeId`, returns `ResolvedProject` as before ✓
- `'worktreeId' in result` is `false` for `resolveProjectId` results ✓
- All existing `resolveProjectId` caller tests pass unchanged ✓

**Note:** `prunable` line detection was a real edge case found during implementation — git emits `prunable <reason>` (with text after the keyword), not just `prunable` alone. Fixed in `GitWorktreeDiscovery.ts` to use `startsWith('prunable ')` in addition to exact match.

## Implementation Notes

### Development Approach

Suggested implementation order:

1. **Types first.** Create `WorktreeInfo` in `packages/core/src/types/git.ts`. Export from `packages/core/src/types/index.ts`.
2. **GitWorktreeDiscovery.** Implement porcelain parser and service in `packages/core/src/git/GitWorktreeDiscovery.ts`. Create `packages/core/src/git/index.ts` for exports. Unit test with mock output strings (no actual git calls in tests).
3. **Extended findProjectByCwd.** Update return type to `CwdMatch | null`, add worktree path scanning. Unit test with mock store data.
4. **resolveProjectWorktree.** Implement new resolution function. Refactor `resolveProjectId` as wrapper. Update existing callers of `findProjectByCwd` to handle new return type.
5. **Export and integrate.** Ensure `GitWorktreeDiscovery` and `WorktreeInfo` are exported from core package index.

### Porcelain Parsing Strategy

The parser should be a pure function: `parseWorktreeListOutput(stdout: string): WorktreeInfo[]`. This makes it trivially testable with string fixtures. The `GitWorktreeDiscovery` service wraps this with the `gitExec` call.

**Edge cases to handle:**
- Trailing newlines (git output typically ends with `\n\n`)
- Windows paths (backslashes) — unlikely for this project but don't break on them
- Empty branch for detached HEAD — `branch` field is `undefined`
- Prunable worktrees — skip (they're stale references, not usable worktrees)

### `findProjectByCwd` Return Type Change

This is the only breaking change in this slice. Current callers:

1. `resolveProjectId` in `project.ts` — refactored to use `resolveProjectWorktree`
2. Direct callers in CLI commands — migrate to use `.project` from result

The change is contained within `packages/cli/src/utils/project.ts` and its direct consumers. No cross-package API break.

### Testing Strategy

**Unit tests for `GitWorktreeDiscovery`** (`packages/core/tests/git/GitWorktreeDiscovery.test.ts`):
- Parse multi-worktree output
- Parse single worktree (main only)
- Parse detached HEAD entry
- Skip bare entry
- Skip prunable entry
- Handle empty output
- Handle git failure (mock `gitExec` to throw)

**Unit tests for extended `findProjectByCwd`** (`packages/cli/tests/utils/project.test.ts` or similar):
- Match via projectPath (existing behavior preserved)
- Match via worktreePath
- Longest path wins across project and worktree paths
- No match returns null
- Project with no worktrees behaves as before

**Unit tests for `resolveProjectWorktree`**:
- Flag resolution (no worktree)
- CWD project path resolution (no worktree)
- CWD worktree path resolution (with worktreeId)
- Default config resolution (no worktree)
- No resolution (error)

## Risks

### Risk: Git CLI output format changes
**Likelihood:** Very low — porcelain format is explicitly stable per git documentation.
**Impact:** Parser returns incorrect or empty results.
**Mitigation:** Parser tests use realistic fixtures. Porcelain format has been stable since git 2.7 (2016).

### Risk: Path comparison edge cases
**Likelihood:** Low — trailing slashes are the main practical concern.
**Impact:** CWD fails to match a valid worktree path.
**Mitigation:** Normalize paths (strip trailing slashes), following the existing pattern in `findProjectByCwd`. Case sensitivity and symlink resolution are intentionally skipped — case adds significant complexity for minimal benefit (macOS HFS+ handles case-insensitive lookups at the filesystem level), and symlinks are an unusual edge case. Both are documented as known limitations.

### Risk: `findProjectByCwd` return type change breaks callers
**Likelihood:** Certain — deliberate breaking change, handled by design.
**Impact:** Compile errors in existing callers.
**Mitigation:** All callers are within `packages/cli/` — TypeScript compiler catches every breakage at compile time. Update callers in the same commit as the type change.

## Effort

3/5 — The porcelain parser is straightforward string processing. The CWD resolution extension follows the existing pattern with a second pass. The primary complexity is ensuring all callers of `findProjectByCwd` are updated and tested, and handling edge cases in path comparison.
