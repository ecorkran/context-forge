---
docType: tasks
slice: stable-default-worktree-marker
project: context-forge
lld: user/slices/934-slice.stable-default-worktree-marker.md
dependencies: [932]
projectState: main at 0.19.2 (slices 931, 932 shipped). The default worktree is found by name (`isDefaultWorktree` in WorktreeService.ts), so a user-editable label drives range chop and restore. Design reviewed (CONCERNS, resolved in the design after two re-review rounds).
dateCreated: 20261007
dateUpdated: 20261007
status: in_progress
---

## Context Summary

- Slice 934 fixes GitHub #112 (932 code review F002): the default worktree is recorded in a stored `isDefault` boolean instead of being matched by name.
- The Migration rule, API Contracts, Success Criteria and Verification Walkthrough are in the slice design; do not widen them. Do not re-derive its decisions (flag vs reserved ID, in-memory migration, stderr warnings).
- Key files: `packages/core/src/types/worktree.ts`, `packages/core/src/services/WorktreeService.ts`, `packages/core/src/storage/FileProjectStore.ts`, new `packages/core/src/utils/defaultWorktree.ts`, `packages/cli/src/commands/worktree.ts`, `packages/mcp-server/src/tools/worktreeTools.ts`.
- Tests: `packages/core/tests/services/WorktreeService.test.ts`, `packages/core/tests/storage/FileProjectStore.test.ts`, new `packages/core/tests/utils/defaultWorktree.test.ts`, `packages/cli/tests/commands/worktree.test.ts`, `packages/mcp-server/tests/worktreeTools.test.ts`.
- Dependency direction: `storage → utils → types`, `services → utils, storage (interface)`. `storage/` must never import from `services/`.
- Use the local build (`node packages/cli/dist/index.js`); the global `cf` is the published package.
- Task order: the store's read-time migration (Task 3) lands before `WorktreeService` starts reading the flag (Task 4). Reversed, intermediate commits would read legacy `projects.json` data with no `isDefault`, so chop and restore would silently do nothing until the store task landed.
- Existing CLI and MCP tests mock `WorktreeService`, so they never exercise chop or restore. Only `WorktreeService.test.ts` seeds real defaults. The CLI and MCP test tasks below therefore update mocked result shapes and assertions, not seeds.
- No performance or load-test task, and no perf gate is added: the design's Cost note (Special Considerations) is an expectation, not a Success Criterion or Technical Requirement. It describes one in-memory pass per `getAll()`, the 900 architecture sets no latency targets for these paths, and `.github/workflows/ci.yml` has no perf or load stage to extend.
- Next planned slice: none dependent on this one.

## Tasks

- [x] **Task 0: Slice branch** (effort: 1)
  - [x] Confirm `cf config get git.integration_branch` is empty (target is `main`).
  - [x] Branch `934-slice.stable-default-worktree-marker` does not exist yet; create it with `git checkout -b 934-slice.stable-default-worktree-marker main`.
  - [x] Success: `git branch --show-current` prints the slice branch.

- [x] **Task 1: Types** (effort: 1)
  - [x] In `types/worktree.ts`, add `isDefault?: boolean` to `WorktreeContext` with the design's doc comment.
  - [x] Change `UpdateWorktreeInput` to omit `isDefault` as well as `id`. Leave `CreateWorktreeInput` without the field.
  - [x] Add `defaultWorktree?: { id: string; name: string }` to `RemoveWorktreeResult`, with the design's doc comment.
  - [x] Update the stale comment near line 108 that mentions "no 'default' worktree" to say "no default worktree".
  - [x] Success: `pnpm -r build` passes; no behavior change.

