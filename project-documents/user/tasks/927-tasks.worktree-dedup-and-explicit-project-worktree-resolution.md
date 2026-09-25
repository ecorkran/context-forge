---
docType: tasks
slice: worktree-dedup-and-explicit-project-worktree-resolution
project: context-forge
lld: user/slices/927-slice.worktree-dedup-and-explicit-project-worktree-resolution.md
dependencies: [926]
projectState: main is green at 53b7f3f. v0.17.0 is tagged and published (slice 926). Slice 927 design is revised after a CONCERNS review; all three findings (F001–F003) were verified against source and resolved in the design. No code written for this slice. `mergeCheckResults` still keys on the raw `rule|location|description`; CLI `cf check --fix` still applies fixes after the merge; `resolveProjectWorktree`'s explicit branch still ignores CWD and still carries the unused `worktree` option.
dateCreated: 20260924
dateUpdated: 20260924
status: not_started
---

## Context Summary

- Working on slice 927: fix GitHub #100 (`cf check` repeats project-level
  findings once per worktree) and #101 (`--project foo` from inside a foo
  worktree operates on the project root), plus a rider that deletes dead
  resolver code.
- Design decisions D1–D5 are settled. Do not relitigate during
  implementation. Notably: normalize at the merge **key** only, never at
  the producers (D1); normalize `description` as well as `location` (D2);
  the explicit `--project` branch consults CWD, and no `--worktree` flag is
  added to other commands (D3, PM decision); delete the resolver's
  `worktree` option rather than harden it (D4); fixes apply per view,
  **before** the merge (D5).
- Prerequisite: slice 926 (complete). It provides `mergeCheckResults`,
  `attributeFindings`, `buildAttributedViews` (core
  `introspection/mergeCheckResults.ts`) and `resolveWorktreeForPath` (core
  `utils/worktree-overlay.ts`).
- Delivers: root-normalized dedup; `mergeFixResults` shared by CLI and MCP;
  per-view fixing in CLI `cf check --fix`; CWD-aware explicit `--project`
  resolution for all commands that use `resolveProjectWorktree`.
- Next planned slice: none scheduled.

Full rationale: `user/slices/927-slice.worktree-dedup-and-explicit-project-worktree-resolution.md`.

**External consumers: read before changing output.** Squadron reads
`cf check --json`. The JSON shape must not change. A kept finding's
`location` and `description` stay absolute and unmodified. Normalization
exists only inside the dedup key.

**Order:** resolver first (small, isolated), then the dedup key, then the
fix path (depends on dedup, because dedup is what makes post-merge fixing
wrong), then the walkthrough.

## Branch Setup

- [ ] **Task 0: Create slice branch**
  - [ ] Run `cf config get git.integration_branch`; the target is its value, or `main` if empty
  - [ ] `git checkout -b 927-slice.worktree-dedup-and-explicit-project-worktree-resolution {target}`
  - [ ] Success: on the new branch, `git status` clean

## Part 1 — #101 and Rider: Explicit `--project` Resolution

- [ ] **Task 1: Remove the resolver's `worktree` option** (effort 1)
  - [ ] In `packages/cli/src/utils/project.ts`, delete the `worktree` field from `ResolveProjectWorktreeOptions` and the `if (opts.worktree) { … }` block in the explicit branch
  - [ ] Update the JSDoc on `resolveProjectWorktree` to drop the sentence about `opts.worktree`
  - [ ] Delete the two tests in `packages/cli/tests/utils/project.test.ts` that pass `worktree:` (currently near lines 280 and 299, `'feature'` and `'nonexistent'`)
  - [ ] Confirm no remaining references: `grep -rn "worktree:" packages/cli/src | grep resolveProjectWorktree` returns nothing
  - [ ] Do **not** touch `cf status`'s own `--worktree` handling (`status.ts`, the `findWorktreeByNameOrId` block after the resolver call)
  - [ ] Success: `pnpm --filter @context-forge/cli build` passes with no type errors

- [ ] **Task 2: Make the explicit `--project` branch CWD-aware** (effort 2)
  - [ ] In the explicit branch, after the project is found, call `resolveWorktreeForPath(project, process.cwd())` (import from `@context-forge/core`, same as `findProjectByCwd`)
  - [ ] If the result is a worktree match for *this* project, set `resolved.worktreeId` to its id; otherwise leave `worktreeId` unset
  - [ ] `source` stays `'flag'`
  - [ ] Check how `findProjectByCwd` reads the `resolveWorktreeForPath` return value and follow the same pattern. Don't guess the return shape.
  - [ ] Update the JSDoc: the explicit branch now also derives `worktreeId` from CWD
  - [ ] Success: CLI build passes

