---
docType: tasks
slice: frontmatter-validate-command-dateupdated-stamp
project: context-forge
lld: user/slices/923-slice.frontmatter-validate-command-dateupdated-stamp.md
dependencies: [922]
projectState: main is green, working tree clean at 90e60de. Slice 922 (canonical status vocabulary) is merged; STATUS and VALID_STATUSES are unified underscored, and validateFrontmatter is strict-with-migration-fixActions. All four publishable packages are at 0.12.0, unpublished — npm still has 0.11.0, so an internal API signature break is acceptable this window. validateFrontmatter (packages/core/src/schema/frontmatterSchema.ts:178) has exactly one consumer, ConsistencyChecker.ruleFrontmatterSchema (ConsistencyChecker.ts:1147), and no CLI surface. updateFrontmatterField (packages/core/src/introspection/writers/markdownWriter.ts:52) writes one key and never touches dateUpdated. Design reviewed PASS at 90e60de with no required changes.
dateCreated: 20260809
dateUpdated: 20260809
status: not_started
---

## Context Summary

- Working on slice 923: expose frontmatter validation as a narrow CLI
  command (`cf validate frontmatter`, GitHub #73) and make
  `updateFrontmatterField` stamp `dateUpdated` on every frontmatter write
  (GitHub #71). Two issues, one slice, because #73's `--fix` path applies
  fixActions through exactly the writer #71 changes.
- Current project state and key assumptions: `main` is green at `90e60de`,
  working tree clean, slice 922 merged. The design was reviewed PASS with
  one NOTE requiring no action. Design decisions D1–D4 (skip
  frontmatterless files, no `--fix` prompt, exit 0 after successful fix,
  project resolution required) are PM-approved and are **not** to be
  relitigated during implementation.
- Dependencies and prerequisites: slice 922 (complete, merged). The gate
  is only sound because `validateFrontmatter` now rejects non-canonical
  status spellings and attaches migration fixActions.
- What this slice delivers: a per-document, deterministic, cascade-free
  validation command with a 0/1/2 exit-code contract and machine-readable
  output, suitable as a pre-commit gate; three squadron machine-artifact
  docTypes (`review-resolution`, `gate-evidence`, `devlog`) registered so
  they stop silently passing unvalidated; and a truthful `dateUpdated` on
  every document `cf` mutates.
- Next planned slice: none scheduled. After this merges, 0.12.0 becomes
  publishable (GitHub #71, #72, #73 all resolved), and squadron slice 172
  is unblocked.

Full design detail, rationale, and design decisions D1–D4 live in
`user/slices/923-slice.frontmatter-validate-command-dateupdated-stamp.md`
— tasks below reference it rather than duplicating it.

**Implementation order rationale:** Part B (the writer stamp) lands first
so Part A's `--fix` path is built on the corrected writer. Then the Rule
12 extraction (proved by the existing suite), then the docType
registration, then the CLI command.

---

## Tasks

### Part B — `dateUpdated` Stamp (GitHub #71)

- [ ] **Task 1: Add required `dateUpdated` parameter to `updateFrontmatterField`** (effort: 2)
  - [ ] In `packages/core/src/introspection/writers/markdownWriter.ts`, add a
        fourth **required** parameter `dateUpdated: string` to
        `updateFrontmatterField`. Required, not optional — an optional
        parameter would let a future call site silently skip the stamp,
        which is the exact defect #71 reports.
  - [ ] After writing the requested `key`, write `dateUpdated` using the same
        replace-or-insert mechanics the function already uses: replace the
        existing `dateUpdated:` line inside the frontmatter bounds if
        present, otherwise insert a new line before the closing `---`.
  - [ ] Add the guard: when `key === 'dateUpdated'`, skip the stamp entirely.
        The caller is writing that field itself, and this is what protects
        the `dateCreated` backfill (`frontmatterSchema.ts:219`) from being
        overwritten with today's date. The guard lives inside the function
        so it is not re-implemented at call sites.
  - [ ] Do **not** make the stamp conditional on `dateCreated` being present.
        A document with no `dateCreated` still gets `dateUpdated`.
  - [ ] Do **not** change `FixLogEntry` or `updateCheckbox`. The returned log
        entry continues to record only the primary field's before/after;
        the stamp is asserted by tests, not logged.
  - [ ] Success criteria: `updateFrontmatterField` writes both the requested
        key and `dateUpdated` in a single file write; the function still
        reads no clock (date is supplied by the caller); `pnpm --filter
        @context-forge/core build` fails only at the three known call
        sites (Task 3), confirming the signature change is enforced at
        compile time.

- [ ] **Task 2: Tests for the `dateUpdated` stamp** (effort: 2)
  - [ ] In `packages/core/tests/introspection/writers/markdownWriter.test.ts`,
        add cases covering: (a) stamp replaces an existing `dateUpdated`
        line; (b) stamp inserts `dateUpdated` when the field is absent;
        (c) `key === 'dateUpdated'` writes the caller's value and does
        **not** overwrite it with the stamp date; (d) stamp applies when
        `dateCreated` is absent; (e) the returned `FixLogEntry` still
        reports the primary field's before/after, unchanged.
  - [ ] Pass an explicit fixed date string in every test — never a live
        clock — so assertions are deterministic.
  - [ ] Update any existing `updateFrontmatterField` call in this file to the
        new four-argument signature.
  - [ ] Success criteria: `pnpm --filter @context-forge/core test -- markdownWriter`
        passes with all new cases green.

- [ ] **Task 3: Update the three `updateFrontmatterField` call sites** (effort: 2)
  - [ ] `ConsistencyChecker.applyFixes` (`ConsistencyChecker.ts:208`): add a
        second parameter `dateStamp` defaulting to `formatDateProject()`
        (already exported from `packages/core/src/project-defaults.ts`),
        and pass it through to the `update-frontmatter` branch at
        `ConsistencyChecker.ts:228`. One stamp per run, so every document
        touched by a multi-fix run is dated identically.
  - [ ] `packages/cli/src/commands/check.ts` `setReviewNoneAction` (line 158):
        pass `formatDateProject()` so the `review: none` write also stamps.
  - [ ] Verify no other production call sites exist:
        `grep -rn "updateFrontmatterField" packages --include="*.ts"`
        (excluding `dist/` and tests) should show only
        `markdownWriter.ts`, `node.ts` (the re-export),
        `ConsistencyChecker.ts`, and `check.ts`.
  - [ ] Success criteria: `pnpm -r build` is green; no call site computes its
        own date inline beyond the single `formatDateProject()` call per
        operation.

- [ ] **Task 4: Tests for stamping through the fix pipeline** (effort: 2)
  - [ ] In the `ConsistencyChecker` test suite, add a case proving
        `applyFixes` passes its date stamp to `updateFrontmatterField` —
        call it with an explicit date and assert the argument, rather than
        asserting against a live clock.
  - [ ] Add the regression case for the interaction risk: a document missing
        `dateUpdated` but having `dateCreated` produces the backfill
        fixAction (`field: 'dateUpdated'`), and after `applyFixes` the
        file's `dateUpdated` equals its `dateCreated` — **not** the run
        date. This is design section B1's guard, verified end-to-end
        rather than only at the writer unit level.
  - [ ] Update `packages/cli/tests/commands/check.test.ts` for the
        `setReviewNoneAction` call-signature change.
  - [ ] Success criteria: `pnpm --filter @context-forge/core test` and
        `pnpm --filter @context-forge/cli test` both green.

- [ ] **Task 5: Commit Part B** (effort: 1)
  - [ ] Commit the stamp implementation, call-site updates, and tests.
        Suggested message: `fix(core): stamp dateUpdated on frontmatter writes`
  - [ ] Success criteria: `pnpm -r build` green and full core + cli suites
        green before committing; working tree clean after.

---

### Part A1 — Extract the Shared Validation Service

- [ ] **Task 6: Create `frontmatterFileValidator.ts`** (effort: 3)
  - [ ] Create `packages/core/src/schema/frontmatterFileValidator.ts`
        exporting `validateFrontmatterFiles(projectPath, paths?, options?)`
        returning `{ findings: FrontmatterFinding[]; filesChecked: number }`,
        per design section A1.
  - [ ] Move `DOC_SCAN_DIRS` out of `ConsistencyChecker`'s private static
        (`ConsistencyChecker.ts:1115`) into this module as an exported
        constant, and move the `discoverAllDocuments` walk
        (`ConsistencyChecker.ts:1125`) with it. One definition, per the
        comparison-values rule.
  - [ ] No-paths behavior: walk the six scan directories under
        `{projectPath}/project-documents/user/`, exactly as Rule 12 does
        today.
  - [ ] Explicit-paths behavior: resolve each path against `process.cwd()`
        (absolute paths pass through), then keep only files that end in
        `.md`, resolve to inside the document root
        (`{projectPath}/project-documents/user/`), and exist. Silently
        skip everything else — including nonexistent paths, because a
        staged-file list legitimately contains deletions. Note the
        containment check is against the **document root**, not the scan-dir
        list: an explicitly named file under e.g. `user/notes/` is
        validated even though the default walk does not visit it.
  - [ ] Per file: call `parseFrontmatter` (import directly from
        `introspection/parsers/frontmatterParser.js` — no
        `ArtifactIntrospector` dependency needed), skip when frontmatter is
        absent or unparseable (design decision D1, strict parity with Rule
        12), then call `validateFrontmatter(filePath, data, { projectName })`.
  - [ ] Count `filesChecked` as files actually validated (frontmatter found),
        not files discovered.
  - [ ] Export `validateFrontmatterFiles` and its result type from
        `packages/core/src/node.ts` (it touches the filesystem, so it
        belongs in the node entry point, not the browser-safe `index.ts`).
  - [ ] Success criteria: `pnpm --filter @context-forge/core build` green;
        the new module is importable from `@context-forge/core/node`.

- [ ] **Task 7: Tests for `validateFrontmatterFiles`** (effort: 3)
  - [ ] Create `packages/core/tests/schema/frontmatterFileValidator.test.ts`
        using **real temp-directory fixtures** (actual files on disk) — the
        walk and the containment filter cannot be meaningfully exercised
        against mocks.
  - [ ] Cover: (a) no-paths walk finds documents across multiple scan dirs;
        (b) explicit in-root `.md` path is validated; (c) out-of-root `.md`
        path is silently skipped; (d) non-`.md` path is silently skipped;
        (e) nonexistent path is silently skipped with no error; (f) a
        mixed list of all four kinds validates exactly the valid ones;
        (g) a file with no frontmatter is skipped and not counted in
        `filesChecked`; (h) an explicitly named file outside the scan dirs
        but inside the document root **is** validated.
  - [ ] Include at least one fixture with a real, invalid status value so a
        finding with a `fixAction` is produced end-to-end.
  - [ ] Success criteria: `pnpm --filter @context-forge/core test -- frontmatterFileValidator`
        green.

- [ ] **Task 8: Re-point Rule 12 at the shared service** (effort: 2)
  - [ ] Rewrite `ConsistencyChecker.ruleFrontmatterSchema`
        (`ConsistencyChecker.ts:1147`) to call `validateFrontmatterFiles`
        and keep **only** its `ConsistencyFinding` wrapping: the
        relative-path-prefixed description, `suggestedFix` text, `fixable`
        flag, and `fixAction` conversion.
  - [ ] Delete the now-duplicated `discoverAllDocuments` method and
        `DOC_SCAN_DIRS` static from `ConsistencyChecker`.
  - [ ] Rule 12 findings must be **byte-identical** before and after this
        extraction. The existing `ConsistencyChecker` suite is the
        regression guard — do not modify existing Rule 12 test
        expectations to accommodate the refactor. If an existing
        expectation fails, the extraction is wrong, not the test.
  - [ ] Success criteria: the full existing `ConsistencyChecker` suite passes
        unmodified; `cf check` output on this repo is unchanged (spot-check
        against the pre-change run).

- [ ] **Task 9: Commit the extraction** (effort: 1)
  - [ ] Commit the new service, its tests, and the Rule 12 delegation.
        Suggested message: `refactor(core): extract frontmatter file validation service`
  - [ ] Success criteria: `pnpm -r build` and full core suite green before
        committing.

---

### Part A2 — Register Machine-Artifact docTypes

- [ ] **Task 10: Register `review-resolution`, `gate-evidence`, `devlog`** (effort: 2)
  - [ ] Add the three docTypes to `FRONTMATTER_SCHEMAS`
        (`packages/core/src/schema/frontmatterSchema.ts:35`), each
        requiring **only** `docType` (with its own literal as the sole
        valid value) and `dateCreated`.
  - [ ] Deliberately omit `status` (these artifacts have no lifecycle),
        `project`, and — critically — `dateUpdated`. A single-file
        validator cannot know whether a document was edited after
        creation; requiring it would make the existing backfill assert
        something false. Add a brief comment recording why `dateUpdated`
        is absent, so a future contributor does not "fix" the omission.
  - [ ] Do **not** change the unknown-docType fall-through at
        `frontmatterSchema.ts:205` — this task registers three known types,
        it does not close the general gap.
  - [ ] Do **not** add filename-inference entries: squadron filenames are not
        recognized by `FILENAME_PARTS_RE`, which is harmless because these
        documents carry an explicit `docType`.
  - [ ] Success criteria: build green; a document with
        `docType: review-resolution` and `dateCreated` present validates
        clean.

- [ ] **Task 11: Tests for the three new docTypes** (effort: 2)
  - [ ] In `packages/core/tests/schema/frontmatterSchema.test.ts`, add a case
        per docType (three separate cases, not one loop) covering: missing
        `dateCreated` produces a finding; `docType` + `dateCreated` present
        with **no** `dateUpdated` and **no** `status` validates clean.
  - [ ] Add one case proving a wrong `docType` literal (e.g.
        `docType: devlog` validated against the `gate-evidence` schema
        shape) is still caught by the existing value-constraint logic.
  - [ ] Success criteria: `pnpm --filter @context-forge/core test -- frontmatterSchema`
        green, including all pre-existing cases.

---

### Part A3 — The CLI Command

- [ ] **Task 12: Add an exit-code parameter to `handleError`** (effort: 1)
  - [ ] In `packages/cli/src/utils/errors.ts`, add an optional exit-code
        parameter to `handleError` (`errors.ts:45`) defaulting to `1`, so
        every existing caller is unchanged.
  - [ ] Success criteria: `pnpm --filter @context-forge/cli build` green; no
        existing call site edited.

- [ ] **Task 13: Implement `cf validate frontmatter`** (effort: 3)
  - [ ] Create `packages/cli/src/commands/validate.ts` exporting
        `registerValidateCommand`, structured as a parent `validate`
        command with a `frontmatter [paths...]` subcommand (leaving room
        for future `cf validate <thing>` validators).
  - [ ] Register options via the shared helpers in
        `packages/cli/src/options.ts`: `withJsonOption`,
        `withProjectOption`, `withFixOption`. Do **not** add `-y/--yes` —
        design decision D2: this command's findings are per-document and
        deterministic, and its primary caller is a script.
  - [ ] Resolve the project with `resolveProjectWorktree` exactly as
        `check.ts` does (design decision D4). Missing project or missing
        `projectPath` is an invocation error → exit 2.
  - [ ] Call `validateFrontmatterFiles(projectPath, paths, { projectName })`.
  - [ ] With `--fix`: single pass over findings carrying a `fixAction`,
        applying each via `updateFrontmatterField(filePath, field, value,
        dateStamp)` with one `formatDateProject()` stamp computed per run.
        No re-validation after fixing (parity with `cf check`'s
        single-pass rule). Collect and report fix failures — do not throw.
  - [ ] Human output: findings grouped per file, `→ Fixed: before → after`
        lines in fix mode mirroring `check.ts` formatting, and a summary
        line reporting counts plus `filesChecked`.
  - [ ] Document the no-prompt `--fix` divergence from `cf check` in the
        command's `--help` text.
  - [ ] Register the command in `packages/cli/src/index.ts` alongside the
        other command registrations.
  - [ ] Success criteria: `cf validate frontmatter --help` renders; the
        command runs against this repo and reports findings.

- [ ] **Task 14: Implement the exit-code contract** (effort: 2)
  - [ ] Exit `0` when no findings remain unfixed — a clean run, or a `--fix`
        run that fixed everything it found (design decision D3).
  - [ ] Exit `1` when one or more findings remain: any finding without
        `--fix`, or unfixable/fix-failed findings with it. Set
        `process.exitCode = 1` directly rather than throwing — findings are
        a result, not an error.
  - [ ] Exit `2` for invocation errors, via `handleError(err, 2)`.
  - [ ] `--json` output shape:
        `{ filesChecked, totalFindings, errors, warnings, findings[] }`,
        plus `fixed`, `fixLog`, `fixErrors` in fix mode. Findings already
        carry `filePath`, `rule`, `severity`, `description`, and optional
        `fixAction` — that is the machine-readable contract #73 specifies.
  - [ ] Success criteria: each of the three exit codes is reachable by a
        real invocation.

- [ ] **Task 15: CLI tests for the validate command** (effort: 3)
  - [ ] Create `packages/cli/tests/commands/validate.test.ts`, following the
        mocking style already established in
        `packages/cli/tests/commands/check.test.ts`.
  - [ ] Cover: (a) clean run exits 0; (b) findings present without `--fix`
        exits 1; (c) unresolvable project exits 2; (d) `--fix` that
        resolves everything exits 0; (e) `--fix` with a fix failure exits
        1 and reports the failure; (f) `--json` emits the documented shape
        with `filesChecked` and the findings array; (g) explicit paths are
        forwarded to the service unchanged (the filtering itself is the
        service's job, already covered by Task 7).
  - [ ] Assert exit codes explicitly — this is the contract squadron
        depends on, so it must be pinned by tests rather than inferred.
  - [ ] Success criteria: `pnpm --filter @context-forge/cli test -- validate`
        green.

- [ ] **Task 16: Commit Part A** (effort: 1)
  - [ ] Commit the docType registration, the CLI command, the `handleError`
        change, and all associated tests. Suggested message:
        `feat(cli): add cf validate frontmatter command`
  - [ ] Success criteria: `pnpm -r build` green and full core + cli suites
        green before committing.

---

### Verification and Close-Out

- [ ] **Task 17: Full build and suite verification** (effort: 1)
  - [ ] Run `pnpm -r build`, then the full core, cli, and mcp-server suites.
  - [ ] `packages/electron` has one known pre-existing `TemplateProcessor`
        failure unrelated to this slice — confirm it is the only electron
        failure and do not attempt to fix it here.
  - [ ] Success criteria: core, cli, and mcp-server suites fully green; no
        new failures anywhere.

- [ ] **Task 18: Execute the verification walkthrough** (effort: 2)
  - [ ] Execute all six walkthrough steps from design section "Verification
        Walkthrough" against the **locally built** CLI
        (`node packages/cli/dist/index.js`). The global `cf` binary is a
        separate published npm install at 0.11.0 and will not contain
        these changes.
  - [ ] Record the actual observed output for each step in the design
        document, replacing the draft walkthrough. If observed behavior
        differs from the draft, correct the document to match reality and
        note the discrepancy.
  - [ ] Delete every scratch file the walkthrough creates (steps 2 and 4)
        and confirm the working tree is clean afterward.
  - [ ] Success criteria: all six steps produce the documented outcome; each
        of the eight success criteria in the design maps to an executed
        step.

- [ ] **Task 19: Update CHANGELOG** (effort: 1)
  - [ ] Add to `CHANGELOG.md` under `[Unreleased]`: the new
        `cf validate frontmatter` command with its 0/1/2 exit-code
        contract; the three registered machine-artifact docTypes; the
        `dateUpdated` stamping behavior change; and the
        `updateFrontmatterField` required-parameter signature break (a
        compile-time break for external consumers of
        `@context-forge/core/node`).
  - [ ] Success criteria: entries state observable behavior, not
        implementation detail; the signature break is unambiguous to
        someone reading only the changelog.

- [ ] **Task 20: Close out the slice** (effort: 1)
  - [ ] Delegate checklist updates to the `task-checker` agent: check off all
        tasks in this file with deviation notes where implementation
        differed from plan, set this file's and the design document's
        `status: complete`, and check entry 23 in
        `user/architecture/900-slices.maintenance-and-refactoring.md`.
  - [ ] Run `cf check` and confirm no **new** findings were introduced. The
        pre-existing findings (909 info, 921 review-gate, 922 code review)
        are expected and out of scope.
  - [ ] Commit the close-out.
  - [ ] Success criteria: `cf list slices` renders 923 as complete; working
        tree clean.
