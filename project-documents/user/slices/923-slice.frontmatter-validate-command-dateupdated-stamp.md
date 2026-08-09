---
docType: slice-design
project: context-forge
slice: 923
parent: user/architecture/900-slices.maintenance-and-refactoring.md
dependencies: [922]
dateCreated: 20260809
dateUpdated: 20260809
status: complete
---

# Slice 923: Frontmatter Validate Command & dateUpdated Stamp

Fixes GitHub issues #73 (`cf validate frontmatter`) and #71 (`dateUpdated` stamp on frontmatter writes). Consumer: squadron slice 172, a pre-commit gate that retires its parallel Python validator in favor of this command.

## Overview

Two coupled changes on the frontmatter write/validate path:

- **Part A (#73):** expose the existing `validateFrontmatter` function as a narrow CLI command, `cf validate frontmatter [paths...]`, suitable as a commit gate — per-document, deterministic, no cross-file inference, no fix cascades. Also register the three squadron machine-artifact docTypes (`review-resolution`, `gate-evidence`, `devlog`) that currently fall through the `FRONTMATTER_SCHEMAS` lookup miss as valid.
- **Part B (#71):** make `updateFrontmatterField` stamp `dateUpdated` alongside whatever key it writes, so `cf check --fix` (and Part A's `--fix`) stop leaving mutated documents with stale modification dates.

They ship together because Part A's `--fix` applies fixActions through exactly the writer Part B changes, and Part A's new docTypes carry an explicit *don't-require-dateUpdated* rule that only makes sense designed against Part B's stamping semantics.

## Value

- A sound pre-commit gate becomes possible: squadron (and any script) can validate staged documents with predictable exit codes, eliminating the third transcription of the canonical schema (guide → cf → squadron's Python copy).
- Every `cf`-mutated document carries a truthful `dateUpdated`, restoring the invariant `frontmatterSchema.ts` already assumes (its backfill treats a missing `dateUpdated` as "never updated").

## Technical Scope

**Included:**
- Core: extract Rule 12's file-discovery + per-file validation into a shared, public core service; register three new docTypes; `updateFrontmatterField` stamp.
- CLI: new `validate` command with `frontmatter` subcommand; exit-code plumbing for the 0/1/2 contract.
- Tests for all of the above; CHANGELOG entry.

**Excluded:**
- No new validation logic beyond registering the three docTypes — the command is a thin surface over what `validateFrontmatter` already does (per #73's explicit framing).
- No MCP tool surface (`validate_frontmatter` tool) — #73 asks for CLI only; add later if a consumer appears.
- No change to `updateCheckbox` — #71 scopes the stamp to `updateFrontmatterField`. Checkbox toggles in task files remain unstamped (body edit, not a frontmatter write; revisit only if someone asks).

## Architecture

### Component Structure

```
packages/core/src/schema/
  frontmatterSchema.ts          # + 3 docType schemas (registration only)
  frontmatterFileValidator.ts   # NEW: shared discovery + per-file validation service
packages/core/src/introspection/
  ConsistencyChecker.ts         # Rule 12 delegates to frontmatterFileValidator;
                                #   applyFixes passes a date stamp
  writers/markdownWriter.ts     # updateFrontmatterField stamps dateUpdated
packages/cli/src/commands/
  validate.ts                   # NEW: registerValidateCommand
  check.ts                      # setReviewNoneAction passes a date stamp
packages/cli/src/utils/errors.ts # handleError gains optional exit code (default 1)
```

### Data Flow

```
cf validate frontmatter [paths...]
  → resolveProjectWorktree (projectPath required)
  → validateFrontmatterFiles(projectPath, paths?)      # core service
      no paths → walk DOC_SCAN_DIRS under project-documents/user/
      paths    → filter to in-root .md files, silently skip the rest
      per file → parseFrontmatter → validateFrontmatter
  → [--fix] apply each finding.fixAction via updateFrontmatterField(…, dateStamp)
  → human or --json output → exit 0 / 1 / 2

cf check --fix (existing path, now shared)
  → checkAll → Rule 12 → validateFrontmatterFiles(…)   # same service, same results
  → applyFixes → updateFrontmatterField(…, dateStamp)  # now stamps dateUpdated
```

## Part A — `cf validate frontmatter` (#73)

### A1. Core service: `validateFrontmatterFiles`

New module `packages/core/src/schema/frontmatterFileValidator.ts`:

```ts
export interface FrontmatterFileValidationResult {
  findings: FrontmatterFinding[];   // existing type — filePath, severity, description, fixAction?
  filesChecked: number;
}

export async function validateFrontmatterFiles(
  projectPath: string,
  paths?: string[],
  options?: { projectName?: string },
): Promise<FrontmatterFileValidationResult>
```

Behavior:
- **Document root** is `{projectPath}/project-documents/user/`.
- **No paths:** walk the same six subdirectories `cf check` Rule 12 walks today (`architecture`, `slices`, `tasks`, `project-guides`, `reviews`, `analysis`). `DOC_SCAN_DIRS` moves from `ConsistencyChecker`'s private static into this module (exported); `ConsistencyChecker` references it — one definition, per the comparison-values rule.
- **Paths given:** resolve each against `process.cwd()` (absolute paths pass through), then keep only files that (a) end in `.md`, (b) resolve to inside the document root, and (c) exist. Everything else is **silently skipped** — including nonexistent paths, because a staged-file list legitimately contains deletions. This is the containment check, not the scan-dir list: an explicitly named file anywhere under `project-documents/user/` (e.g. `user/notes/`) is validated even though the default walk doesn't visit it.
- **Per file:** parse frontmatter via the same parse path Rule 12 uses (`ArtifactIntrospector.parseFrontmatter` / the underlying `frontmatterParser`) so results are guaranteed identical to `cf check`; call `validateFrontmatter(filePath, data, { projectName })`; collect findings.
- **Files whose frontmatter is absent or unparseable are skipped**, matching Rule 12 exactly (see Design Decisions, D1).

`ConsistencyChecker.ruleFrontmatterSchema` (`ConsistencyChecker.ts:1147`) delegates to this service and keeps only its `ConsistencyFinding` wrapping (relative-path-prefixed descriptions, `fixable`/`fixAction` conversion). `discoverAllDocuments` (`:1125`) moves into the service. Existing Rule 12 findings must be byte-identical before and after the extraction — the existing `ConsistencyChecker` suite is the regression guard.

### A2. Register the squadron machine-artifact docTypes

Add to `FRONTMATTER_SCHEMAS` (`frontmatterSchema.ts:35`):

```ts
'review-resolution': { fields: { docType: { required: true, values: ['review-resolution'] },
                                 dateCreated: { required: true } } },
'gate-evidence':     { fields: { docType: { required: true, values: ['gate-evidence'] },
                                 dateCreated: { required: true } } },
'devlog':            { fields: { docType: { required: true, values: ['devlog'] },
                                 dateCreated: { required: true } } },
```

- **No `status`** (these artifacts have no lifecycle), **no `project`**, and — critically — **no `dateUpdated`**: a single-file validator cannot know whether the document was edited after creation. The existing backfill (`frontmatterSchema.ts:219`) only fires for required-but-missing fields, so it naturally never touches these.
- Unknown docTypes still pass through unvalidated (`frontmatterSchema.ts:205` behavior unchanged) — this slice registers the three known squadron types; it does not close the general fall-through.
- `FILENAME_PARTS_RE` / segment inference don't recognize squadron filenames — harmless, since these documents carry explicit `docType`. No inference changes needed.

### A3. CLI command

New `packages/cli/src/commands/validate.ts`, registered in `packages/cli/src/index.ts`. Structure: parent command `validate` with subcommand `frontmatter [paths...]`, leaving room for future `cf validate <thing>` validators.

**Options** (via the shared `options.ts` helpers): `-j/--json`, `-p/--project`, `-f/--fix`. No `-y/--yes` — see Design Decisions, D2.

**Flow:**
1. Resolve project via `resolveProjectWorktree` (same as `check.ts`); missing project or `projectPath` → invocation error, exit 2.
2. `validateFrontmatterFiles(projectPath, paths, { projectName })`.
3. With `--fix`: single pass over findings carrying a `fixAction`, applying each via `updateFrontmatterField(filePath, field, value, dateStamp)` with one `formatDateProject()` stamp computed per run. No re-validation after fixing (parity with `cf check`'s single-pass rule). Fix failures are collected and reported, not thrown.
4. Output:
   - Human: findings grouped per file, `→ Fixed: before → after` lines in fix mode (mirroring `check.ts` formatting), summary line with counts and `filesChecked`.
   - `--json`: `{ filesChecked, totalFindings, errors, warnings, findings: FrontmatterFinding[], fixed?, fixLog?, fixErrors? }`. Findings already carry `filePath`, `rule`, `severity`, `description`, `fixAction` — the machine-readable contract #73 asks for.

**Exit codes:**
- `0` — no findings remain unfixed (clean run, or `--fix` fixed everything it found).
- `1` — one or more findings remain (any finding without `--fix`; unfixable or fix-failed findings with it).
- `2` — invocation error (unresolvable project, missing `projectPath`, unknown subcommand).

Mechanics: `handleError` (`errors.ts:45`) gains an optional exit-code parameter defaulting to `1`, so every existing caller is unchanged; `validate.ts` passes `2` for invocation errors and sets `process.exitCode = 1` itself for the findings case (findings are a result, not an error — no throw).

## Part B — `dateUpdated` stamp (#71)

### B1. `updateFrontmatterField` signature

```ts
export async function updateFrontmatterField(
  filePath: string,
  key: string,
  value: string,
  dateUpdated: string,   // YYYYMMDD; the write date, supplied by the caller
): Promise<FixLogEntry>
```

- The parameter is **required, not optional**. An optional parameter would let a future call site silently skip the stamp — the exact bug #71 reports. Callers obtain the value from the existing `formatDateProject()` (`project-defaults.ts:29`); the writer never reads a clock, staying deterministic and testable per the issue's explicit ask.
- After writing `key`, the function also writes `dateUpdated` using the same replace-or-insert mechanics: replace the existing `dateUpdated:` line if present, insert before the closing `---` if absent.
- **Guard:** when `key === 'dateUpdated'`, skip the stamp — the caller is writing the field itself. This is what protects the `dateCreated` backfill (`frontmatterSchema.ts:219` → fixAction `field: 'dateUpdated'` → `applyFixes` → this function) from being overwritten with today's date. The guard lives inside the function so it isn't re-implemented at call sites.
- The stamp is **not conditional on `dateCreated`** being present (#71: "Documents with no dateCreated should still get dateUpdated").
- `FixLogEntry` is unchanged and continues to record the primary field's before/after only; the stamp is asserted by tests, not logged. (`file-naming-conventions` semantics: `dateUpdated` moving to the write date is the convention working, not a reportable change.)

### B2. Call sites

Three, all passing `formatDateProject()` computed once per operation:

1. `ConsistencyChecker.applyFixes` (`ConsistencyChecker.ts:228`) — signature becomes `applyFixes(checkResult, dateStamp = formatDateProject())`; tests pass an explicit date to pin assertions. One stamp per run, so a multi-fix run dates every touched document identically.
2. `check.ts` `setReviewNoneAction` (`check.ts:158`) — the `review: none` write now also stamps.
3. The new `validate.ts` `--fix` path (Part A3).

### B3. Interaction with Part A's docTypes

If a fix ever mutates a `review-resolution`/`gate-evidence`/`devlog` document, the stamp writes a `dateUpdated` field into it. That is convention-correct — `dateUpdated` belongs on "any document edited after creation" — and the schema not *requiring* the field is unaffected by its presence.

## Design Decisions

**D1 — Files with absent/unparseable frontmatter are skipped, matching Rule 12.** A gate that skips frontmatterless files cannot enforce "all markdown must include frontmatter," so this is a real (inherited) gap — but #73 explicitly scopes the command to "not new validation logic," and diverging from `cf check` here would make the two surfaces disagree about the same file. Kept as strict parity; if the squadron gate needs a missing-frontmatter check, that is a one-line follow-up issue against `validateFrontmatterFiles`, decided separately.

**D2 — `--fix` applies without a confirmation prompt.** `cf check --fix` prompts because its findings are cross-document and interdependent; this command's findings are per-document and deterministic, and its primary caller is a script. A prompt would force `-y` into every scripted invocation for no safety gain. Divergence from `check.ts` is deliberate and documented in the command's `--help` text.

**D3 — Exit 0 after a fully-successful `--fix` run.** The gate use case runs *without* `--fix` (report-only; a pre-commit hook must not mutate staged content out from under the index). Interactive `--fix` use exits 0 when nothing remains broken, which matches operator intuition ("it's fixed") and keeps `&&`-chaining useful.

**D4 — Project resolution required.** The command resolves the project like every other `cf` command (registered project with `projectPath`), rather than operating bare on the cwd. Squadron-gated repos are cf-registered by definition; inventing a projectless mode would duplicate root-discovery logic for a consumer that doesn't need it.

## Integration Points

- **Provides:** a stable, machine-readable validation surface (command + exit codes + JSON shape) for squadron slice 172 and any future hook/CI caller; `validateFrontmatterFiles` as a public core export for a future MCP tool.
- **Consumes:** slice 922's canonical status vocabulary — the gate is only sound because `validateFrontmatter` now rejects non-canonical spellings with migration fixActions (922, complete on main).
- **Breaking change (internal API):** `updateFrontmatterField` gains a required parameter. It is exported from `@context-forge/core/node`, so this is a compile-time break for external consumers — acceptable in the unpublished 0.12.0 window and worth a CHANGELOG line.

## Success Criteria

1. `cf validate frontmatter` on this repo (post-922, all docs canonical) checks all methodology documents and exits 0.
2. A document with `status: in-progress` produces a finding carrying `fixAction: {field: 'status', value: 'in_progress'}`, exit 1; `--fix` rewrites it to canonical **and stamps `dateUpdated` with the run date**; a rerun exits 0.
3. An unfiltered staged-file list (mix of in-root `.md`, out-of-root `.md`, non-`.md`, and nonexistent paths) validates exactly the in-root `.md` files that exist and silently skips the rest — no errors, no findings for skipped paths.
4. A `review-resolution`/`gate-evidence`/`devlog` document missing `dateCreated` is flagged; one with `dateCreated` and **no** `dateUpdated` passes clean.
5. `cf check --fix` stamps `dateUpdated` on every document whose frontmatter it mutates, and the `dateUpdated`-backfill fixAction still writes the `dateCreated` value, not today's date.
6. `cf check` Rule 12 findings are unchanged by the extraction (existing suite green, no snapshot churn).
7. `--json` output contains `filesChecked`, counts, and the findings array with `filePath`/`rule`/`severity`/`description`/`fixAction`.
8. Exit codes: 0 clean / 1 findings / 2 invocation error, each covered by a CLI test.

## Verification Walkthrough

Executed 20260809 against the locally built CLI (`node packages/cli/dist/index.js` after `pnpm -r build`; the global `cf` binary is a separate published npm install at 0.11.0 and does not contain these changes).

1. **Clean gate run:**
   ```
   $ node packages/cli/dist/index.js validate frontmatter; echo "exit=$?"
   Frontmatter Validation

     No inconsistencies found (257 files checked)
   exit=0
   ```
   Matches: N files checked, no findings, exit 0.

2. **Detect → fix → clean:** copied `922-slice...md` to `project-documents/user/slices/999-slice.scratch.md`, set `status: in-progress` in its frontmatter only (not the code-block occurrence in the body).
   ```
   $ node packages/cli/dist/index.js validate frontmatter; echo "exit=$?"
     ⚠ Invalid value 'in-progress' for field 'status' on docType 'slice-design' (expected: complete, in_progress, not_started, deprecated, deferred; will fix to 'in_progress')
   1 finding across 1 file (258 checked)
   exit=1

   $ node packages/cli/dist/index.js validate frontmatter --fix
     → Fixed: in-progress → in_progress
   Fixed 1 of 1 findings
   exit=0
   ```
   File afterward: `status: in_progress` and `dateUpdated: 20260809` (today), written in the same fix pass. Rerun → exit 0. Scratch file deleted.

3. **Staged-list tolerance:**
   ```
   $ node packages/cli/dist/index.js validate frontmatter project-documents/user/slices/922-slice.unify-canonical-status-vocabulary.md src/does-not-matter.ts no-such-file.md README.md; echo "exit=$?"
     No inconsistencies found (1 file checked)
   exit=0
   ```
   Exactly the one in-root `.md` file that exists was checked; the out-of-root `src/does-not-matter.ts`, the nonexistent `no-such-file.md`, and the out-of-root `README.md` were silently skipped — no errors, no findings for skipped paths.

4. **Machine artifacts:** created `project-documents/user/reviews/scratch-resolution.md` with `docType: review-resolution` and no `dateCreated`:
   ```
   $ node packages/cli/dist/index.js validate frontmatter project-documents/user/reviews/scratch-resolution.md; echo "exit=$?"
     ⚠ Missing required field 'dateCreated' for docType 'review-resolution'
   exit=1
   ```
   Added `dateCreated: 20260809` (still no `dateUpdated`):
   ```
   $ node packages/cli/dist/index.js validate frontmatter project-documents/user/reviews/scratch-resolution.md; echo "exit=$?"
     No inconsistencies found (1 file checked)
   exit=0
   ```
   Scratch file deleted.

5. **check --fix stamps:** copied a slice doc to a scratch file and deleted its `status:` frontmatter line, then ran `node packages/cli/dist/index.js check --fix -y` **against the whole project** (unlike `validate frontmatter`, `cf check` has no path-scoping — only `--slice <index>` — so this necessarily also re-evaluates every other slice's findings, not just the scratch file). Observed: the scratch file's missing `status` was backfilled to `not_started` (inferred default) with `dateUpdated: 20260809` stamped in the same write — confirming the guarantee. The same run also correctly fixed unrelated, real, pre-existing findings on this repo (923's own frontmatter `status: not_started` → `in_progress`, matching that 85/102 tasks were actually in progress at the time; the 900 architecture doc's status and the initiative-plan checkbox, both stale for the same reason). Those fixes were kept, not reverted — they are correct given true project state at the time, and this is the intended blast radius of an unscoped `cf check --fix -y`, not a defect. **Caveat for future walkthrough runs:** run `cf check --fix -y` against an isolated/throwaway project, or expect it to also correct any other real, pre-existing findings on the target project — it is not scoped to only the scratch file.

6. **JSON contract:**
   ```
   $ node packages/cli/dist/index.js validate frontmatter -j | python3 -c "import json,sys; d=json.load(sys.stdin); print(d['filesChecked'], d['totalFindings'])"
   257 0
   ```
   Parseable; `filesChecked` and `totalFindings` present, along with `errors`, `warnings`, and `findings` per the documented `--json` shape.

All eight Success Criteria above were exercised by these six steps (criteria 2 and 5 both by step 2/5; criterion 6 implicitly by the byte-identical existing `ConsistencyChecker` suite in Task 8, not by this manual walkthrough).

## Implementation Notes

**Suggested order** (each step leaves the tree green):
1. Part B first — `updateFrontmatterField` stamp + call-site updates + tests. Small, and Part A's `--fix` then lands on the corrected writer.
2. Extract `validateFrontmatterFiles`; re-point Rule 12; existing suite proves parity.
3. Register the three docTypes + schema tests.
4. CLI `validate.ts` + `handleError` exit-code parameter + CLI tests.
5. CHANGELOG (`[Unreleased]`: new command; docType registration; stamp behavior; `updateFrontmatterField` signature break), walkthrough execution, close-out.

**Testing strategy:** core tests use real temp-dir fixtures (actual files on disk, per the parsing rule — the walk and containment filter must be exercised against a real tree, including a nonexistent path and an out-of-root file). CLI tests cover exit codes explicitly (`0`/`1`/`2`), the JSON shape, and `--fix` single-pass semantics. Writer tests cover: stamp with existing `dateUpdated`, stamp inserting absent `dateUpdated`, `key === 'dateUpdated'` guard, stamp with absent `dateCreated`.

Effort: 2/5. Risk: Low–Medium — the writer change touches every `--fix` mutation, and the Rule 12 extraction touches `cf check`'s widest rule; both are fenced by existing suites plus the new parity/stamp tests.
