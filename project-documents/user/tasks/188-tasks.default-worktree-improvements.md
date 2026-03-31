---
docType: tasks
layer: project
project: context-forge
parent: user/slices/188-slice.default-worktree-improvements.md
slicePlan: user/architecture/180-slices.initiative-context-worktree.md
sliceIndex: 188
status: complete
dateCreated: 20260312
dateUpdated: 20260312
dependencies:
  - 181-slice (WorktreeContext Data Model & Storage) — complete
slice: default-worktree-improvements
---

# Tasks: Default Worktree Improvements (188)

## Context

The default worktree created during forward migration has three problems: capitalized name (`"Default"`), system range `[0, 99]`, and static range that never adjusts. This task set implements the rename, range fix, dynamic range chopping, and artifact collision detection described in `user/slices/188-slice.default-worktree-improvements.md`.

**Key files:**
- `packages/core/src/services/WorktreeService.ts` — primary change target
- `packages/core/tests/services/WorktreeService.test.ts` — primary test target
- `packages/cli/src/commands/worktree.ts` — CLI migration message
- `packages/mcp-server/src/tools/worktreeTools.ts` — MCP description string

## Tasks

### 1. Rename and Range Constants

- [x] **1.1** In `WorktreeService.addWorktree` (line ~140), change the default worktree name from `'Default'` to `'default'`
- [x] **1.2** In `WorktreeService.addWorktree` (line ~141), change `indexRange: [0, 99]` to `indexRange: [100, 799]`
- [x] **1.3** In `packages/cli/src/commands/worktree.ts` (line ~120), update the migration message from `'Default' worktree context (range 0-99)` to `'default' worktree context (range 100-799)`
- [x] **1.4** In `packages/mcp-server/src/tools/worktreeTools.ts`, update the `worktree_init` tool description string that references `"Default"` to use `"default"`

### 2. Update Existing Tests for Rename/Range

- [x] **2.1** In `packages/core/tests/services/WorktreeService.test.ts`, update the migration test (`creates Default worktree with mapped fields on first addWorktree`, line ~267) to expect `name: 'default'` and `indexRange: [100, 799]`
- [x] **2.2** Update `expect(defaultWt.name).toBe('Default')` → `toBe('default')` and `expect(defaultWt.indexRange).toEqual([0, 99])` → `toEqual([100, 799])`
- [x] **2.3** Update the test `does NOT create Default when project has no workflow fields` (line ~302) — update any name references
- [x] **2.4** Update `creates Default with only populated fields mapped for partially-set project` test (line ~315) — update name/range assertions
- [x] **2.5** In `packages/cli/tests/commands/worktree.test.ts`, update migration overlap test fixture referencing `existingWorktreeName: 'Default'` (line ~147) to `'default'`
- [x] **2.6** Run `npm test` across all packages to confirm rename/range changes pass. Fix any remaining assertions that reference the old name or range.

### 3. Index Extraction Utility

- [x] **3.1** Add a private helper function `extractIndexFromFilename(filename: string): number | null` to `WorktreeService.ts`. Uses regex `/^(\d+)-/` to extract the leading numeric prefix. Returns `null` if no match. Place it alongside the existing module-level helper functions (near `validateIndexRange`).
- [x] **3.2** Add a private method `getWorktreeArtifactIndices(wt: WorktreeContext): { field: string; filename: string; index: number }[]` that checks `archDoc`, `slicePlan`, `activeSlice`, and `activeTaskFile` fields. For each non-empty field, extracts the index via `extractIndexFromFilename`. Returns an array of `{ field, filename, index }` entries for fields that have a parseable index.

### 4. Index Extraction Tests

- [x] **4.1** Add unit tests for `extractIndexFromFilename`:
  - `'200-arch.event-driven-pipeline.md'` → `200`
  - `'180-slices.initiative-context-worktree.md'` → `180`
  - `'187-slice.validation-edge-cases-polish'` → `187`
  - `''` → `null`
  - `'no-index-file.md'` → `null`
  - `'abc-arch.foo.md'` → `null`
- [x] **4.2** Since `extractIndexFromFilename` is module-private, test it indirectly through `chopDefaultRange` behavior (collision detection tests in task 7). Alternatively, export it as a named export for testing if the team prefers direct testing. Decision: test indirectly via collision behavior.

### 5. Chop Default Range Logic

- [x] **5.1** Add a private method `chopDefaultRange` to `WorktreeService` with signature:
  ```
  private chopDefaultRange(
    worktrees: WorktreeContext[],
    newRange: [number, number],
    excludeId?: string,
  ): { chopped: boolean; warning?: string }
  ```
  This method mutates the default worktree's `indexRange` in the `worktrees` array in place (before the array is persisted).

