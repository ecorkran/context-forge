---
docType: tasks
slice: onboarding-consolidation
project: context-forge
lld: user/slices/260-slice.onboarding-consolidation.md
dependencies: []
projectState: main at 0.19.16. Three hand-written onboarding recipes (`commands/cf/onboard.md`,
  `commands/codex/cf-onboard/SKILL.md`, `ONBOARD_GUIDE` in `agentOnboardTool.ts`)
  have drifted and carry methodology plus a `/setup-ci` offer keyed on `.github/workflows/ci.yml`.
  Design reviewed (round 2 CONCERNS, resolved in the design).
dateCreated: 20261020
dateUpdated: 20261020
status: complete
turns: 27
promptTokens: 1850049
cachedTokens: 1755102
cacheWriteTokens: 94897
completionTokens: 26698
durationSeconds: 254.4
costUsd: 1.64464
usageRounds: 3
pricedRounds: 3
revision_number: 2
---

## Context Summary

- Slice 260 is the first slice of the 260 brownfield-adoption initiative. It replaces the three onboarding copies with one renderer in core, cuts the recipe to setup plus a `cf build` / `context_build` handoff, moves the `setup-ci` offer to `cf next` / `workflow_next`, and adds a minimum-guide-version warning (D8).
- The design's Technical Decisions D1–D8, API Contracts, Success Criteria and Verification Walkthrough are the spec. Do not re-derive them, and do not widen scope (Excluded list: no detection report, no prompt changes, no installer changes).
- Dependencies: none in this repo. The guide minimum is ai-project-guide v0.22.2 (concept prompt opens the conversation).
- Core export split: `packages/core/src/index.ts` is browser-safe (no `fs`); `packages/core/src/node.ts` holds fs-dependent exports. The renderer and the offer id/types go in `index.ts`; `detection/`, `setupCiOffer.ts` and `guideMinimum.ts` go in `node.ts`.
- Existing patterns to copy: `isDecisionGateEnabled` in `schema/decisionGate.ts` (boolean config guard), `COMMAND_TARGETS` (typed `Record` table), `GuideDetector.detectLocal` + `isNewerVersion` in `guides/GuideDetector.ts`.
- Missing-file rule used by every detection check (Patterns and Conventions, D6): `ENOENT` on the queried path means "not present"; every other error throws. `existsSync` hides errors, so do not use it in `detection/`. An entry that `lstat` finds but whose `stat` fails is a broken symlink and is an error, not "not present".
- Use the local build (`node packages/cli/dist/index.js`); the global `cf` is the published npm package. The render script and the CLI drift test import `@context-forge/core`, so run `pnpm -r build` before them.
- Permission-based tests (`chmod 000`) cannot fail as root and do not apply on Windows; skip them in those cases with `it.skipIf`, as sibling fs tests do.
- The arch already records the repository-root CI exception (`260-arch.brownfield-adoption.md`, Detection and adoption state), so no arch edit is needed.
- Next planned slice: 261 (brownfield detection), which reuses `recognizeCi`, `hasBuildManifest` and `MIN_GUIDE_VERSION`.

## Tasks

- [x] **Task 0: Slice branch** (effort: 1)
  - [x] Read `cf config get git.integration_branch`; empty means the target is `main`.
  - [x] Create `260-slice.onboarding-consolidation` from the target if it does not exist, otherwise switch to it.
  - [x] Success: `git branch --show-current` prints the slice branch.

### Detection facts (Development Approach step 1)

- [x] **Task 1: Path-presence helper and build-manifest check** (effort: 2)
  - [x] Create `packages/core/src/detection/pathPresent.ts` exporting `pathPresent(path): boolean`, the shared implementation of the missing-file rule in the Context Summary (sync `lstatSync`, then `statSync` when the entry is a symlink).
  - [x] Errors other than `ENOENT` on the queried path are rethrown unchanged, so the caller's message keeps the code and path. A broken symlink rethrows the `statSync` error (it carries `code` and names the path).
  - [x] Create `packages/core/src/detection/buildManifest.ts` exporting `BUILD_MANIFESTS` (readonly; the ten names in D5, in that order) and `hasBuildManifest(projectPath): boolean`.
  - [x] Check only `projectPath` itself (no walk upward), using `pathPresent`. Return true on the first hit.
  - [x] Success: `pnpm --filter @context-forge/core build` passes.

