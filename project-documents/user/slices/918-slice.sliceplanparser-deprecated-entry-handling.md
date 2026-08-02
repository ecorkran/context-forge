---
docType: slice-design
slice: sliceplanparser-deprecated-entry-handling
project: context-forge
parent: project-documents/user/architecture/900-slices.maintenance-and-refactoring.md
dependencies: [910]
interfaces: []
dateCreated: 20260731
dateUpdated: 20260731
status: complete
---

# Slice Design: slicePlanParser `[~]` Deprecated-Entry Handling

## Overview

Fixes GitHub issue #61. `slicePlanParser.ts`'s two entry regexes (`PLAN_INDEXED_RE`,
`PLAN_UNINDEXED_RE`) use the checkbox character class `[ xX]`. A plan line marked
`[~]` — the descoped/deprecated convention referenced in issue #54's repro —
matches neither regex, so the whole line fails the match and the entry is
**silently dropped**: not errored, not defaulted to `not-started`, just absent
from `parseSlicePlan()`'s `entries`, and silently excluded from
`totalSlices`/`completedSlices`. This is the exact "parser silently drops
valid-looking input" failure the CLAUDE.md lenient-parsing rule prohibits, and
it's the one place a plan-line-level deprecation can be recorded for a slice
that never got a slice-design doc (so there's no frontmatter to carry
`status: deprecated`).

Dependency `910` (Centralize NormalizedStatus Value References) is already
complete on `main`: the `STATUS` const and `STATUS.Deprecated` exist today in
`packages/core/src/introspection/types.ts`, and `deriveEntryStatus()` /
`findFirstNotCompleteEntry()` already treat frontmatter-sourced
`STATUS.Deprecated` as a terminal, skip-worthy state. **This significantly
narrows 918's scope**: no new status value, no new type, no new derivation
branch is needed. The only gap is that the deprecated signal currently has
exactly one source (slice-design frontmatter) and needs a second: the plan
line's `[~]` marker itself, for slices that never got a design doc.

## Current Behavior (confirmed by code reading)

- `packages/core/src/introspection/parsers/slicePlanParser.ts:6,9` — both
  regexes require the bracket content to be `[ xX]`. A `~` fails the whole
  match; the `for` loop's indexed/unindexed branches both fall through with no
  `else`, so the line is skipped with no warning, no entry, no count.
- `packages/core/src/introspection/types.ts:21-37` — `SlicePlanEntry.status` is
  already typed as the full `NormalizedStatus` union (includes
  `STATUS.Deprecated`), so no type widening is required to hold a deprecated
  plan-line entry.
- `packages/core/src/introspection/statusDerivation.ts:30-44` —
  `deriveEntryStatus()` already returns `STATUS.Deprecated` when
  `signals.frontmatterStatus === STATUS.Deprecated`. It has no parameter for a
  plan-line-sourced deprecated signal today.
- `packages/core/src/introspection/WorkflowNavigator.ts:692-724`
  (`resolveEntryStatus`) builds `EntryStatusSignals` from the task file and
  slice-design frontmatter only — it never reads `entry.status` (the value
  `parseSlicePlan()` set on the `SlicePlanEntry` itself). A plan-line-only
  deprecated marker would be computed by the parser but then discarded here.
- `packages/core/src/introspection/WorkflowNavigator.ts:762-775`
  (`findFirstNotCompleteEntry`) already excludes `STATUS.Deprecated` (and
  `Deferred`) from "next" candidacy — this needs no change, **provided** the
  entry it receives actually carries `Deprecated` by the time it gets here.
- `packages/cli/src/commands/slice.ts:88-152` (`cf list slices` / `sliceListAction`)
  independently re-derives `derivedStatus` per entry via the same
  frontmatter/task-file signals (duplicating `resolveEntryStatus`'s logic
  rather than calling it) and separately excludes `Complete`/`Deprecated`/`Deferred`
  from `isNext`. This file needs the same plan-line signal threaded through.
