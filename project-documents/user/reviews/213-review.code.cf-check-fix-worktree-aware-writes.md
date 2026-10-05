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
aiModel: minimax/minimax-m3
status: complete
dateCreated: 20261005
dateUpdated: 20261005
reviewedSha: c881f68b8bbe482d6c2f5778522bd28f54ea05e0
toolsGiven: [read_file, list_files, grep]
toolCallsMade: 26
diffTruncated: false
turns: 20
promptTokens: 1342389
cachedTokens: 1171091
completionTokens: 9095
reasoningTokens: 0
durationSeconds: 214.1
squadronVersion: 0.18.4
findings:
  - id: F001
    severity: concern
    category: type-safety
    summary: "`as any` / untyped `as` slips into the test mock"
    location: "packages/cli/tests/commands/check-worktree-attribution.test.ts:25-29"
  - id: F002
    severity: concern
    category: correctness
    summary: "Print code can show 'uncommitted' instead of INVOKING_NOTE for the invoking view"
    location: "packages/cli/src/output/fixReport.ts:84-91"
  - id: F003
    severity: concern
    category: code-quality
    summary: "`applyFixes` double-wraps result in `onlyFixable`"
    location: "packages/core/src/introspection/routedFixes.ts:273"
  - id: F004
    severity: concern
    category: correctness
    summary: "`applyPlanEntry` decrement of `fixed` is not robust to partial fixErrors"
    location: "packages/core/src/introspection/routedFixes.ts:289-291"
  - id: F005
    severity: concern
    category: correctness
    summary: "`gitExec` timeout is shared but timeoutMs is not always forwarded"
    location: "packages/core/src/guides/gitExec.ts:155-189 and packages/core/src/git/checkoutReadiness.ts"
  - id: F006
    severity: concern
    category: correctness
    summary: "Project rule fragments now use parsed filename index, which can collide"
    location: "packages/core/src/introspection/ConsistencyChecker.ts:803, 1046, 1241-1243"
  - id: F007
    severity: concern
    category: correctness
    summary: "`entry.result.findings` after gate is not used to re-derive the kept subset's plan time"
    location: "packages/core/src/introspection/routedFixes.ts:259-275"
  - id: F008
    severity: concern
    category: test-quality
    summary: "Test asserts the absence of the worktree key on fixLog entries"
    location: "packages/cli/tests/commands/check-worktree-fix.test.ts:170"
  - id: F009
    severity: note
    category: error-handling
    summary: "`console.error` is used for git-timeout logging outside the log channel"
    location: "packages/core/src/introspection/routedFixes.ts:119, 218, 233"
  - id: F010
    severity: note
    category: code-quality
    summary: "`runRoutedFix` swallows the original `invokingPath` from the caller"
    location: "packages/cli/src/commands/check.ts:170-183"
  - id: F011
    severity: note
    category: correctness
    summary: "`formatDateProject` is used as the date stamp default in `applyFixPlan`"
    location: "packages/core/src/introspection/routedFixes.ts:301-307"
  - id: F012
    severity: note
    category: correctness
    summary: "`extractFileIndex` returns `null` for plan files with no leading digits"
    location: "packages/core/src/introspection/ConsistencyChecker.ts (private static)"
  - id: F013
    severity: pass
    category: test-coverage
    summary: "Test coverage matches design"
    location: "packages/core/tests/introspection/routedFixes.test.ts"
  - id: F014
    severity: pass
    category: correctness
    summary: "Routing logic in `routeView` is correct"
    location: "packages/core/src/introspection/routedFixes.ts:148-172"
  - id: F015
    severity: pass
    category: code-quality
    summary: "`DeferReason` is a single source of truth"
    location: "packages/core/src/introspection/types.ts:296-307"
  - id: F016
    severity: pass
    category: code-quality
    summary: "`applyFixes` returns include the new fields with safe defaults"
    location: "packages/core/src/introspection/ConsistencyChecker.ts:251"
---

# Review: code — slice 213

**Verdict:** CONCERNS
**Model:** minimax/minimax-m3

## Findings

### [CONCERN] `as any` / untyped `as` slips into the test mock

The new mock for `@context-forge/core/node` only re-exports `scopeCheck` from the actual module, then shadows everything else with stubs. The original had no `any` and the new one is OK on that front, but the structure invites the next edit to spread `as any` across the surface. The mocking pattern itself (`vi.importActual` + a partial override) is the right shape — just make sure future changes keep typing.

