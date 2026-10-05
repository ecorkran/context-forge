---
docType: slice-design
slice: cf-check-fix-worktree-aware-writes
project: context-forge
parent: user/architecture/200-slices.developer-onboarding.md
dependencies: [207-slice.worktree-resolved-project-view, 926-slice.worktree-scoped-validate-check-attribution-and-scope-reporting, 927-slice.worktree-dedup-and-explicit-project-worktree-resolution]
interfaces: []
dateCreated: 20261004
dateUpdated: 20261004
status: complete
---

# Slice Design: cf check --fix Worktree-Aware Writes

## Overview

`cf check` builds one view per registered worktree, whichever checkout it runs from (`buildAttributedViews`, `mergeCheckResults.ts:31-42`). Each view's `projectPath` is that worktree's own checkout, and every `fixAction.filePath` is built from it. Slice 927 (D5, "#100 — Fix Path") made this explicit: fixes are applied per view, so `--fix` writes into **every** checkout that has a fixable finding.

That is correct file-by-file but wrong for the people and agents working in the other checkouts:

1. **Surprise dirty state.** Run `cf check --fix` from the primary checkout and worktree B's working tree picks up uncommitted edits nobody there made.
2. **Fixes to stale copies.** Each checkout holds its own copy of every document, on its own branch. Worktree B's copy of a slice owned by worktree A is a stale snapshot that catches up when branches merge. Rewriting that copy from B's stale state produces an edit that can diverge from A's, and that later conflicts or regresses on merge.

This slice makes `--fix` ownership-aware. Each fix is applied once, in the checkout that owns the fix's subject. When that checkout is not the one `cf check` was run from, the write is committed there, scoped to the fixed paths. Stale copies are left alone and reported. `--fix` stays a one-command cleanup.

This partially supersedes 927 D5: fix *results* still merge through `mergeFixResults`, but fixes are no longer applied in every view.

## Value

- **No surprise dirty trees.** Another worktree's `git status` stays clean after someone else runs `cf check --fix`. Fixes that land there arrive as one clearly labelled commit.
- **No merge hazards.** Stale copies are never rewritten, so a branch never carries an edit that fights the owner's version at merge time.
- **Still one command.** Nothing is rejected, and nobody has to `cd` into another checkout to finish the cleanup. The output says what was fixed where, what was committed, and what was left alone and why.
- **CLI and MCP parity.** `workflow_check` with `fix: true` goes through the same core routing.

## Technical Scope

### Included

1. **Subject index on fix actions.** Every fixable rule records the numeric index of the document or plan entry its fix is about (`fixAction.subjectIndex`).
2. **Ownership resolution** (pure, in core). This maps a subject index to the owning checkout using worktree index ranges.
3. **Fix planning.** Across all view results, keep each fix only in its owner's view. Classify the rest as deferred, with a structured reason. Check git readiness for writes into non-invoking checkouts.
4. **Fix application.** Apply the planned fixes. In each non-invoking checkout that received writes, make one scoped commit.
5. **Result reporting.** Log entries are attributed to a worktree. The result lists deferred fixes and the commits made. CLI text output is grouped by checkout.
6. **Consumers.** CLI `cf check --fix` (single-slice and all-slices), MCP `workflow_check` (`fix: true`), and the `workflow.auto_fix` path all use the core plan-then-apply API.

### Excluded

- **Single-checkout projects** (no worktrees, or exactly one). Behavior is byte-identical to today. Nothing is committed and nothing is deferred.
- **The invoking checkout's own writes.** These stay uncommitted, as today. The user is standing in that checkout and sees the diff.
- `cf check --set-review-none` (`setReviewNoneAction`). This is a separate PM-only writer and is not part of the fix pipeline.
- `cf validate frontmatter --fix`. It already fixes only the invoking checkout.
- Finding detection, dedup, and attribution (slices 926 and 927) are unchanged. Every view is still checked and every finding is still reported.
- Pushing. No commit made by this slice is ever pushed.

## Dependencies

### Prerequisites

- **207**: `resolveProject()` and the per-worktree `projectPath` overlay that gives each view its own checkout root.
- **926**: `FindingWorktree` attribution on findings.
- **927**: `runAttributed`, `mergeCheckResults`, `mergeFixResults`, and per-view application of fixes from the pre-merge dry run.

All are complete.

**Architectural anchor.** The slice plan places 213 in the 200 band, but its decisions trace to the 160 architecture (the consistency checker and its fix pipeline) and the 180 architecture (worktree ranges and per-checkout views). Cross-checkout writes follow 200-arch's "never destructive — if unsure, ask or skip": every write into another checkout is preceded by readiness guards that skip on any doubt. The only state change is an additive, revertable, never-pushed commit, and a failed commit restores what it touched. PM decided 20261004 that 213 stays in the 200 band.