- [x] **Task 2: Default-worktree utility** (effort: 3)
  - [x] Create `packages/core/src/utils/defaultWorktree.ts` importing only from `types/`.
  - [x] Move `DEFAULT_WORKTREE_NAME` here (exported; it is the label forward migration gives the default and the legacy match).
  - [x] Add `isDefaultWorktree(wt)`: returns `wt.isDefault === true`. It must not read the name.
  - [x] Add `findDefaultWorktree(worktrees, projectName, excludeId?)`: returns the one worktree with `isDefault === true` whose id is not `excludeId`, or `undefined`. Throws if more than one remains, using the design's message (project name, then `'<name>' (<id>)` for each, then the hand-edit instruction). The `excludeId` filter is applied before the duplicate check, so excluding one of two marked worktrees hides the duplicate; that is accepted, because the excluded worktree is the one being updated and the next call without an exclusion still surfaces it.
  - [x] Add `markLegacyDefaultWorktree(project)`: pure function, returns `{ changed, warnings }` and the migrated project without mutating the input. Implement the design's Migration rule steps 1–3 and the warning table exactly. Warnings end with the shared recovery sentence; take the `projects.json` path as a parameter.
  - [x] Export the new module from the core package index only if sibling utils are exported there; otherwise import by path.
  - [x] Success: `pnpm -r build` passes. `WorktreeService.ts` still has its own copies at this point (removed in Task 4).

- [x] **Task 2T: Utility tests** (effort: 3)
  - [x] Create `packages/core/tests/utils/defaultWorktree.test.ts`.
  - [x] `isDefaultWorktree`: true only for `isDefault: true`; false for `false`, absent, and a worktree merely named `default`.
  - [x] `findDefaultWorktree`: none, one, and two marked (error contains both names and ids); with `excludeId` set to the one marked worktree it returns `undefined`, and with `excludeId` set to one of two marked it returns the other without throwing.
  - [x] Both migration warnings (renamed-default and ambiguous) end with the shared recovery sentence, and the injected `projects.json` path appears in it verbatim.
  - [x] `markLegacyDefaultWorktree`, one test per case in the design's Technical Requirements list: single legacy default; case variant `Default`; already-marked project (absent becomes `false`); no candidate and no worktree at project path (silent); no candidate with a worktree at project path (warns, names it, says renamed default); ambiguous candidates narrowed by path; still ambiguous (all `false`, warning lists every candidate by name and id); idempotence (second run `changed: false`, no warnings).
  - [x] Assert the input project object is not mutated, and that existing `isDefault` values are never changed.
  - [x] Success: all pass.

- [x] **Task 2C: Commit** — `feat(core): add default worktree marker utility`

- [x] **Task 3: Store read-time migration** (effort: 3)
  - [x] In `FileProjectStore.getAll()`, after parsing, run `markLegacyDefaultWorktree` on each project and return the migrated projects. Pass the real `projects.json` path for the warnings. Do not write.
  - [x] Print each warning with `console.warn` (stderr), at most once per process, using a module-level set of printed warning strings that is not exported. Add no production reset function; tests reset it by re-importing the module (see Task 3T). Never write to stdout.
  - [x] Confirm `create`, `update` and `delete` still read through `getAll()` so their write saves migrated data; change nothing else in the write path.
  - [x] Confirm `packages/core/src/storage/` has no import from `services/`.
  - [x] Success: `pnpm -r build` passes.

- [x] **Task 3T: Store tests** (effort: 3)
  - [x] In `FileProjectStore.test.ts`, use a throwaway temp directory fixture (never the real config dir). The legacy fixture must be a realistic `projects.json` shape: a `default` worktree at the project path with no `isDefault`, plus a sibling.
  - [x] `getAll()` returns `isDefault: true` on the default and `false` on the sibling, and the file on disk is byte-identical afterwards (read does not write).
  - [x] `update()` on one project saves the migrated fields for every project in the file.
  - [x] Repeated `getAll()` calls print each warning once (spy on `console.warn`). The printed-warnings set is module state with no export, so the warn-once and stderr tests must call `vi.resetModules()` in `beforeEach` and load `FileProjectStore` with a dynamic `await import(...)` inside each test, so every test starts with an empty set. The other tests in the file may keep the static import.
  - [x] Warnings go to stderr: `console.warn` called, `console.log` and `process.stdout.write` not called by the migration.
  - [x] A read-only `projects.json` (chmod) still reads migrated data without error.
  - [x] Command-path coverage for the read-only criterion: in the same temp-dir fixture, build a real `FileProjectStore` and a real `WorktreeService` over the read-only file and call `listWorktrees`; it returns the migrated `isDefault` values and does not throw. The CLI and MCP tests mock core, so this service-level test is the automated proof for the paths `cf worktree list` and `worktree_list` share. The CLI check is repeated by hand in the Task 9 walkthrough.
  - [x] After saving, removing the default and renaming another worktree to `default` does not mark it, including after constructing a fresh store instance.
  - [x] Update the "read returns stored fields verbatim" block in `FileProjectStore.test.ts` (around lines 81–87): its NOTE comment says `getAll()` does no read-time migration. Reword it to say the verbatim contract holds for project fields, and that worktree `isDefault` is the one read-time migration (tested in this task). Check that no fixture in that block contains `worktrees`; if one does, keep its assertions valid under the migration.
  - [x] Success: all pass.

