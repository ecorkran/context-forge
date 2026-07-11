---
docType: slice-design
slice: fix-phantom-review-gate-findings-909-design-list-targeting
project: context-forge
parent: project-documents/user/architecture/900-slices.maintenance-and-refactoring.md
dependencies: [240, 241, 242, 911, 912]
interfaces: []
dateCreated: 20260710
dateUpdated: 20260710
status: not-started
---

# Slice Design: Fix Phantom Review-Gate Findings, 909's Missing Slice-Design, and List-Command Plan Targeting

## Overview

Three unrelated-but-adjacent defects, all found while dogfooding the review-gate system (initiative 240) on this repo post-slice-243. They share no code path with each other, but all three are small, low-risk, and were discovered in the same dogfooding pass, so they fold into one maintenance slice rather than three (matching the precedent set by slice 912).

1. **Phantom "Slice 1"–"Slice 12" review-gate findings.** `cf check` reports review-gate findings against slice indices 1–12 that don't correspond to any real slice.
2. **909 has no slice-design file.** `cf check --set-review-none 909` cannot declare a docs-only exemption because there's nothing to write the declaration into — 909 shipped as ordinary code with only an inline plan note, not a design artifact.
3. **`cf list slices` / `cf list tasks` can't target a non-active plan.** Inspecting another initiative's progress requires a disruptive four-step round-trip through `cf set arch`.

**On grouping (reviewed and deliberate).** The 900 architecture's "slice by theme, not by urgency" principle exists to stop unrelated urgent fixes from being crammed together. These three items are not thematically identical — TD-1 is review-gate aggregation correctness, TD-2 is a documentation-artifact gap, TD-3 is CLI read-only UX — but they share a discovery event (the same review-gate dogfooding pass, post-243) and a size class (each would be effort 1/5 alone). This mirrors the precedent slice 912 already set: 912 bundled three defects that also didn't share code, justified the same way ("all surfaced while dogfooding slice 911's review-gate work... fold into one slice rather than three"). Three micro-slices for a combined 3/5-effort unit would add three branches, three task files, and three reviews without a corresponding gain in clarity, which cuts against the project's "resist adding complexity" principle. TD-3 is arguably closer to the architecture's anticipated "CLI pattern consistency" slice than to TD-1/TD-2; if a future dogfooding pass surfaces more list/targeting issues, those should accumulate there rather than here — this slice does not claim ownership of that theme going forward.

## Value

- `cf check` stops reporting fictitious findings against a legacy, fully-complete plan — restoring trust in the tool's output before it's used to gate real work.
- 909 gets a normal artifact trail, closing the gap that currently makes it the only maintenance-plan entry `--set-review-none` refuses to touch.
- Inspecting a non-active initiative's slices/tasks becomes a single command instead of a four-step state-mutating round-trip.

## Technical Decisions

### TD-1 — Phantom findings: scope cross-plan aggregation to indexed-format entries only

**Root cause** (confirmed by reading the source, not inferred): `discoverAllSlicePlans()` ([ConsistencyChecker.ts:1169-1180](../../../packages/core/src/introspection/ConsistencyChecker.ts)) globs *every* `*-slices.*.md` file in `project-documents/user/architecture/`, regardless of which plan is actually configured for the project. `checkAll()` ([ConsistencyChecker.ts:78-127](../../../packages/core/src/introspection/ConsistencyChecker.ts)) then parses all discovered plans and merges their entries into one `index`-keyed `Map` (`uniqueEntries`), "first occurrence wins by index." Separately, `slicePlanParser.ts`'s unindexed-entry fallback ([slicePlanParser.ts:69-83](../../../packages/core/src/introspection/parsers/slicePlanParser.ts)) — used when a list item has no bolded `(NNN)` — assigns a per-file sequential counter (`unindexedCounter`, starting at 1) as that entry's `index`. This is a reasonable fallback when a single unindexed plan is read in isolation, but `checkAll()`'s global merge treats that sequential counter as if it were a real project-wide slice index.

The actual source of the collision: `140-slices.context-forge-restructure.md` is a fully-complete legacy plan (all 12 entries checked) predating the `(NNN)` convention — confirmed by reading the file: all 12 entries match `PLAN_UNINDEXED_RE`, none match `PLAN_INDEXED_RE`. Its entries get sequential indices 1–12, which collide with the real project's low-numbered slices once merged into `uniqueEntries`. Because "first occurrence wins," and `Set` iteration order follows insertion order (`discoveredPlans` is `readdir` output, `.sort()`ed alphabetically — `140-slices...` sorts before `900-slices...`), 140's synthetic 1–12 entries win the collision and get checked for review-gate compliance as if they were real, active slices.

**Decision:** exclude unindexed-fallback entries from `checkAll()`'s cross-plan aggregation entirely (option (ii) from the plan entry, adapted). Concretely:

