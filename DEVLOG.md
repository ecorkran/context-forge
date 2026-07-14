# Development Log

A lightweight, append-only record of development activity. Newest entries first.

Format: `## YYYY-MM-DD` followed by brief notes (1-3 lines per session).
Tags noted as `Tags: @scope/pkg@version` when versions are bumped.

---

## 2026-07-14

### Slice 915: Config Key Scope Classification (Shared vs. Personal) — Complete
- Adds a required `scope: 'shared' | 'personal'` field to `ConfigKeyDefinition` (`packages/core/src/config/ConfigKeys.ts`), classifying all 14 keys — only `git.integration_branch` is `personal`, forcing an explicit decision on any future key at compile time. New `.context-forge.local.toml` project-scope file (`getProjectPersonalConfigPath()`) holds personal keys; `.context-forge.toml` stays purely shared/committed policy.
- `ConfigManager.get/set/delete` route project-scope calls to the correct physical file based on the key's own `scope`, transparently — no caller (CLI, MCP, `branchGuard.ts`, `WorkflowNavigator`, etc.) changed. Read precedence: project-personal → project-shared → user → default, with a read-time fallback so a personal key already committed to the shared file (pre-existing-commit case) keeps resolving correctly instead of silently disappearing.
- New `ConsistencyChecker` rule (`personal-config-in-shared-file`) flags any personal-scope key found in the shared file; new `cf config migrate-personal` command moves it, with explicit collision semantics (absent from personal → move; identical value → delete shared copy; different value → skip both, report `skipped (personal value already set)` — never silently overwrites a developer's local value). `cf init` now ensures `.context-forge.local.toml` is gitignored (create-or-append, one line, regardless of `--lite`). MCP `config_get` surfaces both project config paths.
- Bug found and fixed via the manual verification walkthrough (not caught by mocked unit tests): `migrate-personal`'s identical-value-collision path called the auto-routed `delete(key, 'project')`, which for a personal-scope key routes to the *personal* file by design — silently wiping the value the migration was supposed to preserve while leaving the shared file's stale copy untouched. Fixed with a new narrow `ConfigManager.deleteFromSharedProjectFile()` method that bypasses scope routing; `migrate-personal` now uses it for both its moved-and-delete-shared paths. Re-verified the full 9-step walkthrough end-to-end after the fix.
- Walkthrough itself also had a step-ordering bug (found before running it, not after): the original order set the personal file's value in step 1, then tried to demonstrate the shared-file fallback in step 4 — unobservable once the personal file already has a value, since personal always wins. Reordered so the fallback proves out before anything is ever written to the personal file. Also documents a known, low-risk gap (confirmed acceptable — no project has this key set in the wild yet): `cf config unset --project` cannot target a personal key's stale shared-file copy directly, since `delete()` routes it to the personal file by the same logic as `set()`; the manual-edit-TOML fallback is documented instead of adding new CLI surface for a case that doesn't need solving yet.
- 7 commits on `915-slice.config-key-scope-classification-shared-vs-personal` branch (registry+routing, ConsistencyChecker rule, migrate-personal, cf init gitignore, MCP surface, the walkthrough-driven bugfix, wrap-up); full monorepo build clean; only the pre-documented pre-existing failures remain (3 `FileProjectStore`, 4 CLI `list.test.ts`).

---

## 2026-07-13

### Slice 916: Guide Update Branch Guard — Complete
- Adds a branch guard evaluated on every `cf guides update` / `guide_update` MCP call, immediately before the strategy's commit-producing `update()` step. Resolves `trunk` (`git.integration_branch` config, or `main` if unset) against the current branch and either proceeds silently (on trunk), blocks (on `main` when a different trunk is configured, or detached HEAD), or warns-and-confirms (any other branch, distinguishing `descends`-from-trunk vs. `unrelated` ancestry via `git merge-base --is-ancestor`). Closes a gap where 914's `git.integration_branch` guardrail was silently bypassed by this one code path.
- New `packages/core/src/guides/branchGuard.ts`: `evaluateBranchGuard()`, a standalone `isAncestor()` helper (bypasses `gitExec`'s throw-on-nonzero contract via a local `execFile` wrapper, since `merge-base --is-ancestor` uses exit code as its actual return value), and `BranchGuardBlockedError`/`BranchGuardWarnError` — the single source of remediation text, surfaced as-is by both CLI and MCP. `GuideManager.update()` gained an optional `{ confirmed?: boolean }` parameter; the guard evaluates unconditionally regardless of strategy (including `manual`/`TarballStrategy`, which does no commit but still sees the block/warn UX by design, per PM decision — not worth a strategy-type skip for negligible-usage code).
- CLI: `cf guides update` gained `-y`/`--yes` (via the existing `withYesOption` helper) and a warn-and-confirm flow reusing the already-shared `askConfirmation` from `utils/confirm.ts` (did not touch `setup-ide.ts`'s separate local copy — deduping that pre-existing duplication was out of scope). MCP: `guide_update` gained an optional `confirm` input parameter; an unconfirmed warn returns an `errorResult` instructing the caller to retry with `confirm: true` — the correct two-call analog to CLI's interactive prompt, given no stdin exists in that context.
- **Prerequisite fix bundled in (Section 0, committed to `main` before the slice branch was cut):** `cf config set` was found to default to machine-wide user scope whenever `--project` was omitted (`config.ts:92`), silently leaking values set in one project (e.g. `git.integration_branch`) into every other project on the machine — directly undermining this slice's premise. Fixed by flipping the default to project-scope-resolved-from-CWD (matching `get`'s existing behavior), with a new explicit `--global` flag as the opt-in for machine-wide writes. Also added `cf config unset <key>` (new `ConfigManager.delete()`/`deleteKey()`, the latter pruning now-empty parent TOML tables) since no removal capability existed at all — needed to clean up the actual leaked keys on this machine without hand-editing TOML. Cleanup applied per PM's explicit per-key decision (removed the leaked `git.integration_branch`, corrected `workflow.review_enabled` to its intended `true`, left `workflow.review_gate_effective_date` untouched).
- Full test coverage added per component: `branchGuard.test.ts` (19 tests, full decision-table + error-class coverage), `GuideManager.test.ts` (+7, guard integration + TarballStrategy parity), `guides.test.ts` CLI (+5), `guideTools.test.ts` MCP (+3), plus the Section 0 prerequisite's `config.test.ts`/`ConfigManager.test.ts` coverage. Verified end-to-end via a live scratch-repo walkthrough (submodule strategy) covering all three outcomes (block/proceed/warn) with both a configured integration branch and the unset/`main`-default case, `--yes` skip included — no discrepancies from the documented walkthrough.
- 9 commits on `916-slice.guide-update-branch-guard` branch (core module, GuideManager wiring, CLI, MCP, each paired with a docs/checklist commit) plus 2 prerequisite-fix commits on `main` beforehand; full monorepo build clean; only the pre-documented pre-existing failures remain (3 `FileProjectStore`, 4 CLI `list.test.ts`).

---

## 2026-07-11

### Slice 913: TD-5/TD-6 follow-up (found during PM review) — Complete
- PM review of TD-1-3's `cf check` output on this repo surfaced two further pre-existing bugs, plus a self-inflicted one from the prior session's premature close: slice 913's own slice-design frontmatter had been set `status: complete` while 2 tasks (this review round) were still open, which `cf check` correctly caught as "frontmatter complete but tasks incomplete." Reverted to `status: in-progress`; no logic bug, just premature bookkeeping.
- TD-5: `ruleReviewGate()`'s `preAdvance` (code-review) boundary guard only checked `planEntry?.isChecked`, unlike `preTasks`/`preImplementation` which also require their gated artifact (`docs.sliceDesign`/`docs.taskFile`) to exist. A checked plan entry with zero slice-design/task-file/review artifacts anywhere on disk (slices 185, 901, 903, 904 in this repo) was flagged "requires a code review — no review artifact found," a false positive since there's no code to review. Fix: guard now also requires `docs?.sliceDesign` to exist, mirroring the pattern two lines above it. Slices with real artifacts and no review (908, 910, 911) remain correctly flagged.
- TD-6: architecture 050 (`050-arch.design-decisions.md`, predates the project's `workflow.review_gate_effective_date: 20260701`) was still flagged despite the effective-date cutoff that should exempt it. Root cause was not the cutoff logic — `extractFileIndex()` correctly parses `"050-arch..."` to the number `50`, but `detectDocuments()`'s `matchFiles()` then re-derives a literal string prefix (`"50-arch."`) that doesn't match the zero-padded filename, so `docs.architecture` resolves `null` and the cutoff check (`reviewGate.ts:202`, gated on `gatedArtifactFrontmatter` truthiness) is skipped entirely before it ever runs. Fix: `matchFiles()` now matches via `^0*${idx}${suffix}` (tolerant of leading zeros) instead of an exact prefix, applied across all 5 call sites in `documentDetector.ts` — a general fix benefiting all four review boundaries, not arch-specific.
- Both regressions verified fail-without-fix/pass-with-fix via `git stash` before/after runs, not just "test passes." `cf check` on this repo: 16 findings (2 errors, 13 warnings, 1 info) → 8 findings (0 errors, 7 warnings, 1 info), all 8 confirmed correct by PM.
- 1 commit on `913-slice` branch for TD-5+TD-6 (bundled — both found in the same review pass, both narrow `ConsistencyChecker.ts`/`documentDetector.ts` fixes); full monorepo build clean; only the pre-documented pre-existing failures remain (3 `FileProjectStore`, 4 CLI `list.test.ts`).

---

## 2026-07-10

### Slice 913: Fix Phantom Review-Gate Findings, 909's Missing Slice-Design, and List-Command Plan Targeting (TD-1/TD-2/TD-3)
- TD-1 root cause (found while dogfooding `cf check` on this repo post-243): `ConsistencyChecker.checkAll()` merges every discovered `*-slices.*.md` plan's entries into one global `index`-keyed map, "first occurrence wins." `slicePlanParser.ts`'s unindexed-entry fallback assigns a per-file sequential counter as `index` — fine for a single plan read in isolation, but `checkAll()`'s cross-plan merge treated that counter as a real project-wide index. `140-slices.context-forge-restructure.md` (12 fully-complete legacy entries, all unindexed, predating the `(NNN)` convention) produced synthetic indices 1–12 that collided with real low-numbered slices once merged, generating phantom "Slice 1"–"Slice 12" review-gate findings.
- Fix: new `indexSource: 'explicit' | 'fallback'` field on `SlicePlanEntry`, tagged at both parser construction sites (`slicePlanParser.ts`); `checkAll()`'s merge loop now skips `'fallback'` entries before inserting into `uniqueEntries`, so they never enter the cross-plan index space. Scoped narrowly — single-plan consumers (`check()`, `cf list slices`, `parseSlicePlan()` itself) are unaffected by design; per-plan aggregate rules (e.g. `plan-status-vs-entries`) still legitimately evaluate a legacy plan's own internal consistency.
- Regression fixture reproduces the real collision using 140's actual list format (`N. [x] **Name** — desc`, no bolded index) against a sibling indexed plan with colliding real indices 1-3 — split across two test files: the real (unmocked) `parseSlicePlan()` collision itself in `slicePlanParser.test.ts`, and `checkAll()`'s merge-loop exclusion (mocked introspector, since `ConsistencyChecker.test.ts` globally mocks `node:fs/promises` for its `readdir`-based discovery tests, which would silently break real `readFile` too) in `ConsistencyChecker.test.ts`.
- TD-2: wrote a retroactive minimal slice-design for 909 (`909-slice.configurable-branch-root-prefix.md`, backdated to `20260628` — the commit date, not the authoring date) citing shipped commit `713d0c0`. Deliberately omits Technical Decisions/Data Flow/Verification sections (nothing was planned, so nothing to document there) and leaves `codeReview` undeclared at design time — a PM call, not an architectural default. Confirmed via `cf check --set-review-none 909`: PM opted to exempt (low-risk shipped code: one config key + validator + 45 lines of test coverage), now `codeReview: none`.
- TD-3: new `resolveSlicePlanPathByIndex(projectPath, archIndex)` core helper (`resolveFileByIndex.ts`, same file as `resolveArtifactPath` — same "index → path" concern), backing an optional `[archIndex]` positional argument on `cf list slices` / `cf list tasks`. Lets either command target a non-active initiative's plan directly (`cf list slices 140`) without the previous four-step `cf set arch` round-trip, and without any project-state mutation — verified both by an executed real-CLI before/after `cf project get` diff and an automated byte-identical JSON-snapshot assertion in `list-arch-index-targeting.test.ts`. `[archIndex]` + `--all` on `cf list tasks` is a `UserError`, not silently ignored.
- 2 commits on `913-slice` branch (TD-1+TD-2 bundle, TD-3 bundle); full monorepo build clean; only the pre-documented pre-existing failures remain (3 `FileProjectStore`, 4 CLI `list.test.ts`). Slice closed prematurely this session — reopened 2026-07-11 after PM review surfaced TD-5/TD-6 (see above).

---

## 2026-07-07

### Convention: `.context-forge.toml` is committed project policy — use `--project` to write it
- `.context-forge.toml` holds project workflow policy (guide source, review-gate thresholds, `git.branch_root`, `review_gate_effective_date`, etc.) — **no secrets**. It is the CF analogue of `tsconfig.json`/`.editorconfig`: **commit it**, do not gitignore it, so every clone / agent / CI resolves `cf next`/`cf check` identically. If it lived only on one machine, teammates' workflow guidance would silently drift from yours on the same repo.
- CF splits config by scope. **`cf config set --project <key> <val>`** writes the project-scoped `.context-forge.toml` (shared, checked in). **`cf config set <key> <val>`** (no `--project`) writes the *user*-scoped config under the home dir (personal, never in the repo). Rule of thumb: project policy → `--project`; personal/experimental toggles → user scope, so they stay out of version control.
- Note: this repo currently has no `.context-forge.toml` (runs on defaults) — that's fine; create + commit one only when you actually set project policy here.

### Slice 912: design (Phase 4) + a bugfix surfaced while dogfooding it
- Authored the slice 912 low-level design (folds GitHub #58 + #59): #58 `cf next` conditional `suggestedCommand` (phase-advance when `arch` already set), #59 gap 1 (arch gate evaluated independent of slice-plan existence), #59 gap 2 (`ruleReviewGate` widened to all four boundaries + a per-arch-index aggregate rule). Confirmed the 911 effective-date cutoff already covers all boundaries — no new plumbing. Added TD-5 (error isolation for the new `cf check` gate paths, via the existing `safe*` convention) to resolve the slice review's one concern (F004).
- Fixed a real `cf config set` bug found while setting `workflow.review_gate_effective_date` on Squadron: the CLI blindly `Number()`-coerced any all-digit argument *before* the type check, so a YYYYMMDD date (a string-typed key) was rejected as `number`. Shell strips quotes, so quoting didn't help. Now coerces toward the key's declared type via `CONFIG_KEYS`; no config key is numeric today, so the old branch could only ever break string keys. +1 regression test. (`packages/cli/src/commands/config.ts`)
- 3 commits on `912-slice` branch; slice not yet implemented (Phase 5 task breakdown pending).

### Slice 912: implementation (Phase 6) — Complete
- TD-1 (#58): `WorkflowNavigator`'s no-active-slice branch now suggests `cf set phase 'Phase 2: Architecture'` (and sets `NextAction.phase`) instead of a no-op `cf set arch <index>` when `fileArch` is already set. New exported `ARCHITECTURE_PHASE` constant in `projectSchema.ts` (derived from `PHASE_STRINGS[2]`) is the single source of truth for the new call site; the four pre-existing bare-literal sites were left as noted debt per the design.
- TD-2 (#59 gap 1): dropped the `&& status.slicePlan === null` clause from the arch (`preSlicePlan`) gate guard in `getNext()` — the gate now evaluates whenever an arch file exists, inside the no-active-slice path, regardless of whether a slice plan already exists. Active-slice path deliberately unchanged (scope boundary; `cf check` covers that case).
- TD-3 (#59 gap 2): `ConsistencyChecker.ruleReviewGate()` widened from `preAdvance`-only to all three slice-keyed boundaries (`preTasks`/slice, `preImplementation`/tasks, `preAdvance`/code), each guarded on the corresponding artifact's existence. New `ruleArchReviewGate` aggregate rule (`checkAll()`-only) audits the arch (`preSlicePlan`) boundary across every discovered architecture file, independent of slice-plan pairing. `suggestedFix` now names the actual review type instead of a hardcoded "code review".
- TD-5: new `safeEvaluateGate()` helper wraps every `evaluateReviewGate()` call in try/catch, converting a throw into an `error`-severity finding instead of aborting `checkSlice()`/`checkAll()` — also tightens the pre-existing `preAdvance`-only path, which previously let a throw escape uncaught. In practice `evaluateReviewGate()` has no reachable throw path today (`parseFrontmatter`/`detectDocuments` are both exception-free by design), so this is defensive; verified via a mocked throw in `ConsistencyChecker.reviewGateWidened.test.ts` rather than a live fixture.
- Found and fixed a pre-existing test-infrastructure bug while writing TD-3 tests: `ConsistencyChecker.reviewGate.test.ts`'s `makeIntrospectorWithPlanEntry` helper built its mock via `{ ...real, parseSlicePlan: ... }` — spreading a class instance drops its prototype methods, so `detectDocuments` silently became `undefined` and every call through it threw internally (caught by `safeDetectDocuments`, returning `null`). This accidentally made the existing tests only ever exercise the `preAdvance` boundary. Left the existing (broken-but-stable) helper alone — fixing it would flip several pre-242 tests' expectations, out of scope here — and used an explicitly-bound introspector (`real.detectDocuments.bind(real)`, etc.) in the new TD-3/TD-5 test files instead.
- Task 4.1: new `reviewGate.cutoffIntegration.test.ts` proves the effective-date cutoff (911) flows through the actual `getNext()`/`checkAll()` call sites this slice rewired — zero new cutoff code, confirmed by test.
- Task 4.2: ran the full Verification Walkthrough (Parts A-F) against a live scratch project via the real `cf` CLI, not just unit tests. Found one real CLI behavior not anticipated by the design: `cf set arch <index>` validates against an initiative-plan entry and refuses to set a pointer with no matching file — the walkthrough used `cf project set arch <stem>` instead (sets the field directly, the correct tool for "point at a file that doesn't exist yet"). Confirmed all four boundaries, the cutoff, and the aggregate arch rule behave exactly as designed end-to-end. Reverted the two user-scope config keys touched during the walkthrough (`workflow.review_enabled`, `workflow.review_gate_effective_date`) back to defaults afterward so the scratch testing doesn't leak into other projects on this machine.
- 3 commits on `912-slice` branch (source+tests split across TD-1/TD-2 bundle, TD-3/TD-5 bundle, verification); full monorepo build clean; only the pre-documented pre-existing failures remain (3 `FileProjectStore`, 4 CLI `list.test.ts`).

---

## 2026-07-05 – 2026-07-06

### Slice 911: Fix Slice-Status Derivation for Partial-Completion Slices — Complete
- Root cause (GitHub #56): slice-plan entry status was derived purely from the plan checkbox (`isChecked ? complete : not-started`), so a slice with tasks done (or even partially done) but an unchecked plan entry read as "not started" in `cf next`/`cf list slices`/`workflow_status`, contradicting `cf status`. Reproduced against slice 242 post-completion.
- New `deriveEntryStatus` helper (`packages/core/src/introspection/statusDerivation.ts`) implements the agreed precedence lattice: `deprecated` frontmatter > computed task completion > slice-design frontmatter > plan checkbox. Replaces five divergent inline mappings across `WorkflowNavigator.getNext()` (both find-sites), `cf list slices`, `cf list arch`, and two `ProjectModelBuilder` paths.
- Found and fixed mid-implementation: `WorkflowNavigator.getStatus()`'s `slicePlan.entries` (what MCP `workflow_status` returns verbatim) wasn't routed through the derivation at all — was still returning the raw checkbox-only status even after `getNext`/`cf list` were fixed.
- TD-2a (signal-resolution failures must surface, not silently degrade): `normalizeStatus()` now returns `undefined` for unrecognized input instead of silently defaulting to `not-started`; `parseTaskItems`/`parseTaskFile` now propagate genuine read failures (anything but ENOENT) instead of swallowing everything. Found and fixed the same swallow-pattern in `WorkflowNavigator.deriveSliceStatus`'s outer try/catch while implementing this.
- Also resolves GitHub #57: `codeReview: none` slice-design frontmatter declaration (registered as an optional field in the frontmatter schema) lets `evaluateReviewGate()` skip the pre-advance code-review gate for docs-only slices. Default (absent) unchanged.
- Two new `ConsistencyChecker` rule branches close the not-started-boundary gap the existing complete-boundary rules left open (task started but plan/frontmatter still says not-started).
- Corrected a factual error in this slice's own design/task docs during implementation: registering `codeReview` was framed as suppressing a `cf check` "unknown field" warning — no such check exists in `validateFrontmatter()` (confirmed by reading it directly); slice 905 explicitly scoped that out as too noisy. Registered anyway for real value: `cf check` now validates the field's value.
- Slice 243 (the design's intended live docs-only verification fixture) has no slice-design/task file written yet — flagged as a follow-up for whoever designs it.
- 5 commits, ~40 new tests across `statusDerivation`, `WorkflowNavigator`, `ProjectModelBuilder`, `ConsistencyChecker`, `reviewGate`, `frontmatterSchema`, and CLI `cf list` derived-display coverage.

### Follow-up: review-gate migration friction (same session)
- Dogfooding 911 on this repo (`cf check` with `review_enabled` on) surfaced 63 findings — almost all "missing code review" for slices 1-12/161-210/901-911, none of which ever existed under the review-gate system. Added `workflow.review_gate_effective_date` (YYYYMMDD grandfather cutoff, resolved once in `ResolvedGate` so it's free for pre-resolved callers) and `cf check --set-review-none <index>` (direct convenience command, writes `codeReview: none` to the slice-design file).
- Filed [#59](https://github.com/ecorkran/context-forge/issues/59): the `preSlicePlan`/arch gate in `getNext()` only fires while no slice plan exists yet (orphaned once one is created — this is why completing Phase 2 didn't surface a pending arch review), and `cf check`'s `ruleReviewGate` hardcodes `preAdvance` only, never checking `arch`/`slice`/`tasks`. Out of scope for 911; noted that the effective-date cutoff must cover all four boundaries once #59 widens coverage (it already does, since it's centralized in `evaluateReviewGate()`).
- 1 commit, 4 new tests across `reviewGate`, `ConfigManager`, and CLI `check` coverage.

---

## 2026-06-21 – 2026-06-24

### Initiative 240: Review-Aware Workflow Gating — Phase 2 Architecture Complete
- Authored `240-arch.review-aware-workflow-gating.md`; iterated through full arch review cycle (8 findings, all resolved via PM discussion)
- Decisions locked: `workflow.review_enabled` / `review_threshold` / `review_unknown_as` config keys; `pending-review` and `review-failed` as first-class slice status values; gate inserts between Priority 5 and Priority 6 in `WorkflowNavigator.getNext()`; existing `NNN-review.{reviewType}.{slug}.md` convention used as-is; initiative-level gate (`pre-slice-plan`) defined in arch, gate logic deferred to later slice
- Commits: `6c667b7` docs(arch+review), `f96fea1` guides(CLAUDE.md+python rules+submodule)

---

## 2026-04-11

### Slice 210: GitHub Copilot / VS Code IDE support — Complete
- `cf setup-ide copilot` and `cf init --ide copilot` add a second IDE target for VS Code Copilot users
- Always-on rules compile to `.github/copilot-instructions.md` + `AGENTS.md`; scoped rules to `.github/instructions/*.instructions.md` with `applyTo`; skills to `.github/prompts/*.prompt.md`
- `isManagedCopilotFiles()` safety check mirrors Claude path; unmanaged files backed up before overwrite
- Worktree propagation extended; 26 new unit tests; guides script adds `copilot` case alongside existing `claude`
- Commits: `11a2229` feat(cli), `ef33a3c` feat(guides), `4502331` docs

---

## 2026-04-03

### setup-ide worktree propagation (v0.6.38)
- `cf setup-ide claude` now propagates `CLAUDE.md`, `.claude/rules/`, `.claude/agents/`, `.claude/skills/` to all registered worktrees after updating root
- Root is always the source of truth; worktrees receive copies (no independent IDE config)
- `.claude/settings.local.json` and `.claude/worktrees/` intentionally excluded
- Fixes stale CLAUDE.md/rules in worktrees after every root setup-ide run

---

## 2026-04-02

### workflow_next improvements (v0.6.36)
- `cf next` suggests `cf set phase` when current phase doesn't match recommended phase
- Index band mismatch warning when slice is outside arch's hundred-block
- Arch-missing detection for active slice path (Priority 2.5)
- 8 new tests, backfilled CHANGELOG for 0.6.26–0.6.36
- Commits: `4091b2c` feat, `915612b` bump, `988e855` changelog

### Slice 907: CLI Short-Form Options — Complete
- Created `packages/cli/src/options.ts` with 7 composable helpers (`withJsonOption`, `withProjectOption`, `withYesOption`, `withFixOption`, `withAllOption`, `withRawOption`, `withProjectLevelOption`)
- Migrated all 14 CLI command files to use shared helpers; removed ~70 inline option registrations
- Short-form flags added: `-j`, `-p`, `-y`, `-f`, `-a`, `-r`
- 22 unit tests for shared helpers (short flags, long flags, chaining, no-short-flag for project-level)
- All 400 CLI tests, 767 core tests, 183 MCP tests passing
- Commits: `698787b` design, `9c6581b` tasks, `0ae8f35` feat(module), `d1bd899` refactor(high-use), `4853423` refactor(remaining)

---

## 2026-03-31

### Slice 906: CLI Self-Update Command — Complete
- `cf update` command: checks npm registry for latest version, prompts to install
- Core utilities: `compareSemver`, `fetchLatestVersion`, `detectInstallMethod`, `runUpdate`
- Supports `--yes` (non-interactive), `--json` (machine-readable), npm/pnpm global detection
- Local dev install detection via package.json heuristic — skips update with message
- 20 unit tests covering semver comparison, fetch mocking, install method detection
- 1,426 total tests passing across all packages
- Commits: `e16b08e` core utilities, `01c2120` command registration

### Slice 194: Worktree-Scoped Guide Uninstall — Complete
- `GuideManager.uninstall()` now detects worktree mode via `operationPath` and runs only `submodule deinit` scoped to the worktree
- CLI shows worktree-specific hint after deinit
- 7 new tests for both uninstall paths (worktree-mode and full)
- Fixes GitHub issue #46
- Commits: `70f34b6` core fix + tests, `70ee231` docs + artifacts, `fcdbbc8` review

---

## 2026-03-30

### Slice 905: Frontmatter Schema Validation — Complete
- Schema registry: `FRONTMATTER_SCHEMAS` maps 8 docTypes to required fields with value constraints
- `validateFrontmatter()` pure function with status alias normalization (hyphens, spaces, "active", "completed")
- ConsistencyChecker Rule 12: scans all methodology directories, validates frontmatter per docType
- Removed Rules 9 (missing-plan-status) and 11 (missing-arch-status) — subsumed by schema validation
- `cf check --fix` auto-fixes missing `status` fields with `not_started` default
- Fixed 12 project documents (added missing status to reviews and task files)
- 726 core tests passing (12 new schema/validation tests, 6 old rule tests removed)
- Commits: `2282fb3` schema registry, `254c74e` validateFrontmatter, `b3b90b8` checker integration, `c907af7` remove Rules 9/11, `c84efac` fix project documents

## 2026-03-25

### Slice 209: AI-Agent Consumption Interface — Complete
- `cf help --json`: machine-readable command catalog (27 commands) from Commander runtime
- `cf version --json`: version, guideVersion, breaking changes array for cache invalidation
- Structured JSON errors: `ErrorCode` type on `UserError`, JSON output via `--json` or `CF_JSON=1`
- `agent_quickstart` MCP tool: structured capability schema with 7 capability groups and CLI equivalents
- Idempotency: `projectSetAction` detects no-change, prints "already set", exits 0
- `docs/AGENT-INTEGRATION.md`: 65-line integration guide for agent authors
- CLI, MCP, core package READMEs updated — all tool categories, compound commands, v0.6 changelog
- All 1387 tests passing (716 core, 383 CLI, 182 MCP, 106 electron)
- Commits: `7e2503e` help --json, `1528de7` version --json, `64f07c2` JSON errors, `cda1cc0` agent_quickstart, `f949938` idempotency, `7a0ffce` agent integration guide, `fb5fa0c` README updates

---

## 2026-03-24

### Slice 209: AI-Agent Consumption Interface — Task Breakdown Complete
- Slice design for making CF a first-class tool for AI agent consumption
- Task breakdown: 8 sections, 20 tasks covering all 7 deliverables
- `cf help --json`: machine-readable command catalog from Commander runtime
- `cf version --json`: version + guide version + breaking changes array
- Structured JSON errors with error codes when `--json` active
- `agent_quickstart` MCP tool: structured capability schema for pure-machine consumers
- Idempotency audit: detect no-change in `cf set`, skip write
- `docs/AGENT-INTEGRATION.md`: integration guide for agent authors (not AGENTS.md — reserved filename)
- Package README updates for CLI, MCP, and core

### Slice 208: Compound Workflow Commands — Complete
- Seven compound CLI commands: `cf concept`, `cf initiatives`, `cf arch <index>`, `cf plan <index>`, `cf slice <index>`, `cf tasks <index>`, `cf implement <index>`
- Each command sets the appropriate artifact field + phase, then builds context in one invocation
- `cf list` command consolidates artifact listing: `cf list projects/initiatives/arch/plans/slices/tasks/items`
- `cf list arch` is an alias for `cf list initiatives`
- Old commands removed: `cf arch list`, `cf plan list`, `cf slice list`, `cf tasks list`, `cf tasks items`
- Artifact existence warnings fire for all commands except `cf implement`
- Auto-set rules work through compound commands (e.g., `cf arch 220` auto-sets fileSlicePlan)
- Set/unset confirmations routed to stderr for pipeable compound output
- Strict numeric validation on compound command arguments (`cf slice banana` → error)
- Moderate warning on `cf set` artifact fields for non-numeric values
- **Phase 2: Slash commands and output modes**
  - Seven new slash commands: `/cf:concept`, `/cf:initiatives`, `/cf:arch`, `/cf:plan`, `/cf:slice`, `/cf:tasks`, `/cf:implement`
  - Bare CLI no longer outputs raw prompt — shows help message to stderr instead
  - `--json` flag on all compound commands and `cf build` outputs `{ project, phase, context }` to stdout
  - Slash commands use `--json` to capture context for Claude Code sessions
  - Updated `/cf:build` to use `--json` (breaking: bare `cf build` no longer pipes raw prompt)
  - 16 total slash commands installed via `cf install-commands`
- All 1357 tests passing (716 core, 359 CLI, 176 MCP, 106 electron)
- Commits: `4188c97` extract handlers, `fd0d94c` cf list, `516c25b` workflow commands, `647b5fe` tests, `756e780` stderr routing, `c71b21c` numeric validation, `5e36b49` slash commands + --json

---

## 2026-03-22

### CLI Quality-of-Life: `cf guides uninstall` + `cf set date now`
- `cf guides uninstall` — deinits submodule, cleans `.git/modules/`, removes entry from index; for clone/manual installs, removes directory. Fixes git worktree removal blocked by submodule presence.
- `cf set date now` / `cf set date` — sets `dateProject` to today's date (YYYYMMDD) without typing it. Uses `formatDateProject()` from core.

### Slice 206: CLI/MCP Shared-Logic Consolidation — Complete
- Extracted duplicated constants (`WORKTREE_SCOPED_FIELDS`, `PROJECT_TO_WORKTREE_FIELD`) from CLI and MCP into `@context-forge/core`
- Extracted project creation defaults (`formatDateProject`, `buildProjectCreationDefaults`) into core
- Extracted auto-set rules (`computeAutoSetFields`) into core — three rules: `developmentPhase→instruction`, `fileArch→fileSlicePlan`, `fileSlice→fileTasks`
- Bug fix: MCP now correctly auto-sets `fileSlicePlan` from `fileArch` (was missing entirely)
- Browser-safe/Node split: constants and creation helpers in `index.ts`, `computeAutoSetFields` in `node.ts` (depends on `resolveFileByIndex`)
- All 1328 tests passing (712 core, 334 CLI, 176 MCP, 106 electron)
- Commits: `e959388` constants, `d754718` creation defaults, `8a6e1d3` auto-set rules

### Slice 207: Worktree-Resolved Project View — Implementation Complete
- `resolveProject(store, id, worktreeId?)` in `@context-forge/core` — centralized worktree overlay resolution
- `ResolvedProject` type extends `ProjectData` with `resolvedWorktree?: { id, name }` metadata
- `project_get` MCP tool gains optional `worktreeId` parameter (new capability)
- All single-worktree retrieval sites migrated: MCP workflow tools, context tools, 8 CLI commands
- Multi-view iteration sites (check, workflow_check, --worktrees) intentionally excluded
- Bug fix: `applyWorktreeOverlay` now sets `projectPath` to `worktreePath` — fixes `cf next`/`cf status` failing to detect slice designs in worktree directories
- All 1306 tests passing (690 core, 334 CLI, 176 MCP, 106 electron)
- Commits: `608d886` overlay fix, `f65e2ff` core resolveProject, `c70205a` workflow tools, `bd27763` project_get, `8e51837` context tools, `d293bc6` CLI commands

### Slice 207: Worktree-Resolved Project View — Task Breakdown Complete
- 6 sections, 24 tasks: core function+tests (4), MCP workflow tools (5), MCP project_get (3), MCP context tools (5), CLI commands (10), cleanup+validation (4)
- 16 call sites inventoried: 11 CLI, 5 MCP — multi-view iteration sites (check, workflow_check) excluded from migration
- Test-with pattern: unit tests follow core implementation, integration tests follow each consumer migration
- 5 commit checkpoints (core, workflow tools, project_get, context tools, CLI, cleanup)

### Slice 207: Worktree-Resolved Project View — Slice Design Complete
- Centralized `resolveProject()` function in `@context-forge/core` replaces scattered inline overlay calls
- `project_get` gains optional `worktreeId` parameter — returns resolved view with overlay pre-applied
- All retrieval points (`project_get`, `workflow_status`, `workflow_next`, `context_build`, CLI commands) use single resolution path
- `ResolvedProject` type extends `ProjectData` with `resolvedWorktree?: { id, name }` metadata
- Throws on missing worktree (no silent fallback) per project principles
- Dependencies: [206] for shared constants in core

---

## 2026-03-20

### Slice 193: Overlapping Index Range Override — Implementation Complete
- `rangeOverride?: boolean` on `WorktreeContext`, `override?: boolean` on `CreateWorktreeInput`
- `addWorktree()` and `updateWorktree()` skip `chopDefaultRange()` when override is set
- CLI: `-o`/`--override` on `cf worktree init` and `cf worktree update`, `[override]` indicator in list
- MCP: `override` param on `worktree_init`, `rangeOverride` param on `worktree_update`
- Out-of-range warning in `cf set slice` suppressed for overridden worktrees
- Override clearable: updating range without `-o` clears flag and re-enables chop
- 15 new tests across core (6), CLI (7), MCP (2). All 1297 tests passing.
- Fix: removed worktree overlay fallback — `cf unset` on worktree fields now works correctly
- Fix: `fileSlice`, `fileTasks`, `instruction` now optional on `ProjectData` (matching schema)
- Commits: `4673630` core, `635e072` cli, `7199ecb` mcp, `367fb83` overlay fix

### Slice 193: Overlapping Index Range Override — Task Breakdown Complete
- 4 sections: core type+service (6 tasks), CLI flags+display (8 tasks), MCP params (4 tasks), final validation (3 tasks)
- Test-with pattern: each implementation task followed by its test task
- 3 commit checkpoints (core, CLI, MCP) plus final validation commit

### Slice 193: Overlapping Index Range Override — Slice Design Complete
- `-o`/`--override` flag for `cf worktree init` and `cf worktree update` to skip `chopDefaultRange()` on intentional overlap
- New `rangeOverride?: boolean` field on `WorktreeContext`, persisted and surfaced in list/status display
- Out-of-range warning in `cf set slice` suppressed when worktree has `rangeOverride: true`
- MCP `worktree_init` and `worktree_update` gain corresponding `override`/`rangeOverride` parameters
- Override is clearable: updating range without `-o` clears the flag and re-enables chop

### Slice 206: CLI/MCP Shared-Logic Consolidation — Slice Design Complete
- Promoted from future work in 200-slices to feature slice (206)
- Designed extraction of duplicated logic (constants, creation defaults, auto-set rules) into `@context-forge/core`
- Key finding: `fileArch→fileSlicePlan` auto-set is missing from MCP entirely — extraction fixes this
- New core module: `project-defaults.ts` with `computeAutoSetFields()`, `buildProjectCreationDefaults()`, constants

---

## 2026-03-19

### Slice 205: Consistency Checker & Build Template Fixes — Implementation Complete
- `checkAll` now scans all discovered slice plans for per-slice rules (not just configured plan)
- MCP `workflow_check` applies worktree overlays with finding merge/dedup (matching CLI behavior)
- `/cf:check` slash command added (passthrough to `cf check $ARGUMENTS`)
- `cf:build` template reordering: instruction(3) → notes(4) → events(5) → tools(6)
- 7 new tests (4 core multi-plan, 4 template ordering, 3 MCP worktree parity)
- All tests pass: core 50, CLI 324, MCP 23+, electron 106
- Commits: 4f1860e, 1073149, ff06b48, a2344f4

### Slice 205: Consistency Checker & Build Template Fixes — Design & Tasks Complete
- Multi-plan scanning in `checkAll` (per-slice rules across all discovered plans, not just configured one)
- MCP `workflow_check` worktree parity (apply overlays like CLI does)
- `/cf:check` slash command
- `cf:build` template reordering (instruction prompt before tools section)
- Also: MCP `resolveProjectId` now accepts project names, removed stale bundled prompt message
- Commits: 11adfbf, c24fe63, 656534a, a49b1ee, efe3241

### Slice 192: Default Worktree Aggregation & Field Reset — Implementation Complete
- Default worktree now filters by its own index range (consistent with non-default worktrees)
- `--all` flag added to `cf arch list`, `cf plan list`, `cf tasks list`, `cf future` for cross-worktree aggregation
- MCP `project_structure` gains `all: boolean` parameter; `resolveOperationContext` returns range for default worktree
- New `resolveAllOperationPaths()` (CLI + MCP), `mergeProjectModels()` (core) utilities
- `cf unset <field>` command with required/readonly guards, alias support, worktree routing
- Also registered as `cf project unset <field>` subcommand
- All 1160 tests pass (665 core + 324 CLI + 171 MCP), build clean
- Commits: 2791f4e, 1f00cbd, 455c96b, e278fc5, 13f4947

### Slice 192: Default Worktree Aggregation & Field Reset — Design & Tasks Complete
- Two features: (1) `--all` flag for cross-worktree aggregation + default worktree scoped to its own range, (2) `cf unset <field>` command for explicit field clearing
- Design updated: `--all` opt-in instead of auto-aggregation, consistent behavior across all worktrees (all filter by own range)
- Aggregation uses new `resolveAllOperationPaths()` + `mergeProjectModels()` utilities
- Unset guards against required/readonly fields, works on project and worktree-scoped fields
- Also added update future work item to 200-slices (CLI & MCP Update Command)

### Slice 191: Worktree-Aware File Operations — Implementation Complete
- Two-part fix: (1) worktree path resolution via `resolveOperationPath()`, (2) index-range scoping via `getWorktreeIndexRange()` + `isInIndexRange()`
- CLI: 10 commands updated (arch, slice, tasks, plan, set, check, status, future, prompt + set out-of-range warning)
- MCP: 5 introspection tools gain `worktreeId` parameter (name or ID), `resolveOperationContext()` shared helper
- `check.ts`, `future.ts`, `prompt.ts` migrated from `resolveProjectId()` → `resolveProjectWorktree()`
- All 1135 tests pass (658 core + 309 CLI + 168 MCP), build clean
- Commits: 3214e5b, ed698c1, 087ec3b, 5bd9d84, ef79f8b

## 2026-03-18

### Slice 191: Worktree-Aware File Operations — Design & Tasks Complete
- Two-part fix: (1) path resolution using worktree filesystem path, (2) index-range scoping for non-default worktrees
- Scoping rules: default worktree shows everything, non-default shows only its index range, `cf set` with out-of-range index warns but allows
- 10 CLI commands, 5 MCP introspection tools, ConsistencyChecker
- MCP `worktreeId` accepts name or ID
- Task file: 12 sections, test-with pattern throughout
- Documents: slice design, task file, slice plan entry updated

### Slice 191: Worktree-Aware File Operations — Design Complete
- Discovered bug: `cf arch list`, `cf set arch`, `cf slice list`, `cf tasks list`, `cf plan list`, `cf check`, `cf status --worktrees`, `cf future`, `cf prompt list/get` all use `project.projectPath` for filesystem ops — invisible to worktree-specific documents
- MCP `project_structure` and introspection tools also affected (visualizer can't see worktree docs)
- Added slice 191 to 180 slice plan; created slice design at `user/slices/191-slice.worktree-aware-file-operations.md`
- Fix: apply `resolveOperationPath()` helper (extract from guides.ts pattern) to all 10 CLI commands + 5 MCP tools
- Core services need no signature changes — callers pass the right path
- ConsistencyChecker fix: override `projectPath` on worktree views before passing to checker

### fix(cli): respect STOP conditions in cf:build wrapper
- `cf build` for phase 2 with no architecture set caused agents to ignore STOP conditions in the instruction prompt
- Root cause: `build.md` wrapper said "immediately begin the work" which overrode STOP conditions buried later in the prompt
- Fix: changed wrapper to defer to instruction prompt; explicit STOP override language added
- Bumped to v0.6.10, tagged

### Investigation: Prompt File Resolution in Worktrees (Not a Bug)
- Reported: local edits to prompt file in a git worktree not picked up by `cf build`
- Root cause: all prompt resolution paths (`resolvePromptFilePath`, `ContextIntegrator.generateWithTemplateEngine`) use `project.projectPath` (main repo root), never `worktreeContext.worktreePath`
- This is by design — prompt files live in the ai-project-guide submodule, which is shared infrastructure owned by that project. Local edits to prompt files are against policy (see `feedback_prompt_files_readonly` memory)
- `worktreeId` is used for template variable injection (worktree name, index range), not path resolution
- Resolution: working as designed. If prompt changes are needed, they go through the guide project and `cf guide update`

### Slice 190: Worktree-Aware Guide Operations — Implementation Complete
- Core: `SyncResult` type, `SubmoduleStrategy.sync()`, `GuideManager.operationPath` + `syncWorktrees()`, `GuideDetector.checkSyncStatus()`
- CLI: replaced `getProjectPath()` with `getGuideContext()` using `resolveProjectWorktree()` — `cf guides info` and `cf guides update` now worktree-aware; `cf guides install` unchanged
- MCP: `guide_update` auto-syncs all registered worktrees after primary update; `guide_status` reports per-worktree sync state for submodule-based guides
- All 1223 tests pass, clean build across all packages
- **Verification fix:** Initial `sync()` used `git submodule update --init` which only syncs to the worktree's own index pointer (stale on different branches). Real fix: read target commit from main worktree via `git ls-tree HEAD`, `git fetch origin` in the guide dir, then `git checkout <commit>`
- Verified on migratory-world-server: version correctly moves from v0.13.12 → v0.13.17 after `cf guides update`
- Commits: d711586 (core), 4ad8961 (CLI), 05baf27 (MCP), fc220cd (test fix), c0ab0f7 (sync fix)

### Slice 190: Worktree-Aware Guide Operations — Design & Tasks
- Discovered bug: `cf guides update` only syncs submodule in main worktree; non-default worktrees get stale guide files while reporting correct version (git tag resolves from shared object store)
- Added slice 190 to 180 slice plan as feature slice 10
- Created `user/slices/190-slice.worktree-aware-guide-operations.md` — design covers CLI (worktree-scoped update via `resolveProjectWorktree`), MCP (auto-sync all worktrees), and core (`SubmoduleStrategy.sync()`, `GuideManager.syncWorktrees()`)
- Created `user/tasks/190-tasks.worktree-aware-guide-operations.md` — 13 tasks across core/CLI/MCP layers
- Key decisions: CLI updates current worktree only (least surprise); MCP auto-syncs all worktrees (project-level intent); sync uses `git submodule update --init` not `--remote`
- Commits: 601432a (slice design + plan update)

### Slice 179: Remove Bundled Prompt Asset — Complete
- Deleted `packages/core/assets/prompt.ai-project.system.md` (bundled fallback)
- `resolvePromptFilePath` now requires `projectPath` and throws when no guide installed
- Removed `default_project` from `ConfigKeys`, CLI `resolveProjectWorktree` (step 3), MCP `resolveProjectId` (step 2)
- Updated all MCP tool descriptions (20+ `.describe()` strings) to reference CWD resolution
- Updated `resolvePromptFileForTools` — errors instead of silent bundled fallback
- Removed `findByNameOrId` / `ConfigManager` imports from CLI `project.ts` / `project.ts` utils
- Updated `cf project list` active marker to use CWD match only (no `default_project`)
- All tests pass (658 core + 286 CLI + 165 MCP); build clean
- Commits: `c7b9f43` (asset+factory), `6e9b3ca` (MCP prompt tools), `2a79662` (ConfigKeys), `d503474` (CLI resolution), `d6c0a43` (MCP resolution+descriptions), `ed26d2d` (build fix)

### Slice 189: Worktree-Aware Prompt Context — Implementation Complete
- Extended `ContextData` with `worktreeName?`, `worktreeIndexStart?`, `worktreeIndexEnd?`
- Threaded `worktreeId` through `generateContextFromProject` → `mapProjectToEnhancedContext` with worktree lookup from `project.worktrees[]`
- Passed `worktreeId` from CLI `build` command and MCP `context_build`/`template_preview` handlers
- Added `{worktreeName}`, `{worktreeRange}`, `{worktreeIndexStart}`, `{worktreeIndexEnd}` aliases to `TemplateProcessor.createEnhancedData()`
- Phase 2 prompt template updated (PM-approved, applied externally) with flat `{{#if worktreeName}}...{{else}}...{{/if}}` conditional; nested conditionals not supported by single-pass regex engine
- Synced bundled prompt asset via guide update + copy; 1093 tests pass; build clean
- **Incident:** Prior Sonnet session directly modified both the bundled prompt asset and ai-project-guide submodule — both are forbidden. Required multiple reverts and guide reinstall. Prompt file changes must always be PM-approved and applied externally.
- Commits: 1e80347 (pipeline), d80c983 (MCP test fix), 30a8f9d (prompt sync), f328ee2/d5abf8c (reverts)

## 2026-03-17

### Slice 189: Worktree-Aware Prompt Context — Slice Design
- Created `user/slices/189-slice.worktree-aware-prompt-context.md`
- Problem: `cf build` from a worktree gives Phase 2 prompts with no worktree context — agent must discover index range, component name via MCP/filesystem scanning
- Design: inject worktree metadata (name, indexRange) into `ContextData` → `TemplateProcessor` aliases → conditional block in Phase 2 prompt template
- Data flow: `applyWorktreeOverlay` carries worktree identity → `ContextIntegrator` maps to `ContextData` → `TemplateProcessor` creates `{worktreeName}`, `{worktreeRange}`, `{worktreeIndexStart}` aliases
- Added slice 189 to 180 slice plan (reopened as in_progress)

### Slice 189: Worktree-Aware Prompt Context — Task Breakdown
- Created `user/tasks/189-tasks.worktree-aware-prompt-context.md` (6 sections)
- Sections: Extend ContextData + thread worktreeId → Template aliases → Phase 2 prompt conditional → Build/test → Verification walkthrough → Wrap-up

### Misc: MCP Client Compatibility & Onboarding Improvements
- Added `agent_guide` MCP tool (tool orientation for limited clients)
- Added `agent_onboard` MCP tool (onboarding recipe for non-Claude MCP clients)
- Added `serverInfo` field to `project_get` and `config_get` responses (version + hint)
- Merged `config_list` into `config_get` (key optional); removed `config_list` from MCP and CLI
- Reordered MCP tool registration for clients that truncate by registration order
- Added MCP JSON config block to README for Cursor/Perplexity/Windsurf
- Fixed `cf worktree init` not initializing submodules in new worktrees
- Updated README: onboarding workflow, smart init, 34 tools
- Tags: @context-forge/cli@0.6.6, @context-forge/mcp@0.6.6, @context-forge/core@0.6.6

## 2026-03-15

### Slice 204: Onboarding Skill — Implementation Complete (200-band complete)
- Created `packages/cli/commands/cf/onboard.md` — multi-step skill for AI-guided project onboarding
- Added `'onboard.md'` to `MANAGED_FILES` in `commandInstaller.ts`; 8 commands now installed (was 7)
- All 7 MCP tool references and CLI fallback commands verified against actual registrations
- 286 CLI tests pass (11 commandInstaller tests auto-cover new file via data-driven pattern); build clean
- Verification walkthrough: install/uninstall confirmed, slice design updated with actual results
- **This completes the 200-band developer onboarding initiative** (slices 201–204 all done)
- Commits:
  - `775ea38` feat(cli): add onboarding skill (onboard.md) for AI-guided project setup
  - `5690f07` feat(cli): register onboard.md in MANAGED_FILES for install/uninstall
  - `8c2d6e7` docs: update 204 slice design verification walkthrough with actual results

### Slice 204: Onboarding Skill — Task Breakdown
- Created `user/tasks/204-tasks.onboarding-skill.md` (6 sections, ~140 lines)
- Sections: Create skill file → Register in installer → Verify MCP references → Build/test → Verification walkthrough → Wrap-up
- Lightweight slice: one markdown file + one-line MANAGED_FILES registration; existing data-driven tests auto-cover the new file

### Slice 204: Onboarding Skill — Slice Design
- Created `user/slices/204-slice.onboarding-skill.md`
- Design: markdown skill file (`onboard.md`) installed via `cf install-commands`; MCP-first with CLI fallbacks
- Flow: detect existing project → create if needed → install guides → transition to Phase 1 concept discussion
- Deferred `buildNewProjectDefaults()` extraction to dedicated future slice after audit revealed 5 areas of CLI/MCP duplication (not just project defaults)
- Added future work item #6 to slice plan: CLI/MCP duplication extraction

### Slice 203: Enhanced cf next First-Run Guidance — Implementation Complete
- Added `isFirstRunState()`, `conceptDocExists()`, `detectFirstRunContext()` private methods to `WorkflowNavigator`
- FR-1 through FR-5 conditions implemented; FR-5 replaces existing "Set active slice" text with richer guidance
- Updated existing test `"recommends setting slice when no fileSlice but plan exists"` to match new FR-5 text; three other existing tests needed `developmentPhase` set to `'Phase 6: Implementation'` to bypass first-run logic
- 627 tests pass; build clean; smoke tests verified FR-2, FR-3, FR-4 via live CLI
- Commits:
  - `47fa921` feat(core): add first-run detection FR-1 and FR-2 to WorkflowNavigator

### Slice 203: Enhanced cf next First-Run Guidance — Task Breakdown
- Created `user/tasks/203-tasks.enhanced-cf-next-first-run-guidance.md` (6 sections, 180 lines)
- Sections: Setup → isFirstRunState helper → FR-1+FR-2 → FR-3+FR-4+FR-5 → build/verify → wrap-up
- Test-with pattern: each FR implementation task immediately followed by its tests; existing FR-5 test update flagged explicitly

### Slice 203: Enhanced cf next First-Run Guidance — Slice Design
- Created `user/slices/203-slice.enhanced-cf-next-first-run-guidance.md`
- Design: add `detectFirstRunContext()` + `isFirstRunState()` private methods to `WorkflowNavigator`; 5 first-run sub-conditions (FR-1: no phase, FR-2: Phase 1 no artifacts, FR-3: Phase 2 no arch, FR-4: Phase 3 no slice plan, FR-5: has plan no active slice)
- Each condition returns enriched `NextAction` with context and concrete `cf` command; standard recommendations unchanged for established projects
- No type changes, no CLI/MCP changes — purely additive logic in `WorkflowNavigator.ts`

### Slice 202: Post-merge fix — cf init project defaults
- `cf init` now sets `developmentPhase: 'Phase 1: Concept'` and `dateProject: YYYYMMDD` to match `project_create` MCP tool defaults
- Commits:
  - `a8f41ff` fix(cli): set developmentPhase and dateProject on cf init to match project_create defaults

### Slice 202: Smart cf init Composition — Implementation Complete
- Extracted `guidesInstallAction` from `guides.ts`, `setupIdeAction` from `setup-ide.ts`, added `installCommandsAction` wrapper in `commandInstaller.ts`
- Enhanced `cf init` with `--lite`, `--no-ide`, `--ide <target>` flags; detection phase (no .git → git init, already-registered → exit, worktree → suggest cf worktree init); step sequence with non-fatal warnings
- New CLAUDE.md backup strategy in `setupIdeAction`: 4-case logic (no file / managed marker / unmanaged + no .bak / unmanaged + .bak exists)
- 286 CLI tests pass (10 new init tests, 4 new setup-ide tests, 2 new guides tests, 2 new commandInstaller tests)
- Commits:
  - `e9b99c8` refactor(cli): extract guidesInstallAction from guides install handler
  - `f6b1750` refactor(cli): extract setupIdeAction with managed CLAUDE.md backup strategy
  - `4202d19` refactor(cli): add installCommandsAction wrapper to commandInstaller
  - `3e99ee5` feat(cli): enhance cf init with full onboarding sequence and detection
  - `01964ed` docs: complete slice 202 smart cf init composition
  - `51e5717` feat(cli): slice 202 — smart cf init composition (merge)

### Slice 202: Smart cf init Composition — Task Breakdown
- Created `user/tasks/202-tasks.smart-cf-init-composition.md` (7 sections, 172 lines)
- Sections: Setup → extract guidesInstallAction → extract setupIdeAction + backup logic → installCommandsAction wrapper → enhance cf init → build/verify → wrap-up
- Test-with pattern applied throughout; each extraction task immediately followed by its tests

### Slice 202: Smart cf init Composition — Slice Design
- Created `user/slices/202-slice.smart-cf-init-composition.md`
- Key design decisions: extract `guidesInstallAction` and `setupIdeAction` from inline handlers before composing in `cf init`; `installCommandsAction` is a thin wrapper over existing `installCommands()`; `cf init` becomes a sequencer with detection (git, existing project, worktree) and step-level output
- Non-interactive constraint: `--yes` flag passed to `setupIdeAction` when called from `cf init`
- `--lite` preserves current `cf init` behavior exactly for backwards compatibility

### Slice 201: project_create MCP Tool — Complete
- Added `project_create` tool to `registerProjectTools()` in `packages/mcp-server/src/tools/projectTools.ts`
- Thin wrapper over `FileProjectStore.create()` with name validation, path normalization, duplicate-path detection, and sensible defaults
- Response matches `project_get` shape: full `ProjectData` + optional introspection (graceful degradation)
- 6 new unit tests covering: success with all params, name-only defaults, duplicate path error, empty name error, introspection enrichment, introspection failure degradation
- 168 mcp-server tests, all packages pass
- Commits:
  - `5c1c529` feat(mcp-server): add project_create MCP tool

---

## 2026-03-14

Tags: v0.5.2

### cf check Rule 11: missing-arch-status
- Added `missing-arch-status` rule to `ConsistencyChecker` — flags arch files with no `status` frontmatter field
- Fix: infers status from paired slice plan (in-progress/complete) or `not_started` if unpaired
- 4 new tests (616 core total, all pass)
- Renamed `200-arch.event-driven-pipeline.md` → `220-arch.event-driven-pipeline.md`; index 200 reserved for new initiative

### Initiative 200: Developer Onboarding & First-Run Experience
- Architecture document created and refined (`200-arch.developer-onboarding.md`)
- Slice plan created (`200-slices.developer-onboarding.md`) — 4 slices: project_create MCP tool, smart cf init, enhanced cf next, onboarding skill
- Low-risk initiative — all composition over existing infrastructure

---

## 2026-03-12

Tags: v0.5.1

### Slice 188: Default Worktree Improvements — Complete
- **Rename**: Default worktree name `'Default'` → `'default'` (lowercase)
- **Range**: Default range `[0, 99]` → `[100, 799]` (working range instead of system range)
- **Dynamic chopping**: `chopDefaultRange` method automatically shrinks default's range when new worktrees claim overlapping sub-ranges (prefers lower contiguous block)
- **Collision detection**: Blocks range shrinking when default holds artifact references (archDoc, slicePlan, activeSlice, activeTaskFile) that would fall outside the new range
- **Surface updates**: CLI and MCP both surface `chopWarning` on add/update; updated migration message and tool descriptions
- **Tests**: 54 WorktreeService tests (12 new for chop/collision), 612 core total, all packages pass
- **Initiative 180 complete**: All 8 slices + integration slice delivered. Slice plan marked complete.
- Commits:
  - `87d8aaa` feat(core): improve default worktree name, range, and dynamic chopping
  - `ce6da81` docs: add slice 188 design, tasks, and planning artifacts

### Architecture: Event-Driven Pipeline (220-arch)
- Created concept architecture document for persistent MCP server with Streamable HTTP transport, state-change events, and server-initiated notifications
- Scope: daemon lifecycle, dual transport (stdio + HTTP), storage event emission, Squadron integration
- Status: concept (no slices yet)

---

## 2026-03-11

### Post-187 Polish & Fixes
- **cf check worktree fix**: consistency checker now runs across all worktree overlays so worktree-scoped fields (phase, slice, tasks, arch, plan) are visible — previously saw empty fields after worktree migration
- **cf worktree init CWD fix**: `resolveProjectWorktree` gains step 2b — if CWD is a git worktree of a known project but not yet registered as a cf worktree, auto-resolves to that project (no `--project` flag needed during `cf worktree init`)
- **cf tasks rename**: `cf task` → `cf tasks` for consistency with `cf set tasks`; `fileTasks` alias stays `tasks`
- **GitHub issue #42**: logged `createPrs` project field enhancement for future implementation
- **Tests**: 1139 total (600 core, 271 CLI, 106 electron, 162 MCP)
- Commits: `added39` `fix(cli): run cf check across all worktree overlays`, `7285237` `fix(cli): rename 'task' to 'tasks'`, `8798891` `fix(core): rename fileTasks alias`

### Slice 187: Validation, Edge Cases & Polish — Complete
- **What works**: Build clean, all tests pass (600 core, 269 CLI, 106 electron, 23 MCP worktree)
- **Delivered**: `cf worktree update` CLI, stale path detection in list commands, `stale-worktree-path` cf check rule, first-run worktree suggestion in cf status, MCP overlap detection on worktree_update
- **Initiative complete**: All 7 slices of the worktree initiative (180) delivered. Slice plan and arch marked complete.
- Commits:
  - `672e6c2` feat(core): add validateWorktreePaths to WorktreeService
  - `4072c9d` feat(cli): add cf worktree update command
  - `6f32ce3` feat: add stale worktree path detection to list commands
  - `b2872dc` feat(core): add stale-worktree-path rule to ConsistencyChecker
  - `10b8759` feat(cli): add first-run worktree suggestion in cf status
  - `b038fb1` feat(mcp): add overlap detection to worktree_update
  - `0816cfb` feat: complete slice 187 validation, edge cases & polish

### Slice 187: Validation, Edge Cases & Polish — Phase 5 (Task Breakdown)
- Created `187-tasks.validation-edge-cases-polish.md` — 16 tasks covering: type + service method, CLI update command, stale path detection (CLI + MCP), cf check rule, first-run messaging, MCP overlap detection, edge case verification
- Test-with ordering: each implementation task followed by its test task
- Commits:
  - `4f3f006` docs: add task breakdown for slice 187 validation, edge cases & polish

### Slice 187: Validation, Edge Cases & Polish — Design Complete
- Created `user/slices/187-slice.validation-edge-cases-polish.md`
- Scope: `cf worktree update` CLI command, stale path detection via `WorktreeService.validateWorktreePaths()`, `cf check` rule `stale-worktree-path`, first-run messaging in `cf status`, overlap detection on MCP `worktree_update`
- Key decisions: validation method on WorktreeService with injected `pathExists` for testability; `--range` option takes unquoted `start-end` string; stricter validation (effort bumped to 3/5)
- Commits:
  - `250e495` docs: add slice 187 design for validation, edge cases & polish

### Slice 186: MCP Worktree Tools — Complete
- 5 new CRUD tools: `worktree_list`, `worktree_get`, `worktree_init`, `worktree_update`, `worktree_rm`
- 4 extended tools with worktree params: `workflow_status`, `workflow_next`, `context_build`, `project_update`
- `applyWorktreeOverlay` moved from CLI to `@context-forge/core` (CLI re-exports)
- `project_update` field routing: worktree-scoped fields → `WorktreeService`, project fields → `store.update()`
- Build: clean, 520 tests pass (34 new MCP tests)
- Commits:
  - `c28b21c` refactor(core): move applyWorktreeOverlay from CLI to core
  - `0e93c90` feat(mcp): add worktree CRUD tools (list, get, init, update, rm)
  - `92fed29` test(mcp): add unit tests for worktree CRUD tools
  - `d51c378` feat(mcp): add worktreeId to workflow_status and workflow_next
  - `ad8d047` feat(mcp): add worktree param to context_build
  - `294612b` feat(mcp): add worktreeId field routing to project_update

### Slice 186: MCP Worktree Tools — Phase 5 (Task Breakdown) ✓
- Created `186-tasks.mcp-worktree-tools.md` — 16 tasks covering CRUD tools, extended tools, overlay extraction, and tests
- Test-with ordering: each implementation task immediately followed by its test task
- `applyWorktreeOverlay` move from CLI→core scoped as task 1 (shared dependency)

### Maintenance: MCP prompt fallback fix
- `prompt_list`/`prompt_get` now fall back to bundled prompts when no `default_project` configured
- Exported `resolvePromptFilePath` from `@context-forge/core/node`; added `resolvePromptFileForTools` helper in MCP
- Commit: `191fde6` fix(mcp): prompt_list and prompt_get fall back to bundled prompts when no project resolved

### Slice 186: MCP Worktree Tools — Phase 4 (Slice Design) ✓
- Designed 5 new CRUD tools (`worktree_init/list/get/update/rm`) wrapping `WorktreeService`
- Extended 4 existing tools with optional `worktreeId`: `workflow_status`, `workflow_next`, `context_build`, `project_update`
- Field routing in `project_update` mirrors CLI `cf set` behavior (workflow fields → worktree, project fields → project)
- `applyWorktreeOverlay` to be moved from CLI to core for shared use
- Commits:
  - `9945d5c` docs: mark slice 185 complete (delivered in 182-184)
  - `9b0b9a7` docs: add slice design for 186 MCP Worktree Tools

### Slice 185: Worktree-Aware Context Assembly — Marked Complete
- Core functionality delivered in slices 182-184 (`applyWorktreeOverlay` in `cf build`)
- MCP `context_build` worktree param deferred to slice 186
- `--worktree` flag on build deferred pending global `--worktree` across all commands

### Slice 184: Status & Display Updates — Phase 6 (Implementation) ✓
- Extracted `applyWorktreeOverlay` to shared utility (`packages/cli/src/utils/worktree-overlay.ts`), replaced 8 inline copies
- `cf status` shows dedicated `Worktree:` line with name and index range when resolved from worktree
- `--worktree <name|id>` flag on `cf status` for cross-directory worktree status
- `--worktrees` flag on `cf status` for dashboard view of all worktrees with phase/slice/progress
- `--json` output includes full `WorktreeContext` object (not just name string)
- `--worktrees --json` outputs array of worktree summaries
- Mutual exclusion check for `--worktree` and `--worktrees`
- 257 CLI tests pass (16 new), full build clean
- Commits:
  - `70b22c9` refactor(cli): extract applyWorktreeOverlay to shared utility
  - `49d80d6` refactor(cli): replace 8 inline applyWorktreeOverlay copies with shared import
  - `1fb7bc8` test(cli): add unit tests for shared applyWorktreeOverlay
  - `84bc7ae` feat(cli): add Worktree display line to cf status
  - `09142a5` test(cli): add Worktree line display tests
  - `e0eacf3` feat(cli): add --worktree flag to cf status
  - `5559bd4` test(cli): add --worktree flag tests for cf status
  - `ee38700` feat(cli): add --worktrees dashboard flag to cf status
  - `d90a0db` test(cli): add --worktrees dashboard tests

### Slice 183: Worktree CLI Commands — Phase 6 (Implementation) ✓
- `cf worktree init/list/rm` command group in `packages/cli/src/commands/worktree.ts`
- `resolveProjectWorktree` refactored to options-object `({ project?, worktree? }, store)` — backwards-compatible via `resolveProjectId` wrapper
- `findWorktreeByNameOrId` utility (exact ID first, then case-insensitive name)
- `askConfirmation` extracted to shared `utils/confirm.ts`
- Worktree-aware `projectSetAction`: `WORKTREE_SCOPED_FIELDS` set routes `fileSlice→activeSlice`, `fileArch→archDoc` etc. to `WorktreeService.updateWorktree`; auto-set logic (phase→instruction, arch→plan, slice→tasks) also targets worktree context
- Worktree-aware `projectGetAction`: worktree header + field overlay from `WorktreeContext`, `--project-level` flag escapes
- `--project-level` flag on `cf set`, `cf get`, `cf project set`, `cf project get`
- `GitWorktreeDiscovery` and `WorktreeService` exported from `@context-forge/core/node`
- 1039 tests pass across all packages (0 regressions); 35 new tests (21 worktree commands + 14 worktree set/get)
- Commits:
  - `48dc80a` refactor(cli): options-object signature for resolveProjectWorktree, add findWorktreeByNameOrId
  - `2aa39c4` refactor(cli): extract askConfirmation to shared utils/confirm.ts
  - `e3ea169` feat(cli): add cf worktree init/list/rm commands and register in CLI
  - `d6a026b` test(cli): add unit tests for cf worktree init/list/rm commands
  - `480b0cb` feat(cli): worktree-aware projectSetAction and projectGetAction with --project-level flag
  - `f7a6b55` test(cli): add worktree-aware projectSetAction and projectGetAction tests

### Slice 181: WorktreeContext Data Model & Storage — Phase 6 (Implementation) ✓
- `WorktreeContext`, `CreateWorktreeInput`, `UpdateWorktreeInput`, `IndexRangeOverlap` types in `worktree.ts`
- `ProjectData.worktrees?: WorktreeContext[]` extension with `UpdateProjectData` support
- `WorktreeService` with CRUD, forward/reverse migration, index range overlap detection
- Forward migration creates "Default" worktree from existing workflow fields on first `addWorktree`
- Reverse migration restores fields to project on last `removeWorktree`, sets `worktrees: undefined`
- Both migrations atomic (single `store.update()` call)
- `migrateProjectFields()` updated to preserve `worktrees` array
- 36 unit tests, 578 total tests pass (0 regressions)
- Commits:
  - `7c1aefd` feat(core): add WorktreeContext types and extend ProjectData
  - `752d4a3` feat(core): add WorktreeService with CRUD operations
  - `02e05b1` test(core): add WorktreeService CRUD tests
  - `33a856a` feat(core): add forward and reverse migration to WorktreeService
  - `ef9969a` test(core): add forward/reverse migration and atomicity tests
  - `7c66e10` feat(core): add index range overlap detection to WorktreeService
  - `4ea224a` feat(core): preserve worktrees field in migrateProjectFields

## 2026-03-10

### Slice 183: Worktree CLI Commands — Phase 4 (Slice Design)
- Created slice design `183-slice.worktree-cli-commands.md`
- Key decisions: options-object signature for `resolveProjectWorktree({ project?, worktree? }, store)`, narrow `--worktree` flag scope (worktree subcommands only), git path validation warns when git unavailable / hard-errors when path not in known list, `--project-level` escape hatch on `cf set`/`cf get`
- `cf worktree list` table format follows `cf project list` exactly (same `renderTable`, `success()`, `'* '` prefix pattern)
- `WORKTREE_SCOPED_FIELDS` set drives routing in `projectSetAction`; auto-set logic targets whichever context is active

### Slice 182: Worktree Discovery & CWD Resolution — Phase 6 (Implementation) ✓
- `GitWorktreeDiscovery` service in `packages/core/src/git/` — parses `git worktree list --porcelain` into `WorktreeInfo[]`
- `WorktreeInfo` type; extended `findProjectByCwd` → `CwdMatch | null` with worktree path matching
- `resolveProjectWorktree()` — worktree-aware resolution returning optional `worktreeId`; `resolveProjectId` refactored as backwards-compatible wrapper
- `ResolutionSource` extended with `'worktree'`; fixed real-world edge case: `prunable <reason>` not just `prunable`
- 996 tests pass across all packages (0 regressions)
- Commits: `1413fcb` feat(core): add GitWorktreeDiscovery service and WorktreeInfo type · `3083fff` feat(cli): extend CWD resolution to be worktree-aware

### Slice 181: WorktreeContext Data Model & Storage — Phase 5 (Task Breakdown)
- Created `181-tasks.worktreecontext-data-model-storage.md` (8 tasks, 264 lines)
- Tasks: types → CRUD → CRUD tests → migration → migration tests → overlap detection → migrateProjectFields update → final verification
- Test-with pattern: test tasks follow implementation tasks (3 after 2, 5 after 4, 6.3 after 6.1-6.2)

### Slice 181: WorktreeContext Data Model & Storage — Phase 4 (Slice Design)
- Created slice design `181-slice.worktreecontext-data-model-storage.md`
- Key decision: `WorktreeService` in `packages/core/src/services/` owns CRUD + migration logic (keeps `FileProjectStore` as pure serialization layer)
- Types: `WorktreeContext`, `CreateWorktreeInput`, `UpdateWorktreeInput`, `IndexRangeOverlap` in `packages/core/src/types/worktree.ts`
- Forward migration creates "default" worktree context from existing workflow fields; reverse migration restores them
- `fileConcept` already covers project-level concept doc reference — no new field needed
- Verification walkthrough covers CRUD, forward/reverse migration, backwards compatibility, overlap detection
- Updated slice plan status to `in_progress`

## 2026-03-09

### Initiative 180: Initiative Contexts (Worktrees) — Phase 3 (Slice Planning)
- Created slice plan `180-slices.initiative-context-worktree.md` (7 slices, 181-187)
- Foundation: WorktreeContext data model & storage (nested on ProjectData)
- Features: worktree discovery & CWD resolution, `cf worktree` CLI commands, status/display updates, worktree-aware context assembly, MCP worktree tools
- Integration: validation, edge cases & polish
- Naming decision: "worktree" as user-facing term (avoids overloading "context" and "initiative")
- MCP included (slice 186) for context-visualizer support, despite architecture doc deferral
- Commits:
  - `bff4d17` docs: add slice plan for initiative contexts (worktrees)

### Slice 178: Consistency Checker All-Slices Mode — Phase 6 (Implementation) ✓
- `checkAll()`/`fixAll()` methods iterate all slice plan entries with `[sliceIndex]` prefix attribution
- Extracted `checkSlice()` shared logic; extracted `applyFixes()` shared by `fix()`/`fixAll()`
- 3 new rules: duplicate-index (R6), plan-status-vs-entries (R7), arch-status-vs-plans (R8)
- CLI: `--slice <index>` narrows, `--yes` skips confirmation, grouped output by slice
- MCP: `sliceIndex` optional param, defaults to all-slices, no confirmation prompt
- 11 new core tests, 1 new CLI confirmation prompt test, 2 new MCP routing tests
- Commits:
  - `3908e21` feat(core): add checkAll() method and extract checkSlice() shared logic
  - `a424a02` feat(core): add rules 6-8 for duplicate index, plan status, arch status
  - `a933941` feat(core): add fixAll() method and extract shared applyFixes() logic
  - `8503d17` feat(cli): add --slice and --yes flags, all-slices default for cf check
  - `928fa2a` feat(mcp): add sliceIndex param to workflow_check, default to all-slices
  - `7300922` test(core): add unit tests for checkAll, fixAll, and rules 6-8
  - `f3749c4` test(cli): add confirmation prompt test for cf check --fix

### Slice 178: Consistency Checker All-Slices Mode — Phase 5 (Task Breakdown)
- Created `178-tasks.consistency-checker-all-slices-mode.md` (8 tasks)
- Tasks: checkAll method + refactor, 3 new rules, fixAll, CLI flags + confirmation, MCP sliceIndex, core tests, CLI tests, verification

### Slice 178: Consistency Checker All-Slices Mode — Phase 4 (Slice Design)
- Designed all-slices iteration for `ConsistencyChecker` (`checkAll`/`fixAll` methods)
- 3 new rules: duplicate index detection, plan status vs entries-complete, arch status vs plans-complete
- Safety: single-pass (no cascading), CLI `y/N` confirmation for fix-all, `--slice` flag to narrow scope
- CLI default switches to all-slices; MCP adds optional `sliceIndex` parameter

### Release v0.4.0
- Minor version bump: @context-forge/core, @context-forge/cli, @context-forge/mcp all → 0.4.0
- Key additions: `cf setup-ide claude`, context-profile-aware assembly, `fileConcept` field, slash command fixes
- Tags: @context-forge/core@0.4.0, @context-forge/cli@0.4.0, @context-forge/mcp@0.4.0

## 2026-03-08

### Slice 177: IDE Setup Command — Phase 6 (Implementation) ✓
- `cf setup-ide claude` command: project resolution, guide detection, CLAUDE.md backup + y/N prompt, script invocation via `execFileSync`
- 6 unit tests covering invalid target, guides not installed, script not found, no CLAUDE.md, --yes backup, non-zero exit
- Smoke tested end-to-end: backup created, script ran successfully
- Commits:
  - `6154b52` feat(cli): add cf setup-ide command
  - `0321b77` test(cli): add unit tests for cf setup-ide command

### Slice 177: IDE Setup Command — Phase 5 (Task Breakdown)
- Created `177-tasks.ide-setup-command.md` (6 tasks, 175 lines)
- Tasks: command skeleton + registration, project/guide resolution, CLAUDE.md safety checks, script invocation, unit tests, build verification

### Slice 177: IDE Setup Command — Phase 4 (Slice Design)
- Designed `cf setup-ide claude` CLI command wrapping ai-project-guide's `setup-ide` script
- Safety guardrails: detects existing `CLAUDE.md`, prompts y/N, creates `.bak` before overwrite
- Added slice plan entry (177) in 160-slices, renumbered future work to 178-179
- Positional target argument (`cf setup-ide claude`) for future IDE extensibility

### Slice 176: Context-Profile-Aware Assembly — Phase 6 (Implementation) ✓
- `fileConcept` field added to `ProjectData`, `ContextData`, `projectSchema`, `ContextIntegrator`, `TemplateProcessor`, and MCP `project_update`
- `ContextProfileParser` new service: parses `yaml type: context-profiles` block from prompt asset; normalises instruction strings (phase names, "Maintenance Task", etc.); falls back to `_default`
- Context profiles YAML block added to `packages/core/assets/prompt.ai-project.system.md` (10 profiles)
- Profile-aware filtering in `ContextIntegrator.mapProjectToEnhancedContext()`: zeros artifact fields not in active profile; skips if profiles absent (safe fallback); injected `readFileFn` preserves browser-safety
- `cf build --instruction-type <type>` / `--it <type>` flag: overrides instruction for profile lookup without persisting
- `context_build` MCP tool: `instructionType` param maps to `instruction` override, takes precedence over `instruction`
- 529 core tests, 157 CLI tests, 122 MCP tests — all passing
- Commits:
  - `4e3628c` feat(core): add fileConcept field to types, schema, integrator, and MCP update tool
  - `dce96a0` feat(core): add context-profiles YAML block and ContextProfileParser service
  - `b6b9456` feat(core): add profile-aware artifact filtering to ContextIntegrator
  - `b37647e` feat(cli): add --instruction-type / --it flag to cf build
  - `5c7aa18` feat(mcp): add instructionType param to context_build and fileConcept to project_update

### Slice 176: Context-Profile-Aware Assembly — Phase 5 (Task Breakdown)
- Created `176-tasks.context-profile-aware-assembly-update.md` (15 tasks, 150 lines)
- Tasks cover: `fileConcept` type/schema/pipeline wiring, `ContextProfileParser` new service + tests, profile filtering in `ContextIntegrator` + tests, `--instruction-type` CLI flag + tests, `instructionType` MCP param + tests, full build/smoke validation

### Slice 176: Context-Profile-Aware Assembly — Phase 4 (Slice Design)
- Created `176-slice.context-profile-aware-assembly-update.md`
- Design: context profiles YAML block in prompt asset; `ContextProfileParser`; `fileConcept` field; profile-filtered variable injection; `--instruction-type` CLI flag; `instructionType` MCP parameter
- Also: schema field ordering (spec→hld→arch→plan→slice→tasks), auto-set fileSlicePlan on fileArch change, cf next arch-not-found check
- Commits: `5d16bdb` docs: add slice 176 design, `f8c12b2` feat: schema ordering + auto-set plan on arch + cf next arch check, `3ba6ef9` fix(core): null-safety in arch file existence check

## 2026-03-07

### v0.3.6 — Maintenance
- Guide install creates user directories (`user/`, `architecture/`, `slices/`, `tasks/`, `project-guides/`)
- `cf next` recommends architecture before slice plan when neither exists
- Electron date picker normalizes YYYYMMDD → YYYY-MM-DD
- Removed obsolete `900-tasks.test-infrastructure-deferred.md`, cleaned up maintenance file
- Tags: @context-forge/core@0.3.6, @context-forge/cli@0.3.6, @context-forge/mcp@0.3.6
- Commits:
  - `3507628` chore: remove obsolete test infrastructure tasks, clean up maintenance file
  - `13abc2b` feat(core): create user artifact directories on guide install
  - `7a472b3` fix(electron): normalize YYYYMMDD dates for HTML date input
  - `50a9dbb` fix(core): cf next recommends architecture before slice plan

### v0.3.5 — Slice 166: Consistency Checker
- `ConsistencyChecker` core service with 5 detection rules (added Rule 5: task-file-status after initial release)
- Rule 5 catches task file frontmatter status drift (e.g., `status: in_progress` when all tasks complete)
- `MarkdownWriter` utility for non-destructive write-back (checkbox toggling + frontmatter field updates)
- Fix mode with `FixLogEntry` before/after tracing for each applied correction
- `workflow.auto_fix` config key, `workflow_check` MCP tool (25 total), `cf check` CLI command
- 506 core tests, 119 MCP tests, 154 CLI tests — all passing
- Commits:
  - `8b748ed` feat(core): add consistency checker types and workflow.auto_fix config key
  - `d66abc9` feat(core): add MarkdownWriter utility for checkbox and frontmatter updates
  - `55335ee` feat(core): add ConsistencyChecker with 4 detection rules
  - `134b1e9` test(core): add fix mode tests for ConsistencyChecker
  - `4ba79b4` feat(mcp): add workflow_check tool for consistency checking
  - `b030219` feat(cli): replace cf check stub with consistency checker implementation
  - `46148fb` feat(core): add Rule 5 — task file frontmatter status vs computed completion
  - `b97156d` style(cli): clarify --project help text accepts name or ID
  - `1b29836` fix(cli): cf:prompt slash command correctly routes get vs list subcommands
- Tags: @context-forge/core@0.3.5, @context-forge/cli@0.3.5, @context-forge/mcp@0.3.5

### Post-165: Workflow fixes, discovery commands, and UX enhancements
- Fix artifact path resolution: added `resolveArtifactPath()` — stems now correctly resolve to full paths with directory prefix and `.md`
- Fixed `slicePlan` being null in `WorkflowNavigator`, `ArtifactIntrospector`, and `cf slice list`
- Smart index resolution: `cf set slice 166` derives filename from slice plan when no file exists on disk (`deriveArtifactStem`)
- Auto-set `fileTasks` derives from slice name even when task file doesn't exist yet (CLI + MCP)
- Discovery commands: `cf arch list`, `cf plan list`, `cf slice list`, `cf task list`, `cf task items`
- `cf status` now shows Date, Arch, and Plan fields
- Slash command optimization: `cf:build` and `cf:prompt get` internalize context instead of echoing (~800 tokens saved)
- READMEs updated with discovery commands, smart index resolution, changelog
- 847 tests (475 core, 151 CLI, 115 MCP, 106 Electron)
- Tags: @context-forge/core@0.3.4, @context-forge/cli@0.3.4, @context-forge/mcp@0.3.4
- Commits:
  - `8d67963` fix: resolve artifact paths correctly, enhance status and task commands
  - `042b364` feat(cli): derive artifact stem from slice plan when file doesn't exist
  - `3772464` feat(cli): restructure task commands, add cf plan list
  - `2f5e276` docs: update READMEs with discovery commands and smart index resolution
  - `d3f2ff5` style(cli): optimize slash command prompts for token efficiency

### Slice 165: Workflow Navigator & Discovery — Implementation Complete
- `WorkflowNavigator` core service: `getStatus()` derives slice status from filesystem, `getNext()` priority-ordered state machine with 7 levels
- Core types: `SliceStatus`, `WorkflowStatus`, `NextAction` in introspection/types.ts
- MCP tools: `workflow_status`, `workflow_next` (24 total MCP tools)
- CLI discovery: `cf slice list` (plan entries with active/next markers), `cf task list` (items with progress), `cf arch list` (initiatives with progress)
- Auto-set `fileTasks` on `fileSlice` change (CLI + MCP, best-effort, one-way)
- `cf status` and `cf next` now use WorkflowNavigator (removed provisional `deriveRecommendation`)
- `cf next` shows `suggestedCommand` when available
- Config key `workflow.auto_advance` registered (behavior deferred)
- 846 tests (475 core, 150 CLI, 115 MCP, 106 Electron)
- Commits:
  - `01248d4` feat(core): add SliceStatus, WorkflowStatus, NextAction types
  - `665f163` feat(core): add WorkflowNavigator.getStatus() with tests
  - `5c2e42c` feat(core): add WorkflowNavigator.getNext() with tests
  - `fa634b9` feat(cli): auto-set fileTasks when fileSlice changes
  - `4126c40` feat(mcp): auto-set fileTasks when fileSlice changes in project_update
  - `8264498` feat(cli): add cf slice list command
  - `a03ddbf` feat(cli): add cf task list command
  - `7dff90a` feat(cli): add cf arch list command
  - `9e1fe35` feat(mcp): add workflow_status and workflow_next MCP tools
  - `f8c370c` refactor(cli): replace provisional deriveRecommendation with WorkflowNavigator

## 2026-03-06

### Slice 175: Context Output Consolidation — Implementation Complete
- Artifact fields (`fileArch`, `fileSlicePlan`, `fileHLD`, `fileSpec`) added to ContextData, mapped through pipeline, with template aliases (`arch`, `plan`, `hld`, `spec`) and index extraction (`archIndex`, `planIndex`, `hldIndex`)
- Consolidated `### Project Context` section with clean key-value format, conditional artifact lines
- Unified opening statement (`project-statement`) — no more start/continue branching
- Phase→instruction auto-set: `cf set phase 6` also updates `instruction` (CLI + MCP)
- Template conditionals: support `{{#if var}}content{{/if}}` without requiring `{{else}}`
- Phase resolution in `cf build --phase`: accepts P1-P7 shorthands, numbers, short names; warns on unrecognized values
- Instruction matcher (`getPromptForInstruction`) handles full phase strings like `Phase 5: Task Breakdown`
- README overhaul: root (screenshots, structure), CLI (git-like model, slash commands section), core, MCP
- Updated ai-project-guide to v0.13.3
- 801 tests (451 core, 135 CLI, 109 MCP, 106 Electron)
- Tags: @context-forge/core@0.3.2, @context-forge/cli@0.3.2, @context-forge/mcp@0.3.2
- Commits:
  - `469d22c` docs: add slice 175 design
  - `61c2ef2` docs: add task breakdown
  - `ec3967c` feat(core): add artifact fields to ContextData and ContextIntegrator
  - `e66b318` feat(core): add artifact variables and index extraction to TemplateProcessor
  - `d3b9261` feat(core): consolidate project info section in SectionBuilder
  - `b7986fe` feat(core): simplify opening statement to unified project-statement
  - `eb3dbe7` feat(cli,mcp): auto-set instruction when developmentPhase changes
  - `c595dc4` fix(cli): update shortcuts test for phase→instruction auto-set
  - `1e57417` docs: update READMEs for slice 175 changes
  - `a4044f3` package: bump core, cli, mcp to 0.3.1; update READMEs and add assets
  - `0111087` docs: update ai-project-guide to v0.13.3
  - `cc059f9` fix(core,cli): phase resolution, instruction matching, and template conditionals

### Slice 174: Claude Code Commands — Implementation Complete
- Seven slash commands: `/cf:status`, `/cf:build`, `/cf:next`, `/cf:prompt`, `/cf:get`, `/cf:set`, `/cf:project`
- `cf install-commands` / `cf uninstall-commands` with `--target` override
- Commands instruct Claude to present output without commentary
- Improved `cf project --schema` readability (unified table, alias column, enum values at bottom)
- 776 tests total (430 core, 133 CLI, 107 MCP, 106 Electron)
- Commits:
  - `bd8b4fd` feat(cli): add Claude Code slash command files for cf wrapper
  - `27b0d8b` feat(cli): add install-commands and uninstall-commands for Claude Code
  - `9c8ecc1` test(cli): add install/uninstall command tests
  - `4c2a517` fix(cli): cf:prompt command routes get/list subcommands correctly
  - `229a30b` style(cli): slash commands present output without commentary
  - `4769202` feat(cli): add cf:get, cf:set, cf:project slash commands
  - `6818eb2` style(cli): improve cf project --schema readability

### Slice 173: Smart Field Setting — Implementation Complete
- customData sub-fields (`events`, `notes`, `tools`) settable via `cf set` with merge semantics
- Schema-driven `Custom` group in `cf get`, `cf set --help`, `cf project --schema`
- Index-based file resolution: `cf set slice 171` scans `project-documents/user/slices/` for matching file
- `resolveFileByIndex` helper in core for all artifact fields (fileSlice, fileTasks, fileArch, fileSlicePlan, fileHLD, fileSpec)
- 767 tests total (430 core, 124 CLI, 107 MCP, 106 Electron)
- Commits:
  - `87eacb3` fix(cli): cf build --phase now overrides instruction prompt
  - `6cebac4` feat(core): add customData sub-fields to project schema
  - `02451f0` feat(cli): settable customData fields via cf set events/notes/tools
  - `ebdb601` feat(core): add resolveFileByIndex for index-based artifact file resolution
  - `871139e` feat(cli): index-based file resolution for cf set artifact fields

### CLI: Top-level `cf set` / `cf get` shortcuts
- Added `cf set <field> <value>` as shortcut for `cf project set` — e.g. `cf set phase 4`
- Added `cf get` as shortcut for `cf project get`
- Extracted shared action handlers (`projectSetAction`, `projectGetAction`) from project command
- 5 new tests (115 CLI total)
- Tags: @context-forge/core@0.2.3, @context-forge/mcp@0.2.3, @context-forge/cli@0.2.3

## 2026-03-05

### Slice 172: Guide Management — Implementation Complete
- Core: `GuideDetector`, `GuideManager`, three strategies (SubmoduleStrategy, CloneStrategy, TarballStrategy) in `packages/core/src/guides/`
- Git helper (`gitExec.ts`) with safe `execFile` wrapper, `isGitAvailable`, `isGitRepo`
- MCP: `guide_status`, `guide_install`, `guide_update` tools (22 total)
- CLI: `cf guides` with `info` (default), `install`, `update` subcommands
- 735 tests passing (412 core + 110 CLI + 107 MCP + 106 Electron)
- Implementation commits:
  - `64b47dd` feat(core): add guide management types and strategy interface
  - `1757f1f` feat(core): add git execution helper for guide management
  - `c4991ec` feat(core): add GuideDetector for installation state detection
  - `48b6d3c` feat(core): add SubmoduleStrategy for guide installation
  - `d5ed014` feat(core): add CloneStrategy for guide installation
  - `71a3b7d` feat(core): add TarballStrategy for guide installation
  - `a581add` feat(core): add GuideManager orchestration layer
  - `d6b712f` feat(core): export guide management module
  - `8252fe8` feat(mcp): add guide_status, guide_install, guide_update tools
  - `a66689a` fix(mcp): update server lifecycle test for 22 tools
  - `ce690e0` feat(cli): add cf guides command for guide lifecycle management

### Slice 172: Guide Management — Design & Task Breakdown Complete
- Slice design for guide install/update/status lifecycle management
- Strategy pattern: submodule (default), clone, tarball for installation methods
- MCP tools: `guide_install`, `guide_status`, `guide_update`; CLI: `cf guides`
- Core module: `GuideManager`, `GuideDetector`, strategy implementations in `packages/core/src/guides/`
- Consumes existing config keys (`guide.source`, `guide.git_strategy`) and bundled prompt fallback
- Fixed 780-slices references (was incorrectly pointing to slice 171)
- Task breakdown: 12 tasks, 262 lines, test-with pattern throughout
- Commits:
  - `46ed877` docs: add slice 172 guide management design
  - `24647c3` docs: add task breakdown for slice 172 guide management

### Slice 171: Project Schema Visibility & Smart Field Setting — Implementation Complete
- Core schema module (`packages/core/src/schema/projectSchema.ts`): field metadata, aliases, phase maps, resolution helpers as single source of truth
- CLI: smart `cf project set` with aliases/phase resolution, grouped `cf project get`, `cf project --schema`, `cf project rm`
- MCP: `project_schema` tool (19 total tools)
- Electron: `fs.watch` on `projects.json` with debounced IPC refresh
- 672 tests passing (366 core + 100 CLI + 100 MCP + 106 Electron)
- Commits:
  - `83a196f` feat(core): add project schema definition module with field metadata and resolution helpers
  - `5fe901e` test(core): add unit tests for project schema module
  - `9cc1666` feat(cli): smart project set with aliases, phase resolution, and validation
  - `b929323` test(cli): add tests for smart project set with aliases and phase resolution
  - `5d2f89b` feat(cli): grouped project get display with artifact field visibility
  - `05dfd18` feat(cli): add cf project --schema for schema introspection
  - `aba1f74` feat(mcp): add project_schema tool for schema introspection
  - `1bacf96` feat(cli): add cf project rm command
  - `d306838` feat(electron): auto-refresh project list on external projects.json changes
  - `a24d1ed` fix(mcp): update server lifecycle test for 19 tools
  - `5f7e301` fix(cli): accept positional name/ID argument for cf project rm
  - `c1bfb3f` fix(cli): show help when cf project is run with no arguments
  - `1cbe989` fix(cli): show concise usage hint for cf project, full help via --help

### Slice 170: Project Model Cleanup & CLI Init — Complete
- Removed `isMonorepo`, `isMonorepoEnabled`, `monorepoNote` from entire stack (types, 5 core services, MCP schemas, CLI, 6 Electron files, 21 test files)
- Added `cf init` command (registers CWD as project, derives name from basename, --name override)
- Added `default_project` deprecation warning to stderr when resolution falls through to config
- Added `server_version` MCP tool (returns name + version as JSON)
- Migration strips legacy monorepo fields on read; TypeScript compiler caught all consumers
- 632 tests passing across all packages (346 core + 84 CLI + 97 MCP + 105 Electron)
- Commits:
  - `88d9364` refactor(core): remove monorepo fields from types, services, and tests
  - `2ca41c2` refactor(mcp): remove monorepo fields from schemas and tests
  - `c4264cf` feat(mcp): add server_version tool
  - `770b464` refactor(cli): remove monorepo fields from project command and tests
  - `9c2071d` feat(cli): add cf init command
  - `dde2306` feat(cli): add deprecation warning for default_project config
  - `a9e2512` refactor(electron): remove monorepo fields from UI, IPC, and tests
  - `0b92955` fix: clean up stale monorepo references in fixtures and comments

## 2026-03-04

### Maintenance: Version Tagging & Dynamic Reads
- CLI and MCP server now read version from `package.json` via `createRequire` — no more hardcoded strings
- Fixed MCP server version drift (hardcoded 0.1.0 vs package.json 0.1.1)
- Established git tagging convention: `@scope/pkg@version` (monorepo standard)
- Added `Tags:` line to DEVLOG format
- Tags: `@context-forge/cli@0.2.1`
- Commits:
  - `10be0e5` fix: read version from package.json instead of hardcoded strings
  - `567f292` docs: add git tags and DEVLOG tagging convention
  - `c597a2d` package(cli): bump version to 0.2.1

### Slice 169: Multi-Project & UX Polish — Phase 6 (Implementation) Complete
- 10 tasks, all complete. 80 tests (18 new + 62 original), all passing.
- `findByNameOrId` + `findProjectByCwd` utilities in `packages/cli/src/utils/project.ts`
- Three-step `resolveProjectId` chain: flag → CWD → default, returns `{ id, source: ResolutionSource }`
- `cf status` shows resolution indicator: `(from CWD)`, `(default)`, `(--project flag)`
- `cf project list` compact format: Name/Path/Slice/Default with `●` indicator, `~` path shortening
- Output presentation matching orchestration CLI: borderless tables (bold cyan headers, `─` underline), aligned config list, colored help (yellow commands, cyan options, bold titles)
- Removed `cli-table3` dependency — replaced with custom chalk-based table renderer
- Version bump 0.1.0 → 0.2.0 with changelog in README
- Tags: `@context-forge/cli@0.2.0`, `@context-forge/core@0.1.1`, `@context-forge/mcp@0.1.1`
- Commits:
  - `178bd40` feat(cli): add findByNameOrId and findProjectByCwd utilities
  - `c7fd2eb` feat(cli): three-step project resolution chain with source tracking
  - `6d1fe48` feat(cli): show resolution source in cf status
  - `b20969b` feat(cli): name-based project resolution
  - `b30e2e9` feat(cli): compact cf project list with default indicator
  - `e1f1848` style(cli): tighten output formatting across commands
  - `81bb13f` docs(cli): version 0.2.0 changelog and README updates
  - `55d78bd` fix(cli): update hardcoded version string to 0.2.0
  - `64e18f6` style(cli): match orchestration output style — borderless tables, colored help

### Slice 169: Multi-Project & UX Polish — Phase 5 (Task Breakdown)
- 9 tasks across CWD detection, name-based resolution, resolution indicators, output formatting, and version bump

### Slice 168: CLI Foundation — Phase 6 (Implementation) Complete
- `packages/cli` fully implemented: 8 commands (status, next, build, config, project, future, check stub, prompt)
- 62 tests (58 unit + 4 integration), all passing
- `cf status` and `cf next` use ArtifactIntrospector (provisional — full WorkflowNavigator depends on slice 165)
- `cf build` uses same `createContextPipeline` as MCP server — output parity verified
- `cf prompt get` with runtime phase shorthand parser (P1–P7), variable substitution, `--raw` flag
- `cf check` stubbed pending slice 166 (Consistency Checker)
- Commits:
  - `e5a46e7` feat(cli): scaffold packages/cli with 8 command stubs
  - `9ddb1ed` feat(cli): add shared utilities
  - `54a71ee` feat(cli): implement cf config
  - `508f358` feat(cli): implement cf project
  - `8a16871` feat(cli): implement cf status and cf next
  - `0533dc5` feat(cli): implement cf build, cf future, cf check stub
  - `7af4aaa` feat(cli): implement cf prompt with phase shorthand parser
  - `28ccdc4` feat(cli): polish help text
  - `d5a6dc9` test(cli): integration tests
  - `e9bbf09` docs(cli): README

---
## 2026-03-03

### Slice 168: CLI Foundation — Phase 5 (Task Breakdown) Complete
- Task files created: `168-tasks.cli-foundation-1.md` (Tasks 1–4: scaffolding, utilities, config, project) and `168-tasks.cli-foundation-2.md` (Tasks 5–13: status, next, build, future, check stub, prompt, polish, integration tests, docs)
- Split into two files per 350-line guideline; combined 314 lines
- `cf check` documented as stub pending slice 166 (Consistency Checker)
- Phase shorthand parser (P1–P7) specified as runtime-derived from prompt asset, never hardcoded
- Next: Phase 6 implementation of `packages/cli`

### Maintenance: Tasks 11–14 Triaged; Task 14 Implemented
- Reviewed open maintenance tasks (11–14); all four remain relevant
- Logged GitHub issues: #35 (path validation P1), #36 (CSP tightening P2), #37 (external URL allowlist P3), #38 (empty state for missing projectPath)
- Task 14 implemented: `useContextGeneration.ts` clears stale `contextString` on error; `ContextBuilderApp.tsx` detects missing-projectPath error and shows user-friendly message
- Manually verified: new project without directory shows correct message; switching between configured/unconfigured projects shows correct state; closed #38
- Commits: `0a3fcb9`

---

## 2026-03-02

### Slice 168: CLI Foundation — Phase 4 (Slice Design) Complete
- Design created at `project-documents/user/slices/168-slice.cli-foundation.md`
- Covers: `packages/cli/` structure, 8 commands (`cf status`, `next`, `build`, `config`, `project`, `future`, `check`, `prompt`), commander.js, chalk, cli-table3
- Key design decision: `cf prompt` (singular) replaces `cf prompts`; adds `cf prompt get <phase>` with variable substitution — lightweight mid-session phase-pivot alternative to full `cf build`
- Phase shorthand mapping (P1–P7, P2.5, P3.5) auto-built from `(Phase n)` / `(Phase n.m)` headings in prompt asset file; case-insensitive, hyphen/space interchangeable
- Unresolvable variables preserved as-is (no silent blanking)
- Testing spec includes: variable substitution with full/partial project data, `--raw` mode
- Commits: `f71d870` (initial overview + slice design)
- Next: Phase 5 task breakdown for slice 168

---

## 2026-03-01

### Slice 167: Future Work Collector — Phase 7 (Implementation) Complete
- `FutureWorkCollector` service in `packages/core/src/introspection/` — aggregates future work across all initiatives; detects standalone `*-slices.future.*` files via filename; groups by initiative with source attribution
- Added `filepath` and `entries` fields to `SlicePlanBlock` type; populated in `buildModel()`
- New types: `CollectedFutureWorkItem`, `FutureWorkGroup`, `FutureWorkCollectorResult` in `types.ts`
- `workflow_future` MCP tool in new `workflowTools.ts`; input: `projectId`, `status` (all/pending/completed), `includeMarkdown`
- 42 total test files pass (core: 22, mcp-server: 9, electron: 11); 18 MCP tools total
- Commits: `bf7c94c` types+fixture, `421caf8` FutureWorkCollector+tests, `029db41` MCP tool+tests+wiring

### Fix: buildModel() now surfaces undesigned slices from slice plan main body
- Bug: planned-but-undesigned slices (e.g., 165-168) were invisible in MCP output; parse.py showed them correctly
- Root cause: builder iterated `futureWork` items for planned-slice fill instead of calling `parseSlicePlan()`
- Fix: added `parseSlicePlan()` call alongside `parseFutureWork()`; replaced buggy fill loop; added fixture entry + test
- 537 tests pass (was 536); commit: `a5669d9`

### Slice 167: Future Work Collector — Phase 5 (Task Breakdown) Complete
- 10 tasks across 5 phases; test-with pattern throughout
- Phase 1: types + standalone future-work fixture (Tasks 1-2)
- Phase 2: FutureWorkCollector service + markdown formatter + core export (Tasks 3-5)
- Phase 3: unit tests (Task 6); Phase 4: workflowTools.ts + tests + wiring (Tasks 7-9)
- Key design: standalone `*-slices.future.*` files use slicePlan.entries; regular plans use slicePlan.futureWork
- Commit: `6de2bfc`

### Slice 167: Future Work Collector — Phase 4 (Slice Design) Complete
- `workflow_future` MCP tool design: walks all slice plans, extracts future work, returns grouped view with source attribution
- Resolved architectural decisions: hybrid storage convention (inline `## Future Work` + standalone `*-slices.future.*` files), per-project scope only, checkbox convention for completed/migrated items
- Updated `780-slices.future.guide-management.md` to new checkbox convention
- Fixed slice numbering in 160-slices implementation order diagram
- Commit: `fe2288f`

### Slice 164: MCP Introspection Tools — Phase 7 (Implementation) Complete
- `ProjectModelBuilder` in `packages/core/src/introspection/` — `scanDirectory()` + `buildModel()` replicating parse.py
- 6 new MCP tools in `packages/mcp-server/src/tools/introspectionTools.ts`: `introspection_slice_plan`, `introspection_tasks`, `introspection_frontmatter`, `introspection_documents`, `introspection_future_work`, `project_structure`
- ProjectModel types: `DocSummary`, `FoundationEntry`, `ArchEntry`, `Initiative`, `SliceModelEntry`, `TaskModelEntry`, `MaintenanceEntry`, etc.
- Expanded fixture project with foundation doc, HLD, maintenance task, DEVLOG
- Updated `project_get` description to document `introspection` field
- 536 tests pass (core: 341, mcp-server: 89, electron: 106); full build clean; 17 MCP tools total
- Commits: `ceb3655` types+fixtures, `b637d88` ProjectModelBuilder, `d3fa530` MCP tools+tests+wiring

### Slice 164: MCP Introspection Tools — Phase 4 (Slice Design) Complete
- Six MCP tools: 5 granular parsers (`introspection_slice_plan`, `introspection_tasks`, `introspection_frontmatter`, `introspection_documents`, `introspection_future_work`) + aggregate `project_structure`
- New `ProjectModelBuilder` in core replicates parse.py's `build_model()` — directory scanning, filename regex, initiative band grouping
- Granular tools accept `projectId`+relative path or direct `filePath`; `project_structure` requires `projectId`
- Updates `project_get` description to document the `introspection` enrichment field
- Commit: `da9289e`

### Slice 164: MCP Introspection Tools — Phase 5 (Task Breakdown) Complete
- 18 tasks across 6 phases, test-with pattern throughout
- Phase 1: Types + fixture expansion (Tasks 1-2)
- Phase 2: ProjectModelBuilder — scanDirectory, buildModel + tests (Tasks 3-6)
- Phase 3: Path resolution helper (Task 7)
- Phase 4: 5 granular MCP tools + tests (Tasks 8-13)
- Phase 5: project_structure aggregate tool + wiring + project_get update (Tasks 14-17)
- Phase 6: Final verification (Task 18)
- Commit: `60f0c67`

## 2026-02-28

### Slice 163: Artifact Introspection Engine — Phase 7 (Implementation) Complete
- `packages/core/src/introspection/`: 6 parser modules + `ArtifactIntrospector` orchestrator
- Parsers: statusNormalizer, frontmatterParser, taskFileParser, slicePlanParser, futureWorkParser, documentDetector
- Types/interfaces export from `@context-forge/core`; implementations from `@context-forge/core/node`
- Enriched `project_get` MCP tool with computed `introspection` field
- 509 tests pass (core: 327, mcp-server: 76, electron: 106); full build clean; no new deps
- Commits: `c88e8e4` types, `3cc2088` status normalizer, `8858036` frontmatter, `8fdd071` task parser, `422e07c` slice plan, `8ff9bb1` future work, `f8976b8` document detector, `930a294` orchestrator, `d72f095` project_get enrichment

### Slice 163: Artifact Introspection Engine — Phase 5 (Task Breakdown) Complete
- 18 tasks across 4 commit checkpoints, test-with pattern throughout
- Tasks 1–3: types, interfaces, status normalizer + tests
- Tasks 4–9: frontmatter parser, task file parser, slice plan parser + tests for each
- Tasks 10–13: future work parser, document detector + tests
- Tasks 14–15: ArtifactIntrospector orchestrator + tests
- Tasks 16–17: `project_get` enrichment in MCP server + tests
- Task 18: final verification and cleanup

### Slice 163: Artifact Introspection Engine — Phase 4 (Slice Design) Complete
- Re-implements relevant parsing from context-visualizer `parse.py` in TypeScript as `packages/core/src/introspection/`
- Six parser modules: frontmatter, slice plan, task file, future work, document detector, status normalizer
- `ArtifactIntrospector` orchestrator with `IArtifactIntrospector` interface consumed by slices 164–166
- Enriched `project_get` with computed `introspection` summary (slice plan completion, task progress, artifact presence)
- No new npm dependencies; regex-based line parsing (no markdown AST); Node.js-only exports from `@context-forge/core/node`

### Slice 162: Config System — Phase 7 (Implementation) Complete
- `packages/core/src/config/`: `ConfigManager`, `ConfigKeys`, `configPaths`, `index` — two-tier TOML config (user + project)
- `packages/mcp-server/src/tools/`: `configTools.ts` (3 new tools), `resolveProjectId.ts` — 7 existing tools gain optional `projectId`
- 431 tests pass (core: 252, mcp-server: 73, electron: 106); full build clean
- Commits: `07ed46d` smol-toml dep, `d7abe49` core config module, `46771e7` core tests, `74c9c33` MCP config tools, `0b68c5e` MCP tests, `20018e1` default_project integration, `d8892e5` integration tests

### Slice 162: Config System — Phase 5 (Task Breakdown) Complete
- 13 task groups: setup → configPaths → ConfigKeys → ConfigManager → exports → unit tests → MCP tools → MCP tests → resolveProjectId → projectTools integration → context/state tools integration → integration tests → final verification
- Test-with pattern: ConfigManager tests follow implementation (task 6), MCP tool tests follow tool creation (task 8), integration tests follow default_project wiring (task 12)

### Slice 162: Config System — Phase 4 (Slice Design) Complete
- Two-tier TOML config: user-level (`~/.config/context-forge/config.toml`) + project-level (`{projectPath}/.context-forge.toml`)
- Three new MCP tools: `config_set`, `config_get`, `config_list` with scope and source reporting
- `ConfigManager` in `packages/core/src/config/` — resolution chain: project → user → default
- `default_project` integration: all project-accepting MCP tools gain optional `projectId` with config fallback
- Initial keys: `default_project`, `guide.auto_update`, `guide.source`, `guide.git_strategy`
- Uses `smol-toml` (zero-dep TOML parser); effort 2/5

### Slice 161: Project Schema Standardization — Phase 7 (Implementation) Complete
- Renamed `slice`→`fileSlice`, `taskFile`→`fileTasks`, `projectDate`→`dateProject` across all packages
- Added four artifact reference fields: `fileHLD`, `fileArch`, `fileSlicePlan`, `fileSpec`
- `migrateProjectFields()` handles old/new/mixed schema with new-name precedence (idempotent)
- Updated MCP tool schemas (`project_update`, `context_build`, `template_preview`) to new field names
- Updated Electron UI components (ContextBuilderApp, ProjectConfigForm, contextHandlers)
- All 392 tests pass (core: 230, mcp-server: 56, electron: 106), build succeeds
- Commits: `6e8389d` — types + storage, `3029d8c` — context pipeline, `94a98ca` — MCP tools + fixtures, `7373827` — integration tests + docs, `60cfcc8` — electron tests, `a6db65a` — electron UI, `1ba7bc8` — remaining electron tests

## 2026-02-26

### Slice 161: Project Schema Standardization — Phase 4 (Slice Design) Complete
- Designed schema migration for `ProjectData` field renames: `slice`→`fileSlice`, `taskFile`→`fileTasks`, `projectDate`→`dateProject`
- Defined four new artifact reference fields: `fileHLD`, `fileArch`, `fileSlicePlan`, `fileSpec`
- Mapped full consumer surface (7+ source files across types, storage, MCP tools, context pipeline)
- Migration strategy: read-normalize with old→new fallback, write-new exclusively, idempotent
- Documented integration points with Slices 162 (Config System) and 163 (Artifact Introspection)

### Slice 161: Project Schema Standardization — Phase 5 (Task Breakdown) Complete
- 7 task groups, 18 sub-tasks covering types, storage, context pipeline, MCP tools, templates, fixtures, verification
- Test-with pattern: unit tests immediately follow each implementation task
- 5 commit checkpoints distributed across task sequence
- Commits: `efa602d` — slice design, `277c182` — task breakdown

## 2026-02-23

### Slice 151: Documentation and Packaging — Complete
- `docs/TOOLS.md`: full parameter reference for all 8 MCP tools
- `packages/mcp-server/README.md`: installation, Claude Code/Cursor config, tool overview
- `packages/core/README.md`: export paths, key services, monorepo role
- Root `README.md` updated: MCP server functional, quick start for CLI users
- Both package.json files: removed `private:true`, added publishing metadata (description, keywords, repository, engines, files)
- Commits:
  - `5c78dd6` — docs: add MCP tool reference (docs/TOOLS.md)
  - `b4c3668` — docs: add MCP server README
  - `8704afe` — docs: add core package README
  - `1579585` — docs: update root README
  - `76350a9` — chore: add npm publishing metadata

### Slice 150: MCP Server Integration Testing — Phase 7 (Implementation) Complete
- 25 integration tests added across all 8 MCP tools using real `@context-forge/core` services
- Fixture project: `packages/mcp-server/tests/fixtures/integration-project/` (self-contained)
- Helper module: `tests/helpers/integrationSetup.ts` (createIntegrationClient, setupFixtureEnv, resetFixtureData)
- All 56 tests pass (31 unit + 25 integration); workspace builds clean
- Commits: `125838d` — test(mcp-server): add integration test suite with fixture project (slice 150)

### Slice 150: MCP Server Integration Testing — Phase 5 (Task Breakdown) Complete
- Task file: `150-tasks.mcp-integration-test.md` — 17 tasks across 5 phases
- Phase 1: Test infrastructure (fixture project, helper module, smoke test) — Tasks 1-4
- Phase 2: Project tool integration tests (list, get, update) — Tasks 5-8
- Phase 3: Context tool integration tests (build, preview, prompt_list, prompt_get) — Tasks 9-13
- Phase 4: State tool integration tests (context_summarize) — Tasks 14-15
- Phase 5: Validation and finalization — Tasks 16-17

## 2026-02-22

### Slice 150: MCP Server Integration Testing — Phase 4 (Slice Design) Complete
- Slice design: `150-slice.integration-core-test.md` — integration tests for all 8 MCP tools against real core services
- Fixture project with known configuration; `CONTEXT_FORGE_DATA_DIR` env override for isolation
- Tests use `InMemoryTransport` with all tool groups registered (no `vi.mock()` on core)
- Estimated 20-28 integration tests covering project CRUD, context generation, prompt listing, state updates
- Effort 2/5

### Slice 149: Core Test Suite — Implementation Complete
- 170 new tests across 8 test files + 1 helper module; 224 total core tests passing
- TemplateProcessor (28), SystemPromptParser (24), StatementManager (25), ProjectPathService (18), SectionBuilder (38), ContextTemplateEngine (18), ContextIntegrator (16), CoreServiceFactory (3)
- Shared `testData.ts` helper with 5 factory functions; fixture expansion for StatementManager format + prompt instruction variants
- Commits: cac74ba, cf7ae19, a9b6609, a44ecd7, dee6498

### Slice 149: Core Test Suite — Phase 5 (Task Breakdown) Complete
- Task file: `149-tasks.integration-core-test.md` — 18 tasks across 6 phases
- Phase 1: Test infrastructure (helpers, fixture expansion) — Tasks 1-4
- Phase 2: Pure logic tests (TemplateProcessor) — Tasks 5-6
- Phase 3: Filesystem service tests (SystemPromptParser, StatementManager, ProjectPathService) — Tasks 7-10
- Phase 4: Mock-injected tests (SectionBuilder) — Tasks 11-12
- Phase 5: Integration tests (ContextTemplateEngine, ContextIntegrator, CoreServiceFactory) — Tasks 13-16
- Phase 6: Final validation and DEVLOG — Tasks 17-18
- Commit checkpoints at Tasks 4, 6, 10, 12, 16, 18

### Slice 149: Core Test Suite — Phase 4 (Slice Design) Complete
- Slice design: `149-slice.integration-core-test.md` — comprehensive unit tests for all `packages/core/src/services/` modules
- 8 test files covering: TemplateProcessor, SystemPromptParser, StatementManager, SectionBuilder, ContextTemplateEngine, ContextIntegrator, ProjectPathService, CoreServiceFactory
- Shared test helper module (`testData.ts`) with factory functions for mock data construction
- Testing strategy: real temp directories for filesystem tests (matching existing patterns), interface mocks for dependency injection, fixture project for integration tests
- Estimated 40-60 test cases, effort 2/5

### Slice 148: Electron Client Conversion — Implementation Complete
- 4-phase migration executed; Electron is now a thin UI client over `@context-forge/core`
- **Deleted:** `StorageClient`, `ElectronStorageService`, `PersistentProjectStore`, `ProjectManager`, `StatementManagerIPC`, `SystemPromptParserIPC`, `ServiceFactory`, `contextServices.ts` (legacy IPC wrappers)
- **Created:** `projectHandlers.ts`, `contextHandlers.ts`, `appStateHandlers.ts` (main-process domain handlers), `services/api.ts` (renderer API), `globals.d.ts` (Window type declarations)
- **Updated:** `main.ts`, `preload.ts`, `useContextGeneration.ts`, `ContextBuilderApp.tsx`
- Tests: 106/106 passing (24 new handler tests + 5 hook tests); bundle sizes: main.js -35%, preload.cjs -44%
- Commits: 1d864ad (Phase 1), 4069507 (Phase 2), f13f088 (Phase 3), 35430a3 (Phase 4)

### Slice 148: Electron Client Conversion — Task Breakdown Complete
- Task breakdown: `148-tasks.electron-client-conversion.md` — 20 tasks across 4 phases (215 lines)
- Phase 1: Main-process handlers (projectHandlers, contextHandlers, appStateHandlers) + unit tests + wiring (Tasks 1-8)
- Phase 2: Preload updates + renderer API module (Tasks 9-11)
- Phase 3: Consumer migration — only 2 files: `ContextBuilderApp.tsx` and `useContextGeneration.ts` (Tasks 12-16)
- Phase 4: Cleanup — delete 8 obsolete service files, 5 obsolete test files, old IPC handlers (Tasks 17-20)
- Test-with approach: unit tests immediately follow each handler implementation; hook test follows hook migration

### Slice 148: Electron Client Conversion — Design Complete
- Slice design: `148-slice.electron-client-conversion.md` — rewire Electron as thin client over `@context-forge/core`
- Replaces renderer's multi-layer storage stack (StorageClient → ElectronStorageService → PersistentProjectStore → ProjectManager) with domain-level IPC handlers delegating to `FileProjectStore`
- Eliminates `StatementManagerIPC`, `SystemPromptParserIPC`, renderer `ServiceFactory` — context generation moves entirely to main process via `createContextPipeline`
- New IPC channels: `project:list/get/create/update/delete`, `context:generate`, `app-state:get/update`
- 4-phase migration: (1) main-process handlers, (2) preload + renderer API, (3) consumer migration, (4) cleanup — each phase leaves app working
- Testing integrated per-phase: handler unit tests, IPC round-trip tests, behavioral parity verification, context output snapshot comparison

---

## 2026-02-20

### Maintenance: Migrate Tests to Centralized `tests/` Directories
- Moved all test files from colocated `__tests__/` dirs to centralized `tests/` at package level per updated CLAUDE.md guidelines
- core: 4 test files (54 tests) → `tests/` and `tests/storage/`, fixtures → `tests/fixtures/`
- mcp-server: 4 test files (31 tests) → `tests/`
- electron: 11 test files → `tests/unit/` and `tests/integration/`, updated to use `@/` alias imports
- Added `vitest.config.ts` for core and mcp-server; `tsconfig.test.json` for type-checking
- Updated electron `vitest.config.ts` (removed `src/` pattern) and `tsconfig.json` (added `tests` to include)
- All core and mcp-server tests pass; electron has pre-existing failures (already documented in maintenance-tasks)
- Commits: 93233e6

### Slice 147: MCP Server — State Update Tools — Implementation Complete
- Implementation complete: all 7 tasks done across 3 phases
- Created `packages/mcp-server/src/tools/stateTools.ts` with `registerStateTools(server)` — registers `context_summarize`
- `context_summarize`: persists session summary to `customData.recentEvents`, preserves other customData fields via spread merge, optionally updates `additionalNotes`
- Tests: 7 unit tests (InMemoryTransport + Client) + lifecycle test updated to assert 8 tools
- All 31 MCP tests pass; full workspace builds clean
- Commits: d1c58ff (task breakdown), f54e59f (implementation)

### Slice 147: MCP Server — State Update Tools — Task Breakdown Complete
- Task breakdown: `147-tasks.mcp-server-state-tools.md` — 7 tasks across 3 phases
- Phase 1: Create `stateTools.ts` with `context_summarize` tool; Phase 2: Unit tests; Phase 3: Integration wiring + lifecycle test update
- Simpler than Slice 146 (1 tool vs 4) — single commit checkpoint at Task 7

### Slice 147: MCP Server — State Update Tools — Design Complete
- Slice design: `147-slice.mcp-server-state-tools.md` — adds `context_summarize` tool
- `context_summarize`: persists session state summary to `customData.recentEvents`, preserves other customData fields
- New file `stateTools.ts` with `registerStateTools(server)` — reuses helpers from `contextTools.ts`
- Completes MCP server tool surface (8 tools total) per architecture spec

### Slice 146: MCP Server — Context Tools — Implementation Complete
- Implementation complete: 4 commits (7d618f4 → 47be7c0), all 15 tasks done across 4 phases
- Created `packages/mcp-server/src/tools/contextTools.ts` with `registerContextTools(server)` — registers 4 MCP tools
- `context_build`: generates complete context prompt via `createContextPipeline` → `generateContextFromProject`, supports parameter overrides (plain text output)
- `template_preview`: identical logic to `context_build` with `readOnlyHint: true` annotations
- `prompt_list`: enumerates templates via `SystemPromptParser.getAllPrompts()`, returns JSON with name/key/parameterCount
- `prompt_get`: retrieves specific template by name (case-insensitive) or key (exact), returns plain text with metadata header
- Shared `generateContext` helper loads project, applies overrides, appends additionalInstructions
- Tests: 16 unit tests (InMemoryTransport + Client) + lifecycle test updated to assert 7 tools
- All 24 MCP tests pass; full workspace builds clean
- Commits: 7d618f4, 3a64aa6, 0d02d83, 47be7c0

### Slice 146: MCP Server — Context Tools — Task Breakdown Complete
- Task breakdown: `146-tasks.mcp-server-context-tools.md` — 15 tasks across 4 phases (240 lines)
- Phase 1: Core API inspection + shared `generateContext` helper; Phase 2: `context_build` + `template_preview` + tests; Phase 3: `prompt_list` + `prompt_get` + tests; Phase 4: Integration wiring + lifecycle test update
- Key API path: `createContextPipeline(projectPath)` → `integrator.generateContextFromProject(project)` for context generation
- Templates are sections within a single prompt file (parsed by `#####` headers) — `SystemPromptParser.getAllPrompts()` enumerates them
- Commit checkpoints at Tasks 3, 7, 11, 15

### Slice 146: MCP Server — Context Tools — Design Complete
- Slice design: `146-slice.mcp-context-tools.md` — 4 tools wrapping core orchestration layer
- `context_build`: primary context generation with optional parameter overrides (plain text output)
- `template_preview`: read-only preview sharing `context_build` logic (different annotations for future-proofing)
- `prompt_list`: enumerate templates from project's prompt file (JSON output)
- `prompt_get`: retrieve specific template content by name/key (plain text output)

---

## 2026-02-19

### Slice 145: MCP Server — Project Tools — Implementation Complete
- Implementation complete: 4 commits (3166a02 → ec43baa), all 12 tasks done across 4 phases
- SDK: `@modelcontextprotocol/sdk` v1.26.0 (v2 `@modelcontextprotocol/server` not yet on npm); zod v4.1.5
- Created `packages/mcp-server/src/tools/projectTools.ts` with `registerProjectTools(server)` — registers 3 MCP tools
- `project_list`: returns summary fields (id, name, slice, template, instruction, isMonorepo, projectPath, updatedAt) with count
- `project_get`: returns full `ProjectData` by ID, or `isError` with helpful "use project_list" message
- `project_update`: validates at least one update field provided, checks existence, applies via `FileProjectStore.update()`, returns read-back
- `src/index.ts`: shebang, `McpServer` + `StdioServerTransport`, stderr-only logging, async main with error handling
- Tests: 7 unit tests (InMemoryTransport + Client for protocol-level verification) + 1 lifecycle test (child process spawn, JSON-RPC handshake, tools/list assertion)
- All 8 MCP tests pass; 54 core tests pass; full workspace builds clean
- Commits: 3166a02, 7b6b5f0, ca86917, ec43baa

### Slice 145: MCP Server — Project Tools — Task Breakdown Complete
- Task breakdown: `145-tasks.mcp-server-project-tools.md` — 12 tasks across 4 phases
- Phase 1: Deps + scaffold (install SDK, create index.ts); Phase 2: Tool implementations (list/get/update); Phase 3: Unit tests; Phase 4: Lifecycle test + verification
- Commit checkpoints at Tasks 3, 7, 9, 12

### Slice 145: MCP Server — Project Tools — Design Complete
- Slice design: `145-slice.mcp-server-project-tools.md` — first MCP feature slice, implements `project_list`, `project_get`, `project_update` wrapping `FileProjectStore` from core
- SDK: `@modelcontextprotocol/server` v2 with `zod/v4` for input schemas; v1 fallback documented
- Transport: stdio only; file structure: `src/index.ts` (server lifecycle) + `src/tools/projectTools.ts` (tool implementations)
- Tool annotations: read-only hints for list/get, idempotent+non-destructive for update
- Fresh `FileProjectStore` per call (avoids stale state vs Electron); error messages guide users to correct tools

### Slice 144: Storage Migration — Implementation Complete
- Implementation complete: 6 commits (549111f → 7c8597e), all 18 tasks done
- Created `packages/core/src/storage/` with 5 modules: `interfaces.ts`, `storagePaths.ts`, `backupService.ts`, `FileStorageService.ts`, `FileProjectStore.ts`
- `IProjectStore` interface for project CRUD; `IStorageService` for low-level atomic file operations
- `env-paths` resolves cross-platform storage (`~/Library/Preferences/context-forge/` on macOS); `CONTEXT_FORGE_DATA_DIR` override for testing
- Backup service extracted from Electron (already had no Electron deps); `FileStorageService` implements atomic write (temp+rename), backup on write, recovery from corruption
- `FileProjectStore` provides full CRUD with field migration, lazy init, and one-time legacy data migration from `~/Library/Application Support/context-forge/context-forge/`
- Electron `main.ts` IPC handlers delegate to core: 153 lines removed, 32 added; storage behavior preserved
- Fixed `ProjectPathService.test.ts` mock to use `importOriginal` (needed after expanded core/node exports)
- Exported from `@context-forge/core/node` (implementations) and `@context-forge/core` (type-only interfaces)
- Pipeline integration test validates: project CRUD, context generation from storage, backup recovery — all without Electron
- 54 core tests passing; 155/163 Electron tests (same 8 pre-existing failures)
- Commits: 549111f, ed402c8, 0241f65, 9f46826, fb012b8, 7c8597e

### Slice 144: Storage Migration — Task Breakdown Complete
- Task breakdown: `144-tasks.storage-migration.md` — 18 tasks across 6 phases
- Phase 1: Setup (env-paths, interfaces); Phase 2: Backup service extraction; Phase 3: FileStorageService; Phase 4: FileProjectStore; Phase 5: Electron integration; Phase 6: Pipeline integration test
- Test-with pattern: unit tests immediately follow each component (Tasks 5, 8, 11 after Tasks 4, 7, 10)
- Commit checkpoints at Tasks 3, 6, 9, 12, 15, 18

### Slice 144: Storage Migration — Design Complete
- Slice design: `144-slice.storage-migration.md` — replaces Electron-specific storage with filesystem-based layer in `packages/core/src/storage/`
- Key decisions: `IProjectStore` interface for CRUD, `FileStorageService` for atomic read/write/backup, `env-paths` for cross-platform storage path (`~/Library/Preferences/context-forge/` on macOS)
- Migration: automated copy of `projects.json` + `.backup` from legacy Electron location; versioned backups copied manually by PM
- Includes pipeline integration test design: validates full context generation (storage → pipeline → output) without Electron
- Scope: backup service extracted from Electron (already has no Electron deps), main.ts IPC handlers delegate to core; renderer-side storage classes stay until slice 149

## 2026-02-18

### Slice 143: Core Orchestration Extraction — Complete
- Implementation complete: 4 commits (aaa9f7a → 121841d), all 15 tasks done
- Extracted ContextGenerator, ContextTemplateEngine, ContextIntegrator + CoreServiceFactory to `packages/core/src/services/`
- Extended IPromptReader with `getContextInitializationPrompt()`; added IStatementService/IPromptService; added setFilePath() to SystemPromptParser and StatementManager
- Constructor injection pattern: ContextTemplateEngine takes IPromptService/IStatementService; ContextIntegrator takes ContextTemplateEngine
- `createContextPipeline(projectPath)` in CoreServiceFactory wires the full pipeline for MCP/CLI consumers
- Removed obsolete ContextGenerator interface from types (replaced by class); fixed IPCIntegration.test.ts dynamic imports
- Full workspace builds clean; 155/163 tests pass (same 8 pre-existing failures)

### Slice 143: Core Orchestration Extraction — Design Complete
- Slice design: `143-slice.core-orchestration-extraction.md` — extracts ContextTemplateEngine, ContextIntegrator, ContextGenerator, and CoreServiceFactory to `packages/core/src/services/`
- Key decisions: extend IPromptReader with `getContextInitializationPrompt()`; new `IStatementService`/`IPromptService` interfaces; constructor injection (no default ServiceFactory in core); `createContextPipeline()` convenience factory
- Scope: ~580 lines of orchestration code, 5 Electron consumer files to update, ServiceFactory stays in Electron for IPC wrapper creation
- Also marked slice 142 complete in 140-slices plan
- Commits: 67f600e

### Slice 142: Core Services Extraction — Complete
- Implementation complete: 4 commits (7c52150 → 0d26f0b), all 12 tasks done
- Extracted 5 services to `packages/core/src/services/`: TemplateProcessor, SystemPromptParser, StatementManager, SectionBuilder, ProjectPathService
- Added `services/constants.ts` (DEFAULT_STATEMENTS, file path constants) and `services/interfaces.ts` (IStatementReader, IPromptReader)
- Updated 8 Electron consumer files to import from `@context-forge/core`; deleted 5 original service files from Electron
- Required infrastructure fix: added `@types/node` + `types:["node"]` to core tsconfig (services use `fs`/`path`, lib was ES2023 only)
- Fixed `EnhancedContextData` import location (context.ts not sections.ts); removed unused `path` import from SystemPromptParser
- Fixed `ProjectPathService` broken `./types` import (file deleted in slice 141) — resolved to `../types/paths.js`
- Full workspace builds clean (`pnpm -r build`), 155/163 tests pass (same 8 pre-existing failures)

### Slice 142: Core Services Extraction — Design Complete
- Slice design: `142-slice.core-services-extraction.md` — extracts 5 services (TemplateProcessor, SystemPromptParser, StatementManager, SectionBuilder, ProjectPathService) to `packages/core/src/services/`
- Key decisions: keep Node.js `fs` as-is (core is a Node.js package, not browser), define minimal interfaces (`IStatementReader`, `IPromptReader`) for SectionBuilder's dependency injection
- Scope: relocation not redesign, ~1315 lines of service code, ~8 consumer files to update
- Found broken import in `ProjectPathService` (`./types` deleted in slice 141) — will fix during extraction
- Domain constants (`DEFAULT_STATEMENTS`, file path constants) exported from core

## 2026-02-17
### Slice 141: Core Types Extraction — Complete
- Implementation complete: 8 commits (a4537a7 → 8e7ba18), all 10 tasks done
- Created 6 type modules in `packages/core/src/types/` (context, sections, statements, prompts, project, paths)
- Updated 21 consumer files in Electron to import from `@context-forge/core`
- Deleted 11 original type files, removed 2 empty `types/` directories
- Found and fixed 3 additional inline `import()` type references in `StorageClient.ts`
- Full workspace builds clean, 155/163 tests pass (8 pre-existing failures unchanged)
- Zero stale imports remain — all types now sourced from `@context-forge/core`

### Slice 141: Core Types Extraction — Design & Tasks Created
- Slice design complete: `141-slice.core-types-extraction.md` — consolidates duplicated type hierarchies (main-process vs renderer-process) into `packages/core/src/types/`
- Key design decisions: renderer `ContextData` superset as canonical definition, `EnhancedContextData` deduplicated from 3 definitions to 1, enums preserved as-is, no re-export shims
- Task breakdown complete: `141-tasks.core-types-extraction.md` — 10 tasks covering 6 type modules, barrel exports, ~26 consumer import updates across ~20 files, deletion of 11 original type files
- `AppState`/`WindowBounds` intentionally kept in Electron (UI-specific, deferred to storage migration)
- Scope: types only, zero runtime behavior change, verified by compiler + existing test suite

### Slice 140: Monorepo Scaffolding — Complete
- 8 commits on main (d18e39d → 08e7d2c), foundation slice checked off in 140-slices
- Created pnpm workspace with 3 packages: `@context-forge/core`, `context-forge-mcp`, `@context-forge/electron`
- All packages build in topological order (core → mcp-server → electron), workspace symlinks working
- `.npmrc` with `public-hoist-pattern[]=electron` required — pnpm strict mode prevents electron-vite from resolving the electron binary; hoisting fixes this without affecting published packages
- `electron.vite.config.ts` needed two path fixes after move: vite-plugin-content import (`../../lib/vite/...`) and content alias (`../../content`)
- Root tsconfig.json converted to project-references; root package.json stripped to workspace orchestrator
- 157/163 tests pass (6 pre-existing failures logged to 999-tasks.maintenance-ongoing.md — stale IPC test mocks and prompt path expectations)
- Dependency isolation confirmed: core has zero runtime deps, mcp-server depends only on core — no electron/UI leakage to MCP consumers
- Pending: manual verification of Electron launch + core app functionality
- Next: Slice 2 (Core Types Extraction)

## 2026-02-07

- Reorganized slice 125 for macOS-only focus; deferred Linux (126) and Windows (127)
- Reduced packaging tasks from 64 to ~20 focused items across 5 phases
- Resolved unchecked tasks: deferred 101.10.4, checked 105 criteria, deferred 110 loading states
- Logged 6 test failures (all infrastructure/mocking, no code bugs) to 900-tasks.test-infrastructure-deferred.md
- Increased character limits: Project State, Additional Instructions, Monorepo Structure from 8K → 32K
- Established hybrid PR strategy: batch small changes into tasks, create PRs for feature-complete slices
- Ready to begin Phase 1: unsigned macOS DMG build

## 2025-01-16

- Resumed project after ~2 month hiatus
- Evaluated context-forge vs context-forge-pro state with AI assistance
- Decision: continue in Pro repo, Mac-only packaging initially
- Added DEVLOG.md for better project continuity

## 2025-11-18 (reconstructed from git)

- Last active development before hiatus
- Updated window title to 'Context Forge Pro'
- Initialized ai-project-guide submodule
- Established Pro/Free sync infrastructure

## 2025-11-17 (reconstructed from git)

- Completed maintenance slice (900-tasks.maintenance.md)
- Fixed undo/redo in textarea fields (Issue #21)
- Added development-phase field for context output
- Task file auto-population from slice names

---

*Entries below this line are reconstructed from git history and task files.*

## 2025-10 (summary)

- MVP feature completion
- Multi-project support finalized
- Context generation engine stable
- Monorepo mode settings added

## 2025-09 (summary)

- Initial maintenance infrastructure
- Application menu implementation
- Core slice completion (100-115)
