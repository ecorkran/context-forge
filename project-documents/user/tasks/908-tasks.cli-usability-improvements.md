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
