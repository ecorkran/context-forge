---
docType: tasks
slice: unify-canonical-status-vocabulary
project: context-forge
lld: user/slices/922-slice.unify-canonical-status-vocabulary.md
dependencies: [910]
projectState: main is green, working tree clean at 7d89d6e. STATUS in introspection/types.ts is hyphenated (in-progress, not-started); VALID_STATUSES in schema/frontmatterSchema.ts is underscored (in_progress, not_started) and independently restates the same five values. validateFrontmatter translates hyphen-to-underscore at frontmatterSchema.ts:256-264 before comparing, papering over the mismatch. 30 STATUS.InProgress/STATUS.NotStarted references exist across 10 source files (7 in packages/core/src/introspection/**, 3 in packages/cli/src) — all already reference the constant post-slice-910, so most need no edit. 145 hyphenated status literals exist across 18 test files.
dateCreated: 20260806
dateUpdated: 20260806
status: not_started
---

## Context Summary

- Working on slice 922: unify the two status vocabularies (`STATUS` in
  `introspection/types.ts`, hyphenated; `VALID_STATUSES` in
  `schema/frontmatterSchema.ts`, underscored) into one canonical
  underscored source, fixing GitHub #72.
- Current project state and key assumptions: main is green at `7d89d6e`,
  working tree clean. The defect is live — `cf check --json` currently
  emits a pending fix action with `"value": "in-progress"`. Slice 910
  already swept bare status literals into `STATUS.*` references, so the
  source sweep in this slice (Task 6) is a verification pass, not a
  rewrite.
- Dependencies and prerequisites: slice 910 (complete). No other
  prerequisites.
- What this slice delivers: `STATUS` becomes the single source of truth
  (underscored); `VALID_STATUSES` derives from it; the translation
  workaround in `validateFrontmatter` is deleted; `cf check --fix` writes
  only canonical underscored values; `validateFrontmatter` rejects
  hyphenated status values; `normalizeStatus` continues to read every
  historical alias leniently. This is a deliberate breaking change to
  `--json`/MCP wire output (`in-progress`→`in_progress`,
  `not-started`→`not_started`), released with an explicit note. It
  unblocks GitHub #73 and, transitively, squadron slice 172.
- Next planned slice: GitHub #73 (`cf validate frontmatter` CLI command),
  deferred until this slice merges.

Full design detail, rationale, and the options analysis live in
`user/slices/922-slice.unify-canonical-status-vocabulary.md` — tasks below
reference it rather than duplicating it.

---

## Tasks

### Part 1 — Single source of truth

- [ ] 1. Verify the import direction is cycle-safe
  - [ ] Confirm `packages/core/src/schema/frontmatterSchema.ts` importing a
        value from `packages/core/src/introspection/types.ts` does not
        create a circular import. `frontmatterSchema.ts` already imports
        `normalizeStatus` from `introspection/parsers/`, which establishes
        the same direction — confirm this holds for `types.ts` too (check
        whether `introspection/types.ts` or anything it imports pulls from
        `schema/`).
  - [ ] If a cycle would result, stop and hoist `STATUS` to a leaf module
        (e.g. a new `packages/core/src/constants/status.ts` with no
        imports) instead of proceeding with Task 2. Do not duplicate the
        values as a workaround.
  - [ ] Success: import direction confirmed safe (or leaf-module hoist
        location decided) before any code changes in Task 2.

- [ ] 2. Flip `STATUS` to underscored values
  - [ ] In `packages/core/src/introspection/types.ts`, change
        `InProgress: 'in-progress'` to `InProgress: 'in_progress'` and
        `NotStarted: 'not-started'` to `NotStarted: 'not_started'`. Leave
        `Complete`, `Deprecated`, `Deferred` unchanged (already identical
        in both vocabularies).
  - [ ] Do not edit `NormalizedStatus` — it derives from `STATUS` via
        `(typeof STATUS)[keyof typeof STATUS]` and updates automatically.
  - [ ] Success: `pnpm --filter @context-forge/core build` fails with type
        errors at every call site now incompatible with the new literal
        types (expected at this checkpoint — do not fix yet).

- [ ] 3. Derive `VALID_STATUSES` from `STATUS`
  - [ ] In `packages/core/src/schema/frontmatterSchema.ts`, replace the
        restated literal array with `export const VALID_STATUSES =
        Object.values(STATUS);`, importing `STATUS` from
        `../introspection/types.js` (or the leaf module from Task 1 if a
        hoist was required).
  - [ ] Preserve existing array order if any test asserts the literal
        "expected: …" message text — check
        `packages/core/tests/schema/frontmatterSchema.test.ts` for such an
        assertion before changing declaration order.
  - [ ] Success: `VALID_STATUSES` no longer contains a literal status
        string; it is fully derived.

- [ ] 4. Commit the single-source-of-truth change
  - [ ] Commit message:
        `refactor(core): make STATUS the single source for VALID_STATUSES`
  - [ ] Success: change is committed. Full build is not expected to pass
        yet (Task 2 introduced type errors by design) — do not gate this
        commit on a green build.

### Part 2 — Sweep source references

- [ ] 5. Sweep the 7 core introspection files
  - [ ] Rebuild (`pnpm --filter @context-forge/core build`) and resolve
        every type error in: `ConsistencyChecker.ts`,
        `ProjectModelBuilder.ts`, `WorkflowNavigator.ts`,
        `statusDerivation.ts`, `slicePlanParser.ts`, `taskFileParser.ts`,
        `statusNormalizer.ts`. Per the design, most sites already
        reference `STATUS.*` and require no edit — only fix sites `tsc`
        actually flags.
  - [ ] In `statusNormalizer.ts`, do NOT change the `STATUS_MAP` **keys**
        (e.g. `'in-progress'`, `'not-started'`) — they are input aliases
        for lenient reading, not canonical output values. Only the map's
        *values* should follow the new `STATUS` constant.
  - [ ] In `ConsistencyChecker.ts` (~line 410), update the hardcoded prose
        string `Frontmatter status is "not-started" but tasks are in
        progress` to say `"not_started"`, matching what is actually
        written to disk.
  - [ ] Success: all 7 files compile clean; `statusNormalizer.ts`'s
        `STATUS_MAP` keys are unchanged from before this task.

- [ ] 6. Sweep the 3 CLI files
  - [ ] Resolve any remaining type errors in
        `packages/cli/src/output/entryStatusDisplay.ts`,
        `packages/cli/src/commands/slice.ts`, and
        `packages/cli/src/commands/arch.ts`.
  - [ ] Success: `pnpm -r build` succeeds cleanly across core, cli, and
        mcp-server with zero remaining type errors.

- [ ] 7. Commit the source sweep
  - [ ] Commit message: `refactor: update status references for underscored STATUS constant`
  - [ ] Success: working tree clean, full build green. Test suites are not
        expected to be green yet (Part 3 has not run) — do not gate this
        commit on `pnpm -r test`.

### Part 3 — Delete the validation workaround

- [ ] 8. Remove the `.replace()` translation in `validateFrontmatter`
  - [ ] In `packages/core/src/schema/frontmatterSchema.ts` (~lines
        256-264), delete the `if (field === 'status') { ... }` block that
        translates hyphens to underscores. Replace with
        `effectiveValue = normalizeStatus(normalizedValue) ??
        normalizedValue;` (or equivalent) so leniency is applied via
        `normalizeStatus` alone, with no separate translation step.
  - [ ] Retain the existing comment explaining *why* normalization
        happens before comparison (lenient read of on-disk documents);
        delete only the translation logic itself, not the rationale.
  - [ ] Verify the `??` fallback does not silently coerce an unrecognized
        status into a valid one: an input `normalizeStatus` cannot map
        must still fall through to `normalizedValue` and fail the
        `def.values` check.
  - [ ] Success: the `.replace(/-/g, '_')` workaround no longer exists in
        `frontmatterSchema.ts`.

- [ ] 9. Add regression tests for the validation gate
  - [ ] In `packages/core/tests/schema/frontmatterSchema.test.ts`, add a
        test asserting `validateFrontmatter` **rejects** `status:
        in-progress` and `status: not-started` with an invalid-value
        finding. This is the assertion that was impossible before this
        slice.
  - [ ] Add a test asserting `validateFrontmatter` **accepts** all five
        `VALID_STATUSES` values (`not_started`, `in_progress`, `complete`,
        `deferred`, `deprecated`).
  - [ ] Add a test asserting `VALID_STATUSES` and `Object.values(STATUS)`
        are equal as sets, pinning the single-source-of-truth invariant
        against future drift.
  - [ ] Success: all three new tests pass.

- [ ] 10. Add alias-coverage regression tests for `normalizeStatus`
  - [ ] In `packages/core/tests/introspection/statusNormalizer.test.ts`,
        add or confirm existing coverage that every historical alias
        (`in-progress`, `in progress`, `active`, `not-started`, `not
        started`, `ready`, `pending`, `planned`, `done`, `completed`)
        still maps to its correct canonical value.
  - [ ] Success: all alias mappings pass. If coverage already exists for
        a given alias, do not duplicate the assertion — extend only what
        is missing.

- [ ] 11. Commit the workaround removal and new gate tests
  - [ ] Commit message: `fix(core): reject hyphenated status in validateFrontmatter`
  - [ ] Success: working tree clean; `frontmatterSchema.test.ts` and
        `statusNormalizer.test.ts` green.

### Part 4 — Test literal classification

- [ ] 12. Classify and update `ConsistencyChecker.test.ts` (72 literals)
  - [ ] Review every hyphenated status literal in
        `packages/core/tests/introspection/ConsistencyChecker.test.ts`.
        For each: if it asserts a canonical value (expected output of
        `normalizeStatus`, a derived `status` field, a `fixAction.value`,
        JSON output), flip it to underscore. If it supplies lenient-read
        input (a frontmatter fixture, a document body the parser
        consumes), leave it hyphenated.
  - [ ] Do not bulk search-replace this file. Each occurrence is a
        separate judgment call per the design's Test Plan section.
  - [ ] Success: `ConsistencyChecker.test.ts` passes with the updated
        `STATUS` constant, and at least one lenient-read fixture in this
        file still uses a hyphenated value (confirming leniency coverage
        was not accidentally erased).

- [ ] 13. Add the `--fix` round-trip regression test
  - [ ] In `ConsistencyChecker.test.ts`, add a test where a document
        needing a status fix is processed by `--fix`, the written value
        is asserted to be the underscored canonical form, and that
        written value is then passed through `validateFrontmatter` and
        asserted to produce no status finding. This closes the write/
        validate loop the original issue identified and is the single
        most valuable test in this slice.
  - [ ] Success: the round-trip test passes, demonstrating `cf check
        --fix` output is accepted by `validateFrontmatter`.

- [ ] 14. Commit `ConsistencyChecker.test.ts` updates
  - [ ] Commit message: `test: classify status literals in ConsistencyChecker tests`
  - [ ] Success: working tree clean; `ConsistencyChecker.test.ts` green in
        isolation and as part of the full core suite.

- [ ] 15. Classify and update `WorkflowNavigator.test.ts` (18 literals)
  - [ ] Apply the same per-occurrence classification as Task 12 to
        `packages/core/tests/introspection/WorkflowNavigator.test.ts`.
  - [ ] Success: file passes with the updated `STATUS` constant; any
        lenient-read fixtures remain hyphenated.

- [ ] 16. Classify and update `statusNormalizer.test.ts` (10 literals)
  - [ ] Apply the same classification to
        `packages/core/tests/introspection/statusNormalizer.test.ts`. Per
        the design, these 10 occurrences are almost entirely lenient-read
        input (alias mappings) and should mostly **not** change — treat
        any literal you flip to underscore as an exception requiring a
        specific reason (e.g. asserting the canonical output side of a
        mapping).
  - [ ] Success: file passes; alias-input literals remain hyphenated.

- [ ] 17. Commit `WorkflowNavigator.test.ts` and `statusNormalizer.test.ts` updates
  - [ ] Commit message: `test: classify status literals in WorkflowNavigator and statusNormalizer tests`
  - [ ] Success: working tree clean; both files green individually and as
        part of the full core suite.

- [ ] 18. Classify and update `list-derived-status.test.ts` and `list.test.ts` (8 + 7 literals)
  - [ ] Apply the same classification to
        `packages/cli/tests/commands/list-derived-status.test.ts` and
        `packages/cli/tests/commands/list.test.ts`.
  - [ ] Success: both files pass with the updated `STATUS` constant.

- [ ] 19. Classify and update the remaining 13 test files (≤5 literals each)
  - [ ] Identify the remaining files via:
        `grep -rl 'in-progress\|not-started' packages/*/tests --include='*.test.ts'`
        excluding the six files already handled in Tasks 12, 15, 16, 18.
        Apply the same per-occurrence classification to each.
  - [ ] Success: every remaining file in the list passes with the updated
        `STATUS` constant.

- [ ] 20. Commit the remaining test literal classification
  - [ ] Commit message: `test: classify remaining status literals across cli and core tests`
  - [ ] Success: working tree clean; full `pnpm -r test` green across
        core, cli, and mcp-server.

### Part 5 — Bare-literal audit and verification

- [ ] 21. Run the bare-literal audit
  - [ ] Run:
        `grep -rn --include='*.ts' 'in-progress\|not-started' packages/*/src | grep -v 'STATUS\.'`
  - [ ] Confirm the only matches remaining are comments and the `STATUS`
        definition site itself in `types.ts` (which necessarily contains
        the string literals) — no other source line should reference a
        bare hyphenated status literal outside `STATUS.*`.
  - [ ] If any non-comment match remains, fix it before proceeding.
  - [ ] Success: audit output contains only comments and the `STATUS`
        object literal.

- [ ] 22. Run the full verification walkthrough
  - [ ] Follow the "Verification Walkthrough" section of
        `user/slices/922-slice.unify-canonical-status-vocabulary.md`
        exactly, using a locally built CLI (`node
        packages/cli/dist/index.js`) against a fresh `pnpm -r build`.
  - [ ] Confirm each of the five walkthrough steps produces the exact
        expected output described in the design: (1) `cf check --json`
        emits no hyphenated status value; (2) `cf check --fix` writes
        `status: in_progress` to the fixed document; (3)
        `validateFrontmatter` rejects `'in-progress'` and accepts
        `'in_progress'`; (4) `cf list slices|arch`/`cf status` still
        render every entry's real status with no unreadable/incorrect
        fallback, proving leniency survived; (5) `cf list slices --json`
        emits `not_started`, not `not-started`.
  - [ ] Update the design document's Verification Walkthrough section in
        place with the real commands run and actual output observed.
  - [ ] Success: all five steps confirmed against real output; design doc
        updated with actual (not draft) output.

- [ ] 23. Full suite and build verification
  - [ ] `pnpm -r build` — clean across core, cli, mcp-server, and the
        meta-package.
  - [ ] `pnpm -r test` — core, cli, and mcp-server green.
  - [ ] `packages/electron` has a known pre-existing unrelated
        `TemplateProcessor.test.ts` failure. Confirm it is unchanged from
        `main`; do not fix it in this slice.
  - [ ] Run `cf check` (or `workflow_check`) scoped to slice 922 and
        confirm zero findings for this slice.
  - [ ] Success: all of the above verified with actual command output
        read, not assumed.

- [ ] 24. Commit verification updates
  - [ ] Commit message: `docs: record verification walkthrough for slice 922`
  - [ ] Success: working tree clean; design doc's walkthrough section
        reflects real output.

### Part 6 — Release notes and close-out

- [ ] 25. Add the breaking-change release note
  - [ ] Add a `CHANGELOG.md` entry under `[Unreleased]` documenting the
        breaking `--json`/MCP wire-value change: `in-progress` →
        `in_progress`, `not-started` → `not_started`, naming the affected
        surfaces (`cf list slices|arch --json`, `cf status --json`, `cf
        next --json`, MCP `introspection_*`, `project_get`).
  - [ ] Explicitly state there is no deprecated alias or dual-emission —
        the old spellings are no longer emitted.
  - [ ] Success: `CHANGELOG.md` entry present and accurately scoped to
        the two changed values and the listed surfaces.

- [ ] 26. Documentation and status updates
  - [ ] Set this task file's frontmatter `status` to `complete`.
  - [ ] Set `user/slices/922-slice.unify-canonical-status-vocabulary.md`'s
        frontmatter `status` to `complete`.
  - [ ] Check off entry 22 `(922)` in
        `user/architecture/900-slices.maintenance-and-refactoring.md`.
  - [ ] Success: `cf list slices` renders 922 as `✓ complete`.

- [ ] 27. Final commit
  - [ ] Commit message: `docs: complete slice 922 (unify canonical status vocabulary)`
  - [ ] Success: working tree clean; branch ready for review and merge to
        the target branch (`cf config get git.integration_branch`,
        defaulting to `main` if unset).