- [ ] **Task 3: Test explicit-branch resolution** (effort 2)
  - [ ] In `packages/cli/tests/utils/project.test.ts`, add cases for `resolveProjectWorktree({ project })` with CWD stubbed (use the existing CWD-stub pattern in that file):
    1. CWD inside a registered worktree of the named project → `worktreeId` is that worktree, `source: 'flag'`
    2. CWD outside all of that project's checkouts → no `worktreeId`
    3. CWD inside a *different* project's checkout → no `worktreeId` (named project's root)
    4. Migrated single-worktree project (`default` worktree path equals `projectPath`), CWD at the project root → `worktreeId` is `default`
  - [ ] Success: `pnpm --filter @context-forge/cli test` passes

- [ ] **Task 4: Guard `cf status --worktree` behavior** (effort 1)
  - [ ] In the existing `cf status` command tests, add or confirm cases: `--project X --worktree <name>` selects `<name>` even when CWD is in a different worktree of X; `--worktree <bogus>` throws `UserError`
  - [ ] Add a case pinning criterion 8: for a migrated single-worktree project (`default` worktree path equals `projectPath`), with CWD stubbed at the project root and no `--worktree` flag, `cf status --json --project <name>` reports `worktree.name === 'default'` and `resolutionSource: 'flag'`
  - [ ] If equivalent tests already exist, note which ones and add nothing
  - [ ] Success: tests pass

- [ ] **Task 5: Commit Part 1**
  - [ ] `pnpm -r build` and `pnpm -r test` pass
  - [ ] Commit: `fix(cli): resolve worktree from CWD under explicit --project` with `Fixes #101` in the body

## Part 2 — #100: Root-Normalized Dedup Key

- [ ] **Task 6: Export `stripTrailingSeparator`** (effort 1)
  - [ ] In `packages/core/src/utils/worktree-overlay.ts`, export the existing private `stripTrailingSeparator` (do not duplicate it)
  - [ ] Success: core build passes

- [ ] **Task 7: Add `replaceRoot` and `dedupKey` to the merge** (effort 2)
  - [ ] In `packages/core/src/introspection/mergeCheckResults.ts`, add a module-private `replaceRoot(text, viewRoot)`. It replaces each occurrence of `stripTrailingSeparator(viewRoot)` with a fixed token, but only where a path separator or end of string follows (so `/repo` does not match inside `/repo-other`)
  - [ ] Add a module-private `dedupKey(finding, viewRoot)` as shown in the design (`#100 — Dedup Key Normalization`): `rule | norm(location) | norm(description)`
  - [ ] In the merge loop, use `dedupKey(finding, result.projectPath)` in place of the inline key
  - [ ] The kept finding is pushed unmodified. Normalization affects the key only.
  - [ ] Keep the `results.length === 1` early return exactly as is
  - [ ] Update the function's JSDoc: dedup key is root-normalized per view
  - [ ] Success: core build passes