### Interfaces Required

- `ProjectData.worktrees[]`: `id`, `name`, `indexRange`, `worktreePath` (`types/worktree.ts`).
- `isInIndexRange` (`utils/worktree-overlay.ts`).
- `gitExec`, `isGitRepo`, and `commitPathIfChanged` (`guides/gitExec.ts`).
- `ConsistencyChecker.applyFixes` and the two writers in `writers/markdownWriter.ts`.

## Architecture

### Component Structure

```
packages/core/src/introspection/
├── fixOwnership.ts      NEW  resolveFixOwner()          pure: subject index → owning checkout
├── routedFixes.ts       NEW  planRoutedFixes()          route + git readiness → FixPlan
│                             applyFixPlan()             write, commit non-invoking checkouts → ConsistencyFixResult
├── ConsistencyChecker.ts     rules set fixAction.subjectIndex; applyFixes unchanged
├── mergeCheckResults.ts      mergeFixResults also merges deferred + commits
└── types.ts                  subjectIndex, FixLogEntry.worktree, DeferredFix, CheckoutCommit, DeferReason

packages/core/src/git/
└── checkoutReadiness.ts NEW  checkoutReadiness()        on a branch? merge/rebase in progress? path clean?

packages/core/src/guides/gitExec.ts
├── commitPathsIfChanged()    NEW multi-path form; commitPathIfChanged delegates to it
└── restorePathsToHead()      NEW git restore of written paths after a failed commit (D5a)

packages/cli/src/commands/check.ts          dry run → planRoutedFixes → preview/prompt → applyFixPlan
packages/mcp-server/src/tools/workflowTools.ts  checkAll per view → planRoutedFixes → applyFixPlan
```

`ConsistencyChecker.applyFixes` keeps its signature. `applyFixPlan` calls it once per view, with that view's routed subset of findings.

### Data Flow

```
buildAttributedViews(project)                  one view per checkout (unchanged)
    ↓
runAttributed(views, checker.checkAll)          per-view dry-run results, findings carry worktree + subjectIndex
    ↓
planRoutedFixes(project, viewResults, invokingPath)
    ├─ per fixable finding: resolveFixOwner(project, subjectIndex, views)
    │     owner == this view           → keep
    │     owner != this view           → defer NOT_OWNER (stale copy)
    │     owner view lacks target file → keep in the views that have it (no owner copy to diverge from)
    │     no owner resolvable          → defer OWNER_UNRESOLVED
    ├─ per non-invoking checkout with kept fixes: checkoutReadiness(checkout, targetPaths)
    │     detached HEAD / merge|rebase|cherry-pick in progress → defer all its fixes (CHECKOUT_BUSY | DETACHED_HEAD)
    │     target path already modified                         → defer that fix (FILE_DIRTY)
    └─ FixPlan { perView: [{ view result subset, commit: boolean }], deferred: DeferredFix[] }
    ↓
CLI: print the plan (grouped by checkout), prompt y/N unless --yes  |  MCP: no prompt
    ↓
applyFixPlan(checker, plan, dateStamp)
    ├─ re-run checkoutReadiness per non-invoking checkout; newly failing fixes → deferred
    ├─ checker.applyFixes(subset, dateStamp) per view     same dateStamp across all views
    ├─ non-invoking views with writes: commitPathsIfChanged(checkout, writtenRelPaths, COMMIT_MESSAGE)
    │     on failure: git restore written paths → deferred COMMIT_FAILED
    └─ mergeFixResults(...) → ConsistencyFixResult { fixLog (with worktree), deferred, commits, fixErrors }
```

### State Management

The slice keeps no new persisted state. Ownership is derived from `worktrees[].indexRange` at fix time. Git state is read immediately before planning. The only side effects are the markdown writes, as today, and the scoped commits in non-invoking checkouts.

## Technical Decisions

### D1 — Ownership is per fix subject, not per file

A fix's owner is the checkout that owns the **subject** of the fix, not the checkout that owns the file the fix writes. For example, a `task-vs-plan` fix for slice 931 writes a checkbox into `900-slices.*.md`. The plan file is shared territory, but the entry belongs to whichever worktree's range contains 931. That worktree checks off its own entries on its own branch, and they merge back. File-level ownership would route every plan-checkbox fix to the plan's owner and break this.

Subject index per rule:

