---
docType: review
layer: project
reviewType: code
slice: worktree-dedup-and-explicit-project-worktree-resolution
targetKind: slice
rulesSource: project
project: context-forge
verdict: CONCERNS
verdictSource: stated
sourceDocument: project-documents/user/slices/927-slice.worktree-dedup-and-explicit-project-worktree-resolution.md
aiModel: z-ai/glm-5.3-flash
status: complete
dateCreated: 20260925
dateUpdated: 20260925
reviewedSha: dd58f337c6ae31c0ae06f5b116d2e3a8334255c2
toolsGiven: [read_file, list_files, grep]
toolCallsMade: 44
findings:
  - id: F001
    severity: concern
    category: correctness
    summary: "Fix-mode human output reports \"Fixed 2 of 1 findings\" — per-checkout write count vs. deduped finding count"
    location: "packages/cli/src/commands/check.ts#printCheckOutput"
  - id: F002
    severity: note
    category: types
    summary: "Untyped `rawProject` binding violates the project's strict-typing rule"
    location: "packages/cli/src/commands/status.ts:30"
  - id: F003
    severity: note
    category: dry
    summary: "Duplicated `applyFixes`/`mergeFixResults` blocks in the `--yes` and confirmation branches"
    location: "packages/cli/src/commands/check.ts:272-276"
  - id: F004
    severity: note
    category: dry
    summary: "MCP `workflow_check` repeats the attribute+merge pattern inline in all four branches"
    location: "packages/mcp-server/src/tools/workflowTools.ts#workflow_check"
  - id: F005
    severity: pass
    category: correctness
    summary: "Root-normalized dedup key is boundary-safe and correctly keeps the first-seen finding unmodified"
    location: "packages/core/src/introspection/mergeCheckResults.ts:71-108"
  - id: F006
    severity: pass
    category: testing
    summary: "Per-view fix ordering fixes a real silent cross-checkout bug and is pinned by a disk-level test"
    location: "packages/cli/tests/commands/check-worktree-fix.test.ts"
  - id: F007
    severity: pass
    category: error-handling
    summary: "`resolutionFailed` gating verified; no remaining callers of the removed `worktree` resolver option"
    location: "packages/cli/src/commands/status.ts:190-202"
---

# Review: code — slice 927

**Verdict:** CONCERNS
**Model:** z-ai/glm-5.3-flash

## Findings

### [CONCERN] Fix-mode human output reports "Fixed 2 of 1 findings" — per-checkout write count vs. deduped finding count

`printCheckOutput` prints `Fixed ${fixRes.fixed} of ${result.totalFindings} findings` (packages/cli/src/commands/check.ts:324), but after this slice these two numbers are computed on different bases: `fixed` is summed per view (`mergeFixResults`, packages/core/src/introspection/mergeCheckResults.ts:163-172) while `totalFindings` is the root-normalized deduped count. In the exact scenario this slice targets — the same logical finding in two checkouts — the CLI's own new integration test proves the shape: `fixed === 2`, `fixLog` length 2, but the deduped `findings` length is 1 (asserted in `check-worktree-fix.test.ts`, all-slices case). The human-readable output will therefore print "Fixed 2 of 1 findings". Relatedly, the confirmation prompt in all-slices fix mode counts deduped fixables (`fixableCount` from the merged dry run, check.ts:257), so a user confirming "1 fixable finding" gets 2 disk writes — correct behavior for keeping both checkouts consistent, but the messaging doesn't explain it. JSON output is unaffected; this is a display/count-semantics issue only. Suggest either wording the line as "Fixed 2 file updates across checkouts (1 finding)" or reporting both numbers explicitly.

### [NOTE] Untyped `rawProject` binding violates the project's strict-typing rule

`let id: string, source: ResolutionSource, cwdWorktreeId: string | undefined, rawProject;` declares `rawProject` without a type annotation, making it an evolving-`let` of implicit `any` at declaration. The TypeScript rules ban `any`/untyped bindings ("Every `any` is a hole in that net"). Annotate it: `let rawProject: ProjectData | undefined;` (the type is already imported-adjacent via `store.getById`). The same multi-declarator `let` plus the inner `catch (err) { resolutionFailed = true; throw err; }` flag-and-rethrow (status.ts:31-41) is also a slightly convoluted error-handling shape — it re-throws without handling, which is fine per the exception rules (nothing is swallowed and the regression test at status.test.ts:212-234 proves the flag gates the suggestion correctly), but extracting resolution into a small helper that the outer catch can distinguish (e.g. a typed result or a dedicated error subclass) would read more clearly than a mutable boolean threaded across scopes.

### [NOTE] Duplicated `applyFixes`/`mergeFixResults` blocks in the `--yes` and confirmation branches

