---
docType: tasks
slice: frontmatter-parser-nesting-fix
project: context-forge
lld: project-documents/user/slices/917-slice.frontmatter-parser-nesting-fix.md
dependencies: []
projectState: >
  Slice 917 design (Phase 4) complete, reviewed (CONCERNS; F001 bundling
  concern acknowledged and kept as-is per PM decision, F002/F003 resolved
  in the design doc, F004/F005 PASS). No code for #64 or #66 has been
  implemented yet — only the unrelated normalizeVerdict() leniency fix
  (ccc90c4) has landed on main so far. This slice bundles two independent,
  small fixes (see design's Scope section for the bundling rationale):
  the frontmatter-parser nesting bug (#64) plus its differential corpus
  harness, and the cf next stale-phase-on-review-gate gap (#66).
dateCreated: 20260716
dateUpdated: 20260717
status: complete
---

# Tasks: Frontmatter Parser Nesting Fix & Corpus Verification

## Context Summary

- Working on slice 917, which bundles two unrelated fixes (see design's Scope section for why).
- **#64** — `parseFrontmatter()` in `packages/core/src/introspection/parsers/frontmatterParser.ts`
  is a flat line-scanner with no nesting awareness: every line containing `:` is treated as a
  top-level key regardless of indentation, so a nested `findings[].verdict` sub-field silently
  overwrites the true top-level `verdict`. Fix: track leading-whitespace indentation, skip lines
  under an open nested block, resume top-level scanning at the next zero-indent line. Tabs count
  as top-level (F003 resolution — no tab-indented frontmatter observed in the corpus).
- **#66** — `WorkflowNavigator.getNext()`'s `pending-review`/`review-failed` branches
  (`WorkflowNavigator.ts:304-319`) never set a `phase` field on the returned `NextAction`, unlike
  the three sibling lifecycle branches above them. `enrich()` (`WorkflowNavigator.ts:255-263`) only
  suggests a `cf set phase` correction when `action.phase` is present, so a stale `developmentPhase`
  goes undetected exactly when a review gate blocks progress. Fix: derive `phase` from
  `slice.gateInfo?.reviewType` (`'slice'` → Phase 4, `'tasks'` → Phase 5, `'code'` → Phase 6) in
  both branches; `enrich()` itself is unchanged.
- No `FrontmatterData` contract change; no consumer of `parseFrontmatter()` needs modification.
  No change to review-gate blocking behavior — #66 only adds a suggestion.
- This slice delivers: the #64 parser fix + regression tests, a one-off differential corpus-
  verification script (not shipped in `packages/core/src`) proving no regression across this
  repo's own corpus plus sibling projects, and the #66 `phase`-attachment fix + tests.
- No next slice is currently planned; this is a maintenance-plan entry (900).

Key files:
- `packages/core/src/introspection/parsers/frontmatterParser.ts` (TD-2) — no existing test file;
  Task 1.1 creates one.
- `packages/core/src/schema/projectSchema.ts` (TD-5 constant exports)
- `packages/core/src/introspection/WorkflowNavigator.ts` (TD-5, lines 253-319)
- `packages/core/tests/introspection/WorkflowNavigator.test.ts` (TD-5 tests; 1211 lines already —
  new cases append to the `pending-review`/`review-failed` describe blocks, not a new file)
- Scratch verification script for TD-3 lives outside `packages/core/src` (e.g. under this slice's
  own scratch area) — not part of the shipped package, not a permanent CLI command.

Grounding facts (verified against source):
- `GateEvaluation.reviewType` (`reviewGate.ts`) is produced by `positionToReviewType(boundary)` and
  is one of `'slice' | 'tasks' | 'code'` (from `BOUNDARY_REVIEW_TYPE`), keyed by `Boundary` values
  `'preTasks' | 'preImplementation' | 'preAdvance'` (the two review-gate lifecycle branches never
  see `'preSlicePlan'`, which is the arch-gate boundary handled elsewhere in `getNext()`).
- `deriveSliceStatus()` sets `gateInfo: { reviewType, rationale }` on the returned slice status for
  both `pending-review` and `review-failed` (`WorkflowNavigator.ts:565,593,608`) — `reviewType` is
  already available to the two branches this slice modifies; no new plumbing needed to obtain it.
- `projectSchema.ts` already exports `ARCHITECTURE_PHASE` (`PHASE_STRINGS[2]`) as the sole precedent
  for a named phase constant (added in slice 912 Task 1.1); `Phase 4/5/6` strings are otherwise only
  reachable via the module-private `PHASE_STRINGS` tuple or the string-keyed `PHASE_MAP`. Per the
  project's "never scatter comparison values" rule, TD-5 needs its own exported constants for
  Phase 4/5/6, following the `ARCHITECTURE_PHASE` pattern exactly (`PHASE_STRINGS[4]`, `[5]`, `[6]`).
- Test suites run via `pnpm --filter @context-forge/core test <file>`; full build via `pnpm -r build`.

---

## TD-2 — #64: Indentation-aware frontmatter parser fix

- [x] **Task 1.1 — Create `frontmatterParser.test.ts` with baseline coverage**
  - No test file exists yet for `frontmatterParser.ts`. Create
    `packages/core/tests/introspection/parsers/frontmatterParser.test.ts` (mirror the location
    convention of sibling parser tests if one exists; otherwise place alongside
    `frontmatterParser.ts`'s existing directory structure under `tests/`).
  - Add baseline cases proving current (pre-fix) behavior for the code paths that are NOT
    changing: missing file → `{ found: false, data: {} }`; file with no opening `---` → same;
    well-formed flat frontmatter (no nesting) → all keys captured correctly; quoted values
    (single and double) → quotes stripped; unterminated frontmatter (no closing `---`) → empty
    result.
  - Success: new test file runs and passes against the current implementation, unmodified.
  - Effort: 2/5

- [x] **Task 1.2 — Add failing regression tests for the nested-collision bug shape (TD-2)**
  - In the same test file, add cases using the exact fixture shape from the design's Overview
    (a `verdict:` top-level key followed by a `verifiedUpdate:` nested object and a `findings:`
    list-of-objects whose entries include their own `verdict:` sub-field). Use an anonymized
    fixture, not the real project name, per prior convention on this slice's precursor fix.
  - Assert `data.verdict` equals the true top-level value (e.g. `'CONCERNS (resolved — see
    verifiedUpdate)'`), not the last nested `verdict` seen.
  - Also import `normalizeVerdict()` (`reviewGate.ts`) and assert
    `normalizeVerdict(data.verdict) === 'CONCERNS'` on this fixture — this is the concrete,
    testable form of design Success Criterion 2 (the parser fix must make the existing
    `normalizeVerdict()` leniency fix, `ccc90c4`, effective on real input, not just on synthetic
    strings passed directly to `normalizeVerdict()`).
  - Add a second case for a folded/literal block scalar (`note: >` or `note: |` followed by
    indented free text containing a colon) to prove indented colon-bearing lines inside a block
    scalar are also skipped, not just object/list nesting.
  - These tests are expected to **fail** against the current implementation — confirms the test
    correctly reproduces the bug before the fix lands.
  - Success: new tests fail with the current parser, demonstrating the bug; test code itself
    requires no further changes after Task 1.3 lands.
  - Effort: 2/5

- [x] **Task 1.3 — Implement indentation-aware top-level key scanning (TD-2)**
  - In `frontmatterParser.ts`, replace the unconditional `stripped = lines[i].trim()` top-level
    scan with indentation tracking: only treat a line as a top-level key when its original
    (untrimmed) leading whitespace is zero, per design TD-2. Only **space** characters count as
    indentation for this check — a line beginning with a tab is treated as top-level (F003
    resolution; matches the pre-existing `.trim()` behavior for tab-indented content).
  - When a top-level key's value is empty on its own line (opens a nested block or list), skip
    every subsequent line with any (space) leading indentation, resuming top-level scanning at
    the next zero-indent line or the closing `---`.
  - A top-level key with a non-empty inline value (e.g. `verdict: CONCERNS (resolved...)`) is
    captured exactly as today — this only changes behavior after a key that opens a nested block.
  - Do not change the function signature, return shape, or the `FrontmatterData = Record<string,
    string>` contract (TD-4). Do not handle inline flow collections or anchors/aliases (explicitly
    out of scope per design TD-2).
  - Success: all Task 1.2 regression tests now pass; all Task 1.1 baseline tests still pass
    unmodified (no regression on flat/quoted/missing-file/unterminated cases).
  - Effort: 3/5

- [x] **Task 1.4 — End-to-end `cf check` verification (design Success Criterion 2)**
  - Create a scratch project (e.g. via a temp directory fixture, mirroring the pattern used by
    existing `ConsistencyChecker`/`WorkflowNavigator` scratch-fixture tests) containing a review
    document shaped like the Task 1.2 fixture — top-level `verdict: CONCERNS (resolved — see
    verifiedUpdate)` plus nested `findings[].verdict` sub-fields.
  - Run `cf check` (or the equivalent `ConsistencyChecker`/review-gate entry point used in existing
    tests) against the scratch project and assert it does **not** report a false review-gate
    failure for this slice/document — i.e. the gate resolves the true top-level `CONCERNS` verdict,
    not the clobbered nested value.
  - This closes the gap between "the parser returns the right string" (Task 1.2) and "the tool's
    actual gate-check behavior is correct" (design Success Criterion 2) — the two are not
    equivalent without this end-to-end assertion.
  - Success: scratch-project `cf check` run passes (no false review-gate block) using the
    fixture's shape.
  - Effort: 2/5

- [x] **Commit checkpoint** — after 1.4: `fix: make frontmatter parser indentation-aware (#64)`.

---

## TD-3 — #64: Differential corpus-verification harness

- [x] **Task 2.1 — Write the old-vs-new parser diff script**
  - Add a one-off script (not part of the shipped `packages/core/src` package — place it under a
    scratch/verification location such as `scripts/` or the slice's own working area, per TD-4).
    The script:
    - Accepts a configurable list of project roots (this repo, plus sibling project paths passed
      by the PM at run time — do not hardcode sibling paths into the committed script).
    - Discovers all `.md` files under each root's `project-documents/` directory.
    - Parses each file with both the pre-fix parser (the version from before Task 1.3 — e.g. via
      a preserved copy of the old function body, not a live git-stash/checkout during the run)
      and the post-fix parser (the current `frontmatterParser.ts`).
    - Diffs the two resulting `data` maps field-by-field per file.
  - Implement the failure-mode handling from the design's TD-3 resolution: a project root with no
    `project-documents/` directory is skipped with a one-line log, not an error; an unreadable
    `.md` file is caught and logged per-file without aborting the run; a thrown exception from
    either parser is treated as a hard signal — logged and called out explicitly, not skipped.
  - Log a running progress count for large roots so a long scan is visibly alive.
  - Success: script runs standalone against this repo's own `project-documents/` tree and produces
    a summary (files scanned, unchanged count, changed count with per-file field diffs, thrown-
    exception count).
  - Effort: 3/5

- [x] **Task 2.2 — Run the harness across this repo's corpus and at least one sibling project**
  - Execute the Task 2.1 script against this repo's own corpus and at least one sibling project
    with a large `project-documents/` tree (candidates named in the design: `squadron`,
    `grizcam_mobile_ios`, `migratory`). Confirm with the PM which sibling root(s) are actually
    available/in scope before running.
  - Review every changed-file entry by hand: confirm the new value is correct and the old value
    matches the nested-collision bug shape (not an unrelated behavior change). Log any project
    root that was skipped (missing `project-documents/`) or excluded, per the design's "no silent
    truncation" requirement.
  - Record the run's summary numbers (X scanned, Y unchanged, Z changed-and-reviewed) in this task
    file or a short note alongside it, satisfying design Success Criterion 4.
  - Success: summary recorded; zero changed files found to be an unrelated/unexplained behavior
    change; zero unhandled parser exceptions (or, if any occurred, investigated and resolved
    before proceeding).
  - Effort: 3/5
  - **Results (20260717):** Scope narrowed to `{root}/project-documents/user/` per PM guidance
    (this is the subtree guaranteed to have frontmatter on every `.md` file; the wider
    `project-documents/` tree can include non-frontmatter docs that would only add diff noise).
    - This repo: 248 scanned, 207 unchanged, 41 changed, 0 throws.
    - `squadron`: 347 scanned. `migratory`: 258 scanned. `context-visualizer`: 38 scanned.
      `migratory-viewer`: 62 scanned. `trading-data`: 199 scanned.
      Combined sibling total: 904 scanned, 593 unchanged, 311 changed, 0 throws.
      (`grizcam_mobile_ios`, named as a design candidate, is not present on this machine —
      not scanned; no root was skipped for lacking `project-documents/user/`.)
    - Hand review (by field-name clustering + direct sampling across all 6 roots, not a
      line-by-line pass over all 352 changed files): the dominant cluster
      (`severity`/`category`/`summary`/`location`, ~278 occurrences each) is exactly
      `findings[].{severity,category,summary,location}` sub-fields colliding with a
      differently-scoped or absent top-level key — same shape as this repo's own review docs.
      The long tail of one-off keys (`Branch:`, `Substrate:`, `role:`, `date:`, `reviewVerdict:`,
      etc.) was individually inspected in its source file: every case is either a colon-bearing
      line inside a `projectState: >` / similar folded block scalar, or a `- reviewType: ...`
      list-of-objects nesting — both are the documented TD-2 bug shapes, not unrelated changes.
      Zero anomalies found.

- [x] **Commit checkpoint** — after 2.2: `test: add differential corpus verification for frontmatter parser fix (#64)`.

---

## TD-5 — #66: Attach `phase` to the review-gate branches in `cf next`

- [x] **Task 3.1 — Export `SLICE_DESIGN_PHASE`, `TASK_BREAKDOWN_PHASE`, and `IMPLEMENTATION_PHASE` constants**
  - In `packages/core/src/schema/projectSchema.ts`, export two more named phase constants
    following the existing `ARCHITECTURE_PHASE` pattern exactly (`PHASE_STRINGS[2]`): a Phase-5
    constant (e.g. `TASK_BREAKDOWN_PHASE = PHASE_STRINGS[5]`, `'Phase 5: Task Breakdown'`) and a
    Phase-6 constant (e.g. `IMPLEMENTATION_PHASE = PHASE_STRINGS[6]`, `'Phase 6: Implementation'`).
    A Phase-4 constant (`SLICE_DESIGN_PHASE = PHASE_STRINGS[4]`, `'Phase 4: Slice Design'`) is also
    needed for the `'slice'` reviewType case — add it alongside the other two.
  - Do not duplicate the literal strings — derive from `PHASE_STRINGS` exactly as
    `ARCHITECTURE_PHASE` does.
  - Success: all three constants are exported and importable from `@context-forge/core`;
    `PHASE_MAP` still resolves the same strings byte-identically (no behavior change to existing
    exports).
  - Effort: 1/5

- [x] **Task 3.2 — Add a `reviewType`→phase lookup and wire it into the two branches (TD-5)**
  - In `WorkflowNavigator.ts`, add a small lookup (e.g. a `Record<string, string>` keyed by
    `'slice' | 'tasks' | 'code'`, mapping to the Task 3.1 constants) — this is the single place
    the mapping is defined, per the project's "never scatter comparison values" rule.
  - In the `pending-review` branch (`WorkflowNavigator.ts:304-311`) and the `review-failed` branch
    (`WorkflowNavigator.ts:312-319`), add a `phase` field to the returned `NextAction`, derived via
    the lookup from `slice.gateInfo?.reviewType`. Both branches already receive `slice.gateInfo` —
    no new data plumbing required.
  - Do not modify `enrich()` — once `phase` is populated, its existing comparison-and-suggest logic
    applies unchanged (design TD-5).
  - If `slice.gateInfo?.reviewType` is ever absent for these two branches (should not happen per
    `deriveSliceStatus()`, which always sets `gateInfo` before returning these statuses) omit the
    `phase` field rather than guessing — do not add a silent fallback value (project convention:
    no silent fallbacks).
  - Success: with a stale `developmentPhase` and a `pending-review`/`review-failed` status, `cf
    next`'s output now includes a `cf set phase '<x>'` suggestion via the existing `enrich()` path,
    where `<x>` matches the boundary (slice→Phase 4, tasks→Phase 5, code→Phase 6).
  - Effort: 2/5

- [x] **Task 3.3 — Test the #66 fix**
  - In `packages/core/tests/introspection/WorkflowNavigator.test.ts`, add cases to the existing
    `pending-review`/`review-failed` describe blocks (do not create a new file):
    - `pending-review` with stale `developmentPhase` and `gateInfo.reviewType === 'slice'` →
      `suggestedCommand` is `cf set phase 'Phase 4: Slice Design'`.
    - `pending-review` with `developmentPhase` already matching the derived phase → no
      `suggestedCommand` added (unchanged existing behavior — proves no regression for the
      already-correct case).
    - Same two cases repeated for `review-failed`.
    - One case each for `reviewType === 'tasks'` and `reviewType === 'code'` (at least one of the
      two branches) confirming Phase 5 / Phase 6 map correctly.
  - Add or confirm a regression assertion that the existing gate-fires-regardless-of-phase tests
    (`WorkflowNavigator.test.ts:809, 823` per the design) still pass unmodified — the gate must
    still block regardless of `phase` (design Success Criterion 8).
  - Success: all new cases pass; existing gate-blocking tests pass unmodified; no test regresses.
  - Effort: 3/5

- [x] **Task 3.4 — Confirm no overlap with #58/912 or `cf check` (design Success Criterion 9)**
  - By inspection (no code change expected): confirm the no-active-slice arch-gate branch (912's
    territory, a different function branch entirely) is untouched by Tasks 3.1–3.3, and confirm
    `ConsistencyChecker` (`cf check`) does not read `developmentPhase` anywhere (already established
    during #66 investigation and in slice 912's design) and therefore needs no test additions here.
  - Success: a short note (in this task's checkbox or the commit message) confirming both checks;
    existing `ConsistencyChecker` and 912-era `WorkflowNavigator` tests pass unmodified as part of
    Task 4.1's full-suite run.
  - Effort: 1/5

- [x] **Commit checkpoint** — after 3.4: `fix: attach phase to cf next review-gate branches (#66)`.

---

## Verification

- [x] **Task 4.1 — Full build + suite pass**
  - Run `pnpm -r build` (clean) and the core/cli/mcp-server test suites; confirm only previously-
    documented pre-existing failures (if any) remain, with zero new failures introduced by this
    slice's changes.
  - Success: build clean, no new test failures.
  - Effort: 1/5

- [x] **Task 4.2 — Docs: CHANGELOG + DEVLOG**
  - Add user-facing CHANGELOG entries for both fixes (#64 frontmatter parser nesting fix, #66 cf
    next stale-phase-on-review-gate suggestion) and a developer-facing DEVLOG session entry
    summarizing the corpus-verification results from Task 2.2.
  - Success: both files updated at repo root (not under `project-documents`).
  - Effort: 1/5

- [x] **Commit checkpoint** — after 4.1/4.2: `docs: slice 917 verification + changelog/devlog`
  (or fold into the final feature commit if trivial). Closes the slice.
