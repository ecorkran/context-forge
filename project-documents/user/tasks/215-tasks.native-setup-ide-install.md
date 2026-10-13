---
docType: tasks
slice: native-setup-ide-install
project: context-forge
lld: user/slices/215-slice.native-setup-ide-install.md
dependencies: []
projectState: Slice 214 (cf validate design) merged to main. cf setup-ide still shells out to the guide's bash scripts/setup-ide via guideScript.ts, with capability probing, a .bak path, and a copy-and-prune worktree fallback. Installed guide is v0.20.10.
dateCreated: 20261013
dateUpdated: 20261013
status: in_progress
---

## Context Summary

- Working on the native-setup-ide-install slice (215).
- What this slice delivers: a TypeScript port of the guide's `scripts/setup-ide` (1769 lines) and `scripts/setup-ide-lint.sh` (220 lines) in `packages/cli/src/ideInstall/`. `cf setup-ide`, `cf init --ide` and the worktree loop call `installIde()` in-process. No bash, and no guide script.
- Hard requirement: output files, manifests, console output and exit codes stay byte-identical to the bash version. The spec is the guide's black-box suite `tests/setup_ide/` (61 snapshots), which moves into cf as vitest.
- Approved differences, each in its own commit: fix #40 (stray newline in the default `**` glob), fix #38 (final newline added when a managed block is replaced), and dropping the `CONTEXT_FORGE_RULES_EXCLUDE` env tier (`rules.exclude` comes from cf config only).
- Sources:
  - Guide repo checkout: `/Users/manta/source/repos/manta/ai-project-guide` (called **GUIDE_REPO** below). Port the bash from `GUIDE_REPO/scripts/`. The suite is in `GUIDE_REPO/tests/setup_ide/`.
  - Findings doc: `GUIDE_REPO/project-documents/user/analysis/120-analysis.setup-ide-port-findings.md`. It lists every bash edge case the port must reproduce. Read the relevant section before each module task.
