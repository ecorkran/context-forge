---
docType: tasks
slice: stable-default-worktree-marker
project: context-forge
lld: user/slices/934-slice.stable-default-worktree-marker.md
dependencies: [932]
projectState: main at 0.19.2 (slices 931, 932 shipped). The default worktree is found by name (`isDefaultWorktree` in WorktreeService.ts), so a user-editable label drives range chop and restore. Design reviewed (CONCERNS, resolved in the design after two re-review rounds).
dateCreated: 20261007
dateUpdated: 20261007
status: not_started
---

## Context Summary

- Slice 934 fixes GitHub #112 (932 code review F002): the default worktree is recorded in a stored `isDefault` boolean instead of being matched by name.
- The Migration rule, API Contracts, Success Criteria and Verification Walkthrough are in the slice design; do not widen them. Do not re-derive its decisions (flag vs reserved ID, in-memory migration, stderr warnings).
- Key files: `packages/core/src/types/worktree.ts`, `packages/core/src/services/WorktreeService.ts`, `packages/core/src/storage/FileProjectStore.ts`, new `packages/core/src/utils/defaultWorktree.ts`, `packages/cli/src/commands/worktree.ts`, `packages/mcp-server/src/tools/worktreeTools.ts`.
- Tests: `packages/core/tests/services/WorktreeService.test.ts`, `packages/core/tests/storage/FileProjectStore.test.ts`, new `packages/core/tests/utils/defaultWorktree.test.ts`, `packages/cli/tests/commands/worktree.test.ts`, `packages/mcp-server/tests/worktreeTools.test.ts`.
- Dependency direction: `storage → utils → types`, `services → utils, storage (interface)`. `storage/` must never import from `services/`.
- Use the local build (`node packages/cli/dist/index.js`); the global `cf` is the published package.
- Next planned slice: none dependent on this one.

## Tasks

- [ ] **Task 0: Slice branch** (effort: 1)
  - [ ] Confirm `cf config get git.integration_branch` is empty (target is `main`).
  - [ ] Branch `934-slice.stable-default-worktree-marker` does not exist yet; create it with `git checkout -b 934-slice.stable-default-worktree-marker main`.
  - [ ] Success: `git branch --show-current` prints the slice branch.

- [ ] **Task 1: Types** (effort: 1)
  - [ ] In `types/worktree.ts`, add `isDefault?: boolean` to `WorktreeContext` with the design's doc comment.
  - [ ] Change `UpdateWorktreeInput` to omit `isDefault` as well as `id`. Leave `CreateWorktreeInput` without the field.
  - [ ] Add `defaultWorktree?: { id: string; name: string }` to `RemoveWorktreeResult`, with the design's doc comment.
  - [ ] Update the stale comment near line 108 that mentions "no 'default' worktree" to say "no default worktree".
  - [ ] Success: `pnpm -r build` passes; no behavior change.

- [ ] **Task 2: Default-worktree utility** (effort: 3)
  - [ ] Create `packages/core/src/utils/defaultWorktree.ts` importing only from `types/`.
  - [ ] Move `DEFAULT_WORKTREE_NAME` here (exported; it is the label forward migration gives the default and the legacy match).
  - [ ] Add `isDefaultWorktree(wt)`: returns `wt.isDefault === true`. It must not read the name.
  - [ ] Add `findDefaultWorktree(worktrees)`: returns the one worktree with `isDefault === true`, or `undefined`. Throws if more than one, using the design's message (project name, then `'<name>' (<id>)` for each, then the hand-edit instruction). Take the project name as a parameter so the message can include it.
  - [ ] Add `markLegacyDefaultWorktree(project)`: pure function, returns `{ changed, warnings }` and the migrated project without mutating the input. Implement the design's Migration rule steps 1–3 and the warning table exactly. Warnings end with the shared recovery sentence; take the `projects.json` path as a parameter.
  - [ ] Export the new module from the core package index only if sibling utils are exported there; otherwise import by path.
  - [ ] Success: `pnpm -r build` passes. `WorktreeService.ts` still has its own copies at this point (removed in Task 3).

