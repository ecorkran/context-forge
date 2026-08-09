---
docType: tasks
slice: unify-canonical-status-vocabulary
project: context-forge
lld: user/slices/922-slice.unify-canonical-status-vocabulary.md
dependencies: [910]
projectState: main is green, working tree clean at 7d89d6e. STATUS in introspection/types.ts is hyphenated (in-progress, not-started); VALID_STATUSES in schema/frontmatterSchema.ts is underscored (in_progress, not_started) and independently restates the same five values. validateFrontmatter translates hyphen-to-underscore at frontmatterSchema.ts:256-264 before comparing, papering over the mismatch. 30 STATUS.InProgress/STATUS.NotStarted references exist across 10 source files (7 in packages/core/src/introspection/**, 3 in packages/cli/src) — all already reference the constant post-slice-910, so most need no edit. 145 hyphenated status literals exist across 18 test files.
dateCreated: 20260806
dateUpdated: 20260809
status: complete
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

- [x] 1. Verify the import direction is cycle-safe
  - [x] Confirm `packages/core/src/schema/frontmatterSchema.ts` importing a
        value from `packages/core/src/introspection/types.ts` does not
        create a circular import. `frontmatterSchema.ts` already imports
        `normalizeStatus` from `introspection/parsers/`, which establishes
        the same direction — confirm this holds for `types.ts` too (check
        whether `introspection/types.ts` or anything it imports pulls from
        `schema/`).
  - [x] If a cycle would result, stop and hoist `STATUS` to a leaf module
        (e.g. a new `packages/core/src/constants/status.ts` with no
        imports) instead of proceeding with Task 2. Do not duplicate the
        values as a workaround.
  - [x] Success: import direction confirmed safe (or leaf-module hoist
        location decided) before any code changes in Task 2.

- [x] 2. Flip `STATUS` to underscored values
  - [x] In `packages/core/src/introspection/types.ts`, change
        `InProgress: 'in-progress'` to `InProgress: 'in_progress'` and
        `NotStarted: 'not-started'` to `NotStarted: 'not_started'`. Leave
        `Complete`, `Deprecated`, `Deferred` unchanged (already identical
        in both vocabularies).
  - [x] Do not edit `NormalizedStatus` — it derives from `STATUS` via
        `(typeof STATUS)[keyof typeof STATUS]` and updates automatically.
  - [x] Note: because slice 910 already swept every source reference onto
        `STATUS.*` (confirmed: no bare `'in-progress'`/`'not-started'`
        literal comparisons remain outside `types.ts` itself, a comment,
        and one prose string), this edit is expected to compile clean via
        literal-type propagation — not to break the build. Tasks 5–6
        exist to verify that expectation and handle the two known
        non-propagating exceptions, not to fix a red build.
  - [x] Success: `pnpm --filter @context-forge/core build` succeeds.

- [x] 3. Derive `VALID_STATUSES` from `STATUS`
  - [x] In `packages/core/src/schema/frontmatterSchema.ts`, replace the
        restated literal array with `export const VALID_STATUSES =
        Object.values(STATUS);`, importing `STATUS` from
        `../introspection/types.js` (or the leaf module from Task 1 if a
        hoist was required).
  - [x] Preserve existing array order if any test asserts the literal
        "expected: …" message text — check
        `packages/core/tests/schema/frontmatterSchema.test.ts` for such an
        assertion before changing declaration order.
  - [x] Success: `VALID_STATUSES` no longer contains a literal status
        string; it is fully derived; `pnpm --filter @context-forge/core build`
        succeeds.

- [x] 4. Commit the single-source-of-truth change
  - [x] Commit message:
        `refactor(core): make STATUS the single source for VALID_STATUSES`
  - [x] Success: working tree clean; `pnpm --filter @context-forge/core build`
        green.

### Part 2 — Sweep source references

- [x] 5. Verify the 7 core introspection files and fix the two known exceptions
  - [x] Rebuild (`pnpm --filter @context-forge/core build`) and confirm no
        type errors in: `ConsistencyChecker.ts`, `ProjectModelBuilder.ts`,
        `WorkflowNavigator.ts`, `statusDerivation.ts`,
        `slicePlanParser.ts`, `taskFileParser.ts`, `statusNormalizer.ts`.
        Per Task 2's note, these should already compile clean — if `tsc`
        surfaces an error at a site not listed below, treat it as a sign
        an unmapped bare literal survived slice 910, and fix that specific
        site.
  - [x] In `statusNormalizer.ts`, do NOT change the `STATUS_MAP` **keys**
        (e.g. `'in-progress'`, `'not-started'`) — they are input aliases
        for lenient reading, not canonical output values. Only the map's
        *values* follow the new `STATUS` constant, and those already do
        via the constant reference (verify, do not blindly edit).
  - [x] In `ConsistencyChecker.ts` (~line 410), update the hardcoded prose
        string `Frontmatter status is "not-started" but tasks are in
        progress` to say `"not_started"`, matching what is actually
        written to disk. This is a string literal, so it will not be
        caught by `tsc` — it must be located and fixed explicitly.
  - [x] Success: all 7 files compile clean; `statusNormalizer.ts`'s
        `STATUS_MAP` keys are unchanged from before this task;
        `ConsistencyChecker.ts`'s prose string now reads `"not_started"`.

- [x] 6. Verify the 3 CLI files
  - [x] Confirm no type errors in
        `packages/cli/src/output/entryStatusDisplay.ts`,
        `packages/cli/src/commands/slice.ts`, and
        `packages/cli/src/commands/arch.ts`. Per Task 2's note these
        should already compile clean via `STATUS.*` references.
  - [x] Success: `pnpm -r build` succeeds cleanly across core, cli, and
        mcp-server.

- [x] 7. Commit the source verification and prose-string fix
  - [x] Commit message: `fix: correct hardcoded status prose string for underscored STATUS constant`
  - [x] Success: working tree clean, full build green. `pnpm -r test` is
        not yet expected to be fully green — test files still assert the
        old hyphenated values in places Part 4 has not yet reclassified;
        do not gate this commit on `pnpm -r test`.

### Part 3 — Delete the validation workaround

- [x] 8. Remove the `.replace()` translation in `validateFrontmatter`
  - [x] In `packages/core/src/schema/frontmatterSchema.ts` (~lines
        256-264), delete the `if (field === 'status') { ... }` block that
        translates hyphens to underscores. Replace with
        `effectiveValue = normalizeStatus(normalizedValue) ??
        normalizedValue;` (or equivalent) so leniency is applied via
        `normalizeStatus` alone, with no separate translation step.
  - [x] Retain the existing comment explaining *why* normalization
        happens before comparison (lenient read of on-disk documents);
        delete only the translation logic itself, not the rationale.
  - [x] Verify the `??` fallback does not silently coerce an unrecognized
        status into a valid one: an input `normalizeStatus` cannot map
        must still fall through to `normalizedValue` and fail the
        `def.values` check.
  - [x] Note the observable behavior change this introduces: today, an
        unrecognized value like `'some-thing'` is reported as invalid
        `'some_thing'` (post-`.replace()`); after this change it is
        reported as invalid `'some-thing'` (unmodified user input). This
        is an improvement — the error now shows what the user actually
        typed — but call it out in the Task 11 commit message so it is
        not mistaken for an unintended regression.
  - [x] Success: the `.replace(/-/g, '_')` workaround no longer exists in
        `frontmatterSchema.ts`.
  - Note: implemented as strict + auto-fix per PM decision recorded in the design doc's Step 3 Resolution block — the drafted `??` expression was self-contradictory. suggestStatus() added to statusNormalizer.ts for alias/typo fixActions.

- [x] 9. Add regression tests for the validation gate
  - [x] In `packages/core/tests/schema/frontmatterSchema.test.ts`, add a
        test asserting `validateFrontmatter` **rejects** `status:
        in-progress` and `status: not-started` with an invalid-value
        finding. This is the assertion that was impossible before this
        slice.
  - [x] Add a test asserting `validateFrontmatter` **accepts** all five
        `VALID_STATUSES` values (`not_started`, `in_progress`, `complete`,
        `deferred`, `deprecated`).
  - [x] Add a test asserting `VALID_STATUSES` and `Object.values(STATUS)`
        are equal as sets, pinning the single-source-of-truth invariant
        against future drift.
  - [x] Success: all three new tests pass.

- [x] 10. Add alias-coverage regression tests for `normalizeStatus`
  - [x] In `packages/core/tests/introspection/statusNormalizer.test.ts`,
        add or confirm existing coverage that every historical alias
        (`in-progress`, `in progress`, `active`, `not-started`, `not
        started`, `ready`, `pending`, `planned`, `done`, `completed`)
        still maps to its correct canonical value.
  - [x] Success: all alias mappings pass. If coverage already exists for
        a given alias, do not duplicate the assertion — extend only what
        is missing.
  - Note: alias coverage confirmed; canonical expected-output literals in statusNormalizer.test.ts were flipped to underscored here (pulled forward from Task 16), and suggestStatus tests added. Task 16 remains as a verification pass over the input literals, which stay hyphenated.

- [x] 11. Commit the workaround removal and new gate tests
  - [x] Commit message: `fix(core): reject hyphenated status in validateFrontmatter`.
        In the commit body, note the invalid-value error-message change
        from Task 8: unrecognized status values are now reported as typed
        rather than partially normalized.
  - [x] Success: working tree clean; `frontmatterSchema.test.ts` and
        `statusNormalizer.test.ts` green.

### Part 4 — Test literal classification

- [x] 12. Classify and update `ConsistencyChecker.test.ts` (72 literals)
  - [x] Review every hyphenated status literal in
        `packages/core/tests/introspection/ConsistencyChecker.test.ts`.
        For each: if it asserts a canonical value (expected output of
        `normalizeStatus`, a derived `status` field, a `fixAction.value`,
        JSON output), flip it to underscore. If it supplies lenient-read
        input (a frontmatter fixture, a document body the parser
        consumes), leave it hyphenated.
  - [x] Do not bulk search-replace this file. Each occurrence is a
        separate judgment call per the design's Test Plan section.
  - [x] Success: `ConsistencyChecker.test.ts` passes with the updated
        `STATUS` constant, and at least one lenient-read fixture in this
        file still uses a hyphenated value (confirming leniency coverage
        was not accidentally erased).
  - Note: classification also surfaced and fixed a latent source bug — seven ConsistencyChecker rule sites compared raw frontmatter status instead of using normalizeStatus; canonical spellings were silently ignored pre-slice. Fixed in commit 175084d.

- [x] 13. Add the `--fix` round-trip regression test
  - [x] In `ConsistencyChecker.test.ts`, add a test where a document
        needing a status fix is processed by `--fix`, the written value
        is asserted to be the underscored canonical form, and that
        written value is then passed through `validateFrontmatter` and
        asserted to produce no status finding. This closes the write/
        validate loop the original issue identified and is the single
        most valuable test in this slice.
  - [x] Success: the round-trip test passes, demonstrating `cf check
        --fix` output is accepted by `validateFrontmatter`.

- [x] 14. Commit `ConsistencyChecker.test.ts` updates
  - [x] Commit message: `test: classify status literals in ConsistencyChecker tests`
  - [x] Success: working tree clean; `ConsistencyChecker.test.ts` green in
        isolation and as part of the full core suite.

- [x] 15. Classify and update `WorkflowNavigator.test.ts` (18 literals)
  - [x] Apply the same per-occurrence classification as Task 12 to
        `packages/core/tests/introspection/WorkflowNavigator.test.ts`.
  - [x] Success: file passes with the updated `STATUS` constant; any
        lenient-read fixtures remain hyphenated.

- [x] 16. Classify and update `statusNormalizer.test.ts` (10 literals)
  - [x] Apply the same classification to
        `packages/core/tests/introspection/statusNormalizer.test.ts`. Per
        the design, these 10 occurrences are almost entirely lenient-read
        input (alias mappings) and should mostly **not** change — treat
        any literal you flip to underscore as an exception requiring a
        specific reason (e.g. asserting the canonical output side of a
        mapping).
  - [x] Success: file passes; alias-input literals remain hyphenated.

- [x] 17. Commit `WorkflowNavigator.test.ts` and `statusNormalizer.test.ts` updates
  - [x] Commit message: `test: classify status literals in WorkflowNavigator and statusNormalizer tests`
  - [x] Success: working tree clean; both files green individually and as
        part of the full core suite.

- [x] 18. Classify and update `list-derived-status.test.ts` and `list.test.ts` (8 + 7 literals)
  - [x] Apply the same classification to
        `packages/cli/tests/commands/list-derived-status.test.ts` and
        `packages/cli/tests/commands/list.test.ts`.
  - [x] Success: both files pass with the updated `STATUS` constant.

- [x] 19. Classify and update the remaining 13 test files (≤5 literals each)
  - [x] Identify the remaining files via:
        `grep -rl 'in-progress\|not-started' packages/*/tests --include='*.test.ts'`
        excluding the five files already handled in Tasks 12, 15, 16, 18.
        Apply the same per-occurrence classification to each.
  - [x] Success: every remaining file in the list passes with the updated
        `STATUS` constant.

- [x] 20. Commit the remaining test literal classification
  - [x] Commit message: `test: classify remaining status literals across cli and core tests`
  - [x] Success: working tree clean; full `pnpm -r test` green across
        core, cli, and mcp-server.

### Part 5 — Bare-literal audit and verification

- [x] 21. Run the bare-literal audit
  - [x] Run:
        `grep -rn --include='*.ts' 'in-progress\|not-started' packages/*/src | grep -v 'STATUS\.'`
  - [x] Confirm the only matches remaining are comments and the `STATUS`
        definition site itself in `types.ts` (which necessarily contains
        the string literals) — no other source line should reference a
        bare hyphenated status literal outside `STATUS.*`.
  - [x] If any non-comment match remains, fix it before proceeding.
  - [x] Success: audit output contains only comments and the `STATUS`
        object literal.

- [x] 22. Run the full verification walkthrough
  - [x] Follow the "Verification Walkthrough" section of
        `user/slices/922-slice.unify-canonical-status-vocabulary.md`
        exactly, using a locally built CLI (`node
        packages/cli/dist/index.js`) against a fresh `pnpm -r build`.
  - [x] Confirm each of the five walkthrough steps produces the exact
        expected output described in the design: (1) `cf check --json`
        emits no hyphenated status value; (2) `cf check --fix` writes
        `status: in_progress` to the fixed document; (3)
        `validateFrontmatter` rejects `'in-progress'` and accepts
        `'in_progress'`; (4) `cf list slices|arch`/`cf status` still
        render every entry's real status with no unreadable/incorrect
        fallback, proving leniency survived; (5) `cf list slices --json`
        emits `not_started`, not `not-started`.
  - [x] Update the design document's Verification Walkthrough section in
        place with the real commands run and actual output observed. This
        is an intentional, in-scope edit that replaces draft/expected
        output with ground truth — not a mid-implementation design change
        to any decision, scope, or success criterion in the document.
  - [x] Success: all five steps confirmed against real output; design doc
        updated with actual (not draft) output.
  - Note: walkthrough step 2 ran live on this repo (not a scratch copy) — the strict + auto-fix gate migrated 8 legacy docs; run also surfaced and fixed a fix-log display pairing bug in check.ts (commit 860e094).

- [x] 23. Full suite and build verification
  - [x] `pnpm -r build` — clean across core, cli, mcp-server, and the
        meta-package.
  - [x] `pnpm -r test` — core, cli, and mcp-server green.
  - [x] `packages/electron` has a known pre-existing unrelated
        `TemplateProcessor.test.ts` failure. Confirm it is unchanged from
        `main`; do not fix it in this slice.
  - [x] Run `cf check` (or `workflow_check`) scoped to slice 922 and
        confirm zero findings for this slice.
  - [x] Success: all of the above verified with actual command output
        read, not assumed.

- [x] 24. Commit verification updates
  - [x] Commit message: `docs: record verification walkthrough for slice 922`
  - [x] Success: working tree clean; design doc's walkthrough section
        reflects real output.

### Part 6 — Release notes and close-out

- [x] 25. Add the breaking-change release note
  - [x] Add a `CHANGELOG.md` entry under `[Unreleased]` documenting the
        breaking `--json`/MCP wire-value change: `in-progress` →
        `in_progress`, `not-started` → `not_started`, naming the affected
        surfaces (`cf list slices|arch --json`, `cf status --json`, `cf
        next --json`, MCP `introspection_*`, `project_get`).
  - [x] Explicitly state there is no deprecated alias or dual-emission —
        the old spellings are no longer emitted.
  - [x] Success: `CHANGELOG.md` entry present and accurately scoped to
        the two changed values and the listed surfaces.

- [x] 26. Documentation and status updates
  - [x] Set this task file's frontmatter `status` to `complete`.
  - [x] Set `user/slices/922-slice.unify-canonical-status-vocabulary.md`'s
        frontmatter `status` to `complete`.
  - [x] Check off entry 22 `(922)` in
        `user/architecture/900-slices.maintenance-and-refactoring.md` —
        change the leading `- [ ]` before the entry number to `- [x]`,
        matching the format already used by entries 19–21 in that file.
  - [x] Success: `cf list slices` renders 922 as `✓ complete`.

- [x] 27. Final commit
  - [x] Commit message: `docs: complete slice 922 (unify canonical status vocabulary)`
  - [x] Success: working tree clean; branch ready for review and merge to
        the target branch (`cf config get git.integration_branch`,
        defaulting to `main` if unset).