| Rule | Subject index |
|---|---|
| `task-vs-plan`, `plan-vs-frontmatter` (both fixes) | slice index of the plan entry |
| `frontmatter-vs-computed`, `task-file-status` | slice index |
| `plan-status-vs-entries` | slice plan index |
| `arch-status-vs-plans`, `initiative-entry-vs-arch` (both fixes), `initiative-plan-status-vs-entries` | architecture / initiative index |
| frontmatter-schema | the document's own leading index, or `null` when its filename has none |

The index is a structured field set by the rule (`fixAction.subjectIndex: number | null`). It is never parsed back out of `location` or `description`, because user-visible labels are not logical structure.

### D2 — Owner resolution

`resolveFixOwner(project, subjectIndex, views)` returns the owning view or `null`:

1. **Single checkout** (no worktrees, or one): the only view. This short-circuits everything, matching `getWorktreeIndexRange`'s "a lone worktree has nothing to isolate."
2. **Exactly one worktree's `indexRange` contains the index** (`isInIndexRange`): that worktree's view.
3. **No range contains it, or the index is `null`** (e.g. 900 maintenance docs, 000 notes, unindexed guides): the view whose checkout is the primary `project.projectPath`. This is a stated rule, not a fallback. Unclaimed documents live with the project's home checkout.
4. **More than one range contains it** (overlap, already reported by `findOverlaps`), or rule 3 finds no primary view: `null`, and the fix is deferred `OWNER_UNRESOLVED`.

`rangeOverride` does not affect ownership. It only suppresses out-of-range warnings for a worktree's active slice. A document created under override, outside the worktree's range, is caught by the "owner lacks the file" rule below.

**Owner lacks the target file.** If the owner's checkout has no file at the fix's relative path, there is no owner copy to diverge from. The fix applies in each view that reported it. This covers a new document that so far exists only on one worktree's branch.

### D3 — Non-owner findings are deferred, not fixed

A non-owner finding is either a duplicate of the owner's finding, which the owner fix covers, or a symptom of a stale copy, which the owner's branch resolves on merge. Either way, writing it is wrong. The finding is still reported, because 926/927 detection is unchanged, and its fix is listed under `deferred` with reason `NOT_OWNER` and the owner's name.

### D4 — Writes into non-invoking checkouts are committed

This is the main UX decision. Three options were considered:

- **Write, leave uncommitted, report clearly.** Rejected. This is today's surprise dirty state, just better labelled.
- **Do not write; tell the user to run `--fix` there.** Rejected. That is manual intervention, which the slice plan rules out.
- **Write and commit, scoped to the written paths.** Chosen. The other checkout receives a self-describing commit instead of a dirty tree. This follows existing precedent: `cf guide update` commits its own writes through `commitPathIfChanged`, and `--fix` cleanups are already committed by hand with the same message.

The commit message is defined once, as a constant: `docs: update project documents in response to cf check --fix`. There is one commit per non-invoking checkout per run. `git commit -- <paths>` keeps anything the user has staged in that checkout out of the commit.

The invoking checkout is not auto-committed. That is unchanged behavior, and the user sees the diff in front of them.

PM confirmed this option (20261004). There is no config switch to turn the commits off.

### D5 — Readiness guards before touching another checkout

`checkoutReadiness` checks each non-invoking checkout that would receive writes:

| Condition | Detection | Result |
|---|---|---|
| Path missing, or not the top level of a git checkout | path absent, or realpath of `git rev-parse --show-toplevel` ≠ realpath of the view root | defer all fixes there: `NOT_A_CHECKOUT` |
| Detached HEAD | `git symbolic-ref -q HEAD` fails | defer all fixes there: `DETACHED_HEAD` |
| Merge, rebase, or cherry-pick in progress | `git rev-parse --git-path` for `MERGE_HEAD`, `rebase-merge`, `rebase-apply`, `CHERRY_PICK_HEAD` exists | defer all fixes there: `CHECKOUT_BUSY` |
| Target path already modified | `git status --porcelain -- <path>` non-empty | defer that fix: `FILE_DIRTY` |

- **Why a dirty target is skipped:** someone is editing that file, and writing into it would mix their edit and ours into one commit. Deferral leaves their work untouched, and the finding stays for the next run.
- **Missing checkouts:** a registered worktree whose directory was removed or pruned without `cf worktree rm` is covered by `NOT_A_CHECKOUT`. The existing stale-worktree rule already reports it as a finding.

**Readiness runs twice.** It runs in `planRoutedFixes`, so the CLI preview is accurate. `applyFixPlan` runs it again for each non-invoking checkout immediately before writing, because the CLI prompt can wait indefinitely and the target checkout can change meanwhile. A fix that fails the second check is deferred with the same reasons as at plan time.

### D5a — Commit behavior in another checkout