- [ ] **Task 2T: Utility tests** (effort: 3)
  - [ ] Create `packages/core/tests/utils/defaultWorktree.test.ts`.
  - [ ] `isDefaultWorktree`: true only for `isDefault: true`; false for `false`, absent, and a worktree merely named `default`.
  - [ ] `findDefaultWorktree`: none, one, and two marked (error contains both names and ids).
  - [ ] `markLegacyDefaultWorktree`, one test per case in the design's Technical Requirements list: single legacy default; case variant `Default`; already-marked project (absent becomes `false`); no candidate and no worktree at project path (silent); no candidate with a worktree at project path (warns, names it, says renamed default); ambiguous candidates narrowed by path; still ambiguous (all `false`, warning lists every candidate by name and id); idempotence (second run `changed: false`, no warnings).
  - [ ] Assert the input project object is not mutated, and that existing `isDefault` values are never changed.
  - [ ] Success: all pass.

- [ ] **Task 2C: Commit** — `feat(core): add default worktree marker utility`

- [ ] **Task 3: WorktreeService uses the marker** (effort: 3)
  - [ ] Remove the local `DEFAULT_WORKTREE_NAME` and `isDefaultWorktree` from `WorktreeService.ts`; import from `utils/defaultWorktree.ts`.
  - [ ] Forward migration in `addWorktree` creates the default with `isDefault: true`; every other worktree `addWorktree` creates gets `isDefault: false`.
  - [ ] `chopDefaultRange` and `restoreDefaultRange` locate the default through `findDefaultWorktree` instead of `findIndex(isDefaultWorktree)`. Range rules are unchanged.
  - [ ] `updateWorktree` sets `isDefault: original.isDefault` after the spread, as it does for `id`.
  - [ ] `removeWorktree` adds `defaultWorktree: { id, name }` to the result whenever it returns `restoredRange` or `rangeNotRestored`.
  - [ ] Success: `pnpm -r build` passes (existing tests that seed a default by name are fixed in Task 3T).

- [ ] **Task 3T: Service tests** (effort: 3)
  - [ ] Update existing `WorktreeService.test.ts` cases that seed a default by name and expect chop or restore to seed `isDefault: true`. Tests that build the default through `addWorktree` need no change.
  - [ ] Add: a worktree named `Default` with `isDefault: false` is not chopped and not widened.
  - [ ] Add: renaming the real default (via `updateWorktree`) keeps chop and restore working on it.
  - [ ] Add: `addWorktree` after init with `name: 'default'` creates `isDefault: false`.
  - [ ] Add: `updateWorktree` cannot change `isDefault`, including a stray runtime `isDefault` key in the input.
  - [ ] Add: remove result carries `defaultWorktree` with the current name whenever `restoredRange` or `rangeNotRestored` is present, and omits it otherwise.
  - [ ] Add: two worktrees marked `isDefault: true` make add (without override), range-changing update, and remove (others remaining) throw an error naming both by name and id; a non-range update still succeeds.
  - [ ] Success: all pass.

- [ ] **Task 3C: Commit** — `fix(core): identify the default worktree by isDefault, not name`

- [ ] **Task 4: Store read-time migration** (effort: 3)
  - [ ] In `FileProjectStore.getAll()`, after parsing, run `markLegacyDefaultWorktree` on each project and return the migrated projects. Pass the real `projects.json` path for the warnings. Do not write.
  - [ ] Print each warning with `console.warn` (stderr), at most once per process, using a module-level set of printed warning strings. Never write to stdout.
  - [ ] Confirm `create`, `update` and `delete` still read through `getAll()` so their write saves migrated data; change nothing else in the write path.
  - [ ] Confirm `packages/core/src/storage/` has no import from `services/`.
  - [ ] Success: `pnpm -r build` passes.

