---
docType: slice-design
slice: cf-check-fix-worktree-aware-writes
project: context-forge
parent: user/architecture/200-slices.developer-onboarding.md
dependencies: [207-slice.worktree-resolved-project-view, 926-slice.worktree-scoped-validate-check-attribution-and-scope-reporting, 927-slice.worktree-dedup-and-explicit-project-worktree-resolution]
interfaces: []
dateCreated: 20261004
dateUpdated: 20261004
status: not_started
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
└── commitPathsIfChanged()    NEW multi-path form; commitPathIfChanged delegates to it

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
    ├─ checker.applyFixes(subset, dateStamp) per view     same dateStamp across all views
    ├─ non-invoking views with writes: commitPathsIfChanged(checkout, writtenRelPaths, COMMIT_MESSAGE)
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

External consumers: Squadron was checked (20261004), and no code parses `workflow_check` or `cf check --fix` output.

### D5 — Readiness guards before touching another checkout

Before planning a write into a non-invoking checkout, `checkoutReadiness` checks:

| Condition | Detection | Result |
|---|---|---|
| Detached HEAD | `git symbolic-ref -q HEAD` fails | defer all fixes there: `DETACHED_HEAD` |
| Merge, rebase, or cherry-pick in progress | `git rev-parse --git-path` for `MERGE_HEAD`, `rebase-merge`, `rebase-apply`, `CHERRY_PICK_HEAD` exists | defer all fixes there: `CHECKOUT_BUSY` |
| Target path already modified | `git status --porcelain -- <path>` non-empty | defer that fix: `FILE_DIRTY` |

A dirty target means someone is editing that file. Writing into it would mix their edit and ours into one commit. Deferral leaves their work untouched, and the finding remains for the next run.

A failed commit after a successful write (for example, `index.lock` held by a concurrent git process in that checkout) is not swallowed. It goes into `fixErrors` naming the checkout and the files that are now written but uncommitted.

### D6 — Deferral reasons are an enum

`DeferReason` is defined once in core: `NOT_OWNER`, `OWNER_UNRESOLVED`, `FILE_DIRTY`, `CHECKOUT_BUSY`, `DETACHED_HEAD`. CLI text, MCP JSON, and tests all reference the constants. Display strings live in one CLI map keyed by the enum.

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
  FILE_DIRTY: 'file-dirty', CHECKOUT_BUSY: 'checkout-busy', DETACHED_HEAD: 'detached-head' } as const;

interface DeferredFix { finding: ConsistencyFinding; reason: DeferReasonValue; owner?: FindingWorktree }
interface CheckoutCommit { worktree?: FindingWorktree; checkoutPath: string; sha: string; files: string[] }

interface ConsistencyFixResult { /* existing */ deferred: DeferredFix[]; commits: CheckoutCommit[] }
```

For single-checkout projects, `deferred` and `commits` are always empty arrays and `worktree` is absent from log entries, so JSON consumers see only additive empty fields.

**Core functions:**

```typescript
resolveFixOwner(project: ProjectData, subjectIndex: number | null, views: AttributedView[]): AttributedView | null
planRoutedFixes(project: ProjectData, viewResults: AttributedCheckResult[], invokingPath: string): Promise<FixPlan>
applyFixPlan(checker: ConsistencyChecker, plan: FixPlan, dateStamp?: string): Promise<ConsistencyFixResult>
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

**MCP `workflow_check`:** the schema is unchanged. The response gains `deferred` and `commits`, and `fixLog` entries gain `worktree`. The invoking checkout remains `project.projectPath`.

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
6. A non-invoking checkout with a detached HEAD or an in-progress merge, rebase, or cherry-pick receives no writes. A target file with uncommitted edits receives no write. Each case is reported with its reason.
7. A failed commit after a write is reported in `fixErrors`, naming the checkout and the uncommitted files.
8. When the owner's checkout lacks the target file, the fix applies in the views that reported it.
9. Single-checkout projects: output and on-disk effects are identical to today. `deferred` and `commits` are empty, and no git commands run as part of fixing.
10. CLI all-slices: the confirmation preview shows the routed plan (fixes per checkout, deferrals) before anything is written. `--yes` skips the prompt.
11. MCP `workflow_check` with `fix: true`, and `workflow.auto_fix`, produce the same routing as the CLI.

### Technical Requirements

