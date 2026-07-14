---
docType: tasks
layer: project
project: context-forge
slice: cli-usability-improvements
archIndex: 900
status: complete
dateCreated: 20260404
dateUpdated: 20260714
---

# Tasks: CLI Usability Improvements (908)

## Item A: Initiative-Plan-Aware `cf list arch`

### A1. Extract initiative plan finder to shared utility

- [x] Add `resolveInitiativePlanPath(projectPath: string): Promise<string | null>` to `packages/core/src/introspection/ArtifactIntrospector.ts` (or as a standalone export)
  - Pattern: `001-initiative-plan.*.md` in `project-documents/user/project-guides/`
  - Returns full path or null if not found
- [x] Update `ConsistencyChecker.findInitiativePlan()` to delegate to the new utility (remove duplicate logic)
- [x] Export the new function from `@context-forge/core`
- [x] Add unit test for `resolveInitiativePlanPath` (found, not found, directory missing)

**Commit:** `refactor(core): extract resolveInitiativePlanPath utility`

### A2. Update `archListAction` to drive from initiative plan

- [x] In `packages/cli/src/commands/list/arch.ts`, call `resolveInitiativePlanPath` to find the plan
- [x] If found: parse with `introspector.parseSlicePlan()`, build entries with index, name, isChecked, archFile (via `detectDocuments` or filesystem scan), active indicator
- [x] Status derivation: checked → `complete`; unchecked + arch file exists → `in_progress`; unchecked + no arch file → `not_started`
- [x] Apply existing worktree index range filter to plan entries
- [x] If no initiative plan found: fall back to existing `buildModel()`-based output
- [x] Update table output to show: index, name, status, arch file (or `—`)
- [x] Update `--json` output to emit array consistent with `cf list slices --json`
- [x] Add unit tests for the updated action (with and without initiative plan)

**Commit:** `feat(cli): drive cf list arch from initiative plan`

## Item B: Context Profile Filtering Fix

### B1. Simplify ProfileMap and rewrite parser

- [x] Simplify `ProfileMap` type from `Record<string, { variables: string[] }>` to `Record<string, string[]>`
- [x] Rewrite `parseProfilesYaml` to handle both compact and expanded formats without indent-counting
- [x] Update `getProfileForInstruction` and `parseProfiles` for simplified type
- [x] Update test fixtures: add compact format, add real prompt file test, remove `.variables` accessors
- [x] Verify ContextIntegrator filtering tests still pass (expanded format fixture unchanged)
- [x] Build and all tests pass

**Commit:** `fix(core): context profile parser handles compact YAML format`

## Item C: `cf check` Noise Reduction

### C1. Frontmatter auto-fix coverage and noise reduction

- [x] Add `draft` as alias for `not_started` in `validateFrontmatter` value normalization
- [x] Auto-fix missing `dateUpdated` by defaulting to `dateCreated` when present
- [x] Gate Rule 3 "missing task file" finding on slice design existence (suppress backlog noise)
- [x] Add unit tests: `draft` alias, `dateUpdated` fix (with and without dateCreated), suppressed Rule 3 case
- [x] Verify on real project: `cf check` no longer reports the noise

**Commit:** `fix(core): cf check noise reduction and auto-fix coverage`

## Item D: Architecture Status Validation & Finding Attribution

Fixes GitHub issue #63, found while dogfooding `cf list arch`/`cf check` on squadron (12-initiative project).

### D1. Unify status-validity checking so `cf check` catches what `cf list arch` calls "unreadable"

- [x] In `packages/core/src/schema/frontmatterSchema.ts`, replace `validateFrontmatter()`'s bespoke `status` alias normalization (lines ~254-263: hyphen/space→underscore, `completed`→`complete`, `active`→`in_progress`, `draft`→`not_started`) with a call to `normalizeStatus()` from `packages/core/src/introspection/parsers/statusNormalizer.ts`, so Rule 12 uses the same alias set (`STATUS_MAP`: adds `done`, `ready`, `pending`, `planned`) that `cf list arch`'s "unreadable" label is based on
- [x] Confirm `normalizeStatus()` returning `undefined` still produces the existing "Invalid value '...' for field 'status'..." finding (i.e. `undefined` should fail the `def.values.includes(effectiveValue)` check, not silently pass)
- [x] Verify no import cycle: `schema/frontmatterSchema.ts` → `introspection/parsers/statusNormalizer.ts` → `introspection/types.ts` (none of these import back from `schema/`)
- [x] Add unit test: architecture doc (and at least one other docType) with a status value that `cf list arch`/`normalizeStatus()` treats as unrecognized (e.g. a typo) now produces a Rule 12 finding
- [x] Add regression test using the `draft`/`done`/`ready`/`pending`/`planned` aliases to confirm they still validate cleanly post-unification (no false positives introduced)

**Commit:** `fix(core): unify frontmatter status validation with normalizeStatus`

### D2. Name the architecture document in Rule 8's findings

- [x] In `packages/core/src/introspection/ConsistencyChecker.ts`'s `ruleArchStatusVsPlans` (~line 812), use the existing static `ConsistencyChecker.extractFileIndex(archPath)` helper to get the arch index, and interpolate it into both finding descriptions (~line 835 and ~line 851), matching the naming pattern already used by `ruleInitiativeEntryVsArch` (e.g. `Architecture (${archIndex}) status is "complete" but plan has unchecked entries (...)`)
- [x] Handle the case where `extractFileIndex` returns `null` (fall back to the bare filename via `archPath`, not a blank/undefined interpolation)
- [x] Update/add unit tests for `ruleArchStatusVsPlans` asserting the arch index (or filename) appears in the finding description
- [x] Verify on a multi-initiative fixture (or manually against squadron) that each of several unchecked-plan findings now names its own initiative distinctly

**Commit:** `fix(core): name architecture document in arch-status-vs-plans findings`

### D3. Full verification

- [x] `pnpm -r build` clean
- [x] `pnpm --filter @context-forge/core test` — only pre-existing unrelated failures remain
- [x] `pnpm --filter @context-forge/cli test` — only pre-existing unrelated failures remain
- [x] Manual check: run `cf check` and `cf list arch` against a project with an unrecognized arch status and confirm both now report it consistently