- [x] **Task 3C: Commit** — `feat(core): migrate legacy default worktree marker on read`

- [x] **Task 4: WorktreeService uses the marker** (effort: 3)
  - [x] Remove the local `DEFAULT_WORKTREE_NAME` and `isDefaultWorktree` from `WorktreeService.ts`; import from `utils/defaultWorktree.ts`.
  - [x] Forward migration in `addWorktree` creates the default with `isDefault: true`; every other worktree `addWorktree` creates gets `isDefault: false`.
  - [x] `chopDefaultRange` locates the default with `findDefaultWorktree(worktrees, projectName, excludeId)`, replacing `find(isDefaultWorktree(wt) && wt.id !== excludeId)`; the exclusion is what stops an update of the default's own range from chopping it against itself. `restoreDefaultRange` uses `findDefaultWorktree(remaining, projectName)` in place of `findIndex(isDefaultWorktree)` and keeps its separate `isDefaultWorktree(removed)` self-case check (line ~326). Range rules are unchanged.
  - [x] The `rangeOverride: true` path skips chop, so `findDefaultWorktree` is not called and a duplicate-marker project does not throw there. This is intended; do not add a call.
  - [x] `updateWorktree` sets `isDefault: original.isDefault` after the spread, as it does for `id`.
  - [x] `removeWorktree` adds `defaultWorktree: { id, name }` to the result whenever it returns `restoredRange` or `rangeNotRestored`.
  - [x] Success: `pnpm -r build` passes (existing tests that seed a default by name are fixed in Task 4T).

- [x] **Task 4T: Service tests** (effort: 3)
  - [x] Update existing `WorktreeService.test.ts` cases that seed a default by name and expect chop or restore to seed `isDefault: true`. Tests that build the default through `addWorktree` need no change. The seeds to update are the `setupDefault` helper in the `chopDefaultRange` block (around line 588), the `wt('wt_default', …)` calls in the restore block (add an optional `isDefault` through the existing `extra` argument), and the other `name: 'default'` fixtures near lines 820 and 923 if they expect chop or restore.
  - [x] Replace the name-keyed lookups with marker lookups: the `defaultRange()` helper (around line 677) finds its worktree with `w.name.toLowerCase() === 'default'`; change it to `w.isDefault === true`. Do the same for the `wt.name === 'default'` lookups in the chop tests so a rename test cannot silently find nothing.
  - [x] Delete the test "matches the default by name case-insensitively, as the chop does" (around line 785). It asserts the behavior this slice removes. The next "Add" item is its replacement: the same layout with `isDefault: false` must give no `restoredRange` and no `rangeNotRestored`.
  - [x] Add: a worktree named `Default` with `isDefault: false` is not chopped and not widened.
  - [x] Add: renaming the real default (via `updateWorktree`) keeps chop and restore working on it.
  - [x] Add: `addWorktree` after init with `name: 'default'` creates `isDefault: false`.
  - [x] Add: `updateWorktree` cannot change `isDefault`, including a stray runtime `isDefault` key in the input.
  - [x] Add: remove result carries `defaultWorktree` with the current name whenever `restoredRange` or `rangeNotRestored` is present, and omits it otherwise.
  - [x] Add: two worktrees marked `isDefault: true` make add (without override), range-changing update, and remove (others remaining) throw an error naming both by name and id; a non-range update still succeeds.
  - [x] Success: all pass.

- [x] **Task 4C: Commit** — `fix(core): identify the default worktree by isDefault, not name`