- [x] **Task 1T: Path-presence and build-manifest tests** (effort: 2)
  - [x] Create `packages/core/tests/detection/pathPresent.test.ts` using a temp directory. Cases: file present → true; directory present → true; missing → false; a path under a regular file (`ENOTDIR`) → throws; broken symlink → throws naming the path; symlink loop (`ELOOP`) → throws.
  - [x] Create `packages/core/tests/detection/buildManifest.test.ts`: one test per `BUILD_MANIFESTS` entry (iterate the constant with `it.each`), plus an empty directory → false, plus a manifest only in the parent directory → false.
  - [x] Success: all pass.

- [x] **Task 1C: Commit** — `feat(core): add build-manifest detection`

- [x] **Task 2: CI recognizer** (effort: 3)
  - [x] Create `packages/core/src/detection/ciDetection.ts` exporting `CI_SIGNATURES`, `CiRecognition` (`{ recognized; matches }`) and sync `recognizeCi(projectPath)`, per D4.
  - [x] `CI_SIGNATURES` is one constant describing every entry in D4: single files (`.gitlab-ci.yml`, `.circleci/config.yml`, `azure-pipelines.yml`, `bitbucket-pipelines.yml`, `Jenkinsfile`, `.travis.yml`) and directories scanned for `*.yml` / `*.yaml` (`.github/workflows/`, `.buildkite/`). The scanning code reads the constant; no signature appears anywhere else.
  - [x] Repository root: walk from `projectPath` upward to the first directory containing a `.git` entry (directory or file), using `pathPresent` on `<dir>/.git`. No ancestor found → only `projectPath` is scanned. Do not spawn `git`.
  - [x] Scan `projectPath`, then the repository root when it differs. Same directory → scanned once (compare resolved absolute paths).
  - [x] Directory signatures: list with `readdirSync`; `ENOENT` means none; anything else (including `ENOTDIR` when the path is a file) throws. Extension match is case-sensitive on `.yml` / `.yaml`.
  - [x] `matches` holds absolute paths, without duplicates. `recognized` is `matches.length > 0`.
  - [x] Keep the file under ~300 lines; split the root walk into its own function.
  - [x] Create `packages/core/src/detection/index.ts` re-exporting `recognizeCi`, `CI_SIGNATURES`, `CiRecognition`, `hasBuildManifest`, `BUILD_MANIFESTS`, and re-export that barrel from `packages/core/src/node.ts` (fs-dependent), not `index.ts`. `pathPresent` is not in the barrel and is never exported from `node.ts`; detection files import it by path.
  - [x] Success: `pnpm -r build` and `pnpm -r typecheck` pass.