- Add an `isSynthticIndex: boolean` — no: name it `indexSource: 'explicit' | 'fallback'` — field to `SlicePlanEntry` ([types.ts:12-21](../../../packages/core/src/introspection/types.ts)), set by `slicePlanParser.ts` at the point each entry is constructed (`'explicit'` for `PLAN_INDEXED_RE` matches, `'fallback'` for `PLAN_UNINDEXED_RE` matches).
- In `checkAll()`'s merge loop ([ConsistencyChecker.ts:94-104](../../../packages/core/src/introspection/ConsistencyChecker.ts)), skip entries with `indexSource === 'fallback'` before inserting into `uniqueEntries` — they never enter the cross-plan index space, so they cannot collide with a real slice's index and cannot generate review-gate or any other cross-plan finding.
- **Scope boundary:** this only affects `checkAll()`'s *cross-plan* merge (the aggregation that treats every discovered plan as if it were the active one). Single-plan consumers — `check()` (active slice only), `cf list slices`, `parseSlicePlan()` itself — are unaffected: a plan that uses only the unindexed format in isolation (no colliding sibling plan) still parses and displays normally, sequential-numbered as today. This is a pure narrowing of `checkAll()`'s aggregation input, not a parser behavior change for single-plan reads.
- Why a new field over the alternative (excluding legacy/completed plans by status or age): filtering by "is this plan complete" or "does it predate some cutoff date" is exactly the kind of fragile, indirect signal the project's "never use user-accessible labels as logical structure" principle warns against — a plan's completion status has nothing to do with whether its indices are trustworthy for cross-plan aggregation. The unindexed-vs-indexed format is the actual, direct cause of the collision, so gating on that format is the only fix that addresses the root cause rather than a proxy for it.

**Regression test (required per the plan entry):** a fixture using 140's actual unindexed format — a two-plan fixture where one plan has real indexed entries (e.g. `900-slices.*.md`-style, indices 1–3) and a second plan has only unindexed entries (mirroring 140's exact list format) whose sequential fallback indices collide with the first plan's real indices (1–3). Assert `checkAll()` produces zero findings attributable to the unindexed plan's synthetic indices, and that the indexed plan's real entries still evaluate normally (collision avoided, not just "some findings suppressed").

### TD-2 — 909: retroactive minimal slice-design

**Confirmed at design time:** the CF-side implementation of 909 (git.branch_root config key, validator, 45 lines of `ConfigManager.test.ts` coverage) shipped in this repo at commit `713d0c0` ("feat(core): add git.branch_root config key", 20260628) — not upstream. The commit message itself documents the decision to skip the design/task artifact trail: "Tracked as a (909) maintenance note rather than a standalone initiative." Only the companion branch-naming *convention* (the rule instructing agents to read the key) lives upstream in `ai-project-guide/project-guides/rules/git.md`.

**Decision:** write `project-documents/user/slices/909-slice.configurable-branch-root-prefix.md` as a minimal retroactive record, not a forward-looking design — the work is already shipped and tested. Contents:

- Standard frontmatter: `docType: slice-design`, `slice: configurable-branch-root-prefix`, `parent: .../900-slices.maintenance-and-refactoring.md`, `status: complete`, `dateCreated`/`dateUpdated` backdated to `20260628` (the commit date) so the review-gate effective-date cutoff treats it consistently with when the work actually happened, not when this retroactive doc is authored.
- A short Overview stating what shipped (the config key, its validator rules, its default), citing `713d0c0` as the implementation commit and its diff (`ConfigKeys.ts` +17, `ConfigManager.test.ts` +45) as the evidence trail.
- A short note that the companion branch-naming rule lives upstream and is out of scope for this repo's artifact trail — cross-referencing the plan entry's existing wording rather than restating it.
- No Technical Decisions / Data Flow / Verification Walkthrough sections — those describe planning that never happened and would be fabricated. A minimal "Overview + Value + What Shipped" shape is intentionally sparse; padding it with boilerplate sections would misrepresent this as a normally-planned slice.
- Set `codeReview: none` is **not** pre-declared here — per the plan entry's own framing ("or to receive a real code review against, if one is warranted retroactively"), whether to exempt or retroactively review 909's shipped code is a Project Manager call, not an architectural default. Leave the review-gate frontmatter field absent so `cf check --set-review-none 909` becomes usable (it now has a file to write into) rather than deciding the answer in this design.

This closes the artifact gap without inventing a new exemption mechanism — 909 becomes an ordinary slice-design file like any other, just dated to match when the work shipped.

### TD-3 — `cf list slices` / `cf list tasks`: optional positional `[archIndex]` argument