- [ ] **Task 5: CLI text and `list` tag** (effort: 2)
  - [ ] `cf worktree rm` (`cli/src/commands/worktree.ts`, around lines 448–452): replace the literal `'default'` in the restored note, the unchanged-range note and the `cf worktree update … --range` hint with `defaultWorktree.name` from the result. Output must match the design's API Contracts example.
  - [ ] `cf worktree list`: print a dim `(default)` after the name of each worktree with `isDefault === true` (both rows if two are marked). Leave the name column otherwise unchanged.
  - [ ] Leave the init migration note at line 145 ("migrated to a 'default' worktree context") as is; it names the label forward migration creates.
  - [ ] Success: `pnpm -r build` passes (the three existing `rm` tests in `worktree.test.ts` now fail until Task 5T).

- [ ] **Task 5T: CLI tests** (effort: 2)
  - [ ] The CLI tests mock `WorktreeService`, so there are no default seeds to change. The real breakage is the three `cf worktree rm` tests around lines 421–450, which assert the literal `'default'` text. Fix each:
    - Restored-range test: add `defaultWorktree: { id, name }` to the mocked result and assert the note contains that name (use a renamed name such as `main-line`, not `default`, so the test proves the name comes from the result).
    - Not-restored test: add `defaultWorktree` to the mocked `rangeNotRestored` result; assert the note and the `cf worktree update <name> --range` hint use that name.
    - "Prints no range note" test: it asserts `not.toContain("'default' worktree")`. Change it to assert the output contains none of the range-note phrases ("went back to the default worktree", "keeps its range").
  - [ ] Add: `list` tags the default row `(default)`, tags both rows when two are marked, and tags none when none is marked (mocked worktrees carry `isDefault`).
  - [ ] The "`init --name default` creates `isDefault: false`" case is a service behavior covered in Task 4T; the CLI only passes the name through, so no CLI test.
  - [ ] Success: all pass.

- [ ] **Task 6: MCP descriptions** (effort: 1)
  - [ ] In `mcp-server/src/tools/worktreeTools.ts`, change two descriptions to say "the default worktree (`isDefault: true`)" instead of the name:
    - `worktree_init` (line ~133, currently `a "default" worktree`);
    - `worktree_rm` (line ~267, currently `the 'default' worktree's new range`). The design text calls this tool `worktree_remove`; the registered name is `worktree_rm`, so edit that one. Do not rename the tool.
  - [ ] Do not change any input schema. Confirm the `worktree_update` zod schema (lines ~195–210) has no `isDefault` field.

- [ ] **Task 6T: MCP tests** (effort: 2)
  - [ ] `worktreeTools.test.ts` mocks `WorktreeService` entirely, so it has no default seeds and no chop/restore. Only add what the mocked layer can prove.
  - [ ] Add to the `worktree_update` block: call the tool through the in-memory client with an extra `isDefault: true` argument alongside a valid field (e.g. `name`). Assert the result is not an error and that the `updates` object passed to `mockUpdateWorktree` (third argument) has no `isDefault` key. This exercises the real risk: the handler copies every argument key, and only the zod schema stops `isDefault` from reaching the service. The expected outcome is fixed: the SDK (1.26.0) validates against a non-strict `z.object`, which strips unknown keys. If the test shows otherwise (an error result, or the key present), do not change the assertion to match; stop and report it to the Project Manager, because the design's "ignored" behavior would be wrong.
  - [ ] Check the existing `worktree_rm` test at line ~580 ("returns restoredRange and rangeNotRestored as the service reports them"): add `defaultWorktree` to its mocked result and assert it is returned unchanged.
  - [ ] Do not add a `worktree_list` `isDefault` test: with the service mocked it only echoes the fixture and proves nothing. Real `isDefault` output is covered by the Task 8 walkthrough.
  - [ ] Success: all pass.

- [ ] **Task 6C: Commit** — `feat: tag default worktree in CLI and MCP output`

