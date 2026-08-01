---
docType: tasks
slice: sliceplanparser-deprecated-entry-handling
project: context-forge
lld: user/slices/918-slice.sliceplanparser-deprecated-entry-handling.md
dependencies: [910]
projectState: Slice 920 merged to main. STATUS.Deprecated already exists and is already consumed by deriveEntryStatus() and findFirstNotCompleteEntry() for frontmatter-sourced deprecation. Gap is parser-level only — a [~] plan line is silently dropped instead of producing a Deprecated entry.
dateCreated: 20260731
dateUpdated: 20260731
status: complete
---

<!-- Task 12 extended 20260731 to add arch-status-vs-plans coverage per
     review finding F001 (project-documents/user/reviews/918-review.tasks.sliceplanparser-deprecated-entry-handling.md).
     Resolution recorded here per feedback-review-verdict-provenance: the
     review document itself is left as originally written, not rewritten. -->

## Context Summary

- Working on slice 918: `slicePlanParser.ts` silently drops any plan line using
  the `[~]` deprecated/descoped checkbox convention (GitHub #61) instead of
  parsing it into a `Deprecated`-status entry.
- `STATUS.Deprecated` and its consumers (`deriveEntryStatus()`,
  `findFirstNotCompleteEntry()`, `renderEntryStatus()`) already exist and
  already work correctly for the frontmatter-sourced case (slice 910 +
  earlier work) — this slice adds the second source (the plan line itself)
  and threads it through. No new types, no new status values.
- Dependencies: slice 910 (STATUS const) — complete on `main`.
- Delivers: `[~]` plan lines parse into `Deprecated` entries (indexed and
  unindexed formats), count as resolved for `completedSlices` arithmetic,
  render as `⊘ deprecated` in `cf list slices`, and are skipped by
  `cf next`/`findFirstNotCompleteEntry` — without a slice-design doc or task
  file ever needing to exist.
- Next planned slice: 919 (Band Warning Respects Worktree indexRange), still
  queued.

---

## Tasks

- [x] 1. Add real-format `[~]` fixture data to the slice-plan test fixture
  - [x] Edit `packages/core/tests/fixtures/introspection/sample-slice-plan.md`:
        add one indexed `[~]` line (e.g. under "Feature Slices",
        `6. [~] **(106) Feature Delta** — descoped, superseded by native tooling.`)
        and one unindexed `[~]` line (e.g. under the same section,
        `7. [~] Feature Epsilon without explicit index — cut for scope.`)
  - [x] Success: fixture file contains both forms verbatim, matching the
        existing line style/format already used by the `[ ]`/`[x]` entries
        in that file (same list-numbering, same `**Name**` bold-wrap for the
        indexed form). Do not alter any existing line in the fixture.
  - [x] Note: this task intentionally comes first — per the CLAUDE.md
        lenient-parsing rule, the regression fixture must exist before the
        parser change, so the "before" state (entries silently dropped) can
        be observed if desired and the "after" state is proven against real
        input, not a synthetic minimal case.

- [x] 2. Widen slicePlanParser regex character classes to accept `~`
  - [x] In `packages/core/src/introspection/parsers/slicePlanParser.ts`,
        change `PLAN_INDEXED_RE`'s checkbox group from `[ xX]` to `[ xX~]`
        (line ~6).
  - [x] Change `PLAN_UNINDEXED_RE`'s checkbox group identically (line ~9).
  - [x] Do not change any other part of either regex.
  - [x] Success: both regexes match a `[~]` line without altering matches for
        `[ ]`, `[x]`, `[X]`.

- [x] 3. Set `status: STATUS.Deprecated` on `~`-checkbox entries in the parser
  - [x] In the indexed-format branch of `parseSlicePlan()` (around line 55),
        compute the entry's `status` as: `STATUS.Deprecated` when the
        captured checkbox character is `~`; otherwise the existing
        `isChecked ? STATUS.Complete : STATUS.NotStarted` logic, unchanged.
  - [x] Apply the identical logic in the unindexed-format branch (around
        line 72).
  - [x] `isChecked` stays `false` for a `~` entry in both branches — do not
        set it to `true`. Deprecation is a distinct terminal state, not a
        completion.
  - [x] Success: no new field added to `SlicePlanEntry` — `status` already
        accepts `STATUS.Deprecated` per its `NormalizedStatus` type. Only the
        value assignment logic changes.

- [x] 4. Update `completedSlices` computation for deprecated-as-resolved
  - [x] In `parseSlicePlan()`, change the `completedSlices` computation
        (currently `entries.filter((e) => e.isChecked).length`) to also count
        entries whose `status === STATUS.Deprecated`:
        `entries.filter((e) => e.isChecked || e.status === STATUS.Deprecated).length`.
  - [x] Do not change `totalSlices` (`entries.length` — unchanged, deprecated
        entries are still real planned entries).
  - [x] Success: a plan where every entry is either checked or `[~]` produces
        `completedSlices === totalSlices`.

- [x] 5. Unit test: slicePlanParser handles `[~]` entries (indexed + unindexed)
  - [x] In `packages/core/tests/introspection/slicePlanParser.test.ts`, add
        test cases against the fixture from Task 1:
        - The indexed `[~]` entry parses with `status: 'deprecated'`,
          `isChecked: false`, correct `index`/`name`/`description`,
          `indexSource: 'explicit'`.
        - The unindexed `[~]` entry parses with `status: 'deprecated'`,
          `isChecked: false`, `indexSource: 'fallback'`.
        - Neither entry is dropped from `result.entries` (assert length
          includes both new entries alongside the existing 5).
  - [x] Update the existing `totalSlices`/`completedSlices` test (currently
        asserts `totalSlices: 5`, `completedSlices: 3`) to account for the two
        new fixture entries: `totalSlices: 7`, `completedSlices: 5` (3
        existing checked + 2 new deprecated).
  - [x] Add an explicit regression test asserting existing `[ ]`/`[x]`/`[X]`
        parsing is unchanged (byte-identical `status`/`isChecked` values for
        the pre-existing fixture entries) — proves Task 2's regex widening
        introduced no regression.
  - [x] Success: `pnpm --filter @context-forge/core test -- slicePlanParser`
        passes.
  - [x] Commit: `fix(core): parse [~] plan-line entries as deprecated`

- [x] 6. Add `planLineStatus` signal to `EntryStatusSignals`
  - [x] In `packages/core/src/introspection/statusDerivation.ts`, add an
        optional field to `EntryStatusSignals`:
        `planLineStatus?: NormalizedStatus` — documented as "the slice-plan
        line's own checkbox-derived status (`[~]` → deprecated)".
  - [x] In `deriveEntryStatus()`, change the top-precedence check from
        `if (signals.frontmatterStatus === STATUS.Deprecated)` to
        `if (signals.planLineStatus === STATUS.Deprecated || signals.frontmatterStatus === STATUS.Deprecated)`.
  - [x] Do not otherwise reorder the precedence lattice (deferred check,
        task-inferred check, frontmatter-only check, checkbox fallback all
        stay as-is).
  - [x] Success: function signature change is additive (optional field);
        existing callers that don't pass `planLineStatus` are unaffected.

- [x] 7. Unit test: `deriveEntryStatus` respects `planLineStatus`
  - [x] In `packages/core/tests/introspection/statusDerivation.test.ts`, add
        cases mirroring the existing frontmatter-deprecated tests:
        - `planLineStatus: STATUS.Deprecated` wins regardless of
          `taskInferredStatus`/`isChecked` (mirror the existing "deprecated
          frontmatter wins" test at lines 6-22).
        - `planLineStatus: STATUS.Deprecated` and `frontmatterStatus:
          STATUS.Complete` together still resolve to `Deprecated` (plan-line
          signal is not overridden by a stale/contradictory frontmatter
          value).
        - Omitting `planLineStatus` entirely (existing tests, unmodified)
          continues to pass — proves the new field is additive.
  - [x] Success: `pnpm --filter @context-forge/core test -- statusDerivation`
        passes, including all pre-existing cases unchanged.
  - [x] Commit: `feat(core): add planLineStatus signal to deriveEntryStatus`

- [x] 8. Wire `planLineStatus` into `WorkflowNavigator.resolveEntryStatus`
  - [x] In `packages/core/src/introspection/WorkflowNavigator.ts`,
        `resolveEntryStatus()` (~line 692), add
        `planLineStatus: entry.status === STATUS.Deprecated ? STATUS.Deprecated : undefined`
        to the `deriveEntryStatus({...})` call's argument object.
  - [x] `entry` here is already typed
        `Pick<SlicePlanEntry, 'index' | 'isChecked'>` — widen the `Pick` to
        also include `'status'` so `entry.status` is available at this call
        site.
  - [x] Success: builds clean; no other call site of `resolveEntryStatus`
        breaks (its only caller passes a full `SlicePlanEntry`, so widening
        the `Pick` is a compatible narrowing-relaxation, not a breaking
        change).

- [x] 9. Wire `planLineStatus` into `cf list slices` (`sliceListAction`)
  - [x] In `packages/cli/src/commands/slice.ts` (~lines 88-127), add the same
        `planLineStatus: entry.status === STATUS.Deprecated ? STATUS.Deprecated : undefined`
        argument to the inline `deriveEntryStatus({...})` call.
  - [x] Also update the `derivedStatus` initializer above the try block
        (line 91, currently `entry.isChecked ? STATUS.Complete :
        STATUS.NotStarted`) to check for a `[~]` entry first:
        `entry.status === STATUS.Deprecated ? STATUS.Deprecated : entry.isChecked ? STATUS.Complete : STATUS.NotStarted`.
        This initializer is the fallback used if `detectDocuments` throws
        before `deriveEntryStatus()` runs — without this, a `[~]` entry with
        no design/task docs would still resolve correctly via the try block,
        but a filesystem error would incorrectly report it as `not-started`
        instead of `deprecated`.
  - [x] Success: builds clean.

- [x] 10. Integration test: `cf list slices` renders a `[~]` entry as deprecated with no design/task docs
  - [x] In `packages/cli/tests/commands/list-derived-status.test.ts`, add a
        test case following the file's existing real-scratch-filesystem
        pattern (`writeSlicePlan`, no `writeSliceDesign`/task file for this
        entry): write a plan containing one `[~]` entry with **no**
        corresponding slice-design or task file, call `sliceListAction`, and
        assert the JSON output's matching entry has `status: 'deprecated'`
        and `isNext: false`.
  - [x] Add a second case: a plan whose only non-checked entry is `[~]` and
        all other entries are `[x]` — assert `isNext` is `false` for every
        entry (no entry is offered as "next").
  - [x] Success: `pnpm --filter @context-forge/cli test -- list-derived-status`
        passes.
  - [x] Commit: `feat(core,cli): thread plan-line deprecated status through resolveEntryStatus and cf list slices`

- [x] 11. Verify `findFirstNotCompleteEntry`/`cf next` already skip a plan-line-deprecated entry
  - [x] In `packages/core/tests/introspection/WorkflowNavigator.test.ts`, add
        a test mirroring the existing "a 'deferred' slice-design status is
        recognized... and is skipped by getNext like deprecated" test
        (~line 1073): construct a slice plan where the first not-checked
        entry is `[~]` with no slice-design/task file, call `getNext()`, and
        assert it skips past to the next genuine candidate (or reports the
        plan/initiative complete if none remain).
  - [x] This task should require **no production code change** — it verifies
        that Task 8's wiring is sufficient for `findFirstNotCompleteEntry`
        (which already excludes `STATUS.Deprecated`, per the slice design's
        Decision 5) to behave correctly. If the test fails, stop and report
        to the Project Manager rather than guessing at a fix — that would
        indicate the design's Decision 5 analysis was wrong.
  - [x] Success: `pnpm --filter @context-forge/core test -- WorkflowNavigator`
        passes.
  - [x] Commit: `test(core): verify getNext skips plan-line deprecated entries`

- [x] 12. Regression test: `ConsistencyChecker` plan-status-vs-entries and arch-status-vs-plans with a deprecated entry
  - [x] Locate the existing test(s) for the `plan-status-vs-entries` rule
        (search `ConsistencyChecker.test.ts` for `'plan-status-vs-entries'`).
  - [x] Add a case: a slice plan with frontmatter `status: complete` where
        every entry is either `[x]` or `[~]` (at least one of each) — assert
        the rule does **not** produce a `plan-status-vs-entries` finding.
  - [x] Add a complementary case: same plan, frontmatter `status: in-progress`
        (not complete) with the same all-checked-or-deprecated entries —
        assert the rule **does** fire (the existing "all entries checked but
        plan status isn't complete" direction), proving deprecated-as-resolved
        arithmetic didn't disable that half of the rule.
  - [x] Locate the existing test(s) for the `arch-status-vs-plans` rule
        (search `ConsistencyChecker.test.ts` for `'arch-status-vs-plans'`).
        Success Criterion 6 names both rules; they consume the same
        `completedSlices`/`totalSlices` arithmetic but are separate rule
        invocations, so `arch-status-vs-plans` needs its own direct
        assertion rather than relying on the `plan-status-vs-entries`
        coverage above as a proxy (per design-review finding F001).
  - [x] Add a case: an architecture doc with frontmatter `status: complete`
        whose underlying slice plan has every entry either `[x]` or `[~]`
        (at least one of each) — assert the rule does **not** produce an
        `arch-status-vs-plans` finding.
  - [x] Add a complementary case: same architecture/plan, frontmatter
        `status: in-progress` (not complete) with the same
        all-checked-or-deprecated plan entries — assert the rule **does**
        fire, proving deprecated-as-resolved arithmetic didn't disable that
        half of the rule either.
  - [x] Success: `pnpm --filter @context-forge/core test -- ConsistencyChecker`
        passes, with distinct assertions for both `plan-status-vs-entries`
        and `arch-status-vs-plans`.
  - [x] Commit: `test(core): verify plan-status-vs-entries and arch-status-vs-plans handle deprecated plan entries`

- [x] 13. Full verification pass
  - [x] Run `pnpm -r build` — confirm all packages build clean.
  - [x] Run `pnpm -r test` — confirm full suite green (core, cli, mcp-server),
        no regressions outside the files touched above.
  - [x] Manually verify against the walkthrough in
        `user/slices/918-slice.sliceplanparser-deprecated-entry-handling.md`
        ("Verification Walkthrough" section, steps 1-6) using a scratch
        project pointed at a plan file containing a `[~]` line.
  - [x] Success: build clean, full test suite green, walkthrough steps
        confirmed manually.
  - [x] Commit (if any uncommitted changes remain, e.g. fixture tweaks found
        during manual verification): `fix: address verification-pass findings for slice 918`