- [ ] **Task 8: Unit-test the normalized merge** (effort 2)
  - [ ] Create `packages/core/tests/introspection/mergeCheckResults.test.ts` (no core test file exists for the merge today; CLI's `check-worktree-attribution.test.ts` covers attribution and stays as is)
  - [ ] Cases:
    1. Absolute-path `location` under two different roots → one finding; kept finding's `location` is the first result's original absolute path
    2. `description` embedding the root under two roots (personal-scope-key shape) → one finding
    3. Boundary: roots `/repo` and `/repo-other` with otherwise identical text → **two** findings
    4. Non-path location (`slice plan entry 250`) identical across views → one finding (unchanged behavior)
    5. Real shape from #100: the `900-slices` plan path under two roots (the slice-921 review-gate warning whose `location` is `900-slices.maintenance-and-refactoring.md` under two checkout roots — recorded in `926-slice...md`'s verification walkthrough, steps 5–6) → one finding
    6. Single result → returned with only `projectPath` replaced by `invokingPath` (byte-identical otherwise)
    7. Counts (`totalFindings`, `errors`, `warnings`, `infos`, `summary`) reflect the deduped list
  - [ ] Success: `pnpm --filter @context-forge/core test` passes

- [ ] **Task 9: Commit Part 2**
  - [ ] `pnpm -r build` and `pnpm -r test` pass (CLI attribution tests must still pass unchanged)
  - [ ] Commit: `fix(core): normalize checkout root in check-result dedup key` with `Fixes #100` in the body

## Part 3 — #100 Fix Path: Per-View Fixes and `mergeFixResults`

- [ ] **Task 10: Make attribution generic over the result type** (effort 1)
  - [ ] In core `mergeCheckResults.ts`, make `attributeFindings` generic: `<T extends ConsistencyCheckResult>(result: T, …): T`
  - [ ] In `packages/cli/src/commands/check.ts`, make `runAttributed` generic the same way
  - [ ] Success: `pnpm -r build` passes; no behavior change

- [ ] **Task 11: Add `mergeFixResults` to core** (effort 2)
  - [ ] In `mergeCheckResults.ts`, add exported `mergeFixResults(results: ConsistencyFixResult[], invokingPath?: string): ConsistencyFixResult`
  - [ ] Finding dedup delegates to `mergeCheckResults` (no second copy of the loop)
  - [ ] `fixed` is summed; `fixLog` and `fixErrors` are concatenated in result order, with no dedup
  - [ ] Export it from `packages/core/src/introspection/index.ts` next to `mergeCheckResults`
  - [ ] Success: core build passes

- [ ] **Task 12: Unit-test `mergeFixResults`** (effort 1)
  - [ ] In `mergeCheckResults.test.ts`, add cases: `fixed` summed across two results; `fixLog` entries from both views present (two entries for the same logical fix in two checkouts); `fixErrors` concatenated; findings deduped identically to `mergeCheckResults`; single result passes through with fix fields intact
  - [ ] Success: core tests pass

- [ ] **Task 12a: Commit checkpoint**
  - [ ] `pnpm -r build` and `pnpm --filter @context-forge/core test` pass
  - [ ] Commit: `feat(core): add mergeFixResults for per-view fix merging`

- [ ] **Task 13: CLI single-slice fix mode applies per view** (effort 2)
  - [ ] In `check.ts` single-slice path: when `fixMode`, run `checker.fix(v)` per view via `runAttributed`, then `mergeFixResults(…, invokingPath)`; otherwise unchanged (`check` + `mergeCheckResults`)
  - [ ] Remove the post-merge `checker.applyFixes(merged)` call
  - [ ] Success: CLI build passes

- [ ] **Task 14: CLI all-slices fix mode applies per view** (effort 3)
  - [ ] Keep the dry-run results **per view** (`dryRunResults`) as well as the merged `dryRun` used for display and the confirmation count
  - [ ] Zero-fixable and abort paths are unchanged
  - [ ] On confirm (or `--yes`): run `checker.applyFixes(r)` on each per-view dry-run result (no re-check), then `mergeFixResults(…, invokingPath)`
  - [ ] Remove both post-merge `checker.applyFixes(dryRun)` calls
  - [ ] Success: CLI build passes

- [ ] **Task 15: Test CLI per-view fixing** (effort 3)
  - [ ] `check.test.ts` and `check-worktree-attribution.test.ts` both mock `ConsistencyChecker` entirely — this test needs the real implementation running against real files, so it does not fit either as-is. Follow 926 Task 5's precedent: use the real `ConsistencyChecker` over real temp directories (mock only the project store), not a mocked checker
  - [ ] Build a project with two real worktree checkouts, each containing a `project-documents/.../900-slices.*.md` fixture with the same unchecked entry for a complete slice (same fixable state in both checkouts)
  - [ ] Assert for single-slice `--fix`: both checkout files are fixed on disk; `fixLog` has two entries with different file paths
  - [ ] Assert for all-slices `--fix --yes`: same; the displayed finding appears once
  - [ ] This test must fail against pre-Task-13/14 code (confirm by running it against the current tree before Task 13's change, or by inspecting that the old post-merge `applyFixes` path would fix only one checkout)
  - [ ] Success: CLI tests pass

- [ ] **Task 15a: Commit checkpoint**
  - [ ] `pnpm -r build` and `pnpm --filter @context-forge/cli test` pass
  - [ ] Commit: `fix(cli): apply check fixes per worktree before merging`

- [ ] **Task 16: MCP `workflow_check` uses `mergeFixResults`** (effort 1)
  - [ ] In `packages/mcp-server/src/tools/workflowTools.ts`, in both fix branches (single-slice and all-slices), use `mergeFixResults` when `fixMode`, `mergeCheckResults` otherwise
  - [ ] Success: MCP build passes

- [ ] **Task 17: Test MCP fix fields survive the merge** (effort 1)
  - [ ] In `packages/mcp-server/tests/workflowTools.test.ts`, add a two-worktree `workflow_check` case with `fix: true` asserting the JSON result contains `fixed`, `fixLog`, and `fixErrors` with entries from both views
  - [ ] Success: MCP tests pass

- [ ] **Task 18: Commit Part 3**
  - [ ] `pnpm -r build` and `pnpm -r test` pass
  - [ ] Commit: `fix(mcp): merge per-view fix results in workflow_check`

## Part 4 — Verification and Close-Out

- [ ] **Task 19: Verification walkthrough** (effort 2)
  - [ ] Use the local build (`node packages/cli/dist/index.js`), not the global `cf`
  - [ ] Run the walkthrough steps from the slice design (`Verification Walkthrough`, steps 1–7) against this repo with a temporary worktree at `/tmp/cf-wt-927`
  - [ ] Replace the design's walkthrough outline with the actual commands and their real output
  - [ ] Remove the temporary worktree and unregister it (`cf worktree rm`), and confirm `git worktree list` no longer shows it
  - [ ] Success: every walkthrough step shows the expected result; any mismatch is stopped and reported, not worked around

- [ ] **Task 20: Final validation and commit** (effort 1)
  - [ ] `pnpm -r build`, `pnpm -r test`, and lint (if configured) pass
  - [ ] Run `node packages/cli/dist/index.js check` on this repo and confirm no new findings from this slice's docs
  - [ ] Commit the walkthrough update: `docs: add slice 927 verification walkthrough results`
  - [ ] Hand off for merge and the design's success-criteria check-off. Do not merge, tag, or close issues without PM direction.