- [x] **5.2** Implement the core algorithm in `chopDefaultRange`:
  1. Find the worktree named `"default"` (case-insensitive match)
  2. If not found or no overlap with `newRange` → return `{ chopped: false }`
  3. Compute candidate contiguous blocks within default's current range, excluding `newRange`:
     - Lower block: `[default.start, newRange.start - 1]` (valid if `newRange.start > default.start`)
     - Upper block: `[newRange.end + 1, default.end]` (valid if `newRange.end < default.end`)
  4. Select the lower block if it's valid; otherwise select the upper block. (Prefer lower per slice design.)
  5. If neither block is valid (new range covers entire default): set to `[0, 0]` sentinel, return with warning
  6. Update default's `indexRange` to the selected block
  7. Return `{ chopped: true, warning? }`

- [x] **5.3** Add artifact collision detection before chopping:
  1. Call `getWorktreeArtifactIndices` on the default worktree
  2. For each artifact index, check if it falls within the range being carved away (i.e., it's in default's current range but NOT in the candidate new range)
  3. If any collision found → throw an `Error` with message listing the conflicting artifacts:
     `"Cannot shrink default worktree range — artifact '{filename}' (index {n}) would fall outside the new range [{start}, {end}]. Move the artifact to another worktree first."`

- [x] **5.4** Call `chopDefaultRange` from `addWorktree`:
  - After building the worktrees array (line ~146 or ~161) but before `store.update`
  - Pass the full worktrees array and the new worktree's `indexRange`
  - If `chopped` is true, the array already reflects the change (mutated in place)
  - If a `warning` is returned, include it in the return value (extend the return type to include `chopWarning?: string`)

- [x] **5.5** Call `chopDefaultRange` from `updateWorktree`:
  - Only when `updates.indexRange` is provided
  - Pass the worktrees array and the updated range, excluding the worktree being updated (`excludeId`)
  - Same mutation-before-persist pattern

- [x] **5.6** Update the `addWorktree` return type to include `chopWarning?: string`. Update `removeWorktree` if needed (no chop on remove — removing a worktree does NOT expand default's range back).

### 6. Chop Logic Tests

- [x] **6.1** Test: new worktree `[300, 399]` with default `[100, 799]` → default shrinks to `[100, 299]`
- [x] **6.2** Test: new worktree `[100, 199]` with default `[100, 799]` → default shrinks to `[200, 799]` (no lower block, upper wins)
- [x] **6.3** Test: new worktree `[400, 599]` with default `[100, 799]` → default shrinks to `[100, 399]` (prefer lower)
- [x] **6.4** Test: new worktree `[100, 799]` covers entire default → default becomes `[0, 0]` sentinel with warning
- [x] **6.5** Test: new worktree `[500, 599]` with default already at `[100, 299]` → no overlap, no chop
- [x] **6.6** Test: second chop — default `[100, 299]`, new `[200, 299]` → default shrinks to `[100, 199]`
- [x] **6.7** Test: `updateWorktree` with new range triggers chop on default
- [x] **6.8** Test: non-default worktrees are never chopped (only default is affected)

### 7. Collision Detection Tests

- [x] **7.1** Test: default has `archDoc: '180-arch.something.md'` (index 180), new worktree claims `[100, 199]`. Default would shrink to `[200, 799]`. Index 180 is NOT in `[200, 799]` → error thrown with descriptive message
- [x] **7.2** Test: default has `archDoc: '180-arch.something.md'` (index 180), new worktree claims `[300, 399]`. Default shrinks to `[100, 299]`. Index 180 IS in `[100, 299]` → no collision, chop succeeds
- [x] **7.3** Test: default has `activeSlice: '250-slice.foo'` (index 250), new worktree claims `[200, 299]`. Default shrinks to `[100, 199]`. Index 250 NOT in `[100, 199]` → error thrown
- [x] **7.4** Test: default has no artifact references set → chop always succeeds regardless of range

### 8. CLI and MCP Surface Updates

- [x] **8.1** In `packages/cli/src/commands/worktree.ts`, after `addWorktree` returns, check for `chopWarning` and display it via `warn()` style if present
- [x] **8.2** In `packages/mcp-server/src/tools/worktreeTools.ts`, after `addWorktree` returns, include `chopWarning` in the response text if present
- [x] **8.3** Same for `updateWorktree` in both CLI and MCP — check for chop warning when range is updated

### 9. Integration Verification

- [x] **9.1** Run full test suite: `npm test` from project root — all packages must pass
- [x] **9.2** Build check: `npm run build` from project root — no TypeScript errors
- [x] **9.3** Manual smoke test: `cf worktree init --name "test" --range 200-299` on a project without worktrees — verify default is `"default"` with chopped range in `cf worktree list` output

### 10. Commit and Wrap-Up

- [x] **10.1** Stage and commit all changes with message: `feat(core): improve default worktree name, range, and dynamic chopping`
- [x] **10.2** Update slice status to `complete` in `188-slice.default-worktree-improvements.md` frontmatter
- [x] **10.3** Check off slice 188 in `180-slices.initiative-context-worktree.md`
- [x] **10.4** Update DEVLOG with slice 188 completion entry
