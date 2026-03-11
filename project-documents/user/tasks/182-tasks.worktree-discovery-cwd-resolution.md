---
slice: worktree-discovery-cwd-resolution
project: context-forge
lld: user/slices/182-slice.worktree-discovery-cwd-resolution.md
dependencies: [181-worktreecontext-data-model-storage]
projectState: Slice 181 complete — WorktreeContext type, WorktreeService CRUD, and migration are in place. No git/ directory exists in packages/core/src yet. Existing findProjectByCwd and resolveProjectId in packages/cli/src/utils/project.ts. Existing test file at packages/cli/tests/utils/project.test.ts.
dateCreated: 20260310
dateUpdated: 20260310
status: complete
---

# Tasks: 182 — Worktree Discovery & CWD Resolution

## Context Summary

- Working on slice 182: Worktree Discovery & CWD Resolution
- Slice 181 complete: `WorktreeContext` type with `worktreePath`, `WorktreeService` CRUD ops
- This slice adds `GitWorktreeDiscovery` (core) and extends CWD resolution (CLI) to be worktree-aware
- After this slice, running `cf` from a worktree directory auto-resolves project + worktree context
- Next slice: 183 (Worktree CLI Commands)
- Key files: `packages/core/src/git/` (NEW), `packages/cli/src/utils/project.ts` (MODIFIED)
- Direct callers of `findProjectByCwd`: `resolveProjectId` (project.ts:83), `project list` command (project.ts:335)

---

## Tasks

### 1. Create `WorktreeInfo` type

- [x] Create `packages/core/src/types/git.ts` with `WorktreeInfo` interface
  - [x] Fields: `path` (string), `head` (string), `branch` (string | undefined), `bare` (boolean)
  - [x] JSDoc per field as specified in slice design (section: Type Definitions > WorktreeInfo)
- [x] Export `WorktreeInfo` from `packages/core/src/types/index.ts`
- [x] Verify: `npm run build` passes in `packages/core`

### 2. Implement `GitWorktreeDiscovery` service

- [x] Create directory `packages/core/src/git/`
- [x] Create `packages/core/src/git/GitWorktreeDiscovery.ts`
  - [x] Implement pure function `parseWorktreeListOutput(stdout: string): WorktreeInfo[]`
    - [x] Split on blank lines to get entries
    - [x] Parse key-value lines per entry (`worktree`, `HEAD`, `branch`, `bare`, `detached`)
    - [x] Skip entries marked `bare`
    - [x] Handle edge cases: trailing newlines, empty output, detached HEAD (branch = undefined)
  - [x] Implement `GitWorktreeDiscovery` class with `async listWorktrees(repoPath: string): Promise<WorktreeInfo[]>`
    - [x] Use `gitExec` from `packages/core/src/guides/gitExec.ts` to run `git worktree list --porcelain`
    - [x] Return empty array if git not available or not a git repo (catch errors gracefully)
    - [x] Pass parsed output through `parseWorktreeListOutput`
  - [x] Export `parseWorktreeListOutput` (for direct testing) and `GitWorktreeDiscovery`
- [x] Create `packages/core/src/git/index.ts` with re-exports
- [x] Export git module from `packages/core` package index (ensure consumers can import)
- [x] Verify: `npm run build` passes in `packages/core`

### 3. Test `GitWorktreeDiscovery`

- [x] Create `packages/core/tests/git/GitWorktreeDiscovery.test.ts`
- [x] Test `parseWorktreeListOutput` (pure function, string fixtures — no git calls):
  - [x] Multi-worktree output: normal + detached HEAD entries → correct `WorktreeInfo[]`
  - [x] Single worktree (main only, no linked worktrees) → one entry
  - [x] Bare entry is skipped
  - [x] Prunable entry is skipped
  - [x] Detached HEAD → `branch` is `undefined`
  - [x] Empty string → empty array
  - [x] Trailing newlines handled correctly
- [x] Test `GitWorktreeDiscovery.listWorktrees` (mock `gitExec`):
  - [x] Successful parse returns `WorktreeInfo[]`
  - [x] Git not available (gitExec throws) → returns empty array
  - [x] Not a git repo (gitExec throws) → returns empty array