**Current behavior:** `sliceListAction()` ([slice.ts:14-96](../../../packages/cli/src/commands/slice.ts)) and `taskListAction()`/`listTaskFiles()` ([task.ts:16-45,127-190](../../../packages/cli/src/commands/task.ts)) both resolve their target plan exclusively from `project.fileSlicePlan` (the project's currently-configured pointer). There is no way to pass an explicit index and read a different plan without first mutating project state via `cf set arch <n>` and restoring it afterward.

**Decision:** add an optional positional `[archIndex]` argument to both the `cf list slices` and `cf list tasks` commander subcommands ([list.ts:61,75](../../../packages/cli/src/commands/list.ts)), threaded down to a new resolution branch in each action:

- **New shared helper** `resolveSlicePlanPathByIndex(projectPath: string, archIndex: number): Promise<string | null>` in `packages/core` (co-located with `resolveArtifactPath`/`resolveFileByIndex.ts`, since it's the same "index → file path" concern): reads `project-documents/user/architecture/`, finds the file matching `^${archIndex}-slices\..*\.md$`, and returns its path (or `null` if none exists). This is the same glob pattern `discoverAllSlicePlans()` already uses, narrowed to one index — no new discovery mechanism, just a targeted lookup.
- **In `sliceListAction`:** when `archIndex` is provided, resolve the plan path via the new helper instead of `resolveArtifactPath('fileSlicePlan', project.fileSlicePlan)`, and skip the worktree index-range filtering entirely (range filtering exists to scope the *active* project's view to its current worktree; an explicit index request is an intentional cross-initiative look, so it always shows the full plan). `activeIndex`/`isActive`/`isNext` marking still runs against `project.fileSlice` as today — a slice from a different plan is never "active," which falls out naturally since indices don't collide across initiatives by convention.
- **In `taskListAction`/`listTaskFiles`:** same pattern — when `archIndex` is provided, resolve the plan via the new helper and read task files from the single project path (no worktree/`--all` aggregation, since an explicit index request targets one specific plan, not the active worktree's range). `[archIndex]` and `--all` are mutually exclusive; passing both is a `UserError` ("cannot combine an explicit index with --all — --all lists tasks across worktrees of the active plan").
- **Error handling:** if no plan file matches `archIndex`, throw `UserError` with a message naming the index and the searched directory (mirrors the existing "No file matching index" wording from `cf set arch`, for consistency) — not a silent empty list.
- **No project-state mutation.** This is the entire point of the fix: reading `9-slices.foo.md`'s contents directly, never touching `project.fileSlicePlan`/`fileArch`.

**Automated test commitment (matching TD-1's precedent — this is new behavior, not read-only display logic, so it is covered by the architecture's "no behavior changes without tests" principle):**
- Unit tests for `resolveSlicePlanPathByIndex()`: matching file found → correct path returned; no matching file → `null`; multiple candidate files for the same index (malformed project) → deterministic single result (documented tie-break, e.g. first alphabetically).
- CLI-level tests for both `sliceListAction` and `taskListAction`/`listTaskFiles`: valid `archIndex` returns the target plan's entries without reading `project.fileSlicePlan`; missing `archIndex` throws the named `UserError`; `[archIndex]` + `--all` together throws the mutual-exclusion `UserError`; a project-state snapshot taken before and after an indexed call is byte-identical (asserts the no-mutation guarantee directly, not just by code inspection).

**Why a positional arg, not a flag:** the plan entry specifies "optional positional index argument," and it reads naturally alongside the command name (`cf list slices 900`) the same way `cf set arch 900` already takes a bare index — consistent with the existing CLI's convention of index-as-positional-arg for identifying an initiative.

### TD-4 — no schema or config changes

TD-1 adds one field to the in-memory `SlicePlanEntry` type (not persisted, not user-facing frontmatter — internal to plan parsing). TD-2 adds one ordinary slice-design markdown file, no new frontmatter field. TD-3 adds one CLI positional argument and one new exported helper function. No config keys, no schema registry changes, no new gate primitives — all three fixes are narrow and additive to existing machinery.

## Data Flows & Component Interactions

```
cf check ──► ConsistencyChecker.checkAll()
              ├─ discoverAllSlicePlans() ── globs ALL *-slices.*.md (unchanged, still project-wide)
              ├─ parse each plan ── slicePlanParser now tags each entry indexSource: explicit | fallback
              └─ merge into uniqueEntries ── TD-1: entries with indexSource === 'fallback' are skipped
                                              here, never entering the cross-plan index space

cf list slices [archIndex] ──► sliceListAction
                                 ├─ archIndex given  → resolveSlicePlanPathByIndex() ── direct file read,
                                 │                       no project-state touch, no range filtering
                                 └─ archIndex absent → today's path (project.fileSlicePlan, range-filtered)

cf list tasks [archIndex] ──► taskListAction ──► listTaskFiles
                                 ├─ archIndex given  → resolveSlicePlanPathByIndex(), single operationPath,
                                 │                       --all rejected as UserError if also passed
                                 └─ archIndex absent → today's path (unchanged)

909-slice.configurable-branch-root-prefix.md ── new standalone artifact, cited by 713d0c0, read by
                                                    cf check --set-review-none 909 (now succeeds)
```

## Cross-Slice Dependencies

- Depends on the review-gate system (240/241/242/911/912) only in the sense that this slice dogfoods and fixes gaps found while exercising it — no new dependency on their internals beyond what's already merged to `main`.
- No forward dependents; this is leaf maintenance work.

## Success Criteria

1. **TD-1 — phantom findings gone.** `cf check` on this repo produces zero review-gate (or any other) findings attributable to `140-slices.context-forge-restructure.md`'s unindexed entries. A new regression test using 140's actual list format (two-plan fixture, colliding sequential indices) passes, proving the fix addresses the real collision, not just this repo's current state.
2. **TD-1 — no regression to real cross-plan aggregation.** The existing indexed-format cross-plan behavior (duplicate-index detection, arch-status-vs-plans, etc.) continues to fire correctly for plans using the `(NNN)` convention — verified by the existing test suite plus the new fixture's indexed-plan half.
3. **TD-1 — single-plan reads unaffected.** `cf list slices` against a plan that uses only the unindexed format (no colliding sibling) still displays all entries with their sequential indices, unchanged from today.
4. **TD-2 — 909 has a slice-design file.** `909-slice.configurable-branch-root-prefix.md` exists, cites commit `713d0c0`, and `cf check --set-review-none 909` (or the plain project-manager review workflow) can now target it instead of refusing with "no file found."
5. **TD-3 — cross-initiative listing without state mutation.** `cf list slices 140` (or any other initiative's index) prints that plan's entries without altering `project.fileArch`/`fileSlicePlan`/`fileSlice` — confirmed by reading project state before and after and asserting no diff. Same for `cf list tasks 140`.
6. **TD-3 — error path.** `cf list slices 999` (no matching plan) exits with a `UserError` naming the index, not an empty/silent success. `cf list tasks 140 --all` (index + `--all` together) is rejected with a clear error.
7. **No regressions.** Full core + cli + mcp-server test suites pass (modulo pre-existing documented failures in DEVLOG); `pnpm -r build` is clean.

## Verification Walkthrough

> Draft plan — to be executed and replaced with actual commands/output during Phase 6, per this repo's convention (see slices 911/912/243).

**Part A — phantom findings (TD-1).**
```
# Before fix, on this repo:
$ cf check
  ⚠ [1] Slice 1 requires a code review before proceeding — no review artifact found.
  ⚠ [2] Slice 2 requires a code review before proceeding — no review artifact found.
  ... (through Slice 12)

# After fix:
$ cf check
  # zero findings referencing Slice 1–12 (140's legacy entries excluded from aggregation)
  # real low-index slices, if any exist in the active plan, still report normally
```

**Part B — regression fixture (TD-1).**
```
$ pnpm --filter @context-forge/core test -- ConsistencyChecker.crossPlanAggregation
# new test: two-plan fixture, one indexed (real indices 1-3), one unindexed
# (140's exact list format) with colliding sequential 1-3 — asserts zero
# findings from the unindexed plan's synthetic indices, real plan's findings intact
```

**Part C — 909 retroactive design (TD-2).**
```
$ ls project-documents/user/slices/909-slice.configurable-branch-root-prefix.md
# file exists

$ cf check --set-review-none 909
# no longer refuses — writes/confirms the review-gate declaration field (or reports
# the file already has no code-review requirement pending PM decision)
```

**Part D — list targeting without state mutation (TD-3).**
```
$ cf project get   # capture current arch/slicePlan/slice fields
$ cf list slices 140
# prints 140's 12 entries directly
$ cf project get   # unchanged — same arch/slicePlan/slice as before

$ cf list tasks 140
# prints 140's task file summaries directly, no state touched

$ cf list slices 999
Error: No slice plan found for index '999' (searched project-documents/user/architecture/)

$ cf list tasks 140 --all
Error: cannot combine an explicit index with --all
```

**Part E — regression.**
```
$ pnpm -r build
# clean across core, cli, mcp-server, electron

$ pnpm --filter @context-forge/core test
$ pnpm --filter @context-forge/cli test
# full pass modulo pre-existing DEVLOG-documented failures
```

## Effort

Relative effort: **3/5**. Three independent, narrow fixes. TD-1 requires care in the regression fixture (must reproduce the real collision, not a synthetic stand-in) but touches only the merge-loop filter and one new type field. TD-2 is pure documentation. TD-3 is additive CLI surface with a small new core helper. No shared risk between the three — the effort is mostly in the three separate test passes, not any single fix's complexity.