- Guide v0.20.10 check (done 20261013): two late bash changes are in scope with no design change needed. Content after a hand-added `[//]: # (context-forge:managed end)` line survives migration (#33). A differing file with no manifest is skipped with a warning, not backed up (#34). Both are in the findings doc and pinned by snapshots (`test_managed_legacy_end_*`, `test_ownership_no_manifest_differing`).
- Next: Phase 6 on branch `215-slice.native-setup-ide-install`, then code review, then Phase 7 merge. After release, send the ai-project-guide session (the peer currently named `ai-project-guide-old`) the cf version that stops calling `scripts/setup-ide`.

### Conventions for every task

- Work from the context-forge repo root. Confirm with `pwd` before file operations.
- Commands: build `pnpm -r build`, CLI tests `pnpm --filter @context-forge/cli test`, lint `pnpm lint`, full suite `pnpm test`.
- Module paths below are relative to `packages/cli/src/ideInstall/`. Tests go in `packages/cli/tests/ideInstall/`.
- Ported test names stay identical to the pytest names, so each test maps to its `snapshots/<name>.snap`.
- Never edit a `.snap` file by hand. Only `vitest -u` writes them, and only in the tasks that explicitly allow it (tasks @22, @31 and @32).
- Byte-order sorting uses a plain code-unit comparator. Never `localeCompare`.
- No module over ~300 lines, and no function over ~50. Split a module that grows past that, as the design describes for `targets/`.
- Effort uses a 1–5 scale.
- After each task, use the task-checker agent to check off its items.

## Tasks

### Setup and test infrastructure

- [x] **Task 1: Create the slice branch** (effort 1)
  - [x] Read the target with `cf config get git.integration_branch`. Empty means `main`.
  - [x] `git checkout -b 215-slice.native-setup-ide-install <target>`.
  - [x] Success: on the new branch, working tree clean.

- [x] **Task 2: Copy the fixtures and snapshots** (effort 1)
  - [x] Copy `GUIDE_REPO/tests/setup_ide/{fixture_guide,fixture_data,snapshots}` to `packages/cli/tests/ideInstall/` unchanged. Skip `__pycache__`.
  - [x] Make sure the files aren't picked up by lint, the TypeScript build or the npm package. Check eslint ignores and the cli `tsconfig` include and `files` settings.
  - [x] Success: `diff -r` against the guide copies shows no differences. Build and lint pass.
  - [x] Commit: `test: copy setup-ide fixtures and snapshots from the guide`.

- [x] **Task 3: Installer contracts and stub** (effort 2)
  - [x] Create `output.ts` with the `OutputSink` interface (design, API Contracts).
  - [x] Create `installer.ts` with `InstallOptions` and an `installIde()` that throws a clear "not implemented" error. This stub exists only for the harness, and Task 13 replaces it.
  - [x] Create `paths.ts`, which defines the guide subdirectories (`project-guides/rules`, `agents`, `skills`, `lint`) once.
  - [x] Success: build passes. No commit here; this goes in with Task 4's commit.

- [x] **Task 4: Port the harness and `test_harness`** (effort 3)
  - [x] Port `harness.py` and `conftest.py` to `harness.ts`. It does the following:
    1. Copies the fixture guide and project into a temp dir.
    2. Calls `installIde` in-process with a capturing `OutputSink`.
    3. Collects stdout, stderr, the exit code and the file tree.
    4. Writes the snapshot text in the exact `.snap` layout.
    5. Compares with `expect(text).toMatchFileSnapshot(path)`.
  - [x] The run label stays the bash command line, for example `setup-ide <target> --root <ROOT>`. The harness builds it, so the snapshot headers don't change.
  - [x] Port `test_harness.py` to `harness.test.ts`. Its tests check the harness itself and pass against the stub.
  - [x] Success: `harness.test.ts` passes. Snapshot text built from a known run matches the `.snap` layout byte for byte.
  - [x] Commit: `test: port setup-ide snapshot harness to vitest`.

### Core helpers

- [x] **Task 5: `lines.ts`** (effort 2)
  - [x] Implement `toRecords(text)` and `fromRecords(lines)` with awk record semantics:
    - split on `\n`
    - keep a final line that has no newline
    - write back with `\n`
    - leave `\r` in place
  - [x] Add the helper that strips trailing newlines the way `$(...)` does.
  - [x] Success: the module builds.

- [x] **Task 6: Test `lines.ts`** (effort 1)
  - [x] Unit tests for each line-handling edge case in the findings doc: empty file, no final newline, CRLF, several trailing newlines.
  - [x] Success: tests pass.
  - [x] Commit: `feat(cli): add ideInstall line helpers`.

- [x] **Task 7: `output.ts` status lines** (effort 2)
  - [x] Port `print_status` and the color constants. Status lines carry ANSI colors on the stream bash uses for each one. Message, emoji and color literals are defined once.
  - [x] `echo -e` escape interpretation isn't pinned: implement plain text and record the difference for the implementation notes (Task 34).
  - [x] Unit tests: color wrapping, and which stream each kind of status goes to.
  - [x] Success: tests pass.
  - [x] Commit: `feat(cli): add ideInstall status output`.

- [x] **Task 8: `frontmatter.ts`** (effort 3)
  - [x] Port `has_always_apply`, `validate_frontmatter`, `get_apply_to`, `get_frontmatter_field`, `convert_paths_to_globs` and `strip_name_field`. Each keeps the bash edge cases from the findings doc section "Frontmatter helpers".
  - [x] Port the current default-glob behavior as is, including the #40 stray newline. Task 31 fixes it.
  - [x] Success: the module builds.

- [x] **Task 9: Test `frontmatter.ts`** (effort 2)
  - [x] One unit test per edge case in the findings doc's frontmatter section, plus #40 pinned as current behavior. Task 31 updates that test.
  - [x] Success: tests pass.
  - [x] Commit: `feat(cli): add ideInstall frontmatter helpers`.

- [x] **Task 10: `manifest.ts` (absorbs `installManifest.ts`)** (effort 3)
  - [x] Move everything in `commands/installManifest.ts` (`cksum`, `readManifest`, `parseManifestLine`, the path helpers, `MANIFEST_DIR`) into `ideInstall/manifest.ts`.
  - [x] Update the importers and delete `installManifest.ts`. The importers are `commands/setup-ide.ts`, `commands/worktreePropagation.ts`, `tests/commands/worktreePrune.test.ts` and `tests/commands/installManifest.test.ts` (moved below). Confirm with `grep -rn installManifest packages/cli` before deleting.
  - [x] Port `begin_manifest`, `install_file`, `record_installed_file`, `finish_manifest`, `legacy_manifest_entries` and `remove_empty_install_dirs`. Include:
    - the ownership checks
    - the no-manifest skip warning (#34)
    - the edited-file warning
    - bash's manifest sort order
  - [x] Move `installManifest.test.ts` to `tests/ideInstall/manifest.test.ts`. Its `cksum` cases, including `analyze-SKILL.md` → `4163870229 9896`, carry over.
  - [x] Add unit tests for: adopting a byte-equal file, skipping an unowned differing file, the no-manifest skip, pruning a stale unedited file, keeping an edited one, and removing empty directories at the depth rule.
  - [x] Success: build passes, and the manifest tests and the existing worktree tests pass.
  - [x] Commit: `feat(cli): add ideInstall manifest module`.

- [x] **Task 11: `managedSection.ts`** (effort 3)
  - [x] Add `MANAGED_MARKER_END = '[//]: # (context-forge:managed end)'` to `ideTargets.ts` next to the other marker literals. It's detection only and never emitted.
  - [x] Port `managed_state` (managed / legacy / unmanaged / broken), `write_managed_section` and `backup_premanaged_file`. Include:
    - writing a temp file, then renaming it into place
    - the `.pre-context-forge` backup
    - legacy migration, keeping content after a hand-added end marker (#33) with both migration messages
  - [x] Port the current block-replace behavior as is, including the #38 extra final newline. Task 32 fixes it.
  - [x] Unit tests: each state, legacy migration with and without an end marker, the broken-markers error, and no second backup when the file already has the BEGIN/END markers.
  - [x] Success: tests pass.
  - [x] Commit: `feat(cli): add ideInstall managed-section module`.

- [x] **Task 12: `rules.ts`** (effort 3)
  - [x] Port `compile_claude_rules`, `compile_always_on_rules`, `rule_is_excluded`, `warn_unmatched_exclusions` and `always_apply_rule_matches`. Include:
    - rule discovery in byte order
    - the two body extractors
    - section titles. The BSD-sed `s/bw/Ubw/g` fallback title isn't pinned: implement the intended title and note the difference for Task 34.
  - [x] Convert `rules.exclude` globs to an anchored RegExp matched against the basename. Bash `case` semantics: `*`, `?` and `[...]` are special, every other character is literal.
  - [x] Unit tests:
    - glob conversion: `*`, `?`, a bracket class, regex metacharacters as literals
    - byte-order discovery
    - unmatched-pattern and always-on-pattern warnings
  - [x] Success: tests pass.
  - [x] Commit: `feat(cli): add ideInstall rule compilation`.

### Targets

- [x] **Task 13: Installer flow and the claude target** (effort 4)
  - [x] In `installer.ts`, replace the stub with the real flow from `main`, `run_target_setup` and `install_target`: dispatch to the target, finish the manifest, run the lint check (left as a no-op until Task 20), and warn about unmatched exclusions.
  - [x] Error boundary (design, "Errors"):
    - Internal `InstallAbort` → exit 1.
    - A Node error with a string `code` → `❌ <message>` on stderr, exit 1.
    - Anything else propagates.
  - [x] A missing `project-guides/rules` raises `InstallAbort` with bash's message lines.
  - [x] In `targets/claude.ts`, port `setup_claude`, `copy_files`, `copy_skills` and `copy_claude_modular_rules`. Missing agents or skills source dirs are skipped, as in bash.
  - [x] Success: build passes.

- [x] **Task 14: Test the claude target** (effort 3)
  - [x] Port `test_targets.py` (claude cases), `test_managed_sections.py` (claude cases) and `test_ownership.py` as `*.test.ts`.
  - [x] Unit test the error boundary: a filesystem error becomes a `❌` line and exit 1, `InstallAbort` becomes exit 1, and any other error propagates.
  - [x] Success: every ported claude test matches its existing snapshot with no `-u`.
  - [x] Commit: `feat(cli): port setup-ide claude target`.

- [x] **Task 15: Agents target** (effort 3)
  - [x] Port `setup_agents` and `emit_agents_md` into `targets/agents.ts`.
  - [x] Port the agents cases of `test_targets` and `test_managed_sections`.
  - [x] Success: they match their snapshots with no `-u`. That includes `test_targets_agents_fresh` with the #40 newline still present.
  - [x] Commit: `feat(cli): port setup-ide agents target`.

- [x] **Task 16: Copilot target** (effort 3)
  - [x] Port `setup_copilot`, `emit_copilot_instruction_files` and `remove_generated_prompt_files` into `targets/copilot.ts`. That includes the instruction-file provenance stamp.
  - [x] Port the copilot cases of `test_targets` and `test_managed_sections`.
  - [x] Success: they match their snapshots with no `-u`.
  - [x] Commit: `feat(cli): port setup-ide copilot target`.

- [x] **Task 17: Cursor target** (effort 3)
  - [x] Port `setup_cursor` and `copy_cursor_rules` (`.mdc` conversion) into `targets/cursor.ts`.
  - [x] Port the cursor cases of `test_targets` and `test_managed_sections`.
  - [x] Success: they match their snapshots with no `-u`. Every `test_targets`, `test_managed_sections` and `test_ownership` test now passes.
  - [x] Commit: `feat(cli): port setup-ide cursor target`.

### Dry run, lint, exclusions

- [ ] **Task 18: `dryRun.ts`** (effort 3)
  - [ ] Port `dry_run_install`, `list_install_files` and `report_dry_run_changes`:
    1. Make a sandbox with `fs.mkdtempSync`.
    2. Copy the existing install paths into it with `fs.cpSync`, skipping `.claude/worktrees`.
    3. Install there into a buffered sink.
    4. Print the buffered warning lines, then the `+`/`~`/`-` report in byte order.
  - [ ] Remove the sandbox in a `finally`, so it's also removed when the install aborts or throws. A failed removal propagates. This differs from bash on purpose; note it for Task 34.
  - [ ] Success: build passes.

- [ ] **Task 19: Test the dry run and an outside root** (effort 2)
  - [ ] Port the three `test_flags_dry_run_*` tests and `test_flags_root_outside_guide` (as one test with `targetRoot` set to another checkout).
  - [ ] Add a unit test showing that the sandbox is removed after an install that aborts.
  - [ ] Don't port these, which test the bash argument parser: `test_flags_capabilities`, `test_flags_root_missing_directory`, `test_flags_root_without_value`, `test_flags_before_target_same_as_after`, and the usage and unsupported-target runs.
  - [ ] Success: the ported tests match their snapshots with no `-u`.
  - [ ] Commit: `feat(cli): port setup-ide dry run`.

- [ ] **Task 20: `lint.ts`** (effort 3)
  - [ ] Port all of `setup-ide-lint.sh`: language detection, the required-config checks and `--write-lint` writes. It reads from `projectRoot` and writes under `targetRoot`.
  - [ ] Call it from `installer.ts`, replacing the Task 13 no-op.
  - [ ] Success: build passes.

- [ ] **Task 21: Test lint** (effort 2)
  - [ ] Port `test_lint.py`, except `test_lint_python_excluded`, which moves with Task 22.
  - [ ] Success: the ported tests match their snapshots with no `-u`.
  - [ ] Commit: `feat(cli): port setup-ide lint check`.

- [ ] **Task 22: Port `rules.exclude` tests; drop the env tier (spec-change commit)** (effort 2)
  - [ ] Port `test_rules_exclude.py` and `test_lint_python_excluded`, passing `rulesExclude` in-process.
  - [ ] Drop `test_rules_exclude_env_wins` and delete its `.snap`. Drop the cf-stub tier tests. Task 28 replaces them with one cf-level test.
  - [ ] The active-source message names cf config, using the wording the bash prints for its cf source. Run `vitest -u` for exactly these three snapshots: `test_rules_exclude_always_on`, `test_rules_exclude_unmatched` and `test_lint_python_excluded`.
  - [ ] Success: `git diff` on the snapshots shows only the active-source line in those three files and the deleted `env_wins` file. All ported tests pass.
  - [ ] Commit, with the reason in the body (PM decision 1, 20261011): `test: drop the rules.exclude env tier from setup-ide snapshots`.

- [ ] **Task 23: `test_real_guide` smoke test** (effort 1)
  - [ ] Port `test_real_guide.py` with no snapshot. For each of the four targets, install from the repo's installed guide at `project-documents/ai-project-guide/project-guides` and assert:
    - exit 0
    - no `❌` in the output
    - the target's top-level files exist
  - [ ] Success: passes for all four targets.
  - [ ] Commit: `test: add setup-ide real-guide smoke test`.

### Parity checkpoint

- [ ] **Task 24: Full-suite checkpoint** (effort 1)
  - [ ] Run `pnpm -r build`, `pnpm lint` and `pnpm test`.
  - [ ] Check every `ideInstall/` file against the ~300-line limit and split any that goes over.
  - [ ] Success: all three pass and every snapshot change so far comes from Task 22.

- [ ] **Task 25: Real-guide parity check** (effort 3)
  - [ ] Run design walkthrough step 4 for claude, cursor, copilot and agents, for both a fresh install and a re-run over a bash-written install. Use the guide's bash script, which still exists at this point.
  - [ ] The #38/#40 fixes haven't landed yet, so every target should come out IDENTICAL.
  - [ ] Fix any diff in the port. Anything that can't match goes on a list for Task 34 and the PM.
  - [ ] Success: 8 IDENTICAL results, or every diff listed and approved by the PM.
  - [ ] Commit any port fixes: `fix(cli): match bash setup-ide output on the real guide`.

### Wire up cf

- [ ] **Task 26: Call `installIde` from `cf setup-ide` and `cf init`** (effort 3)
  - [ ] In `setup-ide.ts` `setupIdeAction`, replace `execSetupIde` with `installIde`. Arguments:
    - `guideDir` comes from `GUIDE_RELATIVE_PATH`
    - `projectRoot` and `targetRoot` are the project path
    - `rulesExclude` is read with `new ConfigManager(projectRoot).get('rules.exclude')` and parsed by one shared helper, `parseRulesExclude(value): string[]`, exported from `packages/core/src/config/ConfigKeys.ts`. It splits on `,` and returns `[]` for an empty value. No trimming: the validator already rejects whitespace around entries. The `rules.exclude` validator calls the same helper, and Task 27 uses it for each worktree. Add core unit tests for it.
  - [ ] Exit 1 becomes a `UserError`.
  - [ ] Remove capability probing (`readCapabilities`, `guideSupports`, `GuideCapability`) and the `.bak` path. Keep target validation, project resolution, the overwrite prompt and command delivery.
  - [ ] `init.ts` goes through `setupIdeAction` and shouldn't need code changes. Check that it builds and its tests pass.
  - [ ] Success: build passes. `node packages/cli/dist/index.js setup-ide claude --dry-run` on this repo reports no changes, and `git status` stays clean.

- [ ] **Task 27: Rewrite the worktree loop** (effort 3)
  - [ ] Replace `runSetupIdeInWorktrees` and the `propagateToWorktrees` fallback with a loop in `setup-ide.ts` over `propagationTargets(project)`:
    - Each worktree calls `installIde` with its root as both `projectRoot` and `targetRoot`, and the main checkout's guide.
    - `rules.exclude` is read again for each worktree root, parsed with `parseRulesExclude` (Task 26).
    - It prints `→ setup-ide in worktree: <name>`.
  - [ ] Failure handling:
    - A worktree that returns 1, or hits a filesystem error, is recorded and the loop continues. The command then exits non-zero naming those worktrees.
    - Any other exception propagates.
  - [ ] Success: build passes.

- [ ] **Task 28: Test the cf wiring** (effort 3)
  - [ ] In `setup-ide.test.ts`, replace the tests that mock `execFileSync('bash', ...)` with tests that mock or spy on `installIde`. Cover:
    - the target and its aliases reach it
    - exit 1 becomes a `UserError`
    - a configured `rules.exclude` reaches `rulesExclude`. This replaces the cf-stub tier tests.
    - the worktree loop reads `rules.exclude` per root, continues past a failing worktree and names it, and stops on a non-filesystem exception
  - [ ] Success: the CLI tests pass.
  - [ ] Commit: `feat(cli): run setup-ide install in-process`.

- [ ] **Task 29: Delete the script plumbing** (effort 2)
  - [ ] Confirm the build and full suite pass first. Only then delete:
    - `guideScript.ts`
    - from `worktreePropagation.ts`, everything except `propagationTargets`: `pruneStaleFiles`, `sweepGeneratedPrompts`, `copyManifest`, `copyRootOutput`, `propagateToWorktrees` and their helpers
    - `worktreePrune.test.ts`, and the bash- or propagation-based cases in `worktreePropagation.test.ts` and `setup-ide.test.ts`. Keep the `propagationTargets` tests.
  - [ ] Success: build, lint and `pnpm test` pass. `grep -rn "scripts/setup-ide\|'bash'" packages/*/src` returns nothing.
  - [ ] Commit: `refactor(cli): remove setup-ide guide script plumbing`.

- [ ] **Task 30: Update wording that names the guide script** (effort 1)
  - [ ] `ideTargets.ts`: rewrite the comments that call the guide "the sole writer" of the markers. The literals don't change.
  - [ ] `packages/core/src/config/ConfigKeys.ts`: the `rules.exclude` description and validator comment now name cf's installer as the consumer. Validation doesn't change.
  - [ ] Success: build and the core config tests pass.
  - [ ] Commit: `docs(core): name cf installer as rules.exclude consumer`.

### Approved fixes

- [ ] **Task 31: Fix #40, the default-glob newline** (effort 2)
  - [ ] Fix the default `**` glob in `frontmatter.ts`, so it no longer writes `applyTo: "**` and `**"` on two lines.
  - [ ] Update the Task 9 unit test.
  - [ ] Run the suite without `-u` and list the failing snapshots. Expect 18: `test_targets_copilot_fresh`, `test_targets_copilot_prompts`, `test_targets_agents_fresh`, the `test_managed_*_agents` snapshots, and every `test_lint_*` snapshot (each shows `broken.md`'s `Applies to:` line). Check that each failure's diff is only the default-glob pair joining into one line. Any other failure is a bug in the fix, not a snapshot to update.
  - [ ] Run `vitest -u` scoped to exactly the failing files from that list.
  - [ ] Success: `git diff` on the snapshots shows only default-glob lines, and all tests pass.
  - [ ] Commit: `fix(cli): drop stray newline from default applyTo glob (#40)`.

- [ ] **Task 32: Fix #38, the extra final newline on block replace** (effort 2)
  - [ ] In `managedSection.ts`, bytes outside the block pass through untouched when a managed block is replaced. No final newline is added.
  - [ ] Update the Task 11 unit test.
  - [ ] Run the suite without `-u` and list the failing snapshots. `test_managed_block_replaced_*` will fail. Any re-run test that replaces a block may also fail (`test_managed_backup_kept_*`, the second-run `test_ownership_*` tests). Check that each failure's diff is only the dropped extra final newline. Any other failure is a bug in the fix.
  - [ ] Run `vitest -u` scoped to exactly those failing files.
  - [ ] Success: `git diff` on the snapshots shows only trailing-newline changes, and all tests pass.
  - [ ] Commit: `fix(cli): keep trailing bytes when replacing managed block (#38)`.

### Docs and verification

- [ ] **Task 33: Docs** (effort 1)
  - [ ] Check that `README.md` and `cf setup-ide --help` still describe the command accurately.
  - [ ] Update docs in `packages/` and `project-documents/user/architecture/` that describe setup-ide as a guide script (`200-slices.developer-onboarding.md`, `900-slices.maintenance-and-refactoring.md`).
  - [ ] Add a CHANGELOG entry under Unreleased: native install, #38/#40 fixes, env tier removed.
  - [ ] Success: `grep -rn "scripts/setup-ide"` over README and docs finds only historical references.
  - [ ] Commit: `docs: describe cf setup-ide as a native install`.

- [ ] **Task 34: Verification walkthrough and implementation notes** (effort 2)
  - [ ] Run design walkthrough steps 1, 2, 3, 5 and 6 after `pnpm -r build`. Step 4 was done in Task 25. Step 5 needs a project with a registered worktree. If none is available, ask the PM.
  - [ ] Add an "Implementation notes" section to the slice design listing the intended differences:
    - `echo -e`
    - the BSD-sed title fallback
    - glob expansion of `rules.exclude` against the current directory
    - the dry-run sandbox cleanup
    - Linux output
    - anything from Task 25
  - [ ] Run `pnpm -r build`, `pnpm lint` and `pnpm test` once more.
  - [ ] Success: every walkthrough step behaves as the design describes, and all checks pass.
  - [ ] Commit: `docs: add slice 215 implementation notes`.
