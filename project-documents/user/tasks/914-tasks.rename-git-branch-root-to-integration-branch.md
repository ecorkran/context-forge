---
docType: tasks
slice: rename-git-branch-root-to-integration-branch
project: context-forge
parent: project-documents/user/slices/914-slice.rename-git-branch-root-to-integration-branch.md
lldReference: project-documents/user/slices/914-slice.rename-git-branch-root-to-integration-branch.md
dependencies: []
projectState: >
  Retroactive task file, written after implementation (same pattern as 909).
  Both the config-key rename and a related review-gate bug found while
  dogfooding this slice are complete and committed on branch
  914-slice.rename-git-branch-root-to-integration-branch (commits 88e9a33,
  66fa324), not yet merged to main.
dateCreated: 20260711
dateUpdated: 20260711
status: complete
---

# Tasks: Rename git.branch_root to git.integration_branch

## Context Summary

Small maintenance rename (Effort 1/5 per the slice plan), plus one follow-on
bug fix discovered while dogfooding it. Task list kept intentionally coarse —
this is retroactive documentation of completed work, not a forward plan.

## Tasks

- [x] 1. Rename `git.branch_root` → `git.integration_branch` in `packages/core/src/config/ConfigKeys.ts` (same validation, updated description). Effort: 1
- [x] 2. Update `packages/core/tests/config/ConfigManager.test.ts` to the renamed key (6 validation cases + key-enumeration assertion). Effort: 1
- [x] 3. Sweep repo for other live `git.branch_root` references; confirm none needed updating (project's own config was unset; historical docs left as history). Effort: 1
- [x] 4. Build (`pnpm -r build`) and verify full test suite; confirm only pre-existing unrelated failures remain (`FileProjectStore.test.ts`, CLI `list.test.ts`). Effort: 1
- [x] 5. Verify end-to-end via built CLI: `cf config get git.integration_branch` resolves correctly; `cf config get git.branch_root` errors as unknown key. Effort: 1
- [x] 6. Follow-on fix (found via `cf check --set-review-none 914` not clearing the slice-review gate): widen the review-exempt frontmatter field from `codeReview: none` (only cleared `preAdvance`) to `review: none` (clears `preTasks`/`preImplementation`/`preAdvance`, not `preSlicePlan`). Updated `frontmatterSchema.ts`, `reviewGate.ts`, `check.ts` (`--set-review-none` flag + help text). Effort: 2
- [x] 7. Update tests for task 6: `reviewGate.test.ts` (widened + new preSlicePlan-exemption-boundary test), `frontmatterSchema.test.ts`, CLI `check.test.ts`, fixture `405-slice.gate-docs-only.md`. Effort: 2
- [x] 8. Migrate the four live `codeReview: none` instances in the repo (243, 909, 911, 914) to `review: none`. Effort: 1
- [x] 9. Re-verify build + full test suite clean after task 6/7/8; confirm via `cf check`/`cf next` on this repo that 914's phantom slice/code-review warnings are gone. Effort: 1
