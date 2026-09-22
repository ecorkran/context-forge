---
docType: review-resolution
layer: project
reviewFile: 926-review.code.worktree-scoped-validate-check-attribution-and-scope-reporting.md
reviewType: code
slice: worktree-scoped-validate-check-attribution-and-scope-reporting
project: context-forge
reviewVerdict: CONCERNS
resolution: ADDRESSED
reviewedSha: b7f892e600f527a1886408773f73f5b1852f6f87
resolvedSha: 1289ae8
shaSource: frontmatter
judgeModel: null
dateCreated: 20260922
dateUpdated: 20260922
findingStatuses:
- id: F001
  status: fixed
  note: view-building collapsed into buildAttributedViews in core, shared by CLI and MCP
- id: F002
  status: fixed
  note: real defect confirmed by execution; mergeCheckResults takes an explicit invokingPath, fixture no longer hardcodes the asserted value
- id: F003
  status: fixed
  note: stale "silently skipped" JSDoc corrected
- id: F004
  status: deferred
  note: filed as issue #101; pre-existing resolution semantics shared across commands
- id: F005
  status: fixed
  note: type assertion replaced with a narrowing predicate
---

# Resolution: 926 code review (r1)

Verdict **CONCERNS**, `reviewedSha` b7f892e, matching HEAD at review time.
All five actionable findings addressed in commit `1289ae8`; one deferred
to its own issue with reasoning below. The six PASS findings need no
action.

## F001 — view-building duplicated between CLI and MCP (concern) → fixed

Correct, and it was the exact failure mode the `mergeCheckResults`
extraction existed to prevent. `const attributable = worktrees.length > 1`
and the `ProjectView` construction appeared nearly verbatim in
`check.ts` and `workflowTools.ts`, including parallel comments explaining
the migrated-`default` subtlety. Two copies of an invariant that a future
change could update in only one place.

Collapsed into `buildAttributedViews(project)` in
`packages/core/src/introspection/mergeCheckResults.ts`, beside the merge
it feeds. Both consumers now call it. The count-not-presence rationale
lives in one doc comment.

## F002 — vacuous projectPath test (concern) → fixed, and it was hiding a real defect

The most valuable finding in the review. The reviewer could not read the
design document (excluded from scope) and said so, reasoning from the
code alone — and was right on both counts.

**The test was vacuous.** `resultWith()` hardcoded
`projectPath: '/repo/main'` into every mock result, so
`expect(...projectPath).toBe('/repo/main')` could not fail regardless of
what production code produced.

**It was masking a defect.** Verified by executing the real merge rather
than reading it:

```
merge([alpha, beta]).projectPath = /repo/wt-alpha
```

`applyWorktreeOverlay` sets each view's `projectPath` to its worktree
path; `mergeCheckResults` took `results[0].projectPath`. So the top-level
value named the first **registered** worktree, not the invoking checkout.
Invoking from beta reported alpha's path.

D6 states `projectPath` "keeps its literal meaning (the invoking
checkout)". The implementation did not honor it, and this slice's own
standard — a test that passes against unfixed code is not a test —
condemns the fixture that hid it.

Fixed by giving `mergeCheckResults` an explicit `invokingPath` parameter,
defaulted so omitting it preserves the previous behavior. Both call sites
pass it. `check.ts` was additionally discarding `worktreeId` from
`resolveProjectWorktree` — the same shape as the #88 bug this slice
fixed elsewhere — so it now destructures and applies it.

The fixture takes a per-view path, and both the repaired D6 test and a
new test naming the specific wrong answer (`/repo/wt-alpha`) were
verified to fail against the old merge before being accepted.

## F003 — stale JSDoc (note) → fixed

Accurate. The `validateFrontmatterFiles` doc comment still read
"everything else is silently skipped", describing precisely the behavior
#92/#96 removed. The comment on `resolveExplicitPaths` above it had been
updated; this one was missed. Rewritten to describe reporting via
`pathResults`.

The related nit about in-place outcome mutation is acknowledged and left
as-is: the provisional-then-downgrade flow is documented at the point it
happens, and a returned-fresh-array rewrite would be churn without a
behavior change.

## F004 — `--project` validates the project root (note) → deferred to #101

Verified and accurate. `resolveProjectWorktree`'s explicit-flag branch
sets `worktreeId` only when `opts.worktree` is supplied, and `validate`
registers no `--worktree` option — only `cf status` does. So
`cf validate frontmatter --project foo` from inside a worktree resolves
no worktree and validates the project root.

Not fixed here, and the reviewer's own framing is why: this is
pre-existing resolution behavior shared by `check`, `arch` and others.
Slice 926 neither introduced nor worsened it. Fixing it properly means
either registering `--worktree` across commands or making the
explicit-flag path consult CWD — the latter changes shared resolution
semantics for every command and deserves its own review, not a fold-in to
an unrelated slice.

Filed as [#101](https://github.com/ecorkran/context-forge/issues/101)
with the mechanism, the three candidate directions, and the note that
#88's stated goal now holds for CWD-resolved invocation but not the
explicit-flag form.

## F005 — type assertion (note) → fixed

Correct per the project's TypeScript rules, and the reviewer identified
the real cost: the cast silently widens if a new skip outcome is added
without a `SKIP_REASON` entry. Replaced with an `isSkipped` type
predicate, so that case now fails at compile time instead of rendering
`undefined` at runtime.

## Verification

- `pnpm -r build`, `pnpm -r typecheck`, `pnpm -r test` all clean.
- core 1231, cli 591, mcp 206 passing.
- Both F002 tests confirmed to fail against the pre-fix merge, showing
  `/repo/wt-alpha` where `/repo/main` belongs.
- `cf check --json` re-verified byte-identical against the published
  0.16.0 build after the merge signature change; no finding carries a
  `worktree` key in a single-checkout project.