- `packages/cli/src/output/entryStatusDisplay.ts:18-19` — `renderEntryStatus()`
  already has a `STATUS.Deprecated` case (`⊘ deprecated`, dimmed). No display
  changes needed once `derivedStatus` correctly carries `deprecated`.
- `packages/core/src/introspection/ConsistencyChecker.ts:726,749,828,849` — two
  rules (`plan-status-vs-entries`, `arch-status-vs-plans`) compute
  `allComplete = completedSlices === totalSlices` and flag a mismatch against
  the plan/arch frontmatter `status` field. **This is the one place the design
  must make an explicit call** (see Decision 3 below): a `[~]` entry is never
  `isChecked`, so if it counts toward `totalSlices` without ever counting
  toward `completedSlices`, a plan containing one deprecated entry can never
  satisfy `allComplete`, permanently false-flagging `plan-status-vs-entries`
  once a human sets the plan's own frontmatter `status: complete`.

## Decisions

### Decision 1 — Widen the checkbox character class, do not change format shape

Change `[ xX]` → `[ xX~]` in both `PLAN_INDEXED_RE` and `PLAN_UNINDEXED_RE`.
No other part of either regex changes — the `~` is a checkbox-state character,
not a new line format. `isChecked` stays `false` for a `~` line (it was never
completed; deprecation is a distinct, terminal non-completion state).

### Decision 2 — Deprecated is plan-line-sourced status, computed once in the parser

`parseSlicePlan()` sets `status: STATUS.Deprecated` directly on the
`SlicePlanEntry` when the checkbox character is `~` (case-sensitive, `~` has
no upper/lower variant to normalize). This mirrors the existing convention
where `isChecked` drives `status: Complete | NotStarted` inline in the parser
— deprecated is a third checkbox-driven value at the same layer, not a
downstream derivation.

No new field is added to `SlicePlanEntry`. `status` already carries it because
its type is the full `NormalizedStatus` union (confirmed above). This keeps
the change additive and avoids touching `ResolvedSlicePlanEntry`,
`SlicePlanResult`, or any consumer's type signature.

### Decision 3 — Deprecated entries count as "resolved" for totalSlices/completedSlices arithmetic

To avoid the permanent-false-positive failure mode identified above
(`plan-status-vs-entries` / `arch-status-vs-plans` never reaching
`allComplete` once any entry is deprecated), `completedSlices` counts entries
where `isChecked || status === STATUS.Deprecated`. `totalSlices` is unchanged
(count of all entries, deprecated included — the entry is real and planned,
just descoped).

Rationale: deprecated is a terminal "this will never be checked, by design"
state, the same way `STATUS.Deferred` is a terminal "not now" state already
excluded from `findFirstNotCompleteEntry`. Excluding deprecated entries from
the completion denominator would let one deprecated entry silently mask a plan
that's otherwise 100% checked-or-resolved; counting them toward the numerator
(alongside checked entries) instead lets `allComplete` mean what its callers
already assume it means: "nothing left to do here." This is a narrow, local
arithmetic change inside `parseSlicePlan()` — `isChecked` on the entry itself
is untouched (still `false` for `~`), only the aggregate `completedSlices`
count changes.

### Decision 4 — Thread the plan-line signal through resolveEntryStatus and cf list slices

`EntryStatusSignals` (`statusDerivation.ts`) gains one new optional field:

```ts
export interface EntryStatusSignals {
  frontmatterStatus?: NormalizedStatus;
  taskInferredStatus?: NormalizedStatus;
  /** The slice-plan line's own checkbox-derived status (`[~]` → deprecated). */
  planLineStatus?: NormalizedStatus;
  isChecked: boolean;
}
```

`deriveEntryStatus()`'s precedence lattice adds `planLineStatus` at the
**highest** precedence tier, alongside frontmatter-deprecated/deferred: a
plan-line `[~]` is definitionally true regardless of what a stale task file or
slice-design frontmatter says (mirrors the file-level `frontmatterStatus ===
Deprecated` short-circuit already at the top of the function). Concretely:

```ts
export function deriveEntryStatus(signals: EntryStatusSignals): NormalizedStatus {
  if (signals.planLineStatus === STATUS.Deprecated || signals.frontmatterStatus === STATUS.Deprecated) {
    return STATUS.Deprecated;
  }
  if (signals.frontmatterStatus === STATUS.Deferred) {
    return STATUS.Deferred;
  }
  ...
}
```

`WorkflowNavigator.resolveEntryStatus()` (`WorkflowNavigator.ts:692-724`)
passes `planLineStatus: entry.status === STATUS.Deprecated ? STATUS.Deprecated : undefined`
into the `deriveEntryStatus()` call — the one line needed to stop discarding
the parser's signal.

`cf list slices` (`packages/cli/src/commands/slice.ts:88-138`) gets the same
one-line addition to its inline `deriveEntryStatus({...})` call. This file
already duplicates `resolveEntryStatus`'s signal-gathering rather than calling
it — that duplication is pre-existing and out of scope to refactor here; the
fix is applied at both call sites identically, consistent with how the
existing frontmatter/task-file signals are already duplicated across both.

### Decision 5 — findFirstNotCompleteEntry and isNext need no change

Both `WorkflowNavigator.findFirstNotCompleteEntry()` (line 762-775) and `cf
list slices`' inline `isNext`/`firstNotComplete` checks (`slice.ts:130-135,
143-148`) already exclude `STATUS.Deprecated`. Once Decision 4 makes
`entry.status`/`derivedStatus` correctly resolve to `Deprecated` for a `[~]`
line, these existing exclusions apply with zero code change. Confirmed by
reading both call sites — this is the payoff of dependency 910 already being
complete.

## Data Flow

```
plan line "3. [~] **(103) Feature Alpha** — descoped, superseded by X"
        │
        ▼
parseSlicePlan()  (PLAN_INDEXED_RE / PLAN_UNINDEXED_RE, widened to [ xX~])
        │  isChecked = false
        │  status = STATUS.Deprecated   (Decision 2)
        │  description = "descoped, superseded by X"  (existing capture, unchanged)
        ▼
SlicePlanEntry { index: 103, status: 'deprecated', isChecked: false, ... }
        │
        ├─► completedSlices arithmetic: counted as resolved (Decision 3)
        │
        ▼
WorkflowNavigator.resolveEntryStatus() / cf list slices inline equivalent
        │  planLineStatus: entry.status === Deprecated ? Deprecated : undefined
        ▼
deriveEntryStatus({ planLineStatus, frontmatterStatus, taskInferredStatus, isChecked })
        │  planLineStatus (or frontmatterStatus) === Deprecated → return Deprecated
        ▼
ResolvedSlicePlanEntry.status = 'deprecated'
        │
        ├─► findFirstNotCompleteEntry() — already skips Deprecated (no change)
        ├─► cf list slices table — renderEntryStatus() already renders "⊘ deprecated" (no change)
        └─► cf next — already won't offer it as next (no change, via findFirstNotCompleteEntry)