- [ ] **Task 4T: Store tests** (effort: 3)
  - [ ] In `FileProjectStore.test.ts`, use a throwaway temp directory fixture (never the real config dir). The legacy fixture must be a realistic `projects.json` shape: a `default` worktree at the project path with no `isDefault`, plus a sibling.
  - [ ] `getAll()` returns `isDefault: true` on the default and `false` on the sibling, and the file on disk is byte-identical afterwards (read does not write).
  - [ ] `update()` on one project saves the migrated fields for every project in the file.
  - [ ] Repeated `getAll()` calls print each warning once (spy on `console.warn`); reset the module-level set between tests.
  - [ ] Warnings go to stderr: `console.warn` called, `console.log` and `process.stdout.write` not called by the migration.
  - [ ] A read-only `projects.json` (chmod) still reads migrated data without error.
  - [ ] After saving, removing the default and renaming another worktree to `default` does not mark it, including after constructing a fresh store instance.
  - [ ] Success: all pass.

- [ ] **Task 4C: Commit** — `feat(core): migrate legacy default worktree marker on read`

- [ ] **Task 5: CLI text and `list` tag** (effort: 2)
  - [ ] `cf worktree rm` (`cli/src/commands/worktree.ts`, around lines 448–452): replace the literal `'default'` in the restored note, the unchanged-range note and the `cf worktree update … --range` hint with `defaultWorktree.name` from the result. Output must match the design's API Contracts example.
  - [ ] `cf worktree list`: print a dim `(default)` after the name of each worktree with `isDefault === true` (both rows if two are marked). Leave the name column otherwise unchanged.
  - [ ] Leave the init migration note at line 145 ("migrated to a 'default' worktree context") as is; it names the label forward migration creates.
  - [ ] Success: `pnpm -r build` passes.

- [ ] **Task 5T: CLI tests** (effort: 2)
  - [ ] Update `cli/tests/commands/worktree.test.ts` cases that seed a default by name and expect chop or restore to seed `isDefault: true`.
  - [ ] Add: `rm` with a renamed default prints that name in both notes and in the hint.
  - [ ] Add: `list` tags the default row `(default)`, tags both rows when two are marked, and tags none when none is marked.
  - [ ] Add: `init --name default` on a project with worktrees creates `isDefault: false`.
  - [ ] Success: all pass.

- [ ] **Task 6: MCP descriptions** (effort: 1)
  - [ ] In `mcp-server/src/tools/worktreeTools.ts`, change the `worktree_init` and `worktree_remove` descriptions (including line ~267) to say "the default worktree (`isDefault: true`)" instead of `'default'`. Do not change any input schema.
  - [ ] Confirm the update handler's zod schema has no `isDefault` field.

- [ ] **Task 6T: MCP tests** (effort: 2)
  - [ ] Update `mcp-server/tests/worktreeTools.test.ts` cases that seed a default by name and expect chop or restore to seed `isDefault: true`.
  - [ ] Add: `worktree_update` called with an `isDefault` argument leaves the stored value unchanged.
  - [ ] Add: `worktree_list` output includes `isDefault` on each worktree.
  - [ ] Success: all pass.

- [ ] **Task 6C: Commit** — `feat: tag default worktree in CLI and MCP output`

- [ ] **Task 7: Name-comparison sweep** (effort: 1)
  - [ ] Run `grep -rn "'default'" packages/*/src` once. Confirm no worktree-name comparison remains outside `utils/defaultWorktree.ts` (unrelated hits such as config `source`, `ResolutionSource`, and template defaults are fine).
  - [ ] Check for other test files seeding a default by name that expect chop or restore (`grep -rln "name: 'default'" packages/*/tests`); fix any missed in earlier tasks.
  - [ ] Success: no stray comparison; fixes (if any) build and pass.

- [ ] **Task 8: Docs and validation** (effort: 2)
  - [ ] CHANGELOG entry under Unreleased (#112): `isDefault` marker, read-time migration, `(default)` tag, `defaultWorktree` on the remove result.
  - [ ] Build, typecheck, lint and full tests once each; all pass.
  - [ ] Run the design's Verification Walkthrough steps 1–7 against the local build in a scratch project, backing up and restoring `projects.json`. Update the walkthrough in the design with actual output.
  - [ ] **Commit**: `chore: finalize slice 934`
  - [ ] Stop. Code review and merge are Phase 7.
