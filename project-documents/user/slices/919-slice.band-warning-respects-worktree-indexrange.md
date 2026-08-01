---
docType: slice-design
slice: band-warning-respects-worktree-indexrange
project: context-forge
parent: project-documents/user/architecture/900-slices.maintenance-and-refactoring.md
dependencies: []
interfaces: []
dateCreated: 20260801
dateUpdated: 20260801
status: complete
---

# Slice Design: Band Warning Respects Worktree indexRange

## Overview

Fixes GitHub issue #48. `WorkflowNavigator.getNext()` emits an index-band warning
whenever the active slice's hundred-block differs from the architecture's
hundred-block. That check hard-codes an assumption — *one architecture owns
exactly one hundred-block* — that the worktree model already contradicts: a
worktree declares an explicit `indexRange` that may span many hundred-blocks
(the migration default is `[100, 799]`). In such a project every slice at
200/300/…/700 trips a warning about a boundary that project has explicitly
declared it does not use.

The fix replaces the assumption with the declared range. The warning itself is
worth keeping — it catches a genuine "your active slice belongs to a different
initiative than your active architecture" mismatch — so this slice re-points it
at the real source of truth rather than deleting it.

An external contributor (issue reporter) has an open PR, [#49], implementing the
three-tier contract named in the slice plan. This design adopts that contract and
sharpens one tier; see Decision 1 and *Relationship to PR #49*.

## Current Behavior (confirmed by code reading)

[WorkflowNavigator.ts:261-269](packages/core/src/introspection/WorkflowNavigator.ts#L261-L269):

```ts
if (slice.index !== null) {
  const archIndex = extractSliceIndex(project.fileArch);
  if (archIndex !== null && hundredBlock(slice.index) !== hundredBlock(archIndex)) {
    warnings.push(
      `Slice ${slice.index} is outside the ${hundredBlock(archIndex)}-band of architecture '${project.fileArch}'.`,
    );
  }
}
```

`hundredBlock()` ([WorkflowNavigator.ts:46](packages/core/src/introspection/WorkflowNavigator.ts#L46))
is used nowhere else in the codebase — this block is its sole consumer.

Two facts make the fix tractable:

1. **The range is already on the project.** `ProjectData.worktrees` is
   `WorktreeContext[]`, and each context carries `indexRange: [number, number]`
   plus an optional `rangeOverride` flag
   ([types/worktree.ts:6-31](packages/core/src/types/worktree.ts#L6-L31)).
2. **The active worktree is already resolved by the time `getNext()` runs.**
   Both callers — `cf next` ([next.ts:20](packages/cli/src/commands/next.ts#L20))
   and the `workflow_next` MCP tool
   ([workflowTools.ts:194](packages/mcp-server/src/tools/workflowTools.ts#L194)) —
   go through `resolveProject()`, which returns a `ResolvedProject` carrying
   `resolvedWorktree: { id, name }`
   ([projectResolver.ts:6-10](packages/core/src/services/projectResolver.ts#L6-L10)).
   `getNext()` simply doesn't look at it today.

There is also an existing precedent for the correct semantics. `cf set slice`
already warns worktree-scoped, against the **active** worktree, with
`rangeOverride` suppression
([project.ts:310-316](packages/cli/src/commands/project.ts#L310-L316)):

```
Warning: index 209 is outside this worktree's range [100-799]
```

So today the two commands disagree: `cf set slice 209` correctly stays quiet in a
`[100, 799]` worktree while `cf next` warns. This slice makes them agree.

## Value

Developer-facing correctness of the tool's primary guidance surface. A warning
that fires on every single `cf next` in a normally-configured worktree project is
worse than no warning: it trains the user to ignore the warning channel, which is
the same channel that carries the stale-phase and resolution-failure warnings
(#62, #66) added in slices 912 and 917. Restoring the signal-to-noise ratio of
`cf next` warnings is the actual deliverable.

## Technical Scope

**Included:**

- Replace the hundred-block band check in `WorkflowNavigator.getNext()` with a
  worktree-range-aware check (Decision 1).
- Relocate the range helpers `isInIndexRange`, `getWorktreeIndexRange`, and
  `getWorktreeRangeOverride` from `packages/cli/src/utils/worktree-overlay.ts`
  into `packages/core/src/utils/worktree-overlay.ts`, re-exporting from the CLI
  shim so no call site changes (Decision 3).
- Relocate the `ResolvedProject` interface to `packages/core/src/types/project.ts`
  so `introspection/` can read `resolvedWorktree` without importing from
  `services/` (Decision 4).
- Unit tests for all branches of the new check.

**Explicitly excluded:**

- Any change to `cf status`, `cf check`, or `ConsistencyChecker`. Neither emits a
  band warning today; adding one is not in this slice's contract.
- Any change to the `cf set slice` warning at
  [project.ts:310-316](packages/cli/src/commands/project.ts#L310-L316) — it is
  already correct and becomes the model this slice copies.
- The dotted sub-index numbering scheme the reporter raised as an "adjacent
  suggestion" in #48. That is a separate discussion, explicitly not bundled.
- Splitting `WorkflowNavigator.test.ts` (already 1211 lines). Tracked separately;
  see Implementation Notes.

## Technical Decisions

### Decision 1: Three-tier resolution, with the active worktree preferred

The slice plan entry and issue #48 both state a three-tier contract:

1. slice index inside *some* configured worktree's range → suppress;
2. outside *every* configured worktree → warn against the worktree ranges;
3. no worktrees configured → keep the hundred-block-vs-arch fallback.

Tiers 2 and 3 are adopted verbatim. Tier 1 is **sharpened**: when the active
worktree is known, the check runs against *that* worktree's range rather than the
union of all ranges.

Rationale: the union form has a false-negative. With worktree `default [100,199]`
active and a sibling worktree `api [200,299]`, an active slice of 209 is inside
the union and would be silently accepted — even though it belongs to a different
worktree's initiative, which is exactly the mismatch this warning exists to catch.
`cf set slice 209` already warns in that situation; `cf next` going quiet would be
a regression in the opposite direction from #48. When no active worktree can be
resolved (`--project` used, or CWD outside every `worktreePath`), the union is the
best available truth and the plan's tier-1 wording applies unchanged.

Resulting logic:

```
if slice.index is null            → no check (unchanged)
else if activeWorktree is known   → warn unless index ∈ activeWorktree.indexRange
                                    (suppressed entirely when rangeOverride)
else if worktrees configured      → warn unless index ∈ any worktree.indexRange
else                              → legacy hundredBlock(index) vs hundredBlock(archIndex)
```

Alternative considered and rejected: implement PR #49's union-only form as-is.
Rejected because it is strictly less accurate in multi-worktree projects and
inconsistent with `cf set slice`, for roughly six additional lines of code.

### Decision 2: Warning messages

| Tier | Message |
|---|---|
| active worktree, outside | `Slice {n} is outside worktree '{name}' range [{start}-{end}].` |
| no active worktree, outside all | `Slice {n} is outside all configured worktree ranges ({name} [{start}-{end}], …).` |
| no worktrees | unchanged: `Slice {n} is outside the {block}-band of architecture '{fileArch}'.` |

Range rendering uses an ASCII hyphen (`[100-799]`), matching the two existing
range renderings in the tool
([project.ts:315](packages/cli/src/commands/project.ts#L315),
[status.ts:145-146](packages/cli/src/commands/status.ts#L145-L146)). PR #49 uses
an en dash; this is a deliberate, cosmetic-only deviation for consistency, and its
test assertion changes accordingly.

At most one band warning is ever pushed, in every tier. The tiers are mutually
exclusive by construction.

### Decision 3: Range helpers move to core

`isInIndexRange()` already exists — in `packages/cli/src/utils/worktree-overlay.ts`
([lines 70-76](packages/cli/src/utils/worktree-overlay.ts#L70-L76)), alongside
`getWorktreeIndexRange()` and `getWorktreeRangeOverride()`. `WorkflowNavigator`
lives in core and cannot import from the CLI. Re-implementing the containment
predicate in core would put the same comparison in two places — precisely what the
DRY rule prohibits.

Move those three functions into `packages/core/src/utils/worktree-overlay.ts`
(which already exists and already holds `applyWorktreeOverlay`), export them from
`packages/core/src/index.ts`, and re-export them from the CLI module. The CLI
module already uses exactly this shim pattern for `applyWorktreeOverlay`
([worktree-overlay.ts:1-2](packages/cli/src/utils/worktree-overlay.ts#L1-L2)), so
the ~6 existing CLI call sites (`future.ts`, `slice.ts`, `plan.ts`, `project.ts`)
compile unchanged.

`resolveOperationPath()` and `resolveAllOperationPaths()` stay in the CLI — they
concern filesystem path selection, not index ranges, and core has no consumer.

The core module is browser-safe (pure object/array work, no `fs`/`path`), so it
stays on the browser-safe export path in `index.ts`.

### Decision 4: How `getNext()` learns the active worktree

`ResolvedProject` (`ProjectData` + optional `resolvedWorktree`) already exists but
is declared in `services/projectResolver.ts`. Having `introspection/` import from
`services/` inverts the layering.

Move the `ResolvedProject` interface declaration to
`packages/core/src/types/project.ts`, next to `ProjectData`, and re-export it from
`projectResolver.ts` so existing importers are unaffected. Widen the signature to
`getNext(project: ResolvedProject)`.

Because `resolvedWorktree` is optional, plain `ProjectData` remains assignable —
no call site and no existing test needs to change. The field is a resolution
artifact, not persisted state, so it is deliberately *not* added to `ProjectData`
itself (that would leak into the storage schema).

Alternative considered and rejected: add a second parameter,
`getNext(project, activeWorktreeId?)`. Both callers have the id available, but it
duplicates information the project object already carries and adds a parameter to
a public core API for no gain.

Note: `packages/cli/src/utils/project.ts` declares its own unrelated local
`ResolvedProject` (`{ id, source }`). Different module, no collision — but do not
merge the two.

## Architecture

### Component Structure

```
packages/core/src/utils/worktree-overlay.ts
  applyWorktreeOverlay()          (existing)
  isInIndexRange()                (moved from cli)
  getWorktreeIndexRange()         (moved from cli)
  getWorktreeRangeOverride()      (moved from cli)
        ▲                                   ▲
        │ re-export                         │ import
        │                                   │
packages/cli/src/utils/          packages/core/src/introspection/
  worktree-overlay.ts              WorkflowNavigator.ts
  (shim, unchanged call sites)       getNext() band-warning block
```

### Data Flow

```
cf next  /  workflow_next
        │
        ▼
resolveProject(store, id, worktreeId?)      ← worktreeId from CWD match or --worktree/arg
        │  applies overlay, annotates resolvedWorktree
        ▼
ResolvedProject { fileArch, fileSlice, worktrees[], resolvedWorktree? }
        │
        ▼
WorkflowNavigator.getNext()
        │
        ├─ slice.index  ──┐
        ├─ resolvedWorktree?.id ──┤ → band check (Decision 1) → warnings[]
        ├─ worktrees[]  ──┤
        └─ fileArch     ──┘
        │
        ▼
NextAction.warnings  →  printed by cf next / returned by workflow_next
```

`hundredBlock()` survives only inside the tier-3 branch.

## Success Criteria

### Functional Requirements

1. In a project whose active worktree declares `indexRange: [100, 799]` with
   `fileArch: 100-arch.<name>`, `cf next` on active slice 209 emits **no** band
   warning. (Issue #48's exact repro.)
2. When the active worktree is known and the slice index is outside its range,
   `cf next` emits exactly one warning naming that worktree and its range — even
   if a sibling worktree's range contains the index.
3. When the active worktree has `rangeOverride: true`, no band warning is emitted
   regardless of the index.
4. When worktrees are configured but no active worktree resolves, an index inside
   any worktree's range emits no warning; an index outside every range emits one
   warning listing the configured ranges and mentioning neither "band" nor
   "hundred".
5. When no worktrees are configured, the existing hundred-block-vs-arch warning is
   emitted with its message text byte-identical to today's.
6. `cf set slice <n>` and `cf next` agree: for the same project state, either both
   warn about the index or neither does.

### Technical Requirements

7. `isInIndexRange`, `getWorktreeIndexRange`, and `getWorktreeRangeOverride` exist
   in exactly one place (core); the CLI module re-exports rather than
   re-implements. `packages/cli/tests/utils/worktree-overlay.test.ts` passes
   unchanged against the re-exported symbols.
8. Unit tests cover all five branches (tiers 1-active, 1-union, 2, 3, plus
   `rangeOverride`), each asserting on warning presence *and* message content.
9. `pnpm -r build` clean; `pnpm -r test` green for core, cli, and mcp-server.
   (`packages/electron` has a known pre-existing unrelated failure in
   `TemplateProcessor.test.ts` — confirm it is unchanged, do not fix it here.)
10. No new `any`, no widening of `ProjectData`'s persisted shape.

### Verification Walkthrough

Run from the repo root against a scratch project at `/tmp/cf-919`. `cf` below
means the freshly built local CLI: `node packages/cli/dist/index.js`. This
section replaces the Phase 4 draft with the actual commands and output observed
during Phase 6, including two caveats discovered along the way.

**Setup**

```bash
pnpm -r build
mkdir -p /tmp/cf-919 && cd /tmp/cf-919
node <repo>/packages/cli/dist/index.js init --name cf919
node <repo>/packages/cli/dist/index.js set arch 100
# create project-documents/user/architecture/100-arch.cf919.md and a
# 100-slices.cf919.md plan containing an entry for slice 209, then:
node <repo>/packages/cli/dist/index.js set slice 209
```

**Step 1 — reproduce #48 on the current build (before the fix).**
With no worktrees configured yet, `cf next` warns — correct under the legacy
tier, and the baseline the fix must preserve:

```
$ node <repo>/packages/cli/dist/index.js next
Warning:   Slice 209 is outside the 100-band of architecture '100-arch.cf919'.

Next:      Create slice design (Phase 4)
Slice:     209-slice.scratch-slice
Phase:     Phase 4: Slice Design
Rationale: Slice 209 has no design document. Create a slice design before proceeding.
Run:       cf set phase 'Phase 4: Slice Design'
```

Confirmed verbatim, matching this section's original draft.

**Step 2 — configure a worktree that owns the range.**

**Caveat A — `worktree init --name default` collides with auto-migration.**
The project already has `fileArch`/`fileSlice` set at the top level from Setup.
`WorktreeService.addWorktree()` auto-migrates those fields into a synthetic
`default` worktree (range `[100, 799]`) the moment the *first* worktree is
created (`WorktreeService.ts:154-180`) — this is pre-existing behavior,
unrelated to this slice. If that first worktree is itself named `default`, the
migration's synthetic `default` and the explicitly-requested `default` collide,
and `chopDefaultRange()` throws (`Cannot shrink default worktree range —
artifact '100-arch.cf919' (index 100) would fall outside the new range [0,
0]...`) because there is no room left to shrink the migrated worktree around
itself. Workaround: create the first worktree under any *other* name — the
auto-migration produces the desired `default [100,799]` worktree for free,
already pointing at the existing `fileArch`/`fileSlice`:

```bash
$ node <repo>/packages/cli/dist/index.js worktree init --name secondary --range 900-999
Note: Existing workflow fields were migrated to a 'default' worktree context (range 100-799).
Worktree context 'secondary' created (900-999) on project 'cf919'.

$ node <repo>/packages/cli/dist/index.js next
Next:      Create slice design (Phase 4)
Slice:     209-slice.scratch-slice
Phase:     Phase 4: Slice Design
Rationale: Slice 209 has no design document. Create a slice design before proceeding.
Run:       cf set phase 'Phase 4: Slice Design'
```

*Before this slice:* the same 100-band warning still appears here.
*After this slice:* no `Warning:` line at all. This is the #48 fix, observed
end-to-end.

Cross-check the two commands now agree:

```bash
$ node <repo>/packages/cli/dist/index.js set slice 209
slice already set to 209-slice.scratch-slice on worktree context "default"
```

Silent on both surfaces, as expected.

**Step 3 — index outside the active worktree's range.**
Narrow the worktree and re-run:

```bash
$ node <repo>/packages/cli/dist/index.js worktree update default --range 100-199
Worktree context 'default' updated.

$ node <repo>/packages/cli/dist/index.js next
Warning:   Slice 209 is outside worktree 'default' range [100-199].

Next:      Create slice design (Phase 4)
Slice:     209-slice.scratch-slice
Phase:     Phase 4: Slice Design
Rationale: Slice 209 has no design document. Create a slice design before proceeding.
Run:       cf set phase 'Phase 4: Slice Design'
```

Exact match to the message format in Decision 2. Confirm `cf set slice 209`
emits its own equivalent warning — the two surfaces now agree (criterion 6):

```bash
$ node <repo>/packages/cli/dist/index.js set slice 209
Warning: index 209 is outside this worktree's range [100-199]
slice already set to 209-slice.scratch-slice on worktree context "default"
```

**Step 4 — union tier, no active worktree.**

**Caveat B — the union tier is unreachable through `cf next`/`workflow_next` for
any migrated project.** `WorktreeService.addWorktree()` unconditionally clears
`ProjectData`'s top-level `fileSlice`/`fileArch`/etc. into the worktree context
the moment a project migrates (`WorktreeService.ts:168-178`). `resolveProject()`
returns the *raw* project when no `worktreeId` is supplied or resolves
(`projectResolver.ts`: `if (!worktreeId) return project;`), so once any worktree
exists, an invocation with no active worktree sees an *empty* top-level
`fileSlice` and `getNext()` short-circuits to the "no active slice" / first-run
branch — it never reaches the band-warning check at all. Reproduced directly:

```bash
$ cd / && node <repo>/packages/cli/dist/index.js next --project cf919
Next:      Welcome to Context Forge! Start by setting your project phase.
Rationale: Your project is registered but no development phase is set. ...
```

No warning either way — not because the union tier is broken, but because the
band check is never reached in this state. This is a pre-existing property of
the migration model (it always clears top-level fields on first migration), not
something introduced or fixable within this slice's scope. The union-tier logic
itself is exercised directly at the unit level — see cases 4 and 5 in the Testing
Strategy table above and in
`packages/core/tests/introspection/WorkflowNavigator.test.ts` (`'no warning when
no active worktree resolves but the index is inside the union of configured
ranges'` and `'warns listing configured ranges when no active worktree resolves
and the index is outside all of them'`) — both pass, constructing a
`ResolvedProject` with `worktrees` set and no `resolvedWorktree`, which is the
only way this project shape can currently arise. Flagged to and accepted by the
Project Manager during Phase 6 rather than treated as a blocking defect.

**Step 5 — legacy fallback preserved.**
Remove all worktrees and re-run `cf next` with slice 209 / arch 100:

```bash
$ node <repo>/packages/cli/dist/index.js worktree rm secondary --yes
$ node <repo>/packages/cli/dist/index.js worktree rm default --yes
Note: Workflow fields were restored to project level (last worktree removed).

$ node <repo>/packages/cli/dist/index.js next
Warning:   Slice 209 is outside the 100-band of architecture '100-arch.cf919'.

Next:      Create slice design (Phase 4)
Slice:     209-slice.scratch-slice
Phase:     Phase 4: Slice Design
Rationale: Slice 209 has no design document. Create a slice design before proceeding.
Run:       cf set phase 'Phase 4: Slice Design'
```

Byte-identical to Step 1, confirmed.

**Step 6 — MCP parity.**
`workflow_next`'s handler (`workflowTools.ts:191-203`) calls the exact same
`resolveProject()` + `nav.getNext(project)` path as `cf next`, so they are
guaranteed to agree at the code level, and the full `mcp-server` suite (190
tests, including `mcpIntegration.test.ts`) passes against this build. Live
verification against the session's connected `context-forge` MCP tool was
attempted but was inconclusive: that MCP server is a long-running process that
predates this branch's changes, so it returned the pre-fix warning even when
called with an explicit `worktreeId` pointing at the reconfigured `default
[100,799]` worktree, while the freshly-built local CLI on the same project state
correctly returned no warning in the same moment. This is evidence of a stale
running process, not of a code-level MCP/CLI divergence — restarting that server
(picking up the rebuilt `@context-forge/mcp` package) would resolve it, but
restarting an externally-connected MCP server is outside this session's control.

## Implementation Notes

### Development Approach

Suggested order — each step leaves the build green:

1. Move the three range helpers into core; export from `index.ts`; convert the CLI
   module to a re-export. Run `pnpm -r build` and the CLI test suite: the existing
   `packages/cli/tests/utils/worktree-overlay.test.ts` is the regression guard for
   this step and must pass untouched.
2. Move `ResolvedProject` into `types/project.ts`; re-export from
   `projectResolver.ts`; widen `getNext()`'s parameter type. No behavior change —
   build must stay green with zero call-site edits.
3. Replace the band-check block with the tiered logic. Extract it into a small
   private method (e.g. `resolveBandWarning()`) rather than inlining ~25 lines
   into `getNext()`, which is already long.
4. Add the unit tests.
5. Full verification pass per criterion 9 plus the walkthrough above.

Steps 1 and 2 are pure moves. If either produces a behavioral diff, stop — that is
evidence of a hidden coupling, not something to work around.

### Testing Strategy

New tests go in `packages/core/tests/introspection/WorkflowNavigator.test.ts`,
extending the existing band-warning describe block. That file is already 1211
lines and wants splitting — that is tracked as its own maintenance item and is
**not** in scope here; do not split it as part of this slice.

Cases (all via the existing `makeProject()` helper, which accepts `worktrees`):

| # | worktrees | resolvedWorktree | slice | expect |
|---|---|---|---|---|
| 1 | `default [100,799]` | `default` | 209 | no warning (#48 regression) |
| 2 | `default [100,199]`, `api [200,299]` | `default` | 209 | warns, names `'default'` and `[100-199]` |
| 3 | `default [100,199]` (`rangeOverride`) | `default` | 209 | no warning |
| 4 | `default [100,799]` | none | 209 | no warning |
| 5 | `default [100,799]` | none | 850 | warns, lists ranges, contains neither `band` nor `hundred` |
| 6 | none | none | 209 | legacy `outside the 100-band` warning, text unchanged |

Cases 2 and 3 are the ones PR #49 does not cover.

### Relationship to PR #49

[PR #49] (`jakez-gh:fix/band-warning-honors-worktree-range`, open since 20260604)
implements tiers 1-union, 2, and 3 with three unit tests. This design supersedes
it on three points: the active-worktree preference (Decision 1), the helper
relocation to avoid a duplicated containment predicate (Decision 3), and hyphen
range rendering (Decision 2). Its three tests map onto cases 4, 5, and 6 above.

Close #49 with an explicit acknowledgement of the contribution and a pointer to
the superseding commit and to this document — the reporter did the diagnosis, and
the tier contract implemented here is theirs.

[#49]: https://github.com/ecorkran/context-forge/pull/49
[PR #49]: https://github.com/ecorkran/context-forge/pull/49