- **Hooks run.** The commit is a plain `git commit` with no `--no-verify`. The target checkout's hooks are that repository's policy, for example Squadron's frontmatter gate. Bypassing them would land commits the repo's own rules would reject. If a hook rewrites a staged file, the commit records the hook's version.
- **Bounded.** Every git call made against a non-invoking checkout (readiness, add, commit, restore) passes `timeoutMs: FIX_GIT_TIMEOUT_MS`. This is a single core constant, set to 60 000 ms, and it covers a hanging hook or a stuck lock.
- **Failure leaves the checkout as found.** If the commit fails (hook rejection, timeout, or `index.lock` held), `applyFixPlan` restores the written paths with `git restore --source=HEAD --staged --worktree -- <paths>`. This is safe because readiness proved those paths clean immediately before the write. The fixes are reported as deferred with `COMMIT_FAILED` and git's error text.
- **If the restore also fails**, the error goes into `fixErrors` naming the checkout and the files left written but uncommitted. That is the only path that can leave an unexpected change behind, and it is always reported.

`commitPathsIfChanged(repoPath, relPaths, message, opts?)` returns `Promise<string | null>`: the new commit's sha, or `null` when nothing under `relPaths` changed. It throws on any git failure, including "not a git repo". `applyFixPlan` never calls it without a passing readiness check, so a non-repo is already a `NOT_A_CHECKOUT` deferral. The existing `commitPathIfChanged` keeps its `boolean` contract, including its non-repo `false`, for `cf guide update`. It wraps the new function behind its own `isGitRepo` check.

### D5b — The invoking checkout

The CLI and MCP compute the invoking checkout the same way, with one core helper, `resolveInvokingCheckout(views)`:

- Take the realpath of `git rev-parse --show-toplevel` from the process working directory.
- Compare it with the realpath of each view's root. The match is exact after `realpath`, which normalizes symlinks and trailing slashes.
- **No match, in fix mode, with two or more checkouts:** fail with an explicit error. The message says this checkout is not a registered worktree and to run `cf worktree init` or run from a registered checkout. This matches the project rule that an unregistered worktree is a STOP condition. It also stops the failure mode where every view, including the user's own, looks non-invoking and gets auto-committed. Read-only `cf check` and single-checkout projects never do this matching.

This changes MCP. `workflow_check` previously treated `project.projectPath` as the invoking checkout. It now uses the server's working directory, so an agent in worktree B that calls `workflow_check { fix: true }` gets B's fixes as a visible, uncommitted diff, the same as the CLI.

### D6 — Deferral reasons are an enum

