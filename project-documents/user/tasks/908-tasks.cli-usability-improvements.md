---
docType: tasks
layer: project
project: context-forge
slice: cli-usability-improvements
archIndex: 900
status: complete
dateCreated: 20260404
dateUpdated: 20260404
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