### [CONCERN] Print code can show 'uncommitted' instead of INVOKING_NOTE for the invoking view

`printRoutedFixResult` decides the note with `worktree?.path === result.projectPath`. For an invoking view whose worktree record has no `worktreePath` (so `worktree.path === undefined`), the comparison `undefined === '/some/path'` is false and the note prints the generic `'uncommitted'` instead of `INVOKING_NOTE`. This won't occur in normal flow because a worktree entry that contributed a view always has a path, but the comment in `fixOwnership.ts` notes a worktree may share the primary root when `worktreePath` is unset — a case worth covering in tests and either comparing via the worktree id or using a stronger identifier.

### [CONCERN] `applyFixes` double-wraps result in `onlyFixable`

`entry.result` is already the `onlyFixable`-filtered result from `planRoutedFixes`. `applyPlanEntry` then calls `checker.applyFixes(onlyFixable(entry.result, findings), dateStamp)`, wrapping it in `onlyFixable` a second time. Functionally harmless (it just spreads and overrides `findings`), but redundant and obscures the intent that `findings` here is the post-gating list, not the post-routing list. Cleaner: `checker.applyFixes({ ...entry.result, findings }, dateStamp)`.

### [CONCERN] `applyPlanEntry` decrement of `fixed` is not robust to partial fixErrors

When commit fails and restore succeeds, `fixed -= fixLog.length` removes every log entry's count. But `fixLog` may include entries whose underlying apply had already thrown (no — `applyFixes` only pushes to `fixLog` on success) and may include entries for findings that did not end up in the written set. In practice, the test suite (case 5) confirms the count is `0` after a hook-rejected commit, which is the expected outcome. Still, the count is computed from the post-apply `fixed`, which already includes any later-deferred-but-written ones — and `fixLog` is the source of truth, so this works. The math happens to be right but the reasoning is subtle; a comment would help.

### [CONCERN] `gitExec` timeout is shared but timeoutMs is not always forwarded

`FIX_GIT_TIMEOUT_MS` is 60s. The new `commitPathsIfChanged` and `restorePathsToHead` accept `opts` and pass `{ timeoutMs: FIX_GIT_TIMEOUT_MS }` to their internal `gitExec` calls. The `checkoutReadiness` also passes it. The chain is consistent for the new code paths. However, the original `commitPathIfChanged` (which now delegates) lost its `opts` parameter — existing callers that may have set a timeout are silently using the default. Verify there are no existing callers of `commitPathIfChanged` that relied on timeout override; if there are, the change preserves behavior only because no one was setting a timeout.

### [CONCERN] Project rule fragments now use parsed filename index, which can collide

`rulePlanStatusVsEntries`, `ruleInitiativePlanStatusVsEntries`, and `ruleFrontmatterSchema` use `ConsistencyChecker.extractFileIndex(filePath)` to set `subjectIndex`. The initiative-plan case yields `1` for `001-initiative-plan.test.md` (the test asserts this), but in production an initiative plan at index 100 would yield `100` — which then would resolve to whichever worktree range contains 100. That is a real coupling: a frontmatter-schema fix on the initiative plan would be routed to that worktree's range owner, even though the fix target is the initiative-plan file itself. This may be intentional (the fix lives wherever the file is, but routing says "owner by index"), but it is worth a test confirming the case where the file lives in a checkout whose range does NOT contain the index.

### [CONCERN] `entry.result.findings` after gate is not used to re-derive the kept subset's plan time

`applyPlanEntry` does a second readiness gate right before writing, but it never re-checks the file-existence/dirty path against `entry.result.findings` (the original routed list). The second gate operates on the `findings` (post-first-gate) list, which is what `entry.result.findings` already is in this code path — so the variable naming is confusing. The logic is correct, but a reviewer (or a future maintainer) will read `let findings = entry.result.findings` and assume the gating hasn't happened yet. Rename for clarity.

### [CONCERN] Test asserts the absence of the worktree key on fixLog entries