- [x] **Task 2T: CI recognizer tests** (effort: 3)
  - [x] Create `packages/core/tests/detection/ciDetection.test.ts` with temp directories.
  - [x] Each single-file signature recognized (`it.each` over the constant's entries).
  - [x] `.github/workflows/test.yml` and `.github/workflows/ci.yaml` recognized; `.github/workflows/notes.md` alone not recognized. Same three cases for `.buildkite/`.
  - [x] Monorepo: `.git/` and `.github/workflows/ci.yml` at the root, `projectPath` at `packages/app/` → recognized, `matches` contains the absolute root path.
  - [x] `projectPath` equal to the repository root → each match appears once.
  - [x] `.git` as a file (worktree form) at the root → the root is still found and scanned.
  - [x] No repository: CI file only in a parent directory with no `.git` anywhere in the temp tree → not recognized. Build the tree under a temp dir known to have no `.git` ancestor; assert that precondition at test start.
  - [x] `.github/workflows` as a regular file → throws with `ENOTDIR`.
  - [x] Success: all pass.

- [x] **Task 2C: Commit** — `feat(core): add CI recognizer`

### Setup-ci offer (Development Approach steps 2–3)

- [x] **Task 3: Config key** (effort: 1)
  - [x] Add `workflow.setup_ci_offer` to `packages/core/src/config/ConfigKeys.ts` beside the other `workflow.*` keys: boolean, default `true`, `ConfigScope.Shared`, description exactly as in D7.
  - [x] Success: build passes; `node packages/cli/dist/index.js config get workflow.setup_ci_offer` prints `true` with source `default`.

- [x] **Task 3T: Config key test** (effort: 1)
  - [x] Add a case to the existing ConfigKeys/ConfigManager test in `packages/core/tests/config/` (follow how `workflow.decision_gate_enabled` is covered): key registered, default `true`, scope shared.
  - [x] Success: passes.

- [x] **Task 4: Offer types** (effort: 1)
  - [x] In `packages/core/src/introspection/types.ts`, add `SETUP_CI_OFFER_ID = 'setup-ci'`, `NextOffer { id: string; message: string }`, and `offers?: NextOffer[]` on `NextAction`, with short doc comments (consumers key on `id`, never `message`).
  - [x] Confirm both are exported through `introspection/index.ts` (browser-safe).
  - [x] Success: build passes; no behavior change.

- [x] **Task 5: Offer evaluation** (effort: 3)
  - [x] Create `packages/core/src/introspection/setupCiOffer.ts` exporting `OfferEvaluation` and `evaluateSetupCiOffer(projectPath, config): Promise<OfferEvaluation>`, per D6.
  - [x] Read `workflow.setup_ci_offer` with a guard shaped like `isDecisionGateEnabled`; a non-boolean throws (configuration error, not caught below). Define the key name once as a constant and use it in the guard and the message.
  - [x] Check order, each short-circuiting to `{ offer: null, warning: null }`: key `false`; `hasBuildManifest` false; `recognizeCi` recognized; release skill present at `.claude/skills/release/SKILL.md` or `.agents/skills/release/SKILL.md` under `projectPath` (via `pathPresent`; define the two relative paths once).
  - [x] Wrap the three filesystem checks (not the config read) in one try/catch that handles only Node filesystem errors (an `Error` with a string `code`, which also carries `path`); rethrow everything else. For a handled error, return `{ offer: null, warning }` where the warning names the failing path and the error message. This is a specific-exception catch under the project's exception rules: add the comment that the offer is advisory, so filesystem errors become a visible warning instead of failing `cf next` (D6).
  - [x] All conditions met → offer `{ id: SETUP_CI_OFFER_ID, message }` with the message text from D6 verbatim.
  - [x] Export `evaluateSetupCiOffer` and `OfferEvaluation` from `packages/core/src/node.ts` only. It is fs-dependent: never add it to `introspection/index.ts` or `index.ts`.
  - [x] Success: build passes.

- [x] **Task 5T: Offer evaluation tests** (effort: 3)
  - [x] Create `packages/core/tests/introspection/setupCiOffer.test.ts` with temp directories and a stub `ConfigManager` (`get` returning `{ value }`), as other introspection tests do.
  - [x] All conditions met → offer with id `setup-ci` and the D6 message.
  - [x] Each condition flipped alone → no offer, no warning: key `false`; no manifest; CI present; `.claude/skills/release/SKILL.md` present; `.agents/skills/release/SKILL.md` present.
  - [x] Non-boolean config value → rejects.
  - [x] I/O failure classes, each → no offer, a warning containing the failing path, and no throw:
    1. Unreadable ancestor: `chmod 000` on the parent of `projectPath`; the warning contains a path under that parent (skip as root/Windows; restore the mode in `afterEach`).
    2. `.github/workflows` as a regular file (`ENOTDIR`).
    3. Broken symlink: `package.json` as a symlink to a missing target.
    4. Unreadable `.git` entry: `.git` as a self-referencing symlink (`ELOOP`).
  - [x] Success: all pass.

- [x] **Task 5C: Commit** — `feat(core): add setup-ci offer evaluation and config key`

- [x] **Task 6: Navigator attaches offers** (effort: 2)
  - [x] In `WorkflowNavigator.ts`, rename today's `getNext` body to a private `computeNext(project)`, unchanged. No early return is edited.
  - [x] New `getNext` calls `computeNext`, then, only when `this.config` and `project.projectPath` are both set, calls `evaluateSetupCiOffer`. Set `offers = [offer]` when an offer is returned; append a non-null warning to `warnings` (creating the array if absent).
  - [x] Signature and callers unchanged. `WorkflowNavigator.ts` must not grow by more than the wrapper.
  - [x] Success: build passes; existing navigator tests pass unchanged.

- [x] **Task 6T: Navigator tests** (effort: 2)
  - [x] Add `packages/core/tests/introspection/WorkflowNavigator.offers.test.ts` (find the existing navigator tests with `grep -rl "new WorkflowNavigator" packages/core/tests` and reuse their project-fixture helpers).
  - [x] Normal result + offer conditions met → `offers[0].id === SETUP_CI_OFFER_ID`.
  - [x] Gate-blocked result (pending decision, as in the decision-gate tests) + conditions met → `offers` attached, block unchanged.
  - [x] Offer I/O error (`.github/workflows` as a file) → warning in `warnings`, no `offers`, recommendation identical to a run with the offer disabled.
  - [x] Navigator constructed without config → no `offers`.
  - [x] Success: all pass, and the full core suite passes.

- [x] **Task 7: `cf next` renders offers** (effort: 1)
  - [x] In `packages/cli/src/commands/next.ts`, after the `Run:` line, print `Offer:     {message}` for each offer (label padded like the existing lines). JSON output is unchanged code: the field passes through.
  - [x] Success: build passes.

- [x] **Task 7T: `cf next` tests** (effort: 1)
  - [x] In `packages/cli/tests/commands/next.test.ts`, follow how results are mocked there: an offer prints one `Offer:` line after `Run:`; no offer prints none; `--json` includes `offers`.
  - [x] Success: all pass.

- [x] **Task 8: `workflow_next` description** (effort: 1)
  - [x] In `packages/mcp-server/src/tools/workflowTools.ts`, add `offers?` (id + message, key on id) to `workflow_next`'s documented response shape. No logic change: the tool returns the navigator result.
  - [x] Add an assertion to `packages/mcp-server/tests/workflowTools.test.ts` that an `offers` field from the navigator reaches the tool response.
  - [x] Success: build and MCP tests pass.

- [x] **Task 8C: Commit** — `feat: surface setup-ci offer in cf next and workflow_next`

### Onboarding recipe (Development Approach steps 4–6)

- [x] **Task 9: Recipe module** (effort: 3)
  - [x] Read the three current recipes first; the rendered text keeps their wording wherever a step survives (Special Considerations).
  - [x] Create `packages/core/src/onboarding/onboardRecipe.ts` per D1: `OnboardSurface`, `OnboardSurfaceProfile`, `ONBOARD_SURFACES: Record<OnboardSurface, OnboardSurfaceProfile>`, `renderOnboardRecipe(surface)`.
  - [x] Profiles carry every surface difference listed in D3 (frontmatter, registration check, setup command/fallback, build command, `cf next` form, MCP-to-CLI fallback line or none). Copy each existing frontmatter verbatim; `mcp-tool` has none.
  - [x] Step text is written once and reads the profile. The renderer emits no surface-specific literal outside the table.
  - [x] Content is exactly D3's three steps and keeps the git-status warning and the MCP no-`git init` note. It contains no concept opener, no phase note, no `setup-ci` text.
  - [x] Step 2's project-name instruction gives no example name (hallucination-trap rule).
  - [x] `claude-command` and `agent-skill` output: frontmatter, then the generated-file HTML comment from D2 on the line after it. `mcp-tool` output has no such comment.
  - [x] Export from `packages/core/src/index.ts` (pure string code, browser-safe).
  - [x] Success: build passes; print each surface (`node -e` against `packages/core/dist`) and check it against D3 by reading.

- [x] **Task 9T: Recipe tests** (effort: 2)
  - [x] Create `packages/core/tests/onboarding/onboardRecipe.test.ts`. For each surface (`it.each` over `Object.keys(ONBOARD_SURFACES)`):
    1. Contains the registration check, `cf init` (or `project_create` + `guide_install` for the fallback), and the build handoff for that surface.
    2. Does not contain `describe what you want to build`, `setup-ci`, or `later phase` (case-insensitive).
  - [x] `claude-command` output starts with `---` and includes `allowed-tools`; `agent-skill` includes `name: cf-onboard`; `mcp-tool` has no frontmatter and no generated comment.
  - [x] `claude-command` and `agent-skill` outputs carry the D2 generated-file comment directly after the closing frontmatter `---`.
  - [x] Success: all pass.

- [x] **Task 9C: Commit** — `feat(core): add single-source onboarding recipe renderer`

- [x] **Task 10: Render script and rendered assets** (effort: 2)
  - [x] Create `packages/cli/scripts/render-onboard.mjs`: imports `renderOnboardRecipe` from `@context-forge/core`, writes `commands/cf/onboard.md` (`claude-command`) and `commands/codex/cf-onboard/SKILL.md` (`agent-skill`), paths resolved from the script's own location, and prints each path written.
  - [x] Add `"render:onboard": "node scripts/render-onboard.mjs"` to `packages/cli/package.json` scripts. Do not add it to `build`, and do not add `scripts` to `files`.
  - [x] Run `pnpm -r build`, then `pnpm --filter @context-forge/cli render:onboard`. Review the `git diff` of both assets against D3.
  - [x] Success: a second run of the script leaves `git diff packages/cli/commands` unchanged from after the first run.

- [x] **Task 10T: Drift test** (effort: 2)
  - [x] Create `packages/cli/tests/onboardRender.test.ts`: for each CLI surface, render and compare byte-for-byte to the committed file.
  - [x] Failure message names the file path and the command `pnpm --filter @context-forge/cli render:onboard`.
  - [x] Verify by hand: append a line to `commands/cf/onboard.md`, run the test, confirm it fails with that message, then restore it by re-running `pnpm --filter @context-forge/cli render:onboard` (not `git checkout`: before Task 10C the committed file is still the old hand-written recipe).
  - [x] Add a test to `packages/cli/tests/commands/commandInstaller.test.ts` asserting that installing the Claude and agents targets yields `cf/onboard.md` and `cf-onboard/SKILL.md` and reports no stale-entry removals.
  - [x] Success: after a fresh `pnpm -r build` (the drift test imports `@context-forge/core` from `dist`), all pass.

- [x] **Task 10C: Commit** — `feat(cli): render onboarding assets from core with drift test`

- [x] **Task 11: `agent_onboard` uses the renderer** (effort: 1)
  - [x] In `packages/mcp-server/src/tools/agentOnboardTool.ts`, delete `ONBOARD_GUIDE` and return `renderOnboardRecipe('mcp-tool')`, still appending `**Project name provided:** {name}` when `projectName` is given. Tool name, schema and annotations unchanged.
  - [x] Success: build passes; `serverLifecycle.test.ts` passes.

- [x] **Task 11T: `agent_onboard` test** (effort: 1)
  - [x] Create `packages/mcp-server/tests/agentOnboardTool.test.ts` following `agentQuickstartTool.test.ts`.
  - [x] Without `projectName` → text equals `renderOnboardRecipe('mcp-tool')`. With `projectName: 'demo'` → that text followed by the project-name line ending in `demo`.
  - [x] Success: passes.

- [x] **Task 11C: Commit** — `refactor(mcp): return rendered onboarding recipe from agent_onboard`

### Guide minimum warning (Development Approach step 7)

- [x] **Task 12: Guide minimum check** (effort: 2)
  - [x] Create `packages/core/src/guides/guideMinimum.ts` exporting `MIN_GUIDE_VERSION = '0.22.2'` and `checkGuideMinimum(projectPath)`, per D8.
  - [x] Use `new GuideDetector().detectLocal(projectPath)`. Not installed → `null`. Installed with `version` `null` → the unknown-version message. Below the minimum (`isNewerVersion(installed, MIN_GUIDE_VERSION)`) → the below-minimum message. Otherwise `null`. Message texts verbatim from D8, built from the constant.
  - [x] `LOCAL_VERSION_MARKER` (`local`, a local-archive install) is not a release version: treat it as unknown, before calling `isNewerVersion` (which reports `local` as older than anything).
  - [x] Export from `packages/core/src/guides/index.ts` (already re-exported by `node.ts`).
  - [x] Success: build passes.

- [x] **Task 12T: Guide minimum tests** (effort: 2)
  - [x] Create `packages/core/tests/guides/guideMinimum.test.ts`, building guide fixtures the way `GuideDetector.test.ts` does.
  - [x] Cases: at the minimum → `null`; above → `null`; below → message naming both versions and `cf guides update`; unknown version → unknown message; `local` marker → unknown message; no guide → `null`.
  - [x] Success: all pass.

- [x] **Task 12C: Commit** — `feat(core): add minimum guide version check`

- [x] **Task 13: Warning in `cf build`** (effort: 1)
  - [x] In `packages/cli/src/commands/build.ts`, after the prompt is built, call `checkGuideMinimum(project.projectPath)` and write `Warning: {message}\n` to stderr when non-null. stdout and the exit code are unchanged.
  - [x] Add a case to `packages/cli/tests/commands/build.test.ts` (mock `checkGuideMinimum` the way that file mocks core): warning on stderr, stdout is the unchanged prompt; and no warning when the check returns `null`.
  - [x] Success: build and test pass.

- [x] **Task 14: Warning in `context_build`** (effort: 1)
  - [x] In `packages/mcp-server/src/tools/contextTools.ts`, when `checkGuideMinimum` returns a message, return it as a second text content item after the prompt. The prompt item is unchanged.
  - [x] Add cases to `packages/mcp-server/tests/contextTools.test.ts`: warning present → two content items, the first identical to the no-warning prompt; `null` → one item.
  - [x] Success: build and test pass.

- [x] **Task 14C: Commit** — `feat: warn in cf build and context_build when guide is below minimum`

### Docs and verification (Development Approach step 8)

- [x] **Task 15: README** (effort: 1)
  - [x] In the root `README.md` Get Started step 3 and the paragraph after it (around line 70): describe `/cf:onboard` as setup followed by a `cf build` handoff, state the guide minimum (ai-project-guide v0.22.2) and `cf guides update` for older installs.
  - [x] Add one row for `workflow.setup_ci_offer` (shared) to the config key table next to `workflow.decision_gate_enabled`.
  - [x] Success: no other README sections change.

- [x] **Task 15C: Commit** — `docs: update onboarding flow and setup_ci_offer key in README`

- [x] **Task 16: Full verification** (effort: 2)
  - [x] Run format, lint, `pnpm -r typecheck`, `pnpm -r build`, `pnpm -r test`. All pass.
  - [x] Every new source file is under ~300 lines (`wc -l`).
  - [x] Run Verification Walkthrough steps 1, 2 and 6–9 from the slice design with the local build; each matches its expected output. Step 9 uses a temp repository built for the test. Step 5 (`agent_onboard`) is covered by the Task 11T test.
  - [x] Any defect found here is fixed in its own commit typed by what it is (`fix:`, `feat:`, `test:`), not folded into a verification commit.
  - [x] Success: all automated checks and listed walkthrough steps pass.

- [x] **Task 17: Installed commands and live onboarding runs** (effort: 2)
  - [x] Run `node packages/cli/dist/index.js install-commands` and confirm the installed `/cf:onboard` is the new text (Special Considerations).
  - [x] Walkthrough step 3 (live runs are pre-authorized), Claude half: in an empty temp directory, run `/cf:onboard demo` through Claude Code headless (`claude -p`).
  - [x] Walkthrough step 3, Codex half: `$cf-onboard demo` through `codex exec`.
  - [x] Walkthrough step 4 precondition: `node packages/cli/dist/index.js status` in this repository shows it registered, in a phase other than Phase 0, with slice 260 set. If not, write a `BLOCKED:` line with the actual state and skip step 4. Otherwise run `/cf:onboard` here through `claude -p`.
  - [x] Record under this task, per run, whether setup, then `cf build`, then the concept question (step 3) or no concept question (step 4) occurred. If a CLI is not installed or cannot run headless, write a `BLOCKED:` line naming it and leave that item unchecked.
  - [x] Any defect found is fixed in its own commit typed by what it is.
  - [x] Success: each run's outcome or `BLOCKED:` line is recorded.

  Run record (20261020):
  - Claude greenfield (`claude -p "/cf:onboard demo"`, empty temp dir, isolated data dir): setup ran, `cf build` ran, the agent asked "What do you want to build?". Pass.
  - Claude mid-project (`claude -p "/cf:onboard"` in this repository, Phase 6, slice 260): `project_list` found the registration, setup skipped, `context_build` ran, no concept question. Pass.
  - Codex greenfield (`codex exec '$cf-onboard demo'`, codex-cli 0.163.0, empty temp dir, isolated data dir): setup ran (project registered, guide v0.22.2 installed), `cf build` loaded the Phase 0 context, and the agent asked "What do you want to build with `demo`?". Pass. The workspace-write sandbox blocked `git init` and the global command install; the agent reported both. The first attempt with codex-cli 0.146.1 failed before the skill loaded: that CLI could not read the models cache written by the newer desktop app (client 0.162.0) and the server rejected the request with HTTP 400. Updating the CLI fixed it.
  - Defect found and fixed during Task 16 (`fix(core)`, 6664d9af): every recipe told the agent to run `cf init <name>`, but `cf init` takes `--name <name>`; it rejects a positional name. The recipe now says `cf init --name <name>`.
  - Trap hit during the runs: `cf init` in the greenfield run (global published `cf`) re-installed the old bundled commands over the locally installed ones, so the mid-project run first used the old recipe. Re-running `node packages/cli/dist/index.js install-commands` restored the new text before the run recorded above.

- [x] **Task 17C: Commit** — `docs: record slice 260 live onboarding runs`