The two branches differ only by the confirmation prompt, yet both repeat `const fixResults = await Promise.all(dryRunResults.map((r) => checker.applyFixes(r))); result = mergeFixResults(fixResults, invokingPath);` verbatim (lines 272-273 and 275-276). Hoisting the two shared lines below the `if/else` (with the `if (!confirmed) return;` kept in its branch) would remove the duplication and the risk of the two paths drifting — the same drift-risk this slice's `buildAttributedViews` sharing comment explicitly warns about between CLI and MCP.

### [NOTE] MCP `workflow_check` repeats the attribute+merge pattern inline in all four branches

The diff extends the pre-existing inline `Promise.all(...map(async ({ view, worktree }) => attributeFindings(await checker.X(view), worktree)))` pattern to four copies (single-slice check/fix, all-slices check/fix) in `workflow_check`. The CLI side already generalized this into `runAttributed<T extends ConsistencyCheckResult>` (packages/cli/src/commands/check.ts:55-61, a good generic refactor); exporting that helper (or an equivalent) from core — the same module that already shares `mergeFixResults`/`buildAttributedViews` for exactly this "cannot drift between the two consumers" reason — would let MCP drop all four copies to `runAttributed(views, ...)` + one merge call.

### [PASS] Root-normalized dedup key is boundary-safe and correctly keeps the first-seen finding unmodified

I traced `replaceRoot` against the adversarial cases: sibling prefix (`/repo` vs `/repo-other` — no match, `after` is a non-separator so the literal prefix is copied through), repeated root occurrences in one string (both replaced), root at end-of-string (`after === undefined`), and empty root after separator strip (early return). The `\u0000ROOT\u0000` token normalization applies to the dedup key only, never mutating `location`/`description`, which the mergeCheckResults.ts doc comment states and the new core tests pin (including the boundary test that forces the real merge loop past the `results.length === 1` early return, and the "byte-identical single result" tests). `stripTrailingSeparator` export from worktree-overlay.ts is a clean, minimal exposure.

### [PASS] Per-view fix ordering fixes a real silent cross-checkout bug and is pinned by a disk-level test

The reordering (fix per view before merge; `mergeFixResults` sums `fixed` and concatenates `fixLog`/`fixErrors` without dedup, which is correct since each entry is a real write to a distinct file) addresses a genuine bug: `applyFixes` on a merged result would only write the first-seen checkout's file, because the deduped finding's `fixAction.filePath` is the first-seen path. The new integration test uses the real `ConsistencyChecker`/`ArtifactIntrospector` over real temp directories with only `FileProjectStore` mocked, asserts BOTH checkout files flipped on disk via independently computed line indices, and requires two `fixLog` entries — assertions that would pass under the old broken behavior if they only checked the displayed finding. I verified the fixture's assumptions against the real parsers: the frontmatter fields match `FRONTMATTER_SCHEMAS` for `tasks`/`slice-plan`, `PLAN_INDEXED_RE` matches the entry line, and the `entryLineIndex` convention (0-based raw line including frontmatter, matching `slicePlanParser.ts` `lineIndex`) is computed identically in the test. MCP parity is covered by the new `workflowTools.test.ts` case pinning `fixed`/`fixLog`/`fixErrors` surviving the merge from both views, and `project.test.ts`/`status.test.ts` were updated with the resolver change (removed-option tests replaced in the same commit — test-with, not test-after).

### [PASS] `resolutionFailed` gating verified; no remaining callers of the removed `worktree` resolver option

The new flag correctly distinguishes resolution failure from post-resolution `UserError`s: I confirmed the only `UserError` throws after resolution in this handler are the `--worktree`-related ones (status.ts:109-112, 130), the mutually-exclusive-options check (which fires before resolution and would show the suggestion — harmless, since it is a usage error and the suggestion path is gated on `resolutionFailed === true` only for errors thrown inside the inner try), and that the flag is set for non-`UserError` failures too (skipping the suggestion and falling through to `handleError`). Grep across `packages/` found no caller passing `worktree:` to `resolveProjectWorktree`, so the option removal breaks nothing; the explicit `--worktree <name>` flag still works post-resolution (verified by status.test.ts:135-156 and worktree-overlay.test.ts), and the new CWD-based `worktreeId` under explicit `--project` matches the D6 invoking-checkout semantics with the migrated-single-worktree case covered in both test files.

### Run Digest

- Response length: 8792 chars
- Response is newline-free: no
- Tool calls made: 44
- Tool calls failed: 0
- Stop reason: stop
- Reasoning characters: 39799
- `## Summary` located: yes
- `## Findings` located: yes
- Finding-shaped matches — whole response: 7
- Finding-shaped matches — inside fences: 0
- Finding-shaped matches — in findings section: 7
- Finding-shaped matches — surviving validation: 7