`expect(result.fixLog.some((e) => 'worktree' in e)).toBe(false)` — this checks the key is absent, not just undefined. Fine, but the new `FixLogEntry.worktree` is an optional property, not a discriminator. JSON output that has `"worktree": undefined` would still satisfy this. The contract is "absent from the JSON", not "absent from the type". A stronger assertion would be `expect('worktree' in e).toBe(false)` on the parsed JSON object (which is what's done) — this is actually correct because JSON.stringify drops undefined values, and JSON.parse never produces undefined. So the assertion is meaningful, but a brief comment explaining why would be useful.

### [NOTE] `console.error` is used for git-timeout logging outside the log channel

`gateByReadiness` and `commitViewWrites` use `console.error` directly. The CLI tests `vi.spyOn(console, 'error').mockImplementation(...)` to silence them. This is a pre-existing pattern in the codebase, but the new code adds more `console.error` calls than the original. Consider whether these should be structured logs (with a level) rather than raw stderr writes — they will interleave with user-facing output, and on a quiet install path the user will see "cf check --fix: readiness check failed in /path: <stack>".

### [NOTE] `runRoutedFix` swallows the original `invokingPath` from the caller

The caller computes `invokingPath = resolveOperationPath(project, worktreeId) ?? project.projectPath` and passes it as `args.invokingPath`. Inside `runRoutedFix`, `resolveFixInvokingPath` may throw and discard that value. For 2+ views it goes through `resolveInvokingCheckout` instead, which is the right path. For 1 view, it uses `args.invokingPath`. But the `multi = scope.views.length > 1` check above uses the OUTER `invokingPath` (before re-resolution) for the `confirm` prompt path, while the `applyFixPlan` call uses the re-resolved `invokingPath`. The merge result is consistent, but two variables with the same name live in one function — easy to mis-edit. A comment explaining the replacement or using different names would help.

### [NOTE] `formatDateProject` is used as the date stamp default in `applyFixPlan`

`applyFixPlan(checker, plan, dateStamp = formatDateProject())` — `dateStamp` is computed once per `applyFixPlan` call but then passed to every `applyFixes` call. Good. The default is `formatDateProject()` which reads the current project date. If the run takes more than a day (unlikely for `cf check --fix` but possible across many checkouts), two different write timestamps could be applied. Not a real concern in practice; the design intentionally shares one stamp.

### [NOTE] `extractFileIndex` returns `null` for plan files with no leading digits

A plan file named `slices.main.md` (no leading index) returns `null` for `subjectIndex`. The `routeView` then defers as `OWNER_UNRESOLVED` because no range contains `null`. This is a degenerate case but worth a test if any production documents use unindexed plan filenames.

### [PASS] Test coverage matches design

The new test suite covers: ownership single/multi/overlapping, dirty paths, detached HEAD, in-progress merge, worktree path missing, dirty-between-plan-and-apply, hook rejection, restore failure, readiness throw mid-run, and the single-checkout fast path. The fixture helper `gitWorktreeFixture.ts` is a real-git harness (not child_process mock) and is itself smoke-tested. The CLI test exercises the full flow against real git, and the MCP test mirrors it.

### [PASS] Routing logic in `routeView` is correct

The four-branch decision (null owner, same view, owner has the file, owner lacks the file) implements D1–D3 correctly. The `samePath` helper and the trailing-separator tolerance handle the test case where `projectPath` has a trailing slash.

### [PASS] `DeferReason` is a single source of truth

The `as const` object and derived type are the idiomatic pattern (per project conventions) and are exported only from one place. The CLI labels table `DEFER_REASON_LABELS` in `fixReport.ts` is typed `Record<DeferReasonValue, ...>`, so adding a new reason is a compile error there too — exactly the "scattered comparison values" anti-pattern the project rules call out. The test "every DeferReason value has a display label" guards this invariant.

### [PASS] `applyFixes` returns include the new fields with safe defaults

The signature change `return { ...checkResult, fixed, fixLog, fixErrors, deferred: [], commits: [] }` keeps the function usable for any external caller of `applyFixes` (e.g. via `checker.fix()` which the public API still exposes). The defaults match `ConsistencyFixResult`'s contract.

### Run Digest

- Response length: 11499 chars
- Response is newline-free: no
- Tool calls made: 26
- Tool calls failed: 0
- Stop reason: stop
- Output budget: 512000 tokens
- System prompt: custom
- Settings sources: n/a (non-SDK)
- Reasoning characters: 0
- Effort: backend default
- Turns: 20
- Tokens — prompt / cached / completion / reasoning: 1342389 / 1171091 / 9095 / 0
- Duration: 214.1 s
- `## Summary` located: yes
- `## Findings` located: yes
- Finding-shaped matches — whole response: 16
- Finding-shaped matches — inside fences: 0
- Finding-shaped matches — in findings section: 16
- Finding-shaped matches — surviving validation: 16
