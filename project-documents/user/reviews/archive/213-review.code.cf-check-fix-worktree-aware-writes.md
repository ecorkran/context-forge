---
docType: review
layer: project
reviewType: code
slice: cf-check-fix-worktree-aware-writes
targetKind: slice
rulesSource: project
project: context-forge
verdict: CONCERNS
verdictSource: stated
sourceDocument: project-documents/user/slices/213-slice.cf-check-fix-worktree-aware-writes.md
aiModel: claude-opus-5-5
status: complete
dateCreated: 20261005
dateUpdated: 20261005
reviewedSha: ec7f752e961b60dc46d20adfaeecf97cda904979
toolsGiven: [read_file, list_files, grep]
toolCallsMade: 5
diffTruncated: false
durationSeconds: 83.3
squadronVersion: 0.18.4
findings:
  - id: F001
    severity: concern
    category: error-handling
    summary: "A git failure in a later checkout during apply loses the report of earlier commits"
    location: "packages/core/src/introspection/routedFixes.ts:290-301"
  - id: F002
    severity: concern
    category: design
    summary: "Fix orchestration is duplicated between the CLI and the MCP tool"
    location: "packages/mcp-server/src/tools/workflowTools.ts:262-298"
  - id: F003
    severity: note
    category: typing
    summary: "Non-null assertions on `fixAction` in new code"
    location: "packages/core/src/introspection/routedFixes.ts:60"
  - id: F004
    severity: note
    category: documentation
    summary: "`subjectIndex` doc says \"never parsed from a label\", but several values come from filenames"
    location: "packages/core/src/introspection/types.ts:262-268"
  - id: F005
    severity: note
    category: maintainability
    summary: "`ConsistencyChecker.fix()` / `fixAll()` no longer have production callers"
    location: "packages/core/src/introspection/ConsistencyChecker.ts:202-214"
  - id: F006
    severity: note
    category: conventions
    summary: "Fallback display text for a missing owner"
    location: "packages/cli/src/output/fixReport.ts:15"
  - id: F007
    severity: note
    category: dry
    summary: "Duplicate fix-error loop in `printCheckOutput`"
    location: "packages/cli/src/output/checkReport.ts:96-112"
  - id: F008
    severity: note
    category: testing
    summary: "Test helpers shared across packages through relative paths into `core/tests`"
    location: "packages/core/tests/helpers/gitWorktreeFixture.ts"
  - id: F009
    severity: pass
    category: testing
    summary: "Commit scoping, rollback, and real-git test coverage"
    location: "packages/core/tests/introspection/routedFixes.test.ts"
---

# Review: code — slice 213

**Verdict:** CONCERNS
**Model:** claude-opus-5-5

## Findings

### [CONCERN] A git failure in a later checkout during apply loses the report of earlier commits

`applyFixPlan` applies one plan entry at a time. Each non-invoking entry first calls `gateByReadiness`, which calls `checkoutReadiness` (`packages/core/src/git/checkoutReadiness.ts:58-68`). Its `rev-parse --git-path …` and `status --porcelain` calls are not wrapped, and each has a 60s `FIX_GIT_TIMEOUT_MS` timeout. If one of them throws or times out for entry N, entries before N have already been written and possibly committed into other checkouts, but the exception discards the per-view results. The CLI only prints the error through `handleError`. MCP returns `errorResult` (`packages/mcp-server/src/tools/workflowTools.ts:301-303`). Neither tells the user which commits landed. A hanging lock or hook is exactly the failure D5a is meant to cover, and here it aborts the whole run instead of deferring that one checkout. Suggested fix: catch failures from `gateByReadiness` inside `applyPlanEntry` and turn them into deferrals for that view only. A new reason such as `NOT_A_CHECKOUT`/`CHECKOUT_BUSY` or a dedicated one would work, with the error text in `detail`. Then the merged result always reaches the caller. Add a test that makes `checkoutReadiness` reject for the second view.

### [CONCERN] Fix orchestration is duplicated between the CLI and the MCP tool

The MCP handler repeats the logic in `packages/cli/src/commands/check.ts:172-196` and `runRoutedFix`:
- the multi-view `resolveInvokingCheckout` step
- the `scopeViews` mapping (`fileSlice: \`${index}-slice\``)
- the `runCheck` choice between `check` and `checkAll`
- the "No projectPath" guard
- zipping views with results for `planRoutedFixes`, then calling `applyFixPlan`