- Every fixable rule sets `subjectIndex`, and a test asserts that no fixable finding lacks the field.
- `resolveFixOwner` has unit tests for: single checkout; one claimant; unclaimed → primary; `null` index → primary; overlap → `null`; no primary view → `null`.
- `planRoutedFixes` and `applyFixPlan` have tests using real temporary git repos with `git worktree add`. These cover: owner commit, stale-copy deferral, dirty-file deferral, busy checkout (an in-progress merge), detached HEAD, a staged unrelated file left out of the commit, and the owner-lacks-file case.
- The existing `check-worktree-fix.test.ts` (two checkouts, same finding, both rewritten) is updated to the new contract: written once, in the owner's checkout.
- `commitPathIfChanged` delegates to `commitPathsIfChanged`, and existing guide-update tests still pass.
- Build, typecheck, lint, and all package test suites are clean.
- README: the `cf check --fix` section describes worktree routing and commits. CHANGELOG `[Unreleased]` gets a Changed entry.

### Integration Requirements

- `cf check`, `workflow_check`, and `cf next`/`cf status` (which consume check results) are unaffected for read-only checks.
- 927's dedup output is unchanged. Only which files are written changes.

### Verification Walkthrough

These steps use the local build (`node packages/cli/dist/index.js`, aliased below as `cfl`) in a throwaway repo, never this repository.

```bash
alias cfl="node $PWD/packages/cli/dist/index.js"
SCRATCH=$(mktemp -d) && cd "$SCRATCH"
git init -q main-co && cd main-co
cfl init                                     # project + guide; creates project-documents/
# add a slice plan with entries for 120 and 950, and slice designs 120 and 950
git add -A && git commit -qm "seed"
git worktree add -q ../wt-b -b wt-b
cfl worktree init --name b --range 950-959 --path ../wt-b
```

1. **Owner fix lands in the owner's checkout and is committed there.** In `../wt-b`, check off all tasks for slice 950 and commit. From `main-co`, run `cfl check --fix --yes`.
   - Expect: the `[b]` group shows the 950 plan-checkbox fix, `committed <sha> in …/wt-b`.
   - `git -C ../wt-b status --porcelain` is empty.
   - `git -C ../wt-b log -1 --oneline` shows `docs: update project documents in response to cf check --fix`.
2. **Stale copy is left alone.** In `main-co`, check the plan entry for 950 without touching `main-co`'s copy of the 950 task file, which leaves `main-co`'s view inconsistent for a subject `b` owns. Run `cfl check --fix --yes`.
   - Expect: neither `main-co`'s plan entry nor its task file is rewritten.
   - The output lists the fix under "Left alone" as a stale copy owned by `b`.
3. **Invoking checkout stays uncommitted.** Make slice 120's design status inconsistent in `main-co`, then run `cfl check --fix --yes` from `main-co`.
   - Expect: the fix is written.
   - `git status` in `main-co` shows the modified file.
   - No new commit appears in `main-co`.
4. **Dirty target is deferred.** Edit slice 950's design in `../wt-b` without committing, and make a fixable inconsistency on it. Run the fix from `main-co`.
   - Expect: the fix is deferred with "file has uncommitted edits".
   - The user's edit in `wt-b` is untouched.
5. **Busy checkout is deferred.** Start a conflicting `git merge` in `../wt-b` and leave it unresolved. Run the fix from `main-co`.
   - Expect: every `wt-b` fix is deferred as checkout busy.
   - No writes happen in `wt-b`.
6. **Staged work stays out of the commit.** In `../wt-b`, stage an unrelated file. Repeat step 1's setup and run.
   - Expect: the fix commit contains only the fixed document.
   - The unrelated file is still staged.
7. **JSON shape.** Run `cfl check --fix --yes --json`.
   - Expect: `fixLog[].worktree`, `deferred[]` with `reason` values from the enum, and `commits[]` with `sha` and `files`.
8. **Single checkout unchanged.** Run `cfl worktree rm b`, recreate an inconsistency, and run `cfl check --fix --yes --json`.
   - Expect: `deferred: []`, `commits: []`, and output identical in form to 0.18.4.
9. **MCP parity.** Covered by `workflowTools.test.ts`. `workflow_check { fix: true }` against the two-checkout fixture yields the same routed result as step 1.

## Risk Assessment

### Technical Risks

- **Committing on another person's or agent's branch.** This is the slice's deliberate trade. Even scoped to fixed paths and guarded, it is a commit nobody in that checkout asked for. A concurrent git process there can also make the commit fail midway.
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