`DeferReason` is defined once in core: `NOT_OWNER`, `OWNER_UNRESOLVED`, `NOT_A_CHECKOUT`, `FILE_DIRTY`, `CHECKOUT_BUSY`, `DETACHED_HEAD`, `COMMIT_FAILED`, `READINESS_FAILED`. A git error or timeout while probing a checkout's readiness defers that checkout's fixes as `READINESS_FAILED` (with git's error text) instead of aborting the run, so commits already made elsewhere are still reported. CLI text, MCP JSON, and tests all reference the constants. Display strings live in one CLI map keyed by the enum.

### D7 — Relationship to slice 927

927's "#100 — Fix Path" (its D5) fixed a dedup regression: collapsing identical findings meant only the first-seen checkout got fixed, and the rest vanished from output. 213 keeps 927's goal and most of its mechanism:

| 927 guarantee | After 213 |
|---|---|
| Fixes applied per view, before the merge | Kept; only owner views receive writes |
| Fix results merge through `mergeFixResults` | Kept; extended with `deferred` and `commits` |
| CLI applies the pre-merge dry run without re-checking | Kept |
| CLI and MCP share one fix path | Kept and tightened (MCP drops `fixAll`) |
| No fix silently vanishes | Kept; every unwritten fix is in `deferred` with a reason |
| Every checkout with the finding is written | **Reversed**: only the owner is written |

Observable changes (two or more worktrees only):

- `fixed` and `fixLog` cover only owner writes, so they are smaller than in 0.18.x for the same tree. This is a behavior change to released output, not purely additive.
- `check-worktree-fix.test.ts` encodes the 927 contract (both checkouts rewritten, `fixed === 2`). It is rewritten to the 213 contract.
- **Status rollups on shared parent documents wait for the merge.**
  - Example: worktree B (range 950–959) finishes slice 950. B's view flags the 900 plan's own `status` field. The 900 plan is unclaimed, so its owner is the primary checkout, and B's fix is deferred as `NOT_OWNER`. B's own checkbox for entry 950 is still fixed, because B owns 950.
  - The rollup lands when B's work merges into the primary checkout's branch and `cf check --fix` runs there. Under 927 it was written on B's branch immediately.
  - This is intended: a parent document is not done until the work has merged.

External consumers: Squadron was checked (20261004).
- Its only cf invocations are `list`, `get`, `config get`, `--version`, and `validate frontmatter`. Nothing parses check or fix output.
- The `/cf:check` slash command shows output raw, and the vendored guide's mentions of `workflow_check` are prose. Neither depends on the output shape.

### Technology Choices

There are no new dependencies. Git access goes through the existing `gitExec` (non-interactive `execFile`). `commitPathIfChanged` gains a multi-path sibling, `commitPathsIfChanged(repoPath, relPaths, message)`, and the single-path form delegates to it, so there is one implementation.

### Patterns and Conventions

- Routing is a pure function over view results plus a git-readiness probe. That keeps ownership logic unit-testable without git.
- CLI and MCP call the same two core functions, `planRoutedFixes` and `applyFixPlan`. Neither re-implements routing. MCP's all-slices path switches from `checker.fixAll(view)` to `checkAll` followed by plan and apply, which removes the CLI/MCP divergence 927 noted.
- One `dateStamp` per run is passed to every `applyFixes` call, so identical fixes in different checkouts (under the "owner lacks file" rule) produce identical bytes.

## Implementation Details

### API Contracts

**Types (`introspection/types.ts`), all additive:**

```typescript
fixAction?: { type; filePath; detail; subjectIndex: number | null };   // subjectIndex added

interface FixLogEntry { /* existing */ worktree?: FindingWorktree }

const DeferReason = { NOT_OWNER: 'not-owner', OWNER_UNRESOLVED: 'owner-unresolved',
  NOT_A_CHECKOUT: 'not-a-checkout', FILE_DIRTY: 'file-dirty', CHECKOUT_BUSY: 'checkout-busy',
  DETACHED_HEAD: 'detached-head', COMMIT_FAILED: 'commit-failed', READINESS_FAILED: 'readiness-failed' } as const;

interface DeferredFix { finding: ConsistencyFinding; reason: DeferReasonValue; owner?: FindingWorktree; detail?: string }  // detail: git error text (COMMIT_FAILED, READINESS_FAILED)
interface CheckoutCommit { worktree?: FindingWorktree; checkoutPath: string; sha: string; files: string[] }

interface ConsistencyFixResult { /* existing */ deferred: DeferredFix[]; commits: CheckoutCommit[] }
```

For single-checkout projects, `deferred` and `commits` are always empty arrays and `worktree` is absent from log entries, so JSON consumers see only additive empty fields.

**Core functions:**

```typescript
resolveFixOwner(project: ProjectData, subjectIndex: number | null, views: AttributedView[]): AttributedView | null
interface AttributedCheckResult { view: AttributedView; result: ConsistencyCheckResult }   // new; runAttributed returns results in view order
interface FixPlanEntry { view: AttributedView; result: ConsistencyCheckResult; commit: boolean }  // result holds kept findings only
interface FixPlan { entries: FixPlanEntry[]; deferred: DeferredFix[] }
interface ReadinessResult { blocked: DeferReasonValue | null; dirtyPaths: string[] }

planRoutedFixes(project: ProjectData, viewResults: AttributedCheckResult[], invokingPath: string): Promise<FixPlan>
applyFixPlan(checker: ConsistencyChecker, plan: FixPlan, dateStamp?: string): Promise<ConsistencyFixResult>
resolveInvokingCheckout(views: AttributedView[]): Promise<AttributedView>     // throws when unregistered (D5b)
checkoutReadiness(checkoutPath: string, relPaths: string[], opts?: GitExecOptions): Promise<ReadinessResult>
commitPathsIfChanged(repoPath: string, relPaths: string[], message: string, opts?: GitExecOptions): Promise<string | null>
restorePathsToHead(repoPath: string, relPaths: string[], opts?: GitExecOptions): Promise<void>   // throws on failure
```

**CLI text output (multi-checkout):**

```
Fixed 3 finding(s)
  [default]  (invoking checkout, uncommitted)
    → status: in_progress → complete in user/slices/212-slice.guide-exclude-globs….md
  [maint]    committed a1b2c3d in /…/cf-maint
    → [ ] → [x] in user/architecture/900-slices.maintenance-and-refactoring.md
    → status: not_started → in_progress in user/slices/931-slice.….md
Left alone 2 fix(es)
  [maint]    stale copy; owned by default — user/slices/212-slice.….md
  [default]  file has uncommitted edits — user/slices/205-slice.….md
```

A `[worktree]` prefix and the grouping appear only with two or more worktrees, as today.

**MCP `workflow_check`:** the schema is unchanged. The response gains `deferred` and `commits`, and `fixLog` entries gain `worktree`. The invoking checkout comes from the server's working directory (D5b), no longer from `project.projectPath`.

## Integration Points

### Provides to Other Slices

- `resolveFixOwner` is the canonical answer to "which checkout owns index N". Future cross-checkout writers can reuse it.
- `checkoutReadiness` and `commitPathsIfChanged` are generic git helpers for safely writing into a checkout the user is not standing in.

### Consumes from Other Slices

- 207/927 view construction, and `runAttributed`. A view whose worktree has no `worktreePath` uses the primary `projectPath`. Ownership resolves to that view normally.
- 926 `FindingWorktree` supplies the attribution for log entries, deferrals, and commits.

## Success Criteria

### Functional Requirements

1. With two or more worktrees, each fixable finding is written only in the checkout that owns its subject (D1, D2).
2. A non-owner finding is not written. It is reported under `deferred` with `NOT_OWNER` and the owner's name.
3. Writes into non-invoking checkouts are committed, one commit per checkout, containing only the written paths, with the defined message. Other staged changes in that checkout stay staged and uncommitted.
4. After `cf check --fix` from checkout A, `git status` in any other registered checkout B shows no modifications attributable to the run.
5. Writes into the invoking checkout stay uncommitted.
6. A non-invoking checkout that is missing, not a checkout, on a detached HEAD, or in an in-progress merge, rebase, or cherry-pick receives no writes. A target file with uncommitted edits receives no write. Readiness is re-checked immediately before writing, so a change during the CLI prompt is caught. Each case is reported with its reason.
7. A failed or timed-out commit, including a hook rejection, restores the written paths to HEAD and reports the fixes as `COMMIT_FAILED`. Only a failed restore reaches `fixErrors`, naming the checkout and the files left uncommitted. Hooks in the target checkout run, and are not bypassed.
8. When the owner's checkout lacks the target file, the fix applies in the views that reported it.
9. Single-checkout projects: output and on-disk effects are identical to today. `deferred` and `commits` are empty, and no git commands run as part of fixing.
10. CLI all-slices: the confirmation preview shows the routed plan (fixes per checkout, deferrals) before anything is written. `--yes` skips the prompt.
11. MCP `workflow_check` with `fix: true`, and `workflow.auto_fix`, produce the same routing as the CLI. The `auto_fix` path skips the preview and prompt by design, so it can commit into other checkouts during a plain `cf check`.
12. In fix mode with two or more checkouts, running from a checkout that matches no registered view fails with an explicit error, and nothing is written. Read-only checks are unaffected.

### Technical Requirements

- Every fixable rule sets `subjectIndex`, and a test asserts that no fixable finding lacks the field.
- `resolveFixOwner` has unit tests for: single checkout; one claimant; unclaimed → primary; `null` index → primary; overlap → `null`; no primary view → `null`.
- `planRoutedFixes` and `applyFixPlan` have tests using real temporary git repos with `git worktree add`. These cover: owner commit, stale-copy deferral, dirty-file deferral, busy checkout (an in-progress merge), detached HEAD, a missing worktree path, a staged unrelated file left out of the commit, the owner-lacks-file case, a state change between plan and apply (re-check), a rejecting pre-commit hook (restore and `COMMIT_FAILED`), and an unregistered invoking checkout (error).
- The existing `check-worktree-fix.test.ts` (two checkouts, same finding, both rewritten) is updated to the new contract: written once, in the owner's checkout.
- `commitPathIfChanged` keeps its boolean contract and wraps `commitPathsIfChanged`. Existing guide-update tests still pass.
- Build, typecheck, lint, and all package test suites are clean.
- README: the `cf check --fix` section describes worktree routing and commits. CHANGELOG `[Unreleased]` gets a Changed entry.

### Integration Requirements

- `cf check`, `workflow_check`, and `cf next`/`cf status` (which consume check results) are unaffected for read-only checks.
- 927's dedup output is unchanged. Only which files are written changes.

### Verification Walkthrough

Run 20261004 against the local build, in a `mktemp -d` scratch repo, never this repository. All steps passed. Commands below are the ones actually run.

**Setup.** `CONTEXT_FORGE_DATA_DIR` points the project store at the scratch directory so the run never touches your real project list. `cf init --lite` registers the project without downloading the guide (`cf check` doesn't need it).

```bash
REPO=<path to context-forge>
cfl() { node $REPO/packages/cli/dist/index.js "$@"; }
SCRATCH=$(cd "$(mktemp -d)" && pwd -P)
export CONTEXT_FORGE_DATA_DIR=$SCRATCH/data
cd $SCRATCH && git init -q -b main main-co && cd main-co
git config user.name walkthrough; git config user.email wt@example.com
git config commit.gpgsign false; git config core.hooksPath "$PWD/.git/hooks"
cfl init --lite --name wt213
# project-documents/user/architecture/900-slices.maint.md: status in_progress,
#   entries "1. [ ] **(120) Alpha**" and "2. [ ] **(950) Beta**"
# slices/120-slice.alpha.md, slices/950-slice.beta.md: status not_started
# tasks/120-tasks.alpha.md, tasks/950-tasks.beta.md: status not_started, two "- [ ]" items
# (every document carries full frontmatter with project: wt213, so there are no schema findings)
git add -A && git commit -qm seed
git worktree add -q ../wt-b -b wt-b
cfl worktree init --name b --range 950-959 --path $SCRATCH/wt-b
```

The first `worktree init` prints `Existing workflow fields were migrated to a 'default' worktree context (range 100-799)`. That `default` worktree is `main-co`. Do not register `main-co` again under another name: a second registration at the same path is harmless but redundant.

1. **Owner fix lands in the owner's checkout and is committed there.** Check off both items in `wt-b`'s `950-tasks.beta.md` and commit. From `main-co`: `cfl check --fix --yes`.
   - Output: `Fixed 3 finding(s)`, then `[b]  committed <sha> in …/wt-b`, listing the 900-plan checkbox and the 950 design and task status fixes.
   - `git -C ../wt-b status --porcelain` is empty.
   - `git -C ../wt-b log -1 --oneline` shows `docs: update project documents in response to cf check --fix`.
   - `main-co` is clean.
2. **Stale copy is left alone.** In `main-co`, check entry 950 in the plan and commit. Run `cfl check --fix --yes`.
   - Output: `Fixed 0 finding(s)`, then `Left alone 2 fix(es)`, with both `[default]  stale copy; owned by b — …` (the plan checkbox and the 950 design).
   - `main-co`'s plan entry and 950 files are unchanged.
3. **Invoking checkout stays uncommitted.** Set `120-slice.alpha.md` to `status: complete` (tasks incomplete) and commit. Run `cfl check --fix --yes`.
   - Output: a `[default]  (invoking checkout, uncommitted)` group.
   - `git status` shows the modified plan and 120 design.
   - The commit count is unchanged.
4. **Dirty target is deferred.** In `wt-b`, set `950-slice.beta.md` to `status: in_progress` and append a line, without committing. Run from `main-co`.
   - Output: `[b]  file has uncommitted edits — user/slices/950-slice.beta.md`, once per fix on that file.
   - The file's bytes are unchanged and `wt-b` gets no new commit.
5. **Busy checkout is deferred.** Make the 950 design fixable in `wt-b` (committed), then leave a conflicting `git merge main` unresolved in `wt-b`. Run from `main-co`.
   - Output: every `[b]` fix shows `merge, rebase, or cherry-pick in progress`.
   - HEAD in `wt-b` is unchanged and no fix is written. The merge's own staged files are still there.
6. **Staged work stays out of the commit.** `git merge --abort` in `wt-b`, then `git add` an unrelated `notes.txt` there. Run `cfl check --fix --yes`.
   - `git -C ../wt-b show --name-only HEAD` lists only `project-documents/user/slices/950-slice.beta.md`.
   - `notes.txt` is still `A ` (staged).
7. **JSON shape.** `cfl check --fix --yes --json`.
   - Top-level keys end `…, fixed, fixLog, fixErrors, deferred, commits`.
   - `fixLog[].worktree.name` is `default` / `b`.
   - `deferred[].reason` is `not-owner`, with `owner.name: "b"`.
   - `commits[]` has `sha`, `files: ["project-documents/user/slices/950-slice.beta.md"]`, and `worktree.name: "b"`.
8. **Single checkout unchanged.** `cfl worktree rm b --yes`. Without `--yes`, a non-interactive shell cancels the removal. Make the 120 task file inconsistent and commit, then run the published 0.18.4 `cf` and `cfl` on the same state, resetting with `git checkout -- .` between runs.
   - `cf check --fix --yes` text output: byte-identical.
   - `--json`: `deferred: []`, `commits: []`, and no `worktree` on log entries.
   - The only other difference is the additive `fixAction.subjectIndex` on findings (D1).
9. **MCP parity.** Covered by `packages/mcp-server/tests/workflowCheckRouting.test.ts`: `workflow_check { fix: true }` gives the same routed result as step 1. The same file covers an unregistered server cwd (tool error, nothing written) and `workflow.auto_fix` with no `fix` argument.

**Caveats found during the run:**
- Some findings appear in more than one step's output. They come from existing rules that disagree within one pass, not from routing.
  - The 120 design with status `complete` and incomplete tasks gets two contradictory fixes in one run (status → `in_progress`, checkbox → checked), and the next run flips them back.
  - Two rules can target the same field, so the second write logs `complete → complete`.
  - Both behaviors predate this slice.
- With `workflow.auto_fix` set, a plain `cf check` no longer asks for confirmation, in single-checkout projects too. Before this slice it prompted unless `--yes`. This follows SC 11 as written.

## Risk Assessment

### Technical Risks

- **Committing on another person's or agent's branch.** This is the slice's deliberate trade. Even scoped to fixed paths and guarded, it is a commit nobody in that checkout asked for. A concurrent git process there can also make the commit fail midway.
- **Automation running in the target checkout.** Squadron's pipeline commit logic (squadron slice 196, in progress) scopes its commits to planned paths and checks git state before committing. A `--fix` run from another checkout can commit into a worktree where a pipeline is running, and the pipeline then sees a commit it didn't make. Nothing in Squadron calls `cf check` today, so this needs a person or agent running `--fix` at the same time. This slice accepts that. Squadron should treat a foreign `docs:` commit touching only project documents as benign.
- **Subject index coverage.** A rule that forgets `subjectIndex` would route by `null` to the primary checkout, which could silently move a worktree-owned fix to the wrong checkout.

### Mitigation Strategies

- Commits are path-scoped and never pushed. The message is fixed and recognizable, so `git revert` is trivial. Readiness guards skip checkouts mid-operation and files under active edit. Commit failures surface in `fixErrors` with exact paths.
- `subjectIndex` is a required key on `fixAction` (`number | null`), so the compiler flags a rule that omits it. A test asserts that every fixable finding from the full rule set carries it.

## Implementation Notes

### Development Approach

1. **Types and the `subjectIndex` plumbing.** Add the field, set it in every fixable rule, and add the coverage test. No behavior change yet.
2. **`resolveFixOwner`.** Pure function plus unit tests.
3. **Git helpers.** `checkoutReadiness`, plus `commitPathsIfChanged` with `commitPathIfChanged` delegating. Test against temporary git repos.
4. **`planRoutedFixes` and `applyFixPlan`.** Extend `mergeFixResults` to carry `deferred` and `commits`. Add temporary-repo worktree tests for every D5 guard.
5. **CLI `check.ts`.** Both fix paths go through plan and apply. Add the grouped preview and output. Update `check-worktree-fix.test.ts`.
6. **MCP `workflow_check`.** Switch to plan and apply, and update tests.
7. **Docs.** README and CHANGELOG.
8. **Verification walkthrough** against the local build.

Effort: 3/5.

### Special Considerations

- `workflow.auto_fix=true` makes every `cf check` a fixing run, so with this slice it can commit into other checkouts on a plain `cf check`. That is consistent with the setting's meaning ("apply corrections automatically"), but the README note should say so explicitly.
- Under the "owner lacks file" rule, fixes still apply in more than one checkout. They produce identical bytes (shared `dateStamp`), so those copies merge cleanly.

## Review Resolution

Review: `user/reviews/213-review.slice.cf-check-fix-worktree-aware-writes.md` (verdict CONCERNS, 20261004). Each finding was resolved in this design:

- **F001 (scope outside the 200 architecture):** added the architectural anchor under Dependencies, tracing to the 160 and 180 architectures and reconciling with "never destructive". PM decided 20261004 that 213 stays in the 200 band.
- **F002 (readiness not re-checked after the prompt):** readiness now runs again in `applyFixPlan` immediately before writing (D5, Data Flow, SC 6, tests).
- **F003 (hooks, timeouts):** D5a. Hooks run, and every git call is bounded by `FIX_GIT_TIMEOUT_MS`. A commit failure restores the written paths and defers with `COMMIT_FAILED`.
- **F004 (helper contract):** D5a specifies the `commitPathsIfChanged` return value and that it throws on any git failure. A non-repo is a `NOT_A_CHECKOUT` readiness deferral. The single-path wrapper keeps its boolean contract.
- **F005 (invoking checkout undefined):** D5b defines `resolveInvokingCheckout`, which compares realpaths of the git top level, and errors in fix mode when nothing matches. MCP now uses its working directory instead of `project.projectPath` (SC 12).
- **F006 (missing worktree path):** added the `NOT_A_CHECKOUT` reason (D5, D6).
- **F007 (`auto_fix` blast radius):** SC 11 now says the `auto_fix` path skips the preview by design.
- **F008 (decision order):** D7 moved after D6.