The comment at line 259 says the two callers share code "so the … rule cannot drift", yet this new path is copied. The `-slice` suffix string is now built in two places, which breaks the CLAUDE.md rule against scattering comparison values. Suggested fix: add a core helper, for example `scopeViewsForSlice(views, sliceIndex)` plus `planFromCheck(project, views, runCheck, invokingPath)`. The CLI should keep only the preview and prompt.

### [NOTE] Non-null assertions on `fixAction` in new code

`fixRelPath` (`finding.fixAction!.filePath`) and `routeView` (`finding.fixAction!.subjectIndex`, around line 143) rely on callers having filtered by `f.fixable && f.fixAction`. Under the project's TypeScript rules, this is the same smell as an `as` assertion. A type such as `type FixableFinding = ConsistencyFinding & { fixAction: NonNullable<ConsistencyFinding['fixAction']> }`, narrowed by a type guard inside `fixableOf`, would let the compiler enforce the invariant.

### [NOTE] `subjectIndex` doc says "never parsed from a label", but several values come from filenames

The plan-status, initiative-plan-status, and frontmatter-schema rules set `subjectIndex` through `ConsistencyChecker.extractFileIndex` (`ConsistencyChecker.ts:1318`), which runs a regex on the basename. Filename indices are structured by convention, so using them is reasonable, but the comment should say so. `extractFileIndex` also splits on `/` only, so a Windows path would return `null` and the fix would silently route to the primary checkout. That was harmless before; now it affects routing.

### [NOTE] `ConsistencyChecker.fix()` / `fixAll()` no longer have production callers

The CLI and MCP now go through `checkAll`/`check` + `applyFixPlan`. These methods still return `deferred: []` and `commits: []` from an unrouted write, which invites a future caller to skip routing by accident. Consider removing them, or adding a note that they bypass worktree routing. `mergeFixResults` is in a similar position and is only used internally by `applyFixPlan`.

### [NOTE] Fallback display text for a missing owner

`d.owner?.name ?? 'another checkout'` produces a plausible-sounding label. `routeView` always attaches `owner` for `NOT_OWNER` when the owner view has a worktree, so a missing value means something unexpected happened. Under the "no silent fallback values" rule, an obviously placeholder value such as `'?'` (already used by `tag()`) fits better.

### [NOTE] Duplicate fix-error loop in `printCheckOutput`

Both branches print `fixRes.fixErrors` in the same way. Moving the loop after the if/else removes the duplication.

### [NOTE] Test helpers shared across packages through relative paths into `core/tests`

The CLI and MCP tests import `../../../core/tests/helpers/gitWorktreeFixture.js`, so they depend on another package's test tree. Separately, `routedFixes.test.ts` exports helpers (`designPath`, `createRoutedSetup`, and others) that nothing imports, and `createProjectFor` (line 448) reads the module-level `setup`. Drop the unused exports, and pass state into `createProjectFor` explicitly instead.

### [PASS] Commit scoping, rollback, and real-git test coverage

`commitPathsIfChanged` passes the pathspec to both `add` and `commit`, so files the user had staged stay out of the commit, and `restorePathsToHead` undoes only the written paths. Tests check this against real git: an unrelated staged file stays staged, a rejecting hook is reported as `COMMIT_FAILED` with the hook's output as `detail`, and a failed restore produces exactly one `fixErrors` entry. Each spy-based "no git process" assertion is paired with a check that the spy does fire in the multi-checkout case. Every rule is checked to set `subjectIndex`, and the test that every `DeferReason` has a label guards against drift.


### Run Digest

- Response length: 7068 chars
- Response is newline-free: no
- Tool calls made: 5
- Tool calls failed: 0
- Stop reason: end_turn
- Output budget: backend default
- System prompt: preset+append
- Settings sources: project
- Reasoning characters: 0
- Effort: backend default
- Turns: not computed
- Tokens — prompt / cached / completion / reasoning: not computed / not computed / not computed / not computed
- Duration: 83.3 s
- `## Summary` located: yes
- `## Findings` located: yes
- Finding-shaped matches — whole response: 9
- Finding-shaped matches — inside fences: 0
- Finding-shaped matches — in findings section: 9
- Finding-shaped matches — surviving validation: 9