```

## Scope

In scope:
- `slicePlanParser.ts`: widen both regex character classes to `[ xX~]`; set
  `status: STATUS.Deprecated` when the checkbox char is `~`; adjust
  `completedSlices` computation per Decision 3.
- `statusDerivation.ts`: add `planLineStatus?: NormalizedStatus` to
  `EntryStatusSignals`; add it to the top-precedence branch in
  `deriveEntryStatus()`.
- `WorkflowNavigator.ts` (`resolveEntryStatus`): pass `planLineStatus` derived
  from `entry.status`.
- `slice.ts` (`sliceListAction`): same one-line addition to its inline
  `deriveEntryStatus()` call.
- Real-format regression fixture: extend the existing
  `packages/core/tests/fixtures/introspection/sample-slice-plan.md` (or add a
  sibling fixture) with an actual `[~]` line in both indexed and unindexed
  form, matching the exact convention from issue #54's repro (`[~]` with a
  trailing rationale/description).
- Unit tests: `slicePlanParser.test.ts` (parses `~` into a `Deprecated` entry,
  `isChecked: false`, counted in `completedSlices`), `statusDerivation.test.ts`
  if it exists (or add coverage — `planLineStatus` precedence), CLI-level test
  for `cf list slices` rendering a deprecated plan-line entry, and a
  `findFirstNotCompleteEntry`/`cf next` regression proving a `[~]` entry is
  skipped when it's the first non-complete-by-checkbox entry in the plan.

Out of scope:
- Any change to `ConsistencyChecker.ts` rules beyond the arithmetic effect of
  Decision 3 flowing through automatically (`completedSlices` is computed
  once, in the parser; the checker rules consume it unchanged). No new
  `ConsistencyChecker` rule is being added for `[~]` entries specifically.
- Refactoring `cf list slices`' duplicated signal-gathering into a shared call
  to `resolveEntryStatus()` — pre-existing duplication, not created by this
  slice, not worth the risk of a broader refactor in a Low–Medium risk slice.
- `discoverAllSlicePlans()` / cross-plan aggregation changes (that's slice
  913's `indexSource` scoping concern, unrelated).
- Real-YAML frontmatter parsing (issue #65, tracked separately).
- Any UI/tool-guide vocabulary change to the `[~]` convention itself — it's
  already referenced in issues #54/#61 as the established convention; this
  slice makes the parser honor it, not redefine it.

## Cross-Slice Dependencies

- Depends on **910** (STATUS const) — complete on `main`. Confirmed
  `STATUS.Deprecated` exists at `packages/core/src/introspection/types.ts:6`
  and is already consumed by `deriveEntryStatus()` and
  `findFirstNotCompleteEntry()`.
- No downstream slice currently depends on 918.
- Related-but-distinct: issue #54 (closed) — `cf next` ignoring
  frontmatter-level `status: deprecated` on slices that already have a design
  doc. That path already works via `deriveEntryStatus()`'s existing
  `frontmatterStatus` branch. 918 covers the complementary case: a slice with
  **no** design doc, where the plan line is the only place deprecation can be
  recorded.

## Success Criteria

- A plan line `N. [~] **(NNN) Name** — rationale` parses into a
  `SlicePlanEntry` with `status: 'deprecated'`, `isChecked: false`, and the
  rationale captured as `description` — not silently dropped.
- The unindexed form `N. [~] **Name** — rationale` parses equivalently (using
  the sequential-counter index fallback, same as today's unindexed `[ ]`/`[x]`
  handling).
- `totalSlices` includes the deprecated entry; `completedSlices` counts it as
  resolved (Decision 3) — a plan with N entries, all checked or deprecated,
  satisfies `completedSlices === totalSlices`.
- `cf list slices` renders the entry with the existing `⊘ deprecated` display
  and never marks it `← next`.
- `cf next` / `findFirstNotCompleteEntry` skip a `[~]` entry with no design
  doc and no task file, advancing to the next genuine candidate (or reporting
  the plan/initiative complete if it was the last remaining entry).
- `ConsistencyChecker`'s `plan-status-vs-entries` / `arch-status-vs-plans`
  rules do not false-positive when a plan's frontmatter is `status: complete`
  and its only non-checked entry is a `[~]` deprecated one.
- Existing PLAN_INDEXED_RE/PLAN_UNINDEXED_RE behavior for `[ ]`/`[x]`/`[X]` is
  byte-identical (regression-free) — proven by the existing
  `sample-slice-plan.md` fixture tests continuing to pass unchanged.

## Verification Walkthrough

**Verified 20260731** against a real scratch project, using the freshly built
local CLI (`node packages/cli/dist/index.js ...`, not a possibly-stale global
install) after `pnpm -r build`. Actual commands and output below.

1. Fixture used (`project-documents/user/architecture/900-slices.scratch-test.md`,
   frontmatter `status: complete`):
   ```
   ## Feature Slices

   1. [x] **(101) Feature One** — done.

   2. [~] **(102) Feature Two** — descoped, superseded by native tooling.
   ```
2. `cf list slices --json`:
   ```json
   {
     "slicePlan": "900-slices.scratch-test",
     "total": 2,
     "completed": 2,
     "entries": [
       { "index": 101, "name": "Feature One", "isChecked": true, "status": "complete", "isNext": false },
       { "index": 102, "name": "Feature Two", "isChecked": false, "status": "deprecated", "isNext": false }
     ]
   }
   ```
   Confirmed: entry 102 has `"status": "deprecated"`, `"isChecked": false`, and
   `total`/`completed` are both `2` (Decision 3's arithmetic).
3. `cf list slices` (table form):
   ```
     #    Slice        Status        File
     ───  ───────────  ────────────  ────
     101  Feature One  ✓ complete    —
     102  Feature Two  ⊘ deprecated  —
   ```
   Confirmed: renders `⊘ deprecated`, no `← next` indicator on entry 102.
4. `cf next` / `cf status --json`: with entry 101 complete and entry 102
   deprecated, there is no genuine remaining candidate — `cf status --json`
   reports `"activeSlice": {"status": "no-active-slice"}` with
   `"slicePlan": {"completed": 2, "total": 2}`; entry 102 is never offered
   (confirmed via `isNext: false` in step 2's output). Caveat: `cf next`'s
   text output for a project with no active slice yet uses generic
   first-time-setup wording ("Pick your first slice to begin") rather than
   an explicit "plan complete" message — this is pre-existing `cf next`
   behavior for the "no active slice selected" case, not specific to `[~]`
   handling, and the underlying skip-the-deprecated-entry behavior is
   correctly proven by `isNext: false` and by the dedicated `getNext()` unit
   test (Task 11, `WorkflowNavigator.test.ts`) which asserts the exact
   skip-to-next-candidate path with an active slice already set.
5. With the plan frontmatter at `status: complete` (as in step 1's fixture):
   `cf check` → `No inconsistencies found`. Then, to prove the rule's other
   direction still works (not just disabled), the frontmatter was changed to
   `status: in-progress` with the same all-resolved entries: `cf check` →
   ```
     ⚠ All 2 entries are checked but plan status is "in-progress"
       → Update plan frontmatter status to "complete"
   1 finding: 1 warning
   ```
   Confirmed: `plan-status-vs-entries` does not false-positive when complete,
   and still correctly fires when the frontmatter doesn't match — Decision 3's
   arithmetic didn't disable the rule, only fixed its false-positive case.
6. Full suite: `pnpm -r build` (all 5 packages clean) and `pnpm -r test` —
   `@context-forge/core` 1032/1032, `@context-forge/cli` 471/471,
   `@context-forge/mcp-server` 190/190, all passing, including
   `slicePlanParser.test.ts`, `statusDerivation.test.ts`,
   `list-derived-status.test.ts`, `WorkflowNavigator.test.ts`, and
   `ConsistencyChecker.test.ts`'s new cases. `@context-forge/electron` has one
   pre-existing, unrelated failure (`TemplateProcessor.test.ts`, a stale
   assertion in a private/deprecated package) confirmed present before any
   slice 918 changes — not a regression introduced by this slice.

Caveat discovered during implementation: adding fixture data mixing indexed
and unindexed `[~]` entries within a single plan file exposed a pre-existing,
unrelated parser behavior where unindexed entries' auto-generated fallback
index can numerically collide with real indexed entries in the same file.
This is orthogonal to `[~]` support and was resolved by placing the indexed
and unindexed `[~]` test cases in separate fixture files
(`sample-slice-plan.md` and `unindexed-slice-plan.md` respectively). Filed as
[GitHub #67](https://github.com/ecorkran/context-forge/issues/67) for future
work — not in scope for this slice.

## Notes

This slice's design review is expected to be a normal review (not
`review: none`) given it touches shared parsing/derivation logic consumed by
`cf next`, `cf list slices`, and `cf check` — set at task-breakdown time per
the Project Manager's direction if a lighter path is preferred.
