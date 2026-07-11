---
docType: slice-design
slice: rename-git-branch-root-to-integration-branch
project: context-forge
parent: project-documents/user/architecture/900-slices.maintenance-and-refactoring.md
dependencies: []
interfaces: []
dateCreated: 20260711
dateUpdated: 20260711
status: complete
review: none
---

# Slice Design: Rename git.branch_root to git.integration_branch

## Overview

`git.branch_root` (909) is a pure branch-name string prefix — it never changes fork-from/merge-to targets, which always stay `main`. Real usage needs the value to also carry real git topology: a long-lived integration branch (GitHub-Flow/GitFlow style, e.g. `dev/erik`) that work branches fork from and merge into instead of `main`. That topology change is guide-level prose owned by `ai-project-guide` (out of scope here — see below). This slice is the CF-side half only: rename the config key so its name matches its new meaning.

Clean rename, no deprecated alias for the old key name — confirmed with the Project Manager.

## Scope

- Rename `git.branch_root` → `git.integration_branch` in `packages/core/src/config/ConfigKeys.ts`: same validation (relative, no leading `/`, no Windows drive/`\`, no `..` segments, no trailing slash), same default (`''`), updated `description` to describe an integration branch (fork-from/merge-to target when set) rather than a name-only prefix.
- Update `packages/core/tests/config/ConfigManager.test.ts` (existing `git.branch_root` coverage, ~lines 169-209 and the key-enumeration assertion ~line 370) to reference the new key name; same test cases.
- Sweep this repo for any other `git.branch_root` references (docs, this project's own config if set — confirmed unset via `cf config get git.branch_root` prior to this slice) and update to the new key name. Do not rewrite historical slice/task docs (909, 913) that describe what shipped under the old name — those stay as historical record.

## Out of Scope

- The branch-naming rule that reads this key and applies fork-from/merge-to/prefix behavior lives in the `ai-project-guide` submodule (`project-guides/rules/git.md`), not in this repo. That rewrite (redefining the key's semantics, eliminating the separate `{index}-planning.{name}` branch type, and stating the "never merge to main when integration_branch is set" hard rule) is tracked and executed upstream, independently of this slice.
- No new CLI command, MCP tool, or branch-creation automation is added here — this repo has no code today that reads this key to construct or check branches; consumption is agent-driven prose only.

## Verification

- `ConfigManager.test.ts` suite passes under the renamed key with equivalent coverage to what existed for `git.branch_root`.
- `cf config get git.integration_branch` returns the key with correct default/description; `cf config get git.branch_root` no longer resolves (clean rename, no alias).
- `pnpm -r build` and full test suite clean.