- [x] Verify: all tests pass via `npm test` in `packages/core`

### 4. Extend `findProjectByCwd` return type and implementation

- [x] In `packages/cli/src/utils/project.ts`:
  - [x] Add `CwdMatch` interface: `{ project: ProjectData; worktreeId?: string }`
  - [x] Change `findProjectByCwd` return type from `ProjectData | null` to `CwdMatch | null`
  - [x] Build candidate list from both `project.projectPath` and `project.worktrees[].worktreePath`
    - [x] Each candidate tracks: `project`, `path`, optional `worktreeId`
  - [x] Filter and sort candidates using existing pattern (normalize trailing slashes, longest path wins)
  - [x] Return `{ project, worktreeId }` from best match
  - [x] See slice design section "Extended findProjectByCwd" for reference implementation
- [x] Update direct callers to handle new return type:
  - [x] `resolveProjectId` (project.ts ~line 83): extract `.project` from result, use `.id`
  - [x] `project list` command (project.ts ~line 335): extract `.project` from result, use `.id`
- [x] Verify: `npm run build` passes in `packages/cli`

### 5. Test extended `findProjectByCwd`

- [x] In `packages/cli/tests/utils/project.test.ts`:
  - [x] Update existing `findProjectByCwd` tests to handle `CwdMatch` return type (extract `.project`)
  - [x] Add new tests:
    - [x] Match via `worktreePath` → returns `{ project, worktreeId }`
    - [x] Match via `projectPath` (no worktrees) → returns `{ project, worktreeId: undefined }`
    - [x] Longest path wins across project paths and worktree paths
    - [x] Project with empty `worktrees` array behaves as before
    - [x] No match → returns `null`
- [x] Verify: all tests pass via `npm test` in `packages/cli`

### 6. Add `resolveProjectWorktree` function and extend `ResolutionSource`

- [x] In `packages/cli/src/utils/project.ts`:
  - [x] Extend `ResolutionSource` type: add `'worktree'` value
  - [x] Add `ResolvedProjectWorktree` interface: `{ id: string; source: ResolutionSource; worktreeId?: string }`
  - [x] Implement `resolveProjectWorktree(explicit, store): Promise<ResolvedProjectWorktree>`
    - [x] Step 1: explicit `--project` flag → `findByNameOrId` → `{ id, source: 'flag' }`
    - [x] Step 2: CWD detection via `findProjectByCwd` → if `worktreeId`, return `source: 'worktree'`; else `source: 'cwd'`
    - [x] Step 3: `default_project` config fallback (same logic as existing `resolveProjectId`)
    - [x] Step 4: throw `UserError` (same as existing)
  - [x] Refactor `resolveProjectId` as thin wrapper: call `resolveProjectWorktree`, drop `worktreeId`
  - [x] Export `resolveProjectWorktree` and `ResolvedProjectWorktree`
- [x] Verify: `npm run build` passes in `packages/cli`

### 7. Test `resolveProjectWorktree` and backwards compatibility

- [x] In `packages/cli/tests/utils/project.test.ts`:
  - [x] Add `resolveProjectWorktree` test suite:
    - [x] Explicit flag → `{ id, source: 'flag', worktreeId: undefined }`
    - [x] CWD matches project path → `{ id, source: 'cwd', worktreeId: undefined }`
    - [x] CWD matches worktree path → `{ id, source: 'worktree', worktreeId: 'wt_xxx' }`
    - [x] Default config fallback → `{ id, source: 'default', worktreeId: undefined }`
    - [x] No resolution → throws `UserError`
  - [x] Verify existing `resolveProjectId` tests still pass (backwards compatibility)
  - [x] Verify: all tests pass via `npm test` in `packages/cli`

### 8. Final verification and commit

- [x] Run full build from project root: `npm run build`
- [x] Run full test suite from project root: `npm test`
- [x] Verify `GitWorktreeDiscovery` and `WorktreeInfo` are importable from `@context-forge/core`
- [x] Commit all changes with semantic message