- [ ] **Task 7: Integration check (attribution and propagation)** (effort: 1)
  - [ ] Design Integration Requirement: `cf check` worktree attribution and `propagationTargets` behave the same. In `cli/tests/commands/check-worktree-attribution.test.ts` (fixture near line 71) and `cli/tests/commands/worktreePropagation.test.ts` (fixtures near lines 361 and 374), add `isDefault: true` to the root-path worktree fixtures. Leave every assertion unchanged.
  - [ ] Add one `propagationTargets` case: a project with a root-path worktree marked `isDefault: true` and a sibling marked `false`, expecting only the sibling (same as today).
  - [ ] Update the doc comment above `propagationTargets` in `cli/src/commands/worktreePropagation.ts` (around line 183) from `"default" worktree context` to `the default worktree`. Comment only; no code change.
  - [ ] Success: these two test files pass with unchanged assertions.

- [ ] **Task 7C: Commit** — `test: confirm attribution and propagation ignore isDefault`

- [ ] **Task 8: Name-comparison sweep** (effort: 1)
  - [ ] Run once: `grep -rnEi "[\"'\`]default[\"'\`]|DEFAULT_WORKTREE_NAME|name\.toLowerCase\(\)" packages/*/src`. This matches single, double and backtick quotes, so it catches the `"default"` in comments and descriptions as well as `'default'`.
  - [ ] List every hit and classify it. Allowed: `defaultWorktree.ts` (the constant and the migration's legacy match), the forward-migration label assignment in `WorktreeService.addWorktree`, the init note text in `worktree.ts`, and unrelated hits (config `source`, `ResolutionSource`, template defaults). Any other hit that compares a worktree name to `default` is a defect: fix it. Pass comments that merely describe the label: the one in `packages/core/src/introspection/mergeCheckResults.ts` (~lines 21–25, "exactly one worktree named \"default\"") is a comment, not a comparison; reword it to "the default worktree" while you are there.
  - [ ] Also run `grep -rn "isDefaultWorktree\|DEFAULT_WORKTREE_NAME" packages/*/src` and confirm every import comes from `utils/defaultWorktree.ts`.
  - [ ] Run `grep -rn "services" packages/core/src/storage` and confirm no import from `services/`.
  - [ ] Check other tests that seed a worktree named `default` and expect chop or restore: `grep -rnE "name: ['\"]default['\"]" packages/*/tests`. Most hits (overlay, status, guides, future, project) do not depend on the default's range behavior; fix only those that do.
  - [ ] Success: the classified hit list is clean; fixes (if any) build and pass.

- [ ] **Task 9: Docs and validation** (effort: 2)
  - [ ] CHANGELOG entry under Unreleased (#112): `isDefault` marker, read-time migration, `(default)` tag, `defaultWorktree` on the remove result.
  - [ ] Build, typecheck, lint and full tests once each; all pass.
  - [ ] Run the design's Verification Walkthrough steps 1–7 against the local build in a scratch project, backing up and restoring `projects.json`. Also, in the step 1 setup, make `projects.json` read-only (`chmod a-w`) and run `cfl worktree list --json` and `cfl check`: both must succeed and show migrated data; restore write permission afterwards. While it is read-only, also call the MCP `worktree_list` tool and confirm it returns migrated `isDefault` values. Step 5 uses the MCP tool `worktree_update`; `worktree_list` / `worktree_get` output there is the real-data check of `isDefault`. Update the walkthrough in the design with actual output.
  - [ ] **Commit**: `chore: finalize slice 934`
  - [ ] Stop. Code review and merge are Phase 7.

## Tasks Review Resolution

Source: `project-documents/user/reviews/934-review.tasks.stable-default-worktree-marker.md` (CONCERNS; verdict left as written).

| Finding | Resolution |
|---|---|
| F001 (concern) | Fixed. `findDefaultWorktree` takes `excludeId?`; Task 4 keeps the chop self-exclusion and the restore self-case check, and states that `rangeOverride` skips the call. |
| F002 (concern) | Fixed by hand check: Task 9 now calls MCP `worktree_list` on the read-only file. No new automated test (the mechanism is shared and covered by Task 3T). |
| F003 | No action. The Task 7 case is a regression guard only; noted. |
| F004 | No action. The `worktree_get` and `cf check` paths under duplicate markers do not call `findDefaultWorktree`. |
| F005 | Fixed. Task 2T asserts the recovery sentence and the path. |
| F006, F007 | No action. The repeated check is a cheap final sweep; Task 9 stays one task. |
| F008 | Fixed. Task 8 rewords the `mergeCheckResults.ts` comment. |
| F009 | Pass. |
