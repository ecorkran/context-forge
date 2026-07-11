---
docType: slice-design
slice: configurable-branch-root-prefix
project: context-forge
parent: project-documents/user/architecture/900-slices.maintenance-and-refactoring.md
dependencies: []
interfaces: []
dateCreated: 20260628
dateUpdated: 20260710
status: complete
---

# Slice Design: Configurable Branch Root Prefix

## Overview

This is a **retroactive record**, written after the fact to give slice 909 a normal artifact trail. The work itself shipped in commit `713d0c0` ("feat(core): add git.branch_root config key", 20260628) with no preceding design or task breakdown — the commit message documents that decision explicitly: "Tracked as a (909) maintenance note rather than a standalone initiative." This document does not describe planning that happened; it describes what was already built and tested, so it can carry frontmatter and receive review-gate treatment like any other slice.

909 was originally scoped as initiative 910 ("configurable root directory" — a filesystem relocation), then collapsed to this maintenance note once the real need turned out to be narrower: a prefix on work **branch names**, not a change to where documents or artifacts resolve on disk.

## What Shipped (commit `713d0c0`)

- **`git.branch_root` config key** added to `packages/core/src/config/ConfigKeys.ts`: project-scoped string, default `''` (empty = no prefix).
- **Validator** rejects: absolute paths (leading `/`), Windows absolute paths (leading `\` or a drive letter), `..`-escaping segments, and trailing-slash values. Empty string is explicitly allowed (identity default, short-circuited before the other checks).
- **Test coverage**: 45 lines added to `packages/core/tests/config/ConfigManager.test.ts` covering the default value and each validation rule.
- **Scope boundary (by design):** this key affects only the **git branch name** a project's workflow uses for work branches (e.g. `myroot/910-slice.foo` instead of `910-slice.foo`). It does not move documents, does not change where `project-documents/user/...` artifacts resolve, and has no effect unless something reads it.

## Out of Scope (lives upstream)

The companion piece — the branch-naming rule that actually reads `git.branch_root` and applies the prefix when constructing a branch name — lives in the `ai-project-guide` submodule (`project-guides/rules/git.md`), not in this repo. That rule change lands here only when the submodule pointer is next updated; it is not part of this repo's artifact trail and is not restated here beyond this note.

## Verification

The shipped behavior is covered by the existing `ConfigManager.test.ts` suite (added in `713d0c0`) — default value, each rejection rule, and the empty-string pass-through. No additional verification walkthrough is authored here since no new work is being introduced by this document; it is a record of already-tested code.

## Review

Whether 909's shipped code should be exempted from a code review (`codeReview: none`) or receive one retroactively is a Project Manager decision, not an architectural default — deliberately left undeclared here so `cf check --set-review-none 909` has a file to act on when that decision is made.
